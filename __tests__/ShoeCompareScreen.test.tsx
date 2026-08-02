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
    r = ReactTestRenderer.create(<ShoeCompareScreen seeds={seed ? [seed] : null} onClose={jest.fn()} />);
  });
  return r;
}

const byId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n.props?.testID === id);

/** 추가 시트에서 검색 → 첫 결과 고르기. 빈 질의는 상위 40건만 나와 못 찾을 수 있다. */
/**
 * 추가 = 공용 ShoePicker 를 거친다(2026-08-02). 옛 전용 검색창(compare-search)은
 * 사라졌다 — 카탈로그가 한 줄로 쏟아지던 자리다. 이제 **브랜드를 먼저 고르고**
 * 그 안에서 검색한다(등록·온보딩과 같은 동선).
 */
async function addBySearch(
  r: ReactTestRenderer.ReactTestRenderer, brand: string, query: string, label: RegExp,
) {
  await act(async () => { byId(r.root, 'compare-add')[0].props.onPress(); });
  const [tab] = r.root.findAll((n: any) =>
    n.props?.accessibilityRole === 'tab'
    && new RegExp(`브랜드 ${brand}`, 'i').test(String(n.props?.accessibilityLabel ?? '')));
  expect(tab).toBeTruthy();
  await act(async () => { tab.props.onPress(); });
  const input = byId(r.root, 'picker-search')[0];
  await act(async () => { input.props.onChangeText(query); });
  const [pick] = pressables(r.root, label);
  expect(pick).toBeTruthy();
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

    await addBySearch(r, 'Asics', 'Novablast 6', /Novablast 6/);
    await addBySearch(r, 'Nike', 'Pegasus 42', /Pegasus 42/);

    const btn = open();
    expect(btn.props.disabled).toBe(true);
    expect(textOf(r.root)).toContain('3켤레까지');
  });

  it('추가하면 기준 대비 차이가 뜬다', async () => {
    const r = await mount(seedOf('ASICS', 'Superblast 3'));
    await addBySearch(r, 'Nike', 'Pegasus 42', /Pegasus 42/);
    const t = textOf(r.root);
    expect(t).toContain('292');  // 페가수스 42 무게
    expect(t).toContain('+62');  // 230g 대비
  });
});

// ── 기준 전환과 빼기 ──────────────────────────────────────────────────────────
// 「기준」 칩이 삭제 버튼이던 시절의 재발을 막는다(민우님 실기기: "기준이라고 써있는
// 걸 클릭하면 없어지는데"). 배지는 배지로, 빼기는 ✕ 로.
describe('기준 전환과 빼기', () => {
  const seedOf = (brand: string, model: string) =>
    toCompareShoe(findCatalogShoe(brand, model)!, null);
  const superblast = 'asics-superblast-3';
  const pegasus = 'nike-pegasus-42';

  const mountTwo = async () => {
    const r = await mount(seedOf('ASICS', 'Superblast 3'));
    await addBySearch(r, 'Nike', 'Pegasus 42', /Pegasus 42/);
    return r;
  };

  it('기준 칩은 눌러도 신발이 빠지지 않는다 — 배지다', async () => {
    const r = await mountTwo();
    const chip = byId(r.root, `compare-base-${superblast}`)[0];
    expect(chip.props.onPress).toBeUndefined();
    expect(textOf(r.root)).toContain('Superblast 3');
  });

  it('기준으로를 누르면 차이의 부호가 뒤집힌다', async () => {
    const r = await mountTwo();
    expect(textOf(r.root)).toContain('+62');   // 슈퍼블라스트 230g 기준, 페가수스 292g
    await act(async () => {
      byId(r.root, `compare-setbase-${pegasus}`)[0].props.onPress();
    });
    expect(textOf(r.root)).toContain('−62'); // 페가수스 기준이 되면 −62
  });

  it('✕ 로만 빠진다', async () => {
    const r = await mountTwo();
    await act(async () => {
      byId(r.root, `compare-remove-${pegasus}`)[0].props.onPress();
    });
    const t = textOf(r.root);
    expect(t).toContain('Superblast 3');
    expect(t).not.toContain('Pegasus 42');
  });

  it('기준을 빼면 남은 칸이 기준이 된다 — 기준 없는 표를 만들지 않는다', async () => {
    const r = await mountTwo();
    await act(async () => {
      byId(r.root, `compare-remove-${superblast}`)[0].props.onPress();
    });
    expect(byId(r.root, `compare-base-${pegasus}`).length).toBeGreaterThan(0);
  });

  it('칸마다 종류를 적는다 — 296g 이 무거운지는 종류를 알아야 판단된다', async () => {
    const r = await mount(seedOf('Nike', 'Pegasus 42'));
    expect(textOf(r.root)).toContain('데일리');
  });
});
