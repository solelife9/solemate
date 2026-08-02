/**
 * 러닝화 스펙 표 — 계약.
 *
 * 표는 화면이 아니라 **상태 없는 조각**이다(2026-08-02). 무엇을 담고 무엇이 기준인지는
 * 호출부(FindShoesScreen)가 안다. 그래서 여기서는 "받은 것을 옳게 그리는가"와
 * "누르면 옳은 신호를 보내는가"만 본다 — 담고 빼는 실제 동작은 FindShoesScreen 테스트가.
 *
 * 지키는 것:
 *  · 「기준」 칩은 배지다 — 눌러도 아무 일이 없다(누르면 신발이 사라지던 시절의 재발 방지)
 *  · 빼기는 ✕ 하나로만
 *  · 카탈로그에 없는 신발도 세워진다 — 이름만 남더라도
 *  · 5켤레가 차면 더 못 넣는다(가로 스와이프로 보되 목록이 되진 않는다)
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShoeCompareTable from '../ShoeCompareTable';
import {findCatalogShoe, toCompareShoe, unknownCompareShoe} from '../lib/shoeCatalogLookup';
import {MAX_COMPARE, type CompareShoe} from '../lib/shoeCompareTable';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') { out += String(n) + ' '; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

const seedOf = (brand: string, model: string, mine: {usedKm: number; lifespanKm: number} | null = null) =>
  toCompareShoe(findCatalogShoe(brand, model)!, mine);

type Handlers = {onSetBase: jest.Mock; onRemove: jest.Mock; onAdd: jest.Mock};

async function mount(shoes: CompareShoe[], baseIdx = 0) {
  const h: Handlers = {onSetBase: jest.fn(), onRemove: jest.fn(), onAdd: jest.fn()};
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <ShoeCompareTable shoes={shoes} baseIdx={baseIdx} {...h} />,
    );
  });
  return {r, ...h};
}

const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n: any) => n.props?.testID === id);

const SUPERBLAST = 'asics-superblast-3';
const PEGASUS = 'nike-pegasus-42';

describe('카탈로그 조회', () => {
  it('브랜드+모델로 찾는다', () => {
    expect(findCatalogShoe('Nike', 'Pegasus 42')?.id).toBe('nike-pegasus-42');
  });

  it('한글 별칭으로도 찾는다', () => {
    expect(findCatalogShoe('Nike', '페가수스 42')?.id).toBe('nike-pegasus-42');
  });

  it('없으면 null — 지어내지 않는다', () => {
    expect(findCatalogShoe('Nike', '있을 리 없는 모델')).toBeNull();
  });
});

describe('빈 상태', () => {
  it('아무것도 없으면 추가를 권한다', async () => {
    const {r} = await mount([]);
    expect(textOf(r.toJSON())).toContain('추가해 보세요');
  });

  it('빈 상태에서도 추가 버튼은 살아 있다', async () => {
    const {r, onAdd} = await mount([]);
    await act(async () => { byId(r, 'compare-add')[0].props.onPress(); });
    expect(onAdd).toHaveBeenCalled();
  });
});

describe('그리기', () => {
  it('스펙 숫자가 뜬다', async () => {
    const {r} = await mount([seedOf('ASICS', 'Superblast 3')]);
    const t = textOf(r.toJSON());
    expect(t).toContain('Superblast 3');
    expect(t).toContain('230');   // 무게 g
  });

  it('칸마다 종류를 적는다 — 296g 이 무거운지는 종류를 알아야 판단된다', async () => {
    const {r} = await mount([seedOf('Nike', 'Pegasus 42')]);
    expect(textOf(r.toJSON())).toContain('데일리');
  });

  it('내 신발이면 그렇다고 적는다', async () => {
    const {r} = await mount([seedOf('ASICS', 'Superblast 3', {usedKm: 100, lifespanKm: 650})]);
    expect(textOf(r.toJSON())).toContain('내 신발');
  });

  it('남은 수명 막대는 없다 — 스펙 비교에 수명 잔량은 축이 아니다', async () => {
    const {r} = await mount([seedOf('ASICS', 'Superblast 3', {usedKm: 100, lifespanKm: 650})]);
    expect(textOf(r.toJSON())).not.toContain('남은 수명');
  });

  it('카탈로그에 없는 신발도 이름만으로 세워진다 — 모르는 축은 빈칸', async () => {
    // 혼자 두면 값이 하나도 없어 행 자체가 빠진다(빈 표를 만들지 않는 게 맞다).
    // 아는 신발과 나란히 놓아야 '빈칸이 있다'는 사실이 보인다.
    const {r} = await mount([seedOf('ASICS', 'Superblast 3'), unknownCompareShoe('직접', '넣은 신발', null)]);
    const t = textOf(r.toJSON());
    expect(t).toContain('넣은 신발');
    expect(t).toContain('—');
  });

  it('혼자 있는 미등록 신발은 빈 표를 만들지 않는다', async () => {
    const {r} = await mount([unknownCompareShoe('직접', '넣은 신발', null)]);
    const t = textOf(r.toJSON());
    expect(t).toContain('넣은 신발');
    expect(t).not.toContain('무게');   // 아무 값도 없으면 행이 아예 없다
  });

  it('기준 대비 차이를 적는다', async () => {
    const {r} = await mount([seedOf('ASICS', 'Superblast 3'), seedOf('Nike', 'Pegasus 42')]);
    expect(textOf(r.toJSON())).toContain('+62');   // 230g → 292g
  });

  it('기준이 바뀌면 부호가 뒤집힌다', async () => {
    const {r} = await mount([seedOf('ASICS', 'Superblast 3'), seedOf('Nike', 'Pegasus 42')], 1);
    expect(textOf(r.toJSON())).toContain('−62');
  });
});

describe('기준 전환과 빼기', () => {
  const two = () => [seedOf('ASICS', 'Superblast 3'), seedOf('Nike', 'Pegasus 42')];

  it('기준 칩은 눌러도 아무 일이 없다 — 배지다', async () => {
    const {r} = await mount(two());
    expect(byId(r, `compare-base-${SUPERBLAST}`)[0].props.onPress).toBeUndefined();
  });

  it('「기준으로」는 그 칸을 기준으로 삼으라고 알린다', async () => {
    const {r, onSetBase} = await mount(two());
    await act(async () => { byId(r, `compare-setbase-${PEGASUS}`)[0].props.onPress(); });
    expect(onSetBase).toHaveBeenCalledWith(1);
  });

  it('기준 칸에는 「기준으로」가 없다 — 자기를 기준 삼을 수 없다', async () => {
    const {r} = await mount(two());
    expect(byId(r, `compare-setbase-${SUPERBLAST}`)).toHaveLength(0);
  });

  it('✕ 로만 빠진다', async () => {
    const {r, onRemove} = await mount(two());
    await act(async () => { byId(r, `compare-remove-${PEGASUS}`)[0].props.onPress(); });
    expect(onRemove).toHaveBeenCalledWith(PEGASUS);
  });
});

describe('상한', () => {
  const five = () => ([
    'Superblast 3', 'Novablast 5', 'Novablast 6', 'Gel-Nimbus 27', 'Gel-Cumulus 27',
  ].map(m => findCatalogShoe('ASICS', m)).filter(Boolean).slice(0, MAX_COMPARE)
    .map(d => toCompareShoe(d!, null)));

  it('테스트 자료가 상한만큼 있다', () => {
    expect(five()).toHaveLength(MAX_COMPARE);
  });

  it('상한이 차면 더 넣지 못한다', async () => {
    const {r} = await mount(five());
    expect(byId(r, 'compare-add')[0].props.disabled).toBe(true);
    expect(textOf(r.toJSON())).toContain(`${MAX_COMPARE}켤레까지`);
  });

  it('상한 아래면 넣을 수 있다', async () => {
    const {r} = await mount(five().slice(0, MAX_COMPARE - 1));
    expect(byId(r, 'compare-add')[0].props.disabled).toBe(false);
  });
});
