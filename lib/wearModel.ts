// ─── 실효 마모 모델(Slice 6 차별점) ───────────────────────────────
// 신발의 "진짜" 마모를 휴리스틱으로 추정하는 순수 함수 모음. 네이티브 0·백엔드 0:
// 노면(surface)·체중만 로컬(AsyncStorage/기존 settings)에서 읽고, 마모 계산 자체는
// 입력만으로 결정되는 순수 파생값이다. 계수 근거는
// .tenet/knowledge/2026-06-03_research-shoe-wear-factors.md (휴리스틱, 정밀과학 아님).
//
// 원본 불변(A6-1): shoe.total_km · run.distance_km 는 읽기만 한다. 어떤 입력도
// 변경/마이그레이션하지 않으며 실효마모는 전부 파생값이다.
// 엣지 graceful(A6-2): 결측·0·음수·비유한 입력에서도 NaN/Infinity/음수를 절대
// 반환하지 않는다(모든 경로가 0 또는 양수 유한값으로 정규화).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {parseShoeName, type ShoeLike, type RunLike} from './shoe';
import {
  categoryLifespanKm,
  DEFAULT_LIFESPAN_KM,
  findShoeModel,
} from '../data/shoeModels';

// ─── 타입 ─────────────────────────────────────────────────────────
// 노면 종류. road 가 기준(factor 1.0)이며 미태그/미지원 값은 road 로 정규화된다.
export type Surface = 'road' | 'trail' | 'track' | 'treadmill';

// 마모 계산이 읽는 런 행. 기존 RunLike(shoe_id/km) 를 확장하되, 실효 마모는
// distance_km(거리)·duration_s(소요시간)에서 도출한다(원본 km 은 건드리지 않음).
export type WearRun = RunLike & {
  id?: string | number;
  distance_km?: number;
  duration_s?: number;
};

// 마모 계산이 읽는 신발 행. 기존 ShoeLike 를 확장. target_km(수명)·구매시점은
// 선택적이며 결측 시 모델명 파싱/기본값으로 graceful 폴백한다.
export type WearShoe = ShoeLike & {
  name?: string;
  target_km?: number;
  created_at?: string; // ISO 또는 YYYY-MM-DD
  purchase_date?: string; // YYYY-MM-DD
};

// ─── 계수(휴리스틱) ───────────────────────────────────────────────
// 노면 계수: 트레드밀(쿠션·균일) 완만, 트레일(바위·진흙) 가속. road 기준 1.0.
export const SURFACE_FACTOR: Record<Surface, number> = {
  treadmill: 0.85,
  track: 0.9,
  road: 1.0,
  trail: 1.15,
};

// 시간 기반 폼 열화: 미착용도 약 24개월에 수명 소진(target_km/24 per month).
export const AGE_WEAR_MONTHS = 24;

// 체중 보정 클램프 범위. 기준 러너 70kg → factor 1.0.
export const WEIGHT_FACTOR_REF_KG = 70;
export const WEIGHT_FACTOR_MIN = 0.8;
export const WEIGHT_FACTOR_MAX = 1.6;

// 평균 한 달 길이(일) — 개월수 환산용.
const DAYS_PER_MONTH = 30.4375;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SURFACE_VALUES: readonly Surface[] = ['road', 'trail', 'track', 'treadmill'];

// ─── 순수 계산 ─────────────────────────────────────────────────────

/**
 * 페이스(초/km) → 페이스 계수. 빠를수록 수직충격력↑(완만히).
 *   ≥300(easy/normal) → 1.0, 240–300(tempo) → 1.05, <240(race/interval) → 1.10.
 * 비유한/0/음수 페이스(거리·시간 결측 등)는 보정 없음(1.0).
 */
export function paceFactor(paceSecPerKm: number): number {
  if (!Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0) return 1.0;
  if (paceSecPerKm >= 300) return 1.0; // ≥360 및 300–360 동일
  if (paceSecPerKm >= 240) return 1.05;
  return 1.1;
}

/** 노면 문자열 → Surface. 미지원/결측은 기준 road 로 정규화. */
export function parseSurface(raw: string | null | undefined): Surface {
  return raw != null && (SURFACE_VALUES as readonly string[]).includes(raw)
    ? (raw as Surface)
    : 'road';
}

/**
 * 단일 런의 실효 마모(km) = distance_km × surfaceFactor × paceFactor.
 * surface 미지정/미지원 → road. pace 는 duration_s/distance_km 에서 도출하며
 * 결측·0·비유한이면 paceFactor 1.0. 거리 결측·0·음수·비유한 → 0(마모 없음).
 */
export function runEffectiveWear(run: WearRun, opts?: {surface?: Surface}): number {
  const distance = Number(run?.distance_km);
  if (!Number.isFinite(distance) || distance <= 0) return 0;

  const surface = opts?.surface;
  const sFactor =
    surface != null && surface in SURFACE_FACTOR
      ? SURFACE_FACTOR[surface]
      : SURFACE_FACTOR.road;

  const dur = Number(run?.duration_s);
  const pace = Number.isFinite(dur) && dur > 0 ? dur / distance : NaN;
  const pFactor = paceFactor(pace);

  const wear = distance * sFactor * pFactor;
  return Number.isFinite(wear) && wear > 0 ? wear : 0;
}

/**
 * 신발의 목표 수명(km).
 *   1) target_km 가 유한·>0 이면 그것.
 *   2) 아니면 모델명 파싱 → 시드 카테고리 → categoryLifespanKm[category].
 *   3) 최종 폴백 DEFAULT_LIFESPAN_KM(700).
 * 항상 양수 유한값.
 */
export function targetKmFor(shoe: WearShoe): number {
  const explicit = Number(shoe?.target_km);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const {brand, model} = parseShoeName(shoe?.name ?? '');
  const matched = findShoeModel(brand, model);
  if (matched) {
    const byCategory = categoryLifespanKm[matched.category];
    if (Number.isFinite(byCategory) && byCategory > 0) return byCategory;
  }
  return DEFAULT_LIFESPAN_KM;
}

/**
 * 보유 개월수 — created_at(우선) 또는 purchase_date 에서 산출. 결측/파싱불가/미래
 * (now 이전이 아님)/음수 → 0. 평균 월 길이(30.4375일)로 환산.
 */
function monthsOwned(shoe: WearShoe, now: Date): number {
  const raw = shoe?.created_at ?? shoe?.purchase_date;
  if (!raw) return 0;
  const startMs = new Date(raw).getTime();
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 0;
  const elapsedMs = nowMs - startMs;
  if (!(elapsedMs > 0)) return 0; // 미래·동시각 → 0
  const months = elapsedMs / MS_PER_DAY / DAYS_PER_MONTH;
  return Number.isFinite(months) && months > 0 ? months : 0;
}

/**
 * 시간 기반(폼 열화) 마모(km) = monthsOwned × (targetKmFor / 24).
 * 저주행이라도 보유 기간만으로 수명이 누적됨을 반영(휴리스틱). 항상 0 이상 유한값.
 */
export function ageWearKm(shoe: WearShoe, now: Date = new Date()): number {
  const months = monthsOwned(shoe, now);
  if (months <= 0) return 0;
  const target = targetKmFor(shoe);
  const wear = months * (target / AGE_WEAR_MONTHS);
  return Number.isFinite(wear) && wear > 0 ? wear : 0;
}

/**
 * 체중 보정 계수 = clamp(weightKg/70, 0.8, 1.6). 충격력은 체중에 거의 선형이라
 * 기준(70kg) 대비 마모를 스케일한다. 체중 결측·0·음수·비유한 → 1.0(기준 가정).
 */
export function weightFactorFor(weightKg?: number): number {
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) return 1.0;
  const f = w / WEIGHT_FACTOR_REF_KG;
  return Math.max(WEIGHT_FACTOR_MIN, Math.min(WEIGHT_FACTOR_MAX, f));
}

/**
 * 신발의 누적 실효 마모(km)
 *   = Σ runEffectiveWear(run, {surface: surfaceOf?.(run.id)}) × weightFactor
 *     + ageWearKm(shoe, now).
 * 빈 runs → ageWearKm 만. 모든 결측·비정상 입력에서 0 이상 유한값을 보장한다.
 * 원본 객체(shoe/run)는 읽기만 한다(A6-1).
 */
export function effectiveWearKm(
  shoe: WearShoe,
  runs: WearRun[],
  opts?: {weightKg?: number; now?: Date; surfaceOf?: (runId: string) => Surface},
): number {
  const list = Array.isArray(runs) ? runs : [];
  const surfaceOf = opts?.surfaceOf;

  const runWear = list.reduce<number>((sum, run) => {
    if (!run) return sum;
    const surface =
      surfaceOf && run.id != null ? surfaceOf(String(run.id)) : undefined;
    const w = runEffectiveWear(run, {surface});
    return sum + (Number.isFinite(w) && w > 0 ? w : 0);
  }, 0);

  const weighted = runWear * weightFactorFor(opts?.weightKg);
  const age = ageWearKm(shoe, opts?.now);
  const total = weighted + age;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

// ─── 노면 IO(얇게 — 순수계산과 분리) ──────────────────────────────
// lib/settings.ts 패턴: try/catch 로 영속 실패를 삼키고, 손상/누락은 기본값(road)으로
// 정규화한다. AsyncStorage 키 = `surface_<runId>`.

/** 런별 노면 태그를 읽는다. 미태그/손상/실패 → 기준 road. */
export async function getRunSurface(runId: string): Promise<Surface> {
  try {
    const raw = await AsyncStorage.getItem(`surface_${runId}`);
    return parseSurface(raw);
  } catch {
    return 'road';
  }
}

/** 런별 노면 태그를 저장한다. 미지원 값은 road 로 정규화 후 영속(실패는 삼킨다). */
export async function setRunSurface(runId: string, s: Surface): Promise<void> {
  try {
    await AsyncStorage.setItem(`surface_${runId}`, parseSurface(s));
  } catch {
    /* 영속 실패는 삼킨다(순수 계산은 영향 없음) */
  }
}
