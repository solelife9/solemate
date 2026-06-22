// ============================================================================
// lib/firebaseCloudPort.ts — CloudPort 의 @react-native-firebase 구현 (Slice 5)
//
// @react-native-firebase/auth(modular) 로 로그인/로그아웃, /firestore(modular) 로
// 계정 문서(userBackups/{uid})에 백업 페이로드를 읽고/쓴다. 순수 로직(cloudSync)·
// 포트 타입(cloudPort)에는 firebase 가 새어들어가지 않으며, 이 모듈만 네이티브에
// 의존한다. jest 는 jest.setup.js 에서 두 firebase 모듈을 메모리 가짜로 목 처리해
// 실 네이티브 호출 없이 라운드트립을 검증한다.
// ============================================================================

import {
  getAuth,
  signInAnonymously,
  signInWithCredential,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  deleteUser,
} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from '@react-native-firebase/firestore';

import type { BackupPayload } from './backup';
import type { CloudPort, CloudProvider, CloudUser } from './cloudPort';

/** 사용자별 백업 문서가 사는 컬렉션. 문서 id 는 auth uid. */
const BACKUPS_COLLECTION = 'userBackups';

/** google 자격증명의 정확한 타입을 signInWithCredential 시그니처에서 파생(직접 의존 회피). */
type FirebaseAuthCredential = Parameters<typeof signInWithCredential>[1];

export interface FirebaseCloudPortOptions {
  /**
   * google 로그인은 RNFB 밖에서(예: @react-native-google-signin) 받은 OAuth
   * 자격증명이 필요하다. 앱이 이 리졸버를 주입하며, 없으면 'google' 은 비활성.
   * 자격증명 획득 책임을 앱 계층에 두어 포트를 백엔드-순수하게 유지한다.
   */
  resolveGoogleCredential?: () => Promise<FirebaseAuthCredential>;
  /**
   * apple 로그인도 동일하게 RNFB 밖(예: @invertase/react-native-apple-authentication)
   * 에서 받은 OAuth 자격증명이 필요하다. 없으면 'apple' 은 비활성(명확한 에러).
   */
  resolveAppleCredential?: () => Promise<FirebaseAuthCredential>;
  /**
   * kakao 로그인: Firebase 기본 제공이 아니므로 OAuth credential 이 아니라 'Firebase
   * 커스텀 토큰'으로 들어간다. 앱이 (네이티브 카카오 로그인 → 백엔드 토큰 검증 → 커스텀
   * 토큰 발급)을 수행하는 리졸버를 주입한다. 없으면 'kakao' 는 비활성.
   */
  resolveKakaoToken?: () => Promise<string>;
  /** naver 로그인: kakao 와 동일한 커스텀 토큰 방식. 없으면 'naver' 는 비활성. */
  resolveNaverToken?: () => Promise<string>;
}

/**
 * firebase User 에서 포트가 노출하는 최소 사용자 정보만 추려낸다. email/displayName 은
 * 화면 표시용 부가 정보로, 익명 로그인 등에선 없을 수 있어 옵셔널로 좁혀 담는다.
 */
function toCloudUser(user: { uid: string; email?: string | null; displayName?: string | null }): CloudUser {
  return { uid: user.uid, email: user.email ?? null, displayName: user.displayName ?? null };
}

/**
 * firestore 가 돌려준 임의 문서를 BackupPayload 형태로 방어적으로 정규화한다.
 * (lib/backup 의 직렬화 규약과 동일: shoes/runs 는 배열, settings 는 객체로 강제)
 * 원격 데이터가 어긋나도 형태를 깨지 않아 병합(cloudSync)이 안전하게 동작한다.
 */
function normalizePayload(data: Record<string, unknown>): BackupPayload {
  const base: BackupPayload = {
    shoes: Array.isArray(data.shoes) ? data.shoes : [],
    runs: Array.isArray(data.runs) ? data.runs : [],
    settings:
      data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? (data.settings as Record<string, unknown>)
        : {},
  };
  // 진척(은퇴 신발·랭크 등)은 객체일 때만 보존한다(없던 옛 백업은 누락 → 그대로 둠).
  if (data.progression && typeof data.progression === 'object' && !Array.isArray(data.progression)) {
    base.progression = data.progression as BackupPayload['progression'];
  }
  return base;
}

/** BackupPayload 를 firestore 문서로 직렬화. progression 은 있을 때만 포함(하위호환). */
function payloadToDoc(data: BackupPayload): Record<string, unknown> {
  const doc: Record<string, unknown> = { shoes: data.shoes, runs: data.runs, settings: data.settings };
  if (data.progression) doc.progression = data.progression;
  return doc;
}

/**
 * 로그인된 사용자의 Firebase ID 토큰(없으면 null). 백엔드 /api/v1 보호 라우트의
 * Authorization Bearer 토큰으로 쓴다(progression 랭킹 provider). 미로그인/실패 → null
 * (호출부가 빈 결과로 안전 처리하도록 throw 하지 않는다).
 */
export async function getFirebaseIdToken(): Promise<string | null> {
  try {
    const user = getAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * 현재 로그인된 Firebase uid(미로그인/실패 → null). Firestore 랭킹 provider 가
 * '내 엔트리'를 찾고 publish 하는 데 쓴다(getFirebaseIdToken 과 같은 seam 계약 — throw 금지).
 */
export async function getFirebaseUid(): Promise<string | null> {
  try {
    return getAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

/**
 * CloudPort 의 firebase 구현을 만든다. 옵션으로 google 자격증명 리졸버를 주입한다.
 */
export function createFirebaseCloudPort(
  options: FirebaseCloudPortOptions = {},
): CloudPort {
  // pull/push 는 로그인된 uid 를 요구한다. 없으면 throw 해 호출부가 익명 데이터를
  // 엉뚱한 문서에 쓰는 사고를 막는다(데이터 보호).
  const requireUid = (): string => {
    const user = getAuth().currentUser;
    if (!user) {
      throw new Error('클라우드 동기화에는 로그인이 필요합니다.');
    }
    return user.uid;
  };

  const backupRef = (uid: string) => doc(getFirestore(), BACKUPS_COLLECTION, uid);

  return {
    async signIn(provider: CloudProvider): Promise<CloudUser> {
      if (provider === 'anonymous') {
        const credential = await signInAnonymously(getAuth());
        return toCloudUser(credential.user);
      }
      // kakao·naver 는 Firebase 기본 제공이 아니라 백엔드가 발급한 커스텀 토큰으로 로그인.
      if (provider === 'kakao' || provider === 'naver') {
        const tokenResolver =
          provider === 'kakao' ? options.resolveKakaoToken : options.resolveNaverToken;
        if (!tokenResolver) {
          throw new Error(`'${provider}' 로그인에는 커스텀 토큰 리졸버 주입이 필요합니다.`);
        }
        const customToken = await tokenResolver();
        const credential = await signInWithCustomToken(getAuth(), customToken);
        return toCloudUser(credential.user);
      }
      // google·apple 은 외부 자격증명 리졸버를 통해 OAuth credential 을 받아 로그인한다.
      const resolver =
        provider === 'google' ? options.resolveGoogleCredential : options.resolveAppleCredential;
      if (!resolver) {
        throw new Error(`'${provider}' 로그인에는 자격증명 리졸버 주입이 필요합니다.`);
      }
      const oauthCredential = await resolver();
      const credential = await signInWithCredential(getAuth(), oauthCredential);
      return toCloudUser(credential.user);
    },

    async signOut(): Promise<void> {
      await firebaseSignOut(getAuth());
    },

    async deleteAccount(): Promise<void> {
      const user = getAuth().currentUser;
      if (!user) {
        throw new Error('삭제할 로그인 계정이 없습니다.');
      }
      // 1) 클라우드 백업 문서를 먼저 지운다(계정 삭제 후엔 권한이 사라져 못 지움).
      //    백업이 없을 수도 있으므로 실패는 삼키고 계정 삭제로 진행한다.
      try {
        await deleteDoc(backupRef(user.uid));
      } catch {
        // 백업 문서 부재/일시 오류 — 계정 삭제를 막지 않는다.
      }
      // 2) 인증 계정 자체를 삭제. 세션이 오래되면 'requires-recent-login' 으로 막히므로
      //    재로그인 후 재시도하도록 정직한 한국어 에러로 바꿔 전파한다.
      try {
        await deleteUser(user);
      } catch (e: any) {
        if (e?.code === 'auth/requires-recent-login') {
          throw new Error('보안을 위해 다시 로그인한 뒤 탈퇴를 진행해주세요.');
        }
        throw e;
      }
    },

    async pull(): Promise<BackupPayload | null> {
      const uid = requireUid();
      const snapshot = await getDoc(backupRef(uid));
      if (!snapshot.exists()) {
        return null;
      }
      const data = snapshot.data();
      if (!data) {
        return null;
      }
      return normalizePayload(data as Record<string, unknown>);
    },

    async push(data: BackupPayload): Promise<void> {
      const uid = requireUid();
      await setDoc(backupRef(uid), payloadToDoc(data));
    },
  };
}
