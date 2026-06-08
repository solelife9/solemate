// ─── Slice 8 리텐션: 기간 리캡 순수 요약 ───────────────────────────
// 주간/월간 "리캡"(돌아보기)을 만드는 순수 파생 모듈. 네이티브 0·백엔드 0·시크릿 0:
// 입력(런 로그·신발 목록)만으로 결정되는 읽기 전용 요약이며, 어떤 저장/네트워크/
// 네이티브 호출도 하지 않는다.
//
// 재사용(중복 계산 금지):
//   · lib/stats.ts   — sumKm(총거리)·avgPaceLabel(평균 페이스)
//   · lib/goals.ts   — personalRecords(개인 기록: 1km/5km/최장)
//   · lib/wearModel.ts — runEffectiveWear·weightFactorFor(신발별 실효 마모)
//   · lib/format.ts  — getMonday(주 시작)
//
// 결정성(A8 테스트): 기준 시각 `now`는 opts로 주입한다(전역 Date 모킹 불필요).
//   주간 = 최근 월요일 00:00(로컬) ~ +7일(끝 배타).  월간 = now가 속한 달 전체.
//
// 원본 불변(A8-1): runs/shoes 및 그 원소는 읽기만 한다. 모든 출력은 파생값이다.
// 엣지 graceful(A8-5): 런 0개 → isEmpty true·0값·mostWornShoe null. 결측·0·음수·
//   비유한 입력에서도 NaN/Infinity/음수를 절대 반환하지 않는다(round1로 정규화).

import {sumKm, avgPaceLabel} from './stats';
import {personalRecords, type PersonalRecords} from './goals';
import {
  runEffectiveWear,
  weightFactorFor,
  type Surface,
} from './wearModel';
import {getMonday} from './format';

// ─── 입력 타입(앱 네이티브 런/신발 형태를 느슨하게 수용) ─────────────
/** 리캡이 읽는 런 행. 앱 표준(km 문자열/숫자·duration 초·run_date 'YYYY-MM-DD'). */
export interface RecapRun {
  id?: string | number;
  shoe_id?: string | number;
  km?: number | string;
  duration?: number; // 초
  run_date?: string; // 로컬 'YYYY-MM-DD'(시각이 붙어도 날짜 부분만 사용)
}

/** 리캡이 읽는 신발 행. 이름·수명(실효 마모 폴백용)만 본다. */
export interface RecapShoe {
  id?: string | number;
  name?: string;
  target_km?: number;
  max_km?: number;
  created_at?: string;
  purchase_date?: string;
}

/** 결정성·보정 입력. now 미주입 시에만 현재 시각으로 폴백한다. */
export interface RecapOpts {
  now?: Date;
  weightKg?: number;
  surfaceOf?: (runId: string) => Surface;
}

// ─── 출력 타입 ─────────────────────────────────────────────────────
export interface ShoeWear {
  name: string;
  effectiveKm: number;
}

export interface MostWornShoe {
  name: string;
  km: number;
}

export interface Recap {
  /** 기간 라벨(주: 'M.D–M.D', 월: 'YYYY년 M월'). */
  periodLabel: string;
  /** 기간 총 주행거리(km, 소수 1자리). */
  totalKm: number;
  /** 기간 런 수. */
  runCount: number;
  /** 기간 평균 페이스 라벨(없으면 '--'). */
  avgPaceLabel: string;
  /** 실효 마모가 가장 큰(=최다 착용) 신발. 없으면 null. */
  mostWornShoe: MostWornShoe | null;
  /** 신발별 실효 마모(km) — 내림차순. */
  perShoeWear: ShoeWear[];
  /** 개인 기록(1km/5km/최장). */
  prs: PersonalRecords;
  /** 기간 내 런 0개면 true(빈 리캡). */
  isEmpty: boolean;
}

// ─── 내부 유틸 ─────────────────────────────────────────────────────
/** 비유한/음수를 0으로 정규화하고 소수 1자리로 반올림(A8-5 무NaN/Infinity). */
function round1(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10) / 10;
}

/** 'YYYY-MM-DD[...]'의 날짜 부분 → 로컬 자정 epoch ms. 파싱 불가 → NaN. */
function dayMs(iso?: string): number {
  if (!iso) return NaN;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
  return new Date(y, m - 1, d).getTime();
}

/** [startMs, endMs) 로컬 자정 구간 안의 런만(날짜 파싱 불가 런은 제외). */
function runsInWindow(runs: RecapRun[], startMs: number, endMs: number): RecapRun[] {
  if (!Array.isArray(runs)) return [];
  return runs.filter(r => {
    const d = dayMs(r?.run_date);
    return Number.isFinite(d) && d >= startMs && d < endMs;
  });
}

/** 신발 id → 표시 이름 조회 맵(이름 결측 시 '신발'). */
function shoeNames(shoes: RecapShoe[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(shoes)) return map;
  for (const s of shoes) {
    if (s?.id == null) continue;
    map.set(String(s.id), s.name && String(s.name).trim() ? String(s.name) : '신발');
  }
  return map;
}

/**
 * 기간 런 목록 + 신발에서 Recap을 조립하는 공통 코어(주/월 공유).
 * 모든 수치는 round1로 정규화되어 NaN/Infinity/음수가 새어나가지 않는다.
 */
function buildRecap(
  periodRuns: RecapRun[],
  shoes: RecapShoe[],
  periodLabel: string,
  opts?: RecapOpts,
): Recap {
  const isEmpty = periodRuns.length === 0;

  // 총거리·평균 페이스: stats.ts 재사용(km 파싱·duration 초 규약 동일).
  const totalKm = round1(sumKm(periodRuns));
  const paceLabel = avgPaceLabel(periodRuns);

  // 개인 기록: goals.personalRecords 재사용(거리·시간 양수 런만 페이스 산정).
  const prs = personalRecords(
    periodRuns.map(r => ({
      run_date: String(r?.run_date ?? ''),
      km: parseFloat(String(r?.km)) || 0,
      durationS: Number(r?.duration) || 0,
    })),
  );

  // 신발별 실효 마모: wearModel.runEffectiveWear × 체중 보정(기간 런만 합산).
  // 누적 폼 열화(ageWearKm)는 기간 리캡 의미에 맞지 않으므로 런-마모 코어만 쓴다.
  const weight = weightFactorFor(opts?.weightKg);
  const surfaceOf = opts?.surfaceOf;
  const wearById = new Map<string, number>();
  for (const r of periodRuns) {
    if (r?.shoe_id == null) continue;
    const surface =
      surfaceOf && r.id != null ? surfaceOf(String(r.id)) : undefined;
    const w =
      runEffectiveWear(
        {distance_km: parseFloat(String(r?.km)) || 0, duration_s: Number(r?.duration) || 0},
        {surface},
      ) * weight;
    const add = Number.isFinite(w) && w > 0 ? w : 0;
    const key = String(r.shoe_id);
    wearById.set(key, (wearById.get(key) ?? 0) + add);
  }

  const names = shoeNames(shoes);
  const perShoeWear: ShoeWear[] = [...wearById.entries()]
    .map(([id, km]) => ({name: names.get(id) ?? '신발', effectiveKm: round1(km)}))
    .filter(s => s.effectiveKm > 0)
    .sort((a, b) => b.effectiveKm - a.effectiveKm);

  const mostWornShoe: MostWornShoe | null =
    perShoeWear.length > 0
      ? {name: perShoeWear[0].name, km: perShoeWear[0].effectiveKm}
      : null;

  return {
    periodLabel,
    totalKm,
    runCount: periodRuns.length,
    avgPaceLabel: paceLabel,
    mostWornShoe,
    perShoeWear,
    prs,
    isEmpty,
  };
}

// ─── 공개 API ──────────────────────────────────────────────────────
/**
 * 주간 리캡 — 최근 월요일 00:00(로컬) ~ +7일(끝 배타) 구간.
 * now는 opts로 주입(미주입 시 현재 시각). 원본 불변.
 */
export function weeklyRecap(
  runs: RecapRun[],
  shoes: RecapShoe[],
  opts?: RecapOpts,
): Recap {
  const now = opts?.now ?? new Date();
  const monday = getMonday(now);
  const start = monday.getTime();
  const end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7).getTime();

  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const label = `${monday.getMonth() + 1}.${monday.getDate()}–${sunday.getMonth() + 1}.${sunday.getDate()}`;

  return buildRecap(runsInWindow(runs, start, end), shoes, label, opts);
}

/**
 * 월간 리캡 — now가 속한 달 전체(1일 00:00 ~ 다음 달 1일, 끝 배타).
 * now는 opts로 주입(미주입 시 현재 시각). 원본 불변.
 */
export function monthlyRecap(
  runs: RecapRun[],
  shoes: RecapShoe[],
  opts?: RecapOpts,
): Recap {
  const now = opts?.now ?? new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();

  const label = `${year}년 ${month + 1}월`;

  return buildRecap(runsInWindow(runs, start, end), shoes, label, opts);
}
