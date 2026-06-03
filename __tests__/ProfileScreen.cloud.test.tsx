/**
 * ProfileScreen 계정·클라우드 동기 행동 테스트.
 *
 * 메모리 목 포트/props 주입으로 백엔드 호출 없이 "관찰 가능한 결과"를 단언한다
 * (test_critic 요건):
 *   1) 로그인 — Google/Apple 버튼을 누르면 port.signIn(provider) 이 호출되고, 성공 시
 *      상태가 signedIn 으로 반영돼 이메일/계정과 로그아웃·지금 동기 행이 노출된다.
 *   2) 지금 동기 — port.pull → cloudSync.mergeCloudData(로컬, 원격) → port.push 경로가
 *      순서대로 호출되고, push 페이로드는 로컬+원격을 무손실 병합한 결과(양쪽 id 보존)이며,
 *      onCloudMerged 가 같은 병합 결과로 호출된다(원격→로컬 반영). 마지막 동기 시각도 갱신.
 *   3) 로그아웃 — port.signOut 이 호출되고 상태가 signedOut 으로 되돌아(로그인 버튼 재노출).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen.rn';
import type {CloudProvider} from '../lib/cloudPort';
import type {BackupPayload} from '../lib/backup';

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
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<ProfileScreen {...props} />);
  });
  return renderer.root;
}

// testID 매칭 — Pressable 등 composite 는 testID 가 호스트로도 전파돼 여러 인스턴스에
// 걸리므로, 첫 매치(byTestId)로 onPress 를 잡고 존재 여부는 hasId 로 본다.
function byTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id)[0];
}
function hasId(root: ReactTestRenderer.ReactTestInstance, id: string): boolean {
  return root.findAll((n: any) => n.props?.testID === id).length > 0;
}

// 비동기 핸들러(promise 체인)를 act 안에서 흘려보낸다.
async function press(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    node.props.onPress();
  });
}

type MockPort = {
  signIn: jest.Mock;
  signOut: jest.Mock;
  pull: jest.Mock;
  push: jest.Mock;
};

function mockPort(remote: BackupPayload | null = null): MockPort {
  return {
    signIn: jest.fn((_p: CloudProvider) => Promise.resolve({uid: 'u-1', email: 'runner@keego.app'})),
    signOut: jest.fn(() => Promise.resolve()),
    pull: jest.fn(() => Promise.resolve(remote)),
    push: jest.fn((_d: BackupPayload) => Promise.resolve()),
  };
}

const LOCAL: BackupPayload = {
  shoes: [{id: 'L1', brand: 'Nike', model: 'Pegasus'}],
  runs: [{id: 'r-local', km: 5}],
  settings: {unit: 'km'},
};

describe('ProfileScreen 계정·클라우드 로그인', () => {
  test('로그아웃 상태에선 Google/Apple 로그인 버튼이 보이고 로그아웃 행은 없다', () => {
    const root = render({cloudPort: mockPort(), backupData: LOCAL});
    expect(hasId(root, 'cloud-signin-google')).toBe(true);
    expect(hasId(root, 'cloud-signin-apple')).toBe(true);
    expect(hasId(root, 'cloud-sync')).toBe(false);
  });

  test('Google 로그인을 누르면 port.signIn("google")이 호출되고 signedIn 상태가 반영된다', async () => {
    const port = mockPort();
    const root = render({cloudPort: port, backupData: LOCAL});

    await press(byTestId(root, 'cloud-signin-google'));

    expect(port.signIn).toHaveBeenCalledTimes(1);
    expect(port.signIn).toHaveBeenCalledWith('google');
    // signedIn 반영: 계정(이메일) 행 + 지금 동기 + 로그아웃 노출, 로그인 버튼은 사라짐.
    expect(textOf(byTestId(root, 'cloud-account'))).toContain('runner@keego.app');
    expect(hasId(root, 'cloud-sync')).toBe(true);
    expect(hasId(root, 'cloud-signin-google')).toBe(false);
  });

  test('Apple 로그인을 누르면 port.signIn("apple")이 호출된다', async () => {
    const port = mockPort();
    const root = render({cloudPort: port, backupData: LOCAL});
    await press(byTestId(root, 'cloud-signin-apple'));
    expect(port.signIn).toHaveBeenCalledWith('apple');
  });

  test('로그인 실패 시 signedIn 으로 가지 않고 에러 안내를 노출한다(버튼 유지)', async () => {
    const port = mockPort();
    port.signIn.mockRejectedValueOnce(new Error('자격증명을 가져오지 못했습니다.'));
    const root = render({cloudPort: port, backupData: LOCAL});
    await press(byTestId(root, 'cloud-signin-google'));
    // 여전히 로그인 버튼이 보이고(signedIn 아님), 에러 안내가 노출된다.
    expect(hasId(root, 'cloud-signin-google')).toBe(true);
    expect(textOf(byTestId(root, 'cloud-msg'))).toContain('자격증명');
  });
});

describe('ProfileScreen 지금 동기 (pull→merge→push)', () => {
  test('동기를 누르면 pull→push 경로가 호출되고 push 는 로컬+원격 무손실 병합 결과다', async () => {
    // 원격에만 있는 신발/런 id — 병합 후 push 와 onCloudMerged 에 양쪽이 모두 보존돼야 한다.
    const remote: BackupPayload = {
      shoes: [{id: 'R1', brand: 'Adidas', model: 'Boston'}],
      runs: [{id: 'r-remote', km: 8}],
      settings: {theme: 'dark'},
    };
    const port = mockPort(remote);
    const onCloudMerged = jest.fn();
    const root = render({cloudPort: port, backupData: LOCAL, onCloudMerged, cloudClock: () => 1_700_000_000_000});

    await press(byTestId(root, 'cloud-signin-google')); // signedIn 선행
    await press(byTestId(root, 'cloud-sync'));

    // pull 먼저, push 나중(merge 경로). 두 번 이상 push 되지 않는다.
    expect(port.pull).toHaveBeenCalledTimes(1);
    expect(port.push).toHaveBeenCalledTimes(1);
    expect(port.pull.mock.invocationCallOrder[0]).toBeLessThan(port.push.mock.invocationCallOrder[0]);

    // push 페이로드 = mergeCloudData(LOCAL, remote): 로컬·원격 id 모두 보존(데이터 파괴 0).
    const pushed: BackupPayload = port.push.mock.calls[0][0];
    const shoeIds = pushed.shoes.map((x: any) => x.id).sort();
    const runIds = pushed.runs.map((x: any) => x.id).sort();
    expect(shoeIds).toEqual(['L1', 'R1']);
    expect(runIds).toEqual(['r-local', 'r-remote']);
    // settings 도 양쪽 키 보존(unit=local, theme=remote)
    expect(pushed.settings.unit).toBe('km');
    expect(pushed.settings.theme).toBe('dark');

    // onCloudMerged 가 동일한 병합 결과로 호출돼 원격→로컬 반영 경로가 이어진다.
    expect(onCloudMerged).toHaveBeenCalledTimes(1);
    expect(onCloudMerged.mock.calls[0][0]).toEqual(pushed);

    // 마지막 동기 시각이 '아직 동기 안 함'에서 갱신된다.
    const last = textOf(byTestId(root, 'cloud-last-sync'));
    expect(last).not.toContain('아직 동기 안 함');
    expect(last).toContain('동기됨');
  });

  test('원격이 비어(null) 있어도 로컬을 유실 없이 push 한다', async () => {
    const port = mockPort(null);
    const onCloudMerged = jest.fn();
    const root = render({cloudPort: port, backupData: LOCAL, onCloudMerged});
    await press(byTestId(root, 'cloud-signin-google'));
    await press(byTestId(root, 'cloud-sync'));

    const pushed: BackupPayload = port.push.mock.calls[0][0];
    expect(pushed.shoes.map((x: any) => x.id)).toEqual(['L1']);
    expect(pushed.runs.map((x: any) => x.id)).toEqual(['r-local']);
  });
});

describe('ProfileScreen 로그아웃', () => {
  test('로그아웃을 누르면 port.signOut 이 호출되고 로그인 버튼이 다시 노출된다', async () => {
    const port = mockPort();
    const root = render({cloudPort: port, backupData: LOCAL});
    await press(byTestId(root, 'cloud-signin-google'));
    expect(hasId(root, 'cloud-sync')).toBe(true); // signedIn 확인

    const signOutBtn = root.find(
      (n: any) => n.props?.accessibilityLabel === '로그아웃' && typeof n.props?.onPress === 'function',
    );
    await press(signOutBtn);

    expect(port.signOut).toHaveBeenCalledTimes(1);
    // signedOut 반영: 로그인 버튼 재노출, 동기 행 사라짐.
    expect(hasId(root, 'cloud-signin-google')).toBe(true);
    expect(hasId(root, 'cloud-sync')).toBe(false);
  });
});
