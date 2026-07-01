// 앱 설정(거리 단위 · 주간 목표 · 신발 교체 알림) 영속 + 순수 파서.
//
// 저장 표준은 언제나 km. 단위(unit)는 '표시'에만 영향을 주고, 저장값·알림 임계
// 계산은 항상 km 절대값을 쓴다(=> lib/units). 손상/누락된 영속값이 화면을 깨지
// 않도록 모든 파서는 잘못된 값을 기본값으로 정규화한다(iron law: 데이터 안전).
//
// AsyncStorage 키:
//   settings_unit    'km' | 'mi'
//   goal_weekly_km   number  (주간 목표 거리, km 표준)
//   settings_alerts  JSON    {enabled:boolean, thresholdPct:number}

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Unit} from './units';

export type {Unit};

export interface AlertSettings {
  /** 신발 교체 알림 on/off */
  enabled: boolean;
  /** 교체 알림 임계값(신발 수명 사용률 %). 이 비율 이상이면 알림. */
  thresholdPct: number;
}

export type Sex = 'male' | 'female';

export interface AppSettings {
  unit: Unit;
  /** 주간 목표 거리(km, 저장 표준) */
  goalWeeklyKm: number;
  alerts: AlertSettings;
  /** 체중(kg) — 러닝 칼로리 추정에 쓴다(가이드, 정밀치 아님). */
  weightKg: number;
  /** 나이(년) — 심박존 최대심박 추정(Tanaka)에 쓴다. 0 = 미설정(190 폴백). */
  age: number;
  /** 성별 — TRIMP(트레이닝 부하) 계수에 쓴다. 기본 male. */
  sex: Sex;
  /** 안정시심박(bpm) — 심박존 Karvonen(여유심박)·TRIMP 정밀화. 0 = 미설정(%HRmax 폴백). */
  restHR: number;
}

export const K_UNIT = 'settings_unit';
export const K_GOAL = 'goal_weekly_km';
export const K_ALERTS = 'settings_alerts';
export const K_WEIGHT = 'body_weight_kg';
export const K_AGE = 'body_age';
export const K_SEX = 'body_sex';
export const K_REST_HR = 'body_rest_hr';

// 임계값 허용 범위(수명 사용률 %). 너무 낮으면 상시 알림, 100 초과는 무의미.
export const MIN_THRESHOLD_PCT = 50;
export const MAX_THRESHOLD_PCT = 100;
export const THRESHOLD_STEP = 5;

// 주간 목표 허용 하한/상한(km, 저장 표준)과 표시 단위 스텝.
export const MIN_GOAL_KM = 1;
export const MAX_GOAL_KM = 500;
export const GOAL_STEP_DISPLAY = 5;

// 체중 허용 범위(kg)와 스텝. 칼로리 추정용 가이드 값.
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 200;
export const WEIGHT_STEP = 1;
export const DEFAULT_WEIGHT_KG = 65;

// 나이·안정시심박 허용 범위(심박존용). 0 = 미설정으로 취급(폴백).
export const MIN_AGE = 10;
export const MAX_AGE = 100;
export const AGE_STEP = 1;
export const MIN_REST_HR = 30;
export const MAX_REST_HR = 110;
export const REST_HR_STEP = 1;

export const DEFAULT_ALERTS: AlertSettings = {enabled: true, thresholdPct: 90};
export const DEFAULT_SETTINGS: AppSettings = {
  unit: 'km',
  goalWeeklyKm: 30,
  alerts: {...DEFAULT_ALERTS},
  weightKg: DEFAULT_WEIGHT_KG,
  age: 0,
  sex: 'male',
  restHR: 0,
};

/** 영속된 단위 문자열 → Unit. 'mi'만 mi, 그 외(누락/손상 포함)는 km. */
export function parseUnit(raw: string | null | undefined): Unit {
  return raw === 'mi' ? 'mi' : 'km';
}

/** 영속된 목표 문자열 → 양수 km. 비정상값은 기본값. */
export function parseGoal(raw: string | null | undefined): number {
  const v = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_SETTINGS.goalWeeklyKm;
  return clampGoal(v);
}

/** 목표 거리를 허용 범위(km)로 클램프 + 정수 반올림. */
export function clampGoal(km: number): number {
  if (!Number.isFinite(km)) return DEFAULT_SETTINGS.goalWeeklyKm;
  return Math.max(MIN_GOAL_KM, Math.min(MAX_GOAL_KM, Math.round(km)));
}

/** 체중을 허용 범위(kg)로 클램프 + 정수 반올림. */
export function clampWeight(kg: number): number {
  if (!Number.isFinite(kg)) return DEFAULT_WEIGHT_KG;
  return Math.max(MIN_WEIGHT_KG, Math.min(MAX_WEIGHT_KG, Math.round(kg)));
}

/** 영속된 체중 문자열 → 양수 kg. 비정상값은 기본값. */
export function parseWeight(raw: string | null | undefined): number {
  const v = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_WEIGHT_KG;
  return clampWeight(v);
}

/** 나이를 허용 범위로 클램프 + 정수. 범위 밖/비정상은 0(미설정). */
export function clampAge(age: number): number {
  if (!Number.isFinite(age) || age <= 0) return 0;
  return Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(age)));
}

/** 영속된 나이 → 정수(미설정 0). */
export function parseAge(raw: string | null | undefined): number {
  const v = raw != null ? Number(raw) : NaN;
  return clampAge(v);
}

/** 영속된 성별 → Sex. 'female'만 female, 그 외(누락/손상)는 male. */
export function parseSex(raw: string | null | undefined): Sex {
  return raw === 'female' ? 'female' : 'male';
}

/** 안정시심박을 허용 범위로 클램프 + 정수. 범위 밖/비정상은 0(미설정). */
export function clampRestHR(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  return Math.max(MIN_REST_HR, Math.min(MAX_REST_HR, Math.round(bpm)));
}

/** 영속된 안정시심박 → 정수(미설정 0). */
export function parseRestHR(raw: string | null | undefined): number {
  const v = raw != null ? Number(raw) : NaN;
  return clampRestHR(v);
}

/** 알림 임계값을 허용 범위(%)로 클램프 + 정수 반올림. */
export function clampThreshold(pct: number): number {
  if (!Number.isFinite(pct)) return DEFAULT_ALERTS.thresholdPct;
  return Math.max(MIN_THRESHOLD_PCT, Math.min(MAX_THRESHOLD_PCT, Math.round(pct)));
}

/** 영속된 알림 JSON → AlertSettings. 손상/누락은 기본값으로 정규화. */
export function parseAlerts(raw: string | null | undefined): AlertSettings {
  if (!raw) return {...DEFAULT_ALERTS};
  try {
    const o = JSON.parse(raw);
    return {
      enabled: typeof o?.enabled === 'boolean' ? o.enabled : DEFAULT_ALERTS.enabled,
      thresholdPct: clampThreshold(Number(o?.thresholdPct)),
    };
  } catch {
    return {...DEFAULT_ALERTS};
  }
}

/** 세 키를 한 번에 읽어 정규화된 설정으로 반환. 실패해도 기본값으로 폴백. */
export async function loadSettings(): Promise<AppSettings> {
  try {
    const [u, g, a, w, ag, sx, rh] = await Promise.all([
      AsyncStorage.getItem(K_UNIT),
      AsyncStorage.getItem(K_GOAL),
      AsyncStorage.getItem(K_ALERTS),
      AsyncStorage.getItem(K_WEIGHT),
      AsyncStorage.getItem(K_AGE),
      AsyncStorage.getItem(K_SEX),
      AsyncStorage.getItem(K_REST_HR),
    ]);
    return {
      unit: parseUnit(u), goalWeeklyKm: parseGoal(g), alerts: parseAlerts(a), weightKg: parseWeight(w),
      age: parseAge(ag), sex: parseSex(sx), restHR: parseRestHR(rh),
    };
  } catch {
    return {...DEFAULT_SETTINGS, alerts: {...DEFAULT_ALERTS}};
  }
}

export async function saveAge(age: number): Promise<void> {
  try { await AsyncStorage.setItem(K_AGE, String(clampAge(age))); } catch { /* 삼킴 */ }
}

export async function saveSex(sex: Sex): Promise<void> {
  try { await AsyncStorage.setItem(K_SEX, sex === 'female' ? 'female' : 'male'); } catch { /* 삼킴 */ }
}

export async function saveRestHR(bpm: number): Promise<void> {
  try { await AsyncStorage.setItem(K_REST_HR, String(clampRestHR(bpm))); } catch { /* 삼킴 */ }
}

export async function saveWeight(weightKg: number): Promise<void> {
  try {
    await AsyncStorage.setItem(K_WEIGHT, String(clampWeight(weightKg)));
  } catch {
    /* 영속 실패는 삼킨다 */
  }
}

export async function saveUnit(unit: Unit): Promise<void> {
  try {
    await AsyncStorage.setItem(K_UNIT, unit);
  } catch {
    /* 영속 실패는 삼킨다(메모리 상태는 유지) */
  }
}

export async function saveGoal(goalWeeklyKm: number): Promise<void> {
  try {
    await AsyncStorage.setItem(K_GOAL, String(clampGoal(goalWeeklyKm)));
  } catch {
    /* 영속 실패는 삼킨다 */
  }
}

export async function saveAlerts(alerts: AlertSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(
      K_ALERTS,
      JSON.stringify({enabled: !!alerts.enabled, thresholdPct: clampThreshold(alerts.thresholdPct)}),
    );
  } catch {
    /* 영속 실패는 삼킨다 */
  }
}
