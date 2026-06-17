// ─── Run persistence — crash-safe in-progress snapshot + unsynced run queue ──
// audit#2/#3. Two independent durability layers, both backed by AsyncStorage and
// kept STRICTLY separate from the network try/catch so a failed POST can never
// lose a route/run (iron law: 데이터 음수/유실 금지):
//
//   1) Active-run snapshot — the live run state (dist, elapsed, pts, pausedMs,
//      t0, shoe, goal) is sanitized and written every few seconds while running.
//      On app start `loadSnapshot()` surfaces an unfinished run so the UI can
//      offer recover/save instead of silently dropping it.
//   2) Pending-sync queue — a finished run is enqueued LOCALLY first, then the
//      server POST is attempted by an injected sync function. A POST failure
//      leaves the run queued for `flushPendingRuns()` to retry; it is never lost.
//
// Every value that reaches storage is clamped non-negative and NaN-stripped, so
// a corrupted/partial write can never reintroduce negative distance or time.

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── storage keys ─────────────────────────────────────────────────
export const SNAPSHOT_KEY = 'active_run_snapshot';
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
  cadence: number; // last spm reading (>= 0)
  location: string; // reverse-geocoded label, '' until resolved
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
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const shoe =
    r.shoe && typeof r.shoe === 'object' ? (r.shoe as Record<string, unknown>) : null;
  if (!shoe || shoe.id == null) return null;
  return {
    dist: nonNeg(r.dist),
    elapsed: Math.floor(nonNeg(r.elapsed)),
    pts: sanitizePoints(r.pts),
    pausedMs: nonNeg(r.pausedMs),
    t0: nonNeg(r.t0),
    shoe: {id: String(shoe.id), name: String(shoe.name ?? '')},
    goalKm: nonNeg(r.goalKm),
    cadence: Math.floor(nonNeg(r.cadence)),
    location: typeof r.location === 'string' ? r.location : '',
    savedAt: nonNeg(r.savedAt),
  };
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
export async function saveSnapshot(snap: RunSnapshot): Promise<void> {
  const clean = sanitizeSnapshot(snap);
  if (!clean) return; // nothing identifiable to persist
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(clean));
}

/** Read the persisted run snapshot, or null if none / unparseable. */
export async function loadSnapshot(): Promise<RunSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return sanitizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Drop the snapshot — call when a run is saved or discarded. */
export async function clearSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(SNAPSHOT_KEY);
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
