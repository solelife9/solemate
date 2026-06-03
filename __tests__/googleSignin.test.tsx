/**
 * Google 네이티브 로그인 행동 테스트 (Slice 5).
 *
 * 두 층위를 관찰 가능한 결과로 단언한다(test_critic 요건 — 내부 상태/무에러 단언 금지):
 *
 *  A) resolveGoogleCredential (lib/googleAuth) — 네이티브 GoogleSignin 을 메모리 목으로
 *     세우고: 성공 시 hasPlayServices→signIn→idToken→GoogleAuthProvider.credential(idToken)
 *     경로가 흐르고 토큰을 담은 firebase 자격증명을 돌려준다. Play 서비스 없음/사용자
 *     취소/토큰 없음 시 각각 정직한 한국어 에러로 reject 한다(버튼이 정직히 막힘).
 *
 *  B) 통합 — ProfileScreen 의 'Google로 계속' 버튼을 실제 firebaseCloudPort(리졸버 주입)
 *     로 누르면: GoogleSignin.signIn 이 호출되고 그 idToken 이 firebase 자격증명으로 감싸여
 *     signInWithCredential 에 전달되며, 화면이 signedIn(동기 행 노출/로그인 버튼 사라짐)으로
 *     반영된다. Play 서비스 없음 시엔 signedIn 으로 가지 않고 에러 안내가 뜬다(버튼 유지).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import ProfileScreen from '../ProfileScreen.rn';
import {createFirebaseCloudPort} from '../lib/firebaseCloudPort';
import {
  resolveGoogleCredential,
  configureGoogleSignin,
  __resetGoogleSigninForTest,
} from '../lib/googleAuth';
import type {BackupPayload} from '../lib/backup';

// 목으로 대체된 네이티브 모듈을 직접 잡아 동작을 케이스별로 바꾼다.
const {
  GoogleSignin,
  statusCodes,
} = require('@react-native-google-signin/google-signin');
const {GoogleAuthProvider, signInWithCredential} = require('@react-native-firebase/auth');

beforeEach(() => {
  __resetGoogleSigninForTest();
});

// ── A) resolveGoogleCredential ───────────────────────────────────────────────
describe('resolveGoogleCredential (네이티브 Google → firebase 자격증명)', () => {
  test('성공: hasPlayServices→signIn→idToken→GoogleAuthProvider.credential 로 자격증명을 만든다', async () => {
    const credential = await resolveGoogleCredential();

    expect(GoogleSignin.hasPlayServices).toHaveBeenCalledTimes(1);
    expect(GoogleSignin.signIn).toHaveBeenCalledTimes(1);
    // signIn 이 돌려준 idToken 이 그대로 firebase 자격증명으로 감싸진다.
    expect(GoogleAuthProvider.credential).toHaveBeenCalledWith('mock-google-id-token');
    expect(credential.providerId).toBe('google.com');
    expect(credential.token).toBe('mock-google-id-token');
  });

  test('configure 는 멱등하다(두 번 호출해도 GoogleSignin.configure 는 한 번)', () => {
    configureGoogleSignin();
    configureGoogleSignin();
    expect(GoogleSignin.configure).toHaveBeenCalledTimes(1);
  });

  test('Play 서비스 없음: PLAY_SERVICES_NOT_AVAILABLE → 정직한 에러로 막고 signIn 은 시도하지 않는다', async () => {
    GoogleSignin.hasPlayServices.mockRejectedValueOnce({
      code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
      message: 'play services not available',
    });
    await expect(resolveGoogleCredential()).rejects.toThrow('Google Play 서비스');
    expect(GoogleSignin.signIn).not.toHaveBeenCalled();
    expect(GoogleAuthProvider.credential).not.toHaveBeenCalled();
  });

  test('사용자 취소: {type:"cancelled"} → 취소 에러로 reject 하고 자격증명을 만들지 않는다', async () => {
    GoogleSignin.signIn.mockResolvedValueOnce({type: 'cancelled', data: null});
    await expect(resolveGoogleCredential()).rejects.toThrow('취소');
    expect(GoogleAuthProvider.credential).not.toHaveBeenCalled();
  });

  test('idToken 없음: signIn 이 토큰을 안 주면 정직한 에러로 막는다', async () => {
    GoogleSignin.signIn.mockResolvedValueOnce({
      type: 'success',
      data: {idToken: null, user: {id: 'g-1', email: 'x@y.z'}},
    });
    await expect(resolveGoogleCredential()).rejects.toThrow('idToken');
    expect(GoogleAuthProvider.credential).not.toHaveBeenCalled();
  });
});

// ── B) ProfileScreen 통합 (실제 포트 + 주입 리졸버) ──────────────────────────
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
function byTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id)[0];
}
function hasId(root: ReactTestRenderer.ReactTestInstance, id: string): boolean {
  return root.findAll((n: any) => n.props?.testID === id).length > 0;
}
async function press(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    node.props.onPress();
  });
}

const LOCAL: BackupPayload = {
  shoes: [{id: 'L1', brand: 'Nike', model: 'Pegasus'}],
  runs: [{id: 'r-local', km: 5}],
  settings: {unit: 'km'},
};

describe('ProfileScreen — Google로 계속 (실 리졸버 주입 포트)', () => {
  test('버튼을 누르면 GoogleSignin.signIn→idToken→signInWithCredential 로 흘러 signedIn 이 반영된다', async () => {
    const port = createFirebaseCloudPort({resolveGoogleCredential});
    const root = render({cloudPort: port, backupData: LOCAL});

    await press(byTestId(root, 'cloud-signin-google'));

    // 네이티브 Google 로그인이 실제로 트리거됐다.
    expect(GoogleSignin.signIn).toHaveBeenCalledTimes(1);
    // 그 idToken 이 firebase 자격증명으로 감싸져 signInWithCredential 에 전달됐다.
    expect(signInWithCredential).toHaveBeenCalledTimes(1);
    const passedCredential = signInWithCredential.mock.calls[0][1];
    expect(passedCredential.token).toBe('mock-google-id-token');
    expect(passedCredential.providerId).toBe('google.com');
    // 화면이 signedIn 으로: 동기 행 노출, 로그인 버튼 사라짐, 계정 행 노출.
    expect(hasId(root, 'cloud-sync')).toBe(true);
    expect(hasId(root, 'cloud-signin-google')).toBe(false);
    expect(textOf(byTestId(root, 'cloud-account')).length).toBeGreaterThan(0);
  });

  test('Play 서비스 없음이면 signedIn 으로 가지 않고 에러 안내가 뜬다(로그인 버튼 유지)', async () => {
    GoogleSignin.hasPlayServices.mockRejectedValueOnce({
      code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
      message: 'unavailable',
    });
    const port = createFirebaseCloudPort({resolveGoogleCredential});
    const root = render({cloudPort: port, backupData: LOCAL});

    await press(byTestId(root, 'cloud-signin-google'));

    expect(signInWithCredential).not.toHaveBeenCalled();
    expect(hasId(root, 'cloud-signin-google')).toBe(true); // signedIn 아님
    expect(hasId(root, 'cloud-sync')).toBe(false);
    expect(textOf(byTestId(root, 'cloud-msg'))).toContain('Google Play 서비스');
  });
});
