// ============================================================================
// lib/progression/index.ts — 진척 공개 셀렉터(엔진 합성) (Slice A)
// ============================================================================
// UI 가 호출하는 **단일 진입점**. 런/신발/영속 상태(progression_v1)를 받아 컨텍스트를
// **한 번** 집계하고, 그 위에서 랭크(rank)·타이틀(titles)·업적(achievements)·포인트(points)
// 를 합성해 화면이 그대로 그릴 수 있는 뷰(ProgressionView)로 돌려준다. 평가축/기준/카탈로그
// 의 권위는 각 엔진 모듈(rank·titles·achievements·points)에 있고, 여기선 **조립만** 한다
// (로직 중복 정의 금지).
//
// 멱등 언락 알림(detectNewUnlocks): 이미 알린(seen) 키를 제외하고 **새로** 충족된 키만
// 돌려주고, 다음 seen 집합을 함께 반환한다 → 알림은 한 번만 뜨고, 재계산해도 다시 뜨지
// 않는다(anti-scenario 8: 중복 언락 스팸 금지). 알림 발사 여부의 권위 상태는 호출자가
// 영속하는 seenUnlocks 한곳 뿐(파생값은 저장하지 않는다).
//
// PURE/방어적: 입력 불변, 비배열/null/누락 안전, 어떤 입력에서도 throw 금지. now 는 호출자가
// 주입(시간 기반 타이틀의 결정성) — UI 편의를 위해 기본값 Date.now() 만 호출 경계에서 쓴다.
// memoized: 동일 입력(runs/shoes/state/now 참조 동일)이면 직전 결과를 그대로 돌려준다
// (UI 가 리렌더마다 호출해도 엔진을 재실행하지 않음).
// ============================================================================
import {
  ACHIEVEMENTS,
  achievementProgress,
  evaluateAchievements,
} from './achievements';
import {buildContext} from './context';
import {totalPoints} from './points';
import {computeRank} from './rank';
import {evaluateTitles, TITLES} from './titles';
import {
  AchievementProgress,
  ContextChallengeInput,
  ProgressionContext,
  ProgressionState,
  RankResult,
  RankTier,
  TitleCategory,
} from './types';

// ── 뷰 모양(화면이 직접 소비) ──────────────────────────────────────────────────

/** 갤러리 한 칸(타이틀). 잠금/해제 상태와 표시 메타를 함께 담는다. */
export interface TitleView {
  key: string;
  name: string;
  category: TitleCategory;
  tier: RankTier;
  hidden: boolean;
  unlocked: boolean;
}

/** 업적 한 칸. 항상 진행률(current/target)을 노출(미달성도 표시). */
export interface AchievementView {
  key: string;
  name: string;
  category: TitleCategory;
  rarity: RankTier;
  points: number;
  progress: AchievementProgress;
  unlocked: boolean;
}

/** getProgression 산출 — 랭크·타이틀(해제/잠금/장착)·업적·총 포인트. */
export interface ProgressionView {
  rank: RankResult;
  titles: {
    /** 충족(획득)된 타이틀(hidden 포함 — 달성 순간 공개). */
    unlocked: TitleView[];
    /** 미충족 타이틀(아직 숨긴 hidden 은 제외 — 달성 전 비노출). */
    locked: TitleView[];
    /** 현재 장착한 타이틀 키(사용자 선택, 없으면 null). */
    equipped: string | null;
  };
  achievements: AchievementView[];
  /** 언락된 업적 포인트 총합(파생 — 카탈로그 권위 합). */
  points: number;
}

// ── 입력 방어 ──────────────────────────────────────────────────────────────────

/** 문자열만 통과(빈 값/비문자 제거). */
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && !!x);
}

/** 중복 제거하며 순서 보존. */
function uniq(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

// ── 합성(컨텍스트 1회 → 랭크/타이틀/업적/포인트) ───────────────────────────────

/** 한 컨텍스트로부터 전체 뷰를 합성한다(엔진 조립). */
function viewFromContext(
  ctx: ProgressionContext,
  state: ProgressionState,
): ProgressionView {
  const rank = computeRank(ctx);

  const unlockedTitleKeys = new Set(evaluateTitles(ctx));
  const unlockedTitles: TitleView[] = [];
  const lockedTitles: TitleView[] = [];
  for (const def of TITLES) {
    const unlocked = unlockedTitleKeys.has(def.key);
    const view: TitleView = {
      key: def.key,
      name: def.name,
      category: def.category,
      tier: def.tier,
      hidden: def.hidden === true,
      unlocked,
    };
    if (unlocked) unlockedTitles.push(view);
    // hidden 타이틀은 미달성 시 갤러리에서 숨긴다(달성 순간 unlocked 로 공개).
    else if (!view.hidden) lockedTitles.push(view);
  }

  const unlockedAchKeys = new Set(evaluateAchievements(ctx));
  const achievements: AchievementView[] = ACHIEVEMENTS.map(def => ({
    key: def.key,
    name: def.name,
    category: def.category,
    rarity: def.rarity,
    points: def.points,
    progress: achievementProgress(def, ctx),
    unlocked: unlockedAchKeys.has(def.key),
  }));

  const points = totalPoints(
    ACHIEVEMENTS.filter(d => unlockedAchKeys.has(d.key)),
  );

  return {
    rank,
    titles: {
      unlocked: unlockedTitles,
      locked: lockedTitles,
      equipped:
        state && typeof state.equippedTitleKey === 'string'
          ? state.equippedTitleKey
          : null,
    },
    achievements,
    points,
  };
}

// ── 메모이즈(직전 입력 1슬롯 — 참조 동등 비교) ─────────────────────────────────
let memoKey: {
  runs: unknown;
  shoes: unknown;
  state: unknown;
  now: number;
} | null = null;
let memoVal: ProgressionView | null = null;

/**
 * 공개 셀렉터 — 런·신발·영속 상태로부터 전체 진척 뷰를 만든다(컨텍스트 1회 집계).
 *
 * @param runs   서버/상태 런 행(비배열/null 안전).
 * @param shoes  서버/상태 신발 행(비배열/null 안전).
 * @param state  영속 진척 상태(progression_v1) — 장착 타이틀/획득 타이틀 등.
 * @param now    기준 시각(epoch ms). 미지정 시 Date.now()(시간 기반 타이틀 결정성).
 * @param challenges 완료 챌린지(engagement 평가축) — 선택.
 */
export function getProgression(
  runs: readonly BackendRun[] | null | undefined,
  shoes: readonly BackendShoe[] | null | undefined,
  state: ProgressionState | null | undefined,
  now: number = Date.now(),
  challenges?: readonly ContextChallengeInput[] | null,
): ProgressionView {
  const safeState = state ?? {
    earnedTitles: [],
    equippedTitleKey: null,
    seenUnlocks: [],
    retiredShoes: [],
    points: 0,
  };

  if (
    memoVal &&
    memoKey &&
    memoKey.runs === runs &&
    memoKey.shoes === shoes &&
    memoKey.state === state &&
    memoKey.now === now
  ) {
    return memoVal;
  }

  const ctx = buildContext(
    runs,
    shoes,
    safeState.earnedTitles,
    challenges,
    now,
  );
  const view = viewFromContext(ctx, safeState);

  memoKey = {runs, shoes, state, now};
  memoVal = view;
  return view;
}

// ── 멱등 언락 알림 ──────────────────────────────────────────────────────────────

/** detectNewUnlocks 산출 — 이번에 새로 뜰 키 + 다음 seen 집합. */
export interface UnlockNotice {
  /** 이전에 알리지 않은(새로 충족된) 키. 알림은 이 키들만 한 번 발사. */
  newlyUnlocked: string[];
  /** 다음 영속할 seen 집합(prevSeen ∪ newlyUnlocked) — 재호출 시 멱등. */
  nextSeen: string[];
}

/**
 * 멱등 언락 알림 diff. **이미 알린(prevSeen)** 키를 제외하고 지금 충족된(currentlyUnlocked)
 * 키 중 새 것만 돌려준다. nextSeen 을 영속하면 같은 입력으로 재계산해도 newlyUnlocked 는
 * 비어, 알림이 다시 뜨지 않는다(anti-scenario 8). PURE: 입력 배열 불변, throw 금지.
 *
 * @param prevSeen          이미 알린 키들(progression_v1.seenUnlocks).
 * @param currentlyUnlocked 지금 충족된 키들(타이틀+업적 합집합 등).
 */
export function detectNewUnlocks(
  prevSeen: readonly string[] | null | undefined,
  currentlyUnlocked: readonly string[] | null | undefined,
): UnlockNotice {
  const seen = new Set(asStringArray(prevSeen));
  const current = uniq(asStringArray(currentlyUnlocked));
  const newlyUnlocked = current.filter(k => !seen.has(k));
  // prevSeen 의 옛 키도 보존(한 번 알린 건 영영 알린 것) + 새 키 추가.
  const nextSeen = uniq([...asStringArray(prevSeen), ...newlyUnlocked]);
  return {newlyUnlocked, nextSeen};
}

/**
 * 뷰로부터 알림 후보 키(충족된 타이틀 + 업적)를 모은다 — detectNewUnlocks 입력용.
 * 결정적 순서(타이틀 먼저, 그다음 업적), 중복 제거.
 */
export function collectUnlockedKeys(view: ProgressionView | null | undefined): string[] {
  if (!view || typeof view !== 'object') return [];
  const titleKeys = Array.isArray(view.titles?.unlocked)
    ? view.titles.unlocked.map(t => t.key)
    : [];
  const achKeys = Array.isArray(view.achievements)
    ? view.achievements.filter(a => a.unlocked).map(a => a.key)
    : [];
  return uniq([...titleKeys, ...achKeys]);
}
