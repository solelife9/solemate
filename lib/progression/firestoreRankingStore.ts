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
  computeRankingStats,
  buildStoredEntry,
  RankingStatsInput,
} from './firestoreRanking';
import {RankingProvider, RankTier} from './types';

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
};

/**
 * Firestore 에 연결된 라이브 RankingProvider. HallOfFameScreen 의 기본 provider.
 * (인터페이스=RankingProvider — 로컬 stub·REST provider 와 호환.)
 */
export const keegoFirestoreRankingProvider: RankingProvider = createFirestoreRankingProvider(
  firestoreRankingStore,
  getFirebaseUid,
);

/** 현재 활동 월(YYYY-MM)을 호출부 주입 시각으로부터 계산한다(결정성 — Date.now 비의존). */
export function yearMonthOf(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export interface PublishRankingArgs {
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
    });
    await firestoreRankingStore.publish(yearMonth, entry);
    return true;
  } catch {
    return false;
  }
}

// re-export 카테고리 상수/타입(화면이 점수 키를 순회할 때 단일 출처에서 가져가게).
export {RANKING_CATEGORIES} from './firestoreRanking';
export type {RankingCategory} from './firestoreRanking';
