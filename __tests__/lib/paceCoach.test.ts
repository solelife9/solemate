/**
 * 스피드(목표 페이스) 코칭 판정 계약 — 2026-07-27 분리.
 *
 * 이 판정은 **러닝 중 귀에 대고 말하는 기능**인데 RunEngine 안에 인라인이라 테스트가
 * 한 건도 없었다. 여기서 고정하는 것:
 *   · 순간적으로 흔들렸다고 말하지 않는다(지속 게이트 — 신호대기·언덕·터널).
 *   · 잘 달리고 있을 땐 침묵한다. 이탈에서 복귀했을 때만 한 번 '좋아요'.
 *   · 같은 말을 반복하지 않는다(최소 간격).
 *   · 버퍼는 목표 페이스에 비례한다(느린 러너가 더 자주 지적받던 구조 교정).
 *
 * @format
 */
import {
  decidePaceCoach,
  initPaceCoachState,
  paceBufferSec,
  type PaceCoachState,
} from '../../lib/paceCoach';
import {
  PACE_COACH_WARMUP_S,
  PACE_COACH_MIN_GAP_S,
  PACE_OFF_SUSTAIN_S,
  PACE_BUFFER_MIN_S,
  PACE_BUFFER_MAX_S,
} from '../../lib/engineConstants';

const TARGET = 300; // 5'00"/km

/**
 * 같은 입력으로 여러 틱을 흘려보낸다(dt=1s).
 *
 * announce 는 **구간 전체에서 처음 나온 알림**을 돌려준다 — 알림은 조건이 충족된 그 틱에
 * 한 번 나가고 이후 틱은 간격 게이트에 막히므로, 마지막 틱만 보면 항상 null 이다
 * (처음 이 헬퍼를 마지막 틱만 반환하게 짰다가 통과해야 할 4건이 실패했다).
 */
function run(
  state: PaceCoachState,
  current: number | null,
  fromS: number,
  ticks: number,
  target: number | null = TARGET,
) {
  let s = state;
  let firstAnnounce: any = null;
  let status: any = null;
  for (let i = 0; i < ticks; i++) {
    const d = decidePaceCoach(s, target, current, fromS + i, 1);
    s = d.state;
    status = d.status;
    if (firstAnnounce == null) firstAnnounce = d.announce;
  }
  return {state: s, announce: firstAnnounce, status};
}

describe('paceBufferSec — 목표에 비례하는 허용 폭', () => {
  it('느린 목표일수록 버퍼가 넓다', () => {
    expect(paceBufferSec(240)).toBeLessThan(paceBufferSec(420));
  });

  it('4:30(270s) 에서 기존 감각(8초 안팎)을 유지한다', () => {
    expect(paceBufferSec(270)).toBeCloseTo(8.1, 1);
  });

  it('하한·상한을 벗어나지 않는다', () => {
    expect(paceBufferSec(60)).toBe(PACE_BUFFER_MIN_S);
    expect(paceBufferSec(3000)).toBe(PACE_BUFFER_MAX_S);
  });

  it('손상값은 하한으로 안전 처리', () => {
    expect(paceBufferSec(NaN)).toBe(PACE_BUFFER_MIN_S);
    expect(paceBufferSec(-10)).toBe(PACE_BUFFER_MIN_S);
  });
});

describe('말하지 않아야 할 때', () => {
  it('워밍업 중에는 아무리 벗어나도 말하지 않는다', () => {
    const r = run(initPaceCoachState(), TARGET + 60, 0, PACE_COACH_WARMUP_S - 1);
    expect(r.announce).toBeNull();
  });

  it('순간적으로 벗어난 정도로는 말하지 않는다(지속 게이트)', () => {
    const start = PACE_COACH_WARMUP_S + 10;
    const r = run(initPaceCoachState(), TARGET + 60, start, PACE_OFF_SUSTAIN_S - 1);
    expect(r.announce).toBeNull();
  });

  it('목표 범위 안에서는 침묵한다(잘하고 있을 땐 칭찬 대신 조용)', () => {
    const r = run(initPaceCoachState(), TARGET, PACE_COACH_WARMUP_S + 10, 60);
    expect(r.announce).toBeNull();
    expect(r.status).toBe('on');
  });

  it('목표가 없으면(스피드 모드 아님) 판정 자체를 하지 않는다', () => {
    const r = decidePaceCoach(initPaceCoachState(), null, TARGET, 200, 1);
    expect(r.announce).toBeNull();
    expect(r.status).toBeNull();
  });

  it('페이스 표본이 없으면 판정하지 않고 상태를 보존한다', () => {
    const held: PaceCoachState = {...initPaceCoachState(), heldSec: 5, heldDir: 'slow'};
    const r = decidePaceCoach(held, TARGET, null, 200, 1);
    expect(r.announce).toBeNull();
    expect(r.state.heldSec).toBe(5); // 신호 끊김으로 누적을 날리지 않는다
  });
});

describe('말해야 할 때', () => {
  const start = PACE_COACH_WARMUP_S + 10;

  it('느린 상태가 지속되면 느리다고 말한다', () => {
    const r = run(initPaceCoachState(), TARGET + 60, start, PACE_OFF_SUSTAIN_S + 1);
    expect(r.announce).toBe('slow');
  });

  it('빠른 상태가 지속되면 빠르다고 말한다', () => {
    const r = run(initPaceCoachState(), TARGET - 60, start, PACE_OFF_SUSTAIN_S + 1);
    expect(r.announce).toBe('fast');
  });

  it('말한 직후에는 최소 간격 안에 다시 말하지 않는다', () => {
    let r = run(initPaceCoachState(), TARGET + 60, start, PACE_OFF_SUSTAIN_S + 1);
    expect(r.announce).toBe('slow');
    const after = r.state.lastAnnouncedAtS;
    // 계속 느린 채로 간격 미만만큼 더 흘려도 조용하다.
    r = run(r.state, TARGET + 60, after + 1, PACE_COACH_MIN_GAP_S - 2);
    expect(r.announce).toBeNull();
  });

  it('간격이 지나고도 여전히 느리면 다시 말한다', () => {
    let r = run(initPaceCoachState(), TARGET + 60, start, PACE_OFF_SUSTAIN_S + 1);
    const after = r.state.lastAnnouncedAtS;
    r = run(r.state, TARGET + 60, after + PACE_COACH_MIN_GAP_S, 2);
    expect(r.announce).toBe('slow');
  });
});

describe('복귀했을 때', () => {
  const start = PACE_COACH_WARMUP_S + 10;

  it('이탈을 알린 뒤 범위로 돌아오면 한 번 알린다', () => {
    let r = run(initPaceCoachState(), TARGET + 60, start, PACE_OFF_SUSTAIN_S + 1);
    expect(r.announce).toBe('slow');
    r = decidePaceCoach(r.state, TARGET, TARGET, r.state.lastAnnouncedAtS + PACE_COACH_MIN_GAP_S, 1);
    expect(r.announce).toBe('on');
  });

  it('복귀 알림은 한 번뿐이다(계속 잘 달려도 반복하지 않는다)', () => {
    let r = run(initPaceCoachState(), TARGET + 60, start, PACE_OFF_SUSTAIN_S + 1);
    r = decidePaceCoach(r.state, TARGET, TARGET, r.state.lastAnnouncedAtS + PACE_COACH_MIN_GAP_S, 1);
    expect(r.announce).toBe('on');
    const after = r.state.lastAnnouncedAtS;
    r = run(r.state, TARGET, after + PACE_COACH_MIN_GAP_S + 5, 60);
    expect(r.announce).toBeNull();
  });

  it('한 번도 이탈을 알린 적 없으면 복귀 알림도 없다', () => {
    const r = run(initPaceCoachState(), TARGET, start, 120);
    expect(r.announce).toBeNull();
  });
});

describe('방향이 바뀔 때', () => {
  const start = PACE_COACH_WARMUP_S + 10;

  it('느림 → 빠름으로 뒤집히면 지속을 처음부터 다시 센다', () => {
    let r = run(initPaceCoachState(), TARGET + 60, start, PACE_OFF_SUSTAIN_S - 2);
    expect(r.announce).toBeNull();
    // 방향이 바뀌자마자 이전 누적으로 즉시 말하면 안 된다.
    r = run(r.state, TARGET - 60, start + PACE_OFF_SUSTAIN_S, 2);
    expect(r.announce).toBeNull();
    expect(r.state.heldDir).toBe('fast');
  });
});

describe('상태 불변성', () => {
  it('입력 상태를 변형하지 않는다', () => {
    const s = initPaceCoachState();
    const snapshot = {...s};
    decidePaceCoach(s, TARGET, TARGET + 60, 200, 1);
    expect(s).toEqual(snapshot);
  });
});
