// ============================================================================
// lib/rotation.ts — 신발 로테이션 추천 (Slice 4)
// 기존 데이터(신발 목록 + 런 기록)에서만 파생하는 순수 함수다. 새 상태/필드를 만들지
// 않고, 런의 'YYYY-MM-DD' 날짜를 사전식으로 비교해 "마지막 착용일"을 얻으므로
// 데이터 파괴·타임존 모킹 위험이 없다(iron law). 토큰만 — 네이티브 0.
//
// 계약(수용 테스트 @slice-4 신발 로테이션 추천):
//   - 활성(retired 아님) 신발 <2 → [] (로테이션은 2켤레+에서만 의미)
//   - retired 제외
//   - runType(easy/tempo/long/recovery/race)이 있으면 해당 카테고리 매칭 우선
//     (카테고리는 data/shoeModels 의 brand+model 조회, 커스텀/미매칭은 브랜드 폴백)
//   - 같은 조건이면 더 오래 쉰(마지막 착용일이 더 이른) 신발 우선(폼 회복)
//   - 그다음 누적거리(Σ km) 적은 신발 우선(마모 분산) — 런 수가 아니라 실제 마모량
//   - 거리까지 같으면 마지막으로 런 수 적은 신발 우선(보조 tie-break)
//   - 각 pick 에 한국어 reason 문구('3일 휴식 · 카본화는 쉬게' 류)
// ============================================================================
import {findShoeModel, ShoeCategory, SHOE_MODELS} from '../data/shoeModels';

export type RunType = 'easy' | 'tempo' | 'long' | 'recovery' | 'race';

export interface RotationShoe {
  id: string;
  brand: string;
  model: string;
  retired?: boolean;
}

export interface RotationRun {
  shoeId: string;
  date: string; // 'YYYY-MM-DD'
  km?: number; // 이 런의 거리(마모 분산 tie-break 용). 없으면 0으로 취급.
}

export interface RotationPick {
  shoe: RotationShoe;
  score: number;
  reason: string;
}

// runType → 선호 카테고리(우선 매칭). 비슷한 자극·완충을 주는 카테고리를 함께 묶어,
// 정확히 한 카테고리만 가진 사용자도 추천을 받을 수 있게 한다. 첫 항목이 가장 전형적.
export const RUNTYPE_CATEGORIES: Record<RunType, ShoeCategory[]> = {
  easy: ['daily_trainer', 'max_cushion', 'stability'],
  recovery: ['max_cushion', 'daily_trainer', 'stability'],
  long: ['max_cushion', 'daily_trainer', 'super_trainer'],
  tempo: ['tempo', 'super_trainer'],
  race: ['carbon_racing', 'super_trainer'],
};

// 화면 reason 문구용 한국어 라벨(토큰 아님 — 순수 카피).
const RUNTYPE_LABEL: Record<RunType, string> = {
  easy: '이지런',
  recovery: '회복런',
  long: '롱런',
  tempo: '템포',
  race: '레이스',
};

const CATEGORY_LABEL: Record<ShoeCategory, string> = {
  daily_trainer: '데일리화',
  max_cushion: '쿠션화',
  stability: '안정화',
  super_trainer: '슈퍼트레이너',
  tempo: '템포화',
  carbon_racing: '카본화',
  trail: '트레일화',
};

/** 브랜드/모델 문자열 정규화(대소문자·여백 무시) — data/shoeModels 와 동일 규약. */
function normalize(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 한 신발의 카테고리. 1) brand+model 정확 매칭 → 그 모델의 category.
 * 2) 미매칭(커스텀/오타) → 브랜드 폴백: 같은 브랜드의 최빈 카테고리로 추정(카탈로그
 * 등장 순서로 동률 해소). 3) 브랜드도 카탈로그에 없으면 undefined.
 */
export function categoryForShoe(shoe: RotationShoe): ShoeCategory | undefined {
  const exact = findShoeModel(shoe.brand, shoe.model);
  if (exact) return exact.category;
  return dominantCategoryForBrand(shoe.brand);
}

/** 같은 브랜드 카탈로그 모델 중 최빈 카테고리(브랜드 폴백). 없으면 undefined. */
function dominantCategoryForBrand(brand: string): ShoeCategory | undefined {
  const b = normalize(brand);
  if (!b) return undefined;
  const counts = new Map<ShoeCategory, number>();
  let best: ShoeCategory | undefined;
  let bestN = 0;
  for (const m of SHOE_MODELS) {
    if (normalize(m.brand) !== b) continue;
    const n = (counts.get(m.category) ?? 0) + 1;
    counts.set(m.category, n);
    if (n > bestN) {
      bestN = n;
      best = m.category; // 첫 등장(카탈로그 순)이 동률 시 유지된다
    }
  }
  return best;
}

/** 한 신발의 마지막 착용일('YYYY-MM-DD'). 해당 런이 없으면 null(=한 번도 안 신음). */
function lastWorn(shoeId: string, runs: RotationRun[]): string | null {
  let latest: string | null = null;
  for (const r of runs) {
    if (!r || r.shoeId !== shoeId) continue;
    const d = r.date ? String(r.date).slice(0, 10) : '';
    if (!d) continue;
    if (latest === null || d > latest) latest = d;
  }
  return latest;
}

/** 'YYYY-MM-DD' 두 날짜 사이의 일수(b - a). DST 안전(로컬 자정 차). */
function daysBetween(a: string, b: string): number {
  const md = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  return Math.max(0, Math.round((md(b) - md(a)) / 86400000));
}

/**
 * 더 오래 쉰 쪽이 음수(=앞). 미착용(null)은 가장 오래 쉰 것으로 최우선.
 * 동률이면 0(입력 순서 유지).
 */
function compareRest(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1; // a 미착용 → 가장 오래 쉼 → 앞
  if (b === null) return 1;
  return a < b ? -1 : 1; // 더 이른 날짜가 더 오래 쉼 → 앞
}

interface Enriched {
  shoe: RotationShoe;
  cat: ShoeCategory | undefined;
  lastWorn: string | null;
  totalKm: number; // 신발별 누적거리 합(Σ km) — 마모 분산 3차 tie-break
  runCount: number; // 런 횟수 — 거리 동률 시 4차 보조 tie-break
  matches: boolean;
}

function reasonFor(
  e: Enriched,
  runType: RunType | undefined,
  refDate: string | null,
  hasCarbon: boolean,
): string {
  const parts: string[] = [];

  // ① 휴식 정보
  if (e.lastWorn === null) {
    parts.push('아직 안 신은 신발');
  } else if (refDate) {
    const d = daysBetween(e.lastWorn, refDate);
    parts.push(d <= 0 ? '오늘 신은 신발' : `${d}일 휴식`);
  } else {
    parts.push('충분히 쉰 신발');
  }

  // ② 카테고리/분산 노트
  if (runType && e.matches && e.cat) {
    parts.push(`${RUNTYPE_LABEL[runType]}엔 ${CATEGORY_LABEL[e.cat]}`);
  } else if (e.cat === 'carbon_racing') {
    parts.push('카본화 · 레이스용으로 아껴요');
  } else if (!runType && hasCarbon) {
    // 휴식·분산 기본 추천: 카본화를 쉬게 하고 데일리/쿠션으로 마모를 분산.
    parts.push('카본화는 쉬게');
  } else {
    parts.push('마모 분산');
  }

  return parts.join(' · ');
}

/**
 * 신발 로테이션 추천. 활성(보관 안 된) 신발이 2켤레 미만이면 [](로테이션 무의미).
 * 그렇지 않으면 모든 활성 신발을 우선순위대로 정렬해 RotationPick[] 로 돌려준다:
 *   1) (runType 있을 때) 해당 카테고리 매칭 신발 우선
 *   2) 더 오래 쉰(마지막 착용일이 더 이른; 미착용=최우선) 신발 — 폼 회복
 *   3) 누적거리(Σ km) 적은 신발 — 마모 분산(런 수가 아니라 실제 마모량)
 *   4) 거리 동률이면 런 수 적은 신발 — 보조 tie-break
 * score 는 정렬 결과를 반영한 점수(클수록 우선). 동률은 입력 순서 유지(stable sort).
 *
 * today 가 주어지면 reason 의 휴식 일수를 그 기준으로 계산한다(미지정 시 런 기록 중
 * 가장 최근 날짜를 기준으로 삼아 결정적·순수성 유지).
 */
export function recommendRotation(input: {
  shoes: RotationShoe[];
  runs: RotationRun[];
  runType?: RunType;
  today?: string;
}): RotationPick[] {
  const {shoes = [], runs = [], runType, today} = input || ({} as typeof input);
  const active = (shoes || []).filter((s) => s && !s.retired);
  if (active.length < 2) return [];

  const preferred = runType ? RUNTYPE_CATEGORIES[runType] : null;

  const enriched: Enriched[] = active.map((shoe) => {
    const cat = categoryForShoe(shoe);
    const worn = lastWorn(shoe.id, runs);
    const own = (runs || []).filter((r) => r && r.shoeId === shoe.id);
    // 누적거리 = 신발별 모든 런의 km 합. 음수/NaN/누락은 0으로 방어(데이터 안전).
    const totalKm = own.reduce((sum, r) => {
      const km = Number(r.km);
      return sum + (Number.isFinite(km) && km > 0 ? km : 0);
    }, 0);
    const matches = !!(preferred && cat && preferred.includes(cat));
    return {shoe, cat, lastWorn: worn, totalKm, runCount: own.length, matches};
  });

  enriched.sort((a, b) => {
    // ① 카테고리 매칭 우선(runType 있을 때만 의미)
    if (a.matches !== b.matches) return a.matches ? -1 : 1;
    // ② 더 오래 쉰 신발 우선(폼 회복)
    const rest = compareRest(a.lastWorn, b.lastWorn);
    if (rest !== 0) return rest;
    // ③ 누적거리(Σ km) 적은 신발 우선 — 실제 마모량 분산(run 수 대용 아님:
    //    30km 1회 > 9km 3회를 올바르게 '더 마모됨'으로 판정).
    if (a.totalKm !== b.totalKm) return a.totalKm - b.totalKm;
    // ④ 거리까지 같으면 런 수 적은 신발 우선(보조 tie-break)
    if (a.runCount !== b.runCount) return a.runCount - b.runCount;
    return 0; // 동률 → 입력 순서 유지
  });

  // reason 기준일: today > 런 기록 중 최신 날짜. 휴식 일수 표시에만 쓴다.
  const refDate =
    today ??
    (runs || []).reduce<string | null>((max, r) => {
      const d = r && r.date ? String(r.date).slice(0, 10) : '';
      if (!d) return max;
      return max === null || d > max ? d : max;
    }, null);
  const hasCarbon = enriched.some((e) => e.cat === 'carbon_racing');

  return enriched.map((e, i) => ({
    shoe: e.shoe,
    score: enriched.length - i, // 클수록 우선(1위가 최고점)
    reason: reasonFor(e, runType, refDate, hasCarbon),
  }));
}
