/**
 * 카탈로그 품질 가드 — **나빠지면 빨개진다.**
 *
 * 2026-08-02 AUDIT 4 는 스크립트로만 재던 숫자들이다. 그러면 데이터가 나빠져도
 * 아무도 모른다. 지금 수치를 상한/하한으로 못 박아 **회귀만 잡는다.**
 *
 * ── 이 파일의 규칙 ──────────────────────────────────────────────────────────
 * 임계값은 "지금보다 나빠지면 실패"로 잡는다. 좋아지면 숫자를 낮춰 조인다.
 * 반대로 **느슨하게 고치지 않는다** — 실패했는데 임계를 올리면 이 파일은 죽는다.
 *
 * @format
 */
import catalogData from '../data/shoeCatalog.json';
import {SHOE_CATEGORIES} from '../types/shoe';

type Doc = {
  id: string; brand: string; model: string; version?: string | null;
  variant?: string | null; collabWith?: string | null; category: string;
  weight?: number | null; weightBasis?: string | null; drop?: number | null;
  plate?: string | null; stackHeight?: {heel: number; forefoot: number} | null;
  defaultLifespanKm?: number | null; releaseYear?: number | null;
};
const CATALOG = catalogData as unknown as Doc[];
const name = (d: Doc) => `${d.brand} ${d.model} ${d.version ?? ''}`.trim();

describe('구조 — 여기서 깨지면 조회가 통째로 어긋난다', () => {
  test('id 가 중복되지 않는다', () => {
    const seen = new Set<string>(); const dup: string[] = [];
    for (const d of CATALOG) { if (seen.has(d.id)) dup.push(d.id); seen.add(d.id); }
    expect(dup).toEqual([]);
  });

  test('표시명이 중복되지 않는다 — 피커에서 같은 이름 두 줄은 고를 수 없다', () => {
    const seen = new Map<string, number>();
    for (const d of CATALOG) {
      const base = [d.model, d.version, d.variant].filter(Boolean).join(' ');
      const k = `${d.brand} ${base}${d.collabWith ? ` ×${d.collabWith}` : ''}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
  });

  test('카테고리는 아는 값만 쓴다', () => {
    const known = new Set<string>(SHOE_CATEGORIES);
    expect(CATALOG.filter(d => !known.has(d.category)).map(name)).toEqual([]);
  });

  test('권장 수명은 모두 있다 — 없으면 수명 링이 그려지지 않는다', () => {
    expect(CATALOG.filter(d => !d.defaultLifespanKm).map(name)).toEqual([]);
  });
});

describe('값 — 서로 검산되는 숫자들', () => {
  // 힐 − 앞발 = 드롭. 셋을 나란히 보여주므로 사용자가 검산한다.
  // 현재 4켤레가 1mm 어긋나 있다(반올림 규칙 차이로 추정). 늘어나면 실패.
  const KNOWN_DROP_MISMATCH = 4;

  const dropMismatches = () => CATALOG.filter(d => {
    const h = d.stackHeight?.heel, f = d.stackHeight?.forefoot;
    if (h == null || f == null || d.drop == null) return false;
    return Math.abs((h - f) - d.drop) > 0.6;
  });

  test(`드롭과 스택이 어긋난 신발이 ${KNOWN_DROP_MISMATCH}켤레를 넘지 않는다`, () => {
    const bad = dropMismatches().map(d => `${name(d)}: 힐${d.stackHeight!.heel} 앞발${d.stackHeight!.forefoot} 드롭${d.drop}`);
    expect(bad.length).toBeLessThanOrEqual(KNOWN_DROP_MISMATCH);
  });

  test('어긋나더라도 1.5mm 를 넘지 않는다 — 그건 반올림이 아니라 오류다', () => {
    const big = dropMismatches().filter(d =>
      Math.abs((d.stackHeight!.heel - d.stackHeight!.forefoot) - d.drop!) > 1.5).map(name);
    expect(big).toEqual([]);
  });

  test('힐은 앞발보다 낮지 않다 — 음수 드롭 신발은 우리 카탈로그에 없다', () => {
    const bad = CATALOG.filter(d => {
      const h = d.stackHeight?.heel, f = d.stackHeight?.forefoot;
      return h != null && f != null && h < f;
    }).map(name);
    expect(bad).toEqual([]);
  });

  test('드롭은 0~14mm 안에 있다', () => {
    expect(CATALOG.filter(d => d.drop != null && (d.drop < 0 || d.drop > 14)).map(name)).toEqual([]);
  });

  test('무게는 100~500g 안에 있다 — 밖이면 단위를 잘못 적은 것이다', () => {
    expect(CATALOG.filter(d => d.weight != null && (d.weight < 100 || d.weight > 500)).map(name)).toEqual([]);
  });

  test('권장 수명은 300~1200km 안에 있다', () => {
    const bad = CATALOG.filter(d => {
      const km = d.defaultLifespanKm; return km != null && (km < 300 || km > 1200);
    }).map(name);
    expect(bad).toEqual([]);
  });
});

describe('커버리지 — 채워질수록 조이는 숫자들', () => {
  const n = CATALOG.length;
  /** 비교 표가 그리는 네 축 중 몇 개를 띄울 수 있는가. */
  const axes = (d: Doc) =>
    (d.weight != null ? 1 : 0) + (d.stackHeight ? 1 : 0) +
    (d.drop != null ? 1 : 0) + (d.plate ? 1 : 0);

  test('카탈로그가 줄지 않는다', () => {
    expect(n).toBeGreaterThanOrEqual(618);
  });

  // AUDIT 4 시점 75켤레(12%). 늘면 "비교 표가 통째로 빈 신발"이 늘었다는 뜻이다.
  test('스펙이 통째로 빈 신발이 75켤레를 넘지 않는다', () => {
    expect(CATALOG.filter(d => axes(d) === 0).length).toBeLessThanOrEqual(75);
  });

  test('네 축을 다 띄우는 신발이 341켤레 아래로 내려가지 않는다', () => {
    expect(CATALOG.filter(d => axes(d) === 4).length).toBeGreaterThanOrEqual(341);
  });

  // 무게를 아는데 잰 사이즈를 모르면 **차이를 계산하지 못한다** — 무게가 있으나 마나다.
  test('무게는 아는데 잰 사이즈를 모르는 신발이 78켤레를 넘지 않는다', () => {
    expect(CATALOG.filter(d => d.weight != null && !d.weightBasis).length).toBeLessThanOrEqual(78);
  });

  // 검색 정렬이 연도 내림차순이라, 연도가 없으면 무조건 뒤로 밀린다.
  test('출시연도를 아는 신발이 191켤레 아래로 내려가지 않는다', () => {
    expect(CATALOG.filter(d => !!d.releaseYear).length).toBeGreaterThanOrEqual(191);
  });
});
