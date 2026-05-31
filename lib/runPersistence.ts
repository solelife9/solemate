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

/** Remove one run from the queue by localId (after a confirmed sync). */
export async function removePendingRun(localId: string): Promise<PendingRun[]> {
  const queue = await loadPendingRuns();
  const next = queue.filter(r => r.localId !== String(localId));
  await writePendingRuns(next);
  return next;
}

// ── client-side idempotency (duplicate-run guard) ───────────────
/**
 * A signature that identifies the same finished run across the local queue and
 * the server's run list, independent of server id. The backend is external and
 * cannot dedupe, so the client matches a queued run against runs it already
 * fetched: first by an echoed client id (the `localId` we POST as a forward-
 * compatible idempotency key), then by the natural signature run_date + shoe_id
 * + distance. A km tolerance of <0.005 absorbs float round-trip noise.
 */
export function serverHasRun(pending: PendingRun, serverRuns: any[]): boolean {
  if (!Array.isArray(serverRuns)) return false;
  return serverRuns.some(r => {
    if (!r || typeof r !== 'object') return false;
    // echoed client idempotency key (server stores/returns what we sent)
    const echoed = r.localId ?? r.client_id ?? r.local_id;
    if (echoed != null && String(echoed) === pending.localId) return true;
    // natural signature: same shoe, same date, same distance
    if (String(r.shoe_id) !== pending.shoe_id) return false;
    if (String(r.run_date) !== pending.run_date) return false;
    const km = typeof r.km === 'number' ? r.km : parseFloat(String(r.km));
    return Number.isFinite(km) && Math.abs(km - pending.km) < 0.005;
  });
}

/**
 * Before re-POSTing the queue, drop any pending run the server already has
 * (matched by `serverHasRun`). This closes the duplicate-row window: if a prior
 * session POSTed a run successfully but was killed before `removePendingRun`
 * could persist, the run is still queued — re-POSTing it would create a second
 * row (inflated total km / shoe wear). Reconciling against the freshly fetched
 * server runs dequeues it WITHOUT a second POST. Returns the runs that still
 * genuinely need syncing.
 */
export async function reconcilePendingWithServer(
  serverRuns: any[],
): Promise<PendingRun[]> {
  const queue = await loadPendingRuns();
  if (queue.length === 0) return [];
  const stillPending = queue.filter(p => !serverHasRun(p, serverRuns));
  if (stillPending.length !== queue.length) {
    await writePendingRuns(stillPending); // persist the dequeue
  }
  return stillPending;
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
