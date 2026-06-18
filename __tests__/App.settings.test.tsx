/**
 * App.tsx 프로필 설정 4행 통합 테스트.
 *
 * 관찰 가능한 동작을 검증한다(화면에 무엇이 보이고 무엇이 영속되는가):
 *   1) 단위 행을 누르면 km↔mi 토글 → settings_unit이 영속되고, 프로필·홈 등
 *      전 화면의 거리 표기가 즉시 환산 단위로 바뀐다('마일' / 'mi 남음').
 *   2) 단위 선택은 영속되어 재마운트(앱 재실행) 후에도 복원된다.
 *   3) 알림 행 토글이 settings_alerts(enabled)에 영속된다.
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

// 설정 행은 마이탭 헤더 ⚙️ 뒤의 '설정' 뷰로 분리됐다 — 프로필 탭 진입 후 설정을 연다.
async function toSettings(r: ReactTestRenderer.ReactTestInstance) {
  await tap(pressBy(r, '마이'));
  await tap(r.findAll((n: any) => n.props?.accessibilityLabel === '설정 열기')[0]);
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

// 오늘 날짜(로컬)를 'YYYY-MM-DD'로. 주간 목표/달성률은 이번 주 런만 센다.
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SHOES: ApiShoe[] = [
  {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
  {id: 's2', name: 'Hoka Clifton', max_km: 600, start_km: 0},
];
const RUNS: ApiRun[] = [
  {id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-05-31', duration: 1800},
  {id: 'r2', shoe_id: 's2', km: 5, run_date: '2026-05-01', duration: 1800},
];

test('단위 행 토글 → settings_unit 영속 + 전 화면 즉시 환산 반영', async () => {
  const {root} = await mount(SHOES, RUNS);
  await toSettings(root); // 프로필 탭 → 설정 뷰

  // 초기 단위는 킬로미터(하드코딩 제거 — 실제 설정값을 표시)
  expect(textOf(root)).toContain('킬로미터');

  // 단위 행 탭 → km→mi
  await tap(pressBy(root, '단위'));

  // (a) 영속: settings_unit = 'mi'
  expect(await AsyncStorage.getItem('settings_unit')).toBe('mi');
  // (b) 프로필 화면 즉시 반영: 단위 표기가 '마일'로 바뀐다
  expect(textOf(root)).toContain('마일');
  expect(textOf(root)).not.toContain('킬로미터');

  // (c) 다른 화면(홈)도 즉시 환산 단위로: 'mi 남음'(km 아님)
  await tap(pressBy(root, '홈'));
  const home = textOf(root);
  expect(home).toContain('mi 남음');
  expect(home).not.toContain('km 남음');
  // (d) 라벨뿐 아니라 환산된 *숫자값*도 반영: 남은 수명 595km → 약 370mi.
  //     km 원숫자(595)는 사라지고 환산값(370)이 떠야 한다(표시만 환산, 라벨만 X).
  expect(home).toContain('370'); // displayNum(595,'mi')=370
  expect(home).not.toContain('595');
});

test('홈은 토글 전 km 원숫자(595)를 보여준다(환산 기준점)', async () => {
  const {root} = await mount(SHOES, RUNS);
  await tap(pressBy(root, '홈'));
  const home = textOf(root);
  // 기본 단위 km: 남은 수명 600-5 = 595km, 'km 남음'
  expect(home).toContain('595');
  expect(home).toContain('km 남음');
});

test('신발 화면(전 화면 환산)도 토글 시 환산된 수치를 보여준다', async () => {
  const {root} = await mount(SHOES, RUNS);

  // 신발 탭(락커): 카드가 km로 '600' 표기(used 5 / max 600 km)
  // 탭 전환은 아이콘(shoe-sneaker)으로 — '신발' 라벨은 다른 화면 텍스트와 모호.
  await tap(pressBy(root, '신발'));
  expect(textOf(root)).toContain('600');
  expect(textOf(root)).toContain('km');

  // 프로필에서 mi로 토글
  await toSettings(root);
  await tap(pressBy(root, '단위'));
  expect(await AsyncStorage.getItem('settings_unit')).toBe('mi');

  // 신발 탭 복귀: max 600km → 373mi로 환산된 수치가 떠야 한다(라벨 mi)
  await tap(pressBy(root, '신발'));
  const shoes = textOf(root);
  expect(shoes).toContain('373'); // displayNum(600,'mi')=373
  expect(shoes).toContain('mi');
  expect(shoes).not.toContain('600'); // km 원숫자는 사라진다
});

// (제거됨) 신발 상세 cost-per-km(구매가) 힌트 테스트 — 구매가 기능이 UI에서 제거되어
// 더 이상 해당 힌트가 없다. 거리 단위 환산은 위의 'mi 단위 락커' 테스트가 계속 커버한다.

test('앱·기기 정보 — 계정·클라우드 섹션에 기기/가입/버전 필드를 렌더한다', async () => {
  const {root} = await mount(SHOES, RUNS);
  await toSettings(root);

  // 기존 '계정 설정' 행을 계정·클라우드 섹션으로 통합 — 펼침 없이 항상 보인다.
  const txt = textOf(root);
  expect(txt).toContain('기기 ID');
  expect(txt).toContain('버전');
  expect(txt).toContain('0.0.1'); // APP_VERSION 값
});

test('단위 선택은 영속되어 재마운트(앱 재실행) 후에도 복원된다', async () => {
  const first = await mount(SHOES, RUNS);
  await toSettings(first.root);
  await tap(pressBy(first.root, '단위')); // → mi
  expect(await AsyncStorage.getItem('settings_unit')).toBe('mi');

  // 재마운트: loadSettings가 mi를 복원해야 한다(스토리지는 유지)
  const second = await mount(SHOES, RUNS);
  await toSettings(second.root);
  expect(textOf(second.root)).toContain('마일');
});

// 주간 달성률(0~1)을 진행 바(testID='goal-progress')의 width(%)에서 읽는다 — 목업
// 리스킨에서 % 텍스트가 막대 게이지로 바뀌어, 바 채움으로 검증한다.
test('알림 행 토글 → settings_alerts(enabled=false) 영속 + 표기 갱신', async () => {
  const {root} = await mount(SHOES, RUNS);
  await toSettings(root);

  // 알림 행을 펼친다(초기 '켜짐')
  expect(textOf(root)).toContain('켜짐');
  await tap(pressBy(root, '알림'));

  // 패널의 토글을 눌러 끈다
  await tap(pressBy(root, '신발 교체 알림'));

  // 영속: settings_alerts.enabled = false
  const raw = await AsyncStorage.getItem('settings_alerts');
  expect(raw).toBeTruthy();
  expect(JSON.parse(raw as string).enabled).toBe(false);
  // 행 표기 '꺼짐'
  expect(textOf(root)).toContain('꺼짐');
});
