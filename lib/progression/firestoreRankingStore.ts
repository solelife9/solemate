// ============================================================================
// lib/progression/firestoreRankingStore.ts — RankingStore 의 Firestore 구현 (Phase 3)
// ============================================================================
// firestoreRanking.ts(순수·DI provider)에 실제 Firestore 쿼리를 묶는 합성 모듈.
// 리더보드는 leaderboards/{yearMonth}/entries/{uid} 문서로 산다: 각 사용자가 자기 월간
// 엔트리(점수 5종 + 표시정보)를 자기 uid 문서에 쓰고, 클라이언트가 카테고리별 정렬
// 쿼리로 상위 100명을 읽는다(서버 집계 함수 불필요 → Render 백엔드 대체).
//
// 이 모듈만 @react-native-firebase/firestore 에 의존한다(비순수). 순수 provider·엔진은
// 이 파일을 import 하지 않는다 — 화면(HallOfFameScreen)/앱 부트(App.tsx)에서만 쓴다.
// jest 는 jest.setup.js 의 인메모리 firestore 목으로 쿼리/카운트를 검증한다.
// ============================================================================
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getCountFromServer,
} from '@react-native-firebase/firestore';

import {getFirebaseUid} from '../firebaseCloudPort';
import {
  RankingStore,
  StoredRankingEntry,
  createFirestoreRankingProvider,
  type EntryShoe,
  computeRankingStats,
  buildStoredEntry,
  RankingStatsInput,
} from './firestoreRanking';
import {RankingProvider, RankTier} from './types';
import {withRankingCache} from './rankingCache';

/** 월간 엔트리 컬렉션 경로: leaderboards/{yearMonth}/entries. 문서 id = uid. */
function entriesPath(yearMonth: string): string {
  return `leaderboards/${yearMonth}/entries`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** firestore 문서 데이터를 StoredRankingEntry 로 방어적 정규화(누락/이상치 → 안전값). */
function toStored(data: Record<string, unknown> | undefined, uid: string): StoredRankingEntry {
  const d = data ?? {};
  return {
    uid: typeof d.uid === 'string' && d.uid ? d.uid : uid,
    nickname: typeof d.nickname === 'string' && d.nickname ? d.nickname : '러너',
    rankTier: (typeof d.rankTier === 'string' ? d.rankTier : 'bronze') as RankTier,
    rankColor: typeof d.rankColor === 'string' && d.rankColor ? d.rankColor : '#CD7F32',
    equippedTitle: typeof d.equippedTitle === 'string' ? d.equippedTitle : null,
    distance: num(d.distance),
    consistency: num(d.consistency),
    shoeHealth: num(d.shoeHealth),
    collection: num(d.collection),
    progressPoints: num(d.progressPoints),
    updatedAt: num(d.updatedAt),
  };
}

/**
 * Firestore 백엔드 RankingStore. 모든 메서드는 throw 가능 — provider 가 try/catch 로
 * 감싸 available:false 로 떨어뜨린다(가짜 경쟁자 발명 금지 계약은 provider 가 보장).
 */
export const firestoreRankingStore: RankingStore = {
  async topByCategory(category, yearMonth, limit) {
    const db = getFirestore();
    const col = collection(db, entriesPath(yearMonth));
    const q = query(col, orderBy(category, 'desc'), fbLimit(limit));
    const snap = await getDocs(q);
    return snap.docs.map(docSnap => toStored(docSnap.data() as any, docSnap.id));
  },

  async getEntry(uid, yearMonth) {
    const db = getFirestore();
    const ref = doc(db, entriesPath(yearMonth), uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return toStored(snap.data() as any, uid);
  },

  async countAbove(category, yearMonth, score) {
    const db = getFirestore();
    const col = collection(db, entriesPath(yearMonth));
    const q = query(col, where(category, '>', score));
    const snap = await getCountFromServer(q);
    return num(snap.data().count);
  },

  async total(yearMonth) {
    const db = getFirestore();
    const col = collection(db, entriesPath(yearMonth));
    const snap = await getCountFromServer(col);
    return num(snap.data().count);
  },

  async publish(yearMonth, entry) {
    const db = getFirestore();
    const ref = doc(db, entriesPath(yearMonth), entry.uid);
    await setDoc(ref, entry as any);
  },

  async unpublish(yearMonth, uid) {
    const db = getFirestore();
    // 규칙상 본인 엔트리만 지울 수 있다(firestore.rules leaderboards allow delete).
    // 없는 문서 삭제는 no-op 이다.
    await deleteDoc(doc(db, entriesPath(yearMonth), uid));
  },
};

/**
 * Firestore 에 연결된 라이브 RankingProvider. HallOfFameScreen 의 기본 provider.
 * (인터페이스=RankingProvider — 로컬 stub·REST provider 와 호환.)
 *
 * **읽기 캐시로 감싼다(2026-08-07).** 이 화면은 진입 1회에 약 103 읽기이고, 화면의 로드
 * effect 가 `category` 에 의존해 **칩을 누를 때마다 다시 읽는다**(탭 3개 = 309).
 * 재진입이면 또 309. 앱 전체가 하루 6 읽기인데 이 화면 하나가 그 50일치를 쓴다 —
 * 무료 한도가 **세 자릿수 사용자에서 깨지고**, 그 구간이 베타 모집 2단계다.
 * 캐시 계약과 안전선(실패 미캐시 · uid 별 격리)은 `rankingCache.ts` 머리말 참조.
 */
export const keegoFirestoreRankingProvider: RankingProvider = withRankingCache(
  createFirestoreRankingProvider(firestoreRankingStore, getFirebaseUid),
  {getUid: getFirebaseUid},
) as RankingProvider;

/** 현재 활동 월(YYYY-MM)을 호출부 주입 시각으로부터 계산한다(결정성 — Date.now 비의존). */
export function yearMonthOf(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 소급해서 내릴 개월 수. 랭킹 발행 배선 시점이 2026-06 이라 실제 엔트리는 그 이후에만
 * 있고, 규칙이 leaderboards 읽기를 막아 "어느 달에 내 엔트리가 있나"를 조회할 수 없다.
 * 그래서 목록을 읽는 대신 최근 N개월 경로를 만들어 지운다(없는 문서 delete 는 no-op).
 * lib/firebaseCloudPort 의 탈퇴 파기와 같은 규약·같은 개월 수다.
 */
export const RANKING_RETRACT_MONTHS = 24;

/**
 * **공개 동의를 철회했을 때 내 엔트리를 실제로 내린다.**
 *
 * 왜 필요한가(2026-08-07 감사): 철회하면 App 의 발행 가드가 일찍 return 해서 **발행만
 * 멈췄고, 이미 올라간 엔트리는 그대로 남았다.** unpublish 함수는 있었지만 유일한 호출부가
 * publishMyRanking 안(그 가드 뒤)이라 **도달할 수 없는 코드**였다. 결과적으로 닉네임·이번
 * 달 거리·신발·랭크가 로그인한 전원에게 계속 보였고 **앱에서 내릴 방법이 없었다.**
 * 공개 프로필은 null 을 넘겨 제대로 내려간다 — 리더보드만 짝이 빠져 있었다.
 * 처리방침 "공개용 프로필·순위 정보 — 공개 중단 시 또는 회원 탈퇴 시까지"와 어긋났다.
 *
 * 개별 월 실패는 삼킨다(나머지 달을 막지 않는다). 전부 실패해도 throw 하지 않는다 —
 * 호출부는 동기 흐름이고, 여기서 던지면 러닝 데이터 동기가 멎는다.
 */
export async function unpublishMyRanking(
  uid: string,
  nowMs: number,
  months: number = RANKING_RETRACT_MONTHS,
): Promise<void> {
  if (!uid) return;
  const d = new Date(nowMs);
  for (let i = 0; i < months; i += 1) {
    const ym = yearMonthOf(new Date(d.getFullYear(), d.getMonth() - i, 1).getTime());
    try {
      await firestoreRankingStore.unpublish(ym, uid);
    } catch {
      /* 개별 월 실패 무시 */
    }
  }
}

export interface PublishRankingArgs {
  /** 그달 주력 신발 요약 — 「1,2,3위는 뭘 신나」. 없으면 엔트리에 필드가 안 생긴다. */
  shoes_summary?: readonly EntryShoe[];
  nickname: string;
  rankTier: RankTier;
  rankColor: string;
  equippedTitle?: string | null;
  runs: RankingStatsInput['runs'];
  shoes: RankingStatsInput['shoes'];
  progressPoints: number;
  /** 결정성: 호출부가 현재 시각(ms)을 주입. 활동 월·updatedAt 으로 쓰인다. */
  nowMs: number;
}

/**
 * 내 월간 랭킹 엔트리를 계산해 Firestore 에 발행한다. 클라우드 동기(App.runCloudSync)
 * 뒤에 best-effort 로 호출 — 미로그인/실패는 false(throw 없음 — 동기 흐름을 막지 않는다).
 * 점수는 클라이언트가 computeRankingStats 로 계산한다(백엔드 leaderboardService 와 동일 의미).
 *
 * ── 이번 달에 달리지 않았으면 올리지 않는다 (2026-08-04) ──────────────────────
 * 실제 리더보드를 열어 보니 **엔트리 5개가 전부 거리 0km · 활동 0일**이었다. 발행이
 * 활동 여부를 안 보고 동기할 때마다 돌았기 때문이다. 그 결과 두 가지가 깨진다:
 *   · 화면 라벨이 거짓이 된다 — 진척 포인트 축은 "…에 **달린 러너 중**"이라고 적혀 있다.
 *   · 첫 사용자가 랭킹을 열면 `러너 0km` 가 늘어선 죽은 표를 본다.
 * 그래서 **이번 달 활동(거리 또는 활동일)이 있을 때만** 올리고, 없으면 이미 올라간 줄을
 * **내린다** — 발행을 '안 하는' 것만으로는 지난달에 올려둔 줄이 그대로 남는다.
 */
export async function publishMyRanking(args: PublishRankingArgs): Promise<boolean> {
  try {
    const uid = await getFirebaseUid();
    if (!uid) return false;
    const yearMonth = yearMonthOf(args.nowMs);
    const stats = computeRankingStats({
      runs: args.runs,
      shoes: args.shoes,
      yearMonth,
      progressPoints: args.progressPoints,
    });
    const entry = buildStoredEntry({
      uid,
      nickname: args.nickname,
      rankTier: args.rankTier,
      rankColor: args.rankColor,
      equippedTitle: args.equippedTitle ?? null,
      stats,
      updatedAt: args.nowMs,
      shoes: args.shoes_summary,
    });
    // 이번 달 활동이 없으면 명단에서 빠진다(올린 적 없으면 no-op).
    if (!(stats.distance > 0) && !(stats.consistency > 0)) {
      await firestoreRankingStore.unpublish(yearMonth, uid);
      return false;
    }
    await firestoreRankingStore.publish(yearMonth, entry);
    return true;
  } catch {
    return false;
  }
}

// re-export 카테고리 상수/타입(화면이 점수 키를 순회할 때 단일 출처에서 가져가게).
export {RANKING_CATEGORIES} from './firestoreRanking';
export type {RankingCategory} from './firestoreRanking';
