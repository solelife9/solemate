// ============================================================================
// lib/progression/firestoreRanking.ts — Firestore 기반 RankingProvider (순수·DI)
// ============================================================================
// 명예의 전당 리더보드를 Render 백엔드(/api/v1) 대신 Firestore 로 옮긴다. 각 사용자가
// 자기 월간 엔트리(점수 5종 + 표시정보)를 leaderboards/{yearMonth}/entries/{uid} 에
// 쓰고, 클라이언트가 카테고리별 정렬 쿼리로 상위 100명을 읽는다(서버 집계 불필요).
//
// 이 모듈은 firebase 를 직접 import 하지 않는다 — RankingStore(쿼리 원시연산)를 주입받아
// 순수하게 동작하므로 fake store 로 단위테스트된다. 실제 firestore 배선은
// firestoreRankingStore.ts 가 한다(remoteRanking↔rankingProvider 와 동일한 DI 패턴).
//
// 계약(seam): 항상 resolve, throw 금지. 미로그인/쿼리 실패/엔트리 부재는 모두
// available:false + 빈 결과로 떨어진다(가짜 경쟁자 발명 금지).
// ============================================================================
import {
  LeaderboardEntry,
  RankTier,
  RemoteLeaderboard,
  RemoteMyRanking,
} from './types';

/** 리더보드 카테고리(점수 키). 백엔드 leaderboardService 와 동일. */
export const RANKING_CATEGORIES = [
  'distance',
  'consistency',
  'shoeHealth',
  'collection',
  'progressPoints',
] as const;
export type RankingCategory = (typeof RANKING_CATEGORIES)[number];

function isCategory(c: string): c is RankingCategory {
  return (RANKING_CATEGORIES as readonly string[]).includes(c);
}

/** Firestore 에 저장되는 한 사용자의 월간 랭킹 엔트리(점수 5종 + 표시정보). */
export interface StoredRankingEntry {
  uid: string;
  nickname: string;
  rankTier: RankTier;
  rankColor: string;
  equippedTitle: string | null;
  distance: number;
  consistency: number;
  shoeHealth: number;
  collection: number;
  progressPoints: number;
  updatedAt: number;
}

/**
 * Firestore 쿼리 원시연산(주입). firestoreRankingStore 가 실제 구현을 제공하고,
 * 테스트는 인메모리 fake 를 주입한다. 모든 메서드는 throw 가능(provider 가 감싼다).
 */
export interface RankingStore {
  /** category 점수 내림차순 상위 limit 개 엔트리. */
  topByCategory(category: RankingCategory, yearMonth: string, limit: number): Promise<StoredRankingEntry[]>;
  /** 내 엔트리(없으면 null). */
  getEntry(uid: string, yearMonth: string): Promise<StoredRankingEntry | null>;
  /** category 점수가 score 보다 큰 엔트리 수(내 순위 = +1). */
  countAbove(category: RankingCategory, yearMonth: string, score: number): Promise<number>;
  /** 해당 월 전체 엔트리 수. */
  total(yearMonth: string): Promise<number>;
  /** 내 엔트리 upsert. */
  publish(yearMonth: string, entry: StoredRankingEntry): Promise<void>;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function scoreOf(e: StoredRankingEntry, category: RankingCategory): number {
  return num(e[category]);
}

function toEntry(
  e: StoredRankingEntry,
  category: RankingCategory,
  yearMonth: string,
  rank: number,
): LeaderboardEntry {
  return {
    uid: e.uid,
    yearMonth,
    category,
    rank,
    score: scoreOf(e, category),
    nickname: e.nickname || '러너',
    rankTier: e.rankTier || 'bronze',
    rankColor: e.rankColor || '#CD7F32',
    equippedTitle: e.equippedTitle ?? null,
  };
}

function emptyLeaderboard(category: string, yearMonth: string): RemoteLeaderboard {
  return {kind: 'remote', available: false, category, yearMonth, entries: []};
}

function emptyMyRanking(category: string, yearMonth: string): RemoteMyRanking {
  return {kind: 'remote', available: false, category, yearMonth, total: 0, topPercent: null, me: null, nearby: []};
}

export interface FirestoreRankingProvider {
  getLeaderboard(category: string, yearMonth: string): Promise<RemoteLeaderboard>;
  getMyRanking(category: string, yearMonth: string): Promise<RemoteMyRanking>;
}

/**
 * Firestore 기반 RankingProvider 를 만든다. store(쿼리)와 getUid(로그인 uid)를 주입.
 * 어떤 단계가 실패해도 빈(available:false) 결과로 떨어진다(throw 금지).
 */
export function createFirestoreRankingProvider(
  store: RankingStore,
  getUid: () => Promise<string | null>,
): FirestoreRankingProvider {
  return {
    async getLeaderboard(category, yearMonth): Promise<RemoteLeaderboard> {
      if (!isCategory(category)) return emptyLeaderboard(category, yearMonth);
      try {
        const rows = await store.topByCategory(category, yearMonth, 100);
        const entries = rows.map((r, i) => toEntry(r, category, yearMonth, i + 1));
        return {kind: 'remote', available: true, category, yearMonth, entries};
      } catch {
        return emptyLeaderboard(category, yearMonth);
      }
    },

    async getMyRanking(category, yearMonth): Promise<RemoteMyRanking> {
      if (!isCategory(category)) return emptyMyRanking(category, yearMonth);
      try {
        const uid = await getUid();
        if (!uid) return emptyMyRanking(category, yearMonth);
        const mine = await store.getEntry(uid, yearMonth);
        if (!mine) return emptyMyRanking(category, yearMonth);
        const myScore = scoreOf(mine, category);
        const above = await store.countAbove(category, yearMonth, myScore);
        const rank = above + 1;
        const total = await store.total(yearMonth);
        const topPercent = total > 0 ? Math.max(1, Math.round((rank / total) * 100)) : null;
        // 주변 순위: 상위 100 안에 들면 ±2 슬라이스, 아니면 나만.
        const top = await store.topByCategory(category, yearMonth, 100);
        const idx = top.findIndex(e => e.uid === uid);
        let nearby: LeaderboardEntry[];
        if (idx >= 0) {
          const from = Math.max(0, idx - 2);
          nearby = top.slice(from, idx + 3).map((e, k) => toEntry(e, category, yearMonth, from + k + 1));
        } else {
          nearby = [toEntry(mine, category, yearMonth, rank)];
        }
        const me = toEntry(mine, category, yearMonth, rank);
        return {kind: 'remote', available: true, category, yearMonth, total, topPercent, me, nearby};
      } catch {
        return emptyMyRanking(category, yearMonth);
      }
    },
  };
}

// ── 내 엔트리 점수 계산(순수) ────────────────────────────────────────────────
// 백엔드 leaderboardService.scoreFor 와 동일 의미로 클라이언트에서 계산한다:
//   distance=이달 누적 km · consistency=이달 활동일수 · collection=등록 신발 수
//   progressPoints=진척 XP · shoeHealth=라이브 신발 평균 잔여 수명%.
export interface RankingStatsInput {
  runs: ReadonlyArray<{shoe_id?: unknown; km?: unknown; run_date?: unknown}>;
  shoes: ReadonlyArray<{id?: unknown; max_km?: unknown; start_km?: unknown}>;
  yearMonth: string;
  /** 진척 XP(getProgression().rank.xp). */
  progressPoints: number;
}

export interface RankingStats {
  distance: number;
  consistency: number;
  shoeHealth: number;
  collection: number;
  progressPoints: number;
}

function ymOf(date: unknown): string {
  return typeof date === 'string' ? date.slice(0, 7) : '';
}

export function computeRankingStats(input: RankingStatsInput): RankingStats {
  const {runs, shoes, yearMonth} = input;
  const monthRuns = runs.filter(r => ymOf(r.run_date) === yearMonth);
  const distance = monthRuns.reduce((a, r) => a + num(r.km), 0);
  const days = new Set(monthRuns.map(r => String(r.run_date)).filter(Boolean));
  const consistency = days.size;
  const collection = shoes.length;
  // 신발별 사용 km = start_km + 그 신발의 전(全) 기간 런 km 합. 잔여수명% = (1 - used/max).
  const usedByShoe = new Map<string, number>();
  for (const r of runs) {
    const sid = String(r.shoe_id ?? '');
    if (!sid) continue;
    usedByShoe.set(sid, (usedByShoe.get(sid) || 0) + num(r.km));
  }
  let healthSum = 0;
  let healthN = 0;
  for (const s of shoes) {
    const max = num(s.max_km);
    if (max <= 0) continue;
    const used = num(s.start_km) + (usedByShoe.get(String(s.id ?? '')) || 0);
    const pct = Math.max(0, Math.min(100, (1 - used / max) * 100));
    healthSum += pct;
    healthN += 1;
  }
  const shoeHealth = healthN > 0 ? Math.round((healthSum / healthN) * 10) / 10 : 0;
  return {
    distance: Math.round(distance * 10) / 10,
    consistency,
    shoeHealth,
    collection,
    progressPoints: num(input.progressPoints),
  };
}

/** 표시정보 + 점수를 합쳐 저장용 엔트리를 만든다(updatedAt 은 호출부 주입 — 결정성). */
export function buildStoredEntry(args: {
  uid: string;
  nickname: string;
  rankTier: RankTier;
  rankColor: string;
  equippedTitle?: string | null;
  stats: RankingStats;
  updatedAt: number;
}): StoredRankingEntry {
  return {
    uid: args.uid,
    nickname: args.nickname || '러너',
    rankTier: args.rankTier || 'bronze',
    rankColor: args.rankColor || '#CD7F32',
    equippedTitle: args.equippedTitle ?? null,
    distance: num(args.stats.distance),
    consistency: num(args.stats.consistency),
    shoeHealth: num(args.stats.shoeHealth),
    collection: num(args.stats.collection),
    progressPoints: num(args.stats.progressPoints),
    updatedAt: args.updatedAt,
  };
}
