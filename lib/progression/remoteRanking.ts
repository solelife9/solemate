// ============================================================================
// lib/progression/remoteRanking.ts — 네트워크 RankingProvider (Slice E)
// ============================================================================
// 멀티유저 백엔드(solelife-backend /api/v1)의 리더보드/내순위를 읽어 RankingProvider
// 계약을 충족한다. ranking.ts(로컬 stub)와 동일 인터페이스라 소비자 변경 없이 교체된다.
//
// 계약(seam): 항상 resolve, **throw 금지**. 토큰 부재/네트워크 실패/비정상 응답은 모두
// available:false + 빈 결과로 떨어진다(anti-scenario 5: 가짜 경쟁자 발명 금지).
//
// 의존성 주입(테스트 가능·firebase 비오염): baseUrl·getToken·fetchImpl 을 주입받는다.
// 실제 배선(firebase 토큰 + API 베이스)은 rankingProvider.ts 가 한다.
// 백엔드는 snake_case(rank_tier/rank_color/equipped_title) → 여기서 camelCase 로 매핑.
// ============================================================================
import {
  LeaderboardEntry,
  RankTier,
  RemoteLeaderboard,
  RemoteMyRanking,
} from './types';

/** 토큰 공급자 — 로그인된 사용자의 Firebase ID 토큰(없으면 null). throw 가능. */
export type TokenProvider = () => Promise<string | null>;

/**
 * 네트워크 전용 provider — 항상 Remote* 를 반환한다. 반환 타입이 RankingProvider 의
 * Local|Remote 유니온의 하위이므로 RankingProvider 가 기대되는 곳에 그대로 할당된다.
 */
export interface RemoteRankingProvider {
  getLeaderboard(category: string, yearMonth: string): Promise<RemoteLeaderboard>;
  getMyRanking(category: string, yearMonth: string): Promise<RemoteMyRanking>;
}

export interface RemoteRankingOptions {
  /** 백엔드 베이스 URL(예: https://solelife-backend.onrender.com). */
  baseUrl: string;
  /** Firebase ID 토큰 공급자. */
  getToken: TokenProvider;
  /** fetch 구현(테스트 주입용). 기본 전역 fetch. */
  fetchImpl?: typeof fetch;
}

const VALID_TIERS: RankTier[] = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'legend',
];

function toTier(v: unknown): RankTier {
  return typeof v === 'string' && (VALID_TIERS as string[]).includes(v)
    ? (v as RankTier)
    : 'bronze';
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 백엔드 행(snake_case) → LeaderboardEntry(camelCase). category/yearMonth 는 상위에서 보충. */
function toEntry(row: any, category: string, yearMonth: string): LeaderboardEntry {
  return {
    uid: str(row?.uid),
    yearMonth,
    category,
    rank: num(row?.rank),
    score: num(row?.score),
    nickname: str(row?.nickname),
    rankTier: toTier(row?.rank_tier),
    rankColor: str(row?.rank_color) || '#CD7F32',
    equippedTitle: row?.equipped_title ? String(row.equipped_title) : null,
  };
}

function emptyLeaderboard(category: string, yearMonth: string): RemoteLeaderboard {
  return {kind: 'remote', available: false, category, yearMonth, entries: []};
}

function emptyMyRanking(category: string, yearMonth: string): RemoteMyRanking {
  return {
    kind: 'remote',
    available: false,
    category,
    yearMonth,
    total: 0,
    topPercent: null,
    me: null,
    nearby: [],
  };
}

/**
 * 네트워크 RankingProvider 를 만든다. getLeaderboard/getMyRanking 은 백엔드를 호출하고
 * 실패 시 빈(available:false) 결과로 안전하게 떨어진다(throw 없음).
 */
export function createRemoteRankingProvider(
  opts: RemoteRankingOptions,
): RemoteRankingProvider {
  const base = (opts.baseUrl || '').replace(/\/+$/, '');
  const doFetch = opts.fetchImpl || fetch;

  /** 인증 GET → JSON. 실패/무토큰/비-OK 는 null(호출자가 빈 결과로 처리). */
  async function authGet(path: string): Promise<any | null> {
    try {
      const token = await opts.getToken();
      if (!token) return null; // 로그인 안 됨 — 가짜 데이터 만들지 않음.
      const res = await doFetch(base + path, {
        headers: {Authorization: `Bearer ${token}`},
      });
      if (!res || !res.ok) return null;
      return await res.json();
    } catch {
      return null; // 네트워크/파싱 실패 — seam 계약상 throw 금지.
    }
  }

  return {
    async getLeaderboard(category, yearMonth): Promise<RemoteLeaderboard> {
      const q = yearMonth ? `?yearMonth=${encodeURIComponent(yearMonth)}` : '';
      const data = await authGet(
        `/api/v1/leaderboards/${encodeURIComponent(category)}${q}`,
      );
      if (!data || !Array.isArray(data.entries)) {
        return emptyLeaderboard(category, yearMonth);
      }
      const ym = str(data.yearMonth) || yearMonth;
      const entries = data.entries.map((r: any) => toEntry(r, category, ym));
      return {kind: 'remote', available: true, category, yearMonth: ym, entries};
    },

    async getMyRanking(category, yearMonth): Promise<RemoteMyRanking> {
      const q = yearMonth ? `?yearMonth=${encodeURIComponent(yearMonth)}` : '';
      const data = await authGet(
        `/api/v1/leaderboards/${encodeURIComponent(category)}/me${q}`,
      );
      if (!data) return emptyMyRanking(category, yearMonth);
      const ym = str(data.yearMonth) || yearMonth;
      const me = data.me ? toEntry(data.me, category, ym) : null;
      const nearby = Array.isArray(data.nearby)
        ? data.nearby.map((r: any) => toEntry(r, category, ym))
        : [];
      const topPercent =
        typeof data.topPercent === 'number' ? data.topPercent : null;
      return {
        kind: 'remote',
        available: data.available === true && me !== null,
        category,
        yearMonth: ym,
        total: num(data.total),
        topPercent,
        me,
        nearby,
      };
    },
  };
}
