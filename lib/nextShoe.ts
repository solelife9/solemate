// ─── lib/nextShoe.ts — 은퇴 후 '다음 신발' 추천 (순수) ──────────────────────────
//
// "뭐가 달랐으면 좋겠어요?"에 답하는 방향별 추천. 러너는 이미 자기 신발을 알아서,
// 비교는 영업이 아니라 조언의 언어다.
//
// ⚠️ 카테고리 게이트가 이 모듈의 존재 이유다.
// 축(더 푹신·더 가벼움·더 반발)만으로 후보를 고르면 **쿠션화를 은퇴한 러너에게 카본
// 레이싱화가 '더 통통 튀어요'로 추천된다**(실측 2026-07-28: 카본 41개·트레일 62개가
// 걸렸다). 카본화는 수명 450km에 안정성이 가장 낮은 레이스 전용이고, 트레일화는 노면이
// 아예 다르다. 데일리로 신으면 부상 위험과 돈 낭비로 직결된다 — keego 미션(부상 없이,
// 평생 달리는 몸)에 정면으로 어긋난다.
//
// 그래서 **같은 카테고리 안에서만 추천한다**(2026-07-28 민우님 확정).
// 슈퍼트레이너를 졸업했으면 슈퍼트레이너를, 쿠션화를 졸업했으면 쿠션화를 권하고,
// 비교는 그 안에서 무게·쿠션·수명으로 한다. 카테고리를 넘는 건 '교체'가 아니라
// '추가'이고, 은퇴 직후 맥락에서 할 말이 아니다.
//
// 정렬 규칙(불가침): 정렬 키는 개선 폭뿐이다. 커미션·제휴 태그는 이 계산 어디에도
// 등장하지 않는다(lib/shoeStore 불가침 ②와 같은 원칙).

import {SHOE_MODELS, ShoeModel, ShoeCategory, findShoeModel} from '../data/shoeModels';
import {buildShoeSpec, OfficialSpec} from './shoeSpecModel';
import {CompareAxis, ShoeSpec, AxisDelta, compareAxes} from './shoeCompare';

/**
 * 교체 후보로 성립하는가 — **같은 카테고리일 때만** true.
 *
 * 카테고리는 제조사가 그 신발을 무엇으로 만들었는지(설계 의도)를 담은 사실이다.
 * 같은 의도 안에서 고르는 게 '다음 신발'이고, 의도를 바꾸는 건 다른 결정이다.
 */
export function isCompatibleReplacement(prev: ShoeCategory, next: ShoeCategory): boolean {
  return prev === next;
}

/** 지난 신발의 카테고리. 카탈로그에 없으면 데일리로 본다(권장수명 폴백과 같은 규약). */
export function prevCategory(brand: string, model: string): ShoeCategory {
  return findShoeModel(brand, model)?.category ?? 'daily_trainer';
}

export interface AxisCandidate {
  model: ShoeModel;
  spec: ShoeSpec;
  /** 지난 신발 대비 달라진 축 전부(나빠진 축 포함 — 화면이 숨기지 않고 보여줄 수 있게). */
  deltas: AxisDelta[];
  /** 요청한 축에서 얼마나 나아졌는지(정렬 키). 클수록 먼저. */
  gain: number;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** 축별 개선 폭. 축마다 단위가 달라 각자의 자로 잰다. */
function gainOn(prev: ShoeSpec, next: ShoeSpec, axis: CompareAxis): number {
  switch (axis) {
    case 'softer': {
      const a = num(prev.cushion), b = num(next.cushion);
      return a !== undefined && b !== undefined ? b - a : 0;
    }
    case 'lighter': {
      const a = num(prev.weightG), b = num(next.weightG);
      return a !== undefined && b !== undefined ? a - b : 0; // 가벼울수록 +
    }
    case 'longer': {
      const a = num(prev.lifespanKm), b = num(next.lifespanKm);
      return a !== undefined && b !== undefined ? b - a : 0;
    }
    case 'stabler': {
      const a = num(prev.stability), b = num(next.stability);
      return a !== undefined && b !== undefined ? b - a : 0;
    }
    case 'snappier': {
      const a = num(prev.responsiveness), b = num(next.responsiveness);
      return a !== undefined && b !== undefined ? b - a : 0;
    }
    default:
      return 0;
  }
}

function sameShoe(a: {brand: string; model: string}, b: {brand: string; model: string}): boolean {
  return (
    a.brand.trim().toLowerCase() === b.brand.trim().toLowerCase() &&
    a.model.trim().toLowerCase() === b.model.trim().toLowerCase()
  );
}

export interface RecommendOptions {
  /** 돌려줄 최대 개수(기본 3). */
  limit?: number;
  /** 확인된 공식 스펙 주입 — 'Brand|Model' 키. 없으면 카테고리 기준만 쓴다. */
  officialSpecs?: Readonly<Record<string, OfficialSpec>>;
  /** 후보 풀(테스트 주입용). 기본은 시드 DB 전체. */
  pool?: readonly ShoeModel[];
}

const specKey = (brand: string, model: string) => `${brand}|${model}`;

/**
 * 특정 방향으로 나아진 후보를 고른다 — **같은 카테고리 안에서만**.
 *
 * 브랜드를 돌려가며 채워 한 브랜드가 목록을 독차지하지 않게 한다. 지난 신발과 같은
 * 브랜드를 우대하지 않는다 — 익숙함은 추천 근거가 아니다.
 */
export function recommendByAxis(
  prevBrand: string,
  prevModel: string,
  axis: CompareAxis,
  opts: RecommendOptions = {},
): AxisCandidate[] {
  const limit = Math.max(0, opts.limit ?? 3);
  if (limit === 0) return [];
  const pool = opts.pool ?? SHOE_MODELS;
  const officials = opts.officialSpecs ?? {};
  const category = prevCategory(prevBrand, prevModel);
  const prevSpec = buildShoeSpec(prevBrand, prevModel, officials[specKey(prevBrand, prevModel)]);

  const scored: AxisCandidate[] = [];
  for (const m of pool) {
    if (sameShoe(m, {brand: prevBrand, model: prevModel})) continue;
    // ① 카테고리 게이트가 축보다 먼저다.
    if (!isCompatibleReplacement(category, m.category)) continue;
    const spec = buildShoeSpec(m.brand, m.model, officials[specKey(m.brand, m.model)]);
    const deltas = compareAxes(prevSpec, spec);
    if (!deltas.some((d) => d.axis === axis && d.better)) continue;
    scored.push({model: m, spec, deltas, gain: gainOn(prevSpec, spec, axis)});
  }

  // 개선 폭 큰 순 → 최신 연도 → 모델명(결정적 tie-break).
  scored.sort((a, b) => {
    if (b.gain !== a.gain) return b.gain - a.gain;
    if (b.model.year !== a.model.year) return b.model.year - a.model.year;
    return a.model.model.localeCompare(b.model.model);
  });

  // 브랜드 라운드로빈 — 브랜드당 1켤레씩 채우고 자리가 남으면 2번째를 채운다.
  const byBrand = new Map<string, AxisCandidate[]>();
  for (const c of scored) {
    const k = c.model.brand.toLowerCase();
    const arr = byBrand.get(k) || [];
    arr.push(c);
    byBrand.set(k, arr);
  }
  const brands = [...byBrand.keys()].sort(
    (a, b) => scored.indexOf(byBrand.get(a)![0]) - scored.indexOf(byBrand.get(b)![0]),
  );

  const out: AxisCandidate[] = [];
  for (let round = 0; out.length < limit; round++) {
    let placed = false;
    for (const b of brands) {
      const arr = byBrand.get(b)!;
      if (round < arr.length) {
        out.push(arr[round]);
        placed = true;
        if (out.length >= limit) break;
      }
    }
    if (!placed) break; // 후보 소진
  }
  return out;
}

/** 축 표시 순서 정본(비교 화면의 줄 순서). */
export const AXIS_ORDER: readonly CompareAxis[] = [
  'softer', 'lighter', 'longer', 'stabler', 'snappier',
];

// ─── 비슷한 신발 찾기 ──────────────────────────────────────────────────────────
//
// 방향별(더 푹신/더 가벼움) 그룹 대신 **비슷한 스펙끼리 브랜드별로** 늘어놓는다
// (2026-07-28 민우님 확정). 이유가 둘이다:
//  ① 같은 신발이 여러 방향 그룹에 중복으로 나온다.
//  ② 스펙 커버리지가 낮은 동안에는 축이 잡히지 않아 그룹이 통째로 비어버린다. 반면
//     '같은 종류 · 비슷한 스펙'은 카테고리만 있어도 언제나 성립한다.
// 고른 뒤 그래프로 지난 신발과 바로 견주는 게 이 화면의 본론이라, 목록은 후보를 빨리
// 훑게만 하면 된다.

/** 축별 '많이 다름'의 기준 — 유사도 정규화에 쓴다(이 값만큼 벌어지면 1.0). */
const SPREAD = {cushion: 4, weightG: 80, lifespanKm: 250} as const;

/**
 * 지난 신발과의 거리(0에 가까울수록 비슷). **양쪽 다 값이 있는 축만** 센다.
 * 아는 축이 하나도 없으면 null — '비슷하다'고 말할 근거가 없다는 뜻이다.
 */
export function specDistance(prev: ShoeSpec, next: ShoeSpec): number | null {
  const parts: number[] = [];
  const push = (a: unknown, b: unknown, spread: number) => {
    const x = num(a), y = num(b);
    if (x === undefined || y === undefined) return;
    parts.push(Math.min(1, Math.abs(x - y) / spread));
  };
  push(prev.cushion, next.cushion, SPREAD.cushion);
  push(prev.weightG, next.weightG, SPREAD.weightG);
  push(prev.lifespanKm, next.lifespanKm, SPREAD.lifespanKm);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export interface SimilarCandidate {
  model: ShoeModel;
  spec: ShoeSpec;
  /** 지난 신발 대비 달라진 축(화면이 한 줄 요약으로 쓴다). */
  deltas: AxisDelta[];
  /** 0에 가까울수록 비슷. 근거가 없으면 null(목록 뒤로 밀린다). */
  distance: number | null;
}

/**
 * 같은 카테고리에서 **비슷한 스펙** 후보를 비슷한 순으로 돌려준다.
 *
 * 브랜드로 묶지 않는다 — 브랜드는 '비슷함'의 근거가 아니고(같은 나이키 안에서도
 * 페가수스와 알파플라이는 완전히 다르다), 브랜드 헤더로 묶으면 가장 잘 맞는 후보가
 * 알파벳 순서에 밀려 화면 중간에 묻힌다. 대신 **브랜드가 골고루 섞이도록 보장**한다
 * (라운드로빈): 순서는 정직하게 '비슷한 순'을 유지하면서 여러 브랜드를 보게 된다.
 *
 * 스펙을 모르는 후보(distance=null)는 뒤로 밀되 버리지 않는다 — 같은 종류라는 사실만
 * 으로도 후보 자격은 있다. 커미션은 정렬 어디에도 개입하지 않는다.
 */
export function similarShoes(
  prevBrand: string,
  prevModel: string,
  opts: RecommendOptions & {maxPerBrand?: number} = {},
): SimilarCandidate[] {
  const pool = opts.pool ?? SHOE_MODELS;
  const officials = opts.officialSpecs ?? {};
  const limit = Math.max(0, opts.limit ?? 8);
  if (limit === 0) return [];
  const maxPerBrand = Math.max(1, opts.maxPerBrand ?? 2);
  const category = prevCategory(prevBrand, prevModel);
  const prevSpec = buildShoeSpec(prevBrand, prevModel, officials[specKey(prevBrand, prevModel)]);

  const all: SimilarCandidate[] = [];
  for (const m of pool) {
    if (sameShoe(m, {brand: prevBrand, model: prevModel})) continue;
    if (!isCompatibleReplacement(category, m.category)) continue;
    const spec = buildShoeSpec(m.brand, m.model, officials[specKey(m.brand, m.model)]);
    all.push({
      model: m, spec,
      deltas: compareAxes(prevSpec, spec),
      distance: specDistance(prevSpec, spec),
    });
  }

  const rank = (c: SimilarCandidate) => (c.distance === null ? Number.POSITIVE_INFINITY : c.distance);
  all.sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    if (b.model.year !== a.model.year) return b.model.year - a.model.year;
    return a.model.model.localeCompare(b.model.model);
  });

  // 브랜드 라운드로빈 — 순서는 '비슷한 순'을 유지하되 한 브랜드가 앞을 독차지하지 않게.
  const seen = new Map<string, number>();
  const picked: SimilarCandidate[] = [];
  const rest: SimilarCandidate[] = [];
  for (const c of all) {
    const k = c.model.brand.toLowerCase();
    const n = seen.get(k) ?? 0;
    if (n < 1) { seen.set(k, 1); picked.push(c); } else { rest.push(c); }
  }
  // 1순위(브랜드당 1켤레)로 채우고, 자리가 남으면 2번째 이후를 비슷한 순으로 채운다.
  const out = picked.slice(0, limit);
  for (const c of rest) {
    if (out.length >= limit) break;
    const k = c.model.brand.toLowerCase();
    const n = out.filter((x) => x.model.brand.toLowerCase() === k).length;
    if (n < maxPerBrand) out.push(c);
  }
  return out;
}
