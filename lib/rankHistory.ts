// ─── lib/rankHistory.ts — 내 최고 순위(전성기) ──────────────────────────────────
//
// *"내 전성기 땐 이 정도였다."* 민우님이 랭킹 얘기 중에 꺼낸 말이고, 랭킹이 **한 달짜리**
// 라는 약점을 정확히 짚는다. 이번 달 순위는 다음 달이면 사라진다. 그러면 잘 달린 달이
// 통째로 없던 일이 된다.
//
// ── 왜 로컬에 두나 ──────────────────────────────────────────────────────────
// 지난달 리더보드를 다시 읽으면 달마다 읽기가 붙는다(AUDIT 2 에서 43배 줄여 놓은 걸
// 되돌린다). 대신 **이미 읽은 내 순위를 지나가며 적어 둔다** — 읽기가 0이다.
//
// 대가는 정직하게 적는다: 재설치하면 이 기록은 사라지고 그 시점부터 다시 쌓인다.
// 서버에 두면 안 잃지만 그건 새 컬렉션 + 쓰기 + 규칙이고, **한 줄 표시치고는 비싸다.**
// 잃어도 러닝 기록은 멀쩡하다 — 이건 파생 표시값이지 원본이 아니다.
//
// ── 규칙 ────────────────────────────────────────────────────────────────────
//  · **더 좋을 때만 갈아 끼운다**(순위는 작을수록 좋다). 같으면 **처음 달성한 달**을 지킨다
//    — "언제 처음 그 자리에 갔나"가 전성기의 뜻이다.
//  · 순위를 모르면(0·음수·비정수) 아무 일도 안 한다. 없는 기록을 만들지 않는다.
//  · 카테고리별로 따로 센다. 거리 1위와 꾸준함 1위는 다른 이야기다.

/** 한 카테고리의 최고 기록. */
export interface RankBest {
  /** 최고 순위(작을수록 좋다). */
  rank: number;
  /** 그때가 언제였나 — 'YYYY-MM'. */
  yearMonth: string;
}

/** 카테고리 → 최고 기록. */
export type RankBests = Record<string, RankBest>;

export const RANK_HISTORY_KEY = 'rank_best_v1';

/** 'YYYY-MM' 인가. 아니면 기록하지 않는다(정렬·표시가 통째로 어긋난다). */
const validYm = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);

/**
 * 지금 순위를 반영한 새 기록을 돌려준다. **입력은 건드리지 않는다.**
 * 바뀐 게 없으면 **받은 객체를 그대로** 돌려준다 — 호출부가 동일성으로 저장 여부를 판단한다.
 */
export function recordRank(
  prev: RankBests | null | undefined,
  category: string,
  yearMonth: string,
  rank: number,
): RankBests {
  const base: RankBests = prev && typeof prev === 'object' ? prev : {};
  if (!category || !validYm(yearMonth)) return base;
  if (!Number.isInteger(rank) || rank <= 0) return base;

  const cur = base[category];
  // 같은 순위면 처음 달성한 달을 지킨다 — 다시 올라도 '전성기'는 그때다.
  if (cur && Number.isInteger(cur.rank) && cur.rank <= rank) return base;
  return {...base, [category]: {rank, yearMonth}};
}

/** 저장된 값에서 우리가 아는 모양만 남긴다(옛 저장·손상 대비). */
export function sanitizeRankBests(raw: unknown): RankBests {
  if (!raw || typeof raw !== 'object') return {};
  const out: RankBests = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const o = v as {rank?: unknown; yearMonth?: unknown};
    if (!k || !o || typeof o !== 'object') continue;
    if (!Number.isInteger(o.rank) || (o.rank as number) <= 0) continue;
    if (!validYm(o.yearMonth)) continue;
    out[k] = {rank: o.rank as number, yearMonth: o.yearMonth};
  }
  return out;
}

/** 'YYYY-MM' → '2026년 6월'. 형식이 아니면 원문을 돌려준다(지어내지 않는다). */
export function formatYearMonthKo(ym: string): string {
  if (!validYm(ym)) return String(ym ?? '');
  const [y, m] = ym.split('-');
  return `${y}년 ${Number(m)}월`;
}
