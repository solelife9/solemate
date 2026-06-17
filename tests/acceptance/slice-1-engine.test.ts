// ============================================================================
// Acceptance tests — Slice 1: 핵심 러닝 엔진 정밀화 + 신뢰성
// slice: 1   tag: @slice-1
//
// These define "done" for Slice 1. They import the pure engine modules that
// Slice 1 extracts from App.tsx (lib/*). They WILL fail until those modules
// exist — that is expected (TDD). Dev jobs make them pass.
//
// Contracts (see decomposition Interface Contracts):
//   lib/engineConstants.ts — MAX_FIX_ACCURACY_M, WARMUP_FIXES, MAX_SEG_SPEED_MPS,
//                            MIN_SEG_DIST_KM, MAX_SEG_DIST_KM, AUTO_PAUSE_*, AUTO_RESUME_*
//   lib/geo.ts    — calcDist, acceptSegment, segmentSpeedMps
//   lib/autoPause.ts — decideAutoPause, initAutoPauseState
//   lib/shoe.ts   — shoeHealth, isRetired
//   lib/format.ts — fmtPace, fmtTime
// ============================================================================

import {
  MAX_FIX_ACCURACY_M,
  WARMUP_FIXES,
  MAX_SEG_SPEED_MPS,
} from '../../lib/engineConstants';
import { calcDist, acceptSegment, segmentSpeedMps } from '../../lib/geo';
import { decideAutoPause, initAutoPauseState } from '../../lib/autoPause';
import { shoeHealth, isRetired } from '../../lib/shoe';
import { fmtPace, fmtTime } from '../../lib/format';

describe('Scenario 2: 정확도 낮은 GPS fix는 거리에 반영되지 않는다', () => {
  test('accuracy > 20m fix는 거부된다', () => {
    expect(MAX_FIX_ACCURACY_M).toBe(20);
    // 35m 정확도 fix → 거부 (거리 미반영)
    const accepted = acceptSegment({ distKm: 0.01, dtSec: 1, accuracyM: 35, fixIndex: 10 });
    expect(accepted).toBe(false);
  });

  test('양호한 정확도(8m)의 정상 구간은 인정된다', () => {
    const accepted = acceptSegment({ distKm: 0.01, dtSec: 2, accuracyM: 8, fixIndex: 10 });
    expect(accepted).toBe(true);
  });
});

describe('Scenario: GPS 워밍업 — 시작 첫 fix는 거리 미반영', () => {
  test('첫 WARMUP_FIXES개 fix는 제외된다', () => {
    expect(WARMUP_FIXES).toBe(3);
    expect(acceptSegment({ distKm: 0.01, dtSec: 1, accuracyM: 8, fixIndex: 0 })).toBe(false);
    expect(acceptSegment({ distKm: 0.01, dtSec: 1, accuracyM: 8, fixIndex: 2 })).toBe(false);
    // 워밍업 이후는 인정
    expect(acceptSegment({ distKm: 0.01, dtSec: 1, accuracyM: 8, fixIndex: 3 })).toBe(true);
  });
});

describe('Anti-Scenario 1: GPS 점프(속도 이상치)는 거리에 가산되지 않는다', () => {
  test('순간속도 > 12 m/s 구간은 거부', () => {
    expect(MAX_SEG_SPEED_MPS).toBe(12);
    // 0.05km(50m)를 1초 = 50 m/s → 점프, 거부
    expect(segmentSpeedMps(0.05, 1)).toBeCloseTo(50, 0);
    expect(acceptSegment({ distKm: 0.05, dtSec: 1, accuracyM: 8, fixIndex: 10 })).toBe(false);
  });
});

describe('audit#5: 일반 페이스의 느린 구간이 과소집계되지 않는다', () => {
  test('1.5m(0.0015km) 정상 이동 구간은 인정된다 (기존 3m 하한 완화)', () => {
    expect(acceptSegment({ distKm: 0.0015, dtSec: 1, accuracyM: 8, fixIndex: 10 })).toBe(true);
  });
  test('calcDist는 합리적 거리를 반환한다', () => {
    // 서울 인근 두 점, 대략 수십~수백 m
    const d = calcDist(37.5665, 126.978, 37.5675, 126.978);
    expect(d).toBeGreaterThan(0.08);
    expect(d).toBeLessThan(0.15);
  });
});

describe('Scenario 3: 자동 일시정지/재개가 실제로 작동한다', () => {
  test('0.6 m/s 미만 3초 지속 → 자동 일시정지', () => {
    let s = initAutoPauseState();
    let r = decideAutoPause(s, 0.3, 2); // 2초 정지
    expect(r.paused).toBe(false);
    r = decideAutoPause(r.state, 0.3, 1.5); // 누적 3.5초
    expect(r.paused).toBe(true);
    expect(r.justPaused).toBe(true);
  });

  test('1.0 m/s 초과 1초 지속 → 자동 재개', () => {
    let s = initAutoPauseState();
    let r = decideAutoPause(s, 0.2, 7); // paused
    expect(r.paused).toBe(true);
    r = decideAutoPause(r.state, 1.5, 1.5); // 다시 달림(1.5초 ≥ 1초)
    expect(r.paused).toBe(false);
    expect(r.justResumed).toBe(true);
  });
});

describe('Anti-Scenario 2: 자동 일시정지에서 시간이 음수/유실되지 않는다', () => {
  test('어떤 전이에서도 누적 일시정지 시간은 음수가 아니다', () => {
    let r = decideAutoPause(initAutoPauseState(), 0.2, 7);
    r = decideAutoPause(r.state, 1.5, 3);
    r = decideAutoPause(r.state, 0.1, 8);
    expect(r.state.pausedMs).toBeGreaterThanOrEqual(0);
  });
});

describe('Scenario 1 & 차별점: 신발 수명(shoeHealth) — 검증 카테고리 기반 비례 경고', () => {
  const dailyShoe = { id: 1, brand: 'NIKE', model: 'Pegasus 41', max: 700, start_km: 0 };
  test('새 신발은 양호', () => {
    const h = shoeHealth(dailyShoe, []);
    expect(h.usedKm).toBe(0);
    expect(h.remainingKm).toBe(700);
    expect(h.condition).toBe('양호');
  });
  test('런 저장 시 거리가 누적되어 used가 증가한다(자동 차감)', () => {
    const runs = [{ shoe_id: 1, km: 5 }, { shoe_id: 1, km: 5 }, { shoe_id: 2, km: 99 }];
    const h = shoeHealth(dailyShoe, runs);
    expect(h.usedKm).toBeCloseTo(10, 5); // 다른 신발(99km)은 제외
  });
  test('수명 비례 티어: 75% 이상 주의, 90% 이상 교체', () => {
    expect(shoeHealth(dailyShoe, [{ shoe_id: 1, km: 540 }]).condition).toBe('주의'); // ~77%
    expect(shoeHealth(dailyShoe, [{ shoe_id: 1, km: 640 }]).condition).toBe('교체'); // ~91%
  });
});

describe('Anti-Scenario 4: retire(보관)는 런 기록을 파괴하지 않는다', () => {
  test('isRetired 플래그로 보관 상태를 표현한다', () => {
    expect(isRetired({ id: 1, retired: true })).toBe(true);
    expect(isRetired({ id: 1 })).toBe(false);
  });
});

describe('audit#7: pace/time 포맷 가드 (0거리/짧은거리에서 가짜 페이스 금지)', () => {
  test('의미 없는 거리에서는 -- 표시', () => {
    expect(fmtPace(0, 100)).toBe('--');
  });
  test('정상 거리/시간은 m\'ss" 형식', () => {
    expect(fmtPace(1, 300)).toMatch(/^\d+'\d{2}"$/); // 1km 5분 → 5'00"
  });
  test('fmtTime은 HH:MM:SS 또는 MM:SS', () => {
    expect(fmtTime(65)).toBe('01:05');
  });
});
