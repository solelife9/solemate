/**
 * Phase 2 — 앱 전역 클라우드 동기(Firestore 정본) 테스트.
 *
 * 관찰 가능한 결과:
 *   1) 중앙화: ProfileScreen(마이 탭)으로 이동하지 않아도, 부팅/로그인 직후 cloudPort.pull
 *      (원격 복원)과 cloudPort.push(백업)가 호출된다 — 동기가 더 이상 프로필 탭에 묶여 있지 않다.
 *   2) 복원: 원격(Firestore)에만 있던 신발이 병합(mergeCloudData)되어 화면 상태로 들어온다.
 *
 * 동기는 __KEEGO_ENABLE_CLOUD_SYNC__ 로만 테스트에서 활성화한다(기본 우회 — 다른 App
 * 스위트는 영향 없음). cloudPort 는 메모리 목 주입.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

type Resp = {ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string>};
const ok = (body: any): Resp => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

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

test('중앙 클라우드 동기: 프로필 탭 방문 없이 부팅 직후 pull→push 하고, 원격 신발을 복원한다', async () => {
  await AsyncStorage.clear();
  // REST 부팅은 비어 있게(로컬 빈 상태). 인증만 성공.
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    if (u.includes('/api/shoes')) return Promise.resolve(ok([]));
    if (u.includes('/api/runs')) return Promise.resolve(ok([]));
    return Promise.resolve(ok({}));
  });

  // 원격(Firestore)에만 있는 신발 — pull 로 내려와 병합되어야 한다.
  const remote = {
    shoes: [{id: 'C1', name: 'Adidas Boston', max_km: 700, start_km: 0, updatedAt: 2}],
    runs: [],
    settings: {},
  };
  const port = {
    signIn: jest.fn(() => Promise.resolve({uid: 'u-1', email: null, displayName: null})),
    signOut: jest.fn(() => Promise.resolve()),
    deleteAccount: jest.fn(() => Promise.resolve()),
    pull: jest.fn(() => Promise.resolve(remote)),
    push: jest.fn(() => Promise.resolve()),
  };
  (globalThis as any).__KEEGO_CLOUD_PORT__ = port;
  (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'test-uid'};
  (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__ = true;
  // devSeed 가 빈 상태를 덮지 않게(원격 복원만 보이도록).
  (globalThis as any).__KEEGO_DEV_SEED__ = false;

  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    jest.useFakeTimers();
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    // 부팅 effect(즉시 pull) + 디바운스(1.2s) 정착.
    const settle = async () => {
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
      for (let i = 0; i < 14; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    };
    await settle();

    // 1) 중앙화: 프로필 탭으로 이동하지 않았는데도 pull/push 가 호출됐다.
    expect(port.pull).toHaveBeenCalled();
    expect(port.push).toHaveBeenCalled();

    // 2) 복원: 원격 신발이 병합되어 상태로 들어왔다. (빈 로컬 + 원격 1켤레 복원이라
    //    '첫 신발' 업적이 발동해 셀러브레이션이 떠 있다 — 복원이 실제로 일어났다는 증거.)
    //    셀러브레이션 '확인'을 눌러 닫은 뒤, 화면에서 원격 신발 이름을 직접 확인한다.
    const screen1 = textOf(renderer.toJSON());
    expect(screen1).toContain('첫 신발');
    const confirm = renderer.root.find(
      (n: any) => n.props && typeof n.props.onPress === 'function' &&
        textOf(n).includes('확인'),
    );
    await act(async () => {
      confirm.props.onPress();
    });
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    // (홈 히어로는 이름을 브랜드 대문자 + 모델로 쪼개 표시하므로 모델명 'Boston' 으로 확인.)
    const screen2 = textOf(renderer.toJSON());
    expect(screen2).toContain('Boston');

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
    delete (globalThis as any).__KEEGO_AUTH_USER__;
    delete (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__;
    delete (globalThis as any).__KEEGO_DEV_SEED__;
  }
});
