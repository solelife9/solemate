/**
 * FindShoesScreen — 은퇴 후 '다음 신발' 플로우.
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
import {Linking} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import FindShoesScreen from '../FindShoesScreen.rn';
import {SHOE_MODELS} from '../data/shoeModels';
import {__resetPriceCacheForTests} from '../lib/shoePrice';

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

// 기준(base)을 밖에서 주면 기준 고르기를 건너뛰고 후보부터 시작한다 — 은퇴·신발
// 상세에서 들어오는 경로가 그렇다(2026-08-02 통합).
async function mount(
  props: Partial<React.ComponentProps<typeof FindShoesScreen>> = {},
  baseOverride: Partial<{usedKm: number; priceKrw: number}> = {},
) {
  const prev = SHOE_MODELS.find((m) => m.category === 'max_cushion')!;
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <FindShoesScreen
        base={{brand: prev.brand, model: prev.model, usedKm: 824, priceKrw: 205000,
          ...baseOverride}}
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

  // 구매가 입력은 2026-08-02 폐지(민우님: "구매가 없애자 그냥"). 기준 신발의 원/km
  // 라벨도 함께 사라졌다 — 분자를 받을 곳이 없으면 그 숫자는 만들 수 없다.
  test('기준 카드는 1km당 비용을 말하지 않는다', async () => {
    const r = await mount();
    expect(textOf(r.root)).not.toMatch(/1km당 [\d,]+원/);
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

// ── 가격이 실제로 조회됐을 때 ───────────────────────────────────────────────────
// 위 스위트들은 '키가 없어 가격이 전부 null' 인 현재 상태를 다룬다. 여기서는 네이버
// 검색 키가 주입된 뒤의 동작을 못 박는다 — 특히 **가격을 보여줬으면 갈 길도 줘야 한다**.
describe('공식 스토어 가격이 있을 때', () => {
  const PRODUCT_URL = 'https://brand.naver.com/nike/products/1234567';

  beforeEach(() => {
    __resetPriceCacheForTests();
    (global as unknown as {fetch: jest.Mock}).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [{
          title: '나이키 러닝화',
          lprice: '189000',
          mallName: '나이키공식스토어',
          link: PRODUCT_URL,
          category4: '러닝화',
        }],
      }),
    }));
  });

  afterEach(() => {
    __resetPriceCacheForTests();
    delete (global as unknown as {fetch?: unknown}).fetch;
  });

  test('후보 목록에 조회된 금액이 뜬다', async () => {
    const r = await mount();
    const rows = pressables(r.root, 'next-shoe-cand-');
    expect(rows.length).toBeGreaterThan(0);
    expect(textOf(rows[0])).toContain('189,000원');
  });

  test('가격 카드를 누르면 그 공식 스토어 상품 페이지로 간다', async () => {
    // 가격만 띄우고 링크를 안 주면, 사용자가 그 금액을 밖에서 다시 찾아야 한다.
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const r = await mount();
    const cands = pressables(r.root, 'next-shoe-cand-');
    await act(async () => { cands[0].props.onPress(); });
    await flush();
    const decide = r.root.findAll((n: any) => n.props?.testID === 'next-shoe-decide' && n.props.onPress)[0];
    await act(async () => { decide.props.onPress(); });
    await flush();

    const card = r.root.findAll(
      (n: any) => n.props?.testID === 'next-shoe-store-quote' && typeof n.props.onPress === 'function',
    )[0];
    expect(card).toBeTruthy();
    await act(async () => { card.props.onPress(); });
    expect(openURL).toHaveBeenCalledWith(PRODUCT_URL);
    openURL.mockRestore();
  });

  test("무신사·29CM 행은 가격을 약속하지 않는다('가격 보기'가 아니다)", async () => {
    const r = await mount();
    const cands = pressables(r.root, 'next-shoe-cand-');
    await act(async () => { cands[0].props.onPress(); });
    await flush();
    const decide = r.root.findAll((n: any) => n.props?.testID === 'next-shoe-decide' && n.props.onPress)[0];
    await act(async () => { decide.props.onPress(); });
    await flush();

    for (const id of ['next-shoe-store-musinsa', 'next-shoe-store-29cm']) {
      const row = r.root.findAll((n: any) => n.props?.testID === id)[0];
      expect(row).toBeTruthy();
      const t = textOf(row);
      expect(t).not.toContain('가격');
      expect(t).not.toMatch(/[\d,]+원/);
    }
  });
});

// ── 기준 고르기(마이 탭 진입) ─────────────────────────────────────────────────
// base 를 안 주면 '어떤 신발을 기준으로 볼까요?'부터 시작한다. 전에는 이 화면이
// 은퇴할 때만 열려서, 신발을 은퇴시키지 않는 사람은 평생 못 봤다.
describe('기준 고르기', () => {
  const MINE = [
    {brand: 'Nike', model: 'Pegasus 41', usedKm: 402, lifespanKm: 700, priceKrw: 139000},
    {brand: 'Asics', model: 'Novablast 5', usedKm: 583, lifespanKm: 800},
  ];
  const mountBare = async (myShoes = MINE) => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(
        <FindShoesScreen myShoes={myShoes} onClose={jest.fn()} />,
      );
    });
    await act(async () => { await Promise.resolve(); });
    return r;
  };
  const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
    r.root.findAll((n: any) => n.props?.testID === id);

  test('base 가 없으면 기준 고르기부터 뜬다', async () => {
    const r = await mountBare();
    expect(byId(r, 'find-shoes-base').length).toBeGreaterThan(0);
    expect(textOf(r.root)).toContain('기준으로 볼까요');
  });

  test('내 신발이 목록에 뜬다 — 카탈로그에서 다시 찾게 하지 않는다', async () => {
    const r = await mountBare();
    const t = textOf(r.root);
    expect(t).toContain('Pegasus 41');
    expect(t).toContain('Novablast 5');
  });

  test('내 신발을 고르면 그게 기준이 되어 후보로 넘어간다', async () => {
    const r = await mountBare();
    await act(async () => {
      byId(r, 'find-shoes-mine-Pegasus 41')[0].props.onPress();
    });
    expect(byId(r, 'find-shoes-base-card').length).toBeGreaterThan(0);
    expect(textOf(r.root)).toContain('Pegasus 41');
  });

  test('기준 카드에서 기준을 다시 바꿀 수 있다', async () => {
    const r = await mountBare();
    await act(async () => { byId(r, 'find-shoes-mine-Pegasus 41')[0].props.onPress(); });
    await act(async () => { byId(r, 'find-shoes-change-base')[0].props.onPress(); });
    expect(byId(r, 'find-shoes-base').length).toBeGreaterThan(0);
  });

  test('내 신발이 하나도 없어도 카탈로그에서 고를 수 있다', async () => {
    const r = await mountBare([]);
    expect(byId(r, 'find-shoes-browse').length).toBeGreaterThan(0);
  });

  test('“기준 없이 둘러보기”는 없다 — “다른 러닝화에서 고르기”가 곧 그 행동이다', async () => {
    const r = await mountBare();
    expect(byId(r, 'find-shoes-skip')).toHaveLength(0);
  });
});

// ── 후보 → 스펙 표 ───────────────────────────────────────────────────────────
// 막대 그래프 화면을 걷어냈다(2026-08-02). 후보를 누르면 **곧장 표**다.
describe('후보를 고르면 표로 간다', () => {
  const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
    r.root.findAll((n: any) => n.props?.testID === id);

  const pickFirst = async (r: ReactTestRenderer.ReactTestRenderer) => {
    const [first] = r.root.findAll((n: any) =>
      typeof n.props?.testID === 'string' && n.props.testID.startsWith('next-shoe-cand-'));
    expect(first).toBeTruthy();
    await act(async () => { first.props.onPress(); });
  };

  test('기준과 후보 두 켤레가 표에 선다', async () => {
    const r = await mount();
    await pickFirst(r);
    expect(byId(r, 'shoe-compare-table').length).toBeGreaterThan(0);
    // 기준 칸이 정확히 하나 서 있어야 한다(빈 표로 넘어가면 이어붙인 의미가 없다).
    // findAll 은 같은 노드를 composite/host 로 두 번 주므로 testID 로 유일화한다.
    const ids = new Set(r.root.findAll((n: any) =>
      typeof n.props?.testID === 'string' && n.props.testID.startsWith('compare-base-'))
      .map((n: any) => n.props.testID));
    expect(ids.size).toBe(1);
    // 표에는 두 칸(기준 + 후보)이 서 있어야 한다.
    const removes = new Set(r.root.findAll((n: any) =>
      typeof n.props?.testID === 'string' && n.props.testID.startsWith('compare-remove-'))
      .map((n: any) => n.props.testID));
    expect(removes.size).toBe(2);
  });

  test('막대 그래프는 더 이상 없다 — 표가 같은 값을 더 정확히 말한다', async () => {
    const r = await mount();
    await pickFirst(r);
    const t = textOf(r.root);
    expect(t).not.toContain('단계 →');   // 구 쿠션 막대의 '3단계 → 5단계'
  });

  test('구매처로 가는 길은 남아 있다', async () => {
    const r = await mount();
    await pickFirst(r);
    expect(byId(r, 'next-shoe-decide').length).toBeGreaterThan(0);
  });
});
