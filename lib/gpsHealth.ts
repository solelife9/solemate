// ─── GPS 死구간(dead-zone) 감지 ──────────────────────────────────
// 순수 판정 로직: 마지막으로 GPS fix를 '수신'한 시각(lastFixMs)과 현재 시각(nowMs)
// 만으로 신호가 두절됐는지 결정한다. 거리 누적은 acceptSegment 게이트가 거르지만,
// fix 자체가 끊기면 거리는 그대로인데 경과 시간만 늘어 페이스가 왜곡된다(audit#9).
// 이 함수로 死구간을 감지해 App이 한국어 배너로 사용자에게 알린다.
//
// 입력은 시각 두 개뿐이라 시계/타이머와 무관하게 단위테스트가 가능하다. now-Date를
// 주입하는 호출부(App의 1초 틱)가 시간 진행을 담당한다.

import {GPS_STALL_THRESHOLD_MS} from './engineConstants';

export {GPS_STALL_THRESHOLD_MS};

export interface GpsStallStatus {
  /** 마지막 수신 이후 임계값 이상 새 fix가 없으면 true. */
  stalled: boolean;
  /** 마지막 수신 이후 경과(ms). fix가 아직 없으면 0. 음수(시계 역행)는 0으로 막는다. */
  silentMs: number;
}

/**
 * GPS 死구간 여부를 판정한다(순수함수).
 *
 * @param lastFixMs 마지막으로 fix를 수신한 시각(ms epoch). 0 이하이면 아직 한 번도
 *                  수신하지 않은 것(워밍업/신호 탐색 중)으로 보아 死구간이 아니다 —
 *                  이 상태는 별도의 'GPS 신호 찾는 중' 표시가 담당한다.
 * @param nowMs     현재 시각(ms epoch).
 * @param thresholdMs 死구간으로 간주할 무신호 지속 시간(ms). 기본값은 엔진 상수.
 *
 * 경계: 무신호 경과가 정확히 임계값이면 stalled(>=). 시계 역행(now<lastFix)은
 * silentMs를 0으로 클램프해 거짓 死구간을 만들지 않는다.
 */
export function gpsStallStatus(
  lastFixMs: number,
  nowMs: number,
  thresholdMs: number = GPS_STALL_THRESHOLD_MS,
): GpsStallStatus {
  if (!(lastFixMs > 0)) return {stalled: false, silentMs: 0};
  const silentMs = Math.max(0, nowMs - lastFixMs);
  return {stalled: silentMs >= thresholdMs, silentMs};
}
