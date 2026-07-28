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

/** 축 표시 순서 정본(그룹 나열 순서). */
export const AXIS_ORDER: readonly CompareAxis[] = [
  'softer', 'lighter', 'longer', 'stabler', 'snappier',
];

export interface AxisGroup {
  axis: CompareAxis;
  items: AxisCandidate[];
}

/**
 * 방향별 그룹 목록 — 후보가 실제로 있는 방향만 만든다.
 * 빈 그룹은 만들지 않는다(눌러도 아무것도 없는 줄을 두지 않는다).
 */
export function buildAxisGroups(
  prevBrand: string,
  prevModel: string,
  opts: RecommendOptions = {},
): AxisGroup[] {
  const groups: AxisGroup[] = [];
  for (const axis of AXIS_ORDER) {
    const items = recommendByAxis(prevBrand, prevModel, axis, opts);
    if (items.length) groups.push({axis, items});
  }
  return groups;
}
