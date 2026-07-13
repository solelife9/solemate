// lib/haptics — 의미(semantic) 햅틱 래퍼. iOS 는 Taptic Engine, 그 외는 Vibration 폴백.
//
// 설계 원칙(iron law):
//   1) 외부 네이티브 의존성 금지 — react-native-haptic-feedback 같은 패키지를 절대
//      설치하지 않는다. iOS 정밀 햅틱은 우리가 만든 얇은 네이티브 모듈(HapticModule,
//      Apple 내장 UIFeedbackGenerator 사용 — 외부 패키지 아님, 공급망·버전드리프트 0)을
//      쓰고, 그 외/미탑재 환경은 react-native 내장 Vibration 으로 폴백한다.
//   2) graceful no-op — 미지원 환경/네이티브 에러로 발동이 던져도 절대 위로 전파하지
//      않는다(햅틱 실패가 러닝 플로우를 깨면 안 된다).
//   3) settings 토글 존중 — 사용자가 햅틱을 끄면(setHapticsEnabled(false)) 모든 의미
//      메서드가 순수 no-op 이 된다. 앱은 설정 로드/변경 시 setHapticsEnabled 로 동기화.
//
// 왜 Taptic 인가(2026-07-13 사용자 확정): iOS 의 Vibration API 는 길이 값을 무시하고
// ~400ms 짜리 '강하고 긴 부르르'(구형 진동 모터)를 울린다 — 패턴을 겹치면 더 길어진다.
// 나이키/Apple 의 '짧고 가벼운 톡'은 Taptic Engine(UIFeedbackGenerator)만 낼 수 있다.
// 그래서 iOS 는 HapticModule.impact(.light 등)/notify 로 보내고, 세기는 '스타일'로 고른다.
//
// HAPTIC_PATTERN 은 Vibration 폴백(주로 Android — ms 를 존중)의 패턴이자 테스트 기준.
// iOS 경로의 세기는 아래 각 메서드의 impact 스타일이 결정한다.

import {Vibration, NativeModules, Platform} from 'react-native';

/** iOS Taptic 네이티브 모듈(있으면 우선). 안드로이드·미탑재면 null → Vibration 폴백. */
const Taptic: any = Platform.OS === 'ios' ? NativeModules?.HapticModule : null;

/** Vibration 폴백 패턴(단일 ms 또는 [대기,진동,…]). iOS 는 Taptic 이 우선하므로 폴백용. */
export const HAPTIC_PATTERN = {
  /** 가벼운 단발 탭. */
  tap: 8,
  /** 성공 — 짧은 두 번 펄스. */
  success: [0, 16, 45, 16],
  /** 경고 — 또렷한 세 번 펄스(주의·되돌릴 수 없는 동작). success 보다 펄스 많음. */
  warning: [0, 20, 45, 20, 45, 20],
  /** 카운트다운 비트 — 각 박자에 짧은 단발. */
  countdownBeat: 16,
  /** 시작(GO) — 짧은 단발(구 200ms 부르르 폐기). */
  go: 45,
  /** 강한 임팩트 단발(기록 달성 등). */
  impactHeavy: 30,
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
 * 임팩트(단발 톡) 발동. iOS 는 Taptic(style: light|soft|medium|rigid|heavy)로 짧고
 * 가벼운 톡을, 그 외/미탑재는 Vibration(fallback ms)으로. off 면 건너뛰고, 네이티브
 * 에러는 삼킨다.
 */
function impact(style: string, fallback: number | number[]): void {
  if (!_enabled) return;
  if (Taptic?.impact) {
    try {
      Taptic.impact(style);
      return;
    } catch {
      /* 네이티브 실패 → Vibration 폴백으로 내려간다 */
    }
  }
  try {
    Vibration.vibrate(fallback);
  } catch {
    /* 미지원/네이티브 실패는 무시 — 햅틱은 부가기능이라 graceful no-op */
  }
}

/** 알림(성공/경고/오류) 발동. iOS 는 Taptic 알림 패턴(모터 아님), 그 외는 Vibration. */
function notify(type: string, fallback: number | number[]): void {
  if (!_enabled) return;
  if (Taptic?.notify) {
    try {
      Taptic.notify(type);
      return;
    } catch {
      /* 폴백 */
    }
  }
  try {
    Vibration.vibrate(fallback);
  } catch {
    /* graceful no-op */
  }
}

/** 단발 탭(일반 상호작용) — 또렷한 톡(나이키/애플급 체감: light 는 약해서 medium). */
export function tap(): void {
  impact('medium', HAPTIC_PATTERN.tap);
}

/** 성공 피드백(완료·저장) — Taptic 성공 알림. */
export function success(): void {
  notify('success', [...HAPTIC_PATTERN.success]);
}

/** 경고 피드백(주의·되돌릴 수 없는 동작) — Taptic 경고 알림. */
export function warning(): void {
  notify('warning', [...HAPTIC_PATTERN.warning]);
}

/** 카운트다운 박자(3·2·1) — 또렷한 톡(달리기 직전 확실히 느껴지게). */
export function countdownBeat(): void {
  impact('medium', HAPTIC_PATTERN.countdownBeat);
}

/** 시작(GO) — 묵직한 단발 톡(출발의 무게). */
export function go(): void {
  impact('heavy', HAPTIC_PATTERN.go);
}

/** 강한 임팩트 단발(목표 달성 등) — 묵직하지만 짧은 톡. */
export function impactHeavy(): void {
  impact('heavy', HAPTIC_PATTERN.impactHeavy);
}
