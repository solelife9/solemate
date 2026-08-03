// ─── lib/shoeTrends.ts — 랭킹 엔트리에서 신발 유행 뽑기 (순수) ──────────────────
//
// 「이번 달 많이 신는 러닝화」. keego 가 러닝화 앱이라 말하려면 언젠가는 답해야 하는
// 질문이다 — *"남들은 뭘 신지?"*
//
// ── 왜 여기서 계산하나(추가 읽기 0) ────────────────────────────────────────
// 랭킹 화면은 어차피 상위 엔트리를 읽고, 엔트리에는 **그달 주력 신발이 이미 실려 있다**
// (firestoreRanking.EntryShoe — 2026-08-01 「1,2,3위는 뭘 신나」 때 넣었다).
// 그걸 세기만 하면 되므로 서버 집계도, 새 컬렉션도, 읽기 한 건도 필요 없다.
//
// 크라우드소스 통계를 제대로 하려면 Cloud Functions 로 프로필 변경마다 카운터를 올리는
// 게 정석이다. 하지만 그건 배포가 필요하고, **지금 공짜로 얻을 수 있는 답이 이미 있다.**
// 표본이 상위 러너로 치우친다는 한계는 화면이 그대로 밝힌다(§ 아래 sampleSize).
//
// ── 정직 규칙 ────────────────────────────────────────────────────────────────
//  · 표본이 적으면 **아예 만들지 않는다.** 3명이 신는 걸 "유행"이라 부르면 거짓말이다.
//  · 한 사람이 같은 모델을 두 켤레 갖고 있어도 **1명으로 센다.** 안 그러면 신발 부자
//    한 명이 순위를 흔든다. 세는 건 켤레가 아니라 **사람**이다.
//  · 표본 수를 함께 돌려준다 — 화면이 "N명 기준"이라고 말할 수 있어야 한다.
import type {EntryShoe} from './progression/firestoreRanking';

/** 유행 한 줄. */
export interface ShoeTrend {
  brand: string;
  model: string;
  /** 이 신발을 신는 **사람** 수(켤레가 아니다). */
  runners: number;
  /** 표본 안에서의 비율 0~1. 화면이 %로 쓴다. */
  share: number;
  /** 이 신발의 평균 누적 거리(km). 아는 값이 없으면 null — 지어내지 않는다. */
  avgKm: number | null;
}

export interface ShoeTrendResult {
  /** 많이 신는 순. 동률이면 이름순(같은 입력이면 항상 같은 순서). */
  top: ShoeTrend[];
  /** 신발을 하나라도 실어 보낸 **사람** 수. "N명 기준"의 N. */
  sampleSize: number;
}

/**
 * 표본이 이보다 적으면 유행을 말하지 않는다.
 *
 * 앱 초기엔 사용자가 몇 명뿐이라 "1명이 신는 신발 1위"가 나온다. 그건 정보가 아니라
 * 잡음이고, 한 번 그렇게 보여주면 이 카드의 신뢰가 통째로 깎인다. 민우님이 "초라해도
 * 그냥 만들자"고 한 건 **랭킹**이었다 — 순위는 한 명이어도 참이지만, 유행은 아니다.
 */
export const MIN_TREND_SAMPLE = 8;

/** 같은 신발로 볼지 판정하는 키(대소문자·여백 무시). */
const key = (s: {brand: string; model: string}) =>
  `${String(s.brand ?? '').trim().toLowerCase()}|${String(s.model ?? '').trim().toLowerCase()}`;

/**
 * 엔트리 목록 → 신발 유행.
 *
 * 표본이 모자라면 `top` 이 빈 배열이다(sampleSize 는 그대로 돌려준다 — 화면이 "아직
 * 모으는 중"이라고 말할 수 있게).
 */
export function shoeTrends(
  entries: readonly {shoes?: readonly EntryShoe[]}[] | null | undefined,
  limit = 5,
): ShoeTrendResult {
  const rows = Array.isArray(entries) ? entries : [];
  const agg = new Map<string, {brand: string; model: string; runners: number; kmSum: number; kmN: number}>();
  let sampleSize = 0;

  for (const e of rows) {
    const shoes = Array.isArray(e?.shoes) ? e.shoes : [];
    // 한 사람 안에서 같은 모델은 한 번만 — 세는 건 켤레가 아니라 사람이다.
    const seen = new Set<string>();
    let counted = false;
    for (const sh of shoes) {
      const b = String(sh?.brand ?? '').trim();
      const m = String(sh?.model ?? '').trim();
      if (!b && !m) continue;
      const k = key({brand: b, model: m});
      if (seen.has(k)) continue;
      seen.add(k);
      counted = true;
      const cur = agg.get(k) ?? {brand: b, model: m, runners: 0, kmSum: 0, kmN: 0};
      cur.runners += 1;
      const km = Number(sh?.usedKm);
      if (Number.isFinite(km) && km > 0) { cur.kmSum += km; cur.kmN += 1; }
      agg.set(k, cur);
    }
    if (counted) sampleSize += 1;
  }

  if (sampleSize < MIN_TREND_SAMPLE) return {top: [], sampleSize};

  const top = [...agg.values()]
    .map(v => ({
      brand: v.brand,
      model: v.model,
      runners: v.runners,
      share: v.runners / sampleSize,
      avgKm: v.kmN > 0 ? Math.round(v.kmSum / v.kmN) : null,
    }))
    // 많이 신는 순 → 동률이면 이름순. 같은 입력이면 항상 같은 순서여야 한다.
    .sort((a, b) => b.runners - a.runners
      || `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`))
    .slice(0, Math.max(0, limit));

  return {top, sampleSize};
}
