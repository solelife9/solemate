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
