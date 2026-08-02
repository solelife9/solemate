// ─── lib/shoeCompareTable.ts — 러닝화 비교 표 (순수 로직) ────────────────────────
//
// 흩어진 스펙을 한 표로 세우는 계산. 화면은 이 결과를 그리기만 한다.
//
// 원칙(docs/shoes-spec.md 와 같은 정신):
//  · **모르면 비우고, 비었다는 걸 보여준다.** 물음표로 채우거나 비슷한 모델에서
//    베껴 오지 않는다. 빈칸도 정보다.
//  · **차이는 기준 대비로만.** 첫 칸이 기준이고 나머지는 그 차이를 적는다.
//    "292g"은 감이 안 와도 "+62"는 몸이 안다.
//  · **좋고 나쁨을 말하지 않는다.** 가벼운 게 늘 좋은 게 아니다(장거리는 두꺼운
//    쪽이 낫고 카본은 매일 신는 신발이 아니다). 그래서 부호만 적고 색은 쓰지 않는다.
//  · 순수 — 네트워크·시간·네이티브 의존 0. 입력 불변, throw 금지.

import type {PlateKind, ShoeCategory, StackHeight} from '../types/shoe';
import {
  adjustWeightToBasis,
  basisComparable,
  normalizeWeightBasis,
  STANDARD_BASIS,
} from './shoeWeightBasis';

/** 비교에 필요한 최소 형태. 카탈로그 문서를 그대로 넣어도 되고, 일부만 채워도 된다. */
export interface CompareShoe {
  id: string;
  brand: string;
  /** 화면에 뜨는 이름(모델 + 버전 + variant). 호출부가 완성해 넘긴다. */
  name: string;
  category?: ShoeCategory | null;
  weight?: number | null;
  /** 무게를 잰 사이즈. 기준이 다르면 그 사실을 표시해야 한다. */
  weightBasis?: string | null;
  drop?: number | null;
  plate?: PlateKind | null;
  stackHeight?: StackHeight | null;
  lifespanKm?: number | null;
  /** 내 신발일 때만 채운다 — 비교 축이 아니라 맥락이다. */
  mine?: {usedKm: number; lifespanKm: number} | null;
}

export interface CompareCell {
  /** 큰 숫자/문구. 값이 없으면 null(화면은 '—'을 그린다). */
  value: string | null;
  /** 숫자 뒤 단위. 문구형 행(카본)은 없다. */
  unit?: string;
  /**
   * 기준 대비 차이. 기준 칸은 null.
   * 값을 모르거나 기준을 몰라 계산할 수 없으면 null.
   */
  delta?: string | null;
  /** 보조 표기(기준 칸의 '앞발 38', 무게 기준 사이즈 등). */
  sub?: string | null;
}

export interface CompareRow {
  key: 'weight' | 'stack' | 'drop' | 'plate' | 'lifespan';
  label: string;
  /** 라벨 밑 작은 설명. 없으면 undefined. */
  hint?: string;
  cells: CompareCell[];
}

/** 값이 하나도 없는 행은 표에서 뺀다 — 전부 '—'인 줄은 자리만 차지한다. */
function hasAnyValue(cells: readonly CompareCell[]): boolean {
  return cells.some((c) => c.value !== null);
}

/** 부호 붙은 차이. 0은 '0'(같음을 명시), 소수점은 최대 1자리. */
export function formatDelta(diff: number): string {
  const r = Math.round(diff * 10) / 10;
  if (r === 0) return '0';
  const n = Number.isInteger(r) ? String(Math.abs(r)) : String(Math.abs(r));
  // 음수 부호는 하이픈(-)이 아니라 마이너스(−) — 숫자 폭이 맞고 +와 시각적 무게가 같다.
  return (r > 0 ? '+' : '−') + n;
}

function numCell(
  value: number | null | undefined,
  base: number | null | undefined,
  isBase: boolean,
  unit: string,
): CompareCell {
  if (value == null || !Number.isFinite(value)) return {value: null, unit, delta: null};
  const cell: CompareCell = {value: String(Math.round(value * 10) / 10), unit};
  if (isBase) {
    cell.delta = null;
  } else if (base != null && Number.isFinite(base)) {
    cell.delta = formatDelta(value - base);
  } else {
    // 기준을 모르면 차이를 만들 수 없다. 없는 비교를 지어내지 않는다.
    cell.delta = null;
  }
  return cell;
}

const PLATE_LABEL: Readonly<Record<PlateKind, string>> = {
  carbon: '카본',
  other: '있음 (카본 아님)',
  none: '없음',
};

/**
 * 비교 표를 만든다. `baseIndex` 칸이 기준이고 나머지는 그 차이를 적는다.
 *
 * 기준을 인자로 받는 이유: 처음 넣은 신발이 영구 기준이면 "내 신발 말고 저 둘을
 * 견주고 싶다"를 할 수 없다. 어느 칸이든 기준이 될 수 있어야 비교가 사용자 것이 된다.
 * 범위를 벗어난 값은 0으로 떨어뜨린다(빈 표를 만드느니 첫 칸을 기준으로 삼는다).
 *
 * 값이 하나도 없는 행은 아예 빼지만, **일부만 아는 행은 남긴다** — 한 켤레라도
 * 아는 값이 있으면 그건 비교에 쓸 수 있는 정보이고, 나머지 칸이 비었다는 사실도
 * 사용자가 알아야 한다.
 */
export function buildCompareTable(
  shoes: readonly CompareShoe[],
  baseIndex = 0,
): CompareRow[] {
  if (shoes.length === 0) return [];
  const bi = Number.isInteger(baseIndex) && baseIndex >= 0 && baseIndex < shoes.length
    ? baseIndex : 0;
  const base = shoes[bi];

  // 무게는 잰 사이즈가 다르면 그냥 빼면 안 된다. 반 사이즈가 6g 쯤 되기 때문이다.
  //
  //  · 기준이 같다        → 그대로 뺀다
  //  · 기준이 다르고 **둘 다 안다** → 사이즈 보정 후 빼고 `≈` 를 붙인다(±3g 추정)
  //  · 하나라도 모른다     → 차이를 안 적는다. 모르는 걸 보정할 수는 없다
  //
  // 칸에 적히는 숫자는 **언제나 공표된 원래 무게**다. 보정은 차이를 낼 때만 쓴다
  // — 저장값도 표시값도 손대지 않는다(docs/shoes-spec.md §1).
  let approx = false;
  let unmeasurable = false;   // 기준을 모르거나, 알아도 너무 멀어 보정이 무의미한 경우
  const weight: CompareRow = {
    key: 'weight',
    label: '무게',
    cells: shoes.map((s, i) => {
      const c = numCell(s.weight, base.weight, i === bi, 'g');
      if (c.value === null) return c;
      const mine = normalizeWeightBasis(s.weightBasis);
      if (i !== bi && !basisComparable(s.weightBasis, base.weightBasis)) {
        const adj = adjustWeightToBasis(s.weight, s.weightBasis, base.weightBasis);
        if (adj != null && base.weight != null) {
          c.delta = '≈' + formatDelta(adj - base.weight);
          approx = true;
        } else {
          c.delta = null;
          unmeasurable = true;
        }
      }
      // 표준(270mm)이면 굳이 적지 않는다. 다르거나 모르면 그 사실을 드러낸다.
      if (mine == null) c.sub = '기준 모름';
      else if (mine !== STANDARD_BASIS) c.sub = mine;
      return c;
    }),
  };
  // 이유를 갈라 적는다 — '모른다'와 '알지만 너무 다르다'는 사용자에게 다른 이야기다.
  const unknown = shoes.some((s, i) => i !== bi && s.weight != null && base.weight != null
    && normalizeWeightBasis(s.weightBasis) == null);
  if (unknown) weight.hint = '잰 사이즈를 몰라 차이는 비교하지 않음';
  else if (unmeasurable) weight.hint = '잰 사이즈가 너무 달라 차이는 비교하지 않음';
  else if (approx) weight.hint = '≈ 는 사이즈 보정한 어림값';

  const stack: CompareRow = {
    key: 'stack',
    label: '쿠션 두께',
    hint: '뒤꿈치',
    cells: shoes.map((s, i) => {
      const c = numCell(s.stackHeight?.heel, base.stackHeight?.heel, i === bi, 'mm');
      if (i === bi && s.stackHeight?.forefoot != null) c.sub = `앞발 ${s.stackHeight.forefoot}`;
      return c;
    }),
  };

  const drop: CompareRow = {
    key: 'drop',
    label: '드롭',
    hint: '앞뒤 높이차',
    cells: shoes.map((s, i) => numCell(s.drop, base.drop, i === bi, 'mm')),
  };

  const plate: CompareRow = {
    key: 'plate',
    label: '카본',
    hint: '플레이트',
    cells: shoes.map((s) => ({
      value: s.plate ? PLATE_LABEL[s.plate] : null,
      delta: null,
    })),
  };

  const lifespan: CompareRow = {
    key: 'lifespan',
    label: '권장 수명',
    cells: shoes.map((s) => ({
      value: s.lifespanKm != null ? String(s.lifespanKm) : null,
      unit: 'km',
      delta: null,
    })),
  };

  return [weight, stack, drop, plate, lifespan].filter((r) => hasAnyValue(r.cells));
}

/** 기준 신발이 내 신발일 때 표 밖에 붙는 한 줄. 아니면 null. */
export interface MineSummary {
  name: string;
  usedKm: number;
  remainKm: number;
  pct: number;
}

export function mineSummary(shoe: CompareShoe | undefined): MineSummary | null {
  if (!shoe?.mine) return null;
  const {usedKm, lifespanKm} = shoe.mine;
  if (!Number.isFinite(usedKm) || !Number.isFinite(lifespanKm) || lifespanKm <= 0) return null;
  const used = Math.max(0, usedKm);
  return {
    name: shoe.name,
    usedKm: Math.round(used),
    remainKm: Math.max(0, Math.round(lifespanKm - used)),
    // 100%를 넘겨도 막대는 넘치지 않는다(수명 초과도 정상 상태다).
    pct: Math.max(0, Math.min(1, used / lifespanKm)),
  };
}

/** 한 화면에 세울 수 있는 최대 켤레. 넘치면 비교가 아니라 목록이 된다. */
export const MAX_COMPARE = 3;
