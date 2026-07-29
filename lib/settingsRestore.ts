// ============================================================================
// lib/settingsRestore.ts — 백업/클라우드 병합 결과에서 '되돌릴 설정'을 고른다(순수)
// ----------------------------------------------------------------------------
// LWW(last-write-wins) 클로버 가드가 이 파일의 존재 이유다(2026-07-16 버그).
// 과거엔 병합 결과의 설정을 무조건 되돌려서, 동기 왕복(await) 중에 사용자가 바꾼 단위가
// stale 스냅샷으로 원위치되는 일이 있었다. 그래서:
//   · 병합 결과의 updated_at 이 현재보다 오래됐으면 **설정 블록 전체를 건너뛴다.**
//   · 명시적 가져오기(사용자가 '백업으로 교체'를 고른 경우)는 가드 없이 적용하고,
//     수정 시각을 지금으로 올려 이후 동기에서 이기게 한다.
//
// 값 검증도 여기 모은다 — 타입이 안 맞거나 범위를 벗어난 값은 **버린다**(그 필드만).
// 백업 파일은 사람이 편집할 수 있고, 다른 버전의 앱이 쓴 것일 수도 있다.
//
// 저장/상태 반영은 호출부가 한다. 이 파일은 '무엇을 되돌릴지'만 정한다.
// ============================================================================

import {AlertSettings, Sex, clampGoal, clampWeight, clampAge, clampRestHR} from './settings';
import {Unit} from './units';

/** 되돌릴 설정 — 있는 필드만 담긴다(없으면 그 설정은 건드리지 않는다). */
export interface RestorableSettings {
  unit?: Unit;
  goalWeeklyKm?: number;
  alerts?: AlertSettings;
  weightKg?: number;
  age?: number;
  sex?: Sex;
  restHR?: number;
}

/** 병합 결과의 설정 수정 시각(없거나 이상하면 0). */
export function settingsTsOf(raw: unknown): number {
  const v = Number((raw as any)?.updated_at);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * 설정을 되돌려도 되는가.
 *
 * force(명시적 가져오기)면 항상 true. 아니면 병합 결과가 현재보다 **오래되지 않았을 때만**
 * 적용한다 — 같은 시각(>=)은 적용한다(동기 직후 같은 스냅샷을 되돌리는 것은 무해하다).
 */
export function shouldApplySettings(mergedTs: number, currentTs: number, force: boolean): boolean {
  return force || mergedTs >= currentTs;
}

/**
 * 병합 결과에서 유효한 설정만 골라낸다.
 *
 * @param st         병합 결과의 settings 조각(신뢰하지 않는 입력)
 * @param current    현재 알림 설정 — 부분 알림 객체가 왔을 때 빠진 필드를 메운다.
 */
export function pickRestorableSettings(st: any, current: {alerts: AlertSettings}): RestorableSettings {
  const out: RestorableSettings = {};
  const s = st || {};

  if (s.unit === 'km' || s.unit === 'mi') out.unit = s.unit;
  if (typeof s.goal_weekly_km === 'number') out.goalWeeklyKm = clampGoal(s.goal_weekly_km);
  if (s.alerts && typeof s.alerts === 'object') {
    // 부분 객체가 와도 나머지는 현재 값을 유지한다(백업이 알림을 통째로 꺼버리지 않게).
    const enabled = typeof s.alerts.enabled === 'boolean' ? s.alerts.enabled : current.alerts.enabled;
    const th = Number(s.alerts.thresholdPct);
    out.alerts = {enabled, thresholdPct: Number.isFinite(th) ? th : current.alerts.thresholdPct};
  }
  // 체중·나이·안정시심박은 0/음수를 '미설정'으로 다룬다 — 0 을 저장하면 내구도·심박존
  // 계산이 통째로 어긋난다.
  if (typeof s.weight_kg === 'number' && s.weight_kg > 0) out.weightKg = clampWeight(s.weight_kg);
  if (typeof s.age === 'number' && s.age > 0) out.age = clampAge(s.age);
  if (s.sex === 'male' || s.sex === 'female') out.sex = s.sex;
  if (typeof s.rest_hr === 'number' && s.rest_hr > 0) out.restHR = clampRestHR(s.rest_hr);

  return out;
}

/**
 * 적용 후 기록할 설정 수정 시각.
 * 명시적 가져오기는 '지금'(이후 동기에서 이긴다), 동기 병합은 둘 중 큰 값.
 */
export function nextSettingsTs(
  force: boolean,
  mergedTs: number,
  currentTs: number,
  nowMs: number,
): number {
  return force ? nowMs : Math.max(mergedTs, currentTs);
}
