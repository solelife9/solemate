// lib/restToFirestoreMigration — REST→Firestore 일회성 이관 (Phase 5b · Stage 0)
//
// 검증: 순수 결정(isEmptyPayload/decideRestSeed) + 오케스트레이션의 분기별 계약
// (멱등·비파괴·비차단)을 주입 fake 로 firebase/네트워크 없이 결정적으로 단언한다.

import type {BackupPayload} from '../../lib/backup';
import {
  isEmptyPayload,
  decideRestSeed,
  migrateRestToFirestore,
  RestMigrationDeps,
} from '../../lib/restToFirestoreMigration';

const PAYLOAD = (shoes: number, runs: number): BackupPayload => ({
  shoes: Array.from({length: shoes}, (_, i) => ({id: `s${i}`})),
  runs: Array.from({length: runs}, (_, i) => ({id: `r${i}`})),
  settings: {},
});

describe('isEmptyPayload', () => {
  test('null/누락/빈 배열 → 빈 것', () => {
    expect(isEmptyPayload(null)).toBe(true);
    expect(isEmptyPayload(undefined)).toBe(true);
    expect(isEmptyPayload({shoes: [], runs: [], settings: {}})).toBe(true);
    expect(isEmptyPayload({} as any)).toBe(true);
  });
  test('신발 또는 런이 하나라도 있으면 비어있지 않음', () => {
    expect(isEmptyPayload(PAYLOAD(1, 0))).toBe(false);
    expect(isEmptyPayload(PAYLOAD(0, 1))).toBe(false);
  });
});

describe('decideRestSeed', () => {
  test('remote 비고 rest 있음 → 시드', () => {
    expect(decideRestSeed(null, PAYLOAD(2, 3)).shouldSeed).toBe(true);
  });
  test('remote 이미 데이터 → 시드 안 함(비파괴)', () => {
    expect(decideRestSeed(PAYLOAD(1, 0), PAYLOAD(2, 3)).shouldSeed).toBe(false);
  });
  test('rest 비면 → 시드 안 함', () => {
    expect(decideRestSeed(null, null).shouldSeed).toBe(false);
    expect(decideRestSeed(null, PAYLOAD(0, 0)).shouldSeed).toBe(false);
  });
});

/** 기록 가능한 fake deps. 호출/플래그/푸시를 관찰한다. */
function makeDeps(over: Partial<RestMigrationDeps> & {done?: boolean} = {}) {
  const state = {done: over.done ?? false, pushed: null as BackupPayload | null, applied: null as BackupPayload | null};
  const deps: RestMigrationDeps = {
    isDone: jest.fn(async () => state.done),
    markDone: jest.fn(async () => {
      state.done = true;
    }),
    pullRemote: over.pullRemote ?? jest.fn(async () => null),
    loadRest: over.loadRest ?? jest.fn(async () => null),
    pushRemote:
      over.pushRemote ??
      jest.fn(async (d: BackupPayload) => {
        state.pushed = d;
      }),
    applyLocal:
      over.applyLocal ??
      ((d: BackupPayload) => {
        state.applied = d;
      }),
  };
  return {deps, state};
}

describe('migrateRestToFirestore', () => {
  test('이미 완료 → no-op(pull/loadRest 미호출)', async () => {
    const {deps} = makeDeps({done: true});
    const res = await migrateRestToFirestore(deps);
    expect(res).toEqual({migrated: false, reason: 'already-done'});
    expect(deps.pullRemote).not.toHaveBeenCalled();
    expect(deps.loadRest).not.toHaveBeenCalled();
  });

  test('Firestore 가 이미 데이터 → 시드 안 함 + 완료표시(비파괴)', async () => {
    const {deps, state} = makeDeps({pullRemote: jest.fn(async () => PAYLOAD(1, 1))});
    const res = await migrateRestToFirestore(deps);
    expect(res).toEqual({migrated: false, reason: 'firestore-already-has-data'});
    expect(deps.loadRest).not.toHaveBeenCalled();
    expect(state.pushed).toBeNull();
    expect(deps.markDone).toHaveBeenCalled();
  });

  test('REST 도달 불가(null) → 미완료(다음 부팅 재시도)', async () => {
    const {deps, state} = makeDeps({
      pullRemote: jest.fn(async () => null),
      loadRest: jest.fn(async () => null),
    });
    const res = await migrateRestToFirestore(deps);
    expect(res).toEqual({migrated: false, reason: 'rest-unreachable'});
    expect(state.pushed).toBeNull();
    expect(deps.markDone).not.toHaveBeenCalled();
  });

  test('REST 도 비어있음(신규 사용자) → 완료표시, 시드 안 함', async () => {
    const {deps, state} = makeDeps({
      pullRemote: jest.fn(async () => null),
      loadRest: jest.fn(async () => PAYLOAD(0, 0)),
    });
    const res = await migrateRestToFirestore(deps);
    expect(res).toEqual({migrated: false, reason: 'no-rest-data'});
    expect(state.pushed).toBeNull();
    expect(deps.markDone).toHaveBeenCalled();
  });

  test('Firestore 비고 REST 데이터 있음 → 시드 + 로컬반영 + 완료', async () => {
    const rest = PAYLOAD(2, 3);
    const {deps, state} = makeDeps({
      pullRemote: jest.fn(async () => ({shoes: [], runs: [], settings: {}})),
      loadRest: jest.fn(async () => rest),
    });
    const res = await migrateRestToFirestore(deps);
    expect(res).toEqual({migrated: true, reason: 'seeded'});
    expect(state.pushed).toBe(rest);
    expect(state.applied).toBe(rest);
    expect(deps.markDone).toHaveBeenCalled();
  });

  test('push 실패 → error, 플래그 미set(재시도)', async () => {
    const {deps, state} = makeDeps({
      pullRemote: jest.fn(async () => null),
      loadRest: jest.fn(async () => PAYLOAD(1, 1)),
      pushRemote: jest.fn(async () => {
        throw new Error('firestore down');
      }),
    });
    const res = await migrateRestToFirestore(deps);
    expect(res).toEqual({migrated: false, reason: 'error'});
    expect(state.done).toBe(false);
  });
});
