// ============================================================================
// HomeScreen.rn.tsx — Keego Home (hero shoe + center-snap picker)
// 색/폰트는 전부 theme 토큰(BG/CARD/ACCENT/T1~T3/SEP/SPACE/RADIUS/TYPE/FONT/
// DISPLAY)과 withAlpha 파생만 사용한다(raw hex/인라인 fontFamily 0). 워드마크는
// KeegoWordmark primitive. shoe-first: 선택 신발(activeIdx 실값) 수명 링 히어로가
// 주인공이고, 오렌지는 핵심 수치·CTA에만(라벨/보조텍스트는 T3 회색).
// ============================================================================
import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Linking, Modal, Dimensions,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BG, CARD, CARD_DIM, CARD_HI, HERO_BG, ACCENT, DANGER, WARN, GOOD, T1, T2, T3, T4,
  FONT, DISPLAY, SPACE, RADIUS, withAlpha, Shoe, SHOES,
} from './theme';
import { TabBar, TierBadge, KeegoWordmark, Button, SectionTitle, Pill, conditionColor, InjuryBanner } from './primitives';
import { Unit, displayNum, displayToKm } from './lib/units';
import { GOAL_STEP_DISPLAY } from './lib/settings';
import { assessShoeInjuryRisk } from './lib/injury';
import { RotationPick } from './lib/rotation';
import { recommendNextShoes, buildShopLinks, categoryLabelKo, AFFILIATE_DISCLOSURE } from './lib/affiliate';
import { forecastLineKo, type ReplacementForecast } from './lib/wearView';
import { shouldRecommendNextShoe } from './lib/recommendTrigger';
import { findShoeClass, typeLabel, purposeSentenceKo } from './data/shoeClass';

export type WeekStats = { km: string; runs: number; pace: string };
// 주간 목표 + keep-going 동기 지표. 거리는 km 표준, pct는 이번 주 달성률 %(목표
// 설정 행이 구동), streak은 오늘까지 이어지는 연속 러닝 일수(lib/goals.currentStreak).
export type GoalInfo = { km: number; pct: number; streak: number };


// Proportional condition → ring color. 양호는 accent(주인공 톤), 주의/교체는 경고색.
// 도트/조건 텍스트의 상태색은 primitives.conditionColor(양호=GOOD 녹색)를 재사용한다.
const ringColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : ACCENT);
const condLabel = (c: string) => c === '교체' ? '교체 권장' : c === '주의' ? '주의 필요' : '최상의 컨디션';
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
        <Ionicons name="add" size={15} color={T2} />
      </Pressable>
    </View>
  );
}

// 주간 목표 진행 + 연속 러닝 스트릭(keep-going 동기). 달성률은 Ring(primitives 재사용)
// 으로, 스트릭은 불꽃 칩으로 실데이터를 표시한다. pct는 0~999%(목표 초과 가능), 링은
// 100%에서 가득 차고(달성 시 GOOD 색), 스트릭이 0이면 '오늘 시작' 유도 문구를 보여준다.
// 라벨/부가 텍스트는 T3 회색(오렌지 절제), 강조는 링 수치와 활성 스트릭에만.
// 주간 목표 — 목업 정합: 원형 링 대신 가로 통계(거리·러닝·연속) + 막대 게이지. 거리/
// 러닝은 week(이번 주 실측)에서, 연속은 goal.streak에서 온다. week 미주입 시 0으로 폴백.
// '주간 목표' 라벨은 T3 회색(오렌지 절제) — 테스트가 이 토큰 결속을 검증한다.
function WeeklyGoal({ goal, week, unit, editable }: { goal: GoalInfo; week?: WeekStats; unit: Unit; editable?: boolean }) {
  const goalDisplay = displayNum(goal.km, unit, 0);
  const pct = Math.max(0, goal.pct);
  const reached = pct >= 100;
  const streak = Math.max(0, goal.streak);
  const distKm = week ? week.km : '0';
  const runs = week ? week.runs : 0;
  const remainKm = Math.max(0, goal.km - (parseFloat(distKm) || 0));
  const remainDisplay = displayNum(remainKm, unit, 0);
  return (
    <View>
      <View style={[s.row, { marginBottom: 14 }]}>
        <Ionicons name="flag" size={13} color={T3} />
        <Text style={s.goalLabel}>주간 목표</Text>
        {editable && <Ionicons name="create-outline" size={13} color={T3} />}
      </View>
      <View style={s.weekStats}>
        <View style={[s.weekStat, s.weekStatLead]}><Text style={s.weekLeadV}>이번{'\n'}주</Text></View>
        <View style={s.weekStat}><Text style={s.weekV}>{distKm}<Text style={s.weekU}>{unit}</Text></Text><Text style={s.weekK}>거리</Text></View>
        <View style={s.weekStat}><Text style={s.weekV}>{runs}<Text style={s.weekU}>회</Text></Text><Text style={s.weekK}>러닝</Text></View>
        <View style={s.weekStat}><Text testID="goal-streak" style={s.weekV}>{streak}<Text style={s.weekU}>일</Text></Text><Text style={s.weekK}>연속</Text></View>
      </View>
      <View style={s.gbar}><View style={[s.gbarFill, { width: `${Math.min(100, pct)}%`, backgroundColor: reached ? GOOD : ACCENT }]} /></View>
      <Text style={s.gnote}>주간 목표 {goalDisplay}{unit} · {remainDisplay}{unit} 남음</Text>
      {/* progress carrier for test instrumentation */}
      <View testID="goal-progress" style={{ position: 'absolute', width: `${Math.min(Math.max(0, pct), 100)}%`, height: 0, backgroundColor: reached ? GOOD : ACCENT }} />
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
  const ring = ringColor(shoe.condition);
  const tier = conditionColor(shoe.condition);
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
            <View style={s.usingChip}><Text style={s.usingChipText}>사용 중</Text></View>
          </View>
          <View style={s.condpill}>
            {shoe.condition !== '양호' ? (
              <TierBadge condition={shoe.condition} />
            ) : (
              <>
                <View style={[s.dot, { backgroundColor: tier }]} />
                <Text style={[s.condText, { color: T2 }]} numberOfLines={1}>{condLabel(shoe.condition)}</Text>
              </>
            )}
          </View>
        </View>
        <Text style={s.heroModel} numberOfLines={1}>{shoe.model}</Text>
        <Text style={s.heroReason} numberOfLines={2}>{condReason(shoe.condition)}</Text>
        <Text style={s.heroRemainLine}>
          교체까지 약 <Text style={s.heroRemainNum}>{remain}<Text style={s.heroRemainNumU}>{unit}</Text></Text> 남았어요
        </Text>
        <View style={s.gauge}><View style={[s.gaugeFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: ring }]} /></View>
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
      {onStart && <Button label="러닝 시작" icon="play" onPress={onStart} style={{ marginTop: SPACE.md }} />}
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

// 현재 상태 — 선택(스와이프) 신발의 사용거리 / 교체 예상. 활성 신발 기준이라 캐러셀을
// 좌우로 넘기면 이 카드도 함께 바뀐다(목업 '현재 상태' 정합). 표시 전용.
function InsightCard({ shoe, unit, forecast }: { shoe: Shoe; unit: Unit; forecast?: ReplacementForecast | null }) {
  const used = displayNum(shoe.used, unit);
  const max = displayNum(shoe.max, unit);
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const remain = displayNum(remainKm, unit);
  const usedPct = shoe.max > 0 ? Math.round((shoe.used / shoe.max) * 100) : 0;
  const wr = forecast?.weeksRemaining;
  const weeks = forecast && (forecast.reason === 'ok' || forecast.reason === 'overdue') && wr != null ? Math.max(0, Math.round(wr)) : null;
  const warn = shoe.condition !== '양호';
  // 추천 용도 = 사용자 DB(shoes.json)의 recommended(템포·인터벌·레이스 등 러닝 종류).
  // 종류(카본화 등)는 추천 용도가 아니므로 칩으로 따로 표시하고 여기엔 넣지 않는다.
  const recommended = findShoeClass(shoe.brand, shoe.model)?.recommended ?? [];
  const purposeSentence = purposeSentenceKo(recommended);
  return (
    <View style={s.insightCard}>
      <View style={s.insightGrid}>
        <View style={{ flex: 1 }}>
          <Text style={s.insightLabel}>사용 거리</Text>
          <View style={[s.baselineRow, { marginTop: 6 }]}>
            <Text style={s.insightNum}>{used}</Text><Text style={s.insightUnit}>{unit}</Text>
          </View>
          <Text style={s.insightSub}>총 내구도 {max}{unit} 중 {usedPct}%</Text>
        </View>
        <View style={s.insightDivider} />
        <View style={{ flex: 1 }}>
          <Text style={s.insightLabel}>교체 예상</Text>
          <Text style={[s.insightWeeks, { color: warn ? ACCENT : T1 }]}>{weeks != null ? `약 ${weeks}주 후` : '—'}</Text>
          <Text style={s.insightSub}>약 {remain}{unit} 남았어요</Text>
        </View>
      </View>
      {/* 추천 용도 — 사용자 DB의 추천 러닝 종류(데일리/장거리/템포/인터벌/레이스/회복/트레일). */}
      {recommended.length > 0 && (
        <View style={s.insightPurpose}>
          <Text style={s.insightLabel}>추천 용도</Text>
          {!!purposeSentence && <Text style={s.insightPurposeText}>{purposeSentence}</Text>}
          <View style={s.insightTags}>
            {recommended.map((t) => (
              <View key={t} style={s.insightTag}><Text style={s.insightTagText}>{t}</Text></View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// 신발 로테이션 추천(차별점). recommendRotation(App에서 신발+런으로 계산)이 활성
// 2켤레+ 일 때만 picks 를 채우므로, 비었으면(1켤레/추천 없음) 통째로 숨긴다. runType
// 미선택 기본은 '휴식·마모 분산' 추천 — 가장 오래 쉰 신발이 맨 위(rotation[0])에 온다.
// 토큰만(색/폰트), 새 상태 없음(props 표시 전용).
function RotationCard({ rotation, onPickShoe }: { rotation: RotationPick[]; onPickShoe?: (shoeId: string) => void }) {
  if (!rotation || rotation.length === 0) return null;
  return (
    <View testID="home-rotation" style={s.rotaWrap}>
      <SectionTitle style={s.sectionLabel}>오늘의 로테이션 추천</SectionTitle>
      <View style={s.rotaCard}>
        {rotation.map((p, i) => (
          <Pressable
            key={p.shoe.id ?? i}
            testID={`rotation-pick-${i}`}
            onPress={onPickShoe ? () => onPickShoe(p.shoe.id) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${p.shoe.brand} ${p.shoe.model} · ${p.reason}`}
            style={({ pressed }) => [s.rotaRow, i > 0 && s.rotaRowSep, pressed && s.pressed]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.row}>
                <Text style={s.rotaBrand} numberOfLines={1}>{p.shoe.brand}</Text>
                {i === 0 && <Pill tone="accent" label="오늘 추천" icon="sparkles" />}
              </View>
              <Text style={[s.rotaModel, { color: i === 0 ? T1 : T2 }]} numberOfLines={1}>{p.shoe.model}</Text>
              <Text style={s.rotaReason} numberOfLines={1}>{p.reason}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T3} />
          </Pressable>
        ))}
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

function EmptyHome({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.empty}>
      {/* 아이콘 없이 테두리 카드 안에 문구 + 버튼만 */}
      <View style={s.emptyCard}>
        <Text style={s.emptyTitle}>첫 러닝화를 등록해볼까요?</Text>
        <Text style={s.emptyText}>신발을 추가하면, 달릴 때마다{'\n'}수명을 함께 추적하며 계속 달릴 수 있어요</Text>
        <Pressable
          onPress={onAddShoe}
          accessibilityRole="button"
          accessibilityLabel="러닝화 등록하기"
          style={({ pressed }) => [s.emptyBtn, pressed && s.pressed]}>
          <Text style={s.emptyBtnText}>러닝화 등록하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function HomeScreen({
  shoes = SHOES, dateLabel = '', onStart, onAddShoe, onTab,
  activeIdx: activeIdxProp, onSelect, unit = 'km', goal, week, rotation, onPickShoe,
  onChangeGoal, onOpenShoe, forecast, forecasts,
}: {
  shoes?: Shoe[];
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
  // 표시 단위(km|mi)와 주간 목표 진행(설정 화면에서 구동). 둘 다 표시 전용.
  unit?: Unit;
  goal?: GoalInfo;
  // 홈 카드 인터랙션: 주간 목표 카드 탭 → 홈에서 바로 목표 수정(인라인 모달), 히어로
  // 신발 탭 → 그 신발 상세로 이동. onChangeGoal(km)으로 목표를 영속 갱신한다.
  onChangeGoal?: (km: number) => void;
  onOpenShoe?: (shoeId: string) => void;
}) {
  const [internalIdx, setInternalIdx] = useState(0);
  // 주간 목표 인라인 편집 모달(프로필로 이동하지 않고 홈에서 바로 수정).
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const stepGoal = (dir: 1 | -1) => {
    if (!goal) return;
    const next = displayNum(goal.km, unit, 0) + dir * GOAL_STEP_DISPLAY;
    onChangeGoal?.(displayToKm(next, unit));
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
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={s.greetWrap}>
        {!!dateLabel && <Text style={s.date}>{dateLabel}</Text>}
        <Text style={s.greet}>오늘은 어떤 신발로{'\n'}달려볼까요?</Text>
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
          {/* 현재 상태 — 선택(스와이프) 신발의 사용거리/교체예상. 캐러셀과 연동돼 함께 바뀐다. */}
          <View style={[s.sectionRow, { marginTop: SPACE.lg }]}>
            <SectionTitle style={s.sectionLabelInline}>현재 상태</SectionTitle>
            <Pressable onPress={() => { if (active.id) onOpenShoe?.(active.id); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="신발 상세 보기">
              <Text style={s.sectionMore}>자세히 ›</Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: SPACE.xl }}>
            <InsightCard shoe={active} unit={unit} forecast={forecast} />
          </View>
          {/* 주간 목표 — 목업 정합: 내 러닝화 아래 배치. 탭하면 인라인 편집 모달. */}
          {goal && (
            <Pressable
              onPress={() => onChangeGoal && setGoalEditOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="주간 목표 수정"
              style={({ pressed }) => [s.weekWrap, pressed && s.pressed]}>
              <WeeklyGoal goal={goal} week={week} unit={unit} editable={!!onChangeGoal} />
            </Pressable>
          )}
          {/* 휴식·마모 분산 로테이션 추천(2켤레+에서만 채워짐, 비면 자동 숨김) */}
          <RotationCard rotation={rotation ?? []} onPickShoe={onPickShoe} />
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

      {/* 주간 목표 인라인 편집 — 홈에서 바로 ＋/－로 조정(프로필로 이동하지 않음). */}
      {goal && (
        <Modal visible={goalEditOpen} transparent animationType="fade" onRequestClose={() => setGoalEditOpen(false)}>
          <Pressable style={s.goalBackdrop} onPress={() => setGoalEditOpen(false)} accessibilityRole="button" accessibilityLabel="닫기">
            <Pressable style={s.goalSheet} onPress={() => {}}>
              <View style={s.goalSheetHead}>
                <Ionicons name="flag" size={15} color={ACCENT} />
                <Text style={s.goalSheetTitle}>주간 목표</Text>
              </View>
              <View style={s.goalStepper}>
                <Pressable onPress={() => stepGoal(-1)} accessibilityRole="button" accessibilityLabel="목표 줄이기" hitSlop={6} style={({ pressed }) => [s.goalStepBtn, pressed && { backgroundColor: CARD_DIM }]}>
                  <Ionicons name="remove" size={22} color={T1} />
                </Pressable>
                <View style={s.goalStepVal}>
                  <Text style={s.goalStepNum}>{displayNum(goal.km, unit, 0)}</Text>
                  <Text style={s.goalStepUnit}>{unit}/주</Text>
                </View>
                <Pressable onPress={() => stepGoal(1)} accessibilityRole="button" accessibilityLabel="목표 늘리기" hitSlop={6} style={({ pressed }) => [s.goalStepBtn, pressed && { backgroundColor: CARD_DIM }]}>
                  <Ionicons name="add" size={22} color={T1} />
                </Pressable>
              </View>
              <Text style={s.goalSheetHint}>이번 주 <Text style={{ color: ACCENT }}>{Math.max(0, goal.pct)}%</Text> 달성</Text>
              <Pressable onPress={() => setGoalEditOpen(false)} accessibilityRole="button" accessibilityLabel="완료" style={({ pressed }) => [s.goalDone, pressed && s.pressed]}>
                <Text style={s.goalDoneText}>완료</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
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

  topbar: { paddingTop: 8, paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { height: 34, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.1), flexDirection: 'row', alignItems: 'center', gap: 6 },
  addBtnText: { color: T2, fontFamily: FONT, fontSize: 12.5, fontWeight: '600' },

  greetWrap: { paddingHorizontal: SPACE.xl, paddingTop: 8 },
  date: { color: T3, fontFamily: FONT, fontSize: 13, letterSpacing: 0.2 },
  greet: { color: T1, fontFamily: FONT, fontSize: 20, fontWeight: '400', letterSpacing: -0.4, marginTop: 3, lineHeight: 26 },


  goalCard: { backgroundColor: CARD_DIM, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.06), padding: SPACE.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalInfo: { flex: 1, gap: 6, minWidth: 0 },
  goalLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  goalSub: { color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '500' },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 4 },
  streakChipOn: { backgroundColor: withAlpha(ACCENT, 0.14), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.4) },
  streakChipOff: { backgroundColor: CARD_HI },
  streakText: { fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },
  goalRingPct: { color: T1, fontFamily: DISPLAY, fontSize: 19, letterSpacing: 0.2 },
  goalRingU: { color: T3, fontFamily: FONT, fontSize: 10 },

  // 목업 카드: radius 20(RADIUS.lg) · 테두리 1px. 비활성 라인(흰 7%), 활성 오렌지(0.55).
  hero: { backgroundColor: HERO_BG, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: withAlpha(T1, 0.07), padding: 20 },
  heroActive: { borderColor: withAlpha(ACCENT, 0.55) },
  // 현재 상태 인사이트 카드(사용거리 | 교체예상) — 활성 신발 반영
  insightCard: { backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: withAlpha(T1, 0.07), padding: SPACE.lg },
  insightGrid: { flexDirection: 'row', alignItems: 'flex-start' },
  insightDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: withAlpha(T1, 0.08), marginHorizontal: SPACE.lg },
  insightLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  insightNum: { color: T1, fontFamily: DISPLAY, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  insightUnit: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '600', marginLeft: 2 },
  insightWeeks: { fontFamily: DISPLAY, fontSize: 19, fontWeight: '800', letterSpacing: -0.3, marginTop: 6 },
  insightSub: { color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '500', marginTop: 3 },
  insightPurpose: { marginTop: SPACE.lg, paddingTop: SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  // 추천 용도 자연어 문장(핸드오프 lead 정합: 16px·lineHeight 23).
  insightPurposeText: { color: T2, fontFamily: FONT, fontSize: 16, fontWeight: '500', letterSpacing: -0.2, lineHeight: 23, marginTop: 6 },
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
  heroModel: { color: T1, fontFamily: DISPLAY, fontSize: 27, fontWeight: '800', letterSpacing: -0.6, marginTop: 7, lineHeight: 32 },
  // minHeight = 2줄(lineHeight 20×2) — 1줄짜리 reason 도 2줄 공간을 차지해 캐러셀 카드
  // 높이가 신발마다 흔들리지 않게 한다(numberOfLines={2} 와 짝).
  heroReason: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: -0.2, marginTop: 8, lineHeight: 20, minHeight: 40 },
  // 교체까지 남은 거리 — 문장형(목업 .remain). 숫자만 디스플레이 강조.
  heroRemainLine: { color: T2, fontFamily: FONT, fontSize: 15, fontWeight: '500', letterSpacing: -0.2, marginTop: 16 },
  heroRemainNum: { color: T1, fontFamily: DISPLAY, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  heroRemainNumU: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  gauge: { height: 4, borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.08), marginTop: 14, overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: RADIUS.pill },
  // 사용량 줄 — 좌(사용량) ↔ 우(사용률 %). marginTop 은 행에 두고 텍스트끼리는 가운데 정렬.
  usageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  usage: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },
  usagePct: { color: T2, fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  injuryWrap: { marginTop: 16 },
  // 교체 예측 ETA 한 줄(목업 .fore — 회색·상단 구분선).
  heroForecast: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.06) },
  heroForecastText: { flex: 1, color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '500', letterSpacing: -0.1, lineHeight: 16 },
  // forecast 가 없는 신발: 같은 높이를 차지하되 보이지 않게(공간만 예약 → 카드 높이 통일).
  heroForecastHidden: { opacity: 0 },
  condpill: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: RADIUS.pill },
  condText: { fontFamily: FONT, fontSize: 12.5, fontWeight: '500' },

  sectionLabel: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: SPACE.xl, paddingBottom: SPACE.sm },
  sectionLabelInline: { paddingHorizontal: 0, paddingBottom: 0 },
  sectionMore: { color: T4, fontFamily: FONT, fontSize: 11.5, fontWeight: '500' },

  // 오늘의 신발 캐러셀 — 페이지 도트 + 스와이프 힌트(목업 정합)
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: SPACE.md },
  pageDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: withAlpha(T1, 0.22) },
  pageDotOn: { width: 16, backgroundColor: ACCENT },
  swipeHint: { textAlign: 'center', color: T3, fontFamily: FONT, fontSize: 12, marginTop: 10 },

  // 주간 목표 — 목업 .week(상단 구분선 + 가로 통계 + 막대바)
  // 주간 목표 카드(사용자 요청) — 현재 상태 InsightCard 와 동일한 카드 분위기로 통일.
  weekWrap: { marginHorizontal: SPACE.xl, marginTop: SPACE.lg, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: withAlpha(T1, 0.07), padding: SPACE.lg },
  weekStats: { flexDirection: 'row', alignItems: 'flex-start' },
  weekStat: { flex: 1 },
  weekStatLead: {},
  weekLeadV: { color: T2, fontFamily: FONT, fontSize: 15, fontWeight: '500', lineHeight: 19 },
  weekV: { color: T1, fontFamily: DISPLAY, fontSize: 21, fontWeight: '500', letterSpacing: -0.4 },
  weekU: { color: T4, fontFamily: FONT, fontSize: 11, fontWeight: '500' },
  weekK: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500', marginTop: 5 },
  gbar: { height: 3, borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.07), marginTop: 18, overflow: 'hidden' },
  gbarFill: { height: '100%', borderRadius: RADIUS.pill },
  gnote: { color: T4, fontFamily: FONT, fontSize: 11, marginTop: 9 },

  rotaWrap: { marginTop: SPACE.lg },
  rotaCard: { marginHorizontal: SPACE.xl, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: withAlpha(T1, 0.07), paddingHorizontal: SPACE.lg },
  rotaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: 14 },
  rotaRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  rotaBrand: { color: T3, fontFamily: DISPLAY, fontSize: 10.5, fontWeight: '500', letterSpacing: 1.2 },
  rotaModel: { fontFamily: DISPLAY, fontSize: 15, fontWeight: '600', letterSpacing: -0.1, marginTop: 4 },
  rotaReason: { color: T3, fontFamily: FONT, fontSize: 12, marginTop: 3 },

  // 수익화 v1: 교체 시점 '다음 러닝화' 추천 카드(오렌지 절제 — 테두리만 액센트)
  nextWrap: { marginTop: SPACE.lg },
  nextCard: { marginHorizontal: SPACE.xl, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: withAlpha(ACCENT, 0.3), padding: SPACE.lg },
  nextSub: { color: T3, fontFamily: FONT, fontSize: 12.5, lineHeight: 18, marginBottom: SPACE.sm },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: 11 },
  nextRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  nextBrand: { color: T3, fontFamily: DISPLAY, fontSize: 10, fontWeight: '500', letterSpacing: 1.2 },
  nextModel: { color: T1, fontFamily: DISPLAY, fontSize: 14.5, fontWeight: '600', letterSpacing: -0.1, marginTop: 3 },
  nextCat: { color: T3, fontFamily: FONT, fontSize: 11, marginTop: 3 },
  shopBtns: { flexDirection: 'row', gap: 6 },
  shopBtn: { borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.1), paddingHorizontal: 11, paddingVertical: 6 },
  shopBtnTxt: { color: ACCENT, fontFamily: FONT, fontSize: 11.5, fontWeight: '600' },
  nextDisclosure: { color: T3, fontFamily: FONT, fontSize: 10.5, lineHeight: 15, marginTop: SPACE.md, opacity: 0.85 },

  // 주간 목표 인라인 편집 모달(홈에서 바로 수정)
  goalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  goalSheet: { width: '100%', maxWidth: 360, backgroundColor: CARD, borderRadius: RADIUS.xl, padding: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.1) },
  goalSheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 },
  goalSheetTitle: { color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '600' },
  goalStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  goalStepBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center' },
  goalStepVal: { flex: 1, alignItems: 'center' },
  goalStepNum: { color: T1, fontFamily: DISPLAY, fontSize: 40, letterSpacing: 0.3 },
  goalStepUnit: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', marginTop: 2 },
  goalSheetHint: { color: T3, fontFamily: FONT, fontSize: 12.5, textAlign: 'center', marginTop: 16 },
  goalDone: { marginTop: 20, height: 50, borderRadius: 16, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  goalDoneText: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600' },


  empty: { paddingHorizontal: SPACE.xl, paddingTop: 30 },
  emptyCard: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: CARD_DIM, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: withAlpha(T1, 0.12), paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '600' },
  emptyText: { color: T3, fontFamily: FONT, fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginTop: 10 },
  emptyBtn: { alignSelf: 'stretch', marginTop: 22, height: 50, borderRadius: RADIUS.pill, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600' },
});
