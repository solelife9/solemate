// ============================================================================
// firebaseCloudPort — CloudPort 의 firebase 구현 행동 테스트 (Slice 5)
//
// firebase 모듈은 jest.setup.js 에서 메모리 가짜로 목 처리된다(실 네이티브 0).
// 여기서는 관찰 가능한 결과만 단언한다: 로그인이 사용자/인증상태를 바꾼다, push 한
// 페이로드를 pull 로 그대로 되읽는다(라운드트립), 미로그인 동기는 거부된다.
// ============================================================================

import * as authMock from '@react-native-firebase/auth';
import * as firestoreMock from '@react-native-firebase/firestore';

import {createFirebaseCloudPort} from '../../lib/firebaseCloudPort';
import type {BackupPayload} from '../../lib/backup';

const resetFirebase = () => {
  (authMock as unknown as {__reset: () => void}).__reset();
  (firestoreMock as unknown as {__reset: () => void}).__reset();
};

const currentUid = (): string | undefined =>
  (authMock.getAuth() as unknown as {currentUser: {uid: string} | null}).currentUser?.uid;

describe('firebaseCloudPort (Firebase 클라우드 포트)', () => {
  beforeEach(resetFirebase);

  test('anonymous 로그인은 uid 를 가진 사용자를 돌려주고 currentUser 를 세팅한다', async () => {
    const port = createFirebaseCloudPort();
    const user = await port.signIn('anonymous');
    expect(user.uid).toBe('anon-test-uid');
    expect(currentUid()).toBe('anon-test-uid');
  });

  test('push 한 BackupPayload 를 pull 로 그대로 되읽는다 (firestore 라운드트립)', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');

    const payload: BackupPayload = {
      shoes: [{id: 's1', brand: 'Nike', model: 'Pegasus'}],
      runs: [{id: 'r1', distanceKm: 5}],
      settings: {units: 'km', weightKg: 70},
    };
    await port.push(payload);

    const pulled = await port.pull();
    expect(pulled).toEqual(payload);
  });

  test('progression(은퇴 신발 등)이 push→pull 라운드트립에서 보존된다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');

    const payload: BackupPayload = {
      shoes: [],
      runs: [],
      settings: {},
      progression: {
        earnedTitles: [],
        equippedTitleKey: null,
        seenUnlocks: ['rank_silver'],
        retiredShoes: [{shoeId: 'x', name: '은퇴화', km: 600, retiredAt: '2026-01-01', retireYear: 2026, grade: 'gold'} as any],
        points: 120,
      },
    };
    await port.push(payload);

    const pulled = await port.pull();
    expect(pulled?.progression?.retiredShoes).toHaveLength(1);
    expect(pulled?.progression?.retiredShoes[0].shoeId).toBe('x');
    expect(pulled?.progression?.points).toBe(120);
    expect(pulled?.progression?.seenUnlocks).toEqual(['rank_silver']);
  });

  test('한 번도 push 하지 않은 계정의 pull 은 null', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    expect(await port.pull()).toBeNull();
  });

  test('각 사용자는 자신의 문서만 본다 (uid 별 데이터 격리)', async () => {
    const port = createFirebaseCloudPort();

    await port.signIn('anonymous'); // uid: anon-test-uid
    await port.push({shoes: [{id: 'a'}], runs: [], settings: {}});

    // 다른 사용자로 전환 — 이전 사용자의 백업이 보이면 안 된다.
    (authMock as unknown as {__setCurrentUser: (u: {uid: string}) => void}).__setCurrentUser({
      uid: 'other-user',
    });
    expect(await port.pull()).toBeNull();

    // 원래 사용자로 복귀하면 자신의 데이터가 그대로 보인다.
    (authMock as unknown as {__setCurrentUser: (u: {uid: string}) => void}).__setCurrentUser({
      uid: 'anon-test-uid',
    });
    const pulled = await port.pull();
    expect(pulled?.shoes).toEqual([{id: 'a'}]);
  });

  test('로그인 전 pull/push 는 "로그인 필요" 로 거부된다 (데이터 보호)', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.pull()).rejects.toThrow(/로그인/);
    await expect(
      port.push({shoes: [], runs: [], settings: {}}),
    ).rejects.toThrow(/로그인/);
  });

  test('signOut 후에는 currentUser 가 비워진다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    expect(currentUid()).toBe('anon-test-uid');
    await port.signOut();
    expect(currentUid()).toBeUndefined();
  });

  test('google 로그인은 주입된 자격증명 리졸버로 로그인한다', async () => {
    const resolveGoogleCredential = jest.fn(() =>
      Promise.resolve({uid: 'google-xyz'} as never),
    );
    const port = createFirebaseCloudPort({resolveGoogleCredential});
    const user = await port.signIn('google');
    expect(resolveGoogleCredential).toHaveBeenCalledTimes(1);
    expect(user.uid).toBe('google-xyz');
    expect(currentUid()).toBe('google-xyz');
  });

  test('리졸버 없이 google 로그인은 명확한 에러로 거부된다', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.signIn('google')).rejects.toThrow(/google/i);
  });

  test('kakao 로그인은 주입된 커스텀 토큰 리졸버로 signInWithCustomToken 한다', async () => {
    const resolveKakaoToken = jest.fn(() => Promise.resolve('kakao-custom-token'));
    const port = createFirebaseCloudPort({resolveKakaoToken});
    const user = await port.signIn('kakao');
    expect(resolveKakaoToken).toHaveBeenCalledTimes(1);
    expect(user.uid).toBe('custom:kakao-custom-token');
    expect(currentUid()).toBe('custom:kakao-custom-token');
  });

  test('naver 로그인도 커스텀 토큰 리졸버로 로그인한다', async () => {
    const resolveNaverToken = jest.fn(() => Promise.resolve('naver-custom-token'));
    const port = createFirebaseCloudPort({resolveNaverToken});
    const user = await port.signIn('naver');
    expect(resolveNaverToken).toHaveBeenCalledTimes(1);
    expect(user.uid).toBe('custom:naver-custom-token');
  });

  test('리졸버 없이 kakao/naver 로그인은 명확한 에러로 거부된다', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.signIn('kakao')).rejects.toThrow(/kakao/i);
    await expect(port.signIn('naver')).rejects.toThrow(/naver/i);
  });

  test('apple 로그인은 주입된 자격증명 리졸버로 로그인한다', async () => {
    const resolveAppleCredential = jest.fn(() =>
      Promise.resolve({uid: 'apple-xyz'} as never),
    );
    const port = createFirebaseCloudPort({resolveAppleCredential});
    const user = await port.signIn('apple');
    expect(resolveAppleCredential).toHaveBeenCalledTimes(1);
    expect(user.uid).toBe('apple-xyz');
    expect(currentUid()).toBe('apple-xyz');
  });

  test('리졸버 없이 apple 로그인은 명확한 에러로 거부된다', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.signIn('apple')).rejects.toThrow(/apple/i);
  });

  // ── 회원 탈퇴(deleteAccount) ────────────────────────────────────────────────
  test('deleteAccount 는 백업 문서를 지우고 인증 계정을 삭제한다', async () => {
    const port = createFirebaseCloudPort();
    await port.signIn('anonymous');
    await port.push({shoes: [{id: 'a'}], runs: [], settings: {}});
    expect(currentUid()).toBe('anon-test-uid');

    await port.deleteAccount();

    // 계정이 비워진다(로그아웃과 동일 효과의 목).
    expect(currentUid()).toBeUndefined();

    // 백업 문서도 삭제됨: 같은 uid 로 되돌려도 pull 은 null.
    (authMock as unknown as {__setCurrentUser: (u: {uid: string}) => void}).__setCurrentUser({
      uid: 'anon-test-uid',
    });
    expect(await port.pull()).toBeNull();
  });

  test('로그인하지 않은 상태의 deleteAccount 는 명확한 에러로 거부된다', async () => {
    const port = createFirebaseCloudPort();
    await expect(port.deleteAccount()).rejects.toThrow(/계정/);
  });
});
