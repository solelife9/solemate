// ============================================================================
// ProgressionScreen.rn.tsx — 진척(랭크·업적) 화면 (재설계)
// ============================================================================
// XP 기반 랭크 + 6카테고리 업적 시스템. 타이틀 시스템 폐지.
//
// 레이아웃:
//   · 히어로 — 티어 칩 + 닉네임 + 총 XP + 업적 달성 수
//   · XP 진행 카드 — 현재 XP바 + 다음 티어까지 필요 XP
//   · 스탯 줄 — 총 거리 / 등록 신발 / 은퇴 신발 / 현재 스트릭
//   · 탭: 업적 | 챌린지
//   · 업적 탭 — 6카테고리, 달성/미달성, rarity 칩, XP 표시
//   · 챌린지 탭 — Slice C 카드 재사용
//
// 토큰만(theme.ts) — 색/폰트/간격/반경 하드코딩 0.
// ============================================================================
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG,
  CARD,
  CARD_HI,
  HERO_BG,
  ACCENT,
  T1,
  T2,
  T3,
  CARD_BORDER,
  FONT,
  DISPLAY,
  SPACE,
  RADIUS,
  TYPE,
  TIER_COLORS,
  TIER_LABEL,
  withAlpha,
} from './theme';
import {StatGrid} from './primitives';
import {buildContext} from './lib/progression/context';
import {
  getProgression,
  detectNewUnlocks,
  collectUnlockedKeys,
  type ProgressionView,
  type AchievementView,
} from './lib/progression';
import {rankGuidance} from './lib/progression/guidance';
import {
  defaultProgressionState,
  loadProgression,
  saveProgression,
} from './lib/progression/storage';
import type {
  AchievementCategory,
  AchievementRarity,
  ProgressionState,
} from './lib/progression/types';

// ── 업적 카테고리 메타(프레젠테이션 전용) ────────────────────────────────────────
const ACH_CATEGORY_META: Record<AchievementCategory, {label: string; icon: string}> = {
  runningMilestone: {label: '러닝 이정표', icon: 'walk'},
  distanceMilestone: {label: '누적 거리', icon: 'trending-up'},
  shoeJourney: {label: '신발 여정', icon: 'ribbon'},
  shoeMemory: {label: '신발과 동행', icon: 'heart'},
  experience: {label: '특별 경험', icon: 'sparkles'},
  keego: {label: 'Keep Going', icon: 'infinite'},
};

const ACH_CATEGORY_ORDER: AchievementCategory[] = [
  'runningMilestone',
  'distanceMilestone',
  'shoeJourney',
  'shoeMemory',
  'experience',
  'keego',
];

// ── 희귀도 색/라벨(AchievementRarity) ──────────────────────────────────────────
const RARITY_COLOR: Record<AchievementRarity, string> = {
  common: '#9C9CA3',   // muted gray
  rare: '#3B82F6',     // blue
  epic: '#9333EA',     // purple
  legendary: '#FF6500', // Keego orange (ACCENT)
};

const RARITY_LABEL: Record<AchievementRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export interface ProgressionScreenProps {
  runs?: readonly BackendRun[] | null;
  shoes?: readonly BackendShoe[] | null;
  profileName?: string;
  now?: number;
  initialState?: ProgressionState;
  onBack?: () => void;
  onOpenHallOfFame?: () => void;
}

export default function ProgressionScreen({
  runs = [],
  shoes = [],
  profileName = '러너',
  now,
  initialState,
  onBack,
  onOpenHallOfFame,
}: ProgressionScreenProps) {
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<ProgressionState>(
    initialState ?? defaultProgressionState(),
  );
  const [loaded, setLoaded] = useState<boolean>(initialState != null);
  useEffect(() => {
    if (initialState) return;
    let alive = true;
    loadProgression().then(s => {
      if (alive) {
        setState(s);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [initialState]);

  const nowRef = useRef<number>(now ?? Date.now());
  const resolvedNow = now ?? nowRef.current;

  const view: ProgressionView = getProgression(runs, shoes, state, resolvedNow);

  const ctx = useMemo(
    () =>
      buildContext(
        runs,
        shoes,
        state.earnedTitles,
        null,
        resolvedNow,
        state.retiredShoes,
      ),
    [runs, shoes, state.earnedTitles, state.retiredShoes, resolvedNow],
  );

  // 키 → 표시명(언락 배너용)
  const nameByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of view.achievements) m[a.key] = a.name;
    return m;
  }, [view]);

  // 언락 배너(멱등)
  const unlockedKeys = useMemo(() => collectUnlockedKeys(view), [view]);
  const unlockedSig = unlockedKeys.join('|');
  const [banner, setBanner] = useState<string[] | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return undefined;
    const notice = detectNewUnlocks(state.seenUnlocks, unlockedKeys);
    if (notice.newlyUnlocked.length === 0) return undefined;
    setBanner(notice.newlyUnlocked);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 3500);
    const next: ProgressionState = {...state, seenUnlocks: notice.nextSeen};
    setState(next);
    void saveProgression(next);
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedSig, loaded]);

  const rankColor = view.rank.color;
  const guide = useMemo(() => rankGuidance(view.rank), [view.rank]);

  const achievementCount = view.achievements.filter(a => a.unlocked).length;
  const bannerNames = banner
    ? banner.map(k => nameByKey[k] ?? k).join(', ')
    : '';

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 28,
          gap: SPACE.lg,
        }}>
        {/* header */}
        <View style={s.headerRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              testID="progression-back"
              accessibilityRole="button"
              accessibilityLabel="뒤로"
              style={({pressed}) => [s.iconBtn, pressed && {backgroundColor: CARD}]}>
              <Ionicons name="chevron-back" size={20} color={T2} />
            </Pressable>
          ) : (
            <View style={{width: 38}} />
          )}
          <Text style={s.title}>진척</Text>
          {onOpenHallOfFame ? (
            <Pressable
              onPress={onOpenHallOfFame}
              testID="open-hall-of-fame"
              accessibilityRole="button"
              accessibilityLabel="랭킹"
              style={({pressed}) => [s.iconBtn, pressed && {backgroundColor: CARD}]}>
              <Ionicons name="trophy" size={19} color={ACCENT} />
            </Pressable>
          ) : (
            <View style={{width: 38}} />
          )}
        </View>

        {/* 언락 배너 */}
        {banner && banner.length > 0 ? (
          <View
            style={[s.banner, {borderColor: withAlpha(ACCENT, 0.45)}]}
            testID="unlock-banner"
            accessible
            accessibilityLabel={`새로 해제: ${bannerNames}`}>
            <Ionicons name="sparkles" size={16} color={ACCENT} />
            <Text style={s.bannerTxt} numberOfLines={2}>
              업적 달성 ·{' '}
              <Text style={{color: T1, fontWeight: '700'}}>{bannerNames}</Text>
            </Text>
          </View>
        ) : null}

        {/* 히어로 */}
        <View style={s.hero} testID="rank-hero">
          <View
            testID="rank-chip"
            style={[
              s.rankChip,
              {
                backgroundColor: withAlpha(rankColor, 0.16),
                borderColor: withAlpha(rankColor, 0.5),
              },
            ]}>
            <Text style={[s.rankChipTxt, {color: rankColor}]}>
              {TIER_LABEL[view.rank.tier]}
            </Text>
          </View>
          <Text style={s.nick} numberOfLines={1} testID="progression-nick">
            {profileName}
          </Text>
          <Text style={s.heroSub} testID="progression-xp">
            {view.rank.xp.toLocaleString()} XP · 업적 {achievementCount}개 달성
          </Text>
        </View>

        {/* XP 진행 카드 */}
        <View style={s.guide} testID="rank-guide">
          <Text style={s.guideTitle}>랭크 진행</Text>
          <View style={s.xpRow}>
            <Text style={[s.xpNum, {color: rankColor}]}>
              {guide.xp.toLocaleString()}
            </Text>
            <Text style={s.xpUnit}> XP</Text>
          </View>

          {guide.nextTier ? (
            <>
              <View style={s.nextRow} testID="rank-next">
                <Text style={[s.nextTierTxt, {color: rankColor}]}>
                  {TIER_LABEL[guide.tier]}
                </Text>
                <View style={s.nextTrack}>
                  <View
                    style={[
                      s.nextFill,
                      {
                        width: `${Math.round(guide.progressToNext * 100)}%`,
                        backgroundColor: rankColor,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[s.nextTierTxt, {color: TIER_COLORS[guide.nextTier]}]}>
                  {TIER_LABEL[guide.nextTier]}
                </Text>
              </View>
              <Text style={s.xpForNext}>
                다음 티어까지{' '}
                <Text style={{color: T1, fontWeight: '700'}}>
                  {guide.xpForNext.toLocaleString()} XP
                </Text>{' '}
                더 필요해요
              </Text>
            </>
          ) : (
            <Text style={[s.maxTier, {color: rankColor}]} testID="rank-max">
              최고 등급 달성 🌟
            </Text>
          )}
        </View>

        {/* 스탯 줄 */}
        <StatGrid
          testID="stat-row"
          style={s.statCard}
          divider
          valueSize={19}
          valueWeight="800"
          valueLS={-0.4}
          unitSize={11}
          unitWeight="700"
          labelSize={11}
          labelWeight="600"
          labelMarginTop={5}
          items={[
            {value: Math.round(ctx.cumulativeKm).toLocaleString(), unit: 'km', label: '총 거리'},
            {value: String(ctx.registeredShoeCount), unit: '켤레', label: '등록 신발'},
            {value: String(ctx.retiredShoeCount), unit: '켤레', label: '은퇴 신발'},
            {value: String(ctx.currentStreak), unit: '일', label: '현재 스트릭'},
          ]}
        />

        {/* 업적 — 챌린지 탭은 마이 탭의 스마트 챌린지 카드로 이관됨(진척은 업적 전용). */}
        <View style={{gap: SPACE.lg}}>
          {ACH_CATEGORY_ORDER.map(cat => {
            const items = view.achievements.filter(a => a.category === cat);
            if (items.length === 0) return null;
            const done = items.filter(a => a.unlocked).length;
            const meta = ACH_CATEGORY_META[cat];
            return (
              <View key={cat} style={{gap: SPACE.sm}}>
                <View style={s.catHeader}>
                  <Ionicons name={meta.icon as any} size={14} color={T3} />
                  <Text style={s.groupLabel}>{meta.label}</Text>
                  <Text style={s.groupCount}>{done}/{items.length}</Text>
                </View>
                {items.map(a => (
                  <AchievementCard key={a.key} a={a} />
                ))}
              </View>
            );
          })}

          {/* 총 XP 합산 */}
          <View
            style={[s.xpTotal, {borderColor: withAlpha(ACCENT, 0.35)}]}
            testID="progression-points">
            <Text style={s.xpTotalLabel}>총 획득 XP</Text>
            <Text style={s.xpTotalNum}>{view.totalXp.toLocaleString()} XP</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── 업적 카드 컴포넌트 ─────────────────────────────────────────────────────────
function AchievementCard({a}: {a: AchievementView}) {
  const aColor = RARITY_COLOR[a.rarity];
  const ratio =
    a.progress.target > 0
      ? Math.max(0, Math.min(1, a.progress.current / a.progress.target))
      : a.unlocked
      ? 1
      : 0;

  const xpLabel = a.repeatablePerShoe
    ? a.unlocked
      ? `${a.xp} × ${a.earnedCount}켤레 = ${a.earnedXp} XP`
      : `켤레당 +${a.xp} XP`
    : `+${a.xp} XP`;

  return (
    <View
      style={[s.ach, a.unlocked && {borderColor: withAlpha(aColor, 0.3)}]}
      testID={`ach-${a.key}`}>
      <View style={s.achTop}>
        <View style={s.achNameRow}>
          {a.unlocked ? (
            <Ionicons name="checkmark-circle" size={14} color={aColor} />
          ) : a.signature ? (
            <Ionicons name="star" size={14} color={T3} />
          ) : null}
          <Text style={[s.achName, a.unlocked && {color: T1}]} numberOfLines={1}>
            {a.name}
          </Text>
        </View>
        <View style={[s.rar, {backgroundColor: withAlpha(aColor, 0.14)}]}>
          <Text style={[s.rarTxt, {color: aColor}]}>
            {RARITY_LABEL[a.rarity]}
          </Text>
        </View>
      </View>

      {a.description ? (
        <Text style={s.achDesc} numberOfLines={2}>{a.description}</Text>
      ) : null}

      <View style={s.achFooter}>
        <Text style={s.achProgTxt} testID={`ach-progress-${a.key}`}>
          {a.progress.current.toLocaleString()} / {a.progress.target.toLocaleString()}
        </Text>
        <Text style={[s.xpChip, {color: a.unlocked ? aColor : T3}]}>
          {xpLabel}
        </Text>
      </View>

      <View style={s.track}>
        <View
          testID={`ach-fill-${a.key}`}
          style={[
            s.fill,
            {width: `${Math.round(ratio * 100)}%`, backgroundColor: aColor},
          ]}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: TYPE.title.fontSize,
    fontWeight: '700',
    letterSpacing: TYPE.title.letterSpacing,
  },
  // 배너
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: withAlpha(ACCENT, 0.1),
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: 11,
  },
  bannerTxt: {flex: 1, color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '600'},
  // 히어로
  hero: {
    backgroundColor: HERO_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: RADIUS.xl,
    padding: SPACE.xl,
    gap: SPACE.xs,
  },
  rankChip: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  rankChipTxt: {fontFamily: FONT, fontSize: 13, fontWeight: '800', letterSpacing: 0.2},
  nick: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 8,
  },
  heroSub: {fontFamily: FONT, color: T3, fontSize: 13, fontWeight: '600'},
  // XP 진행 카드
  guide: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    gap: SPACE.sm,
  },
  guideTitle: {fontFamily: DISPLAY, color: T1, fontSize: 15, fontWeight: '800', letterSpacing: -0.2},
  xpRow: {flexDirection: 'row', alignItems: 'baseline', gap: 0},
  xpNum: {fontFamily: DISPLAY, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums']},
  xpUnit: {fontFamily: FONT, color: T3, fontSize: 14, fontWeight: '600'},
  nextRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  nextTierTxt: {fontFamily: FONT, fontSize: 12, fontWeight: '800', letterSpacing: 0.2},
  nextTrack: {
    flex: 1,
    height: 6,
    backgroundColor: CARD_HI,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  nextFill: {height: '100%', borderRadius: RADIUS.pill},
  maxTier: {fontFamily: FONT, fontSize: 13, fontWeight: '800'},
  xpForNext: {fontFamily: FONT, color: T3, fontSize: 12, fontWeight: '600'},
  // 스탯 카드
  statCard: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
  },
  // 카테고리 헤더
  catHeader: {flexDirection: 'row', alignItems: 'center', gap: 6},
  groupLabel: {flex: 1, fontFamily: FONT, color: T2, fontSize: 13, fontWeight: '700'},
  groupCount: {fontFamily: FONT, color: T3, fontSize: 11, fontWeight: '700'},
  // 업적 카드
  ach: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: RADIUS.sm,
    padding: 14,
    gap: SPACE.sm,
  },
  achTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  achNameRow: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6},
  achName: {flex: 1, fontFamily: FONT, color: T2, fontSize: 14, fontWeight: '700'},
  achDesc: {fontFamily: FONT, color: T3, fontSize: 12, lineHeight: 17},
  rar: {borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3},
  rarTxt: {fontFamily: FONT, fontSize: 9, fontWeight: '800', letterSpacing: 0.4},
  achFooter: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  achProgTxt: {
    fontFamily: FONT,
    color: T3,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  xpChip: {fontFamily: FONT, fontSize: 11, fontWeight: '700'},
  track: {height: 5, backgroundColor: CARD_HI, borderRadius: RADIUS.pill, overflow: 'hidden'},
  fill: {height: '100%', borderRadius: RADIUS.pill},
  // 총 XP
  xpTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: 17,
    paddingVertical: 15,
    marginTop: SPACE.xs,
  },
  xpTotalLabel: {fontFamily: FONT, color: T2, fontSize: 12, fontWeight: '700'},
  xpTotalNum: {
    fontFamily: DISPLAY,
    color: ACCENT,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  // 챌린지 빈 상태
  empty: {alignItems: 'center', gap: 8, paddingVertical: 36},
  emptyTxt: {fontFamily: FONT, color: T3, fontSize: 13, fontWeight: '600'},
});
