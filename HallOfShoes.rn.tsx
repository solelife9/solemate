// ============================================================================
// HallOfShoes.rn.tsx — 명예의 전당(은퇴한 러닝화의 기록)
// ----------------------------------------------------------------------------
// 사용자 확정 디자인(2026-07-05): 블랙&골드 세리프 전당. 명조는 앱에 번들된
// NanumMyeongjo(ExtraBold 페이스) — AppleMyungjo 는 iOS 미탑재(맥 전용) 폴백 버그.
//   · 세리프 라지 타이틀 + 장식 오너먼트
//   · 레거시 요약(총 KM·은퇴 켤레·함께한 러닝)
//   · 최근 헌액 히어로(LATEST INDUCTEE 배지 + 포일 그라데이션 빅넘버)
//   · 전당 컬렉션 2열 그리드(연도 씰 + 세리프 모델)
//   · 탭 → 은퇴 인증서(전체화면 · 포일 빅넘버 · RETIRED 씰 · RUNNER · 공유)
//   · 빈 상태(스포트라이트 받침대)
// 데이터는 App 이 progression.retiredShoes(RetiredShoeRecord)로 주입한다. 표시 전용.
// ============================================================================

import React, {useMemo, useRef, useState} from 'react';
import {View, Text, ScrollView, Pressable, Modal, StyleSheet, Platform, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, {Defs, LinearGradient, RadialGradient, Stop, Rect, Path, Circle, Text as SvgText} from 'react-native-svg';
import {Unit, displayNum} from './lib/units';
import {FONT, DISPLAY} from './theme';
import {SwipeBack} from './primitives';
import RetirementCard from './RetirementCard';
import {buildRetirementCardModel, highlightLabel} from './lib/progression/retirementCard';
import {shareRetirementCard} from './lib/progression/retirementShare';
import type {RetiredShoeRecord} from './lib/progression/types';

// ── 블랙&골드 토큰(사용자 디자인) ──────────────────────────────────────────────
const G = {
  bg: '#0A0908', surface: '#121110', txt: '#F3EEE3',
  muted: 'rgba(243,238,227,0.52)', faint: 'rgba(243,238,227,0.34)',
  gold: '#D6B478', soft: 'rgba(214,180,120,0.46)', line: 'rgba(214,180,120,0.20)',
};
const SERIF = Platform.OS === 'ios' ? 'NanumMyeongjoExtraBold' : 'NanumMyeongjo';
// 포일 그라데이션(큰 숫자) — 밝은 금 → 딥 골드 → 밝은 금(금박 반사).
const FOIL: {o: number; c: string}[] = [
  {o: 0, c: '#F6E2A6'}, {o: 0.38, c: '#D0A557'}, {o: 0.64, c: '#9C7330'}, {o: 1, c: '#EFD590'},
];

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

// ── 포일 그라데이션 텍스트(큰 숫자) ────────────────────────────────────────────
function FoilText({text, size, width, ls = 0}: {text: string; size: number; width: number; ls?: number}) {
  const uid = React.useId();
  const h = size * 1.18;
  return (
    <Svg width={width} height={h}>
      <Defs>
        <LinearGradient id={uid} x1="0" y1="0" x2="1" y2="0.4">
          {FOIL.map((s, i) => <Stop key={i} offset={s.o} stopColor={s.c} />)}
        </LinearGradient>
      </Defs>
      <SvgText x={width / 2} y={size} fontSize={size} fontWeight="800" textAnchor="middle" fill={`url(#${uid})`} letterSpacing={ls}>
        {text}
      </SvgText>
    </Svg>
  );
}

// 장식 라인(가운데 골드 마름모)
function Ornament({width = 150}: {width?: number}) {
  return (
    <View style={[st.orn, {width}]}>
      <View style={st.ornLine} />
      <View style={st.ornDot} />
      <View style={st.ornLine} />
    </View>
  );
}

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
    <View style={[st.screen, {paddingTop: insets.top + 8}]}>
      <View style={st.topbar}>
        <Pressable style={st.iconbtn} onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="뒤로" testID="hall-back">
          <Ionicons name="chevron-back" size={17} color={G.gold} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 22, paddingBottom: insets.bottom + 30}}>
        {/* 헤더 — 애플 라지 타이틀(좌측, 라인 최소) */}
        <View style={st.head}>
          <Text style={st.title}>명예의 전당</Text>
          <Text style={st.subtitle}>은퇴한 러닝화의 기록</Text>
        </View>

        {count === 0 ? (
          <EmptyHall onRegister={onGoShoes ?? onBack} />
        ) : (
          <>
            {/* 레거시 요약 */}
            <View style={st.legacy}>
              <View style={st.lcell}>
                <Text style={[st.lval, {color: G.gold}]}>{unit === 'km' ? kmComma(totalKm) : displayNum(totalKm, unit, 0)}</Text>
                <Text style={st.llabel}>총 {unit.toUpperCase()}</Text>
              </View>
              <View style={[st.lcell, st.lcellDiv]}>
                <Text style={st.lval}>{count}</Text>
                <Text style={st.llabel}>은퇴한 켤레</Text>
              </View>
              <View style={[st.lcell, st.lcellDiv]}>
                <Text style={st.lval}>{totalRuns}</Text>
                <Text style={st.llabel}>함께한 러닝</Text>
              </View>
            </View>

            {/* 최근 헌액 */}
            <View style={st.sec}>
              <Text style={st.secT}>최근 헌액</Text>
              <Text style={st.secC}>{yearOf(latest)}</Text>
            </View>
            <Pressable
              style={({pressed}) => [st.featured, pressed && {opacity: 0.92}]}
              onPress={() => setSel(latest)}
              accessibilityRole="button"
              accessibilityLabel={`${latest.name} 인증서`}>
              <View style={st.featTop}>
                <View style={st.badge}>
                  <View style={st.badgeDot} />
                  <Text style={st.badgeTxt}>최근 은퇴</Text>
                </View>
                <Text style={st.featYear}>{periodOf(latest)}</Text>
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
                  <Text style={st.featNum}>{displayNum(latest.km, unit, 0)}</Text>
                  <Text style={st.featKm}>{unit}</Text>
                </View>
              </View>
            </Pressable>

            {/* 전당 컬렉션 */}
            <View style={st.sec}>
              <Text style={st.secT}>전당 컬렉션</Text>
              <Text style={st.secC}>전체 {count}</Text>
            </View>
            <View style={st.grid}>
              {list.map((r, i) => {
                const nm = splitName(r.name);
                const yy = yearOf(r);
                return (
                  <Pressable
                    key={r.shoeId}
                    style={({pressed}) => [st.plaque, pressed && {opacity: 0.92}]}
                    onPress={() => setSel(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.name} 인증서`}
                    testID={`hall-plaque-${r.shoeId}`}>
                    <View style={st.seal}>
                      <Text style={st.sealTxt}>{count - i}</Text>
                    </View>
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

// ── 은퇴 인증서(전체화면 모달) — 블랙&골드 세리프 인증서(사용자 확정) ─────────────
function Certificate({shoe, unit, userName, onClose}: {shoe: RetiredShoeRecord; unit: Unit; userName?: string; onClose: () => void}) {
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const nm = splitName(shoe.name);
  const d = displayNum(shoe.km, unit, 0);
  const months = monthsOf(shoe);
  const memorable = highlightLabel(shoe.summary?.mostMemorable).replace(/^[^\uAC00-\uD7A3A-Za-z0-9]+/, '').trim();
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
      <View style={[st.certFrame, {top: insets.top + 6}]} pointerEvents="none" />
      <Pressable style={[st.certX, {left: 20, top: insets.top + 6}]} onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
        <Ionicons name="close" size={16} color={G.muted} />
      </Pressable>
      <Pressable style={[st.certX, {right: 20, top: insets.top + 6}]} onPress={onShare} hitSlop={10} accessibilityRole="button" accessibilityLabel="인증서 공유" testID="cert-share">
        <Ionicons name="share-outline" size={15} color={G.gold} />
      </Pressable>

      <ScrollView contentContainerStyle={[st.certContent, {paddingTop: insets.top + 50, paddingBottom: insets.bottom + 40}]} showsVerticalScrollIndicator={false}>
        {/* 마스트헤드(사용자 확정): RUNNER 좌상 · RETIRED 뱃지 우상 */}
        <View style={st.coMast}>
          <View style={st.coRunner}>
            <Text style={st.coSignK}>RUNNER</Text>
            <Text style={st.coSignNm}>{runner}</Text>
          </View>
          <View style={st.coSeal}>
            <View style={st.coSealInner} pointerEvents="none" />
            <Text style={st.coSealT}>RETIRED</Text>
            <Text style={st.coSealN}>{yearOf(shoe)}</Text>
            <Text style={st.coSealB}>KEEGO</Text>
          </View>
        </View>

        <Ornament width={150} />
        <Text style={st.coDoctype}>은퇴 인증서</Text>
        <Text style={st.coDoctypeKr}>이 신발과의 여정을 기립니다</Text>
        {!!nm.brand && <Text style={st.coBrand}>{nm.brand}</Text>}
        <Text style={st.coModel}>{nm.model}</Text>
        <View style={{marginTop: 18}}><FoilText text={String(d)} size={92} width={width - 56} ls={-4} /></View>
        <Text style={st.coUnit}>함께 달린 거리</Text>
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

        <View style={st.coFoot}>
          <View style={st.coFootLine} />
          <Text style={st.coFootKg}>KEEGO · KEEP GOING</Text>
          <View style={st.coFootLine} />
        </View>
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

// ── 빈 상태(스포트라이트 받침대) ──────────────────────────────────────────────────
function EmptyHall({onRegister}: {onRegister?: () => void}) {
  return (
    <View style={st.empty} testID="hall-empty">
      <View style={st.emptyArt}>
        <Svg width={250} height={190} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="40%" rx="56%" ry="56%">
              <Stop offset="0" stopColor={G.gold} stopOpacity={0.2} />
              <Stop offset="0.5" stopColor={G.gold} stopOpacity={0.05} />
              <Stop offset="0.76" stopColor={G.gold} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="beam" x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor={G.gold} stopOpacity={0.12} />
              <Stop offset="1" stopColor={G.gold} stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="plinth" x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor={G.gold} stopOpacity={0.18} />
              <Stop offset="1" stopColor={G.gold} stopOpacity={0.03} />
            </LinearGradient>
          </Defs>
          <Circle cx="125" cy="78" r="96" fill="url(#halo)" />
          <Path d="M96 0 L154 0 L178 150 L72 150 Z" fill="url(#beam)" />
          <Path d="M72 163 L178 163 L196 190 L54 190 Z" fill="url(#plinth)" />
          <Rect x="80" y="149" width="90" height="14" rx="3" fill="url(#plinth)" />
          <Rect x="80" y="149" width="90" height="2.5" rx="1.2" fill={G.gold} opacity={0.45} />
        </Svg>
        <View style={st.emblem}>
          <Ionicons name="trophy" size={30} color={G.gold} />
        </View>
      </View>

      <Text style={st.eLabel}>빈 전당</Text>
      <Text style={st.eTitle}>첫 헌액을 기다려요</Text>
      <Text style={st.eDesc}>신발 한 켤레와 끝까지 달린 뒤 은퇴시키면,{'\n'}그 여정이 이곳 명예의 전당에 영원히 새겨져요.</Text>

      {!!onRegister && (
        <Pressable style={({pressed}) => [st.cta, pressed && {opacity: 0.85}]} onPress={onRegister} accessibilityRole="button" accessibilityLabel="내 신발 보러 가기">
          <Text style={st.ctaTxt}>내 신발 보러 가기</Text>
        </Pressable>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: {flex: 1, backgroundColor: G.bg},
  topbar: {height: 40, justifyContent: 'center', paddingHorizontal: 22},
  iconbtn: {width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: G.line, alignItems: 'center', justifyContent: 'center'},

  head: {alignItems: 'flex-start', gap: 6, paddingTop: 12, paddingBottom: 26},
  title: {fontFamily: SERIF, fontSize: 30, fontWeight: '700', color: G.txt, letterSpacing: -0.3},
  subtitle: {fontFamily: FONT, fontSize: 14, fontWeight: '500', color: G.muted},
  orn: {flexDirection: 'row', alignItems: 'center', gap: 10},
  ornLine: {flex: 1, height: 1, backgroundColor: G.soft, opacity: 0.55},
  ornDot: {width: 5, height: 5, backgroundColor: G.gold, transform: [{rotate: '45deg'}]},

  legacy: {flexDirection: 'row', borderWidth: 1, borderColor: G.line, borderRadius: 18, backgroundColor: 'rgba(214,180,120,0.04)', paddingVertical: 18, marginBottom: 28},
  lcell: {flex: 1, alignItems: 'center', gap: 5},
  lcellDiv: {borderLeftWidth: 1, borderLeftColor: G.line},
  lval: {fontFamily: DISPLAY, fontSize: 26, fontWeight: '600', color: G.txt, letterSpacing: -0.5, fontVariant: ['tabular-nums']},
  llabel: {fontFamily: FONT, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: G.faint},

  sec: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13},
  secT: {fontFamily: FONT, fontSize: 14, fontWeight: '700', color: G.txt},
  secC: {fontFamily: DISPLAY, fontSize: 12, fontWeight: '700', color: G.gold, letterSpacing: 0.4, fontVariant: ['tabular-nums']},

  featured: {borderRadius: 20, borderWidth: 1, borderColor: G.soft, backgroundColor: G.surface, padding: 22, paddingBottom: 20, marginBottom: 30, overflow: 'hidden'},
  featTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  badge: {flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: G.line, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10},
  badgeDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: G.gold},
  badgeTxt: {fontFamily: FONT, fontSize: 9, fontWeight: '700', letterSpacing: 1.4, color: G.gold},
  featYear: {fontFamily: SERIF, fontSize: 14, color: G.muted, fontVariant: ['tabular-nums']},
  featBody: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginTop: 26},
  featName: {flex: 1},
  featBrand: {fontFamily: FONT, fontSize: 11, fontWeight: '700', letterSpacing: 1.8, color: G.gold},
  featModel: {fontFamily: SERIF, fontSize: 25, fontWeight: '700', color: G.txt, marginTop: 7},
  featQuote: {fontFamily: FONT, fontSize: 13, fontWeight: '600', color: G.muted, marginTop: 9},
  featDist: {flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 8},
  featNum: {fontFamily: DISPLAY, fontSize: 44, fontWeight: '700', color: G.gold, letterSpacing: -1.5, fontVariant: ['tabular-nums']},
  featKm: {fontFamily: DISPLAY, fontSize: 16, fontWeight: '700', color: G.gold, opacity: 0.7},

  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14},
  plaque: {width: '48%', borderRadius: 16, borderWidth: 1, borderColor: G.line, backgroundColor: '#120f0b', padding: 16, paddingBottom: 15, minHeight: 168, overflow: 'hidden'},
  seal: {width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: G.soft, alignItems: 'center', justifyContent: 'center'},
  sealTxt: {fontFamily: SERIF, fontSize: 9, fontWeight: '700', color: G.gold},
  pbrand: {fontFamily: FONT, fontSize: 9, fontWeight: '700', letterSpacing: 1.4, color: G.gold, marginTop: 16},
  pmodel: {fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: G.txt, marginTop: 5, lineHeight: 19},
  pfoot: {marginTop: 'auto', paddingTop: 12, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: G.line},
  pkm: {fontFamily: DISPLAY, fontSize: 18, fontWeight: '600', color: G.txt, letterSpacing: -0.3, fontVariant: ['tabular-nums']},
  pkmU: {fontFamily: DISPLAY, fontSize: 11, fontWeight: '700', color: G.muted},
  pyear: {fontFamily: DISPLAY, fontSize: 12, fontWeight: '600', color: G.faint, fontVariant: ['tabular-nums']},


  // ── 인증서 ──
  certScreen: {flex: 1, backgroundColor: '#08070A'},
  certContent: {alignItems: 'center', paddingHorizontal: 28},
  certFrame: {position: 'absolute', left: 16, right: 16, bottom: 16, borderRadius: 18, borderWidth: 1, borderColor: G.soft, zIndex: 1},
  certX: {position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: G.line, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', zIndex: 2},
  coDoctype: {fontFamily: SERIF, fontSize: 21, color: G.gold, letterSpacing: 5, marginTop: 8},
  coDoctypeKr: {fontFamily: FONT, fontSize: 13, fontWeight: '500', color: G.muted, letterSpacing: 0.3, marginTop: 8},
  coBrand: {fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 2.2, color: G.gold, marginTop: 32},
  coModel: {fontFamily: SERIF, fontSize: 28, fontWeight: '700', color: G.txt, marginTop: 7, textAlign: 'center'},
  coUnit: {fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 3.4, color: G.txt, marginTop: 12},
  coQuote: {fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: G.txt, marginTop: 20, textAlign: 'center'},
  coMeta: {flexDirection: 'row', alignSelf: 'stretch', marginTop: 28},
  coCell: {flex: 1, gap: 5, paddingHorizontal: 8, alignItems: 'center'},
  coCellDiv: {borderLeftWidth: 1, borderLeftColor: G.line},
  coK: {fontFamily: FONT, fontSize: 8, fontWeight: '700', letterSpacing: 1.2, color: G.faint},
  coV: {fontFamily: DISPLAY, fontSize: 14, fontWeight: '700', color: G.txt, textAlign: 'center', lineHeight: 18},
  coS: {fontFamily: DISPLAY, fontSize: 12, fontWeight: '600', color: G.muted, fontVariant: ['tabular-nums']},
  coRule: {alignSelf: 'stretch', height: 1, backgroundColor: G.line, marginTop: 26},
  coSeal: {width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: G.soft, alignItems: 'center', justifyContent: 'center'},
  coSealInner: {position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 31, borderWidth: 1, borderColor: 'rgba(214,180,120,0.26)'},
  coSealT: {fontFamily: SERIF, fontSize: 7, fontWeight: '700', letterSpacing: 1.3, color: G.gold},
  coSealN: {fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: G.gold, lineHeight: 18},
  coSealB: {fontFamily: SERIF, fontSize: 6, fontWeight: '700', letterSpacing: 1, color: G.faint},
  coMast: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', alignSelf: 'stretch', marginHorizontal: -6, marginBottom: 28},
  coRunner: {alignItems: 'flex-start', paddingTop: 8, gap: 5},
  coSign: {alignItems: 'flex-end'},
  coSignK: {fontFamily: SERIF, fontSize: 8, fontWeight: '700', letterSpacing: 1.4, color: G.faint},
  coSignNm: {fontFamily: SERIF, fontSize: 20, fontWeight: '700', color: G.txt, marginTop: 5},
  coShare: {marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: G.soft, backgroundColor: 'rgba(214,180,120,0.04)'},
  coShareTxt: {fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 0.3, color: G.gold},
  coFoot: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16},
  coFootLine: {width: 22, height: 1, backgroundColor: G.soft},
  coFootKg: {fontFamily: SERIF, fontSize: 11, fontWeight: '700', letterSpacing: 2.8, color: G.gold},
  offscreen: {position: 'absolute', left: -4000, top: 0, opacity: 0},

  // ── 빈 상태 ──
  empty: {alignItems: 'center', paddingTop: 26},
  emptyArt: {width: 250, height: 190, alignItems: 'center', justifyContent: 'center'},
  emblem: {alignItems: 'center', justifyContent: 'center'},
  eLabel: {fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 3.3, color: G.gold, marginTop: 30},
  eTitle: {fontFamily: SERIF, fontSize: 25, fontWeight: '700', color: G.txt, marginTop: 14},
  eDesc: {fontSize: 15, fontWeight: '500', color: G.muted, lineHeight: 23, marginTop: 14, textAlign: 'center', maxWidth: 286},
  cta: {alignSelf: 'stretch', height: 54, borderRadius: 16, borderWidth: 1, borderColor: G.soft, backgroundColor: 'rgba(214,180,120,0.10)', alignItems: 'center', justifyContent: 'center', marginTop: 38},
  ctaTxt: {fontSize: 16, fontWeight: '700', color: G.gold},
});

export default HallOfShoes;
