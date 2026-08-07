// lib/medalPhotoSync — 무엇을 올리고 무엇을 받는가.
//
// 이 파일이 지키는 불변식:
//  1) **묘비는 건드리지 않는다.** 지운 메달의 사진을 올리는 것은 사용자 의사에 반한다.
//  2) **남의 계정 경로는 만지지 않는다.** 기기를 물려받거나 계정을 갈아탄 상황에서
//     로컬에 남은 레코드가 이전 사용자의 사진을 끌어오면 그게 계정 간 누출이다.
//  3) **올리기는 dirty, 내려받기는 dirty 아님.** 로컬 URI 는 이 기기의 사정이라
//     동기로 내보내면 기기끼리 서로 덮어쓰며 핑퐁이 된다.
//  4) 실패해도 던지지 않고, 상태를 바꾸지 않아 **다음에 자동으로 재시도**된다.
import * as FileSystem from 'expo-file-system/legacy';
import * as authMock from '@react-native-firebase/auth';
import {planPhotoJobs, syncMedalPhotos} from '../../lib/medalPhotoSync';
import type {Medal} from '../../lib/medals';

const fs = FileSystem as unknown as Record<string, jest.Mock>;
// 목 전용 헬퍼는 실제 SDK 타입에 없다 — firebaseCloudPort.test 와 같은 캐스팅 규약.
const auth = authMock as unknown as {__setCurrentUser: (u: unknown) => void; __reset: () => void};
const NOW = 1_700_000_000_000;

const medal = (over: Partial<Medal> = {}): Medal => ({
  id: 'm1',
  raceName: '서울마라톤',
  date: '2026-03-15',
  distance: 'full',
  createdAt: '2026-03-15T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  auth.__reset();
  auth.__setCurrentUser({uid: 'u1'});
  fs.getInfoAsync.mockResolvedValue({exists: true, size: 200 * 1024});
  fs.uploadAsync.mockResolvedValue({status: 200});
  fs.downloadAsync.mockImplementation((_u: string, dest: string) => Promise.resolve({status: 200, uri: dest}));
  fs.makeDirectoryAsync.mockResolvedValue(undefined);
});

describe('planPhotoJobs — 계획(순수)', () => {
  it('로컬 사진이 있고 클라우드 경로가 없으면 올린다', () => {
    const {uploads, downloads} = planPhotoJobs([medal({medalPhotoUri: 'file:///a.jpg'})], 'u1');
    expect(downloads).toHaveLength(0);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].cloudPath).toBe('users/u1/medals/m1-medal.jpg');
  });

  it('메달 사진과 기록증 사진을 각각 다룬다', () => {
    const {uploads} = planPhotoJobs(
      [medal({medalPhotoUri: 'file:///a.jpg', certPhotoUri: 'file:///b.jpg'})],
      'u1',
    );
    expect(uploads.map((u) => u.kind).sort()).toEqual(['cert', 'medal']);
  });

  it('클라우드 경로가 있으면 내려받기 후보다(이미 올렸으니 다시 올리지 않는다)', () => {
    const {uploads, downloads} = planPhotoJobs(
      [medal({medalPhotoUri: 'file:///a.jpg', medalPhotoPath: 'users/u1/medals/m1-medal.jpg'})],
      'u1',
    );
    expect(uploads).toHaveLength(0);
    expect(downloads).toHaveLength(1);
  });

  it('지운 메달(묘비)은 올리지도 받지도 않는다', () => {
    const {uploads, downloads} = planPhotoJobs(
      [medal({deleted: true, medalPhotoUri: 'file:///a.jpg', certPhotoPath: 'users/u1/medals/m1-cert.jpg'})],
      'u1',
    );
    expect(uploads).toHaveLength(0);
    expect(downloads).toHaveLength(0);
  });

  it('남의 계정 경로는 내려받지 않는다 — 계정 간 데이터 누출 차단', () => {
    const {downloads} = planPhotoJobs(
      [medal({medalPhotoPath: 'users/u2/medals/m1-medal.jpg'})],
      'u1',
    );
    expect(downloads).toHaveLength(0);
  });

  it('로그인 전에는 아무 계획도 세우지 않는다', () => {
    const {uploads, downloads} = planPhotoJobs([medal({medalPhotoUri: 'file:///a.jpg'})], '');
    expect(uploads).toHaveLength(0);
    expect(downloads).toHaveLength(0);
  });

  it('사진이 아예 없는 메달은 아무 일도 만들지 않는다', () => {
    const {uploads, downloads} = planPhotoJobs([medal()], 'u1');
    expect(uploads).toHaveLength(0);
    expect(downloads).toHaveLength(0);
  });
});

describe('syncMedalPhotos — 올리기', () => {
  it('성공하면 경로를 레코드에 박고 dirty 로 표시한다(다른 기기로 전파되게)', async () => {
    const res = await syncMedalPhotos([medal({medalPhotoUri: 'file:///a.jpg'})], 'u1', NOW);
    expect(res.uploaded).toBe(1);
    expect(res.dirty).toBe(true);
    expect(res.medals[0].medalPhotoPath).toBe('users/u1/medals/m1-medal.jpg');
    expect(res.medals[0].updatedAt).toBe(NOW);
  });

  it('실패하면 경로를 박지 않는다 — 다음 호출에 다시 시도된다', async () => {
    fs.uploadAsync.mockResolvedValue({status: 500});
    const res = await syncMedalPhotos([medal({medalPhotoUri: 'file:///a.jpg'})], 'u1', NOW);
    expect(res.uploaded).toBe(0);
    expect(res.dirty).toBe(false);
    expect(res.medals[0].medalPhotoPath).toBeUndefined();
  });

  it('로컬 파일이 이미 사라졌으면 올리려 시도하지 않는다', async () => {
    fs.getInfoAsync.mockResolvedValue({exists: false});
    const res = await syncMedalPhotos([medal({medalPhotoUri: 'file:///gone.jpg'})], 'u1', NOW);
    expect(fs.uploadAsync).not.toHaveBeenCalled();
    expect(res.uploaded).toBe(0);
  });

  it('입력 배열을 변형하지 않는다', async () => {
    const input = [medal({medalPhotoUri: 'file:///a.jpg'})];
    await syncMedalPhotos(input, 'u1', NOW);
    expect(input[0].medalPhotoPath).toBeUndefined();
  });
});

describe('syncMedalPhotos — 내려받기(재설치·기기교체)', () => {
  const restored = medal({
    // 재설치 직후의 실제 모습: 레코드는 클라우드에서 왔고, URI 는 **없는 파일**을 가리킨다.
    medalPhotoUri: 'file:///old-device/a.jpg',
    medalPhotoPath: 'users/u1/medals/m1-medal.jpg',
  });

  it('로컬 파일이 없으면 받아서 URI 를 다시 채운다', async () => {
    fs.getInfoAsync.mockResolvedValue({exists: false});
    const res = await syncMedalPhotos([restored], 'u1', NOW);
    expect(res.downloaded).toBe(1);
    expect(res.medals[0].medalPhotoUri).toBe('file:///documents/keego-photos/cloud-m1-medal.jpg');
  });

  it('내려받기는 dirty 가 아니다 — 로컬 경로는 동기할 사실이 아니다', async () => {
    fs.getInfoAsync.mockResolvedValue({exists: false});
    const res = await syncMedalPhotos([restored], 'u1', NOW);
    expect(res.dirty).toBe(false);
    expect(res.medals[0].updatedAt).toBeUndefined();
  });

  it('파일이 살아 있으면 받지 않는다(매 실행마다 다시 받지 않는다)', async () => {
    fs.getInfoAsync.mockResolvedValue({exists: true});
    const res = await syncMedalPhotos([restored], 'u1', NOW);
    expect(fs.downloadAsync).not.toHaveBeenCalled();
    expect(res.downloaded).toBe(0);
  });

  it('할 일이 없으면 입력 배열을 그대로 돌려준다(불필요한 재렌더 방지)', async () => {
    const input = [medal()];
    const res = await syncMedalPhotos(input, 'u1', NOW);
    expect(res.medals).toBe(input);
  });

  it('받기가 실패하면 URI 를 바꾸지 않는다 — 없는 파일보다 나은 것은 없지만 거짓을 만들지도 않는다', async () => {
    fs.getInfoAsync.mockResolvedValue({exists: false});
    fs.downloadAsync.mockResolvedValue({status: 404, uri: 'x'});
    const res = await syncMedalPhotos([restored], 'u1', NOW);
    expect(res.downloaded).toBe(0);
    expect(res.medals[0].medalPhotoUri).toBe('file:///old-device/a.jpg');
  });
});

describe('여러 메달이 섞여 있어도', () => {
  it('올릴 것은 올리고 받을 것은 받는다', async () => {
    fs.getInfoAsync.mockImplementation((uri: string) =>
      Promise.resolve({exists: uri === 'file:///live.jpg', size: 1024}),
    );
    const res = await syncMedalPhotos(
      [
        medal({id: 'a', medalPhotoUri: 'file:///live.jpg'}),
        medal({id: 'b', medalPhotoUri: 'file:///dead.jpg', medalPhotoPath: 'users/u1/medals/b-medal.jpg'}),
        medal({id: 'c', deleted: true, medalPhotoUri: 'file:///live.jpg'}),
      ],
      'u1',
      NOW,
    );
    expect(res.uploaded).toBe(1);
    expect(res.downloaded).toBe(1);
    expect(res.medals.find((m) => m.id === 'a')?.medalPhotoPath).toBe('users/u1/medals/a-medal.jpg');
    expect(res.medals.find((m) => m.id === 'b')?.medalPhotoUri).toBe(
      'file:///documents/keego-photos/cloud-b-medal.jpg',
    );
    // 묘비는 손대지 않았다.
    expect(res.medals.find((m) => m.id === 'c')?.medalPhotoPath).toBeUndefined();
  });
});
