/**
 * NextShoeScreen — 은퇴 후 '다음 신발' 플로우.
 *
 * 이 화면이 지켜야 할 계약만 단언한다(픽셀이 아니라 약속):
 *   1) 추천은 같은 카테고리 안에서만 — 쿠션화 졸업자에게 카본화가 뜨지 않는다.
 *   2) 가격을 못 구하면 그 칸을 비우고, 없는 숫자를 지어내지 않는다.
 *   3) 판매처는 정품 보증 채널만 — 쿠팡은 어디에도 없다.
 *   4) 쿠션·반발·안정이 keego 분류임을 화면이 밝힌다.
 *   5) 제휴 고지가 구매처 화면에 반드시 함께 뜬다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import NextShoeScreen from '../NextShoeScreen.rn';
import {SHOE_MODELS} from '../data/shoeModels';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') { out += String(n); return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

async function mount(props: Partial<React.ComponentProps<typeof NextShoeScreen>> = {}) {
  const prev = SHOE_MODELS.find((m) => m.category === 'max_cushion')!;
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <NextShoeScreen
        prevBrand={prev.brand}
        prevModel={prev.model}
        prevUsedKm={824}
        prevPriceKrw={205000}
        onClose={jest.fn()}
        {...props}
      />,
    );
  });
  await flush();
  return r;
}

function pressables(root: ReactTestRenderer.ReactTestInstance, prefix: string) {
  return root.findAll(
    (n: any) => n.props && typeof n.props.testID === 'string' &&
      n.props.testID.startsWith(prefix) && typeof n.props.onPress === 'function',
  );
}

describe('추천은 같은 카테고리 안에서만', () => {
  test('쿠션화를 졸업하면 후보가 전부 쿠션화다', async () => {
    const prev = SHOE_MODELS.find((m) => m.category === 'max_cushion')!;
    const r = await mount();
    const cands = pressables(r.root, 'next-shoe-cand-');
    // 후보가 있으면 전부 같은 카테고리여야 한다.
    const cushionNames = new Set(
      SHOE_MODELS.filter((m) => m.category === 'max_cushion').map((m) => m.model),
    );
    for (const c of cands) {
      const model = String(c.props.testID).replace('next-shoe-cand-', '');
      expect(cushionNames.has(model)).toBe(true);
      expect(model).not.toBe(prev.model); // 자기 자신 제외
    }
  });

  test('카본 레이싱 모델명이 화면 어디에도 없다', async () => {
    const r = await mount();
    const txt = textOf(r.root);
    const carbonNames = SHOE_MODELS.filter((m) => m.category === 'carbon_racing').map((m) => m.model);
    for (const name of carbonNames) {
      expect(txt).not.toContain(name);
    }
  });
});

describe('모르는 건 비운다', () => {
  test('가격을 못 구하면 없는 숫자를 지어내지 않는다', async () => {
    // 네이버 키가 없어 fetchShoePrice 가 전부 null 을 준다(현재 상태).
    // 목록은 그래도 뜨고, 가격 자리에만 아무 숫자도 새지 않아야 한다.
    const r = await mount();
    const rows = pressables(r.root, 'next-shoe-cand-');
    expect(rows.length).toBeGreaterThan(0);
    // 후보 행 안에는 어떤 금액도 없어야 한다(지난 신발의 원/km는 상단에 따로 있고 진짜다).
    for (const row of rows) {
      expect(textOf(row)).not.toMatch(/원/);
    }
  });

  test('구매가가 없으면 지난 신발 원/km 숫자를 말하지 않는다', async () => {
    const r = await mount({prevPriceKrw: undefined});
    const txt = textOf(r.root);
    // '1km당 비용은 권장 수명 기준' 같은 범례 문구는 남지만, 계산된 금액은 없어야 한다.
    expect(txt).not.toMatch(/1km당 [\d,]+원/);
  });

  test('구매가와 주행거리가 있으면 지난 신발 원/km를 보여준다', async () => {
    const r = await mount({prevPriceKrw: 205000, prevUsedKm: 824});
    // 205,000 ÷ 824 = 249원
    expect(textOf(r.root)).toContain('1km당 249원');
  });
});

describe('근거 표기', () => {
  test('등급을 매긴 주체가 keego 임을 밝힌다(브랜드가 매긴 게 아니다)', async () => {
    const r = await mount();
    const txt = textOf(r.root);
    expect(txt).toContain('keego가 매긴 등급');
    // '브랜드 데이터'로 뭉뚱그리면 출처 허위 표시가 된다 — 회귀 방지.
    expect(txt).not.toContain('브랜드 데이터');
  });
});

describe('구매처 — 정품 보증 채널만', () => {
  async function toStores(r: ReactTestRenderer.ReactTestRenderer) {
    const cands = pressables(r.root, 'next-shoe-cand-');
    if (!cands.length) return false;
    await act(async () => { cands[0].props.onPress(); });
    await flush();
    const decide = r.root.findAll((n: any) => n.props?.testID === 'next-shoe-decide' && n.props.onPress)[0];
    await act(async () => { decide.props.onPress(); });
    await flush();
    return true;
  }

  test('쿠팡은 어디에도 없고, 빠진 이유를 밝힌다', async () => {
    const r = await mount();
    const reached = await toStores(r);
    expect(reached).toBe(true);
    const txt = textOf(r.root);
    expect(txt).not.toContain('쿠팡');
    expect(txt).toContain('무신사');
    expect(txt).toContain('29CM');
    expect(txt).toContain('정품');
  });

  test('제휴 고지가 구매처 화면에 반드시 함께 뜬다', async () => {
    const r = await mount();
    await toStores(r);
    const txt = textOf(r.root);
    expect(txt).toContain('수수료');
    expect(txt).toContain('순위엔 영향 없어요');
  });
});

describe('되돌아갈 길', () => {
  test('처음 화면에서 닫기를 누르면 onClose 가 불린다', async () => {
    const onClose = jest.fn();
    const r = await mount({onClose});
    const back = r.root.findAll((n: any) => n.props?.testID === 'next-shoe-back' && n.props.onPress)[0];
    await act(async () => { back.props.onPress(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('비교 화면에서 뒤로 가면 목록으로 돌아온다(닫히지 않는다)', async () => {
    const onClose = jest.fn();
    const r = await mount({onClose});
    const cands = pressables(r.root, 'next-shoe-cand-');
    if (!cands.length) return;
    await act(async () => { cands[0].props.onPress(); });
    await flush();
    expect(r.root.findAll((n: any) => n.props?.testID === 'next-shoe-compare').length).toBeGreaterThan(0);
    const back = r.root.findAll((n: any) => n.props?.testID === 'next-shoe-back' && n.props.onPress)[0];
    await act(async () => { back.props.onPress(); });
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(pressables(r.root, 'next-shoe-cand-').length).toBeGreaterThan(0);
  });
});
