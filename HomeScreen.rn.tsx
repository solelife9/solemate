// ============================================================================
// HomeScreen.rn.tsx — Keego Home (hero shoe + center-snap picker)
// 색/폰트는 전부 theme 토큰(BG/CARD/ACCENT/T1~T3/SEP/SPACE/RADIUS/TYPE/FONT/
// DISPLAY)과 withAlpha 파생만 사용한다(raw hex/인라인 fontFamily 0). 워드마크는
// KeegoWordmark primitive. shoe-first: 선택 신발(activeIdx 실값) 수명 링 히어로가
// 주인공이고, 오렌지는 핵심 수치·CTA에만(라벨/보조텍스트는 T3 회색).
// ============================================================================
import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Linking, Dimensions,
  RefreshControl, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BG, CARD, CARD_DIM, CARD_HI, HERO_BG, ACCENT, DANGER, WARN, GOOD, BEST, T1, T2, T3, T4,
  FONT, DISPLAY, SPACE, RADIUS, GUTTER, withAlpha, Shoe, SHOES, TIER_COLORS, TIER_LABEL,
} from './theme';
import type { RankTier } from './lib/progression/types';
import { TabBar, KeegoWordmark, Button, SectionTitle, InjuryBanner } from './primitives';
import { wearTier, WearTierTone } from './lib/shoe';
import { Unit, displayNum } from './lib/units';
import { assessShoeInjuryRisk } from './lib/injury';
import { RotationPick } from './lib/rotation';
import { recommendNextShoes, buildShopLinks, categoryLabelKo, AFFILIATE_DISCLOSURE } from './lib/affiliate';
import { forecastLineKo, type ReplacementForecast } from './lib/wearView';
import { shouldRecommendNextShoe } from './lib/recommendTrigger';
import { findShoeClass, typeLabel } from './data/shoeClass';
import { ShoeGlyph } from './FirstShoeScreen.rn';

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

// 진척 띠 — 랭크 칩 + 활성 챌린지 진행 + 최근 업적. 통째로 탭하면 진척 화면으로 이동
// (rank 칩/띠 어디를 눌러도 동일 — 단일 Pressable 로 중첩 매칭 혼동을 피한다). 히어로
// 위에 얇게 얹혀 주인공(신발 히어로)을 밀어내지 않는다. 토큰만 — 색은 TIER_COLORS 권위.
function ProgressionStrip({ prog, onOpen }: { prog: HomeProgression; onOpen?: () => void }) {
  const color = TIER_COLORS[prog.tier] ?? ACCENT;
  const ch = prog.challenge;
  const ach = prog.achievement;
  const pct = ch ? Math.max(0, Math.min(1, ch.pct)) : 0;
  const fmt = (n: number) => {
    const v = Math.round((Number(n) || 0) * 10) / 10;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  return (
    <Pressable
      testID="home-progression"
      onPress={onOpen}
      disabled={!onOpen}
      accessibilityRole="button"
      accessibilityLabel="진척 보기"
      style={({ pressed }) => [s.progStrip, pressed && onOpen ? s.pressed : null]}>
      <View style={s.progTopRow}>
        <View
          testID="home-rank-chip"
          style={[s.rankChip, { backgroundColor: withAlpha(color, 0.16), borderColor: withAlpha(color, 0.5) }]}>
          <Ionicons name="trophy" size={11} color={color} />
          <Text testID="home-rank-chip-text" style={[s.rankChipTxt, { color }]} numberOfLines={1}>
            {TIER_LABEL[prog.tier]}
          </Text>
        </View>
        {ach && (
          <View testID="home-recent-achievement" style={s.achChip}>
            <Ionicons name="ribbon" size={11} color={T3} />
            <Text style={s.achChipTxt} numberOfLines={1}>최근 달성 · {ach.name}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={15} color={T4} style={{ marginLeft: 'auto' }} />
      </View>
      {ch && (
        <View testID="home-challenge" style={s.progChallenge}>
          <View style={s.progChallengeHead}>
            <Text style={s.progChallengeLabel} numberOfLines={1}>{ch.label}</Text>
            <Text style={s.progChallengeVal}>
              {fmt(ch.current)}<Text style={s.progChallengeValT}> / {fmt(ch.target)}{ch.unit ?? ''}</Text>
            </Text>
          </View>
          <View style={s.progBar}>
            <View testID="home-challenge-bar" style={[s.progBarFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
          </View>
        </View>
      )}
    </Pressable>
  );
}


// 컨디션 표시는 신발 목록/상세 카드와 동일하게 사용률(used/max%) 기반 wearTier(4단계)로 통일한다.
// (이전엔 홈 히어로만 3단계 shoe.condition 이라, 같은 신발이 목록='좋은 상태'인데 홈='최상의
//  컨디션'으로 어긋났다.) '양호' 신발은 wearTier 칩(점+라벨)으로, 주의/교체는 TierBadge 를
//  유지한다(상세 ShoesScreen 과 동일 하이브리드). TONE→theme 토큰 매핑도 목록 카드와 동일.
const WEAR_TONE_COLOR: Record<WearTierTone, string> = { good: BEST, mid: GOOD, warn: ACCENT, danger: DANGER };
const wearColorOf = (pct: number) => WEAR_TONE_COLOR[wearTier(pct).tone];
const wearLabelOf = (pct: number) => wearTier(pct).label;
// 카드 한 줄 요약(목업 reason 정합 — keep-going 보이스). 컨디션별 오늘의 추천/안내.
const condReason = (c: string) =>
  c === '교체' ? '교체 시기예요 — 부상 전에 바꿔주세요'
  : c === '주의' ? '아직 괜찮지만 슬슬 교체를 준비할 때예요'
  : '오늘 데일리 러닝에 가장 좋은 컨디션이에요';

function TopBar({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.topbar}>
      <KeegoWordmark size={24} />
      <Pressable
        onPress={onAddShoe}
        accessibilityRole="button"
        accessibilityLabel="신발 추가"
        hitSlop={8}
        style={({ pressed }) => [s.addBtn, pressed && s.pressed]}>
        <Text style={s.addBtnText}>신발 추가</Text>
        <Ionicons name="add" size={15} color={T1} />
      </Pressable>
    </View>
  );
}

function HeroShoe({ shoe, unit, tappable, forecast, active, onOpenShoe, onStart }: { shoe: Shoe; unit: Unit; tappable?: boolean; forecast?: ReplacementForecast | null; active?: boolean; onOpenShoe?: () => void; onStart?: () => void }) {
  // 비율(pct)은 km 절대값으로 계산(단위 불변), 표시 숫자만 표시 단위로 환산한다.
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remainKm / shoe.max : 0;
  const remain = displayNum(remainKm, unit);
  const used = displayNum(shoe.used, unit);
  const max = displayNum(shoe.max, unit);
  // 사용률(%) — used/max. 사용량 줄 오른쪽에 표시(InsightCard '내구도 중 N%' 와 동일 규약).
  const usedPct = shoe.max > 0 ? Math.round((shoe.used / shoe.max) * 100) : 0;
  // 컨디션 점·게이지 색은 목록 카드와 동일한 wearTier(used/max%) 기반.
  const wearPct = shoe.max > 0 ? (shoe.used / shoe.max) * 100 : 0;
  const ring = wearColorOf(wearPct);
  // 신발 종류 — 사용자 DB(shoes.json)의 type 을 예쁜 라벨(카본 레이싱 등)로 칩 표시.
  const heroType = typeLabel(findShoeClass(shoe.brand, shoe.model)?.type);
  // 부상예방 경고(주의/위험)는 같은 마모 분모(used/max)로 판정해 히어로 하단에 띄운다.
  // 안전 등급은 InjuryBanner가 null을 돌려줘 경고를 노출하지 않는다(보관 신발도 제외).
  const injury = assessShoeInjuryRisk(shoe);
  // 교체 예측 ETA 한 줄(ok/overdue일 때만 — keep-going 보이스). no_recent/결측이면 숨긴다.
  const forecastLine =
    forecast && (forecast.reason === 'ok' || forecast.reason === 'overdue')
      ? forecastLineKo(forecast)
      : '';
  return (
    <View style={[s.hero, active && s.heroActive]}>
      {/* 정보 영역(탭 → 상세). 러닝시작 버튼은 이 Pressable 밖(형제)이라 중첩 매칭이 없다. */}
      <Pressable
        onPress={onOpenShoe}
        disabled={!onOpenShoe}
        accessibilityRole="button"
        accessibilityLabel={`${shoe.brand} ${shoe.model} 상세 보기`}
        style={({ pressed }) => [onOpenShoe && pressed ? s.pressed : null]}>
        {/* 상단: 브랜드+사용중(왼쪽) · 컨디션 도트+문구(오른쪽) — 목업 herotop 정합 */}
        <View style={s.heroTop}>
          <View style={[s.row, { flex: 1, minWidth: 0 }]}>
            <Text style={s.heroBrand}>{shoe.brand}</Text>
            {!!heroType && <View style={s.catChip}><Text style={s.catChipText}>{heroType}</Text></View>}
          </View>
          {/* 컨디션 칩: 목록/상세와 100% 동일한 wearTier 4단계(점+라벨) —
              최상의 컨디션 / 좋은 상태 / 교체 고려 / 교체 권장. (TierBadge 3단계 폐지) */}
          <View style={s.condpill} testID={`home-cond-${wearTier(wearPct).key}`}>
            <View style={[s.dot, { backgroundColor: ring }]} />
            <Text style={[s.condText, { color: T2 }]} numberOfLines={1}>{wearLabelOf(wearPct)}</Text>
          </View>
        </View>
        <Text style={s.heroModel} numberOfLines={1}>{shoe.model}</Text>
        <Text style={s.heroRemainLine}>
          교체까지 약 <Text style={s.heroRemainNum}>{remain}<Text style={s.heroRemainNumU}>{unit}</Text></Text> 남았어요
        </Text>
        <View style={s.gauge}><View style={[s.gaugeFill, { width: `${usedPct}%`, backgroundColor: ring }]} /></View>
        <View style={s.usageRow}>
          <Text style={s.usage}>{used} / {max}{unit} 사용</Text>
          <Text style={s.usagePct}>{usedPct}%</Text>
        </View>
        {/* 교체 예상 행 — 캐러셀 카드 높이를 통일하려고 항상 공간을 예약한다(forecast 가
            없는 신발은 같은 높이의 투명 플레이스홀더). 텍스트는 1줄 고정(긴 ETA 가 2줄로
            줄바꿈해 높이가 흔들리지 않게). */}
        {!shoe.retired && (
          <View style={[s.heroForecast, !forecastLine && s.heroForecastHidden]}>
            <Ionicons name="time-outline" size={13} color={T3} />
            <Text style={s.heroForecastText} numberOfLines={1}>{forecastLine || '교체 예상 계산 중'}</Text>
            {tappable && <Ionicons name="chevron-forward" size={14} color={T4} style={{ marginLeft: 'auto' }} />}
          </View>
        )}
        {!shoe.retired && injury.level !== 'safe' && (
          <View style={s.injuryWrap}>
            <InjuryBanner level={injury.level} message={injury.message} />
          </View>
        )}
      </Pressable>
      {/* 러닝 시작 — 카드 배경 안(목업 정합). 이 카드 신발로 바로 시작. */}
      {onStart && <Button label="러닝 시작" icon="play" onPress={onStart} style={{ marginTop: SPACE.sm }} />}
    </View>
  );
}

// 오늘의 신발 — 풀폭 스와이프 캐러셀(목업 정합). 각 신발이 한 장의 카드(HeroShoe)로
// 좌우로 넘겨지고, 스냅 위치로 활성 신발(onSelect)을 정한다. 활성 카드만 home-hero
// testID + 교체 예측(forecast) 노출(App이 활성 신발 기준 forecast 하나만 내려주므로).
// 카드 탭 → 그 신발 상세(onOpenShoe). 러닝 시작 CTA 는 캐러셀 아래 단일 버튼(활성 기준).
const SCREEN_W = Dimensions.get('window').width;
const HERO_W = SCREEN_W - SPACE.xl * 2;
const HERO_SNAP = HERO_W + SPACE.md;

function ShoeCarousel({ shoes, activeIdx, onSelect, unit, forecast, forecasts, onOpenShoe, onStart }: {
  shoes: Shoe[]; activeIdx: number; onSelect: (i: number) => void; unit: Unit;
  forecast?: ReplacementForecast | null;
  forecasts?: Record<string, ReplacementForecast | null>;
  onOpenShoe?: (shoeId: string) => void; onStart?: (idx: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / HERO_SNAP);
    const clamped = Math.max(0, Math.min(shoes.length - 1, i));
    if (clamped !== activeIdx) onSelect(clamped);
  };
  // 외부에서 활성 신발이 바뀌면(로테이션 추천 탭 등) 캐러셀도 그 카드로 스냅 이동.
  useEffect(() => { ref.current?.scrollTo({ x: activeIdx * HERO_SNAP, animated: true }); }, [activeIdx]);
  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={HERO_SNAP}
        decelerationRate="fast"
        onMomentumScrollEnd={onEnd}
        contentContainerStyle={{ paddingHorizontal: SPACE.xl, gap: SPACE.md }}
      >
        {shoes.map((shoe, i) => (
          // 카드 = HeroShoe(배경/테두리/러닝시작 버튼 포함). 상세 열기·러닝시작은 HeroShoe 안에서
          // 형제 Pressable 로 분리돼 텍스트 기반 테스트 혼동이 없다(중첩 매칭 방지).
          <View key={shoe.id ?? i} testID={i === activeIdx ? 'home-hero' : undefined} style={{ width: HERO_W }}>
            <HeroShoe
              shoe={shoe}
              unit={unit}
              tappable={!!onOpenShoe}
              active={i === activeIdx}
              // 카드마다 자기 신발 예측을 바로 표시(맵에서 조회). 맵 미주입(테스트 등)이면
              // 기존처럼 active 카드만 forecast 로 폴백 — 스와이프 시 한 박자 지연이 사라진다.
              forecast={forecasts ? (shoe.id ? forecasts[shoe.id] ?? null : null) : (i === activeIdx ? forecast : null)}
              onOpenShoe={shoe.id && onOpenShoe ? () => onOpenShoe(shoe.id!) : undefined}
              onStart={onStart ? () => onStart(i) : undefined}
            />
          </View>
        ))}
      </ScrollView>
      {shoes.length > 1 && (
        <>
          <View style={s.pageDots}>
            {shoes.map((_, i) => <View key={i} style={[s.pageDot, i === activeIdx && s.pageDotOn]} />)}
          </View>
          <Text style={s.swipeHint}>내 러닝화 {shoes.length}켤레 · 좌우로 넘겨보세요</Text>
        </>
      )}
    </View>
  );
}

// 이번 주 러닝 — 내 활동 요약(거리·횟수·평균 페이스). week(WeekStats)는 App 이 이번 주
// (월~일) 런에서 파생해 주입한다. 신발 마모(히어로)와 분리된 '내 노력' 지표. 표시 전용.
function WeekCard({ week, unit = 'km' }: { week?: WeekStats; unit?: Unit }) {
  const km = week?.km ?? '0.0';
  const runs = week?.runs ?? 0;
  const pace = week?.pace && week.pace !== '--' ? week.pace : '—';
  return (
    <View style={s.insightCard} testID="home-week">
      <View style={s.insightGrid}>
        <View style={{ flex: 1 }}>
          <Text style={s.insightLabel}>거리</Text>
          <View style={[s.baselineRow, { marginTop: 6 }]}>
            <Text style={s.insightNum} testID="home-week-km">{km}</Text><Text style={s.insightUnit}>{unit}</Text>
          </View>
        </View>
        <View style={s.insightDivider} />
        <View style={{ flex: 1 }}>
          <Text style={s.insightLabel}>횟수</Text>
          <View style={[s.baselineRow, { marginTop: 6 }]}>
            <Text style={s.insightNum} testID="home-week-runs">{runs}</Text><Text style={s.insightUnit}>회</Text>
          </View>
        </View>
        <View style={s.insightDivider} />
        <View style={{ flex: 1 }}>
          <Text style={s.insightLabel}>평균 페이스</Text>
          <View style={[s.baselineRow, { marginTop: 6 }]}>
            <Text style={s.insightNum} testID="home-week-pace">{pace}</Text>
          </View>
        </View>
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
    return { badge: '미착용',       description: '아직 한 번도 신지 않은 신발입니다.',      toneKey: 'neutral' };
  if (usedToday && isLast)
    return { badge: '사용 빈도 높음', description: '현재 가장 많이 사용 중인 신발입니다.',    toneKey: 'accent'  };
  if (usedToday)
    return { badge: '오늘 사용',     description: '오늘 신은 신발입니다.',                   toneKey: 'good'    };
  if (isCarbon) {
    const dText = days != null ? `${days}일 미사용` : '휴식중';
    return { badge: dText,           description: '레이스용으로 보관 중입니다.',              toneKey: 'neutral' };
  }
  if (isLast)
    return { badge: '사용 빈도 높음', description: '현재 가장 많이 사용 중인 신발입니다.',    toneKey: 'accent'  };
  if (isFirst && days != null && days > 6)
    return { badge: `${days}일 미사용`, description: '최근 가장 오래 쉬고 있는 신발입니다.', toneKey: days > 14 ? 'warn' : 'neutral' };
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
function EmptyHome({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.empty}>
      <Pressable
        onPress={onAddShoe}
        accessibilityRole="button"
        accessibilityLabel="첫 러닝화 등록"
        style={({ pressed }) => [s.fsSlot, pressed && s.fsSlotPressed]}>
        <View style={s.fsGlyphWrap}>
          <ShoeGlyph size={46} />
          <View style={s.fsPlus}><Ionicons name="add" size={18} color={BG} /></View>
        </View>
        <Text style={s.fsSlotTitle}>첫 러닝화 등록</Text>
        <Text style={s.fsSlotSub}>탭해서 시작하기</Text>
      </Pressable>
      <Text style={s.fsPhilosophy}>
        신발이 얼마나 닳았는지 관리해서,{'\n'}부상 없이 더 오래 달리게 해드려요.
      </Text>
    </View>
  );
}

export default function HomeScreen({
  shoes = SHOES, dateLabel = '', onStart, onAddShoe, onTab,
  activeIdx: activeIdxProp, onSelect, unit = 'km', week, rotation, onPickShoe,
  onOpenShoe, forecast, forecasts, progression, onOpenProgression,
  onRefresh, lastSyncAt, userName,
}: {
  shoes?: Shoe[];
  userName?: string;
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
  // 진척 홈 노출(Slice D) — App 이 getProgression + 챌린지 진행을 읽기 전용 파생해
  // 내려준다. 미주입이면 띠/타이틀을 통째로 숨겨 기존 홈과 100% 하위호환(표시 전용).
  progression?: HomeProgression | null;
  // 랭크 칩/진척 띠 탭 → 진척 화면(App 의 기존 onOpenProgression 배선 재사용).
  onOpenProgression?: () => void;
  // 당겨서 새로고침 — 서버 재fetch + pending flush 재시도(App 의 initUser/sync 재진입).
  // RN 내장 RefreshControl 만 사용한다(새 네이티브 0). 미주입이면 RefreshControl 을 달지
  // 않아 기존 홈과 100% 하위호환(표시 전용). 동기/비동기 모두 허용(완료 시 스피너 정지).
  onRefresh?: () => void | Promise<void>;
  // 마지막 동기화 성공 시각(epoch ms). 인사 영역 칩에 '방금 동기화'/'N분 전'으로 표시한다.
  // null/미주입이면 '동기화 안 됨' 칩(또는 미표시) — 표시 전용(lib/syncStatus 가 라벨 생성).
  lastSyncAt?: number | null;
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

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
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
            <Ionicons name="bookmark" size={11} color={ACCENT} />
            <Text style={s.equipPillTxt} numberOfLines={1}>{progression.equippedTitle}</Text>
          </View>
        ) : null}
      </View>
      {active ? (
        <>
          {/* shoe-first 주인공: 오늘의 신발 풀폭 캐러셀(좌우 스와이프). 활성 카드가 히어로. */}
          <View style={s.sectionRow}>
            <SectionTitle style={s.sectionLabelInline}>오늘의 신발</SectionTitle>
            {shoes.length > 1 && (
              <Pressable onPress={() => onTab?.(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="신발 전체 보기">
                <Text style={s.sectionMore}>전체 보기 ›</Text>
              </Pressable>
            )}
          </View>
          <ShoeCarousel shoes={shoes} activeIdx={idx} onSelect={select} unit={unit} forecast={forecast} forecasts={forecasts} onOpenShoe={onOpenShoe} onStart={onStart} />
          {/* 이번 주 러닝 — 내 활동 요약(거리·횟수·평균 페이스). 신발 상태(히어로)와 별개로
              '내가 얼마나 뛰었나'를 보여준다. 자세히 → 기록 탭. 신발 마모는 히어로/상세에. */}
          <View style={[s.sectionRow, { marginTop: SPACE.lg }]}>
            <SectionTitle style={s.sectionLabelInline}>이번 주 러닝</SectionTitle>
            <Pressable onPress={() => onTab?.(2)} hitSlop={8} accessibilityRole="button" accessibilityLabel="기록 전체 보기">
              <Text style={s.sectionMore}>전체 보기 ›</Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: SPACE.xl }}>
            <WeekCard week={week} unit={unit} />
          </View>
          {/* 진척 띠(Slice D) — 로테이션 인사이트 위에 둔다(사용자 요청). 주입 시에만 노출.
              탭 → 진척 화면(랭크·타이틀·업적). 미주입이면 통째로 숨겨 기존 홈과 동일. */}
          {progression && (
            <View style={s.progStripWrap}>
              <ProgressionStrip prog={progression} onOpen={onOpenProgression} />
            </View>
          )}
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
  scrollContent: { paddingBottom: SPACE.lg },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },

  topbar: { paddingTop: 8, paddingHorizontal: GUTTER, paddingBottom: SPACE.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { height: 34, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.2), backgroundColor: CARD_HI, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addBtnText: { color: T1, fontFamily: FONT, fontSize: 13, fontWeight: '600' },

  greetWrap: { paddingHorizontal: GUTTER, paddingTop: 8 },
  date: { color: T3, fontFamily: FONT, fontSize: 13, letterSpacing: 0.2 },
  greet: { color: T1, fontFamily: FONT, fontSize: 20, fontWeight: '500', letterSpacing: -0.4, marginTop: 3, lineHeight: 26 },

  // 마지막 동기화 칩 — 인사 아래 절제된 회색(아이콘 T3 + 텍스트 T3). 당겨서 새로고침 안내.
  syncChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 10, backgroundColor: CARD_DIM, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 4 },
  syncChipTxt: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', letterSpacing: 0.1 },

  // 장착 타이틀 칩(인사 옆) — 절제: 액센트 아이콘 + T2 텍스트, 옅은 카드 배경.
  equipPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 10, backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  equipPillTxt: { color: T2, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },

  // 진척 띠 — 히어로 위 얇은 카드(주인공 신발을 밀어내지 않게 컴팩트). 칩 색만 티어색.
  progStripWrap: { paddingHorizontal: GUTTER, paddingTop: SPACE.md, paddingBottom: SPACE.xs },
  progStrip: { backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), paddingVertical: 12, paddingHorizontal: 14 },
  progTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 4 },
  rankChipTxt: { fontFamily: DISPLAY, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  achChip: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0, flexShrink: 1 },
  achChipTxt: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', letterSpacing: -0.1 },
  progChallenge: { marginTop: 12 },
  progChallengeHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  progChallengeLabel: { flex: 1, color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  progChallengeVal: { color: T1, fontFamily: DISPLAY, fontSize: 13, fontWeight: '700', letterSpacing: 0.1 },
  progChallengeValT: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500' },
  progBar: { height: 4, borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.08), marginTop: 7, overflow: 'hidden' },
  progBarFill: { height: '100%', borderRadius: RADIUS.pill },


  goalCard: { backgroundColor: CARD_DIM, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.06), padding: SPACE.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalInfo: { flex: 1, gap: 6, minWidth: 0 },
  goalSub: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 4 },
  streakChipOn: { backgroundColor: withAlpha(ACCENT, 0.14), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.4) },
  streakChipOff: { backgroundColor: CARD_HI },
  streakText: { fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },
  goalRingPct: { color: T1, fontFamily: DISPLAY, fontSize: 17, letterSpacing: 0.2 },
  goalRingU: { color: T3, fontFamily: FONT, fontSize: 10 },

  // 목업 카드: radius 20(RADIUS.lg) · 테두리 1px. 비활성 라인(흰 7%), 활성 오렌지(0.55).
  hero: { backgroundColor: HERO_BG, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), padding: 16 },
  heroActive: { borderColor: withAlpha(ACCENT, 0.55) },
  // 현재 상태 인사이트 카드(사용거리 | 교체예상) — 활성 신발 반영
  insightCard: { backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), padding: SPACE.lg },
  insightGrid: { flexDirection: 'row', alignItems: 'flex-start' },
  insightDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: withAlpha(T1, 0.08), marginHorizontal: SPACE.lg },
  insightLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  insightNum: { color: T1, fontFamily: DISPLAY, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  insightUnit: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginLeft: 2 },
  insightWeeks: { fontFamily: DISPLAY, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, marginTop: 6 },
  insightSub: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 3 },
  insightPurpose: { marginTop: SPACE.lg, paddingTop: SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  // 추천 용도 자연어 문장(핸드오프 lead 정합: 16px·lineHeight 23).
  insightPurposeText: { color: T2, fontFamily: FONT, fontSize: 15, fontWeight: '500', letterSpacing: -0.2, lineHeight: 22, marginTop: 6 },
  insightTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  insightTag: { backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 5 },
  insightTagText: { color: T2, fontFamily: FONT, fontSize: 12, fontWeight: '600' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  heroBrand: { color: T3, fontFamily: DISPLAY, fontSize: 11, fontWeight: '500', letterSpacing: 1.4 },
  usingChip: { backgroundColor: CARD_HI, borderRadius: 6, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  usingChipText: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '500' },
  // 신발 종류(카테고리) 칩 — 데이터에 적힌 카본/데일리 등을 오렌지 톤으로 표시
  catChip: { backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: 6, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  catChipText: { color: ACCENT, fontFamily: FONT, fontSize: 10, fontWeight: '700', letterSpacing: 0.1 },
  heroModel: { color: T1, fontFamily: DISPLAY, fontSize: 27, fontWeight: '700', letterSpacing: -0.6, marginTop: 7, lineHeight: 32, marginBottom: 24 },
  // minHeight = 2줄(lineHeight 20×2) — 1줄짜리 reason 도 2줄 공간을 차지해 캐러셀 카드
  // 높이가 신발마다 흔들리지 않게 한다(numberOfLines={2} 와 짝).
  heroReason: { color: T2, fontFamily: FONT, fontSize: 15, fontWeight: '500', letterSpacing: -0.2, marginTop: 6, lineHeight: 21, minHeight: 21 },
  // 교체까지 남은 거리 — 문장형(목업 .remain). 숫자만 디스플레이 강조.
  heroRemainLine: { color: T2, fontFamily: FONT, fontSize: 15, fontWeight: '500', letterSpacing: -0.2, marginTop: 10 },
  heroRemainNum: { color: T1, fontFamily: DISPLAY, fontSize: 26, fontWeight: '700', letterSpacing: -0.6 },
  heroRemainNumU: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  gauge: { height: 4, borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.08), marginTop: 14, overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: RADIUS.pill },
  // 사용량 줄 — 좌(사용량) ↔ 우(사용률 %). marginTop 은 행에 두고 텍스트끼리는 가운데 정렬.
  usageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  usage: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },
  usagePct: { color: T2, fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  injuryWrap: { marginTop: 16 },
  // 교체 예측 ETA 한 줄(목업 .fore — 회색·상단 구분선).
  heroForecast: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.06) },
  heroForecastText: { flex: 1, color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', letterSpacing: -0.1, lineHeight: 16 },
  // forecast 가 없는 신발: 같은 높이를 차지하되 보이지 않게(공간만 예약 → 카드 높이 통일).
  heroForecastHidden: { opacity: 0 },
  condpill: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: RADIUS.pill },
  condText: { fontFamily: FONT, fontSize: 13, fontWeight: '500' },

  sectionLabel: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: SPACE.xl, paddingTop: SPACE.sm, paddingBottom: SPACE.sm },
  sectionLabelInline: { paddingHorizontal: 0, paddingBottom: 0 },
  sectionMore: { color: T4, fontFamily: FONT, fontSize: 12, fontWeight: '500' },

  // 오늘의 신발 캐러셀 — 페이지 도트 + 스와이프 힌트(목업 정합)
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: SPACE.md },
  pageDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: withAlpha(T1, 0.22) },
  pageDotOn: { width: 16, backgroundColor: ACCENT },
  swipeHint: { textAlign: 'center', color: T3, fontFamily: FONT, fontSize: 12, marginTop: 10 },

  // 홈 챌린지 카드
  chalWrap: { marginHorizontal: SPACE.xl, marginTop: SPACE.lg, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), padding: SPACE.lg },
  chalLabel: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 },
  chalMore: { color: ACCENT, fontFamily: FONT, fontSize: 12, fontWeight: '600' },
  chalEmpty: { alignItems: 'center', paddingVertical: 8 },
  chalEmptyTxt: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500' },
  chalEmptyHint: { color: T3, fontFamily: FONT, fontSize: 12, marginTop: 4 },
  chalItem: { paddingVertical: 8 },
  chalItemSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  chalItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  chalItemLabel: { color: T1, fontFamily: FONT, fontSize: 13, fontWeight: '500', flex: 1 },
  chalBar: { height: 3, borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.07), overflow: 'hidden' },
  chalBarFill: { height: '100%', borderRadius: RADIUS.pill },
  chalPct: { color: T3, fontFamily: FONT, fontSize: 11, marginTop: 5 },

  rotaWrap: { marginTop: SPACE.lg },
  rotaCard: { marginHorizontal: SPACE.xl, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07), paddingHorizontal: SPACE.lg },
  rotaBrand: { color: T3, fontFamily: DISPLAY, fontSize: 11, fontWeight: '500', letterSpacing: 1.2 },
  rotaModel: { color: T1, fontFamily: DISPLAY, fontSize: 15, fontWeight: '600', letterSpacing: -0.1, marginTop: 4 },
  // 로테이션 인사이트 행
  insightRow: { paddingVertical: 14 },
  insightRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  insightRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  insightBadgeChip: { borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  insightBadgeText: { fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: -0.1 },
  insightDesc: { color: T3, fontFamily: FONT, fontSize: 13, letterSpacing: -0.1, marginTop: 5, lineHeight: 18 },

  // 수익화 v1: 교체 시점 '다음 러닝화' 추천 카드(오렌지 절제 — 테두리만 액센트)
  nextWrap: { marginTop: SPACE.lg },
  nextCard: { marginHorizontal: SPACE.xl, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.3), padding: SPACE.lg },
  nextSub: { color: T3, fontFamily: FONT, fontSize: 13, lineHeight: 18, marginBottom: SPACE.sm },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: 11 },
  nextRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  nextBrand: { color: T3, fontFamily: DISPLAY, fontSize: 10, fontWeight: '500', letterSpacing: 1.2 },
  nextModel: { color: T1, fontFamily: DISPLAY, fontSize: 15, fontWeight: '600', letterSpacing: -0.1, marginTop: 3 },
  nextCat: { color: T3, fontFamily: FONT, fontSize: 11, marginTop: 3 },
  shopBtns: { flexDirection: 'row', gap: 6 },
  shopBtn: { borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.1), paddingHorizontal: 11, paddingVertical: 6 },
  shopBtnTxt: { color: ACCENT, fontFamily: FONT, fontSize: 12, fontWeight: '600' },
  nextDisclosure: { color: T3, fontFamily: FONT, fontSize: 11, lineHeight: 15, marginTop: SPACE.md, opacity: 0.85 },



  empty: { paddingHorizontal: SPACE.xl, paddingTop: 36, alignItems: 'center', gap: 28 },
  // 첫 러닝화 대시 슬롯(design-reference/first-shoe — 신발탭 FirstShoeScreen 과 동일 값)
  fsSlot: { width: '100%', maxWidth: 300, aspectRatio: 5 / 4, borderRadius: 26, borderWidth: 1.5, borderColor: withAlpha(T1, 0.16), borderStyle: 'dashed', backgroundColor: withAlpha(ACCENT, 0.035), alignItems: 'center', justifyContent: 'center', gap: 4 },
  fsSlotPressed: { transform: [{ scale: 0.975 }], borderColor: withAlpha(ACCENT, 0.55) },
  fsGlyphWrap: { position: 'relative', marginBottom: 14 },
  fsPlus: { position: 'absolute', top: -6, right: -12, width: 30, height: 30, borderRadius: 15, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  fsSlotTitle: { color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  fsSlotSub: { color: T3, fontFamily: FONT, fontSize: 13 },
  fsPhilosophy: { textAlign: 'center', color: T3, fontFamily: FONT, fontSize: 15, lineHeight: 24 },
});
