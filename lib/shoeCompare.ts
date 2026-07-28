// ─── lib/shoeCompare.ts — 지난 신발 ↔ 다음 신발 비교 (순수 로직) ──────────────────
//
// 은퇴한 신발과 후보 신발을 사용자가 실제로 쓰는 언어("더 푹신해요 / 더 가벼워요")로
// 비교한다. 목적은 스펙 나열이 아니라 **결정을 돕는 것**이다.
//
// 원칙:
//  · 모르는 건 비교하지 않는다. 스펙이 결측이면 그 축을 조용히 빼지, 기본값으로
//    추측해 채우지 않는다(Truth only — 없는 근거로 만든 비교는 거짓말이다).
//  · 원/km 의 분자는 **사용자가 실제로 낸 값**이다. 정가를 추측하지 않는다.
//  · 정렬은 적합도(fit) 순이며 커미션은 정렬 키에 등장하지 않는다(shoeStore 불가침 ②).
//  · 순수 — 네트워크/네이티브/시간 의존 0(입력 불변, throw 금지).

/** 비교 축. 사용자가 "다음 신발은 뭐가 달랐으면?"에 답할 때 쓰는 말과 1:1 대응한다. */
export type CompareAxis =
  | 'softer'    // 더 푹신 (쿠션↑)
  | 'lighter'   // 더 가벼움 (무게↓)
  | 'longer'    // 더 오래 (수명↑)
  | 'stabler'   // 더 안정 (안정성↑)
  | 'snappier'; // 더 반발 (반발↑)

export const axisLabelKo: Record<CompareAxis, string> = {
  softer: '더 푹신해요',
  lighter: '더 가벼워요',
  longer: '더 오래 신어요',
  stabler: '더 안정적이에요',
  snappier: '더 통통 튀어요',
};

/**
 * 비교에 쓰는 신발 스펙. 전부 선택 — 아는 것만 채우고 모르는 축은 비교에서 빠진다.
 * cushion/responsiveness/stability 는 실측이 아니라 **keego 분류**(1~5)다.
 * 화면에서 그렇게 밝혀야 한다(실측인 척하면 Truth only 위반).
 */
export interface ShoeSpec {
  brand: string;
  model: string;
  /** 권장 수명(km) — 카테고리 기본 또는 모델 오버라이드. */
  lifespanKm?: number;
  /** 무게(g). 브랜드 공식 스펙 기준. */
  weightG?: number;
  /** 드롭(mm). 브랜드 공식 스펙 기준. */
  dropMm?: number;
  /** 힐 스택 높이(mm). 쿠션 축의 실제 근거(있으면 카테고리 산정을 대체). */
  stackHeelMm?: number;
  /** keego 분류 1~5 (5 = 가장 푹신 / 가장 반발 / 가장 안정). */
  cushion?: number;
  responsiveness?: number;
  stability?: number;
}

/** 축별 판정 결과 한 건. */
export interface AxisDelta {
  axis: CompareAxis;
  /** 후보가 지난 신발보다 이 축에서 나은가(= 축 이름대로인가). */
  better: boolean;
  /** 사람이 읽는 차이 문구(예: '32g 가벼워요'). 비교 불가면 빈 문자열. */
  detailKo: string;
}

/** 1~5 스케일에서 '의미 있는 차이'로 볼 최소 간격. 1칸 미만은 노이즈로 본다. */
const SCALE_EPS = 1;
/** 무게는 30g 이상 차이부터 체감된다는 관례를 따른다(그 미만은 축으로 세우지 않는다). */
const WEIGHT_EPS_G = 30;
/** 수명은 50km 미만 차이를 유의미하게 보지 않는다. */
const LIFESPAN_EPS_KM = 50;

function num(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

/**
 * 지난 신발 대비 후보 신발이 '나아진 축'만 골라 돌려준다.
 *
 * 양쪽 모두 값이 있는 축만 본다 — 한쪽이라도 결측이면 그 축은 결과에서 빠진다.
 * 결과는 축 정의 순서로 안정 정렬돼 같은 입력이면 항상 같은 출력을 준다.
 */
export function compareAxes(prev: ShoeSpec, next: ShoeSpec): AxisDelta[] {
  const out: AxisDelta[] = [];

  const pc = num(prev.cushion), nc = num(next.cushion);
  if (pc !== undefined && nc !== undefined && Math.abs(nc - pc) >= SCALE_EPS) {
    out.push({axis: 'softer', better: nc > pc, detailKo: nc > pc ? '쿠션이 한 단계 더 두툼해요' : '쿠션은 조금 얇아요'});
  }

  const pw = num(prev.weightG), nw = num(next.weightG);
  if (pw !== undefined && nw !== undefined && Math.abs(nw - pw) >= WEIGHT_EPS_G) {
    const d = Math.round(Math.abs(nw - pw));
    out.push({axis: 'lighter', better: nw < pw, detailKo: nw < pw ? `${d}g 가벼워요` : `${d}g 무거워요`});
  }

  const pl = num(prev.lifespanKm), nl = num(next.lifespanKm);
  if (pl !== undefined && nl !== undefined && Math.abs(nl - pl) >= LIFESPAN_EPS_KM) {
    const d = Math.round(Math.abs(nl - pl));
    out.push({axis: 'longer', better: nl > pl, detailKo: nl > pl ? `권장 수명이 ${d}km 길어요` : `권장 수명이 ${d}km 짧아요`});
  }

  const ps = num(prev.stability), ns = num(next.stability);
  if (ps !== undefined && ns !== undefined && Math.abs(ns - ps) >= SCALE_EPS) {
    out.push({axis: 'stabler', better: ns > ps, detailKo: ns > ps ? '발이 덜 흔들려요' : '지지력은 조금 약해요'});
  }

  const pr = num(prev.responsiveness), nr = num(next.responsiveness);
  if (pr !== undefined && nr !== undefined && Math.abs(nr - pr) >= SCALE_EPS) {
    out.push({axis: 'snappier', better: nr > pr, detailKo: nr > pr ? '밀어주는 느낌이 더 강해요' : '반발은 조금 약해요'});
  }

  return out;
}

/** 후보를 '나아진 축'으로 묶는다(방향별 추천 화면의 그룹 키). */
export function groupByImprovedAxis<T extends {spec: ShoeSpec}>(
  prev: ShoeSpec,
  candidates: readonly T[],
): {axis: CompareAxis; items: T[]}[] {
  const order: CompareAxis[] = ['softer', 'lighter', 'longer', 'stabler', 'snappier'];
  const buckets = new Map<CompareAxis, T[]>();
  for (const c of candidates) {
    for (const d of compareAxes(prev, c.spec)) {
      if (!d.better) continue;
      const arr = buckets.get(d.axis) || [];
      arr.push(c);
      buckets.set(d.axis, arr);
    }
  }
  return order
    .filter((a) => (buckets.get(a) || []).length > 0)
    .map((axis) => ({axis, items: buckets.get(axis)!}));
}

// ─── 원/km — keego 만 낼 수 있는 숫자 ────────────────────────────────────────────

/** 원/km 계산 결과. 근거가 '실측'인지 '예상'인지 반드시 함께 나른다. */
export interface WonPerKm {
  /** 1km당 원. 소수점 없이 반올림. */
  wonPerKm: number;
  /** 계산에 쓴 거리(km). */
  km: number;
  /** true = 실제 주행거리 기반(내 신발) / false = 권장 수명 기반(후보 신발 예상). */
  actual: boolean;
}

/**
 * 내 신발의 **실측** 원/km — 내가 낸 값 ÷ 내가 실제로 달린 거리.
 *
 * keego 가 아니면 낼 수 없는 숫자다(주행거리가 자동으로 쌓이니까). 구매가가 없거나
 * 주행거리가 0이면 null 을 돌려준다 — 추정치로 대신 채우지 않는다.
 */
export function actualWonPerKm(priceKrw?: number, usedKm?: number): WonPerKm | null {
  const p = num(priceKrw), km = num(usedKm);
  if (p === undefined || p <= 0) return null;
  if (km === undefined || km <= 0) return null;
  return {wonPerKm: Math.round(p / km), km, actual: true};
}

/**
 * 후보 신발의 **예상** 원/km — 지금 가격 ÷ 권장 수명.
 *
 * 정가가 아니라 조회 시점 가격을 쓰므로, 화면은 반드시 출처·시각을 함께 표시해야 한다
 * (shoeStore.priceSourceNoteKo). 가격이나 수명이 없으면 null(빈칸을 정직하게 비운다).
 */
export function expectedWonPerKm(priceKrw?: number, lifespanKm?: number): WonPerKm | null {
  const p = num(priceKrw), km = num(lifespanKm);
  if (p === undefined || p <= 0) return null;
  if (km === undefined || km <= 0) return null;
  return {wonPerKm: Math.round(p / km), km, actual: false};
}

/** 원/km 표시 문구(예: '1km당 210원 · 실제 주행 기준'). */
export function wonPerKmLabelKo(v: WonPerKm | null): string {
  if (!v) return '';
  const basis = v.actual ? '실제 주행 기준' : '권장 수명 기준';
  return `1km당 ${v.wonPerKm.toLocaleString('ko-KR')}원 · ${basis}`;
}

/**
 * 두 원/km 를 견줘 한 줄 판정을 만든다(1:1 비교 화면의 판정 카드).
 *
 * 어느 쪽이든 계산 불가면 빈 문자열 — "비슷해요" 같은 말로 얼버무리지 않는다.
 * 10% 이내 차이는 우열을 말하지 않는다(가격·수명 추정 오차 범위).
 */
export function wonPerKmVerdictKo(prev: WonPerKm | null, next: WonPerKm | null): string {
  if (!prev || !next) return '';
  const diff = next.wonPerKm - prev.wonPerKm;
  const ratio = Math.abs(diff) / prev.wonPerKm;
  if (ratio < 0.1) return '1km당 비용은 지난 신발과 거의 같아요';
  const amount = Math.abs(diff).toLocaleString('ko-KR');
  return diff < 0
    ? `1km당 ${amount}원 아껴요`
    : `1km당 ${amount}원 더 들어요`;
}
