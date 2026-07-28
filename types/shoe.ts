// ─── types/shoe.ts — 신발 카탈로그 스키마 정본 ────────────────────────────────
//
// 규칙 문서: docs/shoes-spec.md (충돌 시 문서가 우선 — 문서를 먼저 고치고 여기를 맞춘다)
//
// 설계에서 가장 중요한 한 가지: **필수 필드는 "키가 반드시 있어야 한다"는 뜻이지
// "값이 반드시 있어야 한다"가 아니다.** 모르는 값은 null 을 넣고 키는 남긴다.
// 키가 빠진 것("아직 아무도 안 봤다")과 null("확인했는데 공표된 값이 없다")은 다른
// 상태이고, 둘을 구분할 수 있어야 카탈로그가 낡는 걸 자동으로 잡아낼 수 있다.

/**
 * 신발 카테고리 — 러너가 그 신발을 **무엇에 쓰는가**로 나눈다.
 *  · daily     매일 신는 기본 트레이너
 *  · tempo     논카본 슈퍼트레이너(템포·장거리 겸용)
 *  · racing    카본 레이싱
 *  · trail     오프로드
 *  · stability 지지 구조(오버프로네이션)
 *  · recovery  맥스쿠션 — 회복주·롱런
 */
export type ShoeCategory =
  | 'daily'
  | 'tempo'
  | 'racing'
  | 'trail'
  | 'stability'
  | 'recovery';

export const SHOE_CATEGORIES: readonly ShoeCategory[] = [
  'daily', 'tempo', 'racing', 'trail', 'stability', 'recovery',
];

/**
 * 기존 시드(data/shoes.json)의 카테고리 어휘 → 신규 어휘.
 *
 * 이름만 다르고 1:1 로 대응한다. recovery ↔ max_cushion 만 의미가 느슨한데,
 * 맥스쿠션의 주 용도가 회복주·롱런이라 대응시켰다(docs/shoes-spec.md §2).
 */
export const LEGACY_CATEGORY_MAP: Readonly<Record<string, ShoeCategory>> = {
  daily_trainer: 'daily',
  super_trainer: 'tempo',
  carbon_racing: 'racing',
  trail: 'trail',
  stability: 'stability',
  max_cushion: 'recovery',
};

/**
 * 카테고리별 기본 수명(km). 개별 모델은 이 값을 **상속**한다.
 *
 * variant(LITE·GTX 등)는 오버라이드하지 않는다 — 갑피가 달라도 밑창 수명은 같고,
 * 파생마다 다른 수치를 쓰면 근거 없이 갈린다(docs/shoes-spec.md §3).
 */
export const DEFAULT_LIFESPAN_KM: Readonly<Record<ShoeCategory, number>> = {
  daily: 650,
  tempo: 650,
  racing: 450,
  trail: 650,
  stability: 700,
  recovery: 700,
};

/** 스택 높이(mm) — 힐/앞발. 한쪽만 아는 경우는 없다고 본다(둘 다 알거나 둘 다 모르거나). */
export interface StackHeight {
  heel: number;
  forefoot: number;
}

/**
 * 카탈로그의 신발 한 켤레.
 *
 * 모든 필드가 **필수 키**다. 값을 모르면 null 을 넣는다(위 헤더 참조).
 */
export interface ShoeDoc {
  /**
   * 슬러그 — 문서 id 이자 영구 키. 한 번 정하면 바꾸지 않는다(지난 기록이 참조한다).
   * 예: `hoka-mafate-speed-4-lite-satisfy-stsfy`
   */
  id: string;
  /** **실제 제조사**. 콜라보여도 만든 쪽을 적는다(Satisfy×Hoka → Hoka). */
  brand: string;
  /** 베이스 모델명. 버전 숫자는 빼고 적는다(`Mafate Speed`). */
  model: string;
  /**
   * 버전. 숫자가 없거나 **모델명 자체가 숫자**면 null.
   * norda 005 처럼 숫자가 모델명인 브랜드가 실재하므로 nullable 이어야 한다.
   */
  version: string | null;
  /** 특별판 표기(`LITE`·`GTX`·`Wide`). 없으면 null. */
  variant: string | null;
  /** 협업 상대(`Satisfy`). 없으면 null. 검색 대상이다. */
  collabWith: string | null;
  category: ShoeCategory;
  /** 무게(g) — **공표된 값 그대로**. 모르면 null. */
  weight: number | null;
  /**
   * 그 무게를 잰 사이즈(`US9`·`US9.5`·`US10`). 모르면 null.
   *
   * 환산하지 않는 대신 기준을 남긴다. US9.5에서 잰 값을 US9로 고쳐 적으면 그건 측정이
   * 아니라 추정이고, 그렇게 만든 숫자로 두 신발을 비교하면 없는 차이가 생긴다.
   */
  weightBasis: string | null;
  /** 드롭(mm). 모르면 null. */
  drop: number | null;
  /** 스택 높이(mm). 모르면 null. */
  stackHeight: StackHeight | null;
  releaseYear: number | null;
  /** 카테고리 기본값 상속(DEFAULT_LIFESPAN_KM). 공식 근거가 있을 때만 다른 값. */
  defaultLifespanKm: number;
  /** 단종 — 삭제 대신 이 플래그로만 표시한다(docs/shoes-spec.md §5). */
  discontinued: boolean;
  /** 한글표기·오타·축약형. 비어 있으면 검증에서 경고한다(검색이 약해진다). */
  searchAliases: string[];
  /** 공식 소스로 확인했는가. false = 채워 넣었지만 근거가 약함. */
  verified: boolean;
}

/** 신규 문서를 만들 때 쓰는 기본값 — 필수 키를 빠뜨리지 않게 한다. */
export function emptyShoeDoc(id: string, brand: string, model: string, category: ShoeCategory): ShoeDoc {
  return {
    id,
    brand,
    model,
    version: null,
    variant: null,
    collabWith: null,
    category,
    weight: null,
    weightBasis: null,
    drop: null,
    stackHeight: null,
    releaseYear: null,
    defaultLifespanKm: DEFAULT_LIFESPAN_KM[category],
    discontinued: false,
    searchAliases: [],
    verified: false,
  };
}

/**
 * 슬러그 생성 — 사람이 읽을 수 있고 안정적인 id.
 *
 * 소문자 + 하이픈. 한글·특수문자는 제거하지 않고 **하이픈으로 접는다**(정보 손실 대신 구분).
 * 같은 입력이면 항상 같은 결과다(결정적) — id 가 흔들리면 문서가 갈라진다.
 */
export function shoeSlug(parts: {
  brand: string;
  model: string;
  version?: string | null;
  variant?: string | null;
  collabWith?: string | null;
}): string {
  const seq = [parts.brand, parts.model, parts.version, parts.variant, parts.collabWith]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return seq
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 화면 표시명 — "Hoka Mafate Speed 4 LITE ×Satisfy". */
export function shoeDisplayName(s: Pick<ShoeDoc, 'model' | 'version' | 'variant' | 'collabWith'>): string {
  const base = [s.model, s.version, s.variant].filter(Boolean).join(' ');
  return s.collabWith ? `${base} ×${s.collabWith}` : base;
}
