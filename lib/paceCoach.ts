// ─── 스피드(목표 페이스) 코칭 결정 로직 (순수) ────────────────────────────────
// 스피드 모드에서 구간별 목표 페이스 대비 현재 페이스를 보고 "조금 빨라요 / 좋아요 /
// 조금 느려요"를 말한다. 판정만 하고 재생·화면은 컨테이너(RunEngine)가 맡는다.
// lib/zoneCoach 와 같은 결의 순수 상태기(입력 불변, throw 금지, 매 틱 새 state 반환).
//
// ── 왜 분리했나(2026-07-27) ─────────────────────────────────────────────────
// 이 판정은 RunEngine 의 틱 핸들러 안에 인라인으로 박혀 있었다. 테스트가 **한 건도**
// 없었고 임계값이 매직넘버였다. 러닝 중 귀에 대고 말하는 기능인데 검증 수단이 없었다.
//
// ── 옮기면서 고친 것 ────────────────────────────────────────────────────────
// ① **지속 게이트가 없었다.** 한 틱만 튀어도 즉시 음성이 나갔다. GPS 롤링 페이스는
//    신호대기·언덕·터널에서 순간적으로 크게 흔들린다. 같은 저장소의 zoneCoach 는
//    "과알림이 코칭이 아니라 소음이 된다"며 15s 지속을 요구하는데, 정작 페이스 코칭엔
//    그 보호가 없었다. 같은 원칙을 적용한다(PACE_OFF_SUSTAIN_S).
// ② **버퍼가 절대 초(8s) 고정이었다.** 3:30/km 러너에게 8초는 3.8% 오차, 7:00/km
//    러너에게는 1.9% 다 — 느린 러너일수록 더 자주 지적받는 구조인데, 페이스 변동은
//    보통 느린 러너 쪽이 크다. 방향이 거꾸로다. 목표 페이스에 **비례**하는 버퍼로 바꾸고
//    (3%) 절대 하한·상한을 둔다. 4:30/km(=270s) 에서 8.1s 라 기존 감각과 거의 같다.
// ③ **워밍업 가드가 20s 였다.** 첫 GPS 롤링 페이스는 그보다 오래 불안정하다 → 45s.
//
// 그대로 둔 것: 'on'(적정)은 이탈에서 막 복귀했을 때만 1회 말한다 — 잘하고 있을 때의
// 침묵이 칭찬이라는 기존 판단은 옳다(zoneCoach 와 동일 철학).

import {
  PACE_COACH_WARMUP_S,
  PACE_COACH_MIN_GAP_S,
  PACE_OFF_SUSTAIN_S,
  PACE_BUFFER_RATIO,
  PACE_BUFFER_MIN_S,
  PACE_BUFFER_MAX_S,
} from './engineConstants';

/** 이 틱의 판정 상태. 'on'=목표 범위 안. */
export type PaceState = 'fast' | 'slow' | 'on';

export interface PaceCoachState {
  /** 마지막으로 알린 상태(잡담 방지 — 같은 말 반복 억제). null=아직 알린 적 없음. */
  lastAnnounced: PaceState | null;
  /** 마지막 알림 시각(경과초). */
  lastAnnouncedAtS: number;
  /** 현재 이탈 방향이 지속된 시간(초). 방향이 바뀌거나 복귀하면 0. */
  heldSec: number;
  /** 현재 지속 중인 이탈 방향. null=범위 안. */
  heldDir: 'fast' | 'slow' | null;
}

export interface PaceCoachDecision {
  state: PaceCoachState;
  /** 이 틱에 말할 내용. null=침묵. */
  announce: PaceState | null;
  /** 화면 표시용 현재 판정(알림과 무관하게 즉시 반영). null=판정 불가(표본 부족 등). */
  status: PaceState | null;
}

export function initPaceCoachState(): PaceCoachState {
  return {lastAnnounced: null, lastAnnouncedAtS: -Infinity, heldSec: 0, heldDir: null};
}

/**
 * 목표 페이스에 비례하는 허용 버퍼(초). 느린 목표일수록 넓다.
 * 절대 하한·상한으로 극단(초고속·초저속 목표)에서 튀지 않게 막는다.
 */
export function paceBufferSec(targetSec: number): number {
  const t = Number(targetSec);
  if (!Number.isFinite(t) || t <= 0) return PACE_BUFFER_MIN_S;
  return Math.min(PACE_BUFFER_MAX_S, Math.max(PACE_BUFFER_MIN_S, t * PACE_BUFFER_RATIO));
}

/**
 * 한 틱 전진.
 *
 * @param state    직전 상태
 * @param targetSec 현재 구간 목표 페이스(초/km). null=목표 없음(코칭 비활성)
 * @param currentSec 현재(롤링) 페이스(초/km). null=표본 부족
 * @param elapsedS  러닝 경과초(워밍업·간격 판정 기준)
 * @param dtSec     직전 틱 이후 경과초
 */
export function decidePaceCoach(
  state: PaceCoachState,
  targetSec: number | null,
  currentSec: number | null,
  elapsedS: number,
  dtSec: number,
): PaceCoachDecision {
  const dt = Number.isFinite(dtSec) && dtSec > 0 ? dtSec : 0;

  // 목표가 없거나 페이스 표본이 없으면 판정 자체를 하지 않는다(상태 유지 — 잠깐 신호가
  // 끊겼다고 지속 카운터를 날리면 언덕 구간에서 영영 알리지 못한다).
  if (targetSec == null || currentSec == null || !(targetSec > 0) || !(currentSec > 0)) {
    return {state, announce: null, status: null};
  }

  const buf = paceBufferSec(targetSec);
  // 페이스는 '작을수록 빠르다'(초/km).
  const status: PaceState =
    currentSec <= targetSec - buf ? 'fast' : currentSec >= targetSec + buf ? 'slow' : 'on';

  // ── 범위 안으로 복귀 ──────────────────────────────────────────────────────
  if (status === 'on') {
    const wasOff = state.lastAnnounced === 'fast' || state.lastAnnounced === 'slow';
    const next: PaceCoachState = {...state, heldSec: 0, heldDir: null};
    // 이탈을 알린 적이 있을 때만 '좋아요'로 닫아준다(잘하고 있을 땐 침묵이 칭찬).
    if (wasOff && elapsedS - state.lastAnnouncedAtS >= PACE_COACH_MIN_GAP_S) {
      return {
        state: {...next, lastAnnounced: 'on', lastAnnouncedAtS: elapsedS},
        announce: 'on',
        status,
      };
    }
    return {state: next, announce: null, status};
  }

  // ── 이탈 지속 누적 ───────────────────────────────────────────────────────
  const sameDir = state.heldDir === status;
  const heldSec = (sameDir ? state.heldSec : 0) + dt;
  const next: PaceCoachState = {...state, heldSec, heldDir: status};

  // 워밍업 중이거나(초반 롤링 페이스는 신뢰할 수 없다) 지속이 짧으면 아직 말하지 않는다.
  if (elapsedS < PACE_COACH_WARMUP_S || heldSec < PACE_OFF_SUSTAIN_S) {
    return {state: next, announce: null, status};
  }
  // 같은 말을 너무 자주 하지 않는다.
  if (elapsedS - state.lastAnnouncedAtS < PACE_COACH_MIN_GAP_S) {
    return {state: next, announce: null, status};
  }

  return {
    state: {...next, lastAnnounced: status, lastAnnouncedAtS: elapsedS},
    announce: status,
    status,
  };
}
