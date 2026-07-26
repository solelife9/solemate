// ─── Run persistence — crash-safe in-progress snapshot + unsynced run queue ──
// audit#2/#3. Two independent durability layers, both backed by AsyncStorage and
// kept STRICTLY separate from the network try/catch so a failed POST can never
// lose a route/run (iron law: 데이터 음수/유실 금지):
//
//   1) Active-run snapshot — the live run state (dist, elapsed, pts, pausedMs,
//      t0, shoe, goal) is sanitized and written every few seconds while running.
//      On app start `loadSnapshot()` surfaces an unfinished run so the UI can
//      offer recover/save instead of silently dropping it.
//   2) Pending-sync queue — **레거시(2026-07-26 확인).** REST 백엔드 시절의 오프라인
//      큐다. Firestore 단일 백엔드로 이관되면서(2026-07-17 Render 은퇴) 넣는 쪽
//      (enqueuePendingRun)의 프로덕션 호출부가 사라졌고, 지금 오프라인 내구성은
//      **부팅 캐시(로컬 정본) + Firestore 오프라인 영속(네이티브 기본 ON)** 이 담당한다.
//      App 은 여전히 loadPendingRuns/overlayPendingRuns/removePendingRun 을 부르는데,
//      이는 **구 버전에서 업그레이드한 기기의 큐를 비워 주기 위한 이관 경로**다(새 설치는
//      항상 빈 큐). 큐를 채우는 API 는 남겨 두되 신규 사용 금지 — 아래 @deprecated 참조.
//
// Every value that reaches storage is clamped non-negative and NaN-stripped, so
// a corrupted/partial write can never reintroduce negative distance or time.

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── storage keys ─────────────────────────────────────────────────
export const SNAPSHOT_KEY = 'active_run_snapshot';
// 경로 전용 키(2026-07-26 성능) — 스냅샷에서 pts 를 분리했다. 스칼라 상태(거리·경과·
// 일시정지·목표)는 작고 자주 바뀌어 3초마다 써야 하지만, 경로는 러닝이 길어질수록
// 무한히 커지는 유일한 필드다. 한 키에 같이 두면 스칼라를 쓸 때마다 경로 전체를 다시
// 직렬화·기록해야 했다(런 길이에 비례하는 비용이 초당 1회 이상 발생).
export const ROUTE_KEY = 'active_run_route';
export const PENDING_RUNS_KEY = 'pending_runs';

// ── shapes ───────────────────────────────────────────────────────
export interface RoutePoint {
  lat: number;
  lon: number;
}

/** The live run state persisted mid-run. Mirrors the refs RunActiveScreen owns. */
export interface RunSnapshot {
  dist: number; // km accumulated so far (>= 0)
  elapsed: number; // seconds elapsed, pause-adjusted (>= 0)
  pts: RoutePoint[]; // route fixes accepted so far
  pausedMs: number; // accumulated paused wall-time in ms (>= 0)
  t0: number; // epoch ms the run began
  shoe: {id: string; name: string};
  goalKm: number; // target distance (>= 0)
  /** 시간 목표(분, >=0). 0=시간 목표 아님. 복구 시 링/음성/달성 판정을 시간 기준으로
   *  잇는다(2026-07-12 #15 — 이전엔 하드코딩 0 으로 유실돼 자유런으로 둔갑했다). */
  goalMin: number;
  /** 스피드 모드 km별 목표 페이스(초/km) 플랜. []=비스피드. 복구 시 코칭을 잇는다. */
  pacePlan: number[];
  cadence: number; // last spm reading (>= 0)
  location: string; // reverse-geocoded label, '' until resolved
  // 트랙 모드 랩 상태(비트랙이면 null/부재). lapM=확정 한바퀴(m), lapTimes=랩 완료 경과초,
  // locked=보정 확정. 복구 시 이게 있으면 트랙 런으로 이어받는다(거리=랩수×lapM).
  track?: {lapM: number; lapTimes: number[]; locked: boolean} | null;
  savedAt: number; // epoch ms this snapshot was written
}

/** A finished run awaiting (or retrying) its server POST. */
export interface PendingRun {
  localId: string; // stable client id used to dedupe + reconcile
  shoe_id: string;
  km: number; // >= 0
  run_date: string;
  memo: string;
  source: string;
  duration: number; // seconds, >= 0
  cadence: number; // >= 0
  route: string; // JSON-encoded RoutePoint[] or ''
  location: string;
  heart_rate: number; // >= 0
  run_time: string; // 'HH:MM' captured at save time
  queuedAt: number; // epoch ms first enqueued
  // audit a1: 레코드 갱신 시각(epoch ms). 클라우드 머지(cloudSync.recordUpdatedAt)의
  // '최신 우선'이 읽는다. 선택필드 — 이전 빌드에서 큐에 남은 런엔 없을 수 있다(하위호환).
  updatedAt?: number;
}

// ── pure helpers (no I/O) — exported for direct unit testing ─────
/** Clamp to a finite, non-negative number (iron law). NaN/Infinity/neg → 0. */
export function nonNeg(n: unknown): number {
  const v = typeof n === 'number' ? n : parseFloat(String(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Keep only well-formed {lat,lon} fixes; drop anything non-finite. */
export function sanitizePoints(pts: unknown): RoutePoint[] {
  if (!Array.isArray(pts)) return [];
  const out: RoutePoint[] = [];
  for (const raw of pts) {
    const p = raw as {lat?: unknown; lon?: unknown} | null | undefined;
    const lat = p && typeof p.lat === 'number' ? p.lat : parseFloat(String(p?.lat));
    const lon = p && typeof p.lon === 'number' ? p.lon : parseFloat(String(p?.lon));
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push({lat, lon});
  }
  return out;
}

/**
 * Coerce arbitrary input into a valid RunSnapshot, or null if it carries no
 * identifiable run. Never throws — a corrupt persisted blob degrades to null so
 * startup recovery can simply skip it.
 */
export function sanitizeSnapshot(raw: unknown): RunSnapshot | null {
  const state = sanitizeRunState(raw);
  if (!state) return null;
  return {...state, pts: sanitizePoints((raw as Record<string, unknown>).pts)};
}

/**
 * 스냅샷의 '경로를 뺀' 부분만 살균한다(2026-07-26 성능 분리).
 * 경로는 러닝 길이에 비례해 커지는 유일한 필드라, 3초마다 쓰는 스칼라 상태 경로에서는
 * 아예 건드리지 않는다 — sanitizePoints 가 전체를 순회·복제하던 비용이 사라진다.
 */
export function sanitizeRunState(raw: unknown): Omit<RunSnapshot, 'pts'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const shoe =
    r.shoe && typeof r.shoe === 'object' ? (r.shoe as Record<string, unknown>) : null;
  if (!shoe || shoe.id == null) return null;
  return {
    dist: nonNeg(r.dist),
    elapsed: Math.floor(nonNeg(r.elapsed)),
    pausedMs: nonNeg(r.pausedMs),
    t0: nonNeg(r.t0),
    shoe: {id: String(shoe.id), name: String(shoe.name ?? '')},
    goalKm: nonNeg(r.goalKm),
    goalMin: Math.floor(nonNeg(r.goalMin)),
    pacePlan: Array.isArray(r.pacePlan)
      ? r.pacePlan
          .map(v => (typeof v === 'number' ? v : parseFloat(String(v))))
          .filter(v => Number.isFinite(v) && v > 0)
          .slice(0, 100)
      : [],
    cadence: Math.floor(nonNeg(r.cadence)),
    location: typeof r.location === 'string' ? r.location : '',
    track: sanitizeTrackMeta(r.track),
    savedAt: nonNeg(r.savedAt),
  };
}

/** 트랙 랩 메타 복원 — lapM>0 이고 lapTimes 가 유한 숫자 배열일 때만(아니면 null=비트랙). */
export function sanitizeTrackMeta(raw: unknown): {lapM: number; lapTimes: number[]; locked: boolean} | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const lapM = nonNeg(t.lapM);
  if (!(lapM > 0)) return null;
  const lapTimes = Array.isArray(t.lapTimes)
    ? t.lapTimes.map(v => (typeof v === 'number' ? v : parseFloat(String(v)))).filter(v => Number.isFinite(v) && v >= 0)
    : [];
  return {lapM, lapTimes, locked: !!t.locked};
}

/** A snapshot is worth recovering only once the run logged real progress. */
export function isResumable(snap: RunSnapshot | null): boolean {
  return !!snap && (snap.dist > 0 || snap.elapsed > 0 || snap.pts.length > 0);
}

/** Coerce arbitrary input into a valid PendingRun, or null if unusable. */
export function sanitizePendingRun(raw: unknown): PendingRun | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.shoe_id == null || !r.localId) return null;
  return {
    localId: String(r.localId),
    shoe_id: String(r.shoe_id),
    km: nonNeg(r.km),
    run_date: String(r.run_date ?? ''),
    memo: typeof r.memo === 'string' ? r.memo : '',
    source: typeof r.source === 'string' ? r.source : 'gps',
    duration: Math.floor(nonNeg(r.duration)),
    cadence: Math.floor(nonNeg(r.cadence)),
    route: typeof r.route === 'string' ? r.route : '',
    location: typeof r.location === 'string' ? r.location : '',
    heart_rate: Math.floor(nonNeg(r.heart_rate)),
    run_time: typeof r.run_time === 'string' ? r.run_time : '',
    queuedAt: nonNeg(r.queuedAt),
    // updatedAt 은 선택 — 유한·양수일 때만 보존한다(부재/비정상은 키를 만들지 않아 머지에서
    // -Infinity(=동률, local 우선)로 떨어진다. 0 같은 가짜 타임스탬프를 심지 않는다).
    ...(typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) && r.updatedAt > 0
      ? { updatedAt: r.updatedAt }
      : {}),
  };
}

// ── active-run snapshot I/O (storage only — NEVER inside a network try) ──
/** Persist the live run state. Sanitizes first so storage is always clean. */
export async function saveSnapshot(
  snap: RunSnapshot,
  opts?: {route?: boolean},
): Promise<void> {
  const state = sanitizeRunState(snap);
  if (!state) return; // nothing identifiable to persist
  // 경로는 기본 포함(기존 호출자·테스트 호환). route:false 면 스칼라만 갱신한다 —
  // 러닝 엔진이 경로를 더 긴 주기로 쓰기 위해 쓰는 경로다.
  const writeRoute = opts?.route !== false;
  const entries: Record<string, string> = {[SNAPSHOT_KEY]: JSON.stringify(state)};
  if (writeRoute) entries[ROUTE_KEY] = JSON.stringify(sanitizePoints(snap.pts));
  // setMany — 두 키를 한 번의 브리지 왕복으로(스칼라만 쓸 땐 어차피 1건).
  await AsyncStorage.setMany(entries);
}

/**
 * Read the persisted run snapshot, or null if none / unparseable.
 * 경로는 별도 키(ROUTE_KEY)에서 합류시킨다. 그 키가 없으면 **구 빌드가 스냅샷 안에
 * 심어둔 pts** 를 그대로 쓴다 — 러닝 도중 앱을 업데이트한 사용자의 경로가 유실되지
 * 않게 하는 하위호환 경로다(스칼라만 있고 경로가 없어도 거리·시간은 온전하다).
 */
export async function loadSnapshot(): Promise<RunSnapshot | null> {
  try {
    const got = await AsyncStorage.getMany([SNAPSHOT_KEY, ROUTE_KEY]);
    const rawState = got[SNAPSHOT_KEY];
    const rawRoute = got[ROUTE_KEY];
    if (!rawState) return null;
    const parsed = JSON.parse(rawState) as Record<string, unknown>;
    if (rawRoute) {
      // 경로 키가 정본. 파싱 실패는 조용히 무시하고 스냅샷 내장 pts(구 빌드) 로 폴백한다.
      try {
        parsed.pts = JSON.parse(rawRoute);
      } catch {
        /* 손상된 경로 blob — 스냅샷의 pts(있으면)로 폴백 */
      }
    }
    return sanitizeSnapshot(parsed);
  } catch {
    return null;
  }
}

/** Drop the snapshot — call when a run is saved or discarded. 경로 키도 함께 지운다. */
export async function clearSnapshot(): Promise<void> {
  await AsyncStorage.removeMany([SNAPSHOT_KEY, ROUTE_KEY]);
}

/**
 * A pending(미동기) run projected into the run-row shape the UI/aggregation reads:
 * id=localId 으로 두고 `_pending:true` 마커를 단다(낙관적 삽입과 같은 모양). 캐시에
 * 든 신발/런과 같은 필드를 가져 '이번 주 거리' 등 집계에 그대로 합산된다.
 */
export interface PendingRunOverlay {
  id: string;
  shoe_id: string;
  km: number;
  run_date: string;
  duration: number;
  cadence: number;
  memo: string;
  route: string;
  location: string;
  heart_rate: number;
  run_time: string;
  updatedAt?: number;
  _pending: true;
}

/**
 * 오프라인 부팅 오버레이(순수): 부팅 폴백 캐시의 런 위에 아직 서버로 못 간 pending 런을
 * 얹는다. 캐시는 마지막 fetch/디바운스 스냅샷이라 그 뒤 오프라인에서 추가됐지만 아직
 * 서버로 못 간 런이 빠져 있을 수 있으므로, 큐의 런을 합쳐 화면에 보이게 한다(가시성).
 *   · dedup  — 이미 캐시에 든 런(localId === 캐시 run.id)은 건너뛰어 중복을 막는다.
 *   · 표시   — 새로 얹는 런은 `_pending:true` 로 표시(낙관적 삽입과 같은 모양).
 *   · 순서   — pending 오버레이를 앞(prepend)에, 그다음 캐시 런(원래 순서 보존).
 * 비파괴: 입력 배열을 변형하지 않고 새 배열을 돌려준다(데이터 파괴 금지).
 */
export function overlayPendingRuns<T extends {id?: unknown}>(
  cachedRuns: readonly T[],
  pending: readonly PendingRun[],
): Array<T | PendingRunOverlay> {
  const cachedIds = new Set(cachedRuns.map(r => String((r as {id?: unknown}).id)));
  const overlay: PendingRunOverlay[] = pending
    .filter(p => !cachedIds.has(String(p.localId)))
    .map(p => ({
      id: p.localId,
      shoe_id: p.shoe_id,
      km: p.km,
      run_date: p.run_date,
      duration: p.duration,
      cadence: p.cadence,
      memo: p.memo,
      route: p.route,
      location: p.location,
      heart_rate: p.heart_rate,
      run_time: p.run_time,
      updatedAt: p.updatedAt,
      _pending: true,
    }));
  return [...overlay, ...cachedRuns];
}

// ── pending-sync queue I/O (storage only — network is injected) ──
/** Read the pending-run queue, dropping any corrupt entries. */
export async function loadPendingRuns(): Promise<PendingRun[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_RUNS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(sanitizePendingRun).filter((r): r is PendingRun => r !== null);
  } catch {
    return [];
  }
}

/** Overwrite the queue with a sanitized list. */
async function writePendingRuns(queue: PendingRun[]): Promise<void> {
  const clean = queue.map(sanitizePendingRun).filter((r): r is PendingRun => r !== null);
  await AsyncStorage.setItem(PENDING_RUNS_KEY, JSON.stringify(clean));
}

/**
 * Local-first enqueue of a finished run. Idempotent on localId so a retry can
 * never double-store the same run. Returns the new queue. This is a pure
 * storage write — call it BEFORE attempting the network POST so a crash or a
 * dropped connection between the two can never lose the run.
 */
/** @deprecated 레거시 REST 오프라인 큐. 신규 코드는 쓰지 않는다(파일 헤더 참조).
 *  남겨 둔 이유: 구 버전에서 넘어온 기기의 큐를 테스트로 계속 검증하기 위해서다. */
export async function enqueuePendingRun(run: PendingRun): Promise<PendingRun[]> {
  const clean = sanitizePendingRun(run);
  if (!clean) return loadPendingRuns();
  const queue = await loadPendingRuns();
  const next = queue.filter(r => r.localId !== clean.localId);
  next.push(clean);
  await writePendingRuns(next);
  return next;
}

/**
 * Patch a still-queued (unsynced) run in place by localId — used when the user
 * edits a run that has not yet reached the server, so the eventual POST carries
 * the edited values. `patch` uses the same field names as PendingRun (shoe_id,
 * km, run_date, duration, ...). Sanitized before write (iron law: non-negative,
 * NaN-stripped). No-op if no queued run matches. Returns the new queue.
 */
/** @deprecated 레거시 REST 오프라인 큐 수정. 프로덕션 호출부 없음(파일 헤더 참조). */
export async function updatePendingRun(
  localId: string,
  patch: Partial<PendingRun>,
): Promise<PendingRun[]> {
  const queue = await loadPendingRuns();
  const id = String(localId);
  const next = queue
    .map(r => (r.localId === id ? sanitizePendingRun({...r, ...patch, localId: id}) : r))
    .filter((r): r is PendingRun => r !== null);
  await writePendingRuns(next);
  return next;
}

/** Remove one run from the queue by localId (after a confirmed sync). */
export async function removePendingRun(localId: string): Promise<PendingRun[]> {
  const queue = await loadPendingRuns();
  const next = queue.filter(r => r.localId !== String(localId));
  await writePendingRuns(next);
  return next;
}

// ── client-side idempotency (duplicate-run guard) ───────────────
/**
 * Does this server row carry back the echoed client idempotency key (`localId`)
 * we POSTed? An echoed id is DEFINITIVE proof the server stored exactly this run.
 */
function echoesLocalId(serverRun: unknown, localId: string): boolean {
  const r = serverRun as Record<string, unknown>;
  const echoed = r.localId ?? r.client_id ?? r.local_id;
  return echoed != null && String(echoed) === localId;
}

/**
 * Natural-signature match: same shoe, same date, distance within float-roundtrip
 * noise (<0.005km). This is only a HEURISTIC — two genuinely distinct runs can
 * share (shoe, date, km) by coincidence — so callers must not treat it as proof.
 */
function signatureMatches(serverRun: unknown, pending: PendingRun): boolean {
  const r = serverRun as Record<string, unknown>;
  if (String(r.shoe_id) !== pending.shoe_id) return false;
  if (String(r.run_date) !== pending.run_date) return false;
  const km = typeof r.km === 'number' ? r.km : parseFloat(String(r.km));
  return Number.isFinite(km) && Math.abs(km - pending.km) < 0.005;
}

/**
 * Does the server already represent this queued run, by echoed localId OR by
 * natural signature? A non-consuming detection helper (kept for callers that
 * just need a yes/no); the dequeue path uses `matchServerRun` for 1:1 matching.
 */
export function serverHasRun(pending: PendingRun, serverRuns: unknown[]): boolean {
  if (!Array.isArray(serverRuns)) return false;
  return serverRuns.some(
    r =>
      r &&
      typeof r === 'object' &&
      (echoesLocalId(r, pending.localId) || signatureMatches(r, pending)),
  );
}

/**
 * Find the server row that represents `pending`, honouring 1:1 consumption: a
 * row already claimed (its index in `consumed`) cannot match a second queued run,
 * so a single server row can never account for more than one pending run. An
 * echoed localId is preferred and reported as `'echo'` (definitive); a natural
 * signature falls back to `'signature'` (heuristic only). Returns null when the
 * server has no row for this run.
 */
export function matchServerRun(
  pending: PendingRun,
  serverRuns: unknown[],
  consumed?: Set<number>,
): {index: number; kind: 'echo' | 'signature'} | null {
  if (!Array.isArray(serverRuns)) return null;
  let sigIndex = -1;
  for (let i = 0; i < serverRuns.length; i++) {
    if (consumed && consumed.has(i)) continue;
    const r = serverRuns[i];
    if (!r || typeof r !== 'object') continue;
    if (echoesLocalId(r, pending.localId)) return {index: i, kind: 'echo'};
    if (sigIndex === -1 && signatureMatches(r, pending)) sigIndex = i;
  }
  return sigIndex === -1 ? null : {index: sigIndex, kind: 'signature'};
}

/**
 * Reconcile the pending queue against the runs we just fetched. Returns the runs
 * that still need a POST (`stillPending`) and the ones dropped as already-synced
 * (`dropped`).
 *
 * The drop is INTENTIONALLY conservative — iron law: 유실 회피 > 중복 회피. A run
 * is dequeued WITHOUT re-POSTing ONLY when a server row echoes its localId, i.e.
 * the server confirms it stored exactly this run. A signature-only match is NOT
 * enough: two distinct runs can coincidentally share (shoe, date, km), and
 * dropping an unsynced one would lose it irrecoverably, whereas a duplicate row
 * is visible and correctable. So signature-only (and unmatched) runs stay queued
 * to be re-POSTed. The residual duplicate window is already minimised by
 * persisting `removePendingRun` first on a successful sync. Matching is 1:1 so a
 * single server row can never drop more than one queued run.
 */
export async function reconcilePendingWithServer(serverRuns: unknown[]): Promise<{
  stillPending: PendingRun[];
  dropped: PendingRun[];
}> {
  const queue = await loadPendingRuns();
  if (queue.length === 0) return {stillPending: [], dropped: []};
  const consumed = new Set<number>();
  const stillPending: PendingRun[] = [];
  const dropped: PendingRun[] = [];
  for (const p of queue) {
    const m = matchServerRun(p, serverRuns, consumed);
    if (m && m.kind === 'echo') {
      consumed.add(m.index); // 1:1 — this row can't dequeue another run
      dropped.push(p);
    } else {
      // unmatched OR signature-only → re-POST, never drop (no data loss).
      stillPending.push(p);
    }
  }
  if (dropped.length > 0) await writePendingRuns(stillPending); // persist dequeue
  return {stillPending, dropped};
}

/**
 * Retry every queued run through an injected `syncFn` (the network lives in the
 * caller — this keeps storage and network strictly separate). A run is removed
 * from the queue only after its syncFn resolves; a rejection leaves it queued
 * for the next flush. Returns how many synced and how many remain.
 */
/** @deprecated 레거시 REST 오프라인 큐 전송. 프로덕션 호출부 없음(파일 헤더 참조). */
export async function flushPendingRuns(
  syncFn: (run: PendingRun) => Promise<unknown>,
): Promise<{synced: number; remaining: number}> {
  const queue = await loadPendingRuns();
  if (queue.length === 0) return {synced: 0, remaining: 0};
  const stillPending: PendingRun[] = [];
  let synced = 0;
  for (const run of queue) {
    try {
      await syncFn(run);
      synced++;
    } catch {
      stillPending.push(run); // keep for next retry — never dropped
    }
  }
  await writePendingRuns(stillPending);
  return {synced, remaining: stillPending.length};
}
