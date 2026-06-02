/**
 * App.tsx 신발 선택/추천 통합 테스트.
 *
 * 관찰 가능한 동작을 검증한다(내부 상태가 아니라 화면에 무엇이 보이는가):
 *   1) activeIdx={0} 하드코딩 제거 — 홈 히어로는 처음에 가장 최근에 신은 신발을
 *      기본으로 보여준다(추천 배지 없음, 선택 동작만 유지).
 *   2) 홈 picker에서 다른 신발을 고르면 히어로가 그 신발로 바뀐다(선택 반영).
 *   3) 선택은 App이 소유하므로 신발 탭의 '사용 중' 강조도 같은 신발을 가리킨다.
 *   4) ShoeDetail에서 마지막 착용일이 런 기록에서 파생되어 보인다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

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

// HeroShoe 컨테이너 텍스트(브랜드 + 모델 + '사용 중' + 남은수명…)를 한 덩어리로 읽는다.
// '사용 중' 칩이 들어 있는 가장 작은 View를 히어로로 본다.
function heroText(root: ReactTestRenderer.ReactTestInstance): string {
  // 홈 히어로만 '사용 중' 칩을 갖는다(picker 카드엔 없음). 이를 포함하는 가장 작은
  // 노드가 곧 히어로 카드이므로, 그 텍스트로 어떤 신발이 히어로인지 판별한다.
  const heroes = root.findAll(
    (n: any) => n && n.props && textOf(n).includes('사용 중') && textOf(n).includes('남음'),
  );
  heroes.sort((a, b) => textOf(a).length - textOf(b).length);
  return heroes.length ? textOf(heroes[0]) : '';
}

beforeEach(async () => {
  // prices 등 로컬 키 누수 방지(메모리: clearAllMockStorages 누수 → clear() 직접 호출).
  await AsyncStorage.clear();
});

// s1 Pegasus는 최근(05-31), s2 Clifton은 오래 전(05-01) 착용 → s1이 가장 최근 → 기본 히어로.
const SHOES: ApiShoe[] = [
  {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
  {id: 's2', name: 'Hoka Clifton', max_km: 600, start_km: 0},
];
const RUNS: ApiRun[] = [
  {id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-05-31', duration: 1800},
  {id: 'r2', shoe_id: 's2', km: 5, run_date: '2026-05-01', duration: 1800},
];

test('홈 히어로는 처음에 가장 최근에 신은 신발을 기본으로 보여준다(하드코딩 제거)', async () => {
  const {root} = await mount(SHOES, RUNS);
  const hero = heroText(root);
  // 가장 최근(05-31)에 신은 Pegasus가 기본 히어로(추천 배지 없이 선택/기본값 동작만 유지)
  expect(hero).toContain('Pegasus');
  expect(hero).not.toContain('Clifton');
});

test('홈 picker에서 다른 신발을 고르면 히어로가 그 신발로 바뀐다(선택 반영)', async () => {
  const {root} = await mount(SHOES, RUNS);
  // 처음엔 기본(가장 최근 신은 Pegasus)이 히어로
  expect(heroText(root)).toContain('Pegasus');

  // picker에서 Clifton 선택 → 히어로가 Clifton으로 전환
  await tap(pressBy(root, 'Clifton'));
  const hero = heroText(root);
  expect(hero).toContain('Clifton');
  expect(hero).not.toContain('Pegasus');
});

test('내 러닝화 picker는 가장 최근에 신은 순으로 정렬된다(등록순이 아니라)', async () => {
  // 등록순은 [Pegasus, Clifton]이지만 Clifton(05-30)이 Pegasus(05-20)보다 최근 →
  // picker 첫 카드는 Clifton이어야 한다(정렬이 등록순을 뒤집어 히어로 기준과 일치).
  const shoes: ApiShoe[] = [
    {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
    {id: 's2', name: 'Hoka Clifton', max_km: 600, start_km: 0},
  ];
  const runs: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-05-20', duration: 1800},
    {id: 'r2', shoe_id: 's2', km: 5, run_date: '2026-05-30', duration: 1800},
  ];
  const {root} = await mount(shoes, runs);
  // picker 카드만 onPress + 모델명을 갖는다(히어로·CTA는 모델명 미포함). 문서 순서 = 좌→우.
  const cards = root.findAll(
    (n: any) =>
      n && n.props && typeof n.props.onPress === 'function' &&
      (textOf(n).includes('Pegasus') || textOf(n).includes('Clifton')),
  );
  expect(cards.length).toBeGreaterThanOrEqual(2);
  expect(textOf(cards[0])).toContain('Clifton');
  expect(textOf(cards[0])).not.toContain('Pegasus');
  expect(textOf(cards[cards.length - 1])).toContain('Pegasus');
});

test('선택은 App이 소유 — 신발 탭의 사용 중 강조도 선택 신발을 가리킨다', async () => {
  const {root} = await mount(SHOES, RUNS);
  // 홈에서 Clifton 선택(기본=Pegasus와 다른 신발을 골라 '선택 반영'을 검증)
  await tap(pressBy(root, 'Clifton'));
  // 신발 탭으로 이동(shoe-sneaker 아이콘 탭)
  await tap(pressBy(root, 'shoe-sneaker'));

  // 신발 잠금장에서 '사용 중' 칩이 달린 카드가 Clifton이어야 한다.
  const featured = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes('사용 중'),
  );
  featured.sort((a, b) => textOf(a).length - textOf(b).length);
  expect(featured.length).toBeGreaterThan(0);
  expect(textOf(featured[0])).toContain('Clifton');
  expect(textOf(featured[0])).not.toContain('Pegasus');
});

test('ShoeDetail: 마지막 착용일이 런 기록에서 파생되어 표시된다', async () => {
  const {root} = await mount(SHOES, RUNS);
  await tap(pressBy(root, 'shoe-sneaker')); // 신발 탭
  await tap(pressBy(root, 'Pegasus')); // Pegasus 상세 (5km 사용)

  // 마지막 착용일(런에서 파생): 2026-05-31 → '5월 31일'
  expect(textOf(root)).toContain('마지막 착용');
  expect(textOf(root)).toContain('5월 31일');
});
