/**
 * 카테고리는 **카탈로그 하나만** 소유한다.
 *
 * 2026-08-02 이전엔 data/shoes.json 과 data/shoeCatalog.json 이 각자 카테고리를 들고
 * 있었고, 목록을 합칠 때 shoes.json 이 이겼다. 그래서 같은 신발이 러닝화 찾기 한
 * 화면 안에서 기준 카드는 「슈퍼 트레이너」, 스펙 표는 「데일리」로 보일 수 있었다
 * (민우님: "노바블라스트가 슈퍼트레이너야?" → shoes.json 만 그렇게 적고 있었다.
 * Superblast 가 슈퍼트레이너고 Novablast 는 데일리다).
 *
 * 이 스위트가 막는 것:
 *  · shoes.json 에 category 가 되살아나는 것
 *  · shoes.json 의 신발이 카탈로그에서 조회되지 않는 것(= 카테고리를 잃고 데일리로 떨어짐)
 *
 * @format
 */
import shoesData from '../data/shoes.json';
import catalogData from '../data/shoeCatalog.json';
import {findCatalogShoe} from '../lib/shoeCatalogLookup';
import {findShoeModel} from '../data/shoeModels';

const SHOES = (shoesData as {shoes: Array<Record<string, unknown>>}).shoes;
const CATALOG = catalogData as Array<Record<string, unknown>>;

describe('카테고리 단일 소스', () => {
  test('shoes.json 은 category 를 들지 않는다', () => {
    const offenders = SHOES.filter(s => 'category' in s)
      .map(s => `${s.brand} ${s.model}`);
    expect(offenders).toEqual([]);
  });

  test('shoes.json 의 모든 신발이 카탈로그에서 조회된다', () => {
    const missing = SHOES
      .filter(s => !findCatalogShoe(String(s.brand), String(s.model)))
      .map(s => `${s.brand} | ${s.model}`);
    // 하나라도 늘면 그 신발은 스펙 표에서 무게·드롭이 통째로 빈칸이 되고
    // 카테고리도 데일리로 조용히 떨어진다. 목록으로 남겨 눈에 띄게 한다.
    expect(missing).toEqual([]);
  });

  test('카탈로그의 모든 카테고리는 아는 값이다', () => {
    const known = new Set(['daily', 'tempo', 'racing', 'trail', 'stability', 'recovery']);
    const bad = CATALOG.filter(d => !known.has(String(d.category)))
      .map(d => `${d.id}: ${d.category}`);
    expect(bad).toEqual([]);
  });
});

describe('되찾은 진실', () => {
  test('Novablast 는 전 버전이 데일리다 — 5·6 만 슈퍼트레이너일 수 없다', () => {
    for (const v of ['3', '4', '5', '6']) {
      expect(findShoeModel('ASICS', `Novablast ${v}`)?.category).toBe('daily_trainer');
    }
  });

  test('슈퍼트레이너는 Superblast 다', () => {
    expect(findShoeModel('ASICS', 'Superblast 2')?.category).toBe('super_trainer');
    expect(findShoeModel('ASICS', 'Superblast 3')?.category).toBe('super_trainer');
  });
});

describe('표기가 달라도 같은 신발로 본다', () => {
  // 두 파일이 버전을 다르게 적어(1080v14 ↔ 1080 14) 34켤레가 서로를 못 찾고 있었다.
  test.each([
    ['New Balance', 'Fresh Foam X 1080v14'],
    ['New Balance', 'Fresh Foam X 880v15'],
    ['New Balance', 'FuelCell Rebel v4'],
    ['New Balance', 'FuelCell SC Elite v5'],       // 카탈로그는 SuperComp
    ['New Balance', 'FuelCell SC Trainer v2'],
    ['Adidas', 'Boston 12'],                        // 카탈로그는 Adizero Boston 12
    ['Adidas', 'Adios Pro 4'],                      // 콜라보판이 아니라 본판을 골라야 한다
    ['Nike', 'React Infinity Run 3'],               // 카탈로그는 Infinity Run 3
  ])('%s %s 를 찾는다', (brand, model) => {
    expect(findCatalogShoe(brand, model)).not.toBeNull();
  });

  test('v 로 시작하는 모델명은 건드리지 않는다', () => {
    expect(findCatalogShoe('Nike', 'Vomero 18')).not.toBeNull();
    expect(findCatalogShoe('Nike', 'Vaporfly 3')).not.toBeNull();
  });

  test('짧은 조각으로는 엉뚱한 걸 물지 않는다', () => {
    expect(findCatalogShoe('Nike', '3')).toBeNull();
    expect(findCatalogShoe('Adidas', 'Pro')).toBeNull();
  });
});
