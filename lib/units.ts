// 거리 단위 변환 순수함수 (저장 표준은 항상 km)
// km↔mi 환산 계수 1mi = 1.60934km
//
// 표시(display)는 사용자 단위(km|mi)로 변환하되, 저장·경고 임계값 등
// 내부 로직은 언제나 km 절대값을 사용한다.

export type Unit = 'km' | 'mi';

export const KM_PER_MI = 1.60934;

/** km 값을 표시 단위로 변환. 'km'이면 그대로, 'mi'이면 1.60934로 나눈다. */
export function kmToDisplay(km: number, unit: Unit): number {
  return unit === 'mi' ? km / KM_PER_MI : km;
}

/** 표시 단위 값을 저장 표준 km로 되돌린다. 'mi'이면 1.60934를 곱한다. */
export function displayToKm(value: number, unit: Unit): number {
  return unit === 'mi' ? value * KM_PER_MI : value;
}

/** 표시 문자열: 소수 1자리 + 단위 라벨 (예: '5.0 km', '3.1 mi'). */
export function fmtDistance(km: number, unit: Unit): string {
  return `${kmToDisplay(km, unit).toFixed(1)} ${unit}`;
}

/** 단위의 한국어 표기 ('킬로미터' | '마일'). 설정 화면 detail 용. */
export function unitKorean(unit: Unit): string {
  return unit === 'mi' ? '마일' : '킬로미터';
}

/** km 값을 표시 단위로 환산 후 지정 소수 자리수로 반올림한 '숫자'를 반환.
 *  화면이 라벨('km'|'mi')은 따로 붙이고 숫자만 필요할 때 쓴다. km이면 항등. */
export function displayNum(km: number, unit: Unit, digits = 0): number {
  const p = Math.pow(10, digits);
  return Math.round(kmToDisplay(km, unit) * p) / p;
}
