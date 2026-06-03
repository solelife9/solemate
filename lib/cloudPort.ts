// ============================================================================
// lib/cloudPort.ts — 클라우드 동기 포트(인터페이스) (Slice 5)
//
// cloudSync(순수 병합/마이그레이션 로직)와 firebase 네이티브 SDK 사이의 경계.
// cloudSync 는 이 포트를 import 하지 않는다(의존성 역전: 순수 로직은 어떤 백엔드도
// 모른다). 앱 합성 계층이 CloudPort 구현(firebaseCloudPort)으로 원격 데이터를
// pull → cloudSync.mergeCloudData 로 로컬과 무손실 병합 → push 로 되돌려쓴다.
//
// 포트 계약(네이티브 의존성 0 의 순수 타입):
//   signIn(provider) — 로그인하고 uid 를 가진 사용자를 돌려준다
//   signOut()        — 로그아웃
//   pull()           — 계정의 백업 페이로드를 읽는다(없으면 null)
//   push(data)       — 백업 페이로드를 계정에 기록한다
// ============================================================================

import type { BackupPayload } from './backup';

/**
 * 지원 로그인 방식.
 *  - anonymous: 자체 완결.
 *  - google·apple: RNFB 밖에서 받은 외부 OAuth 자격증명 필요(앱이 리졸버 주입).
 *  - kakao·naver: Firebase 기본 제공이 아니므로, 네이티브 카카오/네이버 SDK 로그인 →
 *    백엔드가 그 토큰을 검증해 발급한 'Firebase 커스텀 토큰'으로 signInWithCustomToken.
 *    앱이 커스텀 토큰 리졸버를 주입한다(미주입 시 해당 provider 비활성).
 */
export type CloudProvider = 'anonymous' | 'google' | 'apple' | 'kakao' | 'naver';

/**
 * 포트가 노출하는 최소 사용자 정보. firebase User 전체를 새어나가지 않게 좁힌다.
 * email/displayName 은 화면의 '로그인 상태(이메일/계정) 표시'에만 쓰이는 부가 정보로,
 * 없을 수 있다(anonymous 로그인 등). uid 만이 동기 문서 키로서 필수다.
 */
export interface CloudUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

/**
 * 클라우드 백엔드 포트. firebase 든 다른 무엇이든 이 인터페이스만 만족하면
 * 앱/동기 로직을 바꾸지 않고 갈아끼울 수 있다(테스트에서는 메모리 가짜로 대체).
 */
export interface CloudPort {
  /** 로그인하고 인증된 사용자를 돌려준다. 실패 시 reject. */
  signIn(provider: CloudProvider): Promise<CloudUser>;
  /** 로그아웃. */
  signOut(): Promise<void>;
  /** 계정에 저장된 백업 페이로드. 한 번도 push 한 적 없으면 null. */
  pull(): Promise<BackupPayload | null>;
  /** 백업 페이로드를 계정에 기록(전체 덮어쓰기 — 병합은 호출부가 cloudSync 로 끝낸 뒤). */
  push(data: BackupPayload): Promise<void>;
}
