// ─── 심박존 코칭 결정 로직 (순수) ─────────────────────────────────────────────
// 목표 존(targetZone, 2~4)을 정하고 달릴 때, 현재 심박존이 목표에서 벗어나면 코칭한다.
// 가민/폴라의 "존 알림"을 keego 문법으로 — 단, 과알림이 코칭이 아니라 소음이 되지 않게
// 강한 히스테리시스를 둔다(가민 사용자 불만 1위 회피):
//   · 이탈이 SUSTAIN_S(15s) 이상 지속돼야 처음 알린다 — 신호대기·언덕 순간 스파이크 무시.
//   · 같은 방향 이탈이 계속돼도 REPEAT_S(60s)에 한 번만 재알림 — 1분에 한 번 이하.
//   · 목표 존으로 복귀하면 조용히(화면만) — 잘하고 있을 땐 침묵이 칭찬.
//
// autoPause 와 같은 결(순수 상태기: 입력 불변, throw 금지, 매 틱 새 state 반환).
// 재생/화면은 컨테이너(App)가 이 결정을 받아 처리한다.

import {ZONE_DEVIATION_SUSTAIN_S, ZONE_DEVIATION_REPEAT_S} from './engineConstants';

export type ZoneDir = 'up' | 'down';

export interface ZoneCoachState {
  /** 현재 지속 중인 이탈 방향(목표보다 높으면 'down' 권유=낮춰라, 낮으면 'up'). null=존 안. */
  dir: ZoneDir | null;
  /** 현재 방향으로 이탈이 지속된 시간(초). */
  heldSec: number;
  /** 마지막 알림 이후 경과(초). 재알림 게이트. */
  sinceAnnounceSec: number;
  /** 이번 이탈 구간에서 한 번이라도 알렸는지(첫 알림 게이트). */
  announcedThisSpell: boolean;
}

export interface ZoneCoachDecision {
  state: ZoneCoachState;
  /** 이 틱에 음성 알림을 낼 방향. null=알림 없음. */
  announce: ZoneDir | null;
  /** 현재 이탈 방향(화면 표시용 — 알림과 무관하게 상태를 즉시 반영). null=존 안. */
  deviation: ZoneDir | null;
}

export function initZoneCoachState(): ZoneCoachState {
  return {dir: null, heldSec: 0, sinceAnnounceSec: 0, announcedThisSpell: false};
}

/**
 * 한 틱 전진. currentZone=현재 심박존(1~5, 0=미측정), targetZone=목표(2~4, 0=가이드 끄기),
 * dtSec=직전 틱 이후 경과초.
 *
 * 미측정(0)·가이드 꺼짐(0)이면 항상 무알림·상태 리셋(존 밖 판정 안 함).
 * currentZone < targetZone → 'up'(올려라), > targetZone → 'down'(낮춰라), == → 존 안(리셋).
 */
export function decideZoneCoach(
  state: ZoneCoachState,
  currentZone: number,
  targetZone: number,
  dtSec: number,
): ZoneCoachDecision {
  const dt = Number.isFinite(dtSec) && dtSec > 0 ? dtSec : 0;

  // 가이드 꺼짐 또는 심박 미측정 → 코칭 비활성(상태 초기화).
  if (!(targetZone >= 2 && targetZone <= 4) || !(currentZone >= 1 && currentZone <= 5)) {
    return {state: initZoneCoachState(), announce: null, deviation: null};
  }

  const dir: ZoneDir | null =
    currentZone > targetZone ? 'down' : currentZone < targetZone ? 'up' : null;

  // 존 안(복귀 포함) → 조용히 리셋. 화면 deviation 도 null.
  if (dir == null) {
    return {state: initZoneCoachState(), announce: null, deviation: null};
  }

  // 방향이 바뀌면(위→아래 등) 새 이탈 구간으로 리셋 후 이 틱부터 누적.
  const sameDir = state.dir === dir;
  const heldSec = (sameDir ? state.heldSec : 0) + dt;
  const sinceAnnounceSec = (sameDir ? state.sinceAnnounceSec : 0) + dt;
  const announcedThisSpell = sameDir ? state.announcedThisSpell : false;

  // 알림 판정: 첫 알림 = 지속 15s 도달. 재알림 = 알린 뒤 60s 경과.
  let announce: ZoneDir | null = null;
  if (!announcedThisSpell) {
    if (heldSec >= ZONE_DEVIATION_SUSTAIN_S) announce = dir;
  } else {
    if (sinceAnnounceSec >= ZONE_DEVIATION_REPEAT_S) announce = dir;
  }

  const next: ZoneCoachState = {
    dir,
    heldSec,
    sinceAnnounceSec: announce ? 0 : sinceAnnounceSec,
    announcedThisSpell: announcedThisSpell || announce != null,
  };
  return {state: next, announce, deviation: dir};
}
