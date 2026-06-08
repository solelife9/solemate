/**
 * App.tsx 개별 런 편집/삭제 + 수동 런 입력 + 개인 기록(PR) 카드 통합 테스트.
 *
 * 관찰 가능한 효과만 검증한다(내부 상태/에러부재 검사 금지):
 *   1) 런 삭제 → 확인 Alert(파괴 방지) → 신발 사용거리(km) 감소. shoeHealth는 runs
 *      파생이므로 별도 신발 갱신 없이 자동으로 줄어든다(목록·신발 카드 모두).
 *   2) 수동 입력 → 목록에 새 런 추가 + source='manual'로 백엔드 POST(앱 외 주행 보정).
 *   3) 런 편집(거리) → 백엔드 PATCH /api/runs/<id> + 신발 km 재계산.
 *   4) 개인 기록 카드 → 프로필에 1km 페이스·5km 기록·최장 거리 렌더.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

type ApiShoe = {id: string; name: string; max_km: number; start_km: number; retired?: boolean};
type ApiRun = {id: string; shoe_id: string; km: number; run_date: string; duration: number};

function mockBackend(shoes: ApiShoe[], runs: ApiRun[]) {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    let res: any = {};
    if (u.includes('/api/auth')) res = {user_id: 'u1'};
    else if (u.includes('/api/runs') && method === 'POST') res = {id: 'server-new'};
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
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

async function mount(shoes: ApiShoe[], runs: ApiRun[]) {
  mockBackend(shoes, runs);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  return {root: renderer.root, renderer};
}

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n) return;
    if (typeof n.props?.accessibilityLabel === 'string') out += n.props.accessibilityLabel;
    if (!n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string): ReactTestRenderer.ReactTestInstance {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

async function tap(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => { node.props.onPress(); });
  await flush();
}

function setInput(root: ReactTestRenderer.ReactTestInstance, label: string, value: string) {
  const input = root.findAll((n: any) => n && n.props && n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function');
  if (!input.length) throw new Error(`no TextInput labeled "${label}"`);
  act(() => { input[0].props.onChangeText(value); });
}

let alertSpy: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { alertSpy.mockRestore(); });

const SHOE: ApiShoe[] = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];

test('런 삭제 → 확인 Alert 후 신발 사용거리(km) 감소', async () => {
  // r1 10km + r2 5.25km → 신발 사용 15km(round 15.25). r2 삭제 시 10km로 감소.
  const runs: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 10, run_date: '2026-05-20', duration: 3000},
    {id: 'r2', shoe_id: 's1', km: 5.25, run_date: '2026-05-21', duration: 1500},
  ];
  const {root} = await mount(SHOE, runs);

  // 삭제 전: 신발 카드에 누적 15 / 600 km.
  await tap(pressBy(root, 'shoe-sneaker'));
  expect(textOf(root)).toContain('15 / 600');

  // 기록 탭 → r2(5.25km) 상세 진입.
  await tap(pressBy(root, '기록'));
  await tap(pressBy(root, '5.25'));

  // 삭제 버튼 → 확인 Alert가 뜬다(파괴 방지). 확인 전엔 아직 삭제되지 않는다.
  await tap(pressBy(root, 'trash-outline'));
  const call = alertSpy.mock.calls.find(c => String(c[0]).includes('러닝 기록 삭제'));
  expect(call).toBeTruthy();
  const del = (call![2] as any[]).find(b => b.text === '삭제');
  expect(del.style).toBe('destructive');

  // 확인('삭제') → DELETE 전송 + 목록/신발 km 반영.
  (globalThis.fetch as jest.Mock).mockClear();
  await act(async () => { del.onPress(); });
  await flush();

  const delCall = (globalThis.fetch as jest.Mock).mock.calls.find(
    (c: any[]) => /\/api\/runs\/r2$/.test(String(c[0])) && c[1] && c[1].method === 'DELETE',
  );
  expect(delCall).toBeTruthy();

  // 신발 탭: 사용거리 15 → 10으로 감소(shoeHealth가 runs 파생).
  await tap(pressBy(root, 'shoe-sneaker'));
  expect(textOf(root)).toContain('10 / 600');
  expect(textOf(root)).not.toContain('15 / 600');
});

test('수동 입력 → 목록에 런 추가 + source=manual로 POST', async () => {
  const {root} = await mount(SHOE, []);

  // 기록 탭 → 수동 추가 버튼('add' 아이콘) → 폼.
  await tap(pressBy(root, '기록'));
  await tap(pressBy(root, 'add'));

  // 거리 7.5(기본 신발/오늘 날짜 자동) 입력 후 추가.
  setInput(root, '거리', '7.5');
  (globalThis.fetch as jest.Mock).mockClear();
  await tap(pressBy(root, '추가하기'));

  // 목록에 7.5km 런이 낙관적으로 추가된다.
  expect(textOf(root)).toContain('7.5');

  // 백엔드 POST는 source='manual', km=7.5로 전송된다(앱 외 주행 보정).
  const post = (globalThis.fetch as jest.Mock).mock.calls.find(
    (c: any[]) => /\/api\/runs$/.test(String(c[0])) && c[1] && c[1].method === 'POST',
  );
  expect(post).toBeTruthy();
  const body = JSON.parse(post![1].body);
  expect(body.source).toBe('manual');
  expect(body.km).toBe(7.5);
  expect(body.shoe_id).toBe('s1');
});

test('런 편집(거리) → 백엔드 PATCH + 신발 km 재계산', async () => {
  const runs: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 10, run_date: '2026-05-20', duration: 3000}];
  const {root} = await mount(SHOE, runs);

  // 편집 전: 신발 10 / 600 km.
  await tap(pressBy(root, 'shoe-sneaker'));
  expect(textOf(root)).toContain('10 / 600');

  // 기록 → r1 상세 → 편집('create-outline') → 폼 프리필.
  await tap(pressBy(root, '기록'));
  await tap(pressBy(root, '10'));
  await tap(pressBy(root, 'create-outline'));

  // 거리 10 → 12로 수정 후 저장.
  setInput(root, '거리', '12');
  (globalThis.fetch as jest.Mock).mockClear();
  await tap(pressBy(root, '저장하기'));

  // PATCH /api/runs/r1 에 km=12 전송.
  const patch = (globalThis.fetch as jest.Mock).mock.calls.find(
    (c: any[]) => /\/api\/runs\/r1$/.test(String(c[0])) && c[1] && c[1].method === 'PATCH',
  );
  expect(patch).toBeTruthy();
  expect(JSON.parse(patch![1].body).km).toBe(12);

  // 신발 km 재계산: 10 → 12.
  await tap(pressBy(root, 'shoe-sneaker'));
  expect(textOf(root)).toContain('12 / 600');
});

test('개인 기록(PR) 카드: 1km 페이스·5km 기록·최장 거리 렌더', async () => {
  // 5km/1500s → 1km 5\'00", 5km 25:00. 21.1km → 최장 거리.
  const runs: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-05-20', duration: 1500},
    {id: 'r2', shoe_id: 's1', km: 21.1, run_date: '2026-05-10', duration: 7200},
  ];
  const {root} = await mount(SHOE, runs);

  await tap(pressBy(root, '마이'));
  const txt = textOf(root);
  expect(txt).toContain('개인 기록');
  expect(txt).toContain('1km 최고 페이스');
  expect(txt).toContain("5'00\"");   // 1km 최고 페이스
  expect(txt).toContain('25:00');     // 5km 최고 기록
  expect(txt).toContain('21.1');      // 최장 거리
});
