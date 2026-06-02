// ============================================================================
// lib/injury.ts — 부상예방 위험 등급 (Slice 4)
// 마모도(0..1)를 부상위험 등급/문구로 옮기는 단일 소스. shoeHealth(lib/shoe)의
// 마모율과 같은 분모(used/max)를 쓰되, 여기서는 0..1 비율을 입력으로 받아 등급을
// 판정한다. 임계는 shoeHealth tier(주의 75% · 교체 90%)와 정렬:
//   <0.75 safe · 0.75~0.9 caution · >0.9 high (입력은 0..1로 클램프).
// caution/high 는 keep-going 보이스의 한국어 안내 문구를, safe 는 빈 문구를 준다
// (안전 등급은 화면에서 경고를 노출하지 않는다).
// ============================================================================
export type InjuryLevel = 'safe' | 'caution' | 'high';

export interface InjuryAssessment {
  level: InjuryLevel;
  percentUsed: number; // 0..1 로 클램프된 입력(등급 판정에 쓰인 값)
  message: string;
}

// 임계(마모 비율). shoeHealth 의 SHOE_CAUTION_PCT(75)/SHOE_REPLACE_PCT(90) 와 정렬.
export const INJURY_CAUTION_AT = 0.75;
export const INJURY_HIGH_AT = 0.9;

// keep-going 보이스: 교체를 '손실'이 아니라 '부상 없이 계속 달리기'의 조건으로 프레이밍.
export const INJURY_HIGH_MSG = '이 신발 곧 교체하면 부상 없이 계속 달릴 수 있어요';
export const INJURY_CAUTION_MSG = '슬슬 다음 신발을 준비하면 부상 없이 계속 달릴 수 있어요';

/**
 * 마모 비율(percentUsed, 0..1)을 부상위험 등급으로 판정한다. 입력은 0..1 로 클램프
 * 하므로 경계 밖(음수/1 초과/NaN) 값도 안전하게 등급으로 떨어진다. 순수함수.
 *   · <0.75      → safe   (message '')
 *   · 0.75~0.9   → caution(keep-going 안내 문구)
 *   · >0.9       → high   (keep-going 안내 문구)
 */
export function assessInjuryRisk(percentUsed: number): InjuryAssessment {
  const p = Math.max(0, Math.min(1, Number.isFinite(percentUsed) ? percentUsed : 0));
  if (p > INJURY_HIGH_AT) {
    return {level: 'high', percentUsed: p, message: INJURY_HIGH_MSG};
  }
  if (p >= INJURY_CAUTION_AT) {
    return {level: 'caution', percentUsed: p, message: INJURY_CAUTION_MSG};
  }
  return {level: 'safe', percentUsed: p, message: ''};
}

/**
 * 신발(used/max)에서 직접 부상위험을 판정하는 편의 래퍼. 화면(Home 히어로·Shoes
 * 상세)이 shoeHealth 와 같은 마모 분모(used/max)로 등급을 얻도록 단일화한다.
 * max≤0 이면 마모율 0(safe)로 본다.
 */
export function assessShoeInjuryRisk(shoe: {used?: number; max?: number}): InjuryAssessment {
  const used = Number(shoe?.used) || 0;
  const max = Number(shoe?.max) || 0;
  const fraction = max > 0 ? used / max : 0;
  return assessInjuryRisk(fraction);
}
