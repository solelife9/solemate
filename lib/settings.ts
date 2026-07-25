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

// ── 음성 코칭 설정(2026-07-12, 탑티어 패리티 #14) ────────────────────────────
// NRC/Strava/가민의 오디오 큐 설정성에 대응: 주기(0.5/1/2km/끄기), 항목(페이스·
// 경과시간), 페이스 기준(구간/평균), 볼륨 3단. 저장 키 하나(JSON) — 손상 시 기본값.
export type VoiceIntervalKm = 0 | 0.5 | 1 | 2;
export type PaceBasis = 'split' | 'avg';

export interface VoiceSettings {
  /** 음성 코칭 전체 on/off (시작/일시정지/목표 등 이벤트 멘트 포함). */
  enabled: boolean;
  /** 거리 안내 주기(km). 0 = 거리 안내 끄기(이벤트 멘트는 유지). */
  intervalKm: VoiceIntervalKm;
  /** 거리 안내에 페이스 포함 여부. */
  paceCue: boolean;
  /** 페이스 기준 — 직전 구간(split) 또는 전체 평균(avg). */
  paceBasis: PaceBasis;
  /** 거리 안내에 총 경과 시간 포함 여부(NRC 스타일). */
  timeCue: boolean;
  /** 재생 볼륨(0~1). 3단 프리셋(0.7/0.85/1.0)만 UI 로 노출. */
  volume: number;
}

export const K_VOICE = 'settings_voice';
export const VOICE_VOLUME_STEPS = [0.7, 0.85, 1.0] as const;
export const DEFAULT_VOICE: VoiceSettings = {
  enabled: true,
  intervalKm: 1,
  paceCue: true,
  paceBasis: 'split',
  timeCue: true,
  volume: 1.0,
};

/** 영속 JSON → VoiceSettings. 손상/누락/이상값은 필드 단위로 기본값 정규화. */
export function parseVoiceSettings(raw: string | null | undefined): VoiceSettings {
  const d = {...DEFAULT_VOICE};
  if (!raw) return d;
  try {
    const v = JSON.parse(raw);
    if (typeof v !== 'object' || v == null) return d;
    if (typeof v.enabled === 'boolean') d.enabled = v.enabled;
    if (v.intervalKm === 0 || v.intervalKm === 0.5 || v.intervalKm === 1 || v.intervalKm === 2) d.intervalKm = v.intervalKm;
    if (typeof v.paceCue === 'boolean') d.paceCue = v.paceCue;
    if (v.paceBasis === 'split' || v.paceBasis === 'avg') d.paceBasis = v.paceBasis;
    if (typeof v.timeCue === 'boolean') d.timeCue = v.timeCue;
    if (typeof v.volume === 'number' && v.volume >= 0.1 && v.volume <= 1) d.volume = v.volume;
    return d;
  } catch {
    return d;
  }
}

export async function loadVoiceSettings(): Promise<VoiceSettings> {
  try {
    return parseVoiceSettings(await AsyncStorage.getItem(K_VOICE));
  } catch {
    return {...DEFAULT_VOICE};
  }
}

export async function saveVoiceSettings(v: VoiceSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(K_VOICE, JSON.stringify(v));
  } catch {
    /* 저장 실패는 비치명적 — 다음 변경에서 재시도 */
  }
}

// ── 심박존 가이드(#7) — 목표 존(2~4). 0=끄기. 거리/시간 목표와 직교로 조합. ──
// 목표 화면의 '심박 가이드' 행이 설정한다. 런 시작 시 로드해 이탈 코칭에 쓴다.
export const K_TARGET_ZONE = 'settings_target_zone';
export type TargetZone = 0 | 2 | 3 | 4;
export const DEFAULT_TARGET_ZONE: TargetZone = 0;

/** 영속 문자열 → 목표 존. '2'/'3'/'4'만 유효, 그 외(끄기/손상)는 0. */
export function parseTargetZone(raw: string | null | undefined): TargetZone {
  return raw === '2' || raw === '3' || raw === '4' ? (Number(raw) as TargetZone) : 0;
}

export async function loadTargetZone(): Promise<TargetZone> {
  try {
    return parseTargetZone(await AsyncStorage.getItem(K_TARGET_ZONE));
  } catch {
    return DEFAULT_TARGET_ZONE;
  }
}

export async function saveTargetZone(z: TargetZone): Promise<void> {
  try {
    await AsyncStorage.setItem(K_TARGET_ZONE, String(z));
  } catch {
    /* 비치명적 */
  }
}

// ── 자동 일시정지 설정(#16, 가민/NRC 패리티) — 트레드밀·언덕 반복 러너는 끈다. ──
export const K_AUTOPAUSE = 'settings_autopause';
export const DEFAULT_AUTOPAUSE = true;

/** 영속 문자열 → 자동 일시정지 on/off. '0'/'false' 만 끔, 그 외(누락/손상)는 기본 ON. */
export function parseAutoPause(raw: string | null | undefined): boolean {
  if (raw === '0' || raw === 'false') return false;
  return DEFAULT_AUTOPAUSE;
}

export async function loadAutoPause(): Promise<boolean> {
  try {
    return parseAutoPause(await AsyncStorage.getItem(K_AUTOPAUSE));
  } catch {
    return DEFAULT_AUTOPAUSE;
  }
}

export async function saveAutoPause(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(K_AUTOPAUSE, enabled ? '1' : '0');
  } catch {
    /* 저장 실패는 비치명적 */
  }
}

// ── 햅틱(진동) 설정 — 앱 전역 on/off. 화면 전환·버튼·존 이탈·워치 랩 진동을 한 번에. ──
// "화면 바뀔 때 진동이 거슬리는 사람"을 위한 단일 스위치(사용자 요청 2026-07-13).
// 폰 Vibration(lib/haptics)과 워치 햅틱(존 이탈·자동 랩)을 함께 지배한다 —
// 폰은 setHapticsEnabled 로, 워치는 applicationContext 의 hapticsOn 플래그로 전달.
export const K_HAPTICS = 'settings_haptics';
/** 설정 블록 최종 수정 시각(epoch ms) — 클라우드 동기 last-write-wins 판정용. 0=미수정. */
export const K_SETTINGS_TS = 'settings_updated_at';
export const DEFAULT_HAPTICS = true;

/** 영속 문자열 → 햅틱 on/off. '0'/'false' 만 끔, 그 외(누락/손상)는 기본 ON. */
export function parseHaptics(raw: string | null | undefined): boolean {
  if (raw === '0' || raw === 'false') return false;
  return DEFAULT_HAPTICS;
}

export async function loadHaptics(): Promise<boolean> {
  try {
    return parseHaptics(await AsyncStorage.getItem(K_HAPTICS));
  } catch {
    return DEFAULT_HAPTICS;
  }
}

export async function saveHaptics(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(K_HAPTICS, enabled ? '1' : '0');
  } catch {
    /* 저장 실패는 비치명적 */
  }
}

// ── 설정 수정 시각(동기 LWW) ─────────────────────────────────────────────────
// 설정 블록(단위·목표·알림·체중·나이·성별·안정시심박)이 이 기기에서 마지막으로 수정된
// 시각. 클라우드 병합(mergeCloudData)이 이 값으로 최신 편집 기기를 가려낸다 — 과거의
// local-무조건-우선 병합은 재설치 직후 기본값이 원격 설정을 덮어쓰는 유실 버그였다
// (2026-07-16 근본수정). 0 = 이 기기에서 한 번도 수정 안 함(원격이 있으면 원격이 이긴다).
export function parseSettingsUpdatedAt(raw: string | null | undefined): number {
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export async function loadSettingsUpdatedAt(): Promise<number> {
  try {
    return parseSettingsUpdatedAt(await AsyncStorage.getItem(K_SETTINGS_TS));
  } catch {
    return 0;
  }
}

export async function saveSettingsUpdatedAt(ms: number): Promise<void> {
  try {
    await AsyncStorage.setItem(K_SETTINGS_TS, String(Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0));
  } catch {
    /* 영속 실패는 삼킨다 */
  }
}

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

/** 영속된 목표 문자열 → 양수 km, 또는 0(목표 없음). 비정상값·누락은 기본값.
 *  0 은 사용자가 명시적으로 고른 '목표 없음'이라 그대로 살린다(홈 시트에서 선택 가능 —
 *  2026-07-25). 손상값(음수·NaN·빈 문자열)과는 구분해야 하므로 정확히 0 일 때만. */
export function parseGoal(raw: string | null | undefined): number {
  if (raw != null && raw.trim() !== '' && Number(raw) === 0) return 0;
  const v = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_SETTINGS.goalWeeklyKm;
  return clampGoal(v);
}

/** 목표 거리를 허용 범위(km)로 클램프 + 정수 반올림. 0 = 목표 없음(하한 예외). */
export function clampGoal(km: number): number {
  if (!Number.isFinite(km)) return DEFAULT_SETTINGS.goalWeeklyKm;
  if (km <= 0) return 0;
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
