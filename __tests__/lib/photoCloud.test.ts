// lib/photoCloud — 메달·기록증 사진의 Firebase Storage REST 전송.
//
// 여기서 지키는 것:
//  1) **경로 규약**. `users/{uid}/...` 라는 전제 위에 storage.rules 가 서 있다.
//     경로가 바뀌면 규칙이 조용히 어긋나 남의 사진이 열리거나 내 사진이 막힌다.
//  2) **실패가 절대 던지지 않는다.** 사진 백업이 메달 등록을 막으면 안 된다.
//  3) **인증 없이는 아무것도 보내지 않는다.**
//  4) **탈퇴 파기는 페이지를 끝까지 돈다.** 한 페이지만 지우면 사진이 남는데,
//     탈퇴에서 그건 곧 파기 실패다.
import * as FileSystem from 'expo-file-system/legacy';
import * as authMock from '@react-native-firebase/auth';
import {
  medalPhotoPath,
  pathBelongsTo,
  uploadPhoto,
  downloadPhoto,
  deleteCloudPhoto,
  deleteAllPhotos,
} from '../../lib/photoCloud';

const fs = FileSystem as unknown as Record<string, jest.Mock>;
// 목 전용 헬퍼는 실제 SDK 타입에 없다 — 다른 테스트(firebaseCloudPort.test)와 같은 캐스팅 규약.
const auth = authMock as unknown as {__setCurrentUser: (u: unknown) => void; __reset: () => void};
const setUser = auth.__setCurrentUser;

beforeEach(() => {
  jest.clearAllMocks();
  auth.__reset();
  setUser({uid: 'u1'});
  fs.getInfoAsync.mockResolvedValue({exists: true, size: 200 * 1024});
  fs.uploadAsync.mockResolvedValue({status: 200});
  fs.downloadAsync.mockImplementation((_u: string, dest: string) => Promise.resolve({status: 200, uri: dest}));
  (global as unknown as {fetch: jest.Mock}).fetch = jest.fn(() =>
    Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({items: []})}),
  );
});

describe('경로 규약 — storage.rules 의 전제', () => {
  it('첫 두 세그먼트가 users/{uid} 다', () => {
    expect(medalPhotoPath('u1', 'm1', 'medal')).toBe('users/u1/medals/m1-medal.jpg');
    expect(medalPhotoPath('u1', 'm1', 'cert')).toBe('users/u1/medals/m1-cert.jpg');
  });

  it('메달 사진과 기록증 사진은 서로 다른 객체다(덮어쓰지 않는다)', () => {
    expect(medalPhotoPath('u1', 'm1', 'medal')).not.toBe(medalPhotoPath('u1', 'm1', 'cert'));
  });

  it('같은 메달을 다시 올리면 같은 경로다 — 사본이 쌓이지 않는다', () => {
    expect(medalPhotoPath('u1', 'm1', 'medal')).toBe(medalPhotoPath('u1', 'm1', 'medal'));
  });

  it('pathBelongsTo 가 남의 경로를 거른다', () => {
    expect(pathBelongsTo('users/u1/medals/m1-medal.jpg', 'u1')).toBe(true);
    expect(pathBelongsTo('users/u2/medals/m1-medal.jpg', 'u1')).toBe(false);
    // 접두어만 겹치는 uid 에 속지 않는다(u1 vs u10).
    expect(pathBelongsTo('users/u10/medals/m1-medal.jpg', 'u1')).toBe(false);
    expect(pathBelongsTo('', 'u1')).toBe(false);
  });
});

describe('uploadPhoto', () => {
  it('ID 토큰을 Firebase 스킴으로 실어 보낸다', async () => {
    expect(await uploadPhoto('users/u1/medals/m1-medal.jpg', 'file:///documents/a.jpg')).toBe(true);
    const [url, uri, opts] = fs.uploadAsync.mock.calls[0];
    expect(url).toContain('test-bucket.firebasestorage.app');
    // 경로는 통째로 인코딩된다 — 슬래시를 살려 보내면 REST 가 404 를 준다.
    expect(url).toContain(encodeURIComponent('users/u1/medals/m1-medal.jpg'));
    expect(uri).toBe('file:///documents/a.jpg');
    expect(opts.headers.Authorization).toBe('Firebase id-token:u1');
    expect(opts.headers['Content-Type']).toBe('image/jpeg');
  });

  it('로그인 상태가 아니면 보내지 않는다', async () => {
    setUser(null);
    expect(await uploadPhoto('users/u1/medals/m1-medal.jpg', 'file:///documents/a.jpg')).toBe(false);
    expect(fs.uploadAsync).not.toHaveBeenCalled();
  });

  it('파일이 없으면 보내지 않는다', async () => {
    fs.getInfoAsync.mockResolvedValue({exists: false});
    expect(await uploadPhoto('users/u1/medals/m1-medal.jpg', 'file:///gone.jpg')).toBe(false);
    expect(fs.uploadAsync).not.toHaveBeenCalled();
  });

  it('상한을 넘는 파일은 조용히 건너뛴다(실패시키지 않는다)', async () => {
    fs.getInfoAsync.mockResolvedValue({exists: true, size: 20 * 1024 * 1024});
    expect(await uploadPhoto('users/u1/medals/m1-medal.jpg', 'file:///huge.jpg')).toBe(false);
    expect(fs.uploadAsync).not.toHaveBeenCalled();
  });

  it('서버가 거부해도 던지지 않는다', async () => {
    fs.uploadAsync.mockResolvedValue({status: 403});
    await expect(uploadPhoto('users/u1/medals/m1-medal.jpg', 'file:///documents/a.jpg')).resolves.toBe(false);
  });

  it('네트워크가 터져도 던지지 않는다', async () => {
    fs.uploadAsync.mockRejectedValue(new Error('offline'));
    await expect(uploadPhoto('users/u1/medals/m1-medal.jpg', 'file:///documents/a.jpg')).resolves.toBe(false);
  });
});

describe('downloadPhoto', () => {
  it('받은 로컬 URI 를 돌려준다', async () => {
    const got = await downloadPhoto('users/u1/medals/m1-medal.jpg', 'file:///documents/keego-photos/cloud-m1-medal.jpg');
    expect(got).toBe('file:///documents/keego-photos/cloud-m1-medal.jpg');
    expect(fs.downloadAsync.mock.calls[0][0]).toContain('alt=media');
    expect(fs.downloadAsync.mock.calls[0][2].headers.Authorization).toBe('Firebase id-token:u1');
  });

  it('실패 응답이면 떨어진 파일을 치운다 — 안 치우면 에러 JSON 이 깨진 이미지로 남는다', async () => {
    fs.downloadAsync.mockResolvedValue({status: 404, uri: 'file:///documents/x.jpg'});
    expect(await downloadPhoto('users/u1/medals/m1-medal.jpg', 'file:///documents/x.jpg')).toBeNull();
    expect(fs.deleteAsync).toHaveBeenCalledWith('file:///documents/x.jpg', {idempotent: true});
  });

  it('로그인 상태가 아니면 받지 않는다', async () => {
    setUser(null);
    expect(await downloadPhoto('users/u1/medals/m1-medal.jpg', 'file:///documents/x.jpg')).toBeNull();
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });
});

describe('deleteCloudPhoto', () => {
  it('DELETE 를 보낸다', async () => {
    expect(await deleteCloudPhoto('users/u1/medals/m1-medal.jpg')).toBe(true);
    const [, opts] = (global as unknown as {fetch: jest.Mock}).fetch.mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(opts.headers.Authorization).toBe('Firebase id-token:u1');
  });

  it('404 는 성공으로 친다 — 이미 없는 것이 목표 상태다', async () => {
    (global as unknown as {fetch: jest.Mock}).fetch.mockResolvedValue({ok: false, status: 404});
    expect(await deleteCloudPhoto('users/u1/medals/m1-medal.jpg')).toBe(true);
  });

  it('그 밖의 실패는 false — 호출부가 재시도를 판단할 수 있어야 한다', async () => {
    (global as unknown as {fetch: jest.Mock}).fetch.mockResolvedValue({ok: false, status: 500});
    expect(await deleteCloudPhoto('users/u1/medals/m1-medal.jpg')).toBe(false);
  });
});

describe('deleteAllPhotos — 탈퇴 파기', () => {
  it('페이지를 끝까지 돌아 전부 지운다', async () => {
    const f = (global as unknown as {fetch: jest.Mock}).fetch;
    f.mockImplementation((url: string, opts?: {method?: string}) => {
      if (opts?.method === 'DELETE') return Promise.resolve({ok: true, status: 204});
      if (url.includes('pageToken')) {
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({items: [{name: 'users/u1/medals/b.jpg'}]})});
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({items: [{name: 'users/u1/medals/a.jpg'}], nextPageToken: 'p2'}),
      });
    });
    expect(await deleteAllPhotos('u1')).toBe(true);
    const deleted = f.mock.calls.filter((c: unknown[]) => (c[1] as {method?: string})?.method === 'DELETE').map((c: unknown[]) => c[0]);
    expect(deleted).toHaveLength(2);
    expect(deleted[0]).toContain(encodeURIComponent('users/u1/medals/a.jpg'));
    expect(deleted[1]).toContain(encodeURIComponent('users/u1/medals/b.jpg'));
  });

  it('본인 접두어만 목록을 요청한다', async () => {
    await deleteAllPhotos('u1');
    expect((global as unknown as {fetch: jest.Mock}).fetch.mock.calls[0][0]).toContain(
      `prefix=${encodeURIComponent('users/u1/')}`,
    );
  });

  it('한 장이라도 못 지우면 false 를 돌려준다 — 조용한 파기 실패를 만들지 않는다', async () => {
    const f = (global as unknown as {fetch: jest.Mock}).fetch;
    f.mockImplementation((_url: string, opts?: {method?: string}) => {
      if (opts?.method === 'DELETE') return Promise.resolve({ok: false, status: 500});
      return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({items: [{name: 'users/u1/medals/a.jpg'}]})});
    });
    expect(await deleteAllPhotos('u1')).toBe(false);
  });

  it('목록 조회가 실패하면 false(지웠다고 보고하지 않는다)', async () => {
    (global as unknown as {fetch: jest.Mock}).fetch.mockResolvedValue({ok: false, status: 401});
    expect(await deleteAllPhotos('u1')).toBe(false);
  });
});
