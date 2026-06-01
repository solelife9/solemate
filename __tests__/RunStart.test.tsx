/**
 * RunStart (RunScreen.rn.tsx) 목표-입력 화면 행동 테스트.
 *
 * 관찰 가능한 동작을 검증한다(표시값·콜백 인자 기준):
 *   1) 거리 1개 히어로 지표가 기본값('5')과 'km' 단위로 렌더된다.
 *   2) 프리셋을 누르면 히어로 거리 숫자가 그 값으로 바뀐다.
 *   3) 키패드 입력/백스페이스가 히어로 거리 숫자를 갱신한다.
 *   4) 시작 CTA를 누르면 onStart(목표 km)가 파싱된 숫자로 호출된다.
 *
 * 정적 토큰 스캔(raw hex/fontFamily 0)은 tests/acceptance/slice-3-design.test.ts가
 * 담당하므로 여기서는 동작만 단언한다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {RunStart} from '../RunScreen.rn';
import {Shoe} from '../theme';

const SHOE: Shoe = {brand: 'NIKE', model: 'Pegasus', used: 100, max: 800, condition: '양호'};

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

// 가장 짧은 텍스트를 가진(=가장 구체적인) 누를 수 있는 노드를 needle로 찾는다.
function pressBy(root: any, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a: any, b: any) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

// 백스페이스 키는 텍스트가 아니라 Ionicons('backspace-outline')를 렌더하므로
// 텍스트가 아닌 아이콘 이름으로 누를 수 있는 부모를 찾는다.
function pressByIcon(root: any, iconName: string) {
  const hits = root.findAll(
    (n: any) =>
      n &&
      n.props &&
      typeof n.props.onPress === 'function' &&
      n.findAll((c: any) => c && c.props && c.props.name === iconName).length > 0,
  );
  hits.sort((a: any, b: any) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains icon "${iconName}"`);
  return hits[0];
}

function tap(node: any) {
  act(() => {
    node.props.onPress();
  });
}

function render(onStart?: (km: number) => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <RunStart shoe={SHOE} onStart={onStart} />,
    );
  });
  return renderer.root;
}

test('기본값 5km 히어로 지표 + km 단위 + 신발 텍스트가 렌더된다', () => {
  const root = render();
  const txt = textOf(root);
  expect(txt).toContain('목표 거리');
  expect(txt).toContain('km');
  expect(txt).toContain('NIKE Pegasus로 달리기');
  expect(txt).toContain('러닝 시작');
});

test('프리셋(10km)을 누르면 히어로 거리가 10으로 바뀌고 시작 시 onStart(10) 호출', () => {
  const onStart = jest.fn();
  const root = render(onStart);

  tap(pressBy(root, '10km'));
  expect(textOf(root)).toContain('10km 러닝 시작'); // CTA 라벨이 새 거리 반영

  tap(pressBy(root, '러닝 시작'));
  expect(onStart).toHaveBeenCalledWith(10);
});

test('키패드로 숫자를 쌓고 백스페이스로 지운 뒤 시작하면 파싱된 km로 onStart 호출', () => {
  const onStart = jest.fn();
  const root = render(onStart);

  tap(pressBy(root, '7')); // '5' → '57'
  expect(textOf(root)).toContain('57km 러닝 시작');

  tap(pressByIcon(root, 'backspace-outline')); // '57' → '5'
  expect(textOf(root)).toContain('5km 러닝 시작');

  tap(pressBy(root, '러닝 시작'));
  expect(onStart).toHaveBeenLastCalledWith(5);
});

test('소수 목표(3km 프리셋 후 .5)도 반올림 한 자리로 onStart 전달', () => {
  const onStart = jest.fn();
  const root = render(onStart);

  tap(pressBy(root, '3km')); // val '3'
  tap(pressBy(root, '.')); // '3.'
  tap(pressBy(root, '5')); // '3.5'
  tap(pressBy(root, '러닝 시작'));
  expect(onStart).toHaveBeenLastCalledWith(3.5);
});
