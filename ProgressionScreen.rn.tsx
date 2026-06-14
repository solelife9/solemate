// ============================================================================
// ProgressionScreen.rn.tsx — 진척(랭크·타이틀·업적) 화면 (Slice A · UI)
// ============================================================================
// 진척 생태계의 단일 표면. 런/신발(원본, 읽기 전용)과 영속 상태(progression_v1)로부터
// lib/progression 엔진(getProgression)이 만든 뷰를 그대로 그린다. 화면은 데이터를
// 만들지 않는다(날조 금지) — 표시 + 사용자 선택(타이틀 장착)만 담당한다.
//
// 레이아웃(.tenet/visuals slice-1 + final-product, .tenet/DESIGN.md):
//   · 히어로 — 티어 색 진행 링 + 랭크 칩(티어·점수) + 닉네임 + 장착 타이틀 칩
//   · 스탯 줄 — 총 거리 / 등록 신발 / 은퇴 신발 / 현재 스트릭
//   · 타이틀 갤러리 — 카테고리별 그룹, 해제/잠금 함께(잠금은 흐림+자물쇠), 티어 색 점
//   · 업적 진행 바 — current/target, 티어 색 채움
//   · 진척 포인트 총합
// 상호작용: 해제된 타이틀을 탭하면 장착(한 번에 1개) → progression_v1 영속 → 표시 갱신.
// 일회성 언락 배너(~3.5s): seenUnlocks 로 멱등(다시 떠도 같은 키는 재노출 안 함).
//
// 토큰만 사용(theme.ts) — 색/폰트/간격/반경 하드코딩 0. 티어 색은 TIER_COLORS 권위.
// 다크 프리미엄 톤(Apple Fitness·WHOOP·PS Trophies) — RPG/유치 금지.
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
  SEP,
  FONT,
  DISPLAY,
  SPACE,
  RADIUS,
  TYPE,
  TIER_COLORS,
  withAlpha,
} from './theme';
import {ExtChallengeCard, SmartChallengeCard} from './ChallengesSection';
import {
  generateSmartChallenge,
  type ExtChallenge,
  type ExtRun,
  type ExtShoe,
} from './lib/progression/challengesExt';
import {buildContext} from './lib/progression/context';
import {
  getProgression,
  detectNewUnlocks,
  collectUnlockedKeys,
  type ProgressionView,
  type TitleView,
} from './lib/progression';
import {rankGuidance} from './lib/progression/guidance';
import {
  defaultProgressionState,
  loadProgression,
  saveProgression,
} from './lib/progression/storage';
import type {
  AchievementGroup,
  EarnedTitle,
  ProgressionState,
  RankTier,
  TitleCategory,
} from './lib/progression/types';

// 티어 표시명(영문 — PS Trophies/WHOOP 관용. 본문/라벨은 한국어, 티어명만 영문).
const TIER_LABEL: Record<RankTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  master: 'Master',
  legend: 'Legend',
};

// 카테고리 한국어 라벨 + 아이콘(프레젠테이션 전용 — 데이터 아님). 갤러리 그룹 헤더와
// 타이틀 카드 아이콘에 쓴다. 고정 순서로 그룹을 노출한다(결정적 레이아웃).
const CATEGORY_META: Record<TitleCategory, {label: string; icon: string}> = {
  running: {label: '러닝', icon: 'walk'},
  consistency: {label: '꾸준함', icon: 'flame'},
  shoeManagement: {label: '신발 관리', icon: 'shield-checkmark'},
  rotation: {label: '로테이션', icon: 'sync'},
  injuryPrevention: {label: '부상 예방', icon: 'fitness'},
  retirement: {label: '은퇴', icon: 'ribbon'},
  hidden: {label: '히든', icon: 'sparkles'},
};
// 업적 표시 그룹 라벨 + 고정 순서(수집 카탈로그 헤더).
const ACH_GROUP_META: Record<AchievementGroup, string> = {
  firstMilestone: '러닝 이정표',
  distance: '거리',
  runCount: '러닝 횟수',
  consistency: '꾸준함',
  shoeCollection: '신발 수집',
  shoeLife: '신발 수명',
  rotation: '로테이션',
  injuryPrevention: '부상 예방',
  retirement: '은퇴',
  hidden: '히든',
};
const ACH_GROUP_ORDER: AchievementGroup[] = [
  'firstMilestone',
  'distance',
  'runCount',
  'consistency',
  'shoeCollection',
  'shoeLife',
  'rotation',
  'injuryPrevention',
  'retirement',
  'hidden',
];

// 진척 화면 섹션 탭(한 번에 하나만 노출 — 한눈에 보이게 IA 정리).
type TabKey = 'titles' | 'achievements' | 'challenges';
const TABS: ReadonlyArray<{key: TabKey; label: string}> = [
  {key: 'titles', label: '타이틀'},
  {key: 'achievements', label: '업적'},
  {key: 'challenges', label: '챌린지'},
];

const CATEGORY_ORDER: TitleCategory[] = [
  'running',
  'consistency',
  'shoeManagement',
  'rotation',
  'injuryPrevention',
  'hidden',
  'retirement',
];

export interface ProgressionScreenProps {
  /** 서버/상태 런 행(읽기 전용 — 원본 불변). */
  runs?: readonly BackendRun[] | null;
  /** 서버/상태 신발 행(읽기 전용 — 원본 불변). */
  shoes?: readonly BackendShoe[] | null;
  /** 닉네임(profile_name) — 장착 타이틀을 이 이름 옆에 표시한다. */
  profileName?: string;
  /** 기준 시각(epoch ms) — 시간 기반 타이틀/스트릭 결정성. 미주입 시 Date.now(). */
  now?: number;
  /** 영속 진척 상태 초기값(테스트 주입용). 미주입 시 마운트 시 storage 에서 로드. */
  initialState?: ProgressionState;
  /** 뒤로(프로필로 복귀). */
  onBack?: () => void;
  /** 명예의 전당(라이브 리더보드) 열기 — 헤더 트로피 버튼. 미주입 시 버튼 숨김. */
  onOpenHallOfFame?: () => void;
  // ── 챌린지(Slice C) — 표시 전용. 진행률은 challengeExtProgress 로 카드 내부에서 파생. ──
  /** 사용자가 수락(영속)한 확장 챌린지(monthly/shoe/rotation). App 이 K_CHALLENGES 로 영속한다. */
  extChallenges?: readonly ExtChallenge[];
  /** 스마트 추천 수락 핸들러 — App 의 acceptChallenge 가 K_CHALLENGES 에 영속한다(기존 distance/streak 비파괴 공존). */
  onAcceptChallenge?: (c: ExtChallenge) => void;
}

/** 장착 시 earnedTitles 에 키를 보장하고(없으면 추가) isEquipped 플래그를 한 곳에 모은다.
 *  storage 의 normalize 가 equippedTitleKey 를 보유 타이틀일 때만 유지하므로, 장착하는
 *  타이틀은 반드시 earnedTitles 에 존재해야 영속된다. */
function withEquipped(
  earned: readonly EarnedTitle[],
  key: string,
  nowMs: number,
): EarnedTitle[] {
  const list = earned.some(t => t.key === key)
    ? [...earned]
    : [...earned, {key, unlockedAt: new Date(nowMs).toISOString(), isEquipped: false}];
  return list.map(t => ({...t, isEquipped: t.key === key}));
}

export default function ProgressionScreen({
  runs = [],
  shoes = [],
  profileName = '러너',
  now,
  initialState,
  onBack,
  onOpenHallOfFame,
  extChallenges = [],
  onAcceptChallenge,
}: ProgressionScreenProps) {
  const insets = useSafeAreaInsets();

  // 영속 상태: 테스트는 initialState 를 주입(동기·props-driven), 프로덕션은 마운트 시
  // storage 에서 로드한다. 사용자 선택(장착)·이미 알린 언락만 권위 영속(파생값은 재계산).
  const [state, setState] = useState<ProgressionState>(
    initialState ?? defaultProgressionState(),
  );
  // loaded: 영속 상태가 실제로 자리잡기 전엔 어떤 쓰기도 금지한다(데이터 파괴 방지).
  // 비동기 loadProgression() 이 끝나기 전 state 는 default(빈 seenUnlocks)다. 이때
  // 언락 배너/장착 경로가 saveProgression 을 부르면 디스크의 실제 earnedTitles·
  // equippedTitleKey·retiredShoes·points 를 default 로 덮어써(클로버) 사용자 데이터가
  // 영구 소실된다(iron law 위반). initialState 주입(테스트)은 즉시 loaded=true.
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

  // now 는 prop 으로 주입(테스트 결정성). 미주입 시 한 번만 Date.now() 로 고정한다
  // (매 렌더 새 타임스탬프가 메모를 깨지 않도록 ref 로 안정화).
  const nowRef = useRef<number>(now ?? Date.now());
  const resolvedNow = now ?? nowRef.current;

  // 엔진 뷰(랭크·타이틀·업적·포인트) — 단일 진입점. 메모는 lib 내부가 처리.
  const view: ProgressionView = getProgression(runs, shoes, state, resolvedNow);

  // 스탯 줄용 집계(총 거리/등록/은퇴/스트릭). context 는 순수·읽기 전용.
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

  // ── 챌린지(Slice C) 파생값 ────────────────────────────────────────────────────
  // 런/신발 원본(BackendRun/BackendShoe)을 challengesExt 가 읽는 최소 모양(ExtRun/ExtShoe)
  // 으로 매핑한다(읽기 전용 — 원본 불변). 진행률은 카드 내부에서 challengeExtProgress 로
  // 매번 파생하고(영속 금지), 스마트 추천은 generateSmartChallenge 로 결정적으로 만든다.
  const nowISO = useMemo(() => {
    const d = new Date(resolvedNow);
    const p = (x: number) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, [resolvedNow]);
  const extRuns = useMemo<ExtRun[]>(
    () =>
      (runs ?? []).map(r => ({
        date: String(r.run_date || '').slice(0, 10),
        dist: Number(r.km) || 0,
        shoeId: r.shoe_id,
        durationS: r.duration,
      })),
    [runs],
  );
  const extShoes = useMemo<ExtShoe[]>(
    () =>
      (shoes ?? []).map(sh => ({
        id: sh.id,
        name: sh.name,
        retired: !!sh.retired,
        createdAt: sh.purchase_date,
        targetKm: sh.max_km,
      })),
    [shoes],
  );
  // 스마트 추천: 활성 신발<2면 null. 이미 수락(같은 id 가 extChallenges 에 존재)했으면 숨긴다.
  const smart = useMemo(
    () => generateSmartChallenge(extRuns, extShoes, nowISO),
    [extRuns, extShoes, nowISO],
  );
  const showSmart = !!smart && !extChallenges.some(c => c.id === smart.id);

  // 키 → 표시명(언락 배너 카피용). 타이틀+업적을 합쳐 찾는다.
  const nameByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of view.titles.unlocked) m[t.key] = t.name;
    for (const a of view.achievements) m[a.key] = a.name;
    return m;
  }, [view]);

  // ── 일회성 언락 배너(멱등) ────────────────────────────────────────────────────
  // 충족된 키 집합이 바뀔 때만, seenUnlocks 에 없던 새 키를 배너로 한 번 띄우고
  // nextSeen 을 영속한다 → 같은 입력 재계산엔 다시 뜨지 않는다(anti-scenario 8).
  const unlockedKeys = useMemo(() => collectUnlockedKeys(view), [view]);
  const unlockedSig = unlockedKeys.join('|');
  const [banner, setBanner] = useState<string[] | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // 로드 전엔 절대 진단/영속하지 않는다 — 빈 default seenUnlocks 로 detectNewUnlocks 가
    // 모든 충족 키를 "새 언락"으로 오판해 배너를 도배하고, default 상태를 디스크에 써
    // 실제 사용자 데이터를 덮어쓰는 것을 막는다. loaded 후 실제 seenUnlocks 로 diff 한다.
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
    // seenUnlocks 영속은 unlockedSig/loaded 변화에만 반응한다(state 전체 의존 시 무한 루프).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedSig, loaded]);

  // ── 타이틀 장착(한 번에 1개) ──────────────────────────────────────────────────
  const equip = (key: string) => {
    // 로드 전 장착은 무시한다 — default 파생 earnedTitles 를 디스크에 써
    // 실제 보유 타이틀/은퇴 기록/포인트를 덮어쓰는 클로버를 막는다.
    if (!loaded) return;
    setState(prev => {
      const base = prev ?? defaultProgressionState();
      const next: ProgressionState = {
        ...base,
        equippedTitleKey: key,
        earnedTitles: withEquipped(base.earnedTitles, key, resolvedNow),
      };
      void saveProgression(next);
      return next;
    });
  };

  // 갤러리: 해제+잠금을 합쳐 카테고리별 그룹(고정 순서). 그룹 내부는 해제 먼저.
  const grouped = useMemo(() => {
    const all: TitleView[] = [...view.titles.unlocked, ...view.titles.locked];
    const byCat = new Map<TitleCategory, TitleView[]>();
    for (const t of all) {
      const arr = byCat.get(t.category) ?? [];
      arr.push(t);
      byCat.set(t.category, arr);
    }
    return CATEGORY_ORDER.filter(c => byCat.has(c)).map(c => ({
      category: c,
      titles: (byCat.get(c) as TitleView[])
        .slice()
        .sort((a, b) => Number(b.unlocked) - Number(a.unlocked)),
    }));
  }, [view]);

  const rankColor = view.rank.color;
  // 랭크 "어떻게 오르나" 안내(6필러·다음 티어·최대 지렛대) — 순수 파생.
  const guide = useMemo(() => rankGuidance(view.rank), [view.rank]);
  // 섹션 탭(타이틀/업적/챌린지) — 기본 타이틀.
  const [tab, setTab] = useState<TabKey>('titles');
  const equippedTitle = view.titles.equipped
    ? view.titles.unlocked.find(t => t.key === view.titles.equipped) ?? null
    : null;
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
              accessibilityLabel="명예의 전당"
              style={({pressed}) => [s.iconBtn, pressed && {backgroundColor: CARD}]}>
              <Ionicons name="trophy" size={19} color={ACCENT} />
            </Pressable>
          ) : (
            <View style={{width: 38}} />
          )}
        </View>

        {/* 일회성 언락 배너 */}
        {banner && banner.length > 0 ? (
          <View
            style={[s.banner, {borderColor: withAlpha(ACCENT, 0.45)}]}
            testID="unlock-banner"
            accessible
            accessibilityLabel={`새로 해제: ${bannerNames}`}>
            <Ionicons name="sparkles" size={16} color={ACCENT} />
            <Text style={s.bannerTxt} numberOfLines={2}>
              새로 해제 · <Text style={{color: T1, fontWeight: '700'}}>{bannerNames}</Text>
            </Text>
          </View>
        ) : null}

        {/* 히어로 — 랭크 칩 + 닉네임 + 장착 타이틀 (링·점수 제거로 단순화) */}
        <View style={s.hero} testID="rank-hero">
          <View style={{flex: 1, minWidth: 0}}>
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
            {equippedTitle ? (
              <View
                testID="equipped-title"
                style={[
                  s.titlePill,
                  {
                    backgroundColor: withAlpha(TIER_COLORS[equippedTitle.tier], 0.14),
                    borderColor: withAlpha(TIER_COLORS[equippedTitle.tier], 0.45),
                  },
                ]}>
                <Ionicons
                  name={CATEGORY_META[equippedTitle.category].icon}
                  size={11}
                  color={TIER_COLORS[equippedTitle.tier]}
                />
                <Text
                  style={[s.titlePillTxt, {color: TIER_COLORS[equippedTitle.tier]}]}
                  numberOfLines={1}>
                  {equippedTitle.name}
                </Text>
              </View>
            ) : (
              <Text style={s.noTitle} testID="no-equipped-title">
                타이틀 미장착
              </Text>
            )}
          </View>
        </View>

        {/* 랭크 오르는 법 — 6필러 + 다음 티어 + 가장 빠른 길 */}
        <View style={s.guide} testID="rank-guide">
          <Text style={s.guideTitle}>랭크 오르는 법</Text>
          <Text style={s.guideSub}>
            거리만이 아니라 6가지를 종합해 등급이 올라요
          </Text>

          {guide.nextTier ? (
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
          ) : (
            <Text style={[s.maxTier, {color: rankColor}]} testID="rank-max">
              최고 등급 달성 🌟
            </Text>
          )}

          {/* 6개 평가축 미니 바 */}
          <View style={s.pillars}>
            {guide.pillars.map(p => (
              <View key={p.key} style={s.pillarRow}>
                <Text style={s.pillarLabel}>{p.label}</Text>
                <View style={s.pillarTrack}>
                  <View
                    style={[
                      s.pillarFill,
                      {
                        width: `${Math.round(p.value * 100)}%`,
                        backgroundColor: rankColor,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>

          {guide.topLever ? (
            <Text style={s.lever} testID="rank-lever">
              가장 빠른 길 ·{' '}
              <Text style={{color: ACCENT, fontWeight: '700'}}>
                {guide.topLever.label}
              </Text>{' '}
              올리기
            </Text>
          ) : null}
        </View>

        {/* 스탯 줄 — 총 거리 / 등록 신발 / 은퇴 신발 / 현재 스트릭 */}
        <View style={s.statRow} testID="stat-row">
          {[
            {v: Math.round(ctx.cumulativeKm).toLocaleString(), u: 'km', l: '총 거리'},
            {v: String(ctx.registeredShoeCount), u: '켤레', l: '등록 신발'},
            {v: String(ctx.retiredShoeCount), u: '켤레', l: '은퇴 신발'},
            {v: String(ctx.currentStreak), u: '일', l: '현재 스트릭'},
          ].map((x, i) => (
            <View key={i} style={[s.statCell, i > 0 && s.statDivider]}>
              <Text style={s.statValue}>
                {x.v}
                <Text style={s.statUnit}>{x.u}</Text>
              </Text>
              <Text style={s.statLabel}>{x.l}</Text>
            </View>
          ))}
        </View>

        {/* 섹션 탭 — 한 번에 하나만 노출(IA 정리) */}
        <View style={s.tabs}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                testID={`tab-${t.key}`}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{selected: active}}
                style={[s.tab, active && {backgroundColor: CARD_HI}]}>
                <Text style={[s.tabTxt, active && {color: T1}]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 타이틀 탭 — 카테고리별 그룹(해제+잠금) */}
        {tab === 'titles' && (
          <View style={{gap: SPACE.lg}}>
            <Text style={s.equipHint}>
              💡 해제한 타이틀을 탭하면{' '}
              <Text style={{color: ACCENT}}>닉네임 옆에 장착</Text>됩니다 (한 번에 1개)
            </Text>
            {grouped.map(group => (
          <View key={group.category} style={{gap: SPACE.sm}}>
            <Text style={s.groupLabel}>{CATEGORY_META[group.category].label}</Text>
            <View style={s.gallery}>
              {group.titles.map(t => {
                const tColor = TIER_COLORS[t.tier];
                const isEquipped = t.unlocked && view.titles.equipped === t.key;
                const inner = (
                  <>
                    {isEquipped ? (
                      <View
                        style={[s.equipTag, {backgroundColor: tColor}]}
                        testID={`title-equipped-${t.key}`}>
                        <Text style={s.equipTagTxt}>착용중</Text>
                      </View>
                    ) : !t.unlocked ? (
                      <Ionicons
                        name="lock-closed"
                        size={11}
                        color={T3}
                        style={s.lockIcon}
                      />
                    ) : null}
                    <Ionicons
                      name={CATEGORY_META[t.category].icon}
                      size={18}
                      color={t.unlocked ? tColor : T3}
                    />
                    <Text style={s.tcardName} numberOfLines={2}>
                      {t.name}
                    </Text>
                    <View style={[s.tdot, {backgroundColor: tColor}]} />
                  </>
                );
                if (t.unlocked) {
                  return (
                    <Pressable
                      key={t.key}
                      testID={`title-${t.key}`}
                      onPress={() => equip(t.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.name} 타이틀 장착`}
                      accessibilityState={{selected: isEquipped}}
                      style={({pressed}) => [
                        s.tcard,
                        isEquipped && {borderColor: tColor},
                        pressed && {opacity: 0.7},
                      ]}>
                      {inner}
                    </Pressable>
                  );
                }
                return (
                  <View
                    key={t.key}
                    testID={`title-${t.key}`}
                    accessible
                    accessibilityLabel={`${t.name} 타이틀 잠김`}
                    style={[s.tcard, s.tcardLocked]}>
                    {inner}
                  </View>
                );
              })}
            </View>
          </View>
            ))}
          </View>
        )}

        {/* 업적 탭 — 진행 바 + 포인트 */}
        {tab === 'achievements' && (
          <View style={{gap: SPACE.lg}}>
            {ACH_GROUP_ORDER.map(g => {
              const items = view.achievements.filter(a => a.group === g);
              if (items.length === 0) return null;
              const done = items.filter(a => a.unlocked).length;
              return (
                <View key={g} style={{gap: SPACE.sm}}>
                  <Text style={s.groupLabel}>
                    {ACH_GROUP_META[g]}{' '}
                    <Text style={s.groupCount}>
                      {done}/{items.length}
                    </Text>
                  </Text>
                  {items.map(a => {
                    const aColor = TIER_COLORS[a.rarity];
                    const ratio =
                      a.progress.target > 0
                        ? Math.max(0, Math.min(1, a.progress.current / a.progress.target))
                        : a.unlocked
                        ? 1
                        : 0;
                    return (
                      <View key={a.key} style={s.ach} testID={`ach-${a.key}`}>
                        <View style={s.achTop}>
                          <Text style={s.achName} numberOfLines={1}>
                            {a.unlocked ? '✓ ' : ''}
                            {a.name}
                          </Text>
                          <View style={[s.rar, {backgroundColor: withAlpha(aColor, 0.16)}]}>
                            <Text style={[s.rarTxt, {color: aColor}]}>
                              {`${TIER_LABEL[a.rarity].toUpperCase()} · ${a.points}P`}
                            </Text>
                          </View>
                        </View>
                        <View style={s.achProgRow}>
                          <Text style={s.achProgTxt} testID={`ach-progress-${a.key}`}>
                            {`${a.progress.current.toLocaleString()} / ${a.progress.target.toLocaleString()}`}
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
                  })}
                </View>
              );
            })}
            {/* 진척 포인트 총합 — 업적 보상 합 */}
            <View
              style={[s.points, {borderColor: withAlpha(ACCENT, 0.35)}]}
              testID="progression-points">
              <Text style={s.pointsLabel}>진척 포인트</Text>
              <Text style={s.pointsNum}>{view.points.toLocaleString()}</Text>
            </View>
          </View>
        )}

        {/* 챌린지 탭 — 확장 챌린지(monthly/shoe/rotation) + 스마트 추천 카드.
            ChallengesSection 과 동일한 카드를 재사용(단일 출처)하고, 수락은 onAcceptChallenge
            로 App 에 위임한다(K_CHALLENGES 영속 — 화면은 AsyncStorage 를 직접 만지지 않는다). */}
        {tab === 'challenges' &&
          (showSmart || extChallenges.length > 0 ? (
            <View style={{gap: SPACE.sm}} testID="progression-challenges">
              {showSmart ? (
                <SmartChallengeCard
                  ch={smart!}
                  shoes={extShoes}
                  onAccept={onAcceptChallenge}
                />
              ) : null}
              {extChallenges.map(ch => (
                <ExtChallengeCard
                  key={ch.id}
                  ch={ch}
                  runs={extRuns}
                  shoes={extShoes}
                  now={nowISO}
                />
              ))}
            </View>
          ) : (
            <View style={s.empty} testID="progression-challenges-empty">
              <Ionicons name="flag-outline" size={22} color={T3} />
              <Text style={s.emptyTxt}>진행 중인 챌린지가 없어요</Text>
            </View>
          ))}
      </ScrollView>
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
  // 언락 배너
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    backgroundColor: HERO_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.xl,
    padding: SPACE.xl,
  },
  ringCenter: {alignItems: 'center', justifyContent: 'center'},
  ringScore: {
    fontFamily: DISPLAY,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
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
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 8,
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 7,
    maxWidth: '100%',
  },
  titlePillTxt: {fontFamily: FONT, fontSize: 12, fontWeight: '700', flexShrink: 1},
  noTitle: {fontFamily: FONT, color: T3, fontSize: 12, fontWeight: '600', marginTop: 7},
  equipHint: {fontFamily: FONT, color: T3, fontSize: 11.5, lineHeight: 16},
  // 랭크 오르는 법 카드
  guide: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  guideTitle: {fontFamily: DISPLAY, color: T1, fontSize: 15, fontWeight: '800', letterSpacing: -0.2},
  guideSub: {fontFamily: FONT, color: T3, fontSize: 12, lineHeight: 16, marginTop: -4},
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
  pillars: {gap: 7},
  pillarRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  pillarLabel: {
    width: 58,
    fontFamily: FONT,
    color: T2,
    fontSize: 11.5,
    fontWeight: '600',
  },
  pillarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: CARD_HI,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  pillarFill: {height: '100%', borderRadius: RADIUS.pill, opacity: 0.85},
  lever: {fontFamily: FONT, color: T2, fontSize: 12, fontWeight: '600', marginTop: 2},
  // 섹션 탭
  tabs: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.pill,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
  },
  tabTxt: {fontFamily: FONT, color: T3, fontSize: 13, fontWeight: '700'},
  // 빈 상태
  empty: {alignItems: 'center', gap: 8, paddingVertical: 36},
  emptyTxt: {fontFamily: FONT, color: T3, fontSize: 13, fontWeight: '600'},
  // 스탯 줄
  statRow: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
  },
  statCell: {flex: 1, alignItems: 'center'},
  statDivider: {borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP},
  statValue: {
    fontFamily: DISPLAY,
    color: T1,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  statUnit: {fontFamily: FONT, color: T3, fontSize: 11, fontWeight: '700'},
  statLabel: {fontFamily: FONT, color: T3, fontSize: 11, fontWeight: '600', marginTop: 5},
  // 갤러리
  groupLabel: {fontFamily: FONT, color: T2, fontSize: 13, fontWeight: '700'},
  groupCount: {fontFamily: FONT, color: T3, fontSize: 11, fontWeight: '700'},
  gallery: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  tcard: {
    width: '31.5%',
    minHeight: 92,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.sm,
    padding: 11,
  },
  tcardLocked: {opacity: 0.5},
  tcardName: {
    fontFamily: FONT,
    color: T1,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    lineHeight: 16,
  },
  tdot: {position: 'absolute', left: 11, bottom: 12, width: 8, height: 8, borderRadius: 4},
  equipTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  equipTagTxt: {fontFamily: FONT, color: BG, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3},
  lockIcon: {position: 'absolute', top: 10, right: 10},
  // 업적
  ach: {
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    borderRadius: RADIUS.sm,
    padding: 14,
  },
  achTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  achName: {flex: 1, fontFamily: FONT, color: T1, fontSize: 13.5, fontWeight: '700'},
  rar: {borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2},
  rarTxt: {fontFamily: FONT, fontSize: 9, fontWeight: '800', letterSpacing: 0.3},
  achProgRow: {flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, marginBottom: 6},
  achProgTxt: {
    fontFamily: FONT,
    color: T2,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  track: {height: 6, backgroundColor: CARD_HI, borderRadius: RADIUS.pill, overflow: 'hidden'},
  fill: {height: '100%', borderRadius: RADIUS.pill},
  // 포인트
  points: {
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
  pointsLabel: {fontFamily: FONT, color: T2, fontSize: 12, fontWeight: '700'},
  pointsNum: {
    fontFamily: DISPLAY,
    color: ACCENT,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
});
