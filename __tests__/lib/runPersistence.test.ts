/**
 * runPersistence — crash-safe snapshot + unsynced run queue (audit#2/#3).
 *
 * Drives the real module against the official in-memory AsyncStorage mock and
 * asserts OBSERVABLE storage outcomes: that a snapshot blob actually lands in
 * AsyncStorage and round-trips back, that a finished run is durably queued
 * BEFORE any network call, that a sync removes it, and that a sync failure
 * leaves it queued for retry — never dropped. Also pins the iron law: no value
 * that reaches storage is ever negative, and corrupt blobs degrade to null/[]
 * instead of throwing.
 *
 * @format
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SNAPSHOT_KEY,
  PENDING_RUNS_KEY,
  RunSnapshot,
  PendingRun,
  saveSnapshot,
  loadSnapshot,
  clearSnapshot,
  isResumable,
  sanitizeSnapshot,
  nonNeg,
  sanitizePoints,
  enqueuePendingRun,
  loadPendingRuns,
  removePendingRun,
  flushPendingRuns,
  serverHasRun,
  matchServerRun,
  reconcilePendingWithServer,
} from '../../lib/runPersistence';

// The official mock's clearAllMockStorages() only drops the registry pointer,
// not the already-imported default store instance — so clear the live store
// directly to keep each test isolated.
beforeEach(async () => {
  await AsyncStorage.clear();
});

const SNAP: RunSnapshot = {
  dist: 2.34,
  elapsed: 745,
  pts: [
    {lat: 37.5, lon: 127.0},
    {lat: 37.51, lon: 127.01},
  ],
  pausedMs: 12000,
  t0: 1_700_000_000_000,
  shoe: {id: 'shoe-1', name: 'Nike Pegasus'},
  goalKm: 5,
  cadence: 172,
  location: '서울',
  savedAt: 1_700_000_745_000,
};

const PENDING: PendingRun = {
  localId: 'run_abc',
  shoe_id: 'shoe-1',
  km: 5.02,
  run_date: '2026-06-01',
  memo: '저녁 러닝',
  source: 'gps',
  duration: 1500,
  cadence: 172,
  route: '[{"lat":37.5,"lon":127.0}]',
  location: '서울',
  heart_rate: 0,
  run_time: '19:30',
  queuedAt: 1_700_000_000_000,
};

// ── pure sanitizers (iron law) ───────────────────────────────────
describe('iron law — no negative / NaN reaches storage', () => {
  test('nonNeg clamps negatives, NaN and Infinity to 0; keeps positives', () => {
    expect(nonNeg(-5)).toBe(0);
    expect(nonNeg(NaN)).toBe(0);
    expect(nonNeg(Infinity)).toBe(0);
    expect(nonNeg('3.5')).toBe(3.5);
    expect(nonNeg(2)).toBe(2);
  });

  test('sanitizePoints drops fixes with non-finite lat/lon', () => {
    const pts = sanitizePoints([
      {lat: 1, lon: 2},
      {lat: 'x', lon: 2},
      {lat: NaN, lon: 5},
      {lon: 9},
      {lat: 3, lon: 4},
    ]);
    expect(pts).toEqual([
      {lat: 1, lon: 2},
      {lat: 3, lon: 4},
    ]);
  });

  test('sanitizeSnapshot floors negative dist/elapsed to non-negative values', () => {
    const dirty = sanitizeSnapshot({...SNAP, dist: -10, elapsed: -3, pausedMs: -1});
    expect(dirty).not.toBeNull();
    expect(dirty!.dist).toBe(0);
    expect(dirty!.elapsed).toBe(0);
    expect(dirty!.pausedMs).toBe(0);
  });

  test('sanitizeSnapshot returns null when no shoe identity is present', () => {
    expect(sanitizeSnapshot({dist: 5})).toBeNull();
    expect(sanitizeSnapshot(null)).toBeNull();
  });
});

// ── active-run snapshot I/O ──────────────────────────────────────
describe('active-run snapshot persistence', () => {
  test('saveSnapshot writes a JSON blob to AsyncStorage under SNAPSHOT_KEY', async () => {
    await saveSnapshot(SNAP);

    // Assert the snapshot is OBSERVABLY in storage (not just that no error threw).
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.dist).toBe(2.34);
    expect(parsed.shoe.id).toBe('shoe-1');
    expect(parsed.pts).toHaveLength(2);
  });

  test('loadSnapshot round-trips what saveSnapshot wrote', async () => {
    await saveSnapshot(SNAP);
    const loaded = await loadSnapshot();
    expect(loaded).toEqual(SNAP);
  });

  test('clearSnapshot removes the persisted snapshot', async () => {
    await saveSnapshot(SNAP);
    await clearSnapshot();
    expect(await AsyncStorage.getItem(SNAPSHOT_KEY)).toBeNull();
    expect(await loadSnapshot()).toBeNull();
  });

  test('loadSnapshot returns null for a corrupt blob instead of throwing', async () => {
    await AsyncStorage.setItem(SNAPSHOT_KEY, '{not json');
    await expect(loadSnapshot()).resolves.toBeNull();
  });

  test('isResumable is true only once a run logged real progress', () => {
    expect(isResumable(null)).toBe(false);
    expect(isResumable({...SNAP, dist: 0, elapsed: 0, pts: []})).toBe(false);
    expect(isResumable({...SNAP, dist: 0, elapsed: 5, pts: []})).toBe(true);
    expect(isResumable(SNAP)).toBe(true);
  });
});

// ── pending-sync queue I/O ───────────────────────────────────────
describe('unsynced run queue', () => {
  test('enqueuePendingRun durably stores the run under PENDING_RUNS_KEY', async () => {
    await enqueuePendingRun(PENDING);

    const raw = await AsyncStorage.getItem(PENDING_RUNS_KEY);
    expect(raw).not.toBeNull();
    const queue = JSON.parse(raw as string);
    expect(queue).toHaveLength(1);
    expect(queue[0].localId).toBe('run_abc');
    expect(queue[0].km).toBe(5.02);
  });

  test('enqueue is idempotent on localId — a retry never double-stores', async () => {
    await enqueuePendingRun(PENDING);
    await enqueuePendingRun({...PENDING, km: 5.02, memo: '재시도'});
    const queue = await loadPendingRuns();
    expect(queue).toHaveLength(1);
    expect(queue[0].memo).toBe('재시도'); // last write wins, still one entry
  });

  test('two distinct runs both persist', async () => {
    await enqueuePendingRun(PENDING);
    await enqueuePendingRun({...PENDING, localId: 'run_xyz', km: 3.1});
    const queue = await loadPendingRuns();
    expect(queue.map(r => r.localId).sort()).toEqual(['run_abc', 'run_xyz']);
  });

  test('removePendingRun deletes only the matching run', async () => {
    await enqueuePendingRun(PENDING);
    await enqueuePendingRun({...PENDING, localId: 'run_xyz'});
    await removePendingRun('run_abc');
    const queue = await loadPendingRuns();
    expect(queue.map(r => r.localId)).toEqual(['run_xyz']);
  });

  test('loadPendingRuns clamps a negative km from a tampered blob to 0', async () => {
    await AsyncStorage.setItem(
      PENDING_RUNS_KEY,
      JSON.stringify([{...PENDING, km: -42}]),
    );
    const queue = await loadPendingRuns();
    expect(queue[0].km).toBe(0); // never surfaces negative distance
  });
});

// ── flush / re-sync ──────────────────────────────────────────────
describe('flushPendingRuns — re-sync without data loss', () => {
  test('a successful sync removes the run from the queue', async () => {
    await enqueuePendingRun(PENDING);
    const sync = jest.fn(async () => ({id: 'server-1'}));

    const result = await flushPendingRuns(sync);

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(expect.objectContaining({localId: 'run_abc'}));
    expect(result).toEqual({synced: 1, remaining: 0});
    expect(await loadPendingRuns()).toEqual([]);
  });

  test('a failed sync KEEPS the run queued for the next retry (iron law)', async () => {
    await enqueuePendingRun(PENDING);
    const sync = jest.fn(async () => {
      throw new Error('network down');
    });

    const result = await flushPendingRuns(sync);

    expect(result).toEqual({synced: 0, remaining: 1});
    const queue = await loadPendingRuns();
    expect(queue).toHaveLength(1);
    expect(queue[0].localId).toBe('run_abc'); // not lost — still recoverable
  });

  test('a partial failure syncs the good one and retains only the failed one', async () => {
    await enqueuePendingRun(PENDING);
    await enqueuePendingRun({...PENDING, localId: 'run_fail'});
    const sync = jest.fn(async (run: PendingRun) => {
      if (run.localId === 'run_fail') throw new Error('boom');
      return {id: 'server-1'};
    });

    const result = await flushPendingRuns(sync);

    expect(result).toEqual({synced: 1, remaining: 1});
    const queue = await loadPendingRuns();
    expect(queue.map(r => r.localId)).toEqual(['run_fail']);
  });

  test('flushing an empty queue is a no-op that touches no sync function', async () => {
    const sync = jest.fn();
    const result = await flushPendingRuns(sync);
    expect(sync).not.toHaveBeenCalled();
    expect(result).toEqual({synced: 0, remaining: 0});
  });
});

// ── client-side idempotency (duplicate-run guard) ────────────────
describe('serverHasRun — match a queued run against already-fetched server runs', () => {
  test('matches on the echoed client idempotency key (localId)', () => {
    const serverRuns = [{id: 'server-7', localId: 'run_abc', shoe_id: 'other', run_date: 'x', km: 99}];
    // Even though shoe/date/km differ, the echoed localId proves it is the same run.
    expect(serverHasRun(PENDING, serverRuns)).toBe(true);
  });

  test('matches on the natural signature run_date + shoe_id + km when no id is echoed', () => {
    const serverRuns = [{id: 'server-7', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.02}];
    expect(serverHasRun(PENDING, serverRuns)).toBe(true);
  });

  test('absorbs float round-trip noise within a 0.005km tolerance', () => {
    const serverRuns = [{id: 's', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.018}];
    expect(serverHasRun(PENDING, serverRuns)).toBe(true);
  });

  test('does NOT match a different run (different distance, no echoed id)', () => {
    const serverRuns = [{id: 's', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 8.0}];
    expect(serverHasRun(PENDING, serverRuns)).toBe(false);
  });

  test('does NOT match when the server list is empty or malformed', () => {
    expect(serverHasRun(PENDING, [])).toBe(false);
    expect(serverHasRun(PENDING, null as any)).toBe(false);
    expect(serverHasRun(PENDING, [null, {}] as any)).toBe(false);
  });
});

// ── 1:1 server-row matching (echo definitive, signature heuristic) ──
describe('matchServerRun — 1:1 consumption, echo preferred over signature', () => {
  test('reports an echoed-localId match as definitive (kind=echo)', () => {
    const serverRuns = [{id: 'server-7', localId: 'run_abc', shoe_id: 'x', run_date: 'y', km: 99}];
    expect(matchServerRun(PENDING, serverRuns)).toEqual({index: 0, kind: 'echo'});
  });

  test('reports a signature-only match as a heuristic (kind=signature)', () => {
    const serverRuns = [{id: 'server-7', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.02}];
    expect(matchServerRun(PENDING, serverRuns)).toEqual({index: 0, kind: 'signature'});
  });

  test('prefers the echoed row even when an earlier row matches only by signature', () => {
    const serverRuns = [
      {id: 'sig', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.02}, // signature
      {id: 'echo', localId: 'run_abc', shoe_id: 'other', run_date: 'z', km: 1}, // echo
    ];
    expect(matchServerRun(PENDING, serverRuns)).toEqual({index: 1, kind: 'echo'});
  });

  test('a consumed server row cannot match a second queued run (1:1)', () => {
    const a: PendingRun = {...PENDING, localId: 'run_a'};
    const b: PendingRun = {...PENDING, localId: 'run_b'}; // identical signature
    const serverRuns = [{shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.02}]; // ONE row
    const consumed = new Set<number>();
    const m1 = matchServerRun(a, serverRuns, consumed);
    expect(m1).toEqual({index: 0, kind: 'signature'});
    consumed.add(m1!.index);
    // The single server row is spent — it can no longer claim the second run.
    expect(matchServerRun(b, serverRuns, consumed)).toBeNull();
  });
});

describe('reconcilePendingWithServer — drop ONLY echo-confirmed runs (iron law: avoid loss)', () => {
  test('dequeues a queued run the server echoes by localId, and keeps it durably removed', async () => {
    await enqueuePendingRun(PENDING);
    // Server echoes the client idempotency key — definitive proof it is ours.
    const serverRuns = [{id: 'server-7', localId: 'run_abc', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.02}];

    const {stillPending, dropped} = await reconcilePendingWithServer(serverRuns);

    expect(stillPending).toEqual([]);
    expect(dropped.map(r => r.localId)).toEqual(['run_abc']);
    // The dequeue is persisted, so a crash here cannot resurrect the run.
    expect(await loadPendingRuns()).toEqual([]);
  });

  test('a signature-only match is KEPT queued (re-POST) — never silently dropped', async () => {
    await enqueuePendingRun(PENDING);
    // Same shoe/date/km but NO echoed localId: could be a coincidental twin.
    const serverRuns = [{id: 'server-7', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.02}];

    const {stillPending, dropped} = await reconcilePendingWithServer(serverRuns);

    // Dropping it would risk irrecoverable loss; re-POST risks only a visible dup.
    expect(dropped).toEqual([]);
    expect(stillPending.map(r => r.localId)).toEqual(['run_abc']);
    expect((await loadPendingRuns()).map(r => r.localId)).toEqual(['run_abc']);
  });

  test('two identical-signature queued runs with no echoed id are BOTH kept (no data loss)', async () => {
    await enqueuePendingRun(PENDING);
    await enqueuePendingRun({...PENDING, localId: 'run_twin'}); // same shoe/date/km
    // One server row with the shared signature, no echoed localId.
    const serverRuns = [{shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.02}];

    const {stillPending, dropped} = await reconcilePendingWithServer(serverRuns);

    expect(dropped).toEqual([]);
    expect(stillPending.map(r => r.localId).sort()).toEqual(['run_abc', 'run_twin']);
    expect((await loadPendingRuns()).map(r => r.localId).sort()).toEqual(['run_abc', 'run_twin']);
  });

  test('keeps a genuinely-unsynced run queued for the flush', async () => {
    await enqueuePendingRun(PENDING);
    const serverRuns = [{id: 'server-7', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 8.0}];

    const {stillPending} = await reconcilePendingWithServer(serverRuns);

    expect(stillPending.map(r => r.localId)).toEqual(['run_abc']);
    expect((await loadPendingRuns()).map(r => r.localId)).toEqual(['run_abc']);
  });

  test('only the echo-confirmed run is dropped; the rest survive', async () => {
    await enqueuePendingRun(PENDING);
    await enqueuePendingRun({...PENDING, localId: 'run_new', km: 3.1, run_date: '2026-06-02'});
    // Server echoes the first run only.
    const serverRuns = [{localId: 'run_abc', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.02}];

    const {stillPending, dropped} = await reconcilePendingWithServer(serverRuns);

    expect(dropped.map(r => r.localId)).toEqual(['run_abc']);
    expect(stillPending.map(r => r.localId)).toEqual(['run_new']);
    expect((await loadPendingRuns()).map(r => r.localId)).toEqual(['run_new']);
  });

  test('one echoed server row drops at most ONE of two identical-localId-echo candidates (1:1)', async () => {
    // Defensive: even if two queued runs somehow shared an echoed signature, a
    // single server row consumes only one — the other stays queued, not lost.
    await enqueuePendingRun(PENDING);
    await enqueuePendingRun({...PENDING, localId: 'run_dupe'});
    // Two server rows, only one echoes run_abc.
    const serverRuns = [{localId: 'run_abc', shoe_id: 'shoe-1', run_date: '2026-06-01', km: 5.02}];

    const {stillPending, dropped} = await reconcilePendingWithServer(serverRuns);

    expect(dropped.map(r => r.localId)).toEqual(['run_abc']);
    expect(stillPending.map(r => r.localId)).toEqual(['run_dupe']);
  });
});
