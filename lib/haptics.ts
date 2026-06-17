// lib/haptics — React Native 내장 Vibration API 만 쓰는 의미(semantic) 햅틱 래퍼.
//
// 설계 원칙(iron law):
//   1) 새 네이티브 의존성 금지 — react-native-haptic-feedback 같은 패키지를 절대
//      설치하지 않는다. 오직 react-native 의 Vibration 만 사용한다. iOS 의 Vibration
//      은 패턴 길이를 무시하고 표준 진동을 울리므로 '의미'는 호출 시점으로 표현하고,
//      세기/패턴 차이는 Android 에서만 체감된다(그래도 둘 다 동작은 한다).
//   2) graceful no-op — 미지원 환경/네이티브 에러로 vibrate 가 던져도 절대 위로
//      전파하지 않는다(진동 실패가 러닝 플로우를 깨면 안 된다).
//   3) settings 토글 존중 — 사용자가 햅틱을 끄면(setHapticsEnabled(false)) 모든
//      의미 메서드가 Vibration 을 전혀 호출하지 않는 순수 no-op 이 된다. 앱은 설정
//      로드/변경 시 setHapticsEnabled 로 이 모듈 상태를 동기화한다.
//
// 패턴 표준: Android 배열 패턴은 [대기, 진동, 대기, 진동, …] 의미다(첫 값은 시작
// 전 대기). 단일 number 는 그 ms 만큼 한 번 진동. 아래 상수는 각 의미의 '느낌'을
// 고정하고 테스트가 정확히 단언할 수 있게 export 한다.

import {Vibration} from 'react-native';

/** 각 의미 햅틱의 Vibration 패턴(단일 ms 또는 [대기,진동,…] 배열). */
export const HAPTIC_PATTERN = {
  /** 가벼운 단발 탭 — 버튼/토글 등 일반 상호작용 피드백. */
  tap: 10,
  /** 성공 — 짧은 두 번 펄스(완료·저장 성공). */
  success: [0, 30, 80, 30],
  /** 경고 — 또렷한 세 번 펄스(주의·되돌릴 수 없는 동작). */
  warning: [0, 40, 80, 40, 80, 40],
  /** 카운트다운 비트 — 3·2·1 각 박자에 짧은 단발. */
  countdownBeat: 40,
  /** 시작(GO) — 카운트다운 종료, 강하게 한 번. */
  go: 200,
  /** 강한 임팩트 — 기록 달성 등 무게감 있는 단발. */
  impactHeavy: 90,
} as const;

// 모듈 내 토글 상태. 기본 on. 앱이 settings 의 햅틱 on/off 를 여기에 반영한다.
let _enabled = true;

/** 햅틱 전역 on/off 를 설정한다(settings 토글과 동기화). off 면 전부 no-op. */
export function setHapticsEnabled(enabled: boolean): void {
  _enabled = !!enabled;
}

/** 현재 햅틱 활성 여부. */
export function isHapticsEnabled(): boolean {
  return _enabled;
}

/**
 * 실제 진동 트리거. off 면 호출 자체를 건너뛰고(=Vibration 미호출), 네이티브 에러는
 * 삼켜서 절대 던지지 않는다. 모든 의미 메서드는 이 함수를 거친다.
 */
function fire(pattern: number | number[]): void {
  if (!_enabled) return;
  try {
    Vibration.vibrate(pattern);
  } catch {
    /* 미지원/네이티브 실패는 무시 — 햅틱은 부가기능이라 graceful no-op */
  }
}

/** 가벼운 단발 탭(일반 상호작용). */
export function tap(): void {
  fire(HAPTIC_PATTERN.tap);
}

/** 성공 피드백(짧은 두 번 펄스). */
export function success(): void {
  fire([...HAPTIC_PATTERN.success]);
}

/** 경고 피드백(또렷한 세 번 펄스). */
export function warning(): void {
  fire([...HAPTIC_PATTERN.warning]);
}

/** 카운트다운 박자(3·2·1 각 비트). */
export function countdownBeat(): void {
  fire(HAPTIC_PATTERN.countdownBeat);
}

/** 시작(GO) — 강한 단발. */
export function go(): void {
  fire(HAPTIC_PATTERN.go);
}

/** 강한 임팩트 단발(기록 달성 등). */
export function impactHeavy(): void {
  fire(HAPTIC_PATTERN.impactHeavy);
}
