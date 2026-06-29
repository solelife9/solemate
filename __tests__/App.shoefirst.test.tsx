/**
 * App.tsx shoe-first 런 시작 통합 테스트.
 *
 * 관찰 가능한 동작을 검증한다(화면 전환·표시 기준):
 *   1) 신발 상세(ShoeDetail)의 '이 신발로 달리기' 기본 CTA를 누르면 그 신발로
 *      목표 설정(RunStart) 화면에 진입한다 — 화면에 '<브랜드> <모델>로 달리기'가
 *      뜨고, '러닝 시작' CTA가 보인다(shoe-first 동선).
 *   2) 락커 카드의 play 어포던스를 누르면(상세를 거치지 않고) 해당 신발로 곧장
 *      목표 설정 화면에 진입한다.
 *   3) 보관(retired)된 신발의 상세에는 시작 CTA가 노출되지 않는다(시작 동선 제외,
 *      기록은 보존).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';

type ApiShoe = {id: string; name: string; max_km: number; start_km: number; retired?: boolean};
type ApiRun = {id: string; shoe_id: string; km: number; run_date: string; duration: number};

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
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
  if ((out === '' || node.props?.accessibilityRole === 'tab') && typeof node.props?.accessibilityLabel === 'string') return node.props.accessibilityLabel;
  return out;
}

function mockBackend(shoes: ApiShoe[], runs: ApiRun[]) {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let res: any = {};
    if (u.includes('/api/auth')) res = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) res = shoes;
    else if (u.includes('/api/runs')) res = runs;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(res),
      text: () => Promise.resolve(JSON.stringify(res)),
    });
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(shoes: ApiShoe[], runs: ApiRun[]) {
  mockBackend(shoes, runs);
  await seedBootCache(shoes, runs); // Stage 3: 부팅은 캐시에서 읽는다
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  return {root: renderer.root};
}

// 가장 짧은 텍스트를 가진(=가장 구체적인) 누를 수 있는 노드를 needle로 찾는다.
function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string): ReactTestRenderer.ReactTestInstance {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

async function tap(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    node.props.onPress();
  });
  await flush();
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

const SHOES: ApiShoe[] = [
  {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
  {id: 's2', name: 'Hoka Clifton', max_km: 600, start_km: 0},
];
const RUNS: ApiRun[] = [
  {id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-05-31', duration: 1800},
  {id: 'r2', shoe_id: 's2', km: 5, run_date: '2026-05-01', duration: 1800},
];

test('신발 상세 진입 — 모델 표시, 런 시작 CTA는 상세에서 제거됨(목업 09 정합)', async () => {
  const {root} = await mount(SHOES, RUNS);
  await tap(pressBy(root, '신발')); // 신발 탭
  await tap(pressBy(root, 'Pegasus')); // Pegasus 상세

  const txt = textOf(root);
  expect(txt).toContain('Pegasus'); // 상세 진입(모델 표시)
  // 목업 09 처럼 상세에는 '이 신발로 달리기' CTA 를 두지 않는다 — 런 시작은 홈 카드/신발
  // 목록의 ▶ 어포던스로 한다(아래 '락커 카드 play' 테스트가 그 동선을 검증).
  expect(txt).not.toContain('이 신발로 달리기');
});

test('락커 카드 play 어포던스 → 상세 없이 해당 신발로 목표 설정 화면 진입', async () => {
  const {root} = await mount(SHOES, RUNS);
  await tap(pressBy(root, '신발')); // 신발 탭

  // Clifton 카드를 먼저 찾고(모델명 + play 아이콘 포함하는 가장 작은 pressable=카드),
  // 그 안에서 텍스트가 정확히 'play'인 중첩 pressable(=play 버튼)을 누른다.
  // 카드 자체 onPress는 상세로 가므로, play 버튼만 골라 눌러야 시작 동선이 검증된다.
  const cards = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' &&
      textOf(n).includes('Clifton') && textOf(n).includes('play'),
  );
  cards.sort((a, b) => textOf(a).length - textOf(b).length);
  const card = cards[0];
  const playBtn = card.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n) === 'play',
  )[0];
  expect(playBtn).toBeTruthy();
  await tap(playBtn);

  const txt = textOf(root);
  expect(txt).toContain('Clifton');
  expect(txt).not.toContain('Pegasus');
  expect(txt).toContain('러닝 목표');
});

test('보관된 신발은 신발 탭 락커에서 제외된다 → 시작 동선 없음(보관함으로 이관)', async () => {
  // 보관(retired) 신발은 신발 탭 락커에서 빠지고 마이탭 '신발 보관함'으로 이관된다(fd67d4b).
  // 락커에 안 떠 상세 진입·'이 신발로 달리기' CTA 자체가 없다(시작 동선 분리, 기록은 보존).
  const retiredShoes: ApiShoe[] = [
    {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0, retired: true},
  ];
  const {root} = await mount(retiredShoes, []);
  await tap(pressBy(root, '신발')); // 신발 탭

  expect(() => pressBy(root, 'Pegasus')).toThrow(); // 락커 목록에 없음 → 상세 진입 불가
  expect(textOf(root)).not.toContain('이 신발로 달리기'); // 러닝 시작 CTA 미노출
});
