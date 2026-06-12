// ============================================================================
// lib/progression/ranking.ts — 랭킹 데이터 소스 seam(로컬 stub) (Slice A)
// ============================================================================
// 크로스유저 리더보드/Hall of Fame 는 멀티유저 백엔드가 필요하므로 **이 run 의 범위 밖**
// (slice E/F, 별도 Tenet run). 여기선 RankingProvider 인터페이스(types.ts)의 **로컬 전용
// 구현**만 둔다 — 나중에 네트워크 구현으로 교체해도 인터페이스가 바뀌지 않도록 모양을 고정한다.
//
// 계약(anti-scenario 5: 가짜 경쟁자 금지):
//   · getLeaderboard → available:false, entries:[] (절대 발명한 타인 데이터 없음).
//   · getMyRanking   → available:false, me = **내 로컬 스냅샷(점수/티어/색)** 또는 null.
//                      순위/상위% 같은 크로스유저 값은 백엔드 부재로 채우지 않는다.
//
// PURE/안전: 입력에서 throw 하지 않고, 백엔드가 없으므로 항상 즉시(동기적으로) resolve 된다.
// ============================================================================
import {
  LocalLeaderboard,
  LocalMyRanking,
  RankResult,
  RankingProvider,
} from './types';

/** RankResult → 로컬 me 스냅샷(점수/티어/색)만. 없으면 null(경쟁자/순위 없음). */
function meFromRank(
  rank: RankResult | null | undefined,
): LocalMyRanking['me'] {
  if (!rank || typeof rank !== 'object') return null;
  const score = Number.isFinite(rank.score) ? rank.score : 0;
  return {score, tier: rank.tier, color: rank.color};
}

/**
 * 로컬 전용 RankingProvider 를 만든다. 내 랭크(RankResult)를 주입하면 getMyRanking 이
 * 그 로컬 스냅샷을 me 로 돌려주고, 리더보드는 항상 빈 placeholder("coming soon")다.
 * 백엔드(slice E/F)가 생기면 이 팩토리를 네트워크 구현으로 교체한다(인터페이스 불변).
 *
 * @param rank 내 현재 랭크(getProgression(...).rank). 없으면 me=null.
 */
export function createLocalRankingProvider(
  rank: RankResult | null | undefined,
): RankingProvider {
  const me = meFromRank(rank);
  return {
    async getLeaderboard(
      category: string,
      yearMonth: string,
    ): Promise<LocalLeaderboard> {
      // 가짜 경쟁자 없음 — 엔트리는 항상 비어 있다(백엔드 부재).
      return {kind: 'local', available: false, category, yearMonth, entries: []};
    },
    async getMyRanking(): Promise<LocalMyRanking> {
      // 순위/상위%는 크로스유저 값이라 채우지 않는다(로컬 스냅샷만).
      return {kind: 'local', available: false, me};
    },
  };
}

/**
 * 기본 로컬 stub(랭크 미바인딩 → me=null). 랭크를 표면화하려면
 * createLocalRankingProvider(rank) 를 쓴다.
 */
export const localRankingProvider: RankingProvider =
  createLocalRankingProvider(null);
