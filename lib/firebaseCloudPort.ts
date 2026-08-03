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
  runTransaction,
  collection,
  getDocs,
  serverTimestamp,
  writeBatch,
  query,
  where,
  orderBy,
  limit as fbLimit,
} from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BackupPayload } from './backup';
import { observeServerClock } from './clockOffset';
import type { CloudPort, CloudProvider, CloudUser } from './cloudPort';

/** 사용자별 백업 문서가 사는 컬렉션. 문서 id 는 auth uid. */
const BACKUPS_COLLECTION = 'userBackups';

/** 월간 랭킹 엔트리가 사는 컬렉션(`leaderboards/{YYYY-MM}/entries/{uid}`). */
const LEADERBOARDS_COLLECTION = 'leaderboards';

/**
 * 탈퇴 시 지울 월간 랭킹 엔트리의 소급 범위(개월).
 *
 * 왜 '범위'인가: 규칙이 leaderboards 읽기를 전면 차단하므로(2026-07-29 감사) 클라이언트는
 * **자기 엔트리가 어느 달에 있는지 조회할 수 없다.** 그래서 목록을 읽는 대신 최근 N개월의
 * 문서 경로를 만들어 그냥 지운다 — Firestore 에서 없는 문서의 delete 는 오류가 아니라
 * no-op 이므로 안전하다.
 *
 * 24개월인 이유: 랭킹 발행이 배선된 시점이 2026-06 이라 실제 엔트리는 그 이후에만 존재한다.
 * 넉넉히 2년을 훑어도 24회 delete 로 끝나고, 그 대가로 '어느 달 것이 남았을까'를 고민할
 * 필요가 없어진다.
 */
const LEADERBOARD_PURGE_MONTHS = 24;

/**
 * `nowMs` 가 속한 달부터 과거로 `months` 개월치 `YYYY-MM` 키를 만든다(최신순).
 *
 * 순수 함수 — 테스트에서 시각을 고정할 수 있도록 현재 시각을 인자로 받는다.
 * (`lib/progression/firestoreRankingStore.yearMonthOf` 와 같은 규약이지만, 그 모듈이
 *  이 파일의 `getFirebaseUid` 를 import 하므로 되가져오면 순환이 된다 — 그래서 여기 둔다.)
 */
export function recentYearMonths(nowMs: number, months = LEADERBOARD_PURGE_MONTHS): string[] {
  const out: string[] = [];
  const d = new Date(nowMs);
  let year = d.getFullYear();
  let month = d.getMonth(); // 0-based
  for (let i = 0; i < months; i += 1) {
    out.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return out;
}

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
 * 두 백업 문서가 **같은 내용인가**(AUDIT 2 I-4 — 무변경 쓰기 생략용).
 *
 * 판정 방향이 한쪽으로만 틀리도록 설계했다: 같은데 다르다고 하면 **쓸데없는 쓰기 한 번**이고,
 * 다른데 같다고 하면 **변경 유실**이다. 그래서 확신이 없으면 무조건 '다르다'로 답한다
 * (직렬화 실패도 '다르다' → 쓴다). 데이터 안전이 비용 절감보다 우선한다.
 *
 * 두 인자는 모두 payloadToDoc 이 만든 객체라 키 순서가 고정이므로 문자열 비교가 성립한다.
 * 배열 원소의 키 순서가 우연히 다르면 '다르다'로 떨어지는데, 그건 안전한 쪽 오답이다.
 */
/**
 * 이 기기의 안정적 식별자(AUDIT 3 D-2). App 이 부팅 때 만들어 두는 `device_id` 를 재사용한다 —
 * 새 값을 만들면 기기가 둘로 보여 시계 표식이 갈린다. 없으면 'unknown'(그래도 동작한다).
 */
async function getDeviceId(): Promise<string> {
  try {
    return (await AsyncStorage.getItem('device_id')) || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 백업 문서에서 **이 기기가 지난번에 남긴 시각 쌍**을 꺼낸다(AUDIT 3 D-2).
 * `s` 는 Firestore Timestamp 로 되읽히므로 toMillis() 로 변환한다.
 * 형태가 안 맞으면 null — offset 을 갱신하지 않는다(모르면 보정하지 않는다).
 */
function readDeviceClock(
  raw: Record<string, unknown> | null,
  deviceId: string,
): {serverMs: number; clientMs: number} | null {
  const clock = raw?.clock;
  if (!clock || typeof clock !== 'object' || Array.isArray(clock)) return null;
  const mine = (clock as Record<string, unknown>)[deviceId];
  if (!mine || typeof mine !== 'object') return null;
  const m = mine as {c?: unknown; s?: unknown};
  const clientMs = typeof m.c === 'number' ? m.c : Number(m.c);
  const sv = m.s as {toMillis?: () => number} | number | undefined;
  const serverMs =
    typeof sv === 'number' ? sv : sv && typeof sv.toMillis === 'function' ? sv.toMillis() : NaN;
  if (!Number.isFinite(clientMs) || !Number.isFinite(serverMs)) return null;
  return {serverMs, clientMs};
}

/** Firestore Timestamp | number | null → ms(없거나 이상하면 0). pending write 는 null 이다. */
function toMillis(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = v as {toMillis?: () => number} | null;
  if (t && typeof t.toMillis === 'function') {
    const ms = t.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function sameBackupDoc(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false; // 순환 참조 등 — 비교 불가면 '다르다'(쓴다)
  }
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
  // 월간 랭킹 엔트리 — 탈퇴 시 함께 지운다(개인정보 파기 요건).
  const leaderboardEntryRef = (yearMonth: string, uid: string) =>
    doc(getFirestore(), LEADERBOARDS_COLLECTION, yearMonth, 'entries', uid);
  // 런 상세 사이드카 — 단일 백업 문서(1MB 상한)에 못 싣는 시계열을 런별 하위 문서로.
  const runDetailRef = (uid: string, runId: string) =>
    doc(getFirestore(), BACKUPS_COLLECTION, uid, 'runDetails', runId);

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
        // 하위 컬렉션(runDetails)은 부모 문서 삭제로 지워지지 않는다 — 탈퇴 완전삭제 요건상
        // 명시적으로 순회 삭제(실패해도 계속 — 계정/백업 본체 삭제가 우선).
        try {
          const details = await getDocs(collection(getFirestore(), BACKUPS_COLLECTION, user.uid, 'runDetails'));
          for (const d of details.docs ?? []) {
            try { await deleteDoc(runDetailRef(user.uid, d.id)); } catch { /* 개별 실패 무시 */ }
          }
        } catch { /* 목록 실패 — 본체 삭제 계속 */ }
        await deleteDoc(backupRef(user.uid));
        // 공개 프로필도 함께 내린다 — 탈퇴했는데 남들에게 계속 보이면 안 된다.
        try { await deleteDoc(doc(getFirestore(), 'profiles', user.uid)); } catch { /* 없으면 no-op */ }
      } catch {
        // 백업 문서 부재/일시 오류 — 계정 삭제를 막지 않는다.
      }
      // 2) 월간 랭킹 엔트리(leaderboards/{ym}/entries/{uid})를 지운다.
      //    2026-07-29 감사 전까지 이 경로는 탈퇴 대상에서 빠져 있었다 — 규칙이 삭제를
      //    아예 막고 있어서(`allow delete: if false`) 닉네임과 월간 운동량이 탈퇴 후에도
      //    영구히 남았다. 공개된 처리방침("계정 정보는 회원 탈퇴 시까지")과 어긋난 상태였다.
      //    읽기가 차단돼 있어 목록 조회는 불가하므로 최근 N개월 경로를 만들어 지운다
      //    (없는 문서 delete 는 no-op — recentYearMonths 주석 참고).
      //    계정 삭제 전에 해야 한다 — 삭제 후엔 권한이 사라져 영영 못 지운다.
      try {
        for (const ym of recentYearMonths(Date.now())) {
          try {
            await deleteDoc(leaderboardEntryRef(ym, user.uid));
          } catch {
            /* 개별 월 실패는 무시 — 나머지 달과 계정 삭제를 막지 않는다 */
          }
        }
      } catch {
        // 전체 실패도 계정 삭제를 막지 않는다(백업 삭제와 같은 규약).
      }
      // 3) 인증 계정 자체를 삭제. 세션이 오래되면 'requires-recent-login' 으로 막히므로
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

    async pushRunDetail(runId: string, detail: Record<string, unknown>): Promise<void> {
      const uid = requireUid();
      if (!runId) return;
      await setDoc(runDetailRef(uid, runId), detail);
    },
    /**
     * 레코드 하위 문서 일괄 기록(설계 1단계 — 이중 쓰기).
     * 각 문서에 `updatedAt: serverTimestamp()` 를 박아 델타 조회의 커서를 만든다.
     * merge:true 로 upsert 한다 — 부분 갱신이 안전하고, 없던 문서는 새로 생긴다.
     */
    async pushRecords(
      collectionName: string,
      docs: {id: string; data: Record<string, unknown>}[],
    ): Promise<void> {
      const uid = requireUid();
      if (!collectionName || !docs?.length) return;
      const db = getFirestore();
      const batch = writeBatch(db);
      for (const d of docs) {
        if (!d?.id) continue;
        batch.set(
          doc(db, BACKUPS_COLLECTION, uid, collectionName, d.id),
          {...d.data, updatedAt: serverTimestamp()},
          {merge: true},
        );
      }
      await batch.commit();
    },

    /** 하위 컬렉션 델타 조회. afterMs 가 null 이면 전량. */
    async listRecords(
      collectionName: string,
      afterMs: number | null,
      limitN = 500,
    ): Promise<{docs: {id: string; data: Record<string, unknown>}[]; maxUpdatedAtMs: number}> {
      const uid = requireUid();
      const col = collection(getFirestore(), BACKUPS_COLLECTION, uid, collectionName);
      const useCursor = !!afterMs && afterMs > 0;
      const q = useCursor
        ? query(col, where('updatedAt', '>', new Date(afterMs)), orderBy('updatedAt'), fbLimit(limitN))
        : query(col, orderBy('updatedAt'), fbLimit(limitN));
      const snap = await getDocs(q);
      const out: {id: string; data: Record<string, unknown>}[] = [];
      let maxMs = afterMs ?? 0;
      for (const d of snap.docs) {
        const data = (d.data() as Record<string, unknown>) ?? {};
        // 방금 내가 쓴 문서는 서버 확인 전까지 updatedAt 이 null 이다(pending write).
        // 커서 계산에서 건너뛴다 — 다음 동기에 잡힌다.
        const ms = toMillis(data.updatedAt);
        if (ms > maxMs) maxMs = ms;
        out.push({id: d.id, data});
      }
      return {docs: out, maxUpdatedAtMs: maxMs};
    },

    /** 공개 프로필 발행. 서버 시각을 함께 박아 '언제 갱신됐는지'를 남긴다. */
    async putPublicProfile(profile: Record<string, unknown>): Promise<void> {
      const uid = requireUid();
      await setDoc(doc(getFirestore(), 'profiles', uid), {
        ...profile,
        updatedAt: serverTimestamp(),
      });
    },
    /**
     * 남의 공개 프로필 한 건. 없으면 null.
     * **랭킹 목록을 그릴 때가 아니라 그 사람을 눌렀을 때만** 부른다(읽기 1건).
     */
    async getPublicProfile(uid: string): Promise<Record<string, unknown> | null> {
      if (!uid) return null;
      const snap = await getDoc(doc(getFirestore(), 'profiles', uid));
      return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    },
    /** 공개 중단·탈퇴 시 내린다. 없는 문서 삭제는 no-op. */
    async deletePublicProfile(): Promise<void> {
      const uid = requireUid();
      await deleteDoc(doc(getFirestore(), 'profiles', uid));
    },

    async deleteRunDetail(runId: string): Promise<void> {
      const uid = requireUid();
      if (!runId) return;
      // 없는 문서 삭제는 no-op 이다 — 상세가 애초에 없던 런도 그냥 성공한다.
      await deleteDoc(runDetailRef(uid, runId));
    },
    async pullRunDetail(runId: string): Promise<Record<string, unknown> | null> {
      const uid = requireUid();
      if (!runId) return null;
      const snap = await getDoc(runDetailRef(uid, runId));
      if (!snap.exists()) return null;
      return (snap.data() as Record<string, unknown>) ?? null;
    },
    async push(data: BackupPayload): Promise<void> {
      const uid = requireUid();
      await setDoc(backupRef(uid), payloadToDoc(data));
    },

    async syncMerge(
      local: BackupPayload,
      merge: (local: BackupPayload, remote: BackupPayload | null) => BackupPayload,
    ): Promise<BackupPayload> {
      const uid = requireUid();
      const ref = backupRef(uid);
      // 트랜잭션 안에서 원격을 *다시 읽어* 병합한다 — pull 과 push 사이의 경합 창을 닫는다.
      // 다른 기기가 그 사이 쓴 값이 tx.get 으로 보이고, merge(무손실 union)가 합쳐 기록하므로
      // 어느 쪽 쓰기도 잃지 않는다. Firestore 가 경합을 감지하면 트랜잭션을 자동 재시도한다.
      const deviceId = await getDeviceId();
      return await runTransaction(getFirestore(), async tx => {
        const snapshot = await tx.get(ref);
        const raw = (snapshot.exists() ? snapshot.data() : null) as Record<string, unknown> | null;
        const remote = raw ? normalizePayload(raw) : null;

        // AUDIT 3 D-2 — **이 기기가 지난번에 쓴 시각 쌍**을 읽어 시계 offset 을 갱신한다.
        // 자기가 쓴 값끼리 비교하므로 다른 기기의 시계가 섞이지 않는다.
        const prevClock = readDeviceClock(raw, deviceId);
        if (prevClock) void observeServerClock(prevClock.serverMs, prevClock.clientMs);

        const merged = merge(local, remote);
        const nextDoc = payloadToDoc(merged);
        // AUDIT 2 I-4 — 병합 결과가 원격과 완전히 같으면 쓰지 않는다.
        // 동기는 앱 전환·복귀마다 도는데(App.tsx AppState) 그중 대부분은 바뀐 게 없다.
        // 그때마다 사용자의 신발·런 전체가 든 문서를 통째로 다시 올리고 있었다 —
        // 쓰기 과금도, 모바일 데이터도, 배터리도 전부 헛돈다.
        // 원격이 아예 없으면(remote == null) 첫 백업이므로 반드시 쓴다.
        if (remote && sameBackupDoc(nextDoc, payloadToDoc(remote))) return merged;
        // 시계 표식은 **실제로 쓸 때만** 붙인다(I-4 의 무변경 생략을 깨지 않으려고
        // 위 비교에서는 제외했다). clock 은 payloadToDoc 이 만들지 않는 별도 필드다.
        const prevClockMap = raw && typeof raw.clock === 'object' && !Array.isArray(raw.clock)
          ? (raw.clock as Record<string, unknown>)
          : {};
        tx.set(ref, {
          ...nextDoc,
          clock: {...prevClockMap, [deviceId]: {c: Date.now(), s: serverTimestamp()}},
        });
        return merged;
      });
    },
  };
}
