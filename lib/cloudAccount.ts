// ─── 로그인 계정 표시 정보 영속(2026-07-05) ──────────────────────────────────
// 배경: App 은 Firebase 세션(authUser)으로 앱 전체를 게이팅하지만, ProfileScreen 의
// 클라우드 패널은 자체 authState('signedOut' 시작)만 봐서 — 재시작하면 이미 로그인돼
// 있어도 '카카오로 계속…' 버튼이 계속 떴다. 게다가 CloudUser 엔 provider 가 없어
// '뭘로 로그인했는지' 알 수도 없었다. 로그인 성공 시 provider+계정을 여기 저장하고,
// ProfileScreen 마운트가 이를 읽어 로그인 상태·제공자를 복원한다.
//
// 순수 AsyncStorage 래퍼 — 모든 실패는 삼킨다(표시용 부가 정보라 비차단).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {CloudProvider, CloudUser} from './cloudPort';

const K_CLOUD_ACCOUNT = 'cloud_account';

export interface SavedCloudAccount {
  provider: CloudProvider;
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

/** provider 한국어 표시명 — 로그인 상태 카드에 '카카오 계정' 등으로 쓴다. */
export const CLOUD_PROVIDER_LABEL: Record<CloudProvider, string> = {
  anonymous: '게스트',
  google: 'Google',
  apple: 'Apple',
  kakao: '카카오',
  naver: '네이버',
};

export async function saveCloudAccount(provider: CloudProvider, user: CloudUser): Promise<void> {
  try {
    await AsyncStorage.setItem(
      K_CLOUD_ACCOUNT,
      JSON.stringify({provider, uid: user.uid, email: user.email ?? null, displayName: user.displayName ?? null}),
    );
  } catch {
    /* 표시용 — 실패 무시 */
  }
}

export async function loadCloudAccount(): Promise<SavedCloudAccount | null> {
  try {
    const raw = await AsyncStorage.getItem(K_CLOUD_ACCOUNT);
    if (!raw) return null;
    const a = JSON.parse(raw);
    if (a && typeof a === 'object' && a.uid && a.provider && a.provider in CLOUD_PROVIDER_LABEL) {
      return a as SavedCloudAccount;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearCloudAccount(): Promise<void> {
  try {
    await AsyncStorage.removeItem(K_CLOUD_ACCOUNT);
  } catch {
    /* 무시 */
  }
}
