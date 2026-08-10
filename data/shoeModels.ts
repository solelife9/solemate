/**
 * Keego 러닝화 권장 내구도 시드 데이터베이스 (single source of truth)
 *
 * 출처: .tenet/spec/shoe-database-2026-05-31.md (web-verified, 2026-05-31)
 *       + 2026-06-16 최신 모델 보강(web-verified): 슈퍼블래스트3 등 30개 추가, Altra·Topo 신규.
 * 6개 카테고리 · 19개 브랜드 · **332개 모델**(정본은 data/shoes.json — 이 주석이 아니라
 * `SHOE_MODELS.length` 를 믿을 것. 2026-07-28: 낡은 '164개' 표기가 외부 문서·투자자
 * 자료에 그대로 옮겨 적히는 사고가 있어 실측값으로 정정).
 *
 * 이 모듈은 화면(AddShoeScreen 등)의 인라인 MODELS/BRANDS와 App.tsx의
 * parseShoeName 브랜드 목록을 대체하는 데이터·로직 단일 소스다.
 */

// ────────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────────

/** 러닝화 카테고리 (스펙 §카테고리 매핑 표 참조) */
// 통합 단일 소스: data/shoes.json — 카탈로그(여기)와 분류(shoeClass)가 같은 파일을 읽는다.
import shoesData from './shoes.json';
import catalogData from './shoeCatalog.json';
// 카테고리 조회는 lib/shoeCatalogLookup 단일 소스를 쓴다(표기 정규화 사본 금지 —
// 'v14'↔'14' 같은 규칙이 두 벌이 되는 순간 한쪽만 고쳐져 조용히 어긋난다).
import {findCatalogShoe} from '../lib/shoeCatalogLookup';

export type ShoeCategory =
  | 'daily_trainer'
  | 'max_cushion'
  | 'stability'
  | 'super_trainer'
  | 'carbon_racing'
  | 'trail';

/** 시드 DB의 단일 신발 모델 레코드 */
export interface ShoeModel {
  brand: string;
  model: string;
  category: ShoeCategory;
  /** 권장 수명(km) — 기본은 카테고리 값, 필요 시 per-model 오버라이드 가능 */
  recommendedKm: number;
  /** 출시연도 */
  year: number;
  /**
   * 한글 표기·오타·축약형(카탈로그 `searchAliases`). **검색 전용 — 화면에 뜨지 않는다.**
   *
   * 여기까지 들고 오는 이유: 앱 UI 가 한국어인데 카탈로그 모델명은 전부 영문이다.
   * 이 필드가 없으면 "보스턴"·"에보"로 치는 사용자가 카탈로그에 있는 신발을 못 찾고,
   * 앱은 그걸 '없는 신발' 신호로 기록한다(2026-08-10 발견 — 618켤레 전부 별칭이
   * 있는데도 죽어 있었다).
   */
  aliases?: string[];
}

/** getRecommendedLifespanKm 인자 (모든 필드 선택적 — 정보가 적어도 합리적 기본값 반환) */
export interface RecommendInput {
  brand?: string;
  model?: string;
  category?: ShoeCategory;
  /** 선택적 체중(kg) — 권장값 보정용(가이드, 과학적 정밀치 아님) */
  weightKg?: number;
}

// ────────────────────────────────────────────────────────────
// 카테고리 → 권장 수명(km) 매핑
// ────────────────────────────────────────────────────────────

/**
 * 카테고리별 기본 교체 권장 거리(km) = 쿠셔닝(성능)이 유지되는 기준(실착 한계가 아님).
 * 안정화 700·쿠션화 700: 단단한 지지 폼 / 두꺼운 폼 볼륨으로 비교적 오래.
 * 데일리 650·슈퍼트레이너 650: 기준. 카본 450: PEBA 폼의 반발 수명(요즘 1세대보다 내구성↑).
 * 트레일 650: 지형 의존(로드화와 비슷). (경량 업템포화는 별도 카테고리 없이 슈퍼트레이너로 묶는다.)
 */
export const categoryLifespanKm: Record<ShoeCategory, number> = {
  daily_trainer: 650,
  max_cushion: 700,
  stability: 700,
  super_trainer: 650,
  carbon_racing: 450,
  trail: 650,
};

/** category 미지정·미매칭 시 사용하는 최종 기본값 (daily_trainer 기준) */
export const DEFAULT_LIFESPAN_KM = categoryLifespanKm.daily_trainer; // 650

/**
 * 권장 수명의 **출처 고지 문구**(UX 감사 ⑩ · 2026-08-04 신설, 2026-08-04 문구 재확정).
 *
 * 화면은 지금까지 "권장 650 km"만 보여줘서, 사용자는 그게 제조사 숫자인지 우리가 지어낸
 * 숫자인지 알 수 없었다 — 같은 앱이 스펙 비교 화면에서는 `lib/shoeSpecModel.SPEC_BASIS_KO`
 * 로 정확히 그 구분을 하는데 **수명에만 그 규율이 없었다.**
 *
 * **왜 '자료 기준'이라고 쓸 수 있나(중요):** 실제로 자료가 있다 —
 * `.tenet/knowledge/2026-05-31_research-running-shoe-durability-database.md`.
 * Nike 공식 교체 가이드 · RunRepeat · Marathon Handbook · Runners Need · Strava ·
 * Fleet Feet/Running Warehouse 를 **교차검증**해 카테고리별 base/range 를 잡았고,
 * 위 `categoryLifespanKm` 과 모델별 오버라이드가 그 결과다.
 *
 * **왜 '참고'이지 '권장'이 아닌가(중요):** 브랜드 공식 가이드는 실제로 참고했다 — sources 의
 * Nike "how often to replace" 가 그것이다. 하지만 **"브랜드 권장 650km"라고 쓰면 거짓**이 된다:
 * 그건 이 모델의 제조사 공표 수명으로 읽히는데, ASICS 신발에 붙는 650 은 Nike·매체·리테일러
 * 자료를 교차검증해 **우리가** 종류별로 잡은 값이다. '참고'는 근거로 삼았다는 뜻이고, 그건 사실이다.
 *
 * **왜 그 이상은 못 쓰나:** 그 문서의 confidence 는 `scanned-not-verified` 다. 우리가 원문을
 * 일차 검증하지 않았다. 그래서 "연구로 검증된"·"논문 기반" 같은 말은 쓰지 않는다.
 * 출처 종류를 둘 다 밝히는 것도 같은 이유다 — 가장 권위 있는 하나(브랜드)만 이름 대고 나머지를
 * 감추면, 틀린 말은 아니어도 **생략으로 신빙성을 부풀리는 것**이 된다.
 * (BRAND.md 판정 독립 · MISSION.md Truth only · CLAUDE.md "확인한 것만 넣는다")
 *
 * 화면은 이 상수만 참조한다(사본 금지).
 */
export const LIFESPAN_BASIS_KO = '브랜드 공식 교체 가이드·러닝 매체 자료 참고';

// 용도/태그(추천 러닝)는 사용자 정리 DB(data/shoes.json → data/shoeClass.ts)를 단일 소스로
// 쓴다. 여기서 카테고리→문구를 임의로 만들던 매핑은 제거(사용자 데이터로 대체).

// ────────────────────────────────────────────────────────────
// 시드 데이터 (164 모델)
// ────────────────────────────────────────────────────────────

const NEW_TO_LEGACY_CATEGORY: Readonly<Record<string, ShoeCategory>> = {
  daily: 'daily_trainer',
  tempo: 'super_trainer',
  racing: 'carbon_racing',
  trail: 'trail',
  stability: 'stability',
  recovery: 'max_cushion',
};

/**
 * 시드 모델 — 용도 태그·권장 수명은 data/shoes.json, **카테고리는 카탈로그**에서 온다.
 *
 * 전에는 두 파일이 카테고리를 각자 들고 있었고 SEED(=shoes.json)가 이겼다. 그래서
 * 같은 신발이 기준 카드에선 「슈퍼 트레이너」, 스펙 표에선 「데일리」로 보일 수 있었다
 * (민우님: "노바블라스트가 슈퍼트레이너야?" — 실제로 shoes.json 만 그렇게 적고 있었다).
 * 카테고리는 카탈로그 하나만 소유한다. 두 곳이 들고 있는 한 또 어긋난다.
 *
 * 카탈로그에 없으면 데일리로 떨어진다 — 그런 신발이 없도록 테스트가 막는다
 * (__tests__/data.categorySource.test.ts).
 */
/** 문서에서 검색 별칭만 뽑는다 — 형태가 이상하면 빈 배열(검색이 죽지 않게). */
function aliasesOf(doc: {searchAliases?: unknown} | null | undefined): string[] | undefined {
  const raw = doc?.searchAliases;
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return out.length ? out : undefined;
}

const SEED_MODELS: ShoeModel[] = (
  shoesData.shoes as Array<{brand: string; model: string; recommendedKm?: number; year?: number}>
).map((s) => {
  const doc = findCatalogShoe(s.brand, s.model);
  const category: ShoeCategory =
    (doc && NEW_TO_LEGACY_CATEGORY[String(doc.category)]) ?? 'daily_trainer';
  return {
    brand: s.brand,
    model: s.model,
    category,
    recommendedKm: Number.isFinite(s.recommendedKm as number)
      ? (s.recommendedKm as number)
      : (categoryLifespanKm[category] ?? DEFAULT_LIFESPAN_KM),
    year: s.year ?? 0,
    // 별칭은 카탈로그가 소유한다(시드에는 없다) — 조회된 문서에서 그대로 가져온다.
    aliases: aliasesOf(doc),
  };
});

/**
 * 새 카탈로그(data/shoeCatalog.json, docs/shoes-spec.md 스키마) → 이 파일의 레거시 형태.
 *
 * 카탈로그를 화면이 직접 읽게 갈아엎지 않는 이유: 용도 태그(추천 러닝)는 여전히
 * shoes.json 이 단일 소스고(data/shoeClass.ts), 그쪽을 같이 옮기지 않으면 태그가 통째로
 * 빈다. 그래서 **모델 목록만** 합친다 — 카탈로그에만 있는 신발이 등록 화면에 뜨는 게
 * 목적이고, 그건 이 한 겹으로 충분하다.
 */

/** 카탈로그 문서에서 이 파일이 쓰는 최소 형태(원격 문서도 같은 스키마다). */
export interface ShoeDocLike {
  brand: string;
  model: string;
  version?: string | null;
  variant?: string | null;
  collabWith?: string | null;
  category?: string;
  defaultLifespanKm?: number;
  releaseYear?: number | null;
  /** 한글 표기·오타·축약형 — 검색에만 쓴다. */
  searchAliases?: string[];
}

/**
 * 카탈로그 문서 → 레거시 모델. **깨진 문서는 null 을 돌려준다.**
 *
 * 원격(Firestore)에서 온 것도 이 함수를 통과한다. 서버가 이상한 걸 주더라도 목록이
 * 깨지지 않아야 한다 — 등록 화면은 앱의 핵심 동선이고, 카탈로그 갱신은 부가 기능이다.
 */
export function shoeDocToModel(s: ShoeDocLike | null | undefined): ShoeModel | null {
  if (!s || typeof s.brand !== 'string' || typeof s.model !== 'string') return null;
  const brand = s.brand.trim();
  const base = [s.model, s.version, s.variant]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .trim();
  if (!brand || !base) return null;
  const category = NEW_TO_LEGACY_CATEGORY[String(s.category)] ?? 'daily_trainer';
  return {
    brand,
    // 협업 표기를 모델명에 남긴다 — 사용자는 "새티스파이"로 찾는다.
    model: s.collabWith ? `${base} ×${s.collabWith}` : base,
    category,
    recommendedKm: Number.isFinite(s.defaultLifespanKm)
      ? (s.defaultLifespanKm as number)
      : (categoryLifespanKm[category] ?? DEFAULT_LIFESPAN_KM),
    year: Number.isFinite(s.releaseYear as number) ? (s.releaseYear as number) : 0,
    aliases: aliasesOf(s),
  };
}

/**
 * 목록 합치기 — **앞선 것이 이긴다.** 뒤에 오는 목록은 없는 모델만 채운다.
 *
 * 이 방향이 중요하다. 시드에는 사람이 손본 용도 태그·수명 오버라이드가 붙어 있고,
 * 원격 카탈로그는 서버가 언제든 바꿀 수 있다. 뒤가 이기게 하면 서버의 실수 한 번이
 * 사용자가 쓰던 분류를 덮어쓴다. 그래서 나중 소스는 **추가만** 할 수 있다.
 */
export function mergeShoeModels(...lists: readonly ShoeModel[][]): ShoeModel[] {
  const out: ShoeModel[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const m of list) {
      const k = `${normalize(m.brand)}|${normalize(m.model)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
  }
  return out;
}

const CATALOG_MODELS: ShoeModel[] = (catalogData as ShoeDocLike[])
  .map(shoeDocToModel)
  .filter((m): m is ShoeModel => m !== null);

/** 번들에 들어 있는 목록(시드 + 번들 카탈로그). 원격은 여기에 더해진다. */
export const SHOE_MODELS: ShoeModel[] = mergeShoeModels(SEED_MODELS, CATALOG_MODELS);

// ────────────────────────────────────────────────────────────
// 파생 데이터
// ────────────────────────────────────────────────────────────

/**
 * 시드 DB에서 파생한 브랜드 목록 (단일 소스).
 * 시드 등장 순서를 보존(중복 제거). App.tsx / AddShoeScreen 등 화면 코드가 import 한다.
 */
// 브랜드 칩/기본 선택 노출 순서 — 인기 브랜드를 앞에(알파벳순보다 사용자 친화). 우선순위
// 목록에 없는 브랜드는 뒤에 알파벳순으로 붙인다. (등록 화면 기본 브랜드 = BRANDS[0])
const BRAND_PRIORITY = [
  'Nike', 'Adidas', 'Asics', 'New Balance', 'Hoka', 'Saucony',
  'Brooks', 'Puma', 'On', 'Mizuno', 'Salomon', 'Altra',
];
const brandRank = (b: string): number => {
  const i = BRAND_PRIORITY.findIndex((p) => p.toLowerCase() === b.toLowerCase());
  return i === -1 ? BRAND_PRIORITY.length : i;
};
// 대소문자만 다른 같은 브랜드('ASICS' vs 'Asics')는 한 번만 노출한다(중복 칩 방지) —
// 비교는 normalize(소문자·여백 무시)로, 표기는 첫 등장값 유지. 시드가 흔들려도 UI 안 깨짐.
export function brandsFrom(models: readonly ShoeModel[]): string[] {
  return models.reduce<string[]>((acc, m) => {
    if (!acc.some((b) => normalize(b) === normalize(m.brand))) acc.push(m.brand);
    return acc;
  }, []).sort((a, b) => brandRank(a) - brandRank(b) || a.localeCompare(b));
}

export const BRANDS: string[] = brandsFrom(SHOE_MODELS);

// ────────────────────────────────────────────────────────────
// 매칭 헬퍼
// ────────────────────────────────────────────────────────────

/** 브랜드/모델 문자열 정규화(대소문자·여백 무시) */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 특정 브랜드의 모델명 목록(시드 순서) — AddShoe 모델 선택 UI용 */
export function modelsForBrand(brand: string): string[] {
  const b = normalize(brand);
  return SHOE_MODELS.filter((m) => normalize(m.brand) === b).map((m) => m.model);
}

/**
 * 주어진 brand(+model) 에 해당하는 시드 모델을 찾는다.
 * brand/model 미지정 시 undefined. 대소문자/여백 차이는 무시.
 */
export function findShoeModel(brand?: string, model?: string): ShoeModel | undefined {
  if (!brand || !model) return undefined;
  const b = normalize(brand);
  const m = normalize(model);
  return SHOE_MODELS.find(
    (s) => normalize(s.brand) === b && normalize(s.model) === m,
  );
}

// ────────────────────────────────────────────────────────────
// 추천 로직 (순수 함수)
// ────────────────────────────────────────────────────────────

/**
 * 체중 보정 계수 (가이드, 과학적 정밀치 아님 — 스펙 §추천 로직).
 * ≥90kg → ×0.85, ≤60kg → ×1.1, 그 외 → ×1.
 */
export function weightAdjustmentFactor(weightKg?: number): number {
  if (weightKg === undefined) return 1;
  if (weightKg >= 90) return 0.85;
  if (weightKg <= 60) return 1.1;
  return 1;
}

/**
 * 권장 수명(km)을 계산하는 순수 함수.
 *
 * 우선순위:
 *  1) brand + model 매칭 → 해당 모델의 recommendedKm (per-model 오버라이드 포함)
 *  2) 미매칭이지만 category 제공 → categoryLifespanKm[category]
 *  3) 둘 다 없으면 → DEFAULT_LIFESPAN_KM (daily_trainer 700)
 *
 * weightKg 가 주어지면 위 결과에 체중 보정 계수를 곱한 뒤 정수(km)로 반올림한다.
 */
export function getRecommendedLifespanKm(input: RecommendInput = {}): number {
  const { brand, model, category, weightKg } = input;

  const matched = findShoeModel(brand, model);
  let baseKm: number;
  if (matched) {
    baseKm = matched.recommendedKm;
  } else if (category && category in categoryLifespanKm) {
    baseKm = categoryLifespanKm[category];
  } else {
    baseKm = DEFAULT_LIFESPAN_KM;
  }

  const factor = weightAdjustmentFactor(weightKg);
  return Math.round(baseKm * factor);
}
