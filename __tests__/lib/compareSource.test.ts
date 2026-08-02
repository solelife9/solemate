/**
 * 스펙 표에 세울 신발 — **손검수 표가 카탈로그를 이긴다.**
 *
 * 2026-08-02 AUDIT 4 Q-1 이전엔 스펙 표만 이 규칙을 건너뛰고 카탈로그를 직접 읽었다.
 * 그래서 「러닝화 찾기」 한 화면에서 후보 줄의 문구(shoeSpecModel = 손검수 우선)와
 * 표의 숫자(카탈로그)가 다른 소스에서 나왔고, 71켤레 중 28켤레가 실제로 어긋났다.
 * Nike Structure 26 은 무게가 236g/295g — 우리가 "체감된다"고 정한 기준(30g)의 두 배다.
 *
 * @format
 */
import {toCompareShoe, unknownCompareShoe} from '../../lib/compareSource';
import {findCatalogShoe} from '../../lib/shoeCatalogLookup';
import {lookupOfficialSpec} from '../../lib/shoeSpecModel';
import specsData from '../../data/shoeSpecs.json';

const SPECS = (specsData as any).specs as Record<string, any>;
const doc = (brand: string, model: string) => findCatalogShoe(brand, model)!;

describe('손검수가 이긴다', () => {
  test('무게가 다르면 손검수 값이 나온다', () => {
    const key = 'ASICS|Superblast 3';
    const d = doc('ASICS', 'Superblast 3');
    expect(SPECS[key].weightG).not.toBe(d.weight);          // 전제: 실제로 다르다
    expect(toCompareShoe(d).weight).toBe(SPECS[key].weightG);
  });

  test('잰 사이즈도 무게를 따라온다 — 무게만 가져오고 기준을 두고 오면 거짓이 된다', () => {
    const c = toCompareShoe(doc('ASICS', 'Superblast 3'));
    expect(c.weightBasis).toBe(SPECS['ASICS|Superblast 3'].basis);   // 'US9.5'
    expect(c.weightBasis).not.toBe(doc('ASICS', 'Superblast 3').weightBasis);
  });

  test('손검수에 없는 신발은 카탈로그 그대로', () => {
    const d = doc('Nike', 'Vomero 18');
    const c = toCompareShoe(d);
    // Vomero 18 은 표에 힐만 있고 무게가 없다 → 무게는 카탈로그가 메운다.
    expect(c.weight).toBe(d.weight);
  });

  test('표에도 카탈로그에도 없는 축은 빈다 — 지어내지 않는다', () => {
    const c = unknownCompareShoe('직접', '넣은 신발', null);
    expect(c.weight).toBeNull();
    expect(c.drop).toBeNull();
    expect(c.stackHeight).toBeNull();
  });
});

describe('세 숫자가 서로 모순되지 않는다', () => {
  // 손검수 표는 힐만 적고 앞발은 안 적는다. 힐만 바꾸고 카탈로그 앞발을 그대로 두면
  // "힐 46.5 · 앞발 34 · 드롭 8" 처럼 검산이 안 되는 세 숫자가 표에 나란히 뜬다.
  test('손검수 힐이 카탈로그를 이기면 앞발을 비운다', () => {
    const d = doc('ASICS', 'Novablast 6');
    const table = SPECS['ASICS|Novablast 6'];
    expect(table.stackHeelMm).not.toBe(d.stackHeight?.heel);   // 전제: 힐이 다르다
    const c = toCompareShoe(d);
    expect(c.stackHeight?.heel).toBe(table.stackHeelMm);
    expect(c.stackHeight?.forefoot).toBeUndefined();
  });

  test('힐이 같으면 앞발은 그대로 남는다', () => {
    const d = doc('Nike', 'Pegasus 41');
    const c = toCompareShoe(d);
    if (d.stackHeight?.heel === c.stackHeight?.heel) {
      expect(c.stackHeight?.forefoot).toBe(d.stackHeight?.forefoot);
    }
  });
});

describe('규칙은 한 곳에만 있다', () => {
  test('compareSource 와 shoeSpecModel 이 같은 무게를 말한다', () => {
    // 두 화면(스펙 표 / 후보 추천)이 같은 소스를 보게 된 것이 이 수정의 전부다.
    for (const key of Object.keys(SPECS).slice(0, 40)) {
      const [brand, model] = key.split('|');
      const d = findCatalogShoe(brand, model);
      if (!d) continue;
      const viaTable = toCompareShoe(d).weight;
      const viaModel = lookupOfficialSpec(d.brand, model)?.weightG ?? null;
      if (viaModel != null) expect(viaTable).toBe(viaModel);
    }
  });
});
