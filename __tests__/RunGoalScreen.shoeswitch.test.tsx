/** RunGoalScreen 신발 전환 시트 — 행동 계약(행 탭→시트, 선택→onChangeShoe). @format */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunGoalScreen from '../RunGoalScreen.rn';
import type {Shoe} from '../theme';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r.root;
}
const SHOES: Shoe[] = [
  {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700, condition: '양호'},
  {id: 'b', brand: 'Hoka', model: 'Clifton 10', used: 300, max: 700, condition: '주의'},
];
const pressByLabel = (root: ReactTestRenderer.ReactTestInstance, label: string) => {
  const hits = root.findAll((n: any) => n?.props?.onPress && String(n.props.accessibilityLabel || '').startsWith(label));
  if (!hits.length) throw new Error(`no pressable "${label}"`);
  return hits[0];
};

test('신발 행 탭 → 시트가 열리고, 다른 신발 선택 → onChangeShoe(id)', () => {
  const onChangeShoe = jest.fn();
  const root = render(
    <RunGoalScreen shoes={SHOES} selectedShoeId="a" onChangeShoe={onChangeShoe}
      shoeBrand="Nike" shoeLabel="Pegasus 41" shoeCondition="양호" remainKm={600} />,
  );
  act(() => { pressByLabel(root, '신발 선택:').props.onPress(); });
  const row = root.findAll((n: any) => n?.props?.testID === 'goal-shoe-b' && typeof n.props.onPress === 'function')[0];
  expect(row).toBeTruthy();
  act(() => { row.props.onPress(); });
  expect(onChangeShoe).toHaveBeenCalledWith('b');
});

test('1켤레면 행이 비활성(화살표 없음·onPress 없음)', () => {
  const root = render(
    <RunGoalScreen shoes={[SHOES[0]]} selectedShoeId="a" onChangeShoe={jest.fn()}
      shoeBrand="Nike" shoeLabel="Pegasus 41" />,
  );
  const hits = root.findAll((n: any) => String(n?.props?.accessibilityLabel || '').startsWith('신발 선택:') && typeof n.props.onPress === 'function');
  expect(hits.length).toBe(0);
});
