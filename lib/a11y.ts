// ============================================================================
// lib/a11y.ts — 스크린리더 공지의 단일 소스
//
// 왜 필요한가(2026-08-04 UX 감사 ①):
//   `accessibilityLiveRegion` 은 **Android 전용 prop** 이다. iOS VoiceOver 는 이걸 보지
//   않으므로, 화면이 스스로 나타난 알림(배너·토스트)은 **명시적으로 announce 해야** 들린다.
//   ToastHost 는 이미 그렇게 하고 있었는데(P0 심사 #4), 러닝 중 화면의 배너 5종
//   (GPS 없음·GPS 약함·위치권한 회수·백업 실패·일시정지 중 이동)은 liveRegion 만 달고 있어
//   **iOS 에서 한 마디도 공지되지 않았다.** 위치권한 회수·백업 실패는 기록이 사라지는
//   경고라, 안 들리면 시각장애 러너는 아무것도 안 남는 러닝을 완주하게 된다.
//
// 계약(중요):
//   · 이 모듈은 **iOS 보완 전용**이다. Android 는 liveRegion 이 이미 읽어 주므로 중복 공지하지
//     않는다 — 그래서 호출부는 `accessibilityLiveRegion` 을 **떼지 말고 함께 유지**해야 한다.
//   · 실패는 삼킨다. 공지가 안 되는 것이 앱을 멈출 이유는 아니다.
// ============================================================================
import {useEffect, useRef} from 'react';
import {AccessibilityInfo, Platform} from 'react-native';

/**
 * 스크린리더에 한 문장을 공지한다(iOS 전용 — Android 는 liveRegion 이 담당).
 * 호출부의 `accessibilityLiveRegion` 을 대체하지 않고 **보완**한다.
 */
export function announceForA11y(message: string): void {
  if (Platform.OS !== 'ios') return;
  const msg = (message || '').trim();
  if (!msg) return;
  try {
    AccessibilityInfo.announceForAccessibility(msg);
  } catch {
    /* 공지 실패는 비치명 — 앱 흐름에 영향 없음 */
  }
}

/**
 * `active` 가 false→true 로 바뀌는 순간에만 1회 공지한다(상태 배너용).
 *
 * 조건이 유지되는 동안 반복 공지하지 않는 것이 핵심이다 — 배너는 "지금 이렇게 됐다"를
 * 알리는 것이지 상태를 계속 읊는 게 아니다. 조건이 풀렸다 다시 켜지면 다시 공지한다.
 * `message` 가 바뀌어도 재공지하지 않는다(같은 배너의 문구 미세 변화로 말이 끊기지 않게).
 */
export function useAnnounceOnEnter(active: boolean, message: string): void {
  const was = useRef(false);
  const msg = useRef(message);
  msg.current = message;
  useEffect(() => {
    if (active && !was.current) announceForA11y(msg.current);
    was.current = active;
  }, [active]);
}
