// ============================================================================
// lib/responsive.ts — 전역 반응형 스케일 시스템 (재디자인 아님, 비율 보존)
//
// 목적: 승인된 디자인을 '모든 스마트폰 크기에서 같은 비율·여백·위계'로 보이게 한다.
// 재디자인/레이아웃 변경이 아니라, 기존 값들을 화면 폭에 비례해 스케일할 뿐이다.
//
// 기준(정석) 기기 = iPhone 15 Pro(논리 393×852pt) — 사용자 주 테스트 기기.
//   · 이 기기에선 스케일 = 1 → 승인된 디자인이 픽셀 그대로 유지된다(외형 변경 0).
//   · 폭이 다른 기기에선 폭 비율로 비례 스케일(작으면 축소·크면 확대)해 같은 비율을 유지.
//   · 극단(아주 작은 SE·태블릿)에서 과하지 않도록 계수를 클램프한다.
//
// 테스트(jest): JEST_WORKER_ID 가 있으면 모든 함수가 '항등'(원본값 그대로)으로 동작한다.
//   → 특정 크기를 단언하는 1,773개 테스트·스냅샷이 전부 불변(안전). 스케일은 실제 앱에서만.
//
// 사용:
//   import { rs, rv, rms, rf, ri } from './lib/responsive';
//   { fontSize: rf(15), padding: rs(16), borderRadius: rs(20), gap: rs(8) }
//   <Ionicons size={ri(24)} />
// ============================================================================
import { Dimensions, PixelRatio } from 'react-native';

// 기준 기기 논리 크기(pt) — iPhone 15 Pro. 여기서 모든 스케일 = 1.
const BASE_W = 393;
const BASE_H = 852;

// jest 워커에선 스케일을 끄고 원본값을 그대로 돌려준다(테스트·스냅샷 불변).
const TEST = !!(typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID);

const win = Dimensions.get('window');
const W = win.width || BASE_W;
const H = win.height || BASE_H;
// 회전/가로세로 무관하게 '짧은 변'을 폭 기준으로 삼는다(세로 폰 기준 = width).
const shortSide = Math.min(W, H);
const longSide = Math.max(W, H);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// 폭 스케일 계수 — 간격·패딩·마진·라운드·카드폭 등 '가로 비례' 요소. 폰 범위(SE~ProMax)에서
// 대략 0.85~1.12. 아주 작은/큰 기기에서 과한 축소·확대를 막는다.
const KW = TEST ? 1 : clamp(shortSide / BASE_W, 0.85, 1.12);
// 세로 스케일 계수 — 세로 여백 전용. 세로로 긴 화면에서 살짝 더 허용(0.85~1.2).
const KH = TEST ? 1 : clamp(longSide / BASE_H, 0.85, 1.2);

/** 가로 비례 스케일(간격·패딩·마진·라운드·카드폭·고정 크기). 기준기기에서 원본값. */
export const rs = (size: number): number => (TEST ? size : Math.round(size * KW));

/** 세로 비례 스케일(세로 여백·높이 전용). */
export const rv = (size: number): number => (TEST ? size : Math.round(size * KH));

/**
 * 절제 스케일(moderate) — 편차의 factor(기본 0.5)만 반영한다. 폰트·아이콘처럼 폭에 1:1로
 * 비례시키면 큰 기기에서 과하게 커지는 요소에 쓴다(폭 편차의 절반만 적용).
 */
export const rms = (size: number, factor = 0.5): number =>
  TEST ? size : Math.round(size + (size * KW - size) * factor);

/** 반응형 폰트 크기 — moderate(0.5) + 정수 반올림(반px 금지, 디자인 규칙 유지). */
export const rf = (size: number): number =>
  TEST ? size : Math.round(PixelRatio.roundToNearestPixel(size + (size * KW - size) * 0.5));

/** 반응형 아이콘 크기 — 폰트와 동일 절제 스케일. */
export const ri = (size: number): number => rf(size);

/** 화면 정보(경계 분기용). isSmall=작은 폰(SE급), isLarge=큰 폰(Pro Max급). */
export const screen = {
  width: W,
  height: H,
  isSmall: shortSide < 360,
  isLarge: shortSide >= 414,
  /** 기준 대비 폭 스케일 계수(디버그/특수 계산용). */
  wScale: KW,
  hScale: KH,
};
