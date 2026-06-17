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
export function nonNeg(n: any): number {
  const v = typeof n === 'number' ? n : parseFloat(String(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Keep only well-formed {lat,lon} fixes; drop anything non-finite. */
export function sanitizePoints(pts: any): RoutePoint[] {
  if (!Array.isArray(pts)) return [];
  const out: RoutePoint[] = [];
  for (const p of pts) {
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
export function sanitizeSnapshot(raw: any): RunSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const shoe = raw.shoe && typeof raw.shoe === 'object' ? raw.shoe : null;
  if (!shoe || shoe.id == null) return null;
  return {
    dist: nonNeg(raw.dist),
    elapsed: Math.floor(nonNeg(raw.elapsed)),
    pts: sanitizePoints(raw.pts),
    pausedMs: nonNeg(raw.pausedMs),
    t0: nonNeg(raw.t0),
    shoe: {id: String(shoe.id), name: String(shoe.name ?? '')},
    goalKm: nonNeg(raw.goalKm),
    cadence: Math.floor(nonNeg(raw.cadence)),
    location: typeof raw.location === 'string' ? raw.location : '',
    savedAt: nonNeg(raw.savedAt),
  };
}

/** A snapshot is worth recovering only once the run logged real progress. */
export function isResumable(snap: RunSnapshot | null): boolean {
  return !!snap && (snap.dist > 0 || snap.elapsed > 0 || snap.pts.length > 0);
}

/** Coerce arbitrary input into a valid PendingRun, or null if unusable. */
export function sanitizePendingRun(raw: any): PendingRun | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.shoe_id == null || !raw.localId) return null;
  return {
    localId: String(raw.localId),
    shoe_id: String(raw.shoe_id),
    km: nonNeg(raw.km),
    run_date: String(raw.run_date ?? ''),
    memo: typeof raw.memo === 'string' ? raw.memo : '',
    source: typeof raw.source === 'string' ? raw.source : 'gps',
    duration: Math.floor(nonNeg(raw.duration)),
    cadence: Math.floor(nonNeg(raw.cadence)),
    route: typeof raw.route === 'string' ? raw.route : '',
    location: typeof raw.location === 'string' ? raw.location : '',
    heart_rate: Math.floor(nonNeg(raw.heart_rate)),
    run_time: typeof raw.run_time === 'string' ? raw.run_time : '',
    queuedAt: nonNeg(raw.queuedAt),
    // updatedAt 은 선택 — 유한·양수일 때만 보존한다(부재/비정상은 키를 만들지 않아 머지에서
    // -Infinity(=동률, local 우선)로 떨어진다. 0 같은 가짜 타임스탬프를 심지 않는다).
    ...(typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) && raw.updatedAt > 0
      ? { updatedAt: raw.updatedAt }
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
function echoesLocalId(serverRun: any, localId: string): boolean {
  const echoed = serverRun.localId ?? serverRun.client_id ?? serverRun.local_id;
  return echoed != null && String(echoed) === localId;
}

/**
 * Natural-signature match: same shoe, same date, distance within float-roundtrip
 * noise (<0.005km). This is only a HEURISTIC — two genuinely distinct runs can
 * share (shoe, date, km) by coincidence — so callers must not treat it as proof.
 */
function signatureMatches(serverRun: any, pending: PendingRun): boolean {
  if (String(serverRun.shoe_id) !== pending.shoe_id) return false;
  if (String(serverRun.run_date) !== pending.run_date) return false;
  const km = typeof serverRun.km === 'number' ? serverRun.km : parseFloat(String(serverRun.km));
  return Number.isFinite(km) && Math.abs(km - pending.km) < 0.005;
}

/**
 * Does the server already represent this queued run, by echoed localId OR by
 * natural signature? A non-consuming detection helper (kept for callers that
 * just need a yes/no); the dequeue path uses `matchServerRun` for 1:1 matching.
 */
export function serverHasRun(pending: PendingRun, serverRuns: any[]): boolean {
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
  serverRuns: any[],
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
export async function reconcilePendingWithServer(serverRuns: any[]): Promise<{
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
