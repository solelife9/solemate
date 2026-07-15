// ============================================================================
// ProgressionScreen.rn.tsx — 진척(랭크·업적) 화면 (재설계)
// ============================================================================
// XP 기반 랭크 + 6카테고리 업적 시스템. 타이틀 시스템 폐지.
//
// 레이아웃:
//   · 히어로 — 티어 칩 + 닉네임 + 업적 달성 수('러닝의 옷': XP 표면 비노출)
//   · 나의 여정 카드 — 티어명↔다음 티어명 + 진행 바(숫자 없음, 바가 말한다)
//   · 스탯 줄 — 총 거리 / 등록 신발 / 은퇴 신발 / 현재 스트릭
//   · 탭: 업적 | 챌린지
//   · 업적 탭 — 7카테고리, 달성/미달성(레어리티는 색으로만 — 칩·XP 뱃지 없음)
//   · 챌린지 탭 — Slice C 카드 재사용
//
// 토큰만(theme.ts) — 색/폰트/간격/반경 하드코딩 0.
// ============================================================================
import React, {useEffect, useMemo, useRef, useState} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
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
  RARITY_COLORS,
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
  withAlpha, GLASS,
} from './theme';
import {StatGrid, SwipeBack, Rise, GlassEdge} from './primitives';
import {buildContext} from './lib/progression/context';
import {
  getProgression,
  detectNewUnlocks,
  collectUnlockedKeys,
  type ProgressionView,
  type AchievementView,
} from './lib/progression';
import {rankGuidance} from './lib/progression/guidance';
import {RANK_XP} from './lib/progression/rank';
import {
  defaultProgressionState,
  loadProgression,
  saveProgression,
} from './lib/progression/storage';
import type {
  AchievementCategory,
  AchievementRarity,
  ProgressionState,
  ContextChallengeInput,
} from './lib/progression/types';

// 진행 숫자 표기 — 소수 꼬리(21.0975 등)는 한 자리로 다듬고, 정수는 천단위 콤마.
function fmtProgressNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return n.toLocaleString();
  return (Math.round(n * 10) / 10).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1});
}

// ── 업적 카테고리 메타(프레젠테이션 전용) ────────────────────────────────────────
const ACH_CATEGORY_META: Record<AchievementCategory, {label: string; icon: string}> = {
  runningMilestone: {label: '러닝 이정표', icon: 'walk'},
  distanceMilestone: {label: '누적 거리', icon: 'trending-up'},
  consistency: {label: '꾸준함', icon: 'repeat'},
  shoeJourney: {label: '신발 여정', icon: 'ribbon'},
  shoeMemory: {label: '신발과 동행', icon: 'heart'},
  experience: {label: '특별 경험', icon: 'sparkles'},
  keego: {label: 'Keep Going', icon: 'infinite'},
};

const ACH_CATEGORY_ORDER: AchievementCategory[] = [
  'runningMilestone',
  'distanceMilestone',
  'consistency',
  'shoeJourney',
  'shoeMemory',
  'experience',
  'keego',
];

// ── 희귀도 색(AchievementRarity) — theme.RARITY_COLORS 단일 진실원 ───────────────
// 로컬 재정의 폐지(2026-07-16): legendary 가 여기선 파파야, 셀러브레이션에선 골드로
// 같은 업적이 화면마다 다른 색이었다. 성취 도메인=골드(파파야는 링/워드마크/진행 전용).
const RARITY_COLOR: Record<AchievementRarity, string> = RARITY_COLORS;

export interface ProgressionScreenProps {
  runs?: readonly BackendRun[] | null;
  shoes?: readonly BackendShoe[] | null;
  profileName?: string;
  now?: number;
  initialState?: ProgressionState;
  onBack?: () => void;
  onOpenHallOfFame?: () => void;
  // 수락한 챌린지의 완료 신호(App 이 단일 소스로 계산해 주입). 없으면 null — 챌린지 업적은
  // 잠긴 채 표시되지만(안전), App 경로에서는 항상 주입돼 challenge_starter/dedicated/master
  // 가 실제 완료 수로 해금된다. 화면 단독 렌더(스토리북/테스트)에서만 결측이 자연스럽다.
  challenges?: readonly ContextChallengeInput[] | null;
}

export default function ProgressionScreen({
  runs = [],
  shoes = [],
  profileName = '러너',
  now,
  initialState,
  onBack,
  onOpenHallOfFame,
  challenges = null,
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

  const view: ProgressionView = getProgression(runs, shoes, state, resolvedNow, challenges);

  const ctx = useMemo(
    () =>
      buildContext(
        runs,
        shoes,
        state.earnedTitles,
        challenges,
        resolvedNow,
        state.retiredShoes,
      ),
    [runs, shoes, state.earnedTitles, state.retiredShoes, resolvedNow, challenges],
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
  // 티어 구간(band) XP — 진행바와 동일 기준(절대 총 XP는 바와 어긋나 오해). 여태/필요.
  const bandStart = RANK_XP[guide.tier];
  const xpInBand = Math.max(0, guide.xp - bandStart);
  const bandTotal = Math.max(0, guide.nextXp - bandStart);

  const achievementCount = view.achievements.filter(a => a.unlocked).length;
  const bannerNames = banner
    ? banner.map(k => nameByKey[k] ?? k).join(', ')
    : '';

  return (
    // 엣지 스와이프 백 — 왼쪽 가장자리 우측 드래그로 복귀(iOS pop 제스처 대응).
    <SwipeBack onBack={onBack}>
    <View style={s.screen}>
      <Rise style={{flex: 1}}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: rs(18),
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
              <Ionicons name="chevron-back" size={ri(20)} color={T2} />
            </Pressable>
          ) : (
            <View style={{width: rs(38)}} />
          )}
          <Text style={s.title}>진척</Text>
          {onOpenHallOfFame ? (
            <Pressable
              onPress={onOpenHallOfFame}
              testID="open-hall-of-fame"
              accessibilityRole="button"
              accessibilityLabel="랭킹"
              style={({pressed}) => [s.iconBtn, pressed && {backgroundColor: CARD}]}>
              <Ionicons name="trophy" size={ri(19)} color={ACCENT} />
            </Pressable>
          ) : (
            <View style={{width: rs(38)}} />
          )}
        </View>

        {/* 언락 배너 */}
        {banner && banner.length > 0 ? (
          <View
            style={[s.banner, {borderColor: withAlpha(ACCENT, 0.45)}]}
            testID="unlock-banner"
            accessible
            accessibilityLabel={`새로 해제: ${bannerNames}`}>
            <Ionicons name="sparkles" size={ri(16)} color={ACCENT} />
            <Text style={s.bannerTxt} numberOfLines={2}>
              업적 달성 ·{' '}
              <Text style={{color: T1, fontWeight: '700'}}>{bannerNames}</Text>
            </Text>
          </View>
        ) : null}

        {/* 히어로 — 티어는 정체성이라 이름 곁에(사용자 결정 2026-07-04 v2). 단, 칩
            (알약 상자) 대신 Satisfy식 타이포그래피: 트래킹 잡은 캡스가 티어 색으로
            이름 위에 선다 — 상자 없이 글자가 곧 훈장. 여정 카드는 '가는 길'(방향),
            아이브로우는 '지금의 나'(정체성)로 역할이 다르다. */}
        <View style={s.hero} testID="rank-hero">
          <GlassEdge glints={false} radius={RADIUS.xl} />
          <Text style={[s.tierEyebrow, {color: rankColor}]} testID="rank-eyebrow">
            {TIER_LABEL[view.rank.tier]}
          </Text>
          <Text style={s.nick} numberOfLines={1} testID="progression-nick">
            {profileName}
          </Text>
          <Text style={s.heroSub} testID="progression-xp">
            업적 {achievementCount}개 달성
          </Text>

          {/* 티어 진행바 — 별도 '나의 여정' 카드를 정체성 밑으로 통합(사용자 2026-07-05).
              한 카드에서 '지금의 나'(티어·이름) 아래 '가는 길'(다음 티어)을 잇는다.
              얇은 구분선으로 두 역할을 나눈다. */}
          <View style={s.guideInner} testID="rank-guide">
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
              {guide.xpForNext > 0 && (
                <Text style={s.toNext} testID="rank-to-next">
                  {xpInBand.toLocaleString()} / {bandTotal.toLocaleString()} XP
                </Text>
              )}
              </>
            ) : (
              <Text style={[s.maxTier, {color: rankColor}]} testID="rank-max">
                가장 높은 곳 — 최고 등급
              </Text>
            )}
          </View>
        </View>

        {/* 스탯 줄 — StatGrid 는 자식 삽입이 안 되므로 카드 래퍼가 헤어라인을 소유한다. */}
        <View style={s.statCard}>
          <GlassEdge glints={false} radius={RADIUS.lg} />
          <StatGrid
          testID="stat-row"
          style={s.statCardInner}
          divider
          valueSize={rf(20)}
          valueWeight="600"
          valueLS={-0.4}
          unitSize={rf(11)}
          unitWeight="600"
          labelSize={rf(11)}
          labelWeight="600"
          labelMarginTop={5}
          items={[
            {value: Math.round(ctx.cumulativeKm).toLocaleString(), unit: 'km', label: '총 거리'},
            {value: String(ctx.registeredShoeCount), unit: '켤레', label: '등록 신발'},
            {value: String(ctx.retiredShoeCount), unit: '켤레', label: '은퇴 신발'},
            {value: String(ctx.currentStreak), unit: '일', label: '현재 스트릭'},
          ]}
          />
        </View>

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
                  <Ionicons name={meta.icon as any} size={ri(14)} color={T3} />
                  <Text style={s.groupLabel}>{meta.label}</Text>
                  <Text style={s.groupCount}>{done}/{items.length}</Text>
                </View>
                {items.map(a => (
                  <AchievementCard key={a.key} a={a} />
                ))}
              </View>
            );
          })}

          {/* 총 XP 카드 제거('러닝의 옷' 2026-07-04) — 메타 화폐를 상주 노출하지
              않는다. 엔진은 그대로(티어 산정에 사용). */}
        </View>
      </ScrollView>
      </Rise>
    </View>
    </SwipeBack>
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

  return (
    <View
      style={[s.ach, a.unlocked && {borderWidth: 1, borderColor: withAlpha(aColor, 0.3)}]}
      testID={`ach-${a.key}`}>
      {/* 잠김 카드만 무채 헤어라인 — 달성 카드는 레어리티 색 보더가 외곽을 소유한다. */}
      {!a.unlocked && <GlassEdge glints={false} radius={RADIUS.sm} />}
      <View style={s.achTop}>
        <View style={s.achNameRow}>
          {a.unlocked ? (
            <Ionicons name="checkmark-circle" size={ri(14)} color={aColor} />
          ) : a.signature ? (
            <Ionicons name="star" size={ri(14)} color={T3} />
          ) : null}
          <Text style={[s.achName, a.unlocked && {color: T1}]} numberOfLines={1}>
            {a.name}
          </Text>
        </View>
        {/* XP 보상을 작게 노출(사용자 2026-07-05): 레어리티별 고정 XP가 아니라 업적마다
            달라서, 각 업적의 실제 XP를 레어리티 색으로 표시 — 색=희귀도, 숫자=보상. */}
        <View style={s.achMeta}>
          {a.repeatablePerShoe && a.earnedCount > 1 && (
            <Text style={[s.rarTxt, {color: aColor}]}>×{a.earnedCount}켤레</Text>
          )}
          {a.xp > 0 && (
            <Text
              style={[s.achXp, {color: aColor, opacity: a.unlocked ? 1 : 0.7}]}
              testID={`ach-xp-${a.key}`}>
              {a.xp.toLocaleString()} XP
            </Text>
          )}
        </View>
      </View>

      {a.description ? (
        <Text style={s.achDesc} numberOfLines={2}>{a.description}</Text>
      ) : null}

      <View style={s.achFooter}>
        <Text style={s.achProgTxt} testID={`ach-progress-${a.key}`}>
          {a.progressPrefix ? `${a.progressPrefix} ` : ''}{fmtProgressNum(a.progress.current)} / {fmtProgressNum(a.progress.target)}
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
    width: rs(38),
    height: rs(38),
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
    paddingVertical: rv(12),
  },
  bannerTxt: {flex: 1, color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  // 히어로
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  hero: {
    backgroundColor: HERO_BG,
    borderRadius: RADIUS.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: SPACE.xl,
    gap: SPACE.xs,
  },
  tierEyebrow: {fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: 4, textTransform: 'uppercase'},
  nick: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: TYPE.title.fontSize,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heroSub: {fontFamily: FONT, color: T3, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  // 티어 진행바 — 히어로 카드에 통합, 정체성과 얇은 구분선으로 분리
  guideInner: {alignSelf: 'stretch', marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CARD_BORDER},
  // 승급까지 남은 XP — 게임 히어로가 아니라 속삭임(작고 뮤트, 우측 정렬)
  toNext: {fontFamily: FONT, color: T3, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 0.1, textAlign: 'right', marginTop: rv(10), fontVariant: ['tabular-nums']},
  xpRow: {flexDirection: 'row', alignItems: 'baseline', gap: rv(0)},
  xpNum: {fontFamily: DISPLAY, fontSize: TYPE.display.fontSize, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums']},
  xpUnit: {fontFamily: FONT, color: T3, fontSize: TYPE.body.fontSize, fontWeight: '600'},
  nextRow: {flexDirection: 'row', alignItems: 'center', gap: rv(10)},
  nextTierTxt: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 0.2},
  nextTrack: {
    flex: 1,
    height: rs(6),
    backgroundColor: CARD_HI,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  nextFill: {height: '100%', borderRadius: RADIUS.pill},
  maxTier: {fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700'},
  xpForNext: {fontFamily: FONT, color: T3, fontSize: TYPE.caption.fontSize, fontWeight: '600'},
  // 스탯 카드 — 래퍼(표면·헤어라인) + 이너(StatGrid 패딩) 분리.
  statCard: {
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  statCardInner: {
    paddingVertical: rv(16),
  },
  // 카테고리 헤더
  catHeader: {flexDirection: 'row', alignItems: 'center', gap: rv(6)},
  groupLabel: {flex: 1, fontFamily: FONT, color: T2, fontSize: TYPE.label.fontSize, fontWeight: '700'},
  groupCount: {fontFamily: FONT, color: T3, fontSize: TYPE.caption.fontSize, fontWeight: '700'},
  // 업적 카드 — 잠김=코너 페이드 헤어라인(GlassEdge), 달성=레어리티 의미색 보더(예외 유지).
  ach: {
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: rs(14),
    gap: SPACE.sm,
  },
  achTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rv(8)},
  achNameRow: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: rv(6)},
  achName: {flex: 1, fontFamily: FONT, color: T2, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  achDesc: {fontFamily: FONT, color: T3, fontSize: TYPE.caption.fontSize, lineHeight: rf(17)},
  rar: {borderRadius: rs(6), paddingHorizontal: rs(8), paddingVertical: rv(3)},
  rarTxt: {fontFamily: FONT, fontSize: rf(9), fontWeight: '700', letterSpacing: 0.4},
  achMeta: {flexDirection: 'row', alignItems: 'center', gap: rv(8)},
  achXp: {fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 0.2, fontVariant: ['tabular-nums']},
  achFooter: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  achProgTxt: {
    fontFamily: FONT,
    color: T3,
    fontSize: TYPE.caption.fontSize,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  xpChip: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700'},
  track: {height: rs(5), backgroundColor: CARD_HI, borderRadius: RADIUS.pill, overflow: 'hidden'},
  fill: {height: '100%', borderRadius: RADIUS.pill},
  // 총 XP
  xpTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: GLASS.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingHorizontal: rs(16),
    paddingVertical: rv(16),
    marginTop: SPACE.xs,
  },
  xpTotalLabel: {fontFamily: FONT, color: T2, fontSize: TYPE.caption.fontSize, fontWeight: '700'},
  xpTotalNum: {
    fontFamily: DISPLAY,
    color: ACCENT,
    fontSize: TYPE.title.fontSize,
    fontWeight: '700',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  // 챌린지 빈 상태
  empty: {alignItems: 'center', gap: rv(8), paddingVertical: rv(36)},
  emptyTxt: {fontFamily: FONT, color: T3, fontSize: TYPE.label.fontSize, fontWeight: '600'},
});
