/**
 * 오프라인 회원 탈퇴가 무반응으로 끝나지 않는다 (QA 감사 Q-2).
 *
 * Firestore 쓰기 프라미스는 서버 ack 까지 pending 이다 — 오프라인 영속이 켜져 있으면
 * 로컬엔 즉시 반영되지만 프라미스는 끝나지 않는다. 즉 비행기모드의 `await deleteDoc(...)`
 * 은 throw 가 아니라 **영원한 대기**라, 화면의 try/catch 가 잡을 수 있는 실패가 아니었다.
 * 사용자가 '탈퇴'를 누르면 다이얼로그만 닫히고 성공도 실패도 아무 메시지가 없었다.
 *
 * 여기서 못 박는 계약 둘:
 *   1) 클라우드 파기가 제한 시간 안에 끝나지 않으면 **시간 초과로 거절**한다(무한 대기 금지).
 *   2) 그때 **계정은 지우지 않는다.** 서버에 닿지 못한 채 계정만 지우면 클라우드에 내
 *      데이터가 남은 채 지울 권한이 사라진다(파기 의무 위반, 되돌릴 방법 없음).
 *
 * @format
 */

import {getDocs, deleteDoc} from '@react-native-firebase/firestore';
import {deleteUser} from '@react-native-firebase/auth';
import {createFirebaseCloudPort, CLOUD_PURGE_TIMEOUT_MS} from '../../lib/firebaseCloudPort';
import {isTimeoutError} from '../../lib/withTimeout';

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({currentUser: {uid: 'u1', email: null, displayName: null}}),
  deleteUser: jest.fn(() => Promise.resolve()),
  signInAnonymously: jest.fn(),
  signInWithCredential: jest.fn(),
  signInWithCustomToken: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (..._a: unknown[]) => ({}),
  collection: (..._a: unknown[]) => ({}),
  getDoc: jest.fn(() => Promise.resolve({exists: () => false, data: () => null})),
  getDocs: jest.fn(() => Promise.resolve({docs: []})),
  setDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  runTransaction: jest.fn(),
  serverTimestamp: () => ({}),
  writeBatch: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (getDocs as jest.Mock).mockResolvedValue({docs: []});
});

test('오프라인(끝나지 않는 쓰기)에서 탈퇴는 시간 초과로 끝나고, 계정은 지우지 않는다', async () => {
  jest.useFakeTimers();
  try {
    // 오프라인 Firestore: 로컬엔 반영되지만 프라미스는 영원히 pending.
    (deleteDoc as jest.Mock).mockReturnValue(new Promise(() => {}));

    const port = createFirebaseCloudPort();
    const caught = port.deleteAccount().then(
      () => null,
      e => e,
    );

    // 제한 시간 전에는 아직 아무 결론도 없다(그 대기 자체는 정상).
    jest.advanceTimersByTime(CLOUD_PURGE_TIMEOUT_MS - 1);
    await Promise.resolve();
    expect(deleteUser).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2);
    const err = await caught;

    // 1) 무한 대기가 아니라 '시간 초과'로 끝난다 → 화면이 안내할 수 있다.
    expect(err).toBeTruthy();
    expect(isTimeoutError(err)).toBe(true);
    // 2) 계정은 살아 있다 — 클라우드 데이터를 못 지운 채 계정만 지우면 영영 못 지운다.
    expect(deleteUser).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test('서버가 응답한 실패(문서 부재 등)는 예전처럼 계정 삭제를 막지 않는다', async () => {
  (deleteDoc as jest.Mock).mockRejectedValue(new Error('not-found'));

  const port = createFirebaseCloudPort();
  await expect(port.deleteAccount()).resolves.toBeUndefined();
  expect(deleteUser).toHaveBeenCalled();
});

test('정상 연결이면 클라우드 파기 후 계정을 지운다', async () => {
  (deleteDoc as jest.Mock).mockResolvedValue(undefined);
  (getDocs as jest.Mock).mockResolvedValue({docs: [{id: 'r1'}, {id: 'r2'}]});

  const port = createFirebaseCloudPort();
  await port.deleteAccount();

  // 런 상세 2건 + 백업 본문 + 공개 프로필 + 랭킹 24개월 = 전부 지운 뒤 계정 삭제.
  expect((deleteDoc as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(4);
  expect(deleteUser).toHaveBeenCalled();
});
