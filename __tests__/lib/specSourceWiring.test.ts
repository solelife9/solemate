// specSourceWiring.test.ts — 카탈로그 스펙이 '다음 신발'까지 도달하는지 (2026-07-30)
//
// 배경: 스펙이 두 곳에 따로 쌓이고 있었고, 화면마다 다른 쪽을 봤다.
//   · data/shoeSpecs.json   (71켤레)  → lib/shoeSpecModel → **다음 신발** 추천·비교
//   · data/shoeCatalog.json (491켤레) → lib/shoeCatalogLookup → **신발 비교** 화면
// 카탈로그에 채운 423켤레의 스펙이 '다음 신발'에는 도달하지 않아, CLAUDE.md 가 경고한
// 대로 그 축들이 조용히 빠져 있었다(같은 카테고리 안에선 쿠션·반발·안정이 전부 동일해
// 비교가 무의미해진다). lookupOfficialSpec 이 카탈로그를 폴백으로 읽게 이어붙였다.
//
// 이 테스트는 그 연결이 끊기면 바로 알려준다 — 끊겨도 앱은 멀쩡히 돌고 화면도 뜨기
// 때문에(축만 조용히 사라진다) 사람 눈으로는 회귀를 못 잡는다. 그게 원래 이 버그가
// 오래 살아남은 이유다.

import catalogData from '../../data/shoeCatalog.json';
import specsData from '../../data/shoeSpecs.json';
import {lookupOfficialSpec, buildShoeSpec} from '../../lib/shoeSpecModel';

type Doc = {
  brand: string;
  model: string;
  version?: string;
  variant?: string;
  weight?: number | null;
  drop?: number | null;
  stackHeight?: {heel?: number | null} | null;
};

const CATALOG = catalogData as unknown as Doc[];
const TABLE_KEYS = new Set(Object.keys((specsData as {specs: Record<string, unknown>}).specs));
const displayName = (d: Doc) => [d.model, d.version, d.variant].filter(Boolean).join(' ');
const hasSpec = (d: Doc) =>
  typeof d.weight === 'number' || typeof d.drop === 'number' || typeof d.stackHeight?.heel === 'number';

/** 표에는 없고 카탈로그에만 스펙이 있는 문서들 = 이 연결이 살려내는 대상. */
const CATALOG_ONLY = CATALOG.filter(d => hasSpec(d) && !TABLE_KEYS.has(`${d.brand}|${displayName(d)}`));

describe('카탈로그 스펙이 다음-신발 경로에 도달한다', () => {
  test('표에 없는 카탈로그 신발도 스펙이 조회된다', () => {
    // 대상이 있어야 이 테스트가 의미를 갖는다(카탈로그가 비면 조기 경보).
    expect(CATALOG_ONLY.length).toBeGreaterThan(100);

    const sample = CATALOG_ONLY.filter(d => typeof d.weight === 'number' && typeof d.stackHeight?.heel === 'number');
    expect(sample.length).toBeGreaterThan(0);

    const d = sample[0];
    const spec = lookupOfficialSpec(d.brand, displayName(d));
    expect(spec).toBeDefined();
    expect(spec!.weightG).toBe(d.weight);
    expect(spec!.stackHeelMm).toBe(d.stackHeight!.heel);
  });

  test('buildShoeSpec 이 그 값을 실제 비교 축으로 싣는다(무게 축이 살아난다)', () => {
    const d = CATALOG_ONLY.find(x => typeof x.weight === 'number')!;
    const spec = buildShoeSpec(d.brand, displayName(d));
    // 무게를 모르면 이 축이 통째로 빠진다 — 그게 원래 증상이었다.
    expect(spec.weightG).toBe(d.weight);
  });

  test('손으로 검수한 표가 카탈로그보다 우선한다(사람 확인값을 덮지 않는다)', () => {
    const key = [...TABLE_KEYS][0];
    const [brand, model] = key.split('|');
    const table = (specsData as any).specs[key];
    const spec = lookupOfficialSpec(brand, model);
    expect(spec).toBeDefined();
    if (table.weightG !== undefined) expect(spec!.weightG).toBe(table.weightG);
    if (table.dropMm !== undefined) expect(spec!.dropMm).toBe(table.dropMm);
    if (table.stackHeelMm !== undefined) expect(spec!.stackHeelMm).toBe(table.stackHeelMm);
  });

  test('어느 쪽에도 없으면 undefined — 모르는 값을 지어내지 않는다', () => {
    expect(lookupOfficialSpec('없는브랜드', '없는모델')).toBeUndefined();
  });
});
