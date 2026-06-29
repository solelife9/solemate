// ============================================================================
// lib/progression/index.ts — 진척 공개 셀렉터(엔진 합성) (재설계)
// ============================================================================
// UI 가 호출하는 단일 진입점. 런/신발/영속 상태(progression_v1)를 받아 컨텍스트를
// 한 번 집계하고, 그 위에서 랭크·업적·포인트를 합성해 화면이 그릴 수 있는 뷰로 반환.
//
// 타이틀 시스템: 폐지됐지만 App.tsx 역호환을 위해 titles 블록은 유지(항상 equipped=null).
// 새 코드는 titles 블록을 읽지 않는다.
//
// PURE/방어적: 입력 불변, 비배열/null/누락 안전, throw 금지.
// memoized: 동일 입력(참조 동등)이면 직전 결과를 그대로 반환.
// ============================================================================
import {
  ACHIEVEMENTS,
  achievementProgress,
  earnedXpFor,
  evaluateAchievements,
} from './achievements';
import {buildContext} from './context';
import {computeRank} from './rank';
import {evaluateTitles, TITLES} from './titles';
import {
  AchievementCategory,
  AchievementProgress,
  AchievementRarity,
  ContextChallengeInput,
  ProgressionContext,
  ProgressionState,
  RankResult,
  RankTier,
  TitleCategory,
} from './types';

// ── 뷰 모양(화면이 직접 소비) ─────────────────────────────────────────────────

/** @deprecated 타이틀 폐지. App.tsx 역호환 전용. */
export interface TitleView {
  key: string;
  name: string;
  category: TitleCategory;
  tier: RankTier;
  hidden: boolean;
  unlocked: boolean;
}

/** 업적 한 칸. 화면이 직접 렌더링. */
export interface AchievementView {
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  /** 기본 XP(1회). 반복형은 earnedXp 가 실제 총 XP. */
  xp: number;
  /** 실제 적립된 XP(반복형은 xp × earnedCount). */
  earnedXp: number;
  /** 반복 적립 횟수(일반형은 unlocked ? 1 : 0). */
  earnedCount: number;
  /** 신발 켤레마다 반복 적립되는 업적 여부. */
  repeatablePerShoe: boolean;
  signature: boolean;
  hidden: boolean;
  progress: AchievementProgress;
  unlocked: boolean;
}

/** getProgression 산출. */
export interface ProgressionView {
  rank: RankResult;
  achievements: AchievementView[];
  /** 총 적립 XP(= rank.xp). */
  totalXp: number;
  /** @deprecated App.tsx 역호환. titles.equipped 은 항상 null. */
  titles: {
    unlocked: TitleView[];
    locked: TitleView[];
    equipped: string | null;
  };
  /** backward-compat: = totalXp. */
  points: number;
}

// ── 입력 방어 ─────────────────────────────────────────────────────────────────

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && !!x);
}

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

// ── 합성 ──────────────────────────────────────────────────────────────────────

function viewFromContext(
  ctx: ProgressionContext,
  _state: ProgressionState,
): ProgressionView {
  const rank = computeRank(ctx);
  const totalXp = rank.xp;

  // 업적 뷰 생성
  const unlockedAchKeys = new Set(evaluateAchievements(ctx));
  const achievements: AchievementView[] = ACHIEVEMENTS.filter(
    def => !def.hidden || unlockedAchKeys.has(def.key),
  ).map(def => {
    const isUnlocked = unlockedAchKeys.has(def.key);
    const earnedXp = earnedXpFor(def, ctx);
    const earnedCount = def.repeatablePerShoe && def.earnedCount
      ? def.earnedCount(ctx)
      : (isUnlocked ? 1 : 0);
    return {
      key: def.key,
      name: def.name,
      description: def.description,
      category: def.category,
      rarity: def.rarity,
      xp: def.xp,
      earnedXp,
      earnedCount,
      repeatablePerShoe: def.repeatablePerShoe === true,
      signature: def.signature === true,
      hidden: def.hidden === true,
      progress: achievementProgress(def, ctx),
      unlocked: isUnlocked,
    };
  });

  // 타이틀(역호환 — 폐지됐지만 블록은 유지. equipped 항상 null).
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
    else if (!view.hidden) lockedTitles.push(view);
  }

  return {
    rank,
    achievements,
    totalXp,
    titles: {
      unlocked: unlockedTitles,
      locked: lockedTitles,
      equipped: null, // 타이틀 장착 폐지
    },
    points: totalXp, // backward-compat
  };
}

// ── 메모이즈 ──────────────────────────────────────────────────────────────────
let memoKey: {
  runs: unknown;
  shoes: unknown;
  state: unknown;
  challenges: unknown;
  now: number | undefined;
} | null = null;
let memoVal: ProgressionView | null = null;

export function getProgression(
  runs: readonly BackendRun[] | null | undefined,
  shoes: readonly BackendShoe[] | null | undefined,
  state: ProgressionState | null | undefined,
  now?: number,
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
    memoKey.challenges === challenges &&
    memoKey.now === now
  ) {
    return memoVal;
  }

  const resolvedNow = now ?? Date.now();
  const ctx = buildContext(
    runs,
    shoes,
    safeState.earnedTitles,
    challenges,
    resolvedNow,
    safeState.retiredShoes,
  );
  const view = viewFromContext(ctx, safeState);

  memoKey = {runs, shoes, state, challenges, now};
  memoVal = view;
  return view;
}

// ── 멱등 언락 알림 ────────────────────────────────────────────────────────────

export interface UnlockNotice {
  newlyUnlocked: string[];
  nextSeen: string[];
}

export function detectNewUnlocks(
  prevSeen: readonly string[] | null | undefined,
  currentlyUnlocked: readonly string[] | null | undefined,
): UnlockNotice {
  const seen = new Set(asStringArray(prevSeen));
  const current = uniq(asStringArray(currentlyUnlocked));
  const newlyUnlocked = current.filter(k => !seen.has(k));
  const nextSeen = uniq([...asStringArray(prevSeen), ...newlyUnlocked]);
  return {newlyUnlocked, nextSeen};
}

/**
 * 뷰로부터 알림 후보 키(충족된 업적)를 모은다 — detectNewUnlocks 입력용.
 * 타이틀 키는 더 이상 포함하지 않는다(타이틀 폐지).
 */
export function collectUnlockedKeys(view: ProgressionView | null | undefined): string[] {
  if (!view || typeof view !== 'object') return [];
  const achKeys = Array.isArray(view.achievements)
    ? view.achievements.filter(a => a.unlocked).map(a => a.key)
    : [];
  return uniq(achKeys);
}

/**
 * 홈 "최근 달성" 업적 선택 — seenUnlocks 역순 훑어 최근 달성 업적 반환.
 * 폴백: earnedXp 최고 → 없으면 아무 달성 업적.
 */
export function pickRecentAchievement(
  view: ProgressionView | null | undefined,
  seenUnlocks: readonly string[] | null | undefined,
): AchievementView | null {
  if (!view || typeof view !== 'object' || !Array.isArray(view.achievements)) return null;
  const unlocked = view.achievements.filter(a => a && a.unlocked);
  if (unlocked.length === 0) return null;
  const byKey = new Map(unlocked.map(a => [a.key, a]));
  const seen = asStringArray(seenUnlocks);
  for (let i = seen.length - 1; i >= 0; i--) {
    const hit = byKey.get(seen[i]);
    if (hit) return hit;
  }
  let top = unlocked[0];
  for (const a of unlocked) if (a.earnedXp > top.earnedXp) top = a;
  return top;
}
