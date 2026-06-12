/**
 * HallOfShoes(명예의 전당 — 은퇴 신발 박물관) 동작 테스트.
 *
 * 관찰 가능한 효과(props-driven):
 *   1) 은퇴 레코드를 km + 은퇴 연도 + 등급으로 명패처럼 렌더한다.
 *   2) 최근 은퇴 순으로 정렬한다(retiredAt 내림차순).
 *   3) 레코드 0개면 빈 상태(격려 카피)를 보여준다 — 날조 0.
 *   4) 영속 라운드트립: persistRetiredShoe → loadProgression 으로 복원한 레코드를
 *      그대로 전시한다(리로드에도 사라지지 않음).
 *   5) onOpenRecord 가 있으면 명패 누름이 그 레코드로 콜백한다.
 *
 * AsyncStorage 누수 회피: 각 테스트 전 AsyncStorage.clear().
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HallOfShoes from '../HallOfShoes.rn';
import {persistRetiredShoe} from '../lib/progression/retirementStore';
import {loadProgression} from '../lib/progression/storage';
import type {RetiredShoeRecord} from '../lib/progression/types';

const RECORDS: RetiredShoeRecord[] = [
  {
    shoeId: 's1',
    name: 'Nike Pegasus 40',
    km: 512,
    retiredAt: '2026-04-01T00:00:00.000Z',
    retireYear: 2026,
    grade: 'perfect',
  },
  {
    shoeId: 's2',
    name: 'Vaporfly 3',
    km: 318,
    retiredAt: '2025-11-20T00:00:00.000Z',
    retireYear: 2025,
    grade: 'smart',
  },
];

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') {
      out += String(n);
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(el: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(el);
  });
  return renderer;
}

// RN composite + host 가 같은 testID 를 둘 다 들고 있어 중복된다 — 호스트(문자열 type)만
// 센다(테스트 인스턴스 1개로 정규화).
function hostsWith(root: ReactTestRenderer.ReactTestInstance, prefix: string) {
  return root.findAll(
    (n: any) =>
      typeof n.type === 'string' &&
      typeof n.props?.testID === 'string' &&
      n.props.testID.startsWith(prefix),
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('HallOfShoes — 은퇴 신발 전시', () => {
  test('은퇴 레코드를 km + 은퇴 연도 + 등급으로 렌더한다', () => {
    const txt = textOf(render(<HallOfShoes records={RECORDS} />).root);
    // 신발명
    expect(txt).toContain('Nike Pegasus 40');
    expect(txt).toContain('Vaporfly 3');
    // km
    expect(txt).toContain('512');
    expect(txt).toContain('318');
    // 은퇴 연도(Class of)
    expect(txt).toContain('Class of 2026');
    expect(txt).toContain('Class of 2025');
    // 등급(Smart Retirement Grade 이름)
    expect(txt).toContain('Perfect');
    expect(txt).toContain('Smart');
  });

  test('최근 은퇴 순으로 정렬한다(retiredAt 내림차순)', () => {
    const root = render(<HallOfShoes records={RECORDS} />).root;
    const plaques = hostsWith(root, 'hall-plaque-');
    expect(plaques.map((p: any) => p.props.testID)).toEqual([
      'hall-plaque-s1', // 2026-04 (최근)
      'hall-plaque-s2', // 2025-11
    ]);
  });

  test('레코드 0개면 빈 상태(격려)를 보여준다', () => {
    const r = render(<HallOfShoes records={[]} />);
    expect(hostsWith(r.root, 'hall-empty').length).toBe(1);
    expect(textOf(r.root)).toContain('아직 은퇴한 신발이 없어요');
  });

  test('영속 라운드트립: 저장한 레코드를 복원해 그대로 전시한다(리로드 보존)', async () => {
    await persistRetiredShoe(RECORDS[0]);
    const loaded = await loadProgression();
    expect(loaded.retiredShoes).toHaveLength(1);
    const txt = textOf(render(<HallOfShoes records={loaded.retiredShoes} />).root);
    expect(txt).toContain('Nike Pegasus 40');
    expect(txt).toContain('512');
    expect(txt).toContain('Class of 2026');
  });

  test('onOpenRecord 가 있으면 명패 누름이 그 레코드로 콜백한다', () => {
    const onOpen = jest.fn();
    const root = render(<HallOfShoes records={RECORDS} onOpenRecord={onOpen} />).root;
    const node = root.find((n: any) => n.props?.testID === 'hall-plaque-s1');
    act(() => {
      node.props.onPress();
    });
    expect(onOpen).toHaveBeenCalledWith(RECORDS[0]);
  });
});
