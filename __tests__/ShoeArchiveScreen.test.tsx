/**
 * ShoeArchiveScreen(신발 보관함) 행동 테스트.
 *
 * 관찰 가능한 결과를 검증한다:
 *   1) 보관 신발 목록 — 주입한 신발이 카드로 렌더된다(브랜드/모델/사용 거리).
 *   2) 복원 — 카드의 '복원'을 누르면 onRestore 가 그 신발 id 로 호출된다(영속은 App).
 *   3) 빈 상태 — 보관 신발이 없으면 빈 안내를 렌더한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShoeArchiveScreen from '../ShoeArchiveScreen.rn';
import type {Shoe} from '../theme';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(props: any) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<ShoeArchiveScreen {...props} />);
  });
  return r.root;
}

const ARCHIVED: Shoe[] = [
  {id: 'a1', brand: 'Nike', model: 'Pegasus 41', used: 320, max: 600, condition: '양호', retired: true},
  {id: 'a2', brand: 'Hoka', model: 'Clifton 9', used: 540, max: 600, condition: '교체', retired: true},
];

describe('ShoeArchiveScreen 신발 보관함', () => {
  test('보관 신발이 카드로 렌더된다(모델 + 사용 거리)', () => {
    const root = render({shoes: ARCHIVED, unit: 'km', onRestore: jest.fn(), onBack: jest.fn()});
    const c1 = root.findAll((n: any) => n.props?.testID === 'archive-shoe-a1');
    expect(c1.length).toBeGreaterThanOrEqual(1);
    expect(textOf(c1[0])).toContain('Pegasus 41');
    expect(textOf(c1[0])).toContain('320 / 600km');
    expect(root.findAll((n: any) => n.props?.testID === 'archive-shoe-a2').length).toBeGreaterThanOrEqual(1);
  });

  test("'복원'을 누르면 onRestore 가 그 신발 id 로 호출된다", () => {
    const onRestore = jest.fn();
    const root = render({shoes: ARCHIVED, unit: 'km', onRestore, onBack: jest.fn()});
    const btn = root.findAll((n: any) => n.props?.testID === 'archive-restore-a2' && typeof n.props?.onPress === 'function')[0];
    expect(btn).toBeTruthy();
    act(() => btn.props.onPress());
    expect(onRestore).toHaveBeenCalledWith('a2');
  });

  test('보관 신발이 없으면 빈 안내를 렌더한다', () => {
    const root = render({shoes: [], unit: 'km', onRestore: jest.fn(), onBack: jest.fn()});
    expect(root.findAll((n: any) => n.props?.testID === 'shoe-archive-empty').length).toBeGreaterThanOrEqual(1);
    expect(root.findAll((n: any) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('archive-shoe-')).length).toBe(0);
  });
});
