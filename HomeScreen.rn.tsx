// ============================================================================
// HomeScreen.rn.tsx — Keego Home (hero shoe + center-snap picker)
// 색/폰트는 전부 theme 토큰(BG/CARD/ACCENT/T1~T3/SEP/SPACE/RADIUS/TYPE/FONT/
// DISPLAY)과 withAlpha 파생만 사용한다(raw hex/인라인 fontFamily 0). 워드마크는
// KeegoWordmark primitive. shoe-first: 선택 신발(activeIdx 실값) 수명 링 히어로가
// 주인공이고, 오렌지는 핵심 수치·CTA에만(라벨/보조텍스트는 T3 회색).
// ============================================================================
import React, { useRef, useState, useEffect } from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {
  View, ScrollView, Pressable, StyleSheet, Linking, Dimensions,
  RefreshControl, NativeSyntheticEvent, NativeScrollEvent, Animated,
} from 'react-native';
import {Text} from './lib/text';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BG, CARD_HI, ACCENT, BRAND, GLASS, T1, T2, T3,
  FONT, DISPLAY, SPACE, RADIUS, GUTTER, MOTION, withAlpha, Shoe, SHOES, TYPE,
  NUMERIC,
  ICON,
} from './theme';
import type { RankTier } from './lib/progression/types';
import { TabBar, TABBAR_CLEARANCE, KeegoWordmark, SectionTitle, AmbientBackdrop, GlassEdge, BottomSheet, Rise } from './primitives';
import { Unit } from './lib/units';
import { ShoeCard as KeegoShoeCard, GhostShoeCard, Guardian, EMPTY_SHOE_LINE } from './screens/KeegoHome';
import { shoeHealth, wearTier } from './lib/shoe';
import { recommendNextShoes, buildShopLinks, categoryLabelKo, AFFILIATE_DISCLOSURE } from './lib/affiliate';
import { type ReplacementForecast } from './lib/wearView';
import { shouldRecommendNextShoe } from './lib/recommendTrigger';
import { SHOE_REPLACE_PCT } from './lib/shoe';
import { TrainingLoadCard, LEVEL_COLOR } from './TrainingLoadCard';
import { LOAD_WORD, type TrainingLoadAssessment } from './lib/trainingLoad';
import { WeeklyGoalStepper } from './ChallengesSection';
import RotationInsightPanel from './RotationInsightPanel';
import type { RotationPick } from './lib/rotation';

export type WeekStats = { km: string; runs: number; pace: string };

// ── 진척(랭크·타이틀·챌린지·업적) 홈 노출 (Slice D) ──────────────────────────────
// shoe-first 히어로를 밀어내지 않는 '얇은 띠'로 진척을 표면화한다. 값은 App 이
// getProgression + challengeExt/challengeProgress 로 읽기 전용 파생해 내려준다(여긴
// 표시 전용 — 데이터 생성/날조 0). 색은 TIER_COLORS 권위(하드코딩 0).
export type HomeChallengeView = {
  /** 카드 한 줄 라벨(예: '이번 달 100km'). */
  label: string;
  /** 진행 수치(반올림 전 원시값). */
  current: number;
  target: number;
  /** 0..1 진행 비율(막대 폭). */
  pct: number;
  /** 표시 단위(km/회/켤레/일/%). 미지정이면 단위 생략. */
  unit?: string;
};
export type HomeProgression = {
  /** 합성 랭크 티어 — 칩 색은 TIER_COLORS[tier]. */
  tier: RankTier;
  /** 0..100 합성 점수(칩에 표시). */
  score: number;
  /** 장착 타이틀명(닉네임/인사 옆에 노출). 없으면 미장착. */
  equippedTitle?: string | null;
  /** 노출할 활성 챌린지 1개(진행 바 — ProgressionStrip 전용). 없으면 챌린지 줄 숨김. */
  challenge?: HomeChallengeView | null;
  /** 활성 챌린지 전체 목록(홈 챌린지 카드 노출용). */
  challenges?: readonly HomeChallengeView[];
  /** 가장 최근 달성 업적 1개. 없으면 업적 줄 숨김. */
  achievement?: { name: string } | null;
};

// (진척 띠 ProgressionStrip 은 MVP 홈 다이어트로 제거 — 진척의 집은 마이탭/진척 화면.
//  홈에 남는 진척 노출은 인사 옆 장착 타이틀 pill 하나뿐. HomeProgression 타입은 그
//  pill 과 App 파생 로직이 계속 쓰므로 유지.)


// 앰비언트 배경 — primitives.AmbientBackdrop(무채 상단 광, 2026-07-09 확정 '나')으로
// 일원화. 구 컨디션색 틴트 라디얼은 폐지 — 4개 탭이 같은 조명을 공유한다(색은 의미에만).

// 섹션 등장 스태거 — 마운트 시 살짝 떠오르며 페이드인(60ms 간격). 홈이 '켜지는' 느낌을
// 주는 유일한 전환 모션. JS 드라이버(false) — 코드베이스 관례(TabBar 등)이자
// react-test-renderer 호환(네이티브 드라이버는 테스트 렌더러에서 nativeTag 연결이 깨짐).
// 420ms 단발이라 JS 드라이버로도 체감 차이 없음.
// 2026-08-04(UX 감사 ⑧): 로컬 재구현을 **primitives.Rise 로 수렴**했다. 값(14px 상승·
// easing·JS 드라이버)이 프리미티브와 이미 같았고, 다른 점은 하나뿐이었다 — 이 사본만
// **'동작 줄이기'를 무시했다.** 같은 모션이 화면마다 지켜지기도 하고 안 지켜지기도 하는
// 상태였다. 사본을 지우면 그 갈림 자체가 사라진다(Rise 는 primitives 에서 import).

function TopBar({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.topbar}>
      {/* 워드마크 = BRAND 파파야(primitives 기본값 — 2026-07-09 'B 서명+진행' 확정). */}
      {/* 워드마크(Helvetica)와 신발추가 버튼(Pretendard)의 폰트 메트릭 차이로 중심이 어긋나던 것 보정:
          lineHeight=fontSize 로 디센더 예약 제거 + 미세 translateY(기기 확정 필요). */}
      <KeegoWordmark size={ri(ICON.nav)} style={{ lineHeight: ri(24), transform: [{ translateY: ri(1) }] }} />
      <Pressable
        onPress={onAddShoe}
        accessibilityRole="button"
        accessibilityLabel="신발 추가"
        hitSlop={8}
        style={({ pressed }) => [s.addBtn, pressed && s.pressed]}>
        <Text style={s.addBtnText}>신발 추가</Text>
        <Ionicons name="add" size={ri(ICON.inline)} color={T1} />
      </Pressable>
    </View>
  );
}


// 오늘의 신발 — 풀폭 스와이프 캐러셀(목업 정합). 각 신발이 한 장의 카드(HeroShoe)로
// 좌우로 넘겨지고, 스냅 위치로 활성 신발(onSelect)을 정한다. 활성 카드만 home-hero
// testID + 교체 예측(forecast) 노출(App이 활성 신발 기준 forecast 하나만 내려주므로).
// 카드 탭 → 그 신발 상세(onOpenShoe). 러닝 시작 CTA 는 캐러셀 아래 단일 버튼(활성 기준).
const SCREEN_W = Dimensions.get('window').width;
// 카드 폭 = 화면 폭의 82% (기준 402pt 화면에서 핸드오프 값 330 과 동일 비율).
// 고정 px(min(폭-72,340))은 기기마다 카드/peek 비율이 달라 보이던 원인 — 비율 고정으로
// 어떤 폰에서든 같은 구도가 나온다. 380 상한은 태블릿급 초광폭 안전장치.
const HERO_GAP = 14;
const HERO_W = Math.min(Math.round(SCREEN_W * 0.82), 380);
const HERO_SNAP = HERO_W + HERO_GAP;
const HERO_SIDE = (SCREEN_W - HERO_W) / 2; // 중앙 정렬 여백 → 옆 카드 peek

function ShoeCarousel({ shoes, activeIdx, onSelect, unit, onOpenShoe, onStart }: {
  shoes: Shoe[]; activeIdx: number; onSelect: (i: number) => void; unit: Unit;
  onOpenShoe?: (shoeId: string) => void; onStart?: (idx: number) => void;
}) {
  const ref = useRef<any>(null);
  // KeegoHome ShoeCard 의 중앙강조(scale/opacity)는 scrollX 를 요구한다 → Animated.ScrollView.
  const scrollX = useRef(new Animated.Value(0)).current;
  // 페이지 도트는 **활성 신발(activeIdx)과 분리해서** 손가락을 따라간다.
  // 왜 분리하나: activeIdx 는 부모가 소유하고, 바뀌면 아래 useEffect 가 scrollTo 를 건다.
  // 스크롤 중에 그걸 갱신하면 프로그램 스크롤이 사용자의 손가락과 싸운다(카드가 튄다).
  // 그래서 앱 상태는 관성이 멎은 뒤에 바꾸고, **점만** 먼저 움직인다.
  // 전환 시점은 카드 절반(Math.round) — iOS 페이지 컨트롤과 같은 규약이라
  // "카드가 반쯤 넘어가면 점도 넘어간다"로 읽힌다(2026-08-07 민우님 지적: 점이 마지막에 따라옴).
  const [dotIdx, setDotIdx] = useState(activeIdx);
  useEffect(() => { setDotIdx(activeIdx); }, [activeIdx]);
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: true,
    // 네이티브 드라이버와 JS 리스너는 함께 쓸 수 있다(카드 애니메이션은 네이티브 유지).
    // 같은 값이면 setState 가 리렌더를 건너뛰므로, 실제 리렌더는 칸을 넘을 때만 일어난다.
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = Math.round(e.nativeEvent.contentOffset.x / HERO_SNAP);
      const i = Math.max(0, Math.min(shoes.length - 1, raw));
      setDotIdx(prev => (prev === i ? prev : i));
    },
  });
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / HERO_SNAP);
    const clamped = Math.max(0, Math.min(shoes.length - 1, i));
    // (스냅 햅틱은 넣었다가 사용자 피드백으로 제거 — 스와이프마다 울리면 과함.)
    if (clamped !== activeIdx) onSelect(clamped);
  };
  // 외부에서 활성 신발이 바뀌면(로테이션 추천 탭 등) 캐러셀도 그 카드로 스냅 이동.
  useEffect(() => { ref.current?.scrollTo({ x: activeIdx * HERO_SNAP, animated: true }); }, [activeIdx]);
  return (
    <View>
      <Animated.ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={HERO_SNAP}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onEnd}
        // 패딩 = HERO_SIDE 그대로 — 카드 간격은 gap 이 만들므로 스냅 위치(i×SNAP)에서 카드가
        // 정확히 정중앙, 좌우 peek 이 동일해진다. (기존 -GAP/2 보정은 gap 대신 카드별
        // margin(GAP/2)을 쓸 때의 값 — gap 방식에선 모든 카드를 7px 왼쪽으로 밀던 버그.)
        contentContainerStyle={{ paddingHorizontal: HERO_SIDE, gap: HERO_GAP }}
      >
        {shoes.map((shoe, i) => (
          // 카드 = KeegoHome 의 ShoeCard(핸드오프 디자인 그대로 — 링·유리엣지·상승감 표면).
          // 상세 열기(정보영역)·러닝시작(형제 버튼)은 카드 안에서 분리돼 텍스트 테스트 혼동 없음.
          // shoeHealth 가 정확한 소진율을 내도록 total_km(=이미 계산된 used)을 주입한다.
          <View key={shoe.id ?? i} testID={i === activeIdx ? 'home-hero' : undefined} style={{ width: HERO_W }}>
            <KeegoShoeCard
              shoe={{ ...(shoe as any), total_km: (shoe as any).used } as any}
              runs={[]}
              width={HERO_W}
              scrollX={scrollX}
              stride={HERO_SNAP}
              i={i}
              unit={unit}
              onStartRun={onStart ? () => onStart(i) : undefined}
              onOpenShoe={onOpenShoe ? (sh: any) => { if (sh?.id) onOpenShoe(String(sh.id)); } : undefined}
            />
          </View>
        ))}
      </Animated.ScrollView>
      {/* 페이지 도트만 — 스와이프 안내문은 제거(도트가 이미 넘김을 말한다. 프리미엄
          제품은 사용법 문구를 상주시키지 않는다 — 폴리싱 2026-07-02). */}
      {shoes.length > 1 && (
        <View style={s.pageDots} testID="home-page-dots">
          {shoes.map((_, i) => <View key={i} testID={`home-page-dot-${i}`} style={[s.pageDot, i === dotIdx && s.pageDotOn]} />)}
        </View>
      )}
    </View>
  );
}

// 이번 주 러닝 — 원카드(B안, 2026-07-25 민우님 목업 확정). 한 장의 유리 카드에:
//   · 히어로 줄: 거리·목표 한 숫자축('7.0 / 95 km') + 스트릭 월~일 점 7칸.
//     히어로 탭 = 주간 목표 스테퍼 시트(onPressGoal). 구 주황 진행 바·'주간 목표 N km'
//     텍스트·'N일 연속' 칩은 폐지 — 숫자축·점 7칸이 같은 정보를 더 조용히 말한다.
//   · 하단 3열: 횟수 · 평균 페이스 · 훈련 부하(상태 워드 + 레벨 점 + ⌄).
//     부하 셀 탭 = 카드 안 인라인 상세(TrainingLoadCard embedded) 펼침/접힘.
// week(WeekStats)·weekDays(월~일 달림)·load 는 App 이 파생해 주입한다. 표시 전용.
function WeekCard({ week, unit = 'km', weeklyGoalKm = 0, weekDays = [], weekTodayIdx = -1, load, onPressGoal }: {
  week?: WeekStats; unit?: Unit; weeklyGoalKm?: number;
  weekDays?: boolean[]; weekTodayIdx?: number;
  load?: TrainingLoadAssessment | null;
  onPressGoal?: () => void;
}) {
  // 부하 상세 펼침 — 카드 안 인라인 확장(별도 카드 아님).
  const [loadOpen, setLoadOpen] = useState(false);
  const km = week?.km ?? '0.0';
  const runs = week?.runs ?? 0;
  const pace = week?.pace && week.pace !== '--' ? week.pace : '--'; // 앱 전역 '데이터 없음' 표기 통일(--)
  // 스트릭 점 7칸 — 월~일 정규화(미주입/부족분은 false).
  const days7 = Array.from({ length: 7 }, (_, i) => !!weekDays[i]);
  const doneCount = days7.filter(Boolean).length;
  // 훈련 부하 셀 — 워드·색은 TrainingLoadCard 와 같은 권위(LOAD_WORD/LEVEL_COLOR) 소비.
  const hasLoad = !!load && (load.acuteKm > 0 || load.chronicKm > 0);
  const loadLevel = hasLoad && load!.confident ? load!.level : null;
  const loadWord = loadLevel ? LOAD_WORD[loadLevel] : '기록 쌓는 중';
  const loadColor = loadLevel ? LEVEL_COLOR[loadLevel] : T3;

  // 히어로 줄 — 좌: 거리/목표 숫자축(전체 탭 = 목표 시트), 우: 월~일 점 7칸.
  const hero = (
    <Pressable
      testID="home-week-goal"
      onPress={onPressGoal}
      disabled={!onPressGoal}
      accessibilityRole="button"
      accessibilityLabel={weeklyGoalKm > 0 ? `이번 주 ${km}${unit}, 목표 ${weeklyGoalKm}${unit}` : `이번 주 ${km}${unit}`}
      accessibilityHint={onPressGoal ? '주간 목표 설정' : undefined}
      style={({ pressed }) => [s.weekHero, pressed && !!onPressGoal && s.pressed]}>
      <View style={s.weekHeroLeft}>
        <Text style={s.weekKm} testID="home-week-km">{km}</Text>
        {weeklyGoalKm > 0 ? (
          <Text style={s.weekGoalAxis} testID="home-week-goal-target"> / {weeklyGoalKm} {unit}</Text>
        ) : (
          <>
            <Text style={s.weekGoalAxis}> {unit}</Text>
            {!!onPressGoal && <Text style={s.weekGoalSet} testID="home-week-goal-set">목표 정하기 ›</Text>}
          </>
        )}
      </View>
      <View
        style={s.weekDays}
        testID="home-week-days"
        accessible
        accessibilityLabel={`이번 주 ${doneCount}일 달림`}>
        {days7.map((done, i) => (
          <View
            key={i}
            testID={`home-week-day-${i}`}
            style={[s.weekDot, done ? s.weekDotOn : s.weekDotOff, i === weekTodayIdx && s.weekDotToday]}
          />
        ))}
      </View>
    </Pressable>
  );

  // 이번 주 런 0 이면 0의 그리드 대신 초대 한 줄(노이즈 감사 2026-07-05) — 새 카드
  // 골격(히어로 숫자축·점 7칸) 안에서. 목표축이 곧 초대라 히어로는 유지한다.
  if (runs === 0) {
    return (
      <View style={s.insightCard} testID="home-week">
        <GlassEdge glints={false} radius={RADIUS.lg} />
        {hero}
        <Text style={[s.weekEmptyTxt, { marginTop: SPACE.md }]} testID="home-week-empty">이번 주 첫 러닝을 시작해보세요</Text>
      </View>
    );
  }
  return (
    <View style={s.insightCard} testID="home-week">
      <GlassEdge glints={false} radius={RADIUS.lg} />
      {hero}
      <View style={[s.insightGrid, { marginTop: SPACE.lg }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.insightLabel}>횟수</Text>
          <View style={[s.baselineRow, { marginTop: rv(6) }]}>
            <Text style={s.insightNum} testID="home-week-runs">{runs}</Text><Text style={s.insightUnit}>회</Text>
          </View>
        </View>
        <View style={s.insightDivider} />
        <View style={{ flex: 1 }}>
          <Text style={s.insightLabel}>평균 페이스</Text>
          <View style={[s.baselineRow, { marginTop: rv(6) }]}>
            <Text style={s.insightNum} testID="home-week-pace">{pace}</Text>
          </View>
        </View>
        <View style={s.insightDivider} />
        <Pressable
          style={{ flex: 1 }}
          testID="home-week-load"
          disabled={!hasLoad}
          onPress={() => setLoadOpen(v => !v)}
          accessibilityRole="button"
          accessibilityLabel={`훈련 부하 ${loadWord}`}
          accessibilityHint={hasLoad ? (loadOpen ? '접기' : '자세히 보기') : undefined}>
          <Text style={s.insightLabel}>훈련 부하</Text>
          <View style={[s.loadRow, { marginTop: rv(6) }]}>
            <View style={[s.loadDot, { backgroundColor: loadColor }]} />
            <Text style={s.loadWord} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{loadWord}</Text>
            {hasLoad && <Ionicons name={loadOpen ? 'chevron-up' : 'chevron-down'} size={ri(ICON.tag)} color={T3} />}
          </View>
        </Pressable>
      </View>
      {loadOpen && hasLoad && (
        <View style={s.loadDetail} testID="home-week-load-detail">
          <TrainingLoadCard load={load} unit={unit} embedded />
        </View>
      )}
    </View>
  );
}

// (로테이션 인사이트 패널 = RotationInsightPanel.tsx. 2026-07-22 에 신발 탭으로 옮겼다가
//  2026-07-26 민우님 지시로 홈으로 복귀 — '오늘 어떤 신발로 달릴까'를 정하는 자리가 홈이라,
//  로테이션 정보도 그 결정 곁에 있어야 한다. 신발 탭에서는 제거(집은 하나).)

// 수익화 v1(차별점 정합): 선택 신발이 '교체' 등급이면 같은 카테고리의 다음 러닝화를
// 추천한다(구매 의도 최고 시점의 contextual 추천 — 배너광고 아님). 쇼핑몰 검색 링크는
// lib/affiliate(순수)에서 만들고 Linking.openURL로 외부에서 연다. 투명성 안내(제휴 가능성+
// '러너 우선')를 하단에 명시한다. 시드 DB가 없거나 추천이 비면 통째로 숨는다.
// 제휴/수익화(쇼핑 링크 + 제휴 고지) 보류 — 사용자 요청으로 프로덕션 숨김(2026-07-20).
// 재활성화: 아래 렌더타임 게이트를 제거(또는 조건 반전). 로직·카피는 그대로 보존.
// 테스트는 렌더 전 globalThis.__KEEGO_TEST_NEXTSHOP__=true 로 추천/쇼핑/고지 로직을 계속 검증한다.
function NextShoeCard({ shoe }: { shoe: Shoe }) {
  const recs = recommendNextShoes({ brand: shoe.brand, model: shoe.model }, 3);
  const hidden = (globalThis as any).__KEEGO_TEST_NEXTSHOP__ !== true; // 프로덕션 숨김(테스트만 노출)
  if (hidden || recs.length === 0) return null;
  const open = (url: string) => { Promise.resolve(Linking.openURL(url)).catch(() => {}); };
  return (
    <View testID="home-next-shoe" style={s.nextWrap}>
      <SectionTitle style={s.sectionLabel}>이제 교체할 때 — 다음 러닝화</SectionTitle>
      <View style={s.nextCard}>
        <Text style={s.nextSub}>
          <Text style={{ color: T2, fontWeight: '600' }}>{shoe.model}</Text>의 수명이 거의 다 됐어요. 같은 용도의 다음 신발이에요.
        </Text>
        {recs.map((r, i) => (
          <View key={`${r.brand}-${r.model}`} style={[s.nextRow, i > 0 && s.nextRowSep]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.nextBrand} numberOfLines={1}>{r.brand}</Text>
              <Text style={s.nextModel} numberOfLines={1}>{r.model}</Text>
              <Text style={s.nextCat}>{categoryLabelKo[r.category]}</Text>
            </View>
            <View style={s.shopBtns}>
              {buildShopLinks(r).map((link) => (
                <Pressable
                  key={link.shop}
                  onPress={() => open(link.url)}
                  accessibilityRole="link"
                  accessibilityLabel={`${r.brand} ${r.model} ${link.shop}에서 보기`}
                  style={({ pressed }) => [s.shopBtn, pressed && s.pressed]}>
                  <Text style={s.shopBtnTxt}>{link.shop}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <Text style={s.nextDisclosure}>{AFFILIATE_DISCLOSURE}</Text>
      </View>
    </View>
  );
}

// 빈 상태 — design-reference/first-shoe 의 대시 슬롯 카드(신발탭 FirstShoeScreen 과 동일).
// 빈 홈 = 채워진 홈의 유령 — 히어로 카드 자리에 GhostShoeCard(유리 표면·빈 링·유리 CTA).
// 점선 슬롯 + 발광 플러스 배지(구 문법)는 폐기(폴리싱 2026-07-03, 유리 시스템 정합).
function EmptyHome({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.empty}>
      <Rise>
        <GhostShoeCard width={HERO_W} onPress={onAddShoe} />
      </Rise>
      <Rise delay={80}>
        {/* 문구는 screens/KeegoHome 단일 소스 — 신발 탭 빈 상태와 같은 문장이어야 한다. */}
        <Text style={s.emptyPhilosophy}>{EMPTY_SHOE_LINE}</Text>
      </Rise>
    </View>
  );
}

function HomeScreen({
  shoes = SHOES, onStart, onAddShoe, onTab,
  activeIdx: activeIdxProp, onSelect, unit = 'km', week,
  onOpenShoe, forecast, progression,
  onRefresh, lastSyncAt: _lastSyncAt, userName,
  weeklyGoalKm = 0, weekDays = [], weekTodayIdx = -1, onChangeWeeklyGoal, load, rotation,
}: {
  // 로테이션 인사이트(신발 탭 → 홈 복귀, 2026-07-26) — App 이 recommendRotation 파생값을
  // 주입한다. 표시 전용이고, 활성 2켤레 미만이면 패널이 스스로 숨는다.
  rotation?: RotationPick[];
  shoes?: Shoe[];
  userName?: string;
  // 이번 주 러닝 카드의 주간 목표(km). 0 = 목표 없음(히어로에 '목표 정하기' 초대).
  weeklyGoalKm?: number;
  // 이번 주 월~일(7칸) 달림 여부 + 오늘 칸(0=월..6=일, 없으면 -1) — 히어로 스트릭 점.
  // 마이탭 스트릭 카드가 쓰던 요일 배열과 같은 소스(App: weekBuckets)를 주입한다.
  weekDays?: boolean[];
  weekTodayIdx?: number;
  // 주간 목표 변경 위임 — App 의 changeGoal(단일 진실원)로 배선. 있으면 히어로 탭이
  // 주간 목표 스테퍼 바텀시트를 연다(없으면 히어로는 표시 전용).
  onChangeWeeklyGoal?: (km: number) => void;
  // 선택(히어로) 신발의 교체 예측(App이 실효마모 모델로 계산해 내려준다). ok/overdue일 때
  // 히어로에 ETA 한 줄을 보강한다. 표시 전용(없으면 숨김).
  forecast?: ReplacementForecast | null;
  week?: WeekStats;
  dateLabel?: string;
  onStart?: (idx: number) => void;
  onAddShoe?: () => void;
  onTab?: (i: number) => void;
  // (로테이션 인사이트는 신발 탭으로 이관 — 심사 #13, 2026-07-22. rotation/onPickShoe prop 제거.)
  // 선택 신발을 App이 소유(제어 모드): activeIdx+onSelect가 함께 오면 외부 상태를
  // 따른다. 둘 다 없으면 기존처럼 내부 상태로 동작(하위호환).
  activeIdx?: number;
  onSelect?: (i: number) => void;
  unit?: Unit;
  onOpenShoe?: (shoeId: string) => void;
  // 진척 홈 노출 — 홈 다이어트 후 남은 표면은 인사 옆 장착 타이틀 pill 하나.
  // App 이 getProgression 파생값을 내려준다. 미주입이면 pill 숨김(표시 전용).
  progression?: HomeProgression | null;
  // 훈련 부하(재노출 2026-07-18) — App 이 assessTrainingLoad 파생값을 내려준다.
  // 홈 계약은 침묵 기본: confident + caution/high 에서만 한 줄 시그널(표시 전용).
  load?: TrainingLoadAssessment | null;
  // 당겨서 새로고침 — 서버 재fetch + pending flush 재시도(App 의 initUser/sync 재진입).
  // RN 내장 RefreshControl 만 사용한다(새 네이티브 0). 미주입이면 RefreshControl 을 달지
  // 않아 기존 홈과 100% 하위호환(표시 전용). 동기/비동기 모두 허용(완료 시 스피너 정지).
  onRefresh?: () => void | Promise<void>;
  // 마지막 동기화 성공 시각(epoch ms). 인사 영역 칩에 '방금 동기화'/'N분 전'으로 표시한다.
  // null/미주입이면 '동기화 안 됨' 칩(또는 미표시) — 표시 전용(lib/syncStatus 가 라벨 생성).
  lastSyncAt?: number | null;
}) {
  const [internalIdx, setInternalIdx] = useState(0);
  // 주간 목표 스테퍼 시트 — WeekCard 히어로 탭이 연다(값 변경은 onChangeWeeklyGoal 위임).
  const [goalSheet, setGoalSheet] = useState(false);
  // 당겨서 새로고침 스피너 상태. onRefresh(서버 재fetch/pending flush)가 끝나면 내린다.
  // onRefresh 가 던져도 finally 로 스피너를 반드시 내려 멈춤 상태로 끼지 않게 한다.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } catch { /* 새로고침 실패는 스피너만 내리고 조용히 무시 */ }
    finally { setRefreshing(false); }
  };
  const controlled = activeIdxProp != null && typeof onSelect === 'function';
  const rawIdx = controlled ? (activeIdxProp as number) : internalIdx;
  const idx = Math.min(Math.max(0, rawIdx), Math.max(0, shoes.length - 1));
  const select = (i: number) => { if (controlled) onSelect?.(i); else setInternalIdx(i); };
  const active = shoes[idx];
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.screen, { paddingTop: insets.top }]} testID="home-screen">
      {/* 배경 = 무채 앰비언트만(형제 탭과 동일) — 사진 배경 실험은 실기기 확인 후 제거
          (사용자 확정 2026-07-16: GLASS.fill 이 사진을 못 가려 프로스트가 아니라 반투명 판,
          홈만 스킨이 달라 4탭 조명 문법이 분열됐다). */}
      <AmbientBackdrop />
      <TopBar onAddShoe={onAddShoe} />
      {/* 콘텐츠는 스크롤되고 TabBar는 화면 바닥에 고정된다(신발 많을 때 탭바가 밀려 사라지던 문제 해결) */}
      {/* 당겨서 새로고침 — RN 내장 RefreshControl 만(새 네이티브 0). onRefresh 가 있을 때만 단다. */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} colors={[ACCENT]} /> : undefined}>
      <View style={s.greetWrap}>
        <Text style={s.greet} numberOfLines={active ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.82}>
          {active
            ? '오늘의 신발'
            : `${(userName ?? '').trim() ? `${(userName ?? '').trim()}님,\n` : ''}첫 러닝화를 등록해볼까요?`}
        </Text>
        {/* 동기화 상태 칩 제거 — 사용자 요청(불필요한 '동기화 안 됨' 표시). 동기화는
            백그라운드 자동이며, 당겨서 새로고침(RefreshControl)은 그대로 동작한다. */}
        {/* 장착 타이틀 — 인사(닉네임) 옆/아래 한 줄. 진척 띠 색과 분리해 절제(T2 회색). */}
        {progression?.equippedTitle ? (
          <View testID="home-equipped-title" style={s.equipPill}>
            <Ionicons name="bookmark" size={ri(ICON.tag)} color={ACCENT} />
            <Text style={s.equipPillTxt} numberOfLines={1}>{progression.equippedTitle}</Text>
          </View>
        ) : null}
      </View>
      {active ? (
        <>
          {/* shoe-first 주인공: 풀폭 캐러셀(좌우 스와이프). 활성 카드가 히어로.
              '오늘의 신발' 섹션 라벨 행은 제거(헤더 다이어트, 폴리싱 2026-07-02) — 인사말이
              묻고 카드가 바로 답하므로 라벨은 중복이었다. '전체 보기'도 신발 탭과 중복.
              섹션들은 Rise 로 60ms 스태거 등장(폴리싱 — 홈이 '켜지는' 물리감). */}
          <Rise>
            <ShoeCarousel shoes={shoes} activeIdx={idx} onSelect={select} unit={unit} onOpenShoe={onOpenShoe} onStart={onStart} />
          </Rise>
          {/* 가디언 — 교체 고려(80%+)/권장(90%+) 신발을 골랐을 때만 개입(부활, 2026-07-25
              IA 심사): 구 KeegoHome 화면 교체 때 유실돼 내구도 경고가 결정 시점에 점 색
              하나로만 말하던 회귀. 탭 = 해당 신발 상세. */}
          {(() => {
            const h = shoeHealth({ ...(active as any), total_km: (active as any).used } as any, []);
            const tier = wearTier(h.percentUsed);
            if (tier.key !== 'consider' && tier.key !== 'replace') return null;
            return (
              <Rise delay={60}>
                <Guardian
                  danger={tier.key === 'replace'}
                  pct={h.percentUsed}
                  onPress={onOpenShoe && active?.id ? () => onOpenShoe(String(active.id)) : undefined}
                />
              </Rise>
            );
          })()}
          {/* 부상위험 시그널 제거(2026-07-05 애널리틱스 다이어트): 아이폰 단독의 얇은
              데이터로 '오늘 쉬어라'를 처방하는 건 러너의 자율을 침범하고(선 넘음), TSB
              '오늘 컨디션'과도 중복이었다. 신발 마모 경고(구체·측정가능)는 신발 카드/상세의
              InjuryBanner 가 계속 담당한다 — 코칭 계층만 걷어내고 성취/사실 지표는 유지. */}
          {/* 이번 주 러닝 — 내 활동 요약(거리·횟수·평균 페이스). 신발 상태(히어로)와 별개로
              '내가 얼마나 뛰었나'를 보여준다. 자세히 → 기록 탭. 신발 마모는 히어로/상세에. */}
          <Rise delay={120}>
            <View style={[s.sectionRow, { marginTop: rv(4) }]}>
              <SectionTitle style={s.sectionLabelInline}>이번 주 러닝</SectionTitle>
              <Pressable onPress={() => onTab?.(2)} hitSlop={12} accessibilityRole="button" accessibilityLabel="기록 전체 보기">
                <Text style={s.sectionMore}>전체 보기 ›</Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: GUTTER }}>
              {/* 원카드(B안) — 훈련 부하는 카드 3열째 셀로 흡수(구 별도 compact 카드 폐지). */}
              <WeekCard
                week={week} unit={unit} weeklyGoalKm={weeklyGoalKm}
                weekDays={weekDays} weekTodayIdx={weekTodayIdx} load={load}
                onPressGoal={onChangeWeeklyGoal ? () => setGoalSheet(true) : undefined}
              />
            </View>
          </Rise>
          {/* 로테이션 인사이트 — '오늘 어떤 신발로 달릴까'를 정하는 자리가 홈이므로
              신발 탭에서 되돌렸다(민우님 2026-07-26). 행 탭 = 그 신발 상세.
              활성 2켤레 미만이면 패널이 스스로 null 을 반환해 통째로 숨는다. */}
          {!!rotation && rotation.length > 0 && (
            <Rise delay={160}>
              <RotationInsightPanel
                rotation={rotation}
                onPickShoe={onOpenShoe ? (id) => onOpenShoe(String(id)) : undefined}
              />
            </Rise>
          )}
          {/* (체력 트렌드 FitnessCard → 기록 탭 인사이트로 이동, 진척 띠 → 마이탭으로
              일원화 — MVP 홈 다이어트. 홈은 '오늘 신발 고르고 뛴다' 저니에 집중한다.) */}
          {/* 수익화 v1: 다음 러닝화 추천 노출 트리거 — Slice 6 교체 예측 기반(overdue/임박).
              forecast가 주입되면 shouldRecommendNextShoe로 판정하고, 없으면 사용률 임계
              (≥SHOE_REPLACE_PCT=90%) 폴백을 보존한다(구 3단계 condition==='교체' 비교를
              숫자 임계로 강등 — 2026-07-11 4단계 단일화, 트리거 시점 동일). */}
          {(forecast
            ? shouldRecommendNextShoe(forecast)
            : active.max > 0 && (active.used / active.max) * 100 >= SHOE_REPLACE_PCT) && (
            <NextShoeCard shoe={active} />
          )}
        </>
      ) : (
        <EmptyHome onAddShoe={onAddShoe} />
      )}
      </ScrollView>
      <TabBar active={0} onTab={(i) => onTab?.(i)} />
      {/* 주간 목표 스테퍼 시트 — 시그니처 420ms BottomSheet + 마이탭 카드가 쓰던 스테퍼
          재사용. 값은 App changeGoal(단일 진실원)으로 즉시 위임(홈·전 화면 동시 갱신). */}
      <BottomSheet visible={goalSheet} onClose={() => setGoalSheet(false)} title="주간 목표" testID="home-goal-sheet">
        <View style={{ paddingHorizontal: GUTTER, paddingBottom: rv(8) }}>
          <WeeklyGoalStepper valueKm={weeklyGoalKm} unit={unit} onChange={(km) => onChangeWeeklyGoal?.(km)} />
        </View>
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  // 탭 독이 콘텐츠 위에 떠 있으므로(absolute 유리 독) 마지막 카드가 가리지 않게 여백 확보.
  scrollContent: { paddingBottom: TABBAR_CLEARANCE },
  // 누름 표준(DESIGN §6) — 사설 0.85/0.98 폐지, MOTION.press 토큰으로 통일(2026-07-25).
  pressed: { transform: [{ scale: MOTION.press.scale }], opacity: MOTION.press.opacity },
  row: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },

  topbar: { paddingTop: rv(8), paddingHorizontal: GUTTER, paddingBottom: SPACE.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { minHeight: rs(34), paddingHorizontal: rs(14), borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(T1, 0.2), backgroundColor: CARD_HI, flexDirection: 'row', alignItems: 'center', gap: rv(6) },
  addBtnText: { color: T1, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', includeFontPadding: false },

  // paddingBottom 20: '오늘의 신발' 라벨 행을 걷어낸 뒤 인사말과 히어로 카드가 붙어
  // 보인다는 피드백 — 라벨이 차지하던 만큼 숨 쉴 여백을 직접 준다.
  // 인사말 정렬은 미정(인사말↔카드 vs 인사말↔keego 상충) — 실제 화면 보고 결정. 지금은 gutter(20).
  greetWrap: { paddingHorizontal: GUTTER, paddingTop: rv(4), paddingBottom: rv(10) },
  date: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, letterSpacing: 0.2 },
  greet: { color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.5, marginTop: rv(3), lineHeight: rf(26) },

  // 마지막 동기화 칩 — 인사 아래 절제된 회색(아이콘 T3 + 텍스트 T3). 당겨서 새로고침 안내.
  syncChip: { flexDirection: 'row', alignItems: 'center', gap: rv(4), alignSelf: 'flex-start', marginTop: rv(10), backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: rs(8), paddingVertical: rv(4) },
  syncChipTxt: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', letterSpacing: 0.1 },

  // 장착 타이틀 칩(인사 옆) — 절제: 액센트 아이콘 + T2 텍스트, 옅은 카드 배경.
  equipPill: { flexDirection: 'row', alignItems: 'center', gap: rv(4), alignSelf: 'flex-start', marginTop: rv(10), backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: rs(10), paddingVertical: rv(4) },
  equipPillTxt: { color: T2, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 0.1 },



  // (goalCard·streakChip·weekTop·gauge 스타일 삭제 — B안 원카드 개편으로 진행 바·
  //  '주간 목표 N km' 텍스트·'N일 연속' 칩 폐지, 2026-07-25)

  // 이번 주 원카드 히어로 — 좌: 거리/목표 숫자축, 우: 월~일 스트릭 점 7칸.
  weekHero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  weekHeroLeft: { flexDirection: 'row', alignItems: 'flex-end', flexShrink: 1, minWidth: 0 },
  // 거리 = NUMERIC.lg(숫자 단일 램프) · Jost · tabular-nums — 카드의 한 숫자축.
  weekKm: { color: T1, fontFamily: DISPLAY, ...NUMERIC.lg, fontVariant: ['tabular-nums'] },
  // ' / 95 km' 목표축 — T3 · 16급 600(목표는 조용한 분모, 진행 바 없이 축이 진행을 말한다).
  weekGoalAxis: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.body.fontSize, fontWeight: '600', letterSpacing: -0.2, fontVariant: ['tabular-nums'], marginBottom: rv(3) },
  // 목표 미설정 초대 — 조용한 T3 라벨(히어로 전체가 탭 타깃).
  weekGoalSet: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginLeft: rs(8), marginBottom: rv(4) },
  // 스트릭 점 7칸 — 달림=BRAND, 쉼=T1 16%, 오늘=흰 50% 아웃라인 링.
  weekDays: { flexDirection: 'row', alignItems: 'center', gap: rs(5) },
  weekDot: { width: rs(8), height: rs(8), borderRadius: RADIUS.pill },
  weekDotOn: { backgroundColor: BRAND },
  weekDotOff: { backgroundColor: withAlpha(T1, 0.16) },
  weekDotToday: { borderWidth: rs(1.5), borderColor: withAlpha(ACCENT, 0.5) },
  // 훈련 부하 셀 — 상태 워드(FONT — Jost 는 숫자 전용) + 레벨 점 + ⌄.
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: rs(5) },
  loadDot: { width: rs(7), height: rs(7), borderRadius: RADIUS.pill },
  loadWord: { color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2, flexShrink: 1 },
  // 부하 인라인 상세 — 그리드 아래 헤어라인으로 구획(카드 이중 표면 금지 — embedded).
  loadDetail: { marginTop: SPACE.lg, paddingTop: SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },

  // 현재 상태 인사이트 카드(사용거리 | 교체예상) — 활성 신발 반영
  weekEmptyTxt: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(19) },
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  insightCard: { backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', padding: SPACE.lg },
  insightGrid: { flexDirection: 'row', alignItems: 'flex-start' },
  insightDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: withAlpha(T1, 0.08), marginHorizontal: SPACE.lg },
  insightLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: -0.1 },
  insightNum: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  insightUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginLeft: rs(2) },
  insightWeeks: { fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.4, marginTop: rv(6) },
  insightSub: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginTop: rv(3) },
  insightPurpose: { marginTop: SPACE.lg, paddingTop: SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  // 추천 용도 자연어 문장(핸드오프 lead 정합: 16px·lineHeight 23).
  insightPurposeText: { color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '500', letterSpacing: -0.2, lineHeight: rf(22), marginTop: rv(6) },
  insightTags: { flexDirection: 'row', flexWrap: 'wrap', gap: rv(6), marginTop: rv(12) },
  insightTag: { backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: rs(12), paddingVertical: rv(4) },
  insightTagText: { color: T2, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600' },

  sectionLabel: { paddingHorizontal: GUTTER, paddingBottom: SPACE.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingTop: SPACE.sm, paddingBottom: SPACE.sm },
  sectionLabelInline: { paddingHorizontal: rs(0), paddingBottom: rv(0) },
  // '전체 보기 ›' = 탭 가능한 링크 → T3(보조). T4는 비상호작용 회색이라 링크가 죽어 보였다.
  sectionMore: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },

  // 오늘의 신발 캐러셀 — 페이지 도트 + 스와이프 힌트(목업 정합)
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: rv(6), marginTop: SPACE.md },
  pageDot: { width: rs(5), height: rs(5), borderRadius: rs(3), backgroundColor: withAlpha(T1, 0.22) },
  pageDotOn: { width: rs(16), backgroundColor: T2 },

  // (홈 챌린지 카드 chal* 스타일 삭제 — 소비처가 사라진 죽은 스타일 13종, 2026-07-25)

  // 로테이션 인사이트 행

  // 수익화 v1: 교체 시점 '다음 러닝화' 추천 카드(오렌지 절제 — 테두리만 액센트)
  nextWrap: { marginTop: SPACE.lg },
  nextCard: { marginHorizontal: GUTTER, backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.3), padding: SPACE.lg },
  nextSub: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(18), marginBottom: SPACE.sm },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: rv(12) },
  nextRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  nextBrand: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.micro.fontSize, fontWeight: '500', letterSpacing: 1.2 },
  nextModel: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.body.fontSize, fontWeight: '600', letterSpacing: -0.1, marginTop: rv(3) },
  nextCat: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(3) },
  shopBtns: { flexDirection: 'row', gap: rv(6) },
  shopBtn: { borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.1), paddingHorizontal: rs(12), paddingVertical: rv(6) },
  shopBtnTxt: { color: ACCENT, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600' },
  nextDisclosure: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, lineHeight: rf(15), marginTop: SPACE.md, opacity: 0.85 },



  // 빈 홈 — 고스트 카드(KeegoHome GhostShoeCard) + 철학 한 줄. 구 대시 슬롯 스타일 폐기.
  // 빈 홈 비율 = 2줄 인사말 + paddingTop 20 으로 성립(고스트 주간 카드는 과해서 제거 — 사용자 확정 07-10).
  empty: { paddingTop: rv(20), alignItems: 'center', gap: rv(26) },
  emptyPhilosophy: { textAlign: 'center', color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(24) },
});

// ─── React.memo — 탭 화면은 자기 props 가 바뀔 때만 렌더한다 (2026-08-04 실측) ───
// 왜: App.tsx 는 useState 54개를 가진 단일 거대 컴포넌트다. 그중 **아무거나 하나**가
// 바뀌면 App 이 리렌더되고, memo 가 없으면 마운트된 탭 화면이 전부 따라 렌더된다.
// 탭을 유지(display 토글)하도록 바꾼 뒤엔 그 대가가 4배가 됐다 — 갤럭시 S10e 실측에서
// 버벅 프레임이 48.75%→52% 로 **오히려 악화**했다. memo 가 그 전제를 복구한다.
// ⚠️ 효과의 전제: props 가 렌더마다 새 참조면 memo 는 무력하다. App 쪽에서 인라인 화살표
//    함수와 즉석 배열/객체를 useCallback/useMemo 로 안정화해야 실제로 건너뛴다.
export default React.memo(HomeScreen);
