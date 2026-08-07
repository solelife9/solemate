// lib/photo — 사진 영속화(1단계).
//
// 왜 있는가: expo-image-picker/manipulator 가 돌려주는 URI 는 **캐시** 디렉터리를 가리킨다.
// OS 는 저장공간이 빠듯하면 캐시를 예고 없이 비운다 — 앱을 지우지도 않았는데 사진이
// 사라졌다. 그래서 모든 진입점이 persistPhoto 를 거쳐 Documents 로 옮긴다.
//
// **이 파일의 핵심은 마지막 스윕이다**: 새 사진 진입점이 생겼는데 persistPhoto 를 안 거치면
// 그 경로만 조용히 예전 버그로 돌아간다. 목록을 손으로 관리하지 않고 파일을 훑는다.
import {readFileSync} from 'fs';
import {join} from 'path';
import * as FileSystem from 'expo-file-system/legacy';
import {persistPhoto, deletePersistedPhoto, cloudPhotoDest, photoExists, ensurePhotoDir} from '../../lib/photo';

const fs = FileSystem as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  fs.makeDirectoryAsync.mockResolvedValue(undefined);
  fs.copyAsync.mockResolvedValue(undefined);
  fs.deleteAsync.mockResolvedValue(undefined);
  fs.getInfoAsync.mockResolvedValue({exists: true});
});

describe('persistPhoto', () => {
  it('캐시 URI 를 Documents 아래로 복사한다', async () => {
    const out = await persistPhoto('file:///cache/ImagePicker/abc.jpg');
    expect(out.startsWith('file:///documents/keego-photos/')).toBe(true);
    expect(fs.copyAsync).toHaveBeenCalledWith({from: 'file:///cache/ImagePicker/abc.jpg', to: out});
  });

  it('이미 영구 폴더에 있으면 다시 복사하지 않는다', async () => {
    const already = 'file:///documents/keego-photos/x.jpg';
    expect(await persistPhoto(already)).toBe(already);
    expect(fs.copyAsync).not.toHaveBeenCalled();
  });

  it('복사가 실패하면 원본 URI 를 돌려준다 — 등록을 막지 않는다', async () => {
    fs.copyAsync.mockRejectedValue(new Error('disk full'));
    expect(await persistPhoto('file:///cache/a.jpg')).toBe('file:///cache/a.jpg');
  });

  it('빈 입력은 그대로', async () => {
    expect(await persistPhoto('')).toBe('');
  });
});

describe('deletePersistedPhoto', () => {
  it('우리 폴더 안의 파일만 지운다', async () => {
    await deletePersistedPhoto('file:///documents/keego-photos/x.jpg');
    expect(fs.deleteAsync).toHaveBeenCalledWith('file:///documents/keego-photos/x.jpg', {idempotent: true});
  });

  it('사용자의 사진앱 원본은 절대 건드리지 않는다', async () => {
    await deletePersistedPhoto('ph://ASSET-ID');
    await deletePersistedPhoto('file:///var/mobile/Media/DCIM/IMG_0001.JPG');
    expect(fs.deleteAsync).not.toHaveBeenCalled();
  });

  it('null/undefined 를 삼킨다', async () => {
    await expect(deletePersistedPhoto(null)).resolves.toBeUndefined();
    await expect(deletePersistedPhoto(undefined)).resolves.toBeUndefined();
  });
});

describe('cloudPhotoDest / photoExists / ensurePhotoDir', () => {
  it('같은 키는 항상 같은 파일 — 재설치를 반복해도 사본이 쌓이지 않는다', () => {
    expect(cloudPhotoDest('m1-medal')).toBe('file:///documents/keego-photos/cloud-m1-medal.jpg');
    expect(cloudPhotoDest('m1-medal')).toBe(cloudPhotoDest('m1-medal'));
  });

  it('경로에 쓸 수 없는 문자를 걸러낸다(메달 id 가 임의 문자열이어도 안전)', () => {
    expect(cloudPhotoDest('a/../b medal')).toBe('file:///documents/keego-photos/cloud-a_.._b_medal.jpg');
  });

  it('photoExists 는 없는 파일에 false', async () => {
    fs.getInfoAsync.mockResolvedValue({exists: false});
    expect(await photoExists('file:///documents/keego-photos/gone.jpg')).toBe(false);
  });

  it('photoExists 는 원격 URL 을 파일 시스템에 묻지 않는다', async () => {
    expect(await photoExists('https://example.com/a.jpg')).toBe(true);
    expect(fs.getInfoAsync).not.toHaveBeenCalled();
  });

  it('ensurePhotoDir 실패는 false(던지지 않는다)', async () => {
    fs.makeDirectoryAsync.mockRejectedValue(new Error('nope'));
    expect(await ensurePhotoDir()).toBe(false);
  });
});

// ── 스윕: 새 진입점이 영속화를 건너뛰지 못하게 ────────────────────────────────
describe('lib/photo 의 모든 사진 반환 경로가 persistPhoto 를 거친다', () => {
  it('launchCameraAsync/launchImageLibraryAsync 결과를 날것으로 돌려주는 곳이 없다', () => {
    const src = readFileSync(join(__dirname, '../../lib/photo.ts'), 'utf8');
    // `a.uri` / `asset.uri` 를 반환문에서 쓰면서 persistPhoto 로 감싸지 않은 줄을 찾는다.
    const offenders = src
      .split('\n')
      .map((line, i) => ({line: line.trim(), n: i + 1}))
      .filter(({line}) => /return\s.*\b(a|asset|res)\.uri\b/.test(line) && !line.includes('persistPhoto'))
      .filter(({line}) => !line.startsWith('//') && !line.startsWith('*'));
    expect(offenders.map((o) => `${o.n}: ${o.line}`)).toEqual([]);
  });

  it('내보내는 사진 함수가 늘어나면 여기서 알아차린다', () => {
    const src = readFileSync(join(__dirname, '../../lib/photo.ts'), 'utf8');
    const exported = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]).sort();
    // 새 함수를 추가했다면 persistPhoto 경유 여부를 확인하고 이 목록을 갱신한다.
    expect(exported).toEqual([
      'capturePhotoWithPermission',
      'captureCertPhoto',
      'deletePersistedPhoto',
      'ensurePhotoDir',
      'persistPhoto',
      'photoExists',
      'pickPhotoFrom',
      'pickPhotoWithPermission',
      'pickShoePhoto',
    ].sort());
  });
});
