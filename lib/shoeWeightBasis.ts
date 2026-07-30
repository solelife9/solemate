// ─── lib/shoeWeightBasis.ts — 무게를 잰 사이즈를 mm 로 통일 (순수) ───────────────
//
// 왜 mm 인가: 소스마다 표기가 다르다. 같은 사이즈를 `US9`·`M9`·`사이즈 9`·
// `유니섹스 사이즈 9`·`US9(유니섹스)` 로 적어 놓으면, 문자열이 다르다는 이유로
// **같은 기준인데 비교가 막힌다.** mm 는 성별·지역 표기에 흔들리지 않는 단일 척도다.
//
// ⚠ 이건 **무게 환산이 아니다.** 사이즈 이름을 같은 사이즈의 다른 표기로 바꾸는 것뿐이다
// (US 남성 9 = 270mm 은 브랜드 사이즈표의 정의다). 무게 숫자는 절대 손대지 않는다
// — 그건 측정이 아니라 추정이 된다(docs/shoes-spec.md §1).
//
// 모르면 null 이다. **`null` 을 270mm 로 가정하지 않는다** — 모르는 것과 270mm 인 것은
// 다르고, 비교 표는 이 둘을 다르게 다뤄야 한다.

/** 남성 US 사이즈 → mm. 사이즈표의 정의값이다(추정이 아니다). */
const MEN_US_MM: Readonly<Record<string, number>> = {
  '5': 230, '5.5': 235, '6': 240, '6.5': 245, '7': 250, '7.5': 255,
  '8': 260, '8.5': 265, '9': 270, '9.5': 275, '10': 280, '10.5': 285,
  '11': 290, '11.5': 295, '12': 300, '13': 310,
};

/** UK → mm (UK = 남성 US − 1). */
const UK_MM: Readonly<Record<string, number>> = {
  '6': 250, '6.5': 255, '7': 260, '7.5': 265, '8': 270, '8.5': 275,
  '9': 280, '9.5': 285, '10': 290, '11': 300,
};

/** EU → mm. */
const EU_MM: Readonly<Record<string, number>> = {
  '39': 245, '40': 250, '40.5': 255, '41': 260, '42': 265, '42.5': 270,
  '43': 275, '44': 280, '44.5': 285, '45': 290, '46': 295, '47': 300,
};

/** 여성 US → mm (여성 US = 남성 US + 1.5). */
const WOMEN_US_MM: Readonly<Record<string, number>> = {
  '6': 230, '6.5': 235, '7': 240, '7.5': 245, '8': 250, '8.5': 255,
  '9': 260, '9.5': 265, '10': 270, '10.5': 275, '11': 280,
};

/** 사이즈를 모른다고 **명시한** 표기들. 빈 문자열과 구분해 기록으로 남긴다. */
const UNKNOWN = /미표기|모름|unknown|미상/i;

const num = (s: string): string => {
  const n = Number(s);
  return Number.isInteger(n) ? String(n) : String(n);
};

/**
 * 어떤 표기든 `'270mm'` 꼴로 통일한다. 판단 못 하면 null.
 *
 * 받는 표기(실제 데이터에 있던 것들):
 *   `US9` `US 9.5` `M9` `US M8.5` `사이즈 9` `유니섹스 사이즈 9` `US9(유니섹스)`
 *   `265mm` `270mm` `UK9` `EU44` `M8.5/W9.5` `유니섹스 M6.0/W7.5` `기준 미표기`
 *
 * 성별이 섞인 표기(`M8.5/W9.5`)는 **남성 쪽**을 쓴다 — 우리 표준이 남성 사이즈다.
 */
export function normalizeWeightBasis(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || UNKNOWN.test(s)) return null;

  // 이미 mm
  const mm = s.match(/(\d{3})\s*mm/i);
  if (mm) return `${mm[1]}mm`;

  // 남녀 병기(M8.5/W9.5) — 남성 쪽만 본다
  const both = s.match(/M\s*(\d+(?:\.\d+)?)\s*\/\s*W\s*\d+(?:\.\d+)?/i);
  if (both) {
    const v = MEN_US_MM[num(both[1])];
    return v ? `${v}mm` : null;
  }

  // UK / EU
  const uk = s.match(/UK\s*(\d+(?:\.\d+)?)/i);
  if (uk) {
    const v = UK_MM[num(uk[1])];
    return v ? `${v}mm` : null;
  }
  const eu = s.match(/EU\s*(\d+(?:\.\d+)?)/i);
  if (eu) {
    const v = EU_MM[num(eu[1])];
    return v ? `${v}mm` : null;
  }

  // 여성 명시(W9 · 여성 8)
  const wm = s.match(/(?:^|[^A-Za-z])W\s*(\d+(?:\.\d+)?)|여성\s*(?:US\s*)?(\d+(?:\.\d+)?)/i);
  if (wm) {
    const v = WOMEN_US_MM[num(wm[1] ?? wm[2])];
    return v ? `${v}mm` : null;
  }

  // 남성/유니섹스/무표기 US 사이즈 — 우리 표준
  const men = s.match(/(?:US|M|사이즈)\s*(\d+(?:\.\d+)?)/i) ?? s.match(/^(\d+(?:\.\d+)?)$/);
  if (men) {
    const v = MEN_US_MM[num(men[1])];
    return v ? `${v}mm` : null;
  }
  return null;
}

/** 우리 표준 기준(남성 US9). 비교 표가 이 값일 때 라벨을 숨긴다. */
export const STANDARD_BASIS = '270mm';

/**
 * 두 신발의 무게를 **같은 잣대로 비교할 수 있는가.**
 * 하나라도 기준을 모르면 false — 모르는 걸 표준이라고 가정하면 없는 사실을 만든다.
 */
export function basisComparable(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeWeightBasis(a);
  const nb = normalizeWeightBasis(b);
  if (na == null || nb == null) return false;
  return na === nb;
}
