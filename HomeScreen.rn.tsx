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
  View, Text, ScrollView, Pressable, StyleSheet, Linking, Dimensions,
  RefreshControl, NativeSyntheticEvent, NativeScrollEvent, Animated, Easing,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Defs, RadialGradient as SvgRadial, Stop, Rect } from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import { ringColor } from './lib/ringColor';
import {
  BG, CARD_DIM, CARD_HI, HERO_BG, ACCENT, WARN, GOOD, T1, T2, T3, T4,
  FONT, DISPLAY, SPACE, RADIUS, GUTTER, withAlpha, Shoe, SHOES,
} from './theme';
import type { RankTier } from './lib/progression/types';
import { TabBar, TABBAR_CLEARANCE, KeegoWordmark, SectionTitle } from './primitives';
import { Unit } from './lib/units';
import { ShoeCard as KeegoShoeCard, GhostShoeCard } from './screens/KeegoHome';
import type { LoadRun } from './lib/trainingLoad';
import { RotationPick } from './lib/rotation';
import { recommendNextShoes, buildShopLinks, categoryLabelKo, AFFILIATE_DISCLOSURE } from './lib/affiliate';
import { type ReplacementForecast } from './lib/wearView';
import { shouldRecommendNextShoe } from './lib/recommendTrigger';

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


// 앰비언트 배경 — 활성 신발의 컨디션 색을 화면 상단에 최대 5.5% 라디얼로 깐다.
// '광원 효과'가 아니라 유리(엣지·탭바 블러)가 비칠 대상을 만드는 조명이다. 맨눈엔
// 거의 안 보이지만 유리 표면이 그 위를 지날 때 은은히 살아난다(글로우 금지 원칙과 양립).
function AmbientBackdrop({ tint }: { tint: string }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgRadial id="home-ambient" cx="50%" cy="12%" r="80%">
          <Stop offset="0" stopColor={tint} stopOpacity={0.055} />
          <Stop offset="0.55" stopColor={tint} stopOpacity={0.02} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </SvgRadial>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#home-ambient)" />
    </Svg>
  );
}

// 섹션 등장 스태거 — 마운트 시 살짝 떠오르며 페이드인(60ms 간격). 홈이 '켜지는' 느낌을
// 주는 유일한 전환 모션. JS 드라이버(false) — 코드베이스 관례(TabBar 등)이자
// react-test-renderer 호환(네이티브 드라이버는 테스트 렌더러에서 nativeTag 연결이 깨짐).
// 420ms 단발이라 JS 드라이버로도 체감 차이 없음.
function Rise({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop(); // 언마운트 시 타이머 정리(테스트/화면전환 누수 방지)
  }, [v, delay]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

function TopBar({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.topbar}>
      {/* 홈 헤더만 브랜드 오렌지(사용자 확정 2026-07-04) — 공유카드·로그인은 흰색 유지. */}
      <KeegoWordmark size={ri(24)} style={{color: ACCENT}} />
      <Pressable
        onPress={onAddShoe}
        accessibilityRole="button"
        accessibilityLabel="신발 추가"
        hitSlop={8}
        style={({ pressed }) => [s.addBtn, pressed && s.pressed]}>
        <Text style={s.addBtnText}>신발 추가</Text>
        <Ionicons name="add" size={ri(15)} color={T1} />
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
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true });
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
        <View style={s.pageDots}>
          {shoes.map((_, i) => <View key={i} style={[s.pageDot, i === activeIdx && s.pageDotOn]} />)}
        </View>
      )}
    </View>
  );
}

// 이번 주 러닝 — 내 활동 요약(거리·횟수·평균 페이스). week(WeekStats)는 App 이 이번 주
// (월~일) 런에서 파생해 주입한다. 신발 마모(히어로)와 분리된 '내 노력' 지표. 표시 전용.
function WeekCard({ week, unit = 'km', weeklyGoalKm = 0, streakDays = 0 }: { week?: WeekStats; unit?: Unit; weeklyGoalKm?: number; streakDays?: number }) {
  const km = week?.km ?? '0.0';
  const runs = week?.runs ?? 0;
  const pace = week?.pace && week.pace !== '--' ? week.pace : '--'; // 앱 전역 '데이터 없음' 표기 통일(--)
  const goalPct = weeklyGoalKm > 0 ? Math.min(100, Math.round(((parseFloat(km) || 0) / weeklyGoalKm) * 100)) : 0;
  // 이번 주 런 0 이면 0의 그리드 대신 초대 한 줄(노이즈 감사 2026-07-05 — '0.0km ·
  // 0회 · --'는 행동을 못 이끈다). 주간 목표 바는 설정돼 있으면 유지(목표가 곧 초대).
  if (runs === 0) {
    return (
      <View style={s.insightCard} testID="home-week">
        {weeklyGoalKm > 0 && (
          <View style={s.weekTop}>
            <View />
            <Text style={s.weekGoalTxt} testID="home-week-goal">주간 목표 {weeklyGoalKm}{unit}</Text>
          </View>
        )}
        {weeklyGoalKm > 0 && (
          <View style={[s.gauge, { marginTop: rv(8), marginBottom: rv(10) }]}>
            <View testID="home-week-goal-bar" style={[s.gaugeFill, { width: '0%', backgroundColor: ACCENT }]} />
          </View>
        )}
        <Text style={s.weekEmptyTxt} testID="home-week-empty">이번 주 첫 러닝을 시작해보세요</Text>
      </View>
    );
  }
  return (
    <View style={s.insightCard} testID="home-week">
      {/* 주간 목표 진행 + 연속 스트릭(있을 때만) — lib/goals 배선. */}
      {(streakDays > 0 || weeklyGoalKm > 0) && (
        <View style={s.weekTop}>
          {streakDays > 0 ? (
            <View style={[s.streakChip, s.streakChipOn]} testID="home-week-streak" accessibilityRole="text" accessibilityLabel={`${streakDays}일 연속 러닝`}>
              <Ionicons name="flame" size={ri(12)} color={ACCENT} />
              <Text style={s.weekStreakTxt}>{streakDays}일 연속</Text>
            </View>
          ) : <View />}
          {weeklyGoalKm > 0 ? (
            // % 텍스트는 제거 — 아래 진행 바가 %를 시각으로 말한다(숫자 중복 제거, 폴리싱).
            <Text style={s.weekGoalTxt} testID="home-week-goal">주간 목표 {weeklyGoalKm}{unit}</Text>
          ) : null}
        </View>
      )}
      {weeklyGoalKm > 0 && (
        <View style={[s.gauge, { marginTop: rv(8), marginBottom: rv(4) }]}>
          <View testID="home-week-goal-bar" style={[s.gaugeFill, { width: `${goalPct}%`, backgroundColor: ACCENT }]} />
        </View>
      )}
      <View style={s.insightGrid}>
        <View style={{ flex: 1 }}>
          <Text style={s.insightLabel}>거리</Text>
          <View style={[s.baselineRow, { marginTop: rv(6) }]}>
            <Text style={s.insightNum} testID="home-week-km">{km}</Text><Text style={s.insightUnit}>{unit}</Text>
          </View>
        </View>
        <View style={s.insightDivider} />
        <View style={{ flex: 1 }}>
          <Text style={s.insightLabel}>횟수</Text>
          <View style={[s.baselineRow, { marginTop: rv(6) }]}>
            <Text style={s.insightNum} testID="home-week-runs">{runs}</Text><Text style={s.insightUnit}>회</Text>
          </View>
        </View>
        {pace !== '--' && (
          <>
            <View style={s.insightDivider} />
            <View style={{ flex: 1 }}>
              <Text style={s.insightLabel}>평균 페이스</Text>
              <View style={[s.baselineRow, { marginTop: rv(6) }]}>
                <Text style={s.insightNum} testID="home-week-pace">{pace}</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// 인사이트 배지 색 토큰 — 추천 언어 없이 데이터 기반으로만 표시.
const INSIGHT_TONE: Record<string, { bg: string; text: string }> = {
  neutral: { bg: CARD_HI,                         text: T3     },
  warn:    { bg: withAlpha(WARN,   0.12),          text: WARN   },
  good:    { bg: withAlpha(GOOD,   0.12),          text: GOOD   },
  accent:  { bg: withAlpha(ACCENT, 0.12),          text: ACCENT },
};

// RotationPick 의 reason 문자열(lib/rotation 생성)에서 UI 인사이트를 파생한다.
// 추천 언어('오늘 추천' 등) 없이 실제 사용 데이터(휴식 일수·빈도)만 표시.
function insightBadge(
  pick: RotationPick,
  index: number,
  total: number,
): { badge: string; description: string; toneKey: string } {
  const r = pick.reason;
  const daysMatch = r.match(/(\d+)일 휴식/);
  const days      = daysMatch ? parseInt(daysMatch[1], 10) : null;
  const neverWorn = r.includes('아직 안 신은');
  const usedToday = r.includes('오늘 신은');
  const isCarbon  = r.includes('카본화');
  const isFirst   = index === 0;
  const isLast    = total > 1 && index === total - 1;

  if (neverWorn)
    return { badge: '미착용',       description: '아직 한 번도 신지 않은 신발이에요.',      toneKey: 'neutral' };
  if (usedToday && isLast)
    return { badge: '사용 빈도 높음', description: '요즘 가장 많이 신는 신발이에요.',    toneKey: 'accent'  };
  if (usedToday)
    return { badge: '오늘 사용',     description: '오늘 신은 신발이에요.',                   toneKey: 'good'    };
  if (isCarbon) {
    const dText = days != null ? `${days}일 미사용` : '휴식중';
    return { badge: dText,           description: '레이스를 위해 아껴두는 신발이에요.',              toneKey: 'neutral' };
  }
  if (isLast)
    return { badge: '사용 빈도 높음', description: '요즘 가장 많이 신는 신발이에요.',    toneKey: 'accent'  };
  if (isFirst && days != null && days > 6)
    return { badge: `${days}일 미사용`, description: '최근 가장 오래 쉬고 있는 신발이에요.', toneKey: days > 14 ? 'warn' : 'neutral' };
  if (days != null && days > 14)
    return { badge: '장기 휴식중',   description: '로테이션에 포함해보세요.',                toneKey: 'warn'    };
  if (days != null && days > 0)
    return { badge: `${days}일 미사용`, description: '로테이션에 포함해보세요.',             toneKey: 'neutral' };
  return   { badge: '로테이션 필요', description: '균형 잡힌 로테이션을 위해 활용해보세요.', toneKey: 'neutral' };
}

// 로테이션 인사이트 — 신발별 실제 사용 데이터를 기반으로 로테이션 현황을 표시한다.
// 추천(어떤 신발을 신어라)이 아닌 인사이트(사용 패턴이 어떻다)를 제공한다.
// 행 탭은 그 신발을 홈 히어로로 포커스한다(추천이 아닌 선택 보조). 표시 전용 배지.
// 활성 2켤레+ 일 때만 rotation 이 채워지므로, 비었으면 통째로 숨긴다.
function RotationInsightPanel({ rotation, onPickShoe }: { rotation: RotationPick[]; onPickShoe?: (shoeId: string) => void }) {
  if (!rotation || rotation.length === 0) return null;
  return (
    <View testID="home-rotation" style={s.rotaWrap}>
      <SectionTitle style={s.sectionLabel}>로테이션 인사이트</SectionTitle>
      <View style={s.rotaCard}>
        {rotation.map((p, i) => {
          const { badge, description, toneKey } = insightBadge(p, i, rotation.length);
          const tone = INSIGHT_TONE[toneKey] ?? INSIGHT_TONE.neutral;
          return (
            <Pressable
              key={p.shoe.id ?? i}
              testID={`rotation-pick-${i}`}
              onPress={onPickShoe ? () => onPickShoe(p.shoe.id) : undefined}
              accessibilityRole="button"
              accessibilityLabel={`${p.shoe.brand} ${p.shoe.model}`}
              style={({ pressed }) => [s.insightRow, i > 0 && s.insightRowSep, pressed && onPickShoe ? s.pressed : null]}>
              <View style={s.insightRowTop}>
                <Text style={s.rotaBrand} numberOfLines={1}>{p.shoe.brand}</Text>
                <View style={[s.insightBadgeChip, { backgroundColor: tone.bg }]}>
                  <Text style={[s.insightBadgeText, { color: tone.text }]}>{badge}</Text>
                </View>
              </View>
              <Text style={s.rotaModel} numberOfLines={1}>{p.shoe.model}</Text>
              <Text style={s.insightDesc} numberOfLines={2}>{description}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// 수익화 v1(차별점 정합): 선택 신발이 '교체' 등급이면 같은 카테고리의 다음 러닝화를
// 추천한다(구매 의도 최고 시점의 contextual 추천 — 배너광고 아님). 쇼핑몰 검색 링크는
// lib/affiliate(순수)에서 만들고 Linking.openURL로 외부에서 연다. 투명성 안내(제휴 가능성+
// '러너 우선')를 하단에 명시한다. 시드 DB가 없거나 추천이 비면 통째로 숨는다.
function NextShoeCard({ shoe }: { shoe: Shoe }) {
  const recs = recommendNextShoes({ brand: shoe.brand, model: shoe.model }, 3);
  if (recs.length === 0) return null;
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
        <Text style={s.emptyPhilosophy}>
          신발이 얼마나 닳았는지 기록해서,{'\n'}부상 없이 더 오래 달리게 해드려요.
        </Text>
      </Rise>
    </View>
  );
}

export default function HomeScreen({
  shoes = SHOES, dateLabel = '', onStart, onAddShoe, onTab,
  activeIdx: activeIdxProp, onSelect, unit = 'km', week, rotation, onPickShoe,
  onOpenShoe, forecast, progression,
  onRefresh, lastSyncAt: _lastSyncAt, userName, runs = [], onOpenInjuryRisk,
  weeklyGoalKm = 0, streakDays = 0, todayISO = '',
}: {
  shoes?: Shoe[];
  userName?: string;
  // 이번 주 러닝 카드의 주간 목표(km)·연속 스트릭(일). 0이면 해당 표시 숨김(표시 전용).
  weeklyGoalKm?: number;
  streakDays?: number;
  // 오늘 날짜(YYYY-MM-DD) — 부상위험 시그널의 부하(ACWR) 계산 기준. App 이 today() 주입.
  todayISO?: string;
  // 선택(히어로) 신발의 교체 예측(App이 실효마모 모델로 계산해 내려준다). ok/overdue일 때
  // 히어로에 ETA 한 줄을 보강한다. 표시 전용(없으면 숨김).
  forecast?: ReplacementForecast | null;
  // 신발 id별 교체 예측 맵 — 캐러셀 카드마다 자기 신발 예측을 바로 보여준다(스와이프
  // 지연 제거). 미주입이면 active 카드만 forecast 로 폴백(테스트 호환).
  forecasts?: Record<string, ReplacementForecast | null>;
  week?: WeekStats;
  dateLabel?: string;
  onStart?: (idx: number) => void;
  onAddShoe?: () => void;
  onTab?: (i: number) => void;
  // 신발 로테이션 추천(App이 신발+런으로 recommendRotation 계산해 내려준다). 활성
  // 2켤레+ 에서만 채워지고, 비면 카드가 숨는다(1켤레/추천 없음). 표시 전용.
  rotation?: RotationPick[];
  // 추천 신발을 누르면 그 신발을 홈 히어로로 선택한다(shoe.id 기준 — picker 순서와
  // 다른 추천 순서를 id로 매핑해 잘못된 신발 선택을 막는다).
  onPickShoe?: (shoeId: string) => void;
  // 선택 신발을 App이 소유(제어 모드): activeIdx+onSelect가 함께 오면 외부 상태를
  // 따른다. 둘 다 없으면 기존처럼 내부 상태로 동작(하위호환).
  activeIdx?: number;
  onSelect?: (i: number) => void;
  unit?: Unit;
  onOpenShoe?: (shoeId: string) => void;
  // 진척 홈 노출 — 홈 다이어트 후 남은 표면은 인사 옆 장착 타이틀 pill 하나.
  // App 이 getProgression 파생값을 내려준다. 미주입이면 pill 숨김(표시 전용).
  progression?: HomeProgression | null;
  // 당겨서 새로고침 — 서버 재fetch + pending flush 재시도(App 의 initUser/sync 재진입).
  // RN 내장 RefreshControl 만 사용한다(새 네이티브 0). 미주입이면 RefreshControl 을 달지
  // 않아 기존 홈과 100% 하위호환(표시 전용). 동기/비동기 모두 허용(완료 시 스피너 정지).
  onRefresh?: () => void | Promise<void>;
  // 마지막 동기화 성공 시각(epoch ms). 인사 영역 칩에 '방금 동기화'/'N분 전'으로 표시한다.
  // null/미주입이면 '동기화 안 됨' 칩(또는 미표시) — 표시 전용(lib/syncStatus 가 라벨 생성).
  lastSyncAt?: number | null;
  // 부상위험 신호등(시그니처) — 전체 런(부하 ACWR 계산용). 활성 신발 마모와 융합.
  // 미주입이면 빈 배열 → 부하 신호 없이 신발만으로 판정(하위호환).
  runs?: LoadRun[];
  // 신호등 카드 탭 → 부상위험 상세(App 의 InjuryRiskScreen 오버레이). 없으면 카드 비탭.
  onOpenInjuryRisk?: () => void;
}) {
  const [internalIdx, setInternalIdx] = useState(0);
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
  // 앰비언트 조명 색 = 활성 신발의 컨디션 링 색(마모 기준). 신발이 없으면 액센트.
  const ambientTint = active && active.max > 0
    ? ringColor((active.used / active.max) * 100).solid
    : ACCENT;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <AmbientBackdrop tint={ambientTint} />
      <TopBar onAddShoe={onAddShoe} />
      {/* 콘텐츠는 스크롤되고 TabBar는 화면 바닥에 고정된다(신발 많을 때 탭바가 밀려 사라지던 문제 해결) */}
      {/* 당겨서 새로고침 — RN 내장 RefreshControl 만(새 네이티브 0). onRefresh 가 있을 때만 단다. */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ACCENT} colors={[ACCENT]} /> : undefined}>
      <View style={s.greetWrap}>
        {!!dateLabel && <Text style={s.date}>{dateLabel}</Text>}
        <Text style={s.greet}>
          {active
            ? '오늘은 어떤 신발로\n달려볼까요?'
            : `${(userName ?? '').trim() ? `${(userName ?? '').trim()}님,\n` : ''}첫 러닝화를 등록해볼까요?`}
        </Text>
        {/* 동기화 상태 칩 제거 — 사용자 요청(불필요한 '동기화 안 됨' 표시). 동기화는
            백그라운드 자동이며, 당겨서 새로고침(RefreshControl)은 그대로 동작한다. */}
        {/* 장착 타이틀 — 인사(닉네임) 옆/아래 한 줄. 진척 띠 색과 분리해 절제(T2 회색). */}
        {progression?.equippedTitle ? (
          <View testID="home-equipped-title" style={s.equipPill}>
            <Ionicons name="bookmark" size={ri(11)} color={ACCENT} />
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
          {/* 부상위험 시그널 제거(2026-07-05 애널리틱스 다이어트): 아이폰 단독의 얇은
              데이터로 '오늘 쉬어라'를 처방하는 건 러너의 자율을 침범하고(선 넘음), TSB
              '오늘 컨디션'과도 중복이었다. 신발 마모 경고(구체·측정가능)는 신발 카드/상세의
              InjuryBanner 가 계속 담당한다 — 코칭 계층만 걷어내고 성취/사실 지표는 유지. */}
          {/* 이번 주 러닝 — 내 활동 요약(거리·횟수·평균 페이스). 신발 상태(히어로)와 별개로
              '내가 얼마나 뛰었나'를 보여준다. 자세히 → 기록 탭. 신발 마모는 히어로/상세에. */}
          <Rise delay={120}>
            <View style={[s.sectionRow, { marginTop: SPACE.lg }]}>
              <SectionTitle style={s.sectionLabelInline}>이번 주 러닝</SectionTitle>
              <Pressable onPress={() => onTab?.(2)} hitSlop={8} accessibilityRole="button" accessibilityLabel="기록 전체 보기">
                <Text style={s.sectionMore}>전체 보기 ›</Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: SPACE.xl }}>
              <WeekCard week={week} unit={unit} weeklyGoalKm={weeklyGoalKm} streakDays={streakDays} />
            </View>
          </Rise>
          {/* (체력 트렌드 FitnessCard → 기록 탭 인사이트로 이동, 진척 띠 → 마이탭으로
              일원화 — MVP 홈 다이어트. 홈은 '오늘 신발 고르고 뛴다' 저니에 집중한다.) */}
          {/* 로테이션 인사이트(2켤레+에서만 채워짐, 비면 자동 숨김) */}
          <RotationInsightPanel rotation={rotation ?? []} onPickShoe={onPickShoe} />
          {/* 수익화 v1: 다음 러닝화 추천 노출 트리거 — Slice 6 교체 예측 기반(overdue/임박).
              forecast가 주입되면 shouldRecommendNextShoe로 판정하고, 없으면 기존
              condition==='교체' 폴백을 보존한다(회귀 방지). */}
          {(forecast ? shouldRecommendNextShoe(forecast) : active.condition === '교체') && (
            <NextShoeCard shoe={active} />
          )}
        </>
      ) : (
        <EmptyHome onAddShoe={onAddShoe} />
      )}
      </ScrollView>
      <TabBar active={0} onTab={(i) => onTab?.(i)} />

    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  // 탭 독이 콘텐츠 위에 떠 있으므로(absolute 유리 독) 마지막 카드가 가리지 않게 여백 확보.
  scrollContent: { paddingBottom: TABBAR_CLEARANCE },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: rv(7) },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },

  topbar: { paddingTop: rv(8), paddingHorizontal: GUTTER, paddingBottom: SPACE.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { height: rs(34), paddingHorizontal: rs(14), borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.2), backgroundColor: CARD_HI, flexDirection: 'row', alignItems: 'center', gap: rv(6) },
  addBtnText: { color: T1, fontFamily: FONT, fontSize: rf(14), fontWeight: '600' },

  // paddingBottom 20: '오늘의 신발' 라벨 행을 걷어낸 뒤 인사말과 히어로 카드가 붙어
  // 보인다는 피드백 — 라벨이 차지하던 만큼 숨 쉴 여백을 직접 준다.
  greetWrap: { paddingHorizontal: GUTTER, paddingTop: rv(8), paddingBottom: SPACE.xl },
  date: { color: T3, fontFamily: FONT, fontSize: rf(14), letterSpacing: 0.2 },
  greet: { color: T1, fontFamily: FONT, fontSize: rf(21), fontWeight: '500', letterSpacing: -0.4, marginTop: rv(3), lineHeight: rf(26) },

  // 마지막 동기화 칩 — 인사 아래 절제된 회색(아이콘 T3 + 텍스트 T3). 당겨서 새로고침 안내.
  syncChip: { flexDirection: 'row', alignItems: 'center', gap: rv(5), alignSelf: 'flex-start', marginTop: rv(10), backgroundColor: CARD_DIM, borderRadius: RADIUS.pill, paddingHorizontal: rs(9), paddingVertical: rv(4) },
  syncChipTxt: { color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '500', letterSpacing: 0.1 },

  // 장착 타이틀 칩(인사 옆) — 절제: 액센트 아이콘 + T2 텍스트, 옅은 카드 배경.
  equipPill: { flexDirection: 'row', alignItems: 'center', gap: rv(5), alignSelf: 'flex-start', marginTop: rv(10), backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: rs(10), paddingVertical: rv(4) },
  equipPillTxt: { color: T2, fontFamily: FONT, fontSize: rf(13), fontWeight: '600', letterSpacing: 0.1 },



  goalCard: { backgroundColor: CARD_DIM, borderRadius: rs(18), borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.06), padding: SPACE.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalInfo: { flex: 1, gap: rv(6), minWidth: 0 },
  goalSub: { color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '500' },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: rv(5), alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingHorizontal: rs(9), paddingVertical: rv(4) },
  weekTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekStreakTxt: { color: ACCENT, fontFamily: FONT, fontSize: rf(13), fontWeight: '700' },
  weekGoalTxt: { color: T3, fontFamily: FONT, fontSize: rf(14), fontWeight: '500' },
  streakChipOn: { backgroundColor: withAlpha(ACCENT, 0.14), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.4) },
  streakChipOff: { backgroundColor: CARD_HI },
  streakText: { fontFamily: FONT, fontSize: rf(13), fontWeight: '600', letterSpacing: 0.1 },
  goalRingPct: { color: T1, fontFamily: DISPLAY, fontSize: rf(18), letterSpacing: 0.2 },
  goalRingU: { color: T3, fontFamily: FONT, fontSize: rf(11) },

  // 목업 카드: radius 20(RADIUS.lg) · 테두리 1px. 비활성 라인(흰 7%), 활성 오렌지(0.55).
  hero: { backgroundColor: HERO_BG, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), padding: rs(16) },
  heroActive: { borderColor: withAlpha(ACCENT, 0.55) },
  // 현재 상태 인사이트 카드(사용거리 | 교체예상) — 활성 신발 반영
  weekEmptyTxt: { color: T3, fontFamily: FONT, fontSize: rf(14), lineHeight: rf(19) },
  insightCard: { backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), padding: SPACE.lg },
  insightGrid: { flexDirection: 'row', alignItems: 'flex-start' },
  insightDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: withAlpha(T1, 0.08), marginHorizontal: SPACE.lg },
  insightLabel: { color: T3, fontFamily: FONT, fontSize: rf(14), fontWeight: '600', letterSpacing: -0.1 },
  insightNum: { color: T1, fontFamily: DISPLAY, fontSize: rf(23), fontWeight: '700', letterSpacing: -0.4 },
  insightUnit: { color: T3, fontFamily: FONT, fontSize: rf(14), fontWeight: '500', marginLeft: rs(2) },
  insightWeeks: { fontFamily: DISPLAY, fontSize: rf(23), fontWeight: '700', letterSpacing: -0.4, marginTop: rv(6) },
  insightSub: { color: T3, fontFamily: FONT, fontSize: rf(14), fontWeight: '500', marginTop: rv(3) },
  insightPurpose: { marginTop: SPACE.lg, paddingTop: SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  // 추천 용도 자연어 문장(핸드오프 lead 정합: 16px·lineHeight 23).
  insightPurposeText: { color: T2, fontFamily: FONT, fontSize: rf(16), fontWeight: '500', letterSpacing: -0.2, lineHeight: rf(22), marginTop: rv(6) },
  insightTags: { flexDirection: 'row', flexWrap: 'wrap', gap: rv(6), marginTop: rv(12) },
  insightTag: { backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: rs(11), paddingVertical: rv(5) },
  insightTagText: { color: T2, fontFamily: FONT, fontSize: rf(13), fontWeight: '600' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: rv(14) },
  heroBrand: { color: T3, fontFamily: DISPLAY, fontSize: rf(12), fontWeight: '500', letterSpacing: 1.4 },
  usingChip: { backgroundColor: CARD_HI, borderRadius: rs(6), paddingHorizontal: SPACE.sm, paddingVertical: rv(2) },
  usingChipText: { color: T3, fontFamily: FONT, fontSize: rf(11), fontWeight: '500' },
  // 신발 종류(카테고리) 칩 — 데이터에 적힌 카본/데일리 등을 오렌지 톤으로 표시
  catChip: { backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: rs(6), paddingHorizontal: SPACE.sm, paddingVertical: rv(2) },
  catChipText: { color: ACCENT, fontFamily: FONT, fontSize: rf(11), fontWeight: '700', letterSpacing: 0.1 },
  heroModel: { color: T1, fontFamily: DISPLAY, fontSize: rf(28), fontWeight: '700', letterSpacing: -0.6, marginTop: rv(7), lineHeight: rf(32), marginBottom: rv(24) },
  // minHeight = 2줄(lineHeight 20×2) — 1줄짜리 reason 도 2줄 공간을 차지해 캐러셀 카드
  // 높이가 신발마다 흔들리지 않게 한다(numberOfLines={2} 와 짝).
  heroReason: { color: T2, fontFamily: FONT, fontSize: rf(16), fontWeight: '500', letterSpacing: -0.2, marginTop: rv(6), lineHeight: rf(21), minHeight: rs(21) },
  // 교체까지 남은 거리 — 문장형(목업 .remain). 숫자만 디스플레이 강조.
  heroRemainLine: { color: T2, fontFamily: FONT, fontSize: rf(16), fontWeight: '500', letterSpacing: -0.2, marginTop: rv(10) },
  heroRemainNum: { color: T1, fontFamily: DISPLAY, fontSize: rf(27), fontWeight: '700', letterSpacing: -0.6 },
  heroRemainNumU: { color: T2, fontFamily: FONT, fontSize: rf(14), fontWeight: '500' },
  gauge: { height: rs(4), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.08), marginTop: rv(14), overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: RADIUS.pill },
  // 사용량 줄 — 좌(사용량) ↔ 우(사용률 %). marginTop 은 행에 두고 텍스트끼리는 가운데 정렬.
  usageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rv(10) },
  usage: { color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '500' },
  usagePct: { color: T2, fontFamily: FONT, fontSize: rf(13), fontWeight: '700', letterSpacing: 0.2 },
  injuryWrap: { marginTop: rv(16) },
  // 교체 예측 ETA 한 줄(목업 .fore — 회색·상단 구분선).
  heroForecast: { flexDirection: 'row', alignItems: 'center', gap: rv(7), marginTop: rv(10), paddingTop: rv(10), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.06) },
  heroForecastText: { flex: 1, color: T3, fontFamily: FONT, fontSize: rf(14), fontWeight: '500', letterSpacing: -0.1, lineHeight: rf(16) },
  // forecast 가 없는 신발: 같은 높이를 차지하되 보이지 않게(공간만 예약 → 카드 높이 통일).
  heroForecastHidden: { opacity: 0 },
  condpill: { flexDirection: 'row', alignItems: 'center', gap: rv(7), flexShrink: 0, marginTop: rv(2) },
  dot: { width: rs(7), height: rs(7), borderRadius: RADIUS.pill },
  condText: { fontFamily: FONT, fontSize: rf(14), fontWeight: '500' },

  sectionLabel: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: SPACE.xl, paddingTop: SPACE.sm, paddingBottom: SPACE.sm },
  sectionLabelInline: { paddingHorizontal: rs(0), paddingBottom: rv(0) },
  sectionMore: { color: T4, fontFamily: FONT, fontSize: rf(13), fontWeight: '500' },

  // 오늘의 신발 캐러셀 — 페이지 도트 + 스와이프 힌트(목업 정합)
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: rv(6), marginTop: SPACE.md },
  pageDot: { width: rs(5), height: rs(5), borderRadius: rs(3), backgroundColor: withAlpha(T1, 0.22) },
  pageDotOn: { width: rs(16), backgroundColor: ACCENT },

  // 홈 챌린지 카드
  chalWrap: { marginHorizontal: SPACE.xl, marginTop: SPACE.lg, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), padding: SPACE.lg },
  chalLabel: { color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 },
  chalMore: { color: ACCENT, fontFamily: FONT, fontSize: rf(13), fontWeight: '600' },
  chalEmpty: { alignItems: 'center', paddingVertical: rv(8) },
  chalEmptyTxt: { color: T2, fontFamily: FONT, fontSize: rf(15), fontWeight: '500' },
  chalEmptyHint: { color: T3, fontFamily: FONT, fontSize: rf(13), marginTop: rv(4) },
  chalItem: { paddingVertical: rv(8) },
  chalItemSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  chalItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rv(6) },
  chalItemLabel: { color: T1, fontFamily: FONT, fontSize: rf(14), fontWeight: '500', flex: 1 },
  chalBar: { height: rs(3), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.07), overflow: 'hidden' },
  chalBarFill: { height: '100%', borderRadius: RADIUS.pill },
  chalPct: { color: T3, fontFamily: FONT, fontSize: rf(12), marginTop: rv(5) },

  rotaWrap: { marginTop: SPACE.lg },
  rotaCard: { marginHorizontal: SPACE.xl, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), paddingHorizontal: SPACE.lg },
  rotaBrand: { color: T3, fontFamily: DISPLAY, fontSize: rf(12), fontWeight: '500', letterSpacing: 1.2 },
  rotaModel: { color: T1, fontFamily: DISPLAY, fontSize: rf(16), fontWeight: '600', letterSpacing: -0.1, marginTop: rv(4) },
  // 로테이션 인사이트 행
  insightRow: { paddingVertical: rv(14) },
  insightRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  insightRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rv(8) },
  insightBadgeChip: { borderRadius: RADIUS.pill, paddingHorizontal: rs(10), paddingVertical: rv(4), flexShrink: 0 },
  insightBadgeText: { fontFamily: FONT, fontSize: rf(13), fontWeight: '600', letterSpacing: -0.1 },
  insightDesc: { color: T3, fontFamily: FONT, fontSize: rf(14), letterSpacing: -0.1, marginTop: rv(5), lineHeight: rf(18) },

  // 수익화 v1: 교체 시점 '다음 러닝화' 추천 카드(오렌지 절제 — 테두리만 액센트)
  nextWrap: { marginTop: SPACE.lg },
  nextCard: { marginHorizontal: SPACE.xl, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.3), padding: SPACE.lg },
  nextSub: { color: T3, fontFamily: FONT, fontSize: rf(14), lineHeight: rf(18), marginBottom: SPACE.sm },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: rv(11) },
  nextRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  nextBrand: { color: T3, fontFamily: DISPLAY, fontSize: rf(11), fontWeight: '500', letterSpacing: 1.2 },
  nextModel: { color: T1, fontFamily: DISPLAY, fontSize: rf(16), fontWeight: '600', letterSpacing: -0.1, marginTop: rv(3) },
  nextCat: { color: T3, fontFamily: FONT, fontSize: rf(12), marginTop: rv(3) },
  shopBtns: { flexDirection: 'row', gap: rv(6) },
  shopBtn: { borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.1), paddingHorizontal: rs(11), paddingVertical: rv(6) },
  shopBtnTxt: { color: ACCENT, fontFamily: FONT, fontSize: rf(13), fontWeight: '600' },
  nextDisclosure: { color: T3, fontFamily: FONT, fontSize: rf(12), lineHeight: rf(15), marginTop: SPACE.md, opacity: 0.85 },



  // 빈 홈 — 고스트 카드(KeegoHome GhostShoeCard) + 철학 한 줄. 구 대시 슬롯 스타일 폐기.
  empty: { paddingTop: rv(4), alignItems: 'center', gap: rv(26) },
  emptyPhilosophy: { textAlign: 'center', color: T3, fontFamily: FONT, fontSize: rf(16), lineHeight: rf(24) },
});
