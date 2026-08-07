// ============================================================================
// lib/photoCloud.ts — 메달·기록증 사진의 클라우드 보관 (Firebase Storage REST)
//
// 왜 이게 필요한가 (2026-08-07 민우님 확정)
// ------------------------------------------------------------------
// 1단계(lib/photo.ts)는 사진을 캐시에서 **Documents** 로 옮겨, OS 가 저장공간 확보로
// 캐시를 비울 때 사진이 사라지던 사고를 막았다. 하지만 그걸로 못 막는 게 남는다:
//
//   · 앱 삭제 → 재설치          → 사라진다
//   · 폰 교체(안드로이드)        → 사라진다 (`android:allowBackup="false"`)
//   · 폰 분실·고장·초기화        → 사라진다
//
// 그리고 진짜 문제는 "사라진다"가 아니라 **반쪽만 돌아온다**는 것이다. 메달 레코드
// (대회명·기록·배번호)는 Firestore 에서 전부 복원되는데 사진만 없다. 대회 메달은
// 그날 그 자리에서만 찍을 수 있어 **다시 만들 수 없는 데이터**다.
//
// 왜 REST 인가 (새 네이티브 의존성 0)
// ------------------------------------------------------------------
// 정석은 `@react-native-firebase/storage` 지만 그건 새 네이티브 모듈이고, 이 저장소는
// 네이티브 의존성을 **사전 승인제**로 묶어 뒀다(CLAUDE.md). Firebase Storage 는 공식
// REST 엔드포인트(`firebasestorage.googleapis.com/v0`)를 제공하고, 업로드/다운로드는
// 이미 있는 `expo-file-system` 의 `uploadAsync`/`downloadAsync` 로 그대로 된다.
// 인증은 Firebase ID 토큰을 `Authorization: Firebase <token>` 헤더로 보내는 것이
// 공식 규약이다(firebase-js-sdk 가 보내는 헤더와 동일). 즉 **정석을 우회한 게 아니라
// 같은 API 를 다른 클라이언트로 부르는 것**이고, 나중에 네이티브 SDK 를 붙이더라도
// 저장 경로·규칙이 그대로라 데이터 이관이 필요 없다.
//
// 파일 자체는 절대 앱 밖으로 새지 않는다 — 규칙(storage.rules)이 `users/{uid}/` 아래를
// 본인에게만 열어 준다. 공개 다운로드 토큰은 발급받지 않고 쓰지도 않는다.
// ============================================================================

import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import * as FileSystem from 'expo-file-system/legacy';

const HOST = 'https://firebasestorage.googleapis.com/v0/b';

/**
 * 한 장의 상한(바이트). 넘으면 **올리지 않는다** — 실패시키는 게 아니라 조용히 건너뛴다
 * (사진은 여전히 기기에 있고, 이건 백업이지 저장의 정본이 아니다).
 * 1600px JPEG 은 보통 200~400KB 라 8MB 는 사실상 "무언가 잘못됐다" 신호다.
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** 네트워크가 죽어 있을 때 영원히 매달리지 않게. 업로드/다운로드 각각. */
const TRANSFER_TIMEOUT_MS = 60_000;

export type PhotoKind = 'medal' | 'cert';

/**
 * 저장 경로. **uid 를 첫 세그먼트로 두는 것이 규칙의 전제다** — storage.rules 가
 * `users/{uid}/**` 를 그 uid 본인에게만 여는데, 경로가 바뀌면 규칙이 조용히 어긋난다.
 * 회귀 가드: `__tests__/lib/photoCloud.test.ts`
 */
export function medalPhotoPath(uid: string, medalId: string, kind: PhotoKind): string {
  return `users/${uid}/medals/${medalId}-${kind}.jpg`;
}

/** 이 경로가 이 uid 의 것인가(다른 계정 사진을 내려받지 않도록 하는 방어선). */
export function pathBelongsTo(path: string, uid: string): boolean {
  return !!path && !!uid && path.startsWith(`users/${uid}/`);
}

/** 버킷 이름은 앱 설정에서 읽는다 — 하드코딩하면 프로젝트를 옮길 때 조용히 틀린다. */
function bucket(): string | null {
  try {
    const b = getApp().options?.storageBucket;
    return typeof b === 'string' && b ? b : null;
  } catch {
    return null;
  }
}

async function authToken(): Promise<string | null> {
  try {
    const u = getAuth().currentUser;
    if (!u) return null;
    return (await u.getIdToken()) || null;
  } catch {
    return null;
  }
}

/** REST 는 경로를 **통째로 인코딩**한다(슬래시 포함 — `%2F`). */
function objectUrl(b: string, path: string, suffix = ''): string {
  return `${HOST}/${encodeURIComponent(b)}/o/${encodeURIComponent(path)}${suffix}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('photo-transfer-timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * 로컬 사진 한 장을 클라우드에 올린다.
 *
 * @returns 성공하면 true. **실패는 전부 false 로 삼킨다** — 백업 실패로 메달 등록이
 *          막히거나 에러가 뜨면 안 된다(사진은 기기에 그대로 있다). 다음 동기에서 다시 시도된다.
 */
export async function uploadPhoto(path: string, localUri: string): Promise<boolean> {
  const b = bucket();
  if (!b || !path || !localUri) return false;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info?.exists) return false;
    const size = (info as {size?: number}).size;
    if (typeof size === 'number' && size > MAX_UPLOAD_BYTES) return false;

    const token = await authToken();
    if (!token) return false;

    const url = `${HOST}/${encodeURIComponent(b)}/o?uploadType=media&name=${encodeURIComponent(path)}`;
    const res = await withTimeout(
      FileSystem.uploadAsync(url, localUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Firebase ${token}`,
          'Content-Type': 'image/jpeg',
        },
      }),
      TRANSFER_TIMEOUT_MS,
    );
    return !!res && res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

/**
 * 클라우드 사진을 로컬 경로로 내려받는다.
 *
 * @returns 성공하면 저장된 로컬 URI, 실패하면 null. 실패는 삼킨다(다음에 다시 시도).
 */
export async function downloadPhoto(path: string, destUri: string): Promise<string | null> {
  const b = bucket();
  if (!b || !path || !destUri) return null;
  try {
    const token = await authToken();
    if (!token) return null;
    const res = await withTimeout(
      FileSystem.downloadAsync(objectUrl(b, path, '?alt=media'), destUri, {
        headers: {Authorization: `Firebase ${token}`},
      }),
      TRANSFER_TIMEOUT_MS,
    );
    if (!res || res.status < 200 || res.status >= 300) {
      // 실패 응답도 파일로 떨어진다(에러 JSON). 그대로 두면 **깨진 이미지**가 되므로 치운다.
      await FileSystem.deleteAsync(destUri, {idempotent: true}).catch(() => {});
      return null;
    }
    return res.uri || destUri;
  } catch {
    return null;
  }
}

/**
 * 클라우드 사진 한 장을 지운다. 메달을 삭제할 때 호출한다 —
 * 안 지우면 사용자가 지운 사진이 서버에 영원히 남는다(개인정보 처리방침 위반).
 */
export async function deleteCloudPhoto(path: string): Promise<boolean> {
  const b = bucket();
  if (!b || !path) return false;
  try {
    const token = await authToken();
    if (!token) return false;
    const res = await fetch(objectUrl(b, path), {
      method: 'DELETE',
      headers: {Authorization: `Firebase ${token}`},
    });
    // 404 = 이미 없다 = 목표 달성. 성공으로 친다.
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * 이 계정의 사진을 **전부** 지운다(탈퇴 경로).
 *
 * Storage 에는 "폴더 삭제"가 없다 — 목록을 받아 하나씩 지우는 게 유일한 방법이다.
 * 페이지네이션을 끝까지 돌지 않으면 사진이 남는데, 탈퇴에서 그건 곧 **파기 실패**다.
 *
 * @returns 지우지 못한 파일이 하나라도 있으면 false. 호출부가 재시도/보고를 결정한다.
 */
export async function deleteAllPhotos(uid: string): Promise<boolean> {
  const b = bucket();
  if (!b || !uid) return false;
  const prefix = `users/${uid}/`;
  try {
    const token = await authToken();
    if (!token) return false;
    let pageToken: string | undefined;
    let allOk = true;
    // 안전장치: 무한 루프 방지(비정상 응답으로 pageToken 이 반복될 수 있다).
    for (let page = 0; page < 50; page++) {
      const url =
        `${HOST}/${encodeURIComponent(b)}/o?prefix=${encodeURIComponent(prefix)}&maxResults=1000` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
      const res = await fetch(url, {headers: {Authorization: `Firebase ${token}`}});
      if (!res.ok) return false;
      const body = (await res.json()) as {items?: {name?: string}[]; nextPageToken?: string};
      const names = (body.items || []).map((i) => i?.name).filter((n): n is string => !!n);
      for (const name of names) {
        if (!(await deleteCloudPhoto(name))) allOk = false;
      }
      pageToken = body.nextPageToken;
      if (!pageToken) return allOk;
    }
    return false;
  } catch {
    return false;
  }
}
