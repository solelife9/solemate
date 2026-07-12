// 심박존 코칭 결정 로직(#7) — 히스테리시스(15s 첫 알림 · 60s 재알림 · 복귀 침묵).
import {decideZoneCoach, initZoneCoachState, ZoneCoachState} from '../../lib/zoneCoach';

// 헬퍼: 상태를 이어가며 여러 틱을 먹인다. 반환 = 마지막 decision + 알림 횟수.
function run(steps: Array<{cur: number; tgt: number; dt: number}>) {
  let st: ZoneCoachState = initZoneCoachState();
  const announces: string[] = [];
  let last;
  for (const s of steps) {
    last = decideZoneCoach(st, s.cur, s.tgt, s.dt);
    st = last.state;
    if (last.announce) announces.push(last.announce);
  }
  return {last: last!, announces, state: st};
}

test('목표 존 안이면 알림 없음, deviation null', () => {
  const {last, announces} = run([{cur: 2, tgt: 2, dt: 5}, {cur: 2, tgt: 2, dt: 5}]);
  expect(announces).toHaveLength(0);
  expect(last.deviation).toBeNull();
});

test('가이드 꺼짐(tgt 0)·심박 미측정(cur 0)이면 무알림', () => {
  expect(run([{cur: 4, tgt: 0, dt: 20}]).announces).toHaveLength(0);
  expect(run([{cur: 0, tgt: 2, dt: 20}]).announces).toHaveLength(0);
});

test('이탈 15s 미만은 알림 없음(순간 스파이크 무시)', () => {
  // 목표 Z2, 현재 Z4(높음) 10초 지속 → 아직 알림 X
  const {announces, last} = run([{cur: 4, tgt: 2, dt: 5}, {cur: 4, tgt: 2, dt: 5}]);
  expect(announces).toHaveLength(0);
  expect(last.deviation).toBe('down'); // 화면 표시는 즉시
});

test('이탈 15s 도달 시 첫 알림(높으면 down=낮춰라)', () => {
  const {announces} = run([{cur: 4, tgt: 2, dt: 5}, {cur: 4, tgt: 2, dt: 5}, {cur: 4, tgt: 2, dt: 5}]);
  expect(announces).toEqual(['down']);
});

test('낮으면 up=올려라', () => {
  const {announces} = run([{cur: 1, tgt: 3, dt: 8}, {cur: 1, tgt: 3, dt: 8}]);
  expect(announces).toEqual(['up']);
});

test('재알림은 60s 간격 — 그 안엔 한 번만', () => {
  // 15s 에 첫 알림, 이후 계속 이탈. 50s 더 지나도(총 65s) 재알림은 60s 경과 시 1회.
  const steps = [];
  for (let i = 0; i < 20; i++) steps.push({cur: 4, tgt: 2, dt: 5}); // 100초 이탈
  const {announces} = run(steps);
  // 15s(첫) + 그 뒤 60s(75s 지점) 재알림 → 총 2회 정도. 3회 이하·1회 이상.
  expect(announces.length).toBeGreaterThanOrEqual(2);
  expect(announces.length).toBeLessThanOrEqual(3);
});

test('존 복귀 시 조용(알림 없음)하고 상태 리셋 — 재이탈은 다시 15s 필요', () => {
  const seq = run([
    {cur: 4, tgt: 2, dt: 5}, {cur: 4, tgt: 2, dt: 5}, {cur: 4, tgt: 2, dt: 5}, // 15s → 알림1
    {cur: 2, tgt: 2, dt: 5}, // 복귀 → 침묵·리셋
    {cur: 4, tgt: 2, dt: 5}, {cur: 4, tgt: 2, dt: 5}, // 재이탈 10s → 아직 알림 X
  ]);
  expect(seq.announces).toEqual(['down']); // 첫 알림만, 복귀 후 재이탈은 아직
});

test('방향 전환(높음→낮음)은 새 구간 — 15s 다시 누적', () => {
  const seq = run([
    {cur: 4, tgt: 3, dt: 8}, {cur: 4, tgt: 3, dt: 8}, // down 16s → 알림 down
    {cur: 2, tgt: 3, dt: 8}, // 이제 낮음(up) — 방향 전환, heldSec 리셋
    {cur: 2, tgt: 3, dt: 5}, // up 13s → 아직 알림 X
  ]);
  expect(seq.announces).toEqual(['down']);
  expect(seq.last.deviation).toBe('up');
});
