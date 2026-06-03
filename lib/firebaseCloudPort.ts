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
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
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
  return {
    shoes: Array.isArray(data.shoes) ? data.shoes : [],
    runs: Array.isArray(data.runs) ? data.runs : [],
    settings:
      data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? (data.settings as Record<string, unknown>)
        : {},
  };
}

/** BackupPayload 를 firestore 문서로 직렬화(여분 필드 없이 세 키만). */
function payloadToDoc(data: BackupPayload): Record<string, unknown> {
  return { shoes: data.shoes, runs: data.runs, settings: data.settings };
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
