// ============================================================================
// HallOfShoes.rn.tsx — 명예의 전당(은퇴한 러닝화의 기록)
// ----------------------------------------------------------------------------
// 사용자 확정 디자인(2026-07-05) + 애플 리디자인: 블랙&골드 명조 전당. 명조는 앱에
// 번들된 NanumMyeongjo(ExtraBold 페이스 — iOS AppleMyungjo 미탑재 폴백 버그 수정).
//   · 애플 라지 타이틀(좌측 명조 + 뮤트 서브타이틀)
//   · 레거시 요약 · 최근 헌액 히어로(LATEST INDUCTEE) · 컬렉션 2열(헌액 순번 씰)
//   · 탭 → 은퇴 인증서(레터헤드: 러너 좌상 · RETIRED 인장 우상 · 빅넘버 · 공유)
//   · 빈 상태(스포트라이트 받침대). 장식(이중 액자·오너먼트·포일)은 애플 절제로 제거.
// 데이터는 App 이 progression.retiredShoes(RetiredShoeRecord)로 주입한다. 표시 전용.
// ============================================================================

import React, {useMemo, useRef, useState} from 'react';
import {View, Text, ScrollView, Pressable, Modal, StyleSheet, Platform} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, {Defs, LinearGradient, RadialGradient, Stop, Rect, Path, Circle} from 'react-native-svg';
import {Unit, displayNum} from './lib/units';
import {fmtPaceSec} from './lib/pacePlan';
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
    <View style={[st.screen, {paddingTop: insets.top + 8}]}>
      <View style={st.topbar}>
        <Pressable style={st.iconbtn} onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="뒤로" testID="hall-back">
          <Ionicons name="chevron-back" size={17} color={G.gold} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 22, paddingBottom: insets.bottom + 30}}>
        {/* 헤더 — 애플 라지 타이틀 문법(좌측 세리프 + 뮤트 서브타이틀). 장식 오너먼트 제거. */}
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
                  <Text style={st.badgeTxt}>LATEST INDUCTEE</Text>
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
                // 헌액 순번(#1 = 가장 먼저 은퇴 = 첫 헌액자). list 는 최신순이라 count-i.
                const order = count - i;
                return (
                  <Pressable
                    key={r.shoeId}
                    style={({pressed}) => [st.plaque, pressed && {opacity: 0.92}]}
                    onPress={() => setSel(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.name} 인증서`}
                    testID={`hall-plaque-${r.shoeId}`}>
                    <View style={st.seal}>
                      <Text style={st.sealNo}>{order}</Text>
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
  const nm = splitName(shoe.name);
  const d = displayNum(shoe.km, unit, 0);
  const months = monthsOf(shoe);
  const runCount = shoe.summary?.runCount ?? 0;
  const longest = shoe.summary?.longestRunKm ?? 0;
  const bestPace = fmtPaceSec(shoe.summary?.bestPaceSec ?? null);
  const period = periodOf(shoe);
  // mostMemorable 은 raw 하이라이트 키 → 라벨링 + 앞 이모지 제거(‘hl 마라톤’ 버그 수정).
  const memorable = highlightLabel(shoe.summary?.mostMemorable).replace(/^[^\uAC00-\uD7A3A-Za-z]+/, '').trim();
  const runner = (typeof userName === 'string' && userName.trim()) || '러너';
  const heroLine = months > 0 ? `${months}개월을 함께 달렸어요` : `${runCount}번의 러닝을 함께했어요`;
  // 기억나는 특징(풀코스 완주 등)이 없어도 뭉클하게 — 묵묵한 동반자도 특별하다.
  const memoryLine = memorable ? `「${memorable}」의 순간과 함께` : '기록보다 오래 남을, 함께한 시간';
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
      {/* 골드 프레임 — 인증서 '문서'의 격(단일 헤어라인, 이중 액자 아님). */}
      <View style={[st.certFrame, {top: insets.top + 14}]} pointerEvents="none" />
      <Pressable style={[st.certX, {left: 22, top: insets.top + 8}]} onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="닫기">
        <Ionicons name="close" size={16} color={G.muted} />
      </Pressable>
      <Pressable style={[st.certX, {right: 22, top: insets.top + 8}]} onPress={onShare} hitSlop={12} accessibilityRole="button" accessibilityLabel="인증서 공유" testID="cert-share">
        <Ionicons name="share-outline" size={15} color={G.gold} />
      </Pressable>

      <ScrollView contentContainerStyle={[st.certContent, {paddingTop: insets.top + 40, paddingBottom: insets.bottom + 36}]} showsVerticalScrollIndicator={false}>
        <View style={st.certBody}>
          {/* 마스트헤드(사용자 확정 2026-07-05): 러너 좌 · 작은 원형 씰(RETIRED/연도) 우.
              세로 로렐 메달은 어색+길어 폐기, 대신 컴팩트 스탬프. */}
          <View style={st.mast}>
            <View style={st.mastL}>
              <Text style={st.mastK}>RUNNER</Text>
              <Text style={st.mastNm}>{runner}</Text>
            </View>
            <View style={st.stamp}>
              <Text style={st.stampT}>RETIRED</Text>
              <Text style={st.stampN}>{yearOf(shoe)}</Text>
            </View>
          </View>

          <Text style={st.coLabel}>은퇴 인증서</Text>

          {/* 신발 정체성 — 기리는 이름 */}
          {!!nm.brand && <Text style={st.coBrand}>{nm.brand}</Text>}
          <Text style={st.coModel}>{nm.model}</Text>

          {/* 감정의 히어로 — 함께한 시간 */}
          <Text style={st.hero}>{heroLine}</Text>
          {!!period && <Text style={st.heroSpan}>{period}</Text>}

          {/* 기록 — 조용한 스탯 3종 */}
          <View style={st.statRow}>
            <View style={st.statCell}>
              <Text style={st.statV}>{d}</Text>
              <Text style={st.statL}>{unit.toUpperCase()}</Text>
            </View>
            <View style={[st.statCell, st.statDiv]}>
              <Text style={st.statV}>{runCount}</Text>
              <Text style={st.statL}>RUNS</Text>
            </View>
            <View style={[st.statCell, st.statDiv]}>
              <Text style={st.statV}>{longest > 0 ? displayNum(longest, unit, 0) : bestPace}</Text>
              <Text style={st.statL}>{longest > 0 ? `최장 ${unit.toUpperCase()}` : '최고 페이스'}</Text>
            </View>
          </View>

          {/* 기억에 남는 순간(없으면 묵묵한 동반자 폴백) */}
          <Text style={st.memory}>{memoryLine}</Text>

          <View style={st.foot}>
            <Text style={st.coWordmark}>keego</Text>
            <Text style={st.footKg}>KEEP GOING</Text>
          </View>
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

      <Text style={st.eLabel}>EMPTY HALL</Text>
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

  head: {alignItems: 'flex-start', gap: 6, paddingTop: 18, paddingBottom: 30},
  title: {fontFamily: SERIF, fontSize: 30, color: G.txt, letterSpacing: -0.3},
  subtitle: {fontSize: 13, fontWeight: '500', color: G.muted},

  legacy: {flexDirection: 'row', borderWidth: 1, borderColor: G.line, borderRadius: 18, backgroundColor: 'rgba(214,180,120,0.04)', paddingVertical: 18, marginBottom: 28},
  lcell: {flex: 1, alignItems: 'center', gap: 5},
  lcellDiv: {borderLeftWidth: 1, borderLeftColor: G.line},
  lval: {fontSize: 24, fontWeight: '800', color: G.txt, letterSpacing: -0.5, fontVariant: ['tabular-nums']},
  llabel: {fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: G.faint},

  sec: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13},
  secT: {fontSize: 13, fontWeight: '800', color: G.txt},
  secC: {fontSize: 11, fontWeight: '700', color: G.gold, letterSpacing: 0.4, fontVariant: ['tabular-nums']},

  featured: {borderRadius: 20, borderWidth: 1, borderColor: G.soft, backgroundColor: G.surface, padding: 22, paddingBottom: 20, marginBottom: 30, overflow: 'hidden'},
  featTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  badge: {flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: G.line, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10},
  badgeDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: G.gold},
  badgeTxt: {fontSize: 9, fontWeight: '800', letterSpacing: 1.4, color: G.gold},
  featYear: {fontFamily: SERIF, fontSize: 13, color: G.muted, fontVariant: ['tabular-nums']},
  featBody: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginTop: 26},
  featName: {flex: 1},
  featBrand: {fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: G.gold},
  featModel: {fontFamily: SERIF, fontSize: 24, fontWeight: '800', color: G.txt, marginTop: 7},
  featQuote: {fontSize: 12, fontWeight: '600', color: G.muted, marginTop: 9},
  featDist: {flexDirection: 'row', alignItems: 'baseline', gap: 4},
  featNum: {fontSize: 46, fontWeight: '800', color: G.gold, letterSpacing: -1.5, fontVariant: ['tabular-nums']},
  featKm: {fontSize: 16, fontWeight: '700', color: G.gold, opacity: 0.72},

  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14},
  plaque: {width: '48%', borderRadius: 16, borderWidth: 1, borderColor: G.line, backgroundColor: '#120f0b', padding: 16, paddingBottom: 15, minHeight: 168, overflow: 'hidden'},
  seal: {width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: G.soft, alignItems: 'center', justifyContent: 'center'},
  sealNo: {fontFamily: SERIF, fontSize: 14, color: G.gold, fontVariant: ['tabular-nums']},
  pbrand: {fontSize: 9, fontWeight: '800', letterSpacing: 1.4, color: G.gold, marginTop: 16},
  pmodel: {fontFamily: SERIF, fontSize: 16, fontWeight: '800', color: G.txt, marginTop: 5, lineHeight: 19},
  pfoot: {marginTop: 'auto', paddingTop: 12, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: G.line},
  pkm: {fontSize: 17, fontWeight: '800', color: G.txt, letterSpacing: -0.3, fontVariant: ['tabular-nums']},
  pkmU: {fontSize: 10, fontWeight: '700', color: G.muted},
  pyear: {fontSize: 11, fontWeight: '600', color: G.faint, fontVariant: ['tabular-nums']},


  // ── 은퇴 인증서(어워드 키프세이크 — 공유하고 싶은 격) ──
  certScreen: {flex: 1, backgroundColor: '#0A0908'},
  certFrame: {position: 'absolute', left: 14, right: 14, bottom: 14, borderWidth: 1, borderColor: G.soft, borderRadius: 22, opacity: 0.7},
  certContent: {paddingHorizontal: 34},
  certX: {position: 'absolute', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', zIndex: 2},
  certBody: {alignItems: 'center'},
  // 타이틀 + 오너먼트
  mast: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', alignSelf: 'stretch'},
  mastL: {gap: 5, paddingTop: 8},
  mastK: {fontSize: 9, fontWeight: '800', letterSpacing: 2, color: G.faint},
  mastNm: {fontFamily: SERIF, fontSize: 22, color: G.txt, letterSpacing: -0.3},
  stamp: {width: 66, height: 66, borderRadius: 33, borderWidth: 1.5, borderColor: G.soft, alignItems: 'center', justifyContent: 'center', transform: [{rotate: '-7deg'}]},
  stampT: {fontSize: 7, fontWeight: '800', letterSpacing: 1.4, color: G.gold, marginBottom: 1},
  stampN: {fontFamily: SERIF, fontSize: 19, color: G.gold, fontVariant: ['tabular-nums']},
  coLabel: {fontFamily: SERIF, fontSize: 15, color: G.muted, letterSpacing: 2, marginTop: 40},
  // 정체성
  coBrand: {fontSize: 11, fontWeight: '800', letterSpacing: 2.4, color: G.gold, marginTop: 28},
  coModel: {fontFamily: SERIF, fontSize: 30, color: G.txt, marginTop: 8, textAlign: 'center', lineHeight: 38},
  // 감정의 히어로
  hero: {fontFamily: SERIF, fontSize: 24, color: G.txt, marginTop: 28, textAlign: 'center', lineHeight: 34, letterSpacing: -0.3},
  heroSpan: {fontSize: 13, fontWeight: '600', color: G.muted, marginTop: 10, letterSpacing: 0.4, fontVariant: ['tabular-nums']},
  // 스탯 3종
  statRow: {flexDirection: 'row', alignSelf: 'stretch', marginTop: 28},
  statCell: {flex: 1, alignItems: 'center', gap: 6},
  statDiv: {borderLeftWidth: 1, borderLeftColor: G.line},
  statV: {fontSize: 26, fontWeight: '700', color: G.txt, letterSpacing: -0.6, fontVariant: ['tabular-nums']},
  statL: {fontSize: 9, fontWeight: '800', letterSpacing: 1.4, color: G.faint},
  // 기억
  memory: {fontFamily: SERIF, fontSize: 16, fontStyle: 'italic', color: G.muted, marginTop: 26, textAlign: 'center'},
  // 푸터
  foot: {alignItems: 'center', marginTop: 28, gap: 7},
  coWordmark: {fontFamily: 'Helvetica Neue', fontSize: 20, fontWeight: '500', color: G.muted, letterSpacing: -0.3},
  footKg: {fontSize: 9, fontWeight: '800', letterSpacing: 3, color: G.gold},
    offscreen: {position: 'absolute', left: -4000, top: 0, opacity: 0},

  // ── 빈 상태 ──
  empty: {alignItems: 'center', paddingTop: 26},
  emptyArt: {width: 250, height: 190, alignItems: 'center', justifyContent: 'center'},
  emblem: {alignItems: 'center', justifyContent: 'center'},
  eLabel: {fontSize: 11, fontWeight: '800', letterSpacing: 3.3, color: G.gold, marginTop: 30},
  eTitle: {fontFamily: SERIF, fontSize: 24, fontWeight: '800', color: G.txt, marginTop: 14},
  eDesc: {fontSize: 14, fontWeight: '500', color: G.muted, lineHeight: 23, marginTop: 14, textAlign: 'center', maxWidth: 286},
  cta: {alignSelf: 'stretch', height: 54, borderRadius: 16, borderWidth: 1, borderColor: G.soft, backgroundColor: 'rgba(214,180,120,0.10)', alignItems: 'center', justifyContent: 'center', marginTop: 38},
  ctaTxt: {fontSize: 15, fontWeight: '700', color: G.gold},
});

export default HallOfShoes;
