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
  SectionList,
  Pressable,
  StyleSheet,
} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG,
  CARD_HI,
  ACCENT,
  RARITY_COLORS,
  T1,
  T2,
  T3,
  FONT,
  DISPLAY,
  SPACE,
  RADIUS,
  TYPE,
  TIER_COLORS,
  TIER_LABEL,
  withAlpha, GLASS,
  BAR,
  GUTTER,
  MOTION,
  ICON,
} from './theme';
import {StatGrid, SwipeBack, Rise, GlassEdge, ScreenHeader} from './primitives';
import {buildContext} from './lib/progression/context';
import {
  getProgression,
  detectNewUnlocks,
  collectUnlockedKeys,
  type ProgressionView,
  type AchievementView,
} from './lib/progression';
import {rankGuidance} from './lib/progression/guidance';

// 리스트 구분자. **렌더 안에서 정의하면 안 된다**(2026-08-08) — 매 렌더마다 새 컴포넌트
// 타입이 되어 React 가 그 서브트리를 통째로 버리고 다시 만든다. 구분자는 상태가 없어서
// 눈에 띄는 피해는 없었지만, 같은 실수를 상태 있는 컴포넌트에 하면 그때는 값이 사라진다.
// 규칙(react/no-unstable-nested-components)이 잡아 준 자리다.
const ItemGap = () => <View style={{height: SPACE.sm}} />;
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
  // 업적 섹션 — 카테고리별로 묶어 SectionList 에 넘긴다(가상화, 2026-07-26 F-07).
  // 구: ScrollView + map 으로 **전량을 한 번에 마운트**했다. 지금은 39개라 견디지만 업적은
  // 계속 늘어나는 데이터라 100개를 넘기면 화면 진입이 눈에 띄게 느려진다. 기록 탭은 이미
  // FlatList 로 가상화돼 있어 같은 앱 안에서 기준이 갈려 있기도 했다.
  const achSections = useMemo(
    () =>
      ACH_CATEGORY_ORDER.map(cat => ({
        cat,
        meta: ACH_CATEGORY_META[cat],
        data: view.achievements.filter(a => a.category === cat),
      })).filter(sec => sec.data.length > 0),
    [view.achievements],
  );
  const bannerNames = banner
    ? banner.map(k => nameByKey[k] ?? k).join(', ')
    : '';

  return (
    // 엣지 스와이프 백 — 왼쪽 가장자리 우측 드래그로 복귀(iOS pop 제스처 대응).
    <SwipeBack onBack={onBack}>
    <View style={s.screen}>
      <Rise style={{flex: 1}}>
      <SectionList
        sections={achSections}
        keyExtractor={a => a.key}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: GUTTER,
          paddingBottom: insets.bottom + 28,
        }}
        // 간격: 구 ScrollView 의 gap(SPACE.lg 블록 사이 · SPACE.sm 카드 사이)을 그대로 재현한다.
        ItemSeparatorComponent={ItemGap}
        renderSectionHeader={({section}) => (
          <View style={[s.catHeader, {marginTop: SPACE.lg, marginBottom: SPACE.sm}]}>
            <Ionicons name={section.meta.icon as any} size={ri(ICON.tag)} color={T3} />
            <Text style={s.groupLabel}>{section.meta.label}</Text>
            <Text style={s.groupCount}>
              {section.data.filter(a => a.unlocked).length}/{section.data.length}
            </Text>
          </View>
        )}
        renderItem={({item}) => <AchievementCard a={item} />}
        ListHeaderComponent={
          <View style={{gap: SPACE.lg}}>
        {/* header — 표준 내비 헤더(primitives.ScreenHeader), 수제 조립 폐지(2026-07-25).
            거터는 ScrollView 컨테이너가 이미 주므로 패딩 0. 우측 랭킹 트로피는 right
            슬롯(testID·라벨 보존). (구 back 버튼 testID progression-back 은 헤더 행으로
            이동 — 참조 테스트 없음 확인.) */}
        <ScreenHeader
          title="진척"
          onBack={onBack}
          testID="progression-back"
          style={s.header}
          right={onOpenHallOfFame ? (
            <Pressable
              onPress={onOpenHallOfFame}
              testID="open-hall-of-fame"
              accessibilityRole="button"
              accessibilityLabel="랭킹"
              hitSlop={6}
              style={({pressed}) => [s.iconBtn, pressed && {transform: [{scale: MOTION.press.scale}], opacity: MOTION.press.opacity}]}>
              <Ionicons name="trophy" size={ri(ICON.action)} color={ACCENT} />
            </Pressable>
          ) : undefined}
        />

        {/* 언락 배너 */}
        {banner && banner.length > 0 ? (
          <View
            style={[s.banner, {borderColor: withAlpha(ACCENT, 0.45)}]}
            testID="unlock-banner"
            accessible
            accessibilityLabel={`새로 해제: ${bannerNames}`}>
            <Ionicons name="sparkles" size={ri(ICON.inline)} color={ACCENT} />
            <Text style={s.bannerTxt} numberOfLines={2}>
              업적 달성 ·{' '}
              <Text style={{color: T1, fontWeight: '700'}}>{bannerNames}</Text>
            </Text>
          </View>
        ) : null}

        {/* 히어로 — 티어는 정체성이라 이름 곁에(사용자 결정 2026-07-04 v2). 칩(알약 상자)
            대신 Satisfy식 타이포그래피: 트래킹 잡은 캡스가 티어 색으로 선다 — 상자 없이
            글자가 곧 훈장.
            재구성(민우님 C안 확정 2026-07-26): 티어를 이름 '위'에서 **바로 옆**으로 붙이고,
            구분선과 '업적 N개 달성' 단독 줄을 걷어 카드를 6단 → 3단으로 압축한다. 업적 수는
            진행바 아래 한 줄의 왼쪽 끝(XP 와 짝)으로 내려간다. */}
        <View style={s.hero} testID="rank-hero">
          <GlassEdge glints={false} radius={RADIUS.xl} />
          <View style={s.nameRow}>
            <Text style={s.nick} numberOfLines={1} testID="progression-nick">
              {profileName}
            </Text>
            <Text style={[s.tierEyebrow, {color: rankColor}]} testID="rank-eyebrow">
              {TIER_LABEL[view.rank.tier]}
            </Text>
          </View>

          {/* 티어 진행바 — 별도 '나의 여정' 카드를 정체성 밑으로 통합(사용자 2026-07-05).
              한 카드에서 '지금의 나'(티어·이름) 아래 '가는 길'(다음 티어)을 잇는다.
              구분선은 폐지(C안 2026-07-26) — 이름 줄이 한 줄로 짧아져 두 역할이 이미
              시각적으로 갈린다. 선 하나만큼 카드도 낮아진다. */}
          <View style={s.guideInner} testID="rank-guide">
            {guide.nextTier ? (
              <>
              {/* 진행바 = '다음까지' 전용(간결화 F1, 2026-07-26). 좌측의 현재 티어 라벨은
                  바로 위 아이브로우와 같은 글자라 지웠다 — 아이브로우가 '지금의 나', 진행바는
                  '가는 길'로 역할이 갈린다. */}
              <View style={s.nextRow} testID="rank-next">
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
              </>
            ) : (
              <Text style={[s.maxTier, {color: rankColor}]} testID="rank-max">
                가장 높은 곳 — 최고 등급
              </Text>
            )}
            {/* 발치 한 줄 — 좌: 업적 수(구 이름 밑 단독 줄에서 이동), 우: 다음 티어까지 남은 XP.
                진행바가 이미 비율을 그리므로 숫자는 '얼마나 더'만 말한다(간결화 F1) —
                구 '1,240 / 2,000 XP' 는 바와 같은 정보의 숫자 버전이었다. */}
            <View style={s.heroFoot}>
              <Text style={s.heroSub} testID="progression-xp">
                업적 {achievementCount}개
              </Text>
              {!!guide.nextTier && guide.xpForNext > 0 && (
                <Text style={s.toNext} testID="rank-to-next">
                  {TIER_LABEL[guide.nextTier]}까지 {Math.max(0, bandTotal - xpInBand).toLocaleString()} XP
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* 스탯 줄 — StatGrid 는 자식 삽입이 안 되므로 카드 래퍼가 헤어라인을 소유한다. */}
        <View style={s.statCard}>
          <GlassEdge glints={false} radius={RADIUS.lg} />
          <StatGrid
          testID="stat-row"
          inset="band"
          divider
          // 4칸 보조 스탯 줄 → NUMERIC sm(사이트별 타이포 복원 prop 회수, 2026-07-25).
          size="sm"
          items={[
            {value: Math.round(ctx.cumulativeKm).toLocaleString(), unit: 'km', label: '총 거리'},
            {value: String(ctx.registeredShoeCount), unit: '켤레', label: '등록 신발'},
            {value: String(ctx.retiredShoeCount), unit: '켤레', label: '은퇴 신발'},
            {value: String(ctx.currentStreak), unit: '일', label: '현재 스트릭'},
          ]}
          />
        </View>

          {/* 업적 목록은 SectionList 가 렌더한다(카테고리=섹션) — 위는 헤더 블록까지다.
              총 XP 카드는 제거됨('러닝의 옷' 2026-07-04): 메타 화폐를 상주 노출하지
              않는다. 엔진은 그대로(티어 산정에 사용). */}
          </View>
        }
      />
      </Rise>
    </View>
    </SwipeBack>
  );
}

// ── 업적 카드 컴포넌트 ─────────────────────────────────────────────────────────
// 레어리티 발색은 **달성한 업적에만**(2026-07-18 톤 감사 확정): 잠긴 카드까지 색을 입히면
// 화면이 게임 인벤토리처럼 읽히고 색이 흔해져 달성의 가치가 싸진다. 미달성=무채(T3),
// 달성=레어리티 색 — 색이 '얻어낸 것'의 표식이 된다. 이름·색 체계(커먼~레전더리)는 유지.
function AchievementCard({a}: {a: AchievementView}) {
  const aColor = a.unlocked ? RARITY_COLOR[a.rarity] : T3;
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
            <Ionicons name="checkmark-circle" size={ri(ICON.tag)} color={aColor} />
          ) : a.signature ? (
            <Ionicons name="star" size={ri(ICON.tag)} color={T3} />
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
              style={[s.achXp, {color: aColor}]}
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
            // 진행바: 미달성=흰색(앱 공통 게이지 문법), 달성=레어리티 색(꽉 찬 훈장 띠).
            {width: `${Math.round(ratio * 100)}%`, backgroundColor: a.unlocked ? aColor : T1},
          ]}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  // ScreenHeader 는 자체 GUTTER·상하 패딩을 갖는다 — 이 화면은 ScrollView 컨테이너가
  // 거터·gap 을 이미 주므로 0 으로 상쇄한다(시각 동등).
  header: {paddingHorizontal: 0, paddingVertical: 0},
  // right 슬롯 트로피 버튼 — ScreenHeader back 필과 같은 캐논(38 pill·CARD_HI·흰 12% 보더).
  iconBtn: {
    width: rs(38),
    height: rs(38),
    borderRadius: RADIUS.pill,
    backgroundColor: CARD_HI,
    borderWidth: 1,
    borderColor: withAlpha(T1, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
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
  // 불투명 HERO_BG 판 → 반투명 히어로 유리(GLASS.fillActive) — 재질 일치(검수 잔여, 2026-07-17).
  hero: {
    backgroundColor: GLASS.fillActive,
    borderRadius: RADIUS.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    // 20 → 16(SPACE.lg, 2026-07-26): 아래 스탯 카드 패딩(16)과 어긋나 히어로만 헐렁했다.
    padding: SPACE.lg,
    gap: SPACE.xs,
  },
  // 이름 + 티어 한 줄 — 티어는 이름 바로 옆에 붙는다(민우님 2026-07-26). baseline 정렬이라
  // 크기가 다른 두 글자의 밑선이 맞는다.
  nameRow: {flexDirection: 'row', alignItems: 'baseline', gap: rs(10), flexWrap: 'wrap'},
  // 자간 4 → 2.5: 이름 옆으로 오면 4는 너무 벌어져 이름과 한 덩어리로 안 읽힌다.
  tierEyebrow: {fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: 2.5, textTransform: 'uppercase'},
  nick: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: TYPE.title.fontSize,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heroSub: {fontFamily: FONT, color: T3, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  // 티어 진행바 — 히어로 카드에 통합, 정체성과 얇은 구분선으로 분리
  // 구분선·상단 패딩 폐지(C안 2026-07-26) — 이름 줄이 한 줄로 짧아져 선 없이도 역할이 갈린다.
  guideInner: {alignSelf: 'stretch', marginTop: SPACE.md},
  // 발치 한 줄 — 좌 업적 수 · 우 남은 XP. 둘 다 속삭임(작고 뮤트).
  heroFoot: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: rs(10), marginTop: rv(10)},
  // 승급까지 남은 XP — 게임 히어로가 아니라 속삭임(작고 뮤트)
  toNext: {fontFamily: FONT, color: T3, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 0.1, fontVariant: ['tabular-nums']},
  xpRow: {flexDirection: 'row', alignItems: 'baseline', gap: rv(0)},
  xpNum: {fontFamily: DISPLAY, fontSize: TYPE.display.fontSize, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums']},
  xpUnit: {fontFamily: FONT, color: T3, fontSize: TYPE.body.fontSize, fontWeight: '600'},
  nextRow: {flexDirection: 'row', alignItems: 'center', gap: rv(10)},
  nextTierTxt: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 0.2},
  nextTrack: {
    flex: 1,
    height: rs(BAR.md),
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
  // (statCardInner 삭제 — primitives.StatGrid inset="band" 로 수렴, 2026-07-26)
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
  track: {height: rs(BAR.md), backgroundColor: CARD_HI, borderRadius: RADIUS.pill, overflow: 'hidden'},
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
