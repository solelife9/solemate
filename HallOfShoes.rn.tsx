// ============================================================================
// HallOfShoes.rn.tsx — 러닝화 아카이브(은퇴한 러닝화의 기록 — 구명 명예의 전당, 2026-07-09 리네임)
// ----------------------------------------------------------------------------
// 2026-07-11 무채 통일(사용자 확정: "혼자 너무 과함 — 다른 화면들처럼").
// 구 골드 세리머니 룩(세리프·골드 배경톤·halo/plinth SVG 연출)을 앱 정본 문법으로 재설계:
//   · 배경 BG + AmbientBackdrop, 카드 = 콰이어트 글라스(GLASS.fill + GlassEdge glints=false)
//   · Pretendard(TYPE 스케일) 단일 — 세리프(NanumMyeongjo) 폐지
//   · 성취 무드는 재질이 아니라 타이포와 절제로. 골드(HALL_GOLD)는 소액센트 —
//     최근 헌액 큰 누적 km 숫자 + 헌액 연도 칩만(넓은 면·배경 틴트 금지)
//   · 은퇴 카드 2열 그리드 유지(신발 글리프 · 모델 · 큰 누적 km · 은퇴 연도)
//   · 빈 상태 = 정본 고스트 문법(EmptyGhostHeader + 고스트 카드, 스포트라이트 무대 폐지)
//   · 진입 = Rise 스태거
// 데이터는 App 이 progression.retiredShoes(RetiredShoeRecord)로 주입한다. 표시 전용.
// ============================================================================

import React, {useMemo, useRef, useState} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {View, ScrollView, Pressable, Modal, StyleSheet} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Unit, displayNum} from './lib/units';
import {
  BG,
  GLASS,
  HALL_GOLD,
  T1,
  T2,
  T3,
  T4,
  SEP,
  FONT,
  DISPLAY,
  withAlpha,
  TYPE,
  HERO,
  RADIUS,
  GUTTER,
  MOTION,
} from './theme';
import {
  SwipeBack,
  AmbientBackdrop,
  Rise,
  GlassEdge,
  EmptyGhostHeader,
  GhostStrong,
  GhostBar,
  GhostThumb,
  ShoeGlyph,
  Button,
} from './primitives';
import RetirementCard from './RetirementCard';
import {buildRetirementCardModel, highlightLabel} from './lib/progression/retirementCard';
import {shareRetirementCard} from './lib/progression/retirementShare';
import type {RetiredShoeRecord} from './lib/progression/types';

export interface HallOfShoesProps {
  records?: readonly RetiredShoeRecord[];
  unit?: Unit;
  onBack?: () => void;
  userName?: string;
  onGoShoes?: () => void;
  onOpenRecord?: (record: RetiredShoeRecord) => void;
}

// ── 파생 헬퍼 ──────────────────────────────────────────────────────────────────
function yearOf(r: RetiredShoeRecord): string {
  if (Number.isFinite(r.retireYear) && r.retireYear > 0) return String(r.retireYear);
  const iso = typeof r.retiredAt === 'string' ? r.retiredAt.slice(0, 4) : '';
  return /^\d{4}$/.test(iso) ? iso : '';
}
function splitName(name?: string): {brand: string; model: string} {
  const n = (typeof name === 'string' && name.trim()) || '내 러닝화';
  const i = n.indexOf(' ');
  return i > 0 ? {brand: n.slice(0, i), model: n.slice(i + 1)} : {brand: '', model: n};
}
function ym(iso?: string | null): string {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${m[1]}.${m[2]}` : '';
}
function periodOf(r: RetiredShoeRecord): string {
  const a = ym(r.summary?.firstRunDate);
  const b = ym(r.summary?.lastRunDate ?? r.retiredAt);
  if (a && b) return `${a} – ${b}`;
  return yearOf(r);
}
function monthsOf(r: RetiredShoeRecord): number {
  const days = r.summary?.usageDays;
  if (Number.isFinite(days) && (days as number) > 0) return Math.max(1, Math.round((days as number) / 30));
  return 0;
}
const kmInt = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
const kmComma = (n: number) => kmInt(n).toLocaleString();

function HallOfShoes({records = [], unit = 'km', onBack, userName, onGoShoes}: HallOfShoesProps) {
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<RetiredShoeRecord | null>(null);

  const list = useMemo(() => {
    const valid = (Array.isArray(records) ? records : []).filter(r => r && typeof r.shoeId === 'string' && r.shoeId);
    return [...valid].sort((a, b) => {
      const ax = typeof a.retiredAt === 'string' ? a.retiredAt : '';
      const bx = typeof b.retiredAt === 'string' ? b.retiredAt : '';
      if (ax !== bx) return ax > bx ? -1 : 1;
      return (b.retireYear || 0) - (a.retireYear || 0);
    });
  }, [records]);

  const count = list.length;
  const totalKm = useMemo(() => list.reduce((a, r) => a + kmInt(r.km), 0), [list]);
  const totalRuns = useMemo(() => list.reduce((a, r) => a + (r.summary?.runCount ?? 0), 0), [list]);
  const latest = list[0];

  return (
    <SwipeBack onBack={onBack}>
    <View style={[st.screen, {paddingTop: insets.top}]}>
      <AmbientBackdrop />
      <View style={st.nav}>
        <Pressable style={st.iconBtn} onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="뒤로" testID="hall-back">
          <Ionicons name="chevron-back" size={ri(20)} color={T1} />
        </Pressable>
        <Text style={st.navTitle}>러닝화 아카이브</Text>
        <View style={{width: rs(36)}} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: GUTTER, paddingTop: rv(6), paddingBottom: insets.bottom + 30}}>
        {count === 0 ? (
          <Rise>
            <EmptyHall onRegister={onGoShoes ?? onBack} />
          </Rise>
        ) : (
          <>
            {/* 레거시 요약 — 콰이어트 글라스 스탯 스트립(보관함·메달 아카이브와 형제 문법) */}
            <Rise>
              <View style={st.statStrip}>
                <GlassEdge glints={false} radius={RADIUS.lg} />
                <View style={st.stat}>
                  <Text style={st.statV}>{unit === 'km' ? kmComma(totalKm) : displayNum(totalKm, unit, 0)}<Text style={st.statU}> {unit}</Text></Text>
                  <Text style={st.statL}>누적 거리</Text>
                </View>
                <View style={st.statDiv} />
                <View style={st.stat}>
                  <Text style={st.statV}>{count}</Text>
                  <Text style={st.statL}>은퇴한 켤레</Text>
                </View>
                <View style={st.statDiv} />
                <View style={st.stat}>
                  <Text style={st.statV}>{totalRuns}</Text>
                  <Text style={st.statL}>함께한 러닝</Text>
                </View>
              </View>
              <Text style={st.sub}>은퇴한 러닝화의 기록.</Text>
            </Rise>

            {/* 최근 헌액 */}
            <Rise delay={60}>
              <View style={st.sec}>
                <Text style={st.secT}>최근 헌액</Text>
              </View>
              <Pressable
                style={({pressed}) => [st.featured, pressed && st.pressed]}
                onPress={() => setSel(latest)}
                accessibilityRole="button"
                accessibilityLabel={`${latest.name} 인증서`}>
                <GlassEdge glints={false} radius={RADIUS.lg} />
                <View style={st.featTop}>
                  {/* 헌액 연도 칩 — 골드 소액센트 ①(성취 도메인) */}
                  <View style={st.yearChip}>
                    <Text style={st.yearChipTxt}>{yearOf(latest)} 헌액</Text>
                  </View>
                  <Text style={st.featPeriod}>{periodOf(latest)}</Text>
                </View>
                <View style={st.featBody}>
                  <View style={st.featName}>
                    {!!splitName(latest.name).brand && (
                      <Text style={st.featBrand}>{splitName(latest.name).brand}</Text>
                    )}
                    <Text style={st.featModel}>{splitName(latest.name).model}</Text>
                    <Text style={st.featQuote}>{kmInt(latest.km)}{unit}의 여정, 고마웠어.</Text>
                  </View>
                  <View style={st.featDist}>
                    {/* 큰 누적 km 숫자 — 골드 소액센트 ② */}
                    <Text style={st.featNum}>{displayNum(latest.km, unit, 0)}</Text>
                    <Text style={st.featKm}>{unit}</Text>
                  </View>
                </View>
              </Pressable>
            </Rise>

            {/* 전당 컬렉션 — 2열 그리드(신발 글리프 · 모델 · 큰 누적 km · 은퇴 연도) */}
            <Rise delay={120}>
              <View style={st.sec}>
                <Text style={st.secT}>전당 컬렉션</Text>
                <Text style={st.secC}>전체 {count}</Text>
              </View>
              <View style={st.grid}>
                {list.map((r) => {
                  const nm = splitName(r.name);
                  const yy = yearOf(r);
                  return (
                    <Pressable
                      key={r.shoeId}
                      style={({pressed}) => [st.plaque, pressed && st.pressed]}
                      onPress={() => setSel(r)}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.name} 인증서`}
                      testID={`hall-plaque-${r.shoeId}`}>
                      <GlassEdge glints={false} radius={RADIUS.md} />
                      <ShoeGlyph size={ri(26)} color={withAlpha(T1, 0.4)} />
                      {!!nm.brand && <Text style={st.pbrand}>{nm.brand}</Text>}
                      <Text style={st.pmodel} numberOfLines={2}>{nm.model}</Text>
                      <View style={st.pfoot}>
                        <Text style={st.pkm}>
                          {displayNum(r.km, unit, 0)}
                          <Text style={st.pkmU}>{unit}</Text>
                        </Text>
                        <Text style={st.pyear}>{yy}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Rise>
          </>
        )}
      </ScrollView>

      <Modal visible={!!sel} animationType="fade" transparent onRequestClose={() => setSel(null)}>
        {sel && <Certificate shoe={sel} unit={unit} userName={userName} onClose={() => setSel(null)} />}
      </Modal>
    </View>
    </SwipeBack>
  );
}

// ── 은퇴 인증서(전체화면 모달) — 정본 무채 + 골드 소액센트(빅넘버·RETIRED 칩) ────
function Certificate({shoe, unit, userName, onClose}: {shoe: RetiredShoeRecord; unit: Unit; userName?: string; onClose: () => void}) {
  const insets = useSafeAreaInsets();
  const nm = splitName(shoe.name);
  const d = displayNum(shoe.km, unit, 0);
  const months = monthsOf(shoe);
  const memorable = highlightLabel(shoe.summary?.mostMemorable).replace(/^[^가-힣A-Za-z0-9]+/, '').trim();
  const runner = (typeof userName === 'string' && userName.trim()) || '러너';
  // 스토리 공유(무기 #1) — 오프스크린 카드(RetirementCard 'S')를 캡처해 OS 공유 시트로.
  const storyRef = useRef(null);
  const storyModel = useMemo(
    () =>
      buildRetirementCardModel(
        {...(shoe.summary ?? {}), name: shoe.name} as never,
        shoe.grade,
        {unit, distanceKm: shoe.km, retiredAtMs: ymdToMsSafe(shoe.retiredAt)},
      ),
    [shoe, unit],
  );
  const onShare = () => { void shareRetirementCard(storyRef, storyModel); };

  return (
    <View style={st.certScreen}>
      <AmbientBackdrop />
      <Pressable style={[st.certX, {left: 20, top: insets.top + 6}]} onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
        <Ionicons name="close" size={ri(16)} color={T2} />
      </Pressable>
      <Pressable style={[st.certX, {right: 20, top: insets.top + 6}]} onPress={onShare} hitSlop={10} accessibilityRole="button" accessibilityLabel="인증서 공유" testID="cert-share">
        <Ionicons name="share-outline" size={ri(15)} color={T1} />
      </Pressable>

      <ScrollView contentContainerStyle={[st.certContent, {paddingTop: insets.top + 56, paddingBottom: insets.bottom + 40}]} showsVerticalScrollIndicator={false}>
        {/* 마스트헤드: RUNNER 좌상 · RETIRED 연도 칩 우상(골드 소액센트) */}
        <View style={st.coMast}>
          <View style={st.coRunner}>
            <Text style={st.coSignK}>RUNNER</Text>
            <Text style={st.coSignNm}>{runner}</Text>
          </View>
          <View style={st.coSeal}>
            <Text style={st.coSealT}>RETIRED</Text>
            <Text style={st.coSealN}>{yearOf(shoe)}</Text>
          </View>
        </View>

        <Text style={st.coDoctype}>은퇴 인증서</Text>
        <Text style={st.coDoctypeKr}>이 신발과의 여정을 기립니다</Text>
        {!!nm.brand && <Text style={st.coBrand}>{nm.brand}</Text>}
        <Text style={st.coModel}>{nm.model}</Text>
        {/* 빅넘버 — 골드 소액센트(성취 도메인). 포일 SVG 폐지, 타이포로 말한다. */}
        <Text style={st.coNum}>{d}</Text>
        <Text style={st.coUnit}>함께 달린 거리 · {unit}</Text>
        <Text style={st.coQuote}>{d}{unit}의 여정, 고마웠어.</Text>

        <View style={st.coMeta}>
          <View style={st.coCell}>
            <Text style={st.coK}>가장 기억에 남는</Text>
            <Text style={st.coV}>{memorable || '함께한 모든 순간'}</Text>
            <Text style={st.coS}>{ym(shoe.summary?.firstRunDate)}</Text>
          </View>
          <View style={[st.coCell, st.coCellDiv]}>
            <Text style={st.coK}>함께한 기간</Text>
            <Text style={st.coV}>{months > 0 ? `${months}개월` : `${shoe.summary?.runCount ?? 0}회`}</Text>
            <Text style={st.coS}>{periodOf(shoe)}</Text>
          </View>
        </View>

        <View style={st.coRule} />
        <Text style={st.coFootKg}>KEEGO · KEEP GOING</Text>
      </ScrollView>

      {/* 화면 밖 스토리 카드 — 캡처 전용(보이지 않음). */}
      <View style={st.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <RetirementCard ref={storyRef} model={storyModel} format="S" />
      </View>
    </View>
  );
}

/** 'YYYY-MM-DD' → epoch ms(로컬 자정). 비정상이면 undefined. */
function ymdToMsSafe(iso?: string): number | undefined {
  if (typeof iso !== 'string') return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return undefined;
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

// ── 빈 상태 — 정본 고스트 문법(에디토리얼 타이포 + 고스트 명패 2장, 둘째 딤) ─────
function EmptyHall({onRegister}: {onRegister?: () => void}) {
  return (
    <View style={st.empty} testID="hall-empty">
      <EmptyGhostHeader
        title={'첫 헌액을 기다려요'}
        sub={<>신발 한 켤레와 끝까지 달린 뒤 <GhostStrong>은퇴</GhostStrong>시키면,{'\n'}그 여정이 이곳 러닝화 아카이브에 새겨져요.</>}
      />
      <View style={st.ghostRow}>
        <View style={st.ghostPlaque}>
          <GlassEdge glints={false} radius={RADIUS.md} />
          <GhostThumb size={40}><ShoeGlyph size={ri(22)} color={withAlpha(T1, 0.35)} /></GhostThumb>
          <GhostBar w="70%" style={{marginTop: rv(14)}} />
          <GhostBar w="44%" dim />
        </View>
        <View style={[st.ghostPlaque, {opacity: 0.45}]}>
          <GlassEdge glints={false} radius={RADIUS.md} />
          <GhostThumb size={40} />
          <GhostBar w="58%" style={{marginTop: rv(14)}} />
          <GhostBar w="36%" dim />
        </View>
      </View>

      {!!onRegister && (
        <Button label="내 신발 보러 가기" onPress={onRegister} style={st.emptyCta} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  // 누름 표준(MOTION.press) — 사설 opacity 0.92 폐지.
  pressed: {opacity: MOTION.press.opacity, transform: [{scale: MOTION.press.scale}]},
  nav: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingTop: rv(6), paddingBottom: rv(10)},
  iconBtn: {width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: 'center', justifyContent: 'center'},
  navTitle: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.3},
  sub: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(18), paddingHorizontal: rs(4), marginTop: rv(12), marginBottom: rv(20)},

  // 레거시 요약 — 콰이어트 글라스 스탯 스트립(보관함 문법)
  statStrip: {flexDirection: 'row', alignItems: 'center', backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingVertical: rv(16)},
  stat: {flex: 1, alignItems: 'center', gap: rv(4)},
  statV: {color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums']},
  statU: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700'},
  statL: {color: T3, fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '600', letterSpacing: 0.3},
  statDiv: {width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: SEP, marginVertical: rv(4)},

  sec: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: rv(12)},
  secT: {fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700', color: T1},
  secC: {fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '600', color: T3, letterSpacing: 0.4, fontVariant: ['tabular-nums']},

  // 최근 헌액 — 콰이어트 글라스(주인공은 타이포·골드 소액센트 숫자)
  featured: {borderRadius: RADIUS.lg, borderCurve: 'continuous', backgroundColor: GLASS.fill, padding: rs(20), marginBottom: rv(28), overflow: 'hidden'},
  featTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  yearChip: {borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(HALL_GOLD, 0.35), paddingVertical: rv(4), paddingHorizontal: rs(10)},
  yearChipTxt: {fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '700', letterSpacing: 0.8, color: HALL_GOLD, fontVariant: ['tabular-nums']},
  featPeriod: {fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '500', color: T3, fontVariant: ['tabular-nums']},
  featBody: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: rv(14), marginTop: rv(24)},
  featName: {flex: 1},
  featBrand: {fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '700', letterSpacing: 1.4, color: T3},
  featModel: {fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.4, color: T1, marginTop: rv(8)},
  featQuote: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', color: T3, marginTop: rv(8)},
  featDist: {flexDirection: 'row', alignItems: 'baseline', gap: rv(4), marginBottom: rv(4)},
  featNum: {fontFamily: DISPLAY, fontSize: rf(44), fontWeight: '800', color: HALL_GOLD, letterSpacing: -1.5, fontVariant: ['tabular-nums']},
  featKm: {fontFamily: DISPLAY, fontSize: TYPE.body.fontSize, fontWeight: '700', color: withAlpha(HALL_GOLD, 0.7)},

  // 전당 컬렉션 — 2열 콰이어트 글라스 명패
  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: rv(14)},
  plaque: {width: '48%', borderRadius: RADIUS.md, borderCurve: 'continuous', backgroundColor: GLASS.fill, padding: rs(16), minHeight: rs(160), overflow: 'hidden'},
  pbrand: {fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '700', letterSpacing: 1.2, color: T3, marginTop: rv(14)},
  pmodel: {fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2, color: T1, marginTop: rv(4), lineHeight: rf(20)},
  pfoot: {marginTop: 'auto', paddingTop: rv(12), flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  pkm: {fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', color: T1, letterSpacing: -0.3, fontVariant: ['tabular-nums']},
  pkmU: {fontFamily: DISPLAY, fontSize: TYPE.micro.fontSize, fontWeight: '700', color: T3},
  // 은퇴 연도 — 판독 대상 정보라 T4→T3 승격(T4 는 장식/disabled 전용).
  pyear: {fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '600', color: T3, fontVariant: ['tabular-nums']},

  // ── 인증서(정본 무채 + 골드 소액센트) ──
  certScreen: {flex: 1, backgroundColor: BG},
  certContent: {alignItems: 'center', paddingHorizontal: GUTTER},
  certX: {position: 'absolute', width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: GLASS.fill, alignItems: 'center', justifyContent: 'center', zIndex: 2, overflow: 'hidden'},
  coMast: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', alignSelf: 'stretch', marginBottom: rv(28)},
  coRunner: {alignItems: 'flex-start', gap: rv(4)},
  coSignK: {fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '700', letterSpacing: 1.4, color: T4},
  coSignNm: {fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700', color: T1},
  // RETIRED 연도 칩 — 골드 소액센트(헌액 연도)
  coSeal: {alignItems: 'center', gap: rv(2), borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(HALL_GOLD, 0.35), paddingVertical: rv(6), paddingHorizontal: rs(14)},
  coSealT: {fontFamily: FONT, fontSize: rf(8), fontWeight: '700', letterSpacing: 1.3, color: HALL_GOLD},
  coSealN: {fontFamily: DISPLAY, fontSize: TYPE.body.fontSize, fontWeight: '700', color: HALL_GOLD, fontVariant: ['tabular-nums']},
  coDoctype: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', color: T3, letterSpacing: 3, marginTop: rv(8)},
  coDoctypeKr: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', color: T3, letterSpacing: 0.3, marginTop: rv(8)},
  coBrand: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 2.2, color: T3, marginTop: rv(32)},
  coModel: {fontFamily: FONT, fontSize: TYPE.title1.fontSize, fontWeight: '700', letterSpacing: -0.6, color: T1, marginTop: rv(8), textAlign: 'center'},
  coNum: {fontFamily: DISPLAY, fontSize: HERO.mega, fontWeight: '800', color: HALL_GOLD, letterSpacing: -2, fontVariant: ['tabular-nums'], marginTop: rv(20)},
  coUnit: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 1.2, color: T3, marginTop: rv(8)},
  coQuote: {fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700', color: T1, marginTop: rv(20), textAlign: 'center'},
  coMeta: {flexDirection: 'row', alignSelf: 'stretch', marginTop: rv(28)},
  coCell: {flex: 1, gap: rv(4), paddingHorizontal: rs(8), alignItems: 'center'},
  coCellDiv: {borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP},
  coK: {fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '700', letterSpacing: 1.2, color: T4},
  coV: {fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '700', color: T1, textAlign: 'center', lineHeight: rf(18)},
  coS: {fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '600', color: T3, fontVariant: ['tabular-nums']},
  coRule: {alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: SEP, marginTop: rv(26)},
  coFootKg: {fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '700', letterSpacing: 2.8, color: T4, marginTop: rv(16)},
  offscreen: {position: 'absolute', left: -4000, top: 0, opacity: 0},

  // ── 빈 상태(고스트) ──
  empty: {paddingTop: rv(6)},
  ghostRow: {flexDirection: 'row', gap: rs(12)},
  ghostPlaque: {flex: 1, borderRadius: RADIUS.md, borderCurve: 'continuous', backgroundColor: GLASS.fill, padding: rs(16), overflow: 'hidden'},
  emptyCta: {marginTop: rv(32)},
});

export default HallOfShoes;
