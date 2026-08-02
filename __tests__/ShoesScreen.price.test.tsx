/**
 * 신발 상세 — 구매가 수정.
 *
 * 구매가는 **등록할 때만** 넣을 수 있었다(AddShoeScreen). 그래서 안 넣고 지나간
 * 신발은 영영 1km당 비용을 못 봤고, 러닝화 찾기의 금액 비교도 영영 안 떴다
 * (민우님: "기준 신발 구매가를 넣는 화면이 있어?" / "금액비교화면은 어디갔어?").
 *
 * 지키는 것: 0·빈값은 **지운다**. '0원에 샀다'로 기록하면 원/km 가 0이 되어 거짓이 된다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShoesScreen from '../ShoesScreen.rn';
import type {Shoe} from '../appTypes';

const SHOE: Shoe = {
  id: 's1', brand: 'Nike', model: 'Pegasus 41', used: 400, max: 700, priceKrw: 139000,
};

async function mount(shoe: Shoe = SHOE) {
  const onSetPriceKrw = jest.fn();
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <ShoesScreen
        shoes={[shoe]}
        runs={[]}
        detailShoeId={String(shoe.id)}
        onSetPriceKrw={onSetPriceKrw}
        onSetMaxKm={jest.fn()}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
  return {r, onSetPriceKrw};
}

const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n: any) => n.props?.testID === id);

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

const edit = async (r: ReactTestRenderer.ReactTestRenderer, value: string) => {
  await act(async () => { byId(r, 'shoe-price-edit')[0].props.onPress(); });
  await act(async () => { byId(r, 'shoe-price-input')[0].props.onChangeText(value); });
  await act(async () => { byId(r, 'shoe-price-save')[0].props.onPress(); });
};

describe('구매가 수정', () => {
  test('상세에 구매가 카드가 있다', async () => {
    const {r} = await mount();
    expect(byId(r, 'shoe-price-card').length).toBeGreaterThan(0);
  });

  test('이미 넣은 값이 보인다', async () => {
    const {r} = await mount();
    expect(textOf(r.toJSON())).toContain('139,000원');
  });

  test('안 넣었으면 입력을 권한다', async () => {
    const {r} = await mount({...SHOE, priceKrw: undefined});
    expect(textOf(r.toJSON())).toContain('입력하기');
  });

  test('숫자를 넣으면 그대로 저장된다', async () => {
    const {r, onSetPriceKrw} = await mount();
    await edit(r, '159000');
    expect(onSetPriceKrw).toHaveBeenCalledWith('s1', 159000);
  });

  test('쉼표·원 같은 군더더기를 걸러낸다', async () => {
    const {r, onSetPriceKrw} = await mount();
    await edit(r, '159,000원');
    expect(onSetPriceKrw).toHaveBeenCalledWith('s1', 159000);
  });

  test('0 은 지운다 — 0원에 샀다고 기록하지 않는다', async () => {
    const {r, onSetPriceKrw} = await mount();
    await edit(r, '0');
    expect(onSetPriceKrw).toHaveBeenCalledWith('s1', null);
  });

  test('비우면 지운다', async () => {
    const {r, onSetPriceKrw} = await mount();
    await edit(r, '');
    expect(onSetPriceKrw).toHaveBeenCalledWith('s1', null);
  });

  test('구매가가 있고 달렸으면 1km당 비용을 보여준다', async () => {
    const {r} = await mount();   // 139,000 ÷ 400km = 348원
    // 숫자와 단위가 별도 노드라 헬퍼가 사이에 공백을 넣는다.
    const t = textOf(r.toJSON());
    expect(t).toContain('1km당');
    expect(t).toContain('348');
  });

  test('아직 안 달린 신발은 1km당을 계산하지 않는다 — 0으로 나누지 않는다', async () => {
    const {r} = await mount({...SHOE, used: 0});
    expect(textOf(r.toJSON())).not.toContain('1km당');
  });
});
