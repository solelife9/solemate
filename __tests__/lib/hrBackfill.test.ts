// lib/hrBackfill — 심박 지연 보강(워치 직송 매칭 A + HealthKit 재시도 B) 로직 테스트.
// 폰이 주머니에 있어 실시간 심박을 놓쳐도 hrTrack 이 채워지는 안전망을 고정한다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerRunForHr,
  loadPending,
  hasHrTrack,
  saveWatchHrTrack,
  buildHrTrack,
  retryPendingHr,
  HR_PENDING_MAX_AGE_MS,
} from '../../lib/hrBackfill';

const NOW = 1_720_000_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('registerRunForHr — 대기 등록', () => {
  it('런 시간창을 등록하고 중복은 무시한다', async () => {
    await registerRunForHr('r1', NOW - 1800_000, NOW, NOW);
    await registerRunForHr('r1', NOW - 1800_000, NOW, NOW); // 중복
    await registerRunForHr('r2', NOW - 600_000, NOW, NOW);
    const list = await loadPending();
    expect(list.map(e => e.runId).sort()).toEqual(['r1', 'r2']);
  });

  it('startMs>=endMs 등 무효 창은 등록하지 않는다', async () => {
    await registerRunForHr('bad', NOW, NOW, NOW);
    await registerRunForHr('', NOW - 1000, NOW, NOW);
    expect(await loadPending()).toHaveLength(0);
  });
});

describe('buildHrTrack — 워치 오프셋 → 폰 상대 초 환산', () => {
  it('폰 런 시작 기준 상대 초로 변환하고 노이즈·음수 t 를 버리며 정렬한다', () => {
    // 워치 시작이 폰 런 시작보다 10초 늦음 → 워치 offset 0 은 폰 t=10.
    const runStart = NOW;
    const wStart = NOW + 10_000;
    const track = buildHrTrack(
      runStart,
      wStart,
      [0, 5, 2, -20],           // 마지막은 폰 t = 10 + (-20) = -10 → 음수라 버림
      [150, 300, 148, 150],     // 300bpm 은 노이즈라 버림
    );
    expect(track).toEqual([
      {t: 10, bpm: 150},
      {t: 12, bpm: 148},
    ]);
  });
});

describe('saveWatchHrTrack (A) — 시간창 매칭 저장', () => {
  it('겹치는 대기 런의 hrTrack 을 채우고 대기에서 제거한다', async () => {
    await registerRunForHr('run', NOW - 1800_000, NOW, NOW); // 30분 런
    // 워치 창은 거의 동일(폰 시작 +2초). offset 0,60 → 폰 t 2,62.
    const matched = await saveWatchHrTrack(
      NOW - 1800_000 + 2000,
      NOW + 2000,
      [0, 60],
      [140, 150],
      NOW,
    );
    expect(matched).toBe('run');
    const saved = JSON.parse((await AsyncStorage.getItem('hrTrack_run'))!);
    expect(saved).toEqual([{t: 2, bpm: 140}, {t: 62, bpm: 150}]);
    expect(await loadPending()).toHaveLength(0);
  });

  it('겹치는 런이 없으면 null(대기 유지)', async () => {
    await registerRunForHr('run', NOW - 1800_000, NOW, NOW);
    // 워치 창이 3시간 전 — 안 겹침.
    const matched = await saveWatchHrTrack(NOW - 3 * 3600_000, NOW - 3 * 3600_000 + 600_000, [0], [140], NOW);
    expect(matched).toBeNull();
    expect(await loadPending()).toHaveLength(1);
  });

  it('이미 hrTrack 이 있으면 덮어쓰지 않고 대기에서만 제거한다', async () => {
    await registerRunForHr('run', NOW - 1800_000, NOW, NOW);
    await AsyncStorage.setItem('hrTrack_run', JSON.stringify([{t: 0, bpm: 111}]));
    const matched = await saveWatchHrTrack(NOW - 1800_000, NOW, [0, 60], [140, 150], NOW);
    expect(matched).toBe('run');
    // 실측(라이브) 우선 — 덮어쓰지 않음.
    expect(JSON.parse((await AsyncStorage.getItem('hrTrack_run'))!)).toEqual([{t: 0, bpm: 111}]);
    expect(await loadPending()).toHaveLength(0);
  });
});

describe('retryPendingHr (B) — HealthKit 재시도', () => {
  it('백필이 채우면 완료로 간주해 대기에서 제거한다', async () => {
    await registerRunForHr('run', NOW - 1800_000, NOW, NOW);
    const hk = jest.fn(async (runId: string) => {
      await AsyncStorage.setItem('hrTrack_' + runId, JSON.stringify([{t: 0, bpm: 130}, {t: 60, bpm: 140}]));
      return 2;
    });
    await retryPendingHr(NOW, hk);
    expect(hk).toHaveBeenCalledWith('run', NOW - 1800_000, NOW);
    expect(await loadPending()).toHaveLength(0);
  });

  it('아직 못 채우면(0) 대기를 유지해 다음 기회에 재시도한다', async () => {
    await registerRunForHr('run', NOW - 1800_000, NOW, NOW);
    const hk = jest.fn(async () => 0); // HK 동기화 아직 안 됨
    await retryPendingHr(NOW, hk);
    expect(await loadPending()).toHaveLength(1);
  });

  it('이미 hrTrack 있으면 백필 시도 없이 제거한다', async () => {
    await registerRunForHr('run', NOW - 1800_000, NOW, NOW);
    await AsyncStorage.setItem('hrTrack_run', JSON.stringify([{t: 0, bpm: 120}]));
    const hk = jest.fn(async () => 0);
    await retryPendingHr(NOW, hk);
    expect(hk).not.toHaveBeenCalled();
    expect(await loadPending()).toHaveLength(0);
  });

  it('만료(12h+)된 런은 포기하고 제거한다', async () => {
    await registerRunForHr('old', NOW - 1800_000, NOW, NOW);
    const hk = jest.fn(async () => 0);
    await retryPendingHr(NOW + HR_PENDING_MAX_AGE_MS + 1000, hk);
    expect(hk).not.toHaveBeenCalled();
    expect(await loadPending()).toHaveLength(0);
  });
});

describe('hasHrTrack', () => {
  it('존재 여부를 반영한다', async () => {
    expect(await hasHrTrack('x')).toBe(false);
    await AsyncStorage.setItem('hrTrack_x', '[]');
    expect(await hasHrTrack('x')).toBe(true);
  });
});
