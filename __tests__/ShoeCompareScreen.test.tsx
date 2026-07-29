/**
 * 러닝화 비교 화면 — 계약.
 *
 * 지키는 것:
 *  · 기준(첫 칸)은 뺄 수 있어도 화면이 깨지지 않는다
 *  · 3켤레가 차면 더 못 넣는다(한 화면에 안 들어오는 비교는 비교가 아니다)
 *  · 카탈로그에 없는 내 신발도 세워진다 — 이름만 남더라도
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShoeCompareScreen from '../ShoeCompareScreen.rn';
import {findCatalogShoe, toCompareShoe, unknownCompareShoe} from '../lib/shoeCatalogLookup';

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

async function mount(seed: any = null) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<ShoeCompareScreen seed={seed} onClose={jest.fn()} />);
  });
  return r;
}

const byId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n.props?.testID === id);

/** 추가 시트에서 검색 → 첫 결과 고르기. 빈 질의는 상위 40건만 나와 못 찾을 수 있다. */
async function addBySearch(r: ReactTestRenderer.ReactTestRenderer, query: string, label: RegExp) {
  await act(async () => { byId(r.root, 'compare-add')[0].props.onPress(); });
  const input = byId(r.root, 'compare-search')[0];
  await act(async () => { input.props.onChangeText(query); });
  const [pick] = pressables(r.root, label);
  await act(async () => { pick.props.onPress(); });
}

const pressables = (root: ReactTestRenderer.ReactTestInstance, label: RegExp) =>
  root.findAll((n: any) =>
    n.props?.accessibilityRole === 'button' && label.test(String(n.props?.accessibilityLabel ?? '')));

describe('카탈로그 조회', () => {
  it('브랜드+모델로 찾는다', () => {
    expect(findCatalogShoe('Nike', 'Pegasus 42')?.id).toBe('nike-pegasus-42');
  });

  it('한글 별칭으로도 찾는다', () => {
    expect(findCatalogShoe('Nike', '페가수스 42')?.id).toBe('nike-pegasus-42');
  });

  it('브랜드가 다르면 매칭하지 않는다 — 남의 스펙을 내 신발이라 하지 않는다', () => {
    expect(findCatalogShoe('Hoka', 'Pegasus 42')).toBeNull();
  });

  it('없는 신발은 null', () => {
    expect(findCatalogShoe('Nike', '있을 리 없는 모델 zzz')).toBeNull();
  });

  it('카탈로그에 없어도 비교에 세울 형태를 만들 수 있다', () => {
    const u = unknownCompareShoe('직접입력', '내 신발', {usedKm: 100, lifespanKm: 600});
    expect(u.name).toBe('내 신발');
    expect(u.weight).toBeNull();
    expect(u.mine?.usedKm).toBe(100);
  });
});

describe('빈 상태', () => {
  it('아무것도 없으면 추가를 권한다', async () => {
    const r = await mount();
    expect(textOf(r.root)).toContain('비교할 러닝화를 추가해 보세요');
  });

  it('추가 버튼이 살아 있다', async () => {
    const r = await mount();
    const btn = byId(r.root, 'compare-add')[0];
    expect(btn.props.disabled).toBe(false);
  });
});

describe('기준 신발', () => {
  const seed = () => {
    const d = findCatalogShoe('ASICS', 'Superblast 3')!;
    return toCompareShoe(d, {usedKm: 412, lifespanKm: 650});
  };

  it('기준으로 세워지고 스펙이 뜬다', async () => {
    const r = await mount(seed());
    const t = textOf(r.root);
    expect(t).toContain('Superblast 3');
    expect(t).toContain('기준');
    expect(t).toContain('230'); // 무게
  });

  it('내 신발이면 남은 수명이 표 밖에 붙는다', async () => {
    const r = await mount(seed());
    expect(textOf(r.root)).toContain('남은 수명');
    expect(textOf(r.root)).toContain('238');
  });

  it('내 신발이 아니면 남은 수명 줄이 없다', async () => {
    const d = findCatalogShoe('ASICS', 'Superblast 3')!;
    const r = await mount(toCompareShoe(d, null));
    expect(textOf(r.root)).not.toContain('남은 수명');
  });

  it('기준을 빼면 빈 상태로 돌아간다(깨지지 않는다)', async () => {
    const r = await mount(seed());
    const [rm] = pressables(r.root, /비교에서 빼기/);
    await act(async () => { rm.props.onPress(); });
    expect(textOf(r.root)).toContain('비교할 러닝화를 추가해 보세요');
  });
});

describe('추가와 상한', () => {
  const seedOf = (brand: string, model: string) =>
    toCompareShoe(findCatalogShoe(brand, model)!, null);

  it('3켤레가 차면 더 넣지 못한다', async () => {
    const r = await mount(seedOf('ASICS', 'Superblast 3'));
    const open = () => byId(r.root, 'compare-add')[0];

    await addBySearch(r, 'Novablast 6', /Novablast 6 추가/);
    await addBySearch(r, 'Pegasus 42', /Pegasus 42 추가/);

    const btn = open();
    expect(btn.props.disabled).toBe(true);
    expect(textOf(r.root)).toContain('3켤레까지');
  });

  it('추가하면 기준 대비 차이가 뜬다', async () => {
    const r = await mount(seedOf('ASICS', 'Superblast 3'));
    await addBySearch(r, 'Pegasus 42', /Pegasus 42 추가/);
    const t = textOf(r.root);
    expect(t).toContain('292');  // 페가수스 42 무게
    expect(t).toContain('+62');  // 230g 대비
  });
});
