// ============================================================================
// HallOfShoes.rn.tsx — 명예의 전당(은퇴한 신발 박물관) · 블랙&골드
// ----------------------------------------------------------------------------
// design-reference/halloffame-collection · halloffame-empty · halloffame-certificate
// 를 그대로 구현. 은퇴시킨 신발(RetiredShoeRecord)이 영구 전시되는 골드 전당:
//   · 레거시 요약(총 KM · 은퇴 켤레 · 함께한 러닝)
//   · 최근 헌액(LATEST INDUCTEE) 피처 카드
//   · 전당 컬렉션 2열 명패 그리드 → 탭하면 골드 은퇴 인증서(전체화면 모달)
//   · 빈 상태(받침대 일러스트 + EMPTY HALL + 내 신발 보러 가기)
// 큰 숫자는 FoilText(골드 포일 그라데이션, react-native-svg). 데이터 날조 0.
// ============================================================================
import React, {useId, useMemo, useState} from 'react';
import {View, Text, ScrollView, Pressable, Modal, StyleSheet, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, {Defs, LinearGradient, RadialGradient, Stop, Rect, Path, Circle, Text as SvgText} from 'react-native-svg';
import {Unit, displayNum} from './lib/units';
import type {RetiredShoeRecord} from './lib/progression/types';

// ── 골드 토큰(전당 전용 — 앱 일반 팔레트와 별개) ─────────────────────────────────
const G = {
  bg: '#0A0908',
  surface: '#121110',
  surface2: '#120f0b',
  txt: '#F3EEE3',
  muted: 'rgba(243,238,227,0.52)',
  faint: 'rgba(243,238,227,0.34)',
  gold: '#D6B478',
  soft: 'rgba(214,180,120,0.46)',
  line: 'rgba(214,180,120,0.20)',
};
// 나눔명조(번들 — assets/fonts + Info.plist UIAppFonts). 제목·모델명 등 대부분은 ExtraBold,
// 기간·부제 같은 가벼운 텍스트만 Regular(SERIF_REG).
const SERIF = 'NanumMyeongjoExtraBold';
const SERIF_REG = 'NanumMyeongjo';
const FOIL = [
  {o: '0', c: '#F6E2A6'},
  {o: '0.38', c: '#D0A557'},
  {o: '0.64', c: '#9C7330'},
  {o: '1', c: '#EFD590'},
];

export interface HallOfShoesProps {
  records?: readonly RetiredShoeRecord[];
  unit?: Unit;
  onBack?: () => void;
  /** 인증서 RUNNER 이름. */
  userName?: string;
  /** 빈 상태 CTA(내 신발 보러 가기). 없으면 onBack 으로 폴백. */
  onGoShoes?: () => void;
  /** 호환용(미사용 — 탭하면 내부 인증서 모달). */
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
// ISO(YYYY-MM-DD) → 'YYYY.MM'
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

// ── 포일 그라데이션 텍스트(큰 숫자) ───────────────────────────────────────────────
function FoilText({text, size, width, weight = '800', ls = 0}: {text: string; size: number; width: number; weight?: string; ls?: number}) {
  const uid = useId();
  const h = size * 1.18;
  return (
    <Svg width={width} height={h}>
      <Defs>
        <LinearGradient id={uid} x1="0" y1="0" x2="1" y2="0.4">
          {FOIL.map((st, i) => (
            <Stop key={i} offset={st.o} stopColor={st.c} />
          ))}
        </LinearGradient>
      </Defs>
      <SvgText x={width / 2} y={size} fontSize={size} fontWeight={weight as never} textAnchor="middle" fill={`url(#${uid})`} letterSpacing={ls}>
        {text}
      </SvgText>
    </Svg>
  );
}

function Ornament() {
  return (
    <View style={st.orn}>
      <View style={st.ornLine} />
      <View style={st.ornDot} />
      <View style={st.ornLine} />
    </View>
  );
}

function HallOfShoes({records = [], unit = 'km', onBack, userName, onGoShoes}: HallOfShoesProps) {
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
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
    <View style={[st.screen, {paddingTop: insets.top + 8}]}>
      <View style={st.topbar}>
        <Pressable style={st.iconbtn} onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="뒤로" testID="hall-back">
          <Ionicons name="chevron-back" size={17} color={G.gold} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 22, paddingBottom: insets.bottom + 30}}>
        <View style={st.head}>
          <Text style={st.title}>명예의 전당</Text>
          <Ornament />
        </View>

        {count === 0 ? (
          <EmptyHall onRegister={onGoShoes ?? onBack} />
        ) : (
          <>
            {/* 레거시 요약 */}
            <View style={st.legacy}>
              <View style={st.lcell}>
                <Text style={[st.lval, {color: G.gold}]}>{displayNum(totalKm, unit, 0)}</Text>
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
            <Pressable style={st.featured} onPress={() => setSel(latest)} accessibilityRole="button" accessibilityLabel={`${latest.name} 인증서`}>
              <View style={st.featFrame} pointerEvents="none" />
              <View style={st.featTop}>
                <View style={st.badge}>
                  <View style={st.badgeDot} />
                  <Text style={st.badgeTxt}>LATEST INDUCTEE</Text>
                </View>
                <Text style={st.featYear}>{periodOf(latest)}</Text>
              </View>
              <View style={st.featBody}>
                <View style={st.featName}>
                  <Text style={st.featBrand}>{splitName(latest.name).brand}</Text>
                  <Text style={st.featModel}>{splitName(latest.name).model}</Text>
                  <Text style={st.featQuote}>{kmInt(latest.km)}{unit}의 여정, 고마웠어.</Text>
                </View>
                <View style={st.featDist}>
                  <FoilText text={String(displayNum(latest.km, unit, 0))} size={44} width={String(displayNum(latest.km, unit, 0)).length * 27} ls={-2} />
                  <Text style={st.featKm}>{unit.toUpperCase()}</Text>
                </View>
              </View>
            </Pressable>

            {/* 전당 컬렉션 */}
            <View style={st.sec}>
              <Text style={st.secT}>전당 컬렉션</Text>
              <Text style={st.secC}>전체 {count}</Text>
            </View>
            <View style={st.grid}>
              {list.map(r => {
                const nm = splitName(r.name);
                const yy = yearOf(r);
                return (
                  <Pressable key={r.shoeId} style={st.plaque} onPress={() => setSel(r)} accessibilityRole="button" accessibilityLabel={`${r.name} 인증서`} testID={`hall-plaque-${r.shoeId}`}>
                    <View style={st.plaqueFrame} pointerEvents="none" />
                    <View style={st.seal}>
                      <Text style={st.sealTxt}>{yy ? yy.slice(2) : '··'}</Text>
                    </View>
                    <Text style={st.pbrand}>{nm.brand}</Text>
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

            <View style={st.endmark}>
              <View style={st.endLine} />
              <Text style={st.endTxt}>KEEP GOING</Text>
              <View style={st.endLine} />
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!sel} animationType="fade" transparent onRequestClose={() => setSel(null)}>
        {sel && <Certificate shoe={sel} unit={unit} userName={userName} width={width} onClose={() => setSel(null)} />}
      </Modal>
    </View>
  );
}

// ── 은퇴 인증서(전체화면 모달) ────────────────────────────────────────────────────
function Certificate({shoe, unit, userName, width, onClose}: {shoe: RetiredShoeRecord; unit: Unit; userName?: string; width: number; onClose: () => void}) {
  const insets = useSafeAreaInsets();
  const nm = splitName(shoe.name);
  const d = displayNum(shoe.km, unit, 0);
  const months = monthsOf(shoe);
  const memorable = shoe.summary?.mostMemorable;
  const runner = (typeof userName === 'string' && userName.trim()) || '러너';
  return (
    <ScrollView style={st.certScreen} contentContainerStyle={[st.certContent, {paddingTop: insets.top + 74, paddingBottom: insets.bottom + 40}]} showsVerticalScrollIndicator={false}>
      <View style={[st.certFrame, {top: insets.top + 6}]} pointerEvents="none" />
      <Pressable style={[st.certX, {top: insets.top + 6}]} onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
        <Ionicons name="close" size={16} color={G.gold} />
      </Pressable>
      <Pressable style={[st.certShareTop, {top: insets.top + 6}]} onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="인증서 공유">
        <Ionicons name="share-outline" size={15} color={G.gold} />
      </Pressable>
      {/* RETIRED 씰 — 좌상단 모서리(인증서 도장 느낌). ✕ 는 우상단. */}
      <View style={[st.coSeal, st.coSealCorner, {top: insets.top + 12}]} pointerEvents="none">
        <View style={st.coSealInner} pointerEvents="none" />
        <Text style={st.coSealT}>RETIRED</Text>
        <Text style={st.coSealN}>{yearOf(shoe)}</Text>
        <Text style={st.coSealB}>KEEGO</Text>
      </View>

      <Text style={st.coTitle}>은퇴 인증서</Text>
      <Text style={st.coOwner}>{runner}의 러닝화</Text>
      {!!nm.brand && <Text style={st.coBrand}>{nm.brand}</Text>}
      <Text style={st.coModel}>{nm.model}</Text>
      <View style={{marginTop: 18}}>
        <FoilText text={String(d)} size={74} width={width - 56} ls={-3} />
      </View>
      <Text style={st.coUnit}>{unit.toUpperCase()} TOGETHER</Text>
      <Text style={st.coQuote}>{d}{unit}의 여정, 고마웠어.</Text>

      <View style={st.coMeta}>
        <View style={st.coCell}>
          <Text style={st.coK}>MOST MEMORABLE</Text>
          <Text style={st.coV}>{memorable || '함께한 모든 순간'}</Text>
          <Text style={st.coS}>{ym(shoe.summary?.firstRunDate)}</Text>
        </View>
        <View style={[st.coCell, st.coCellDiv]}>
          <Text style={st.coK}>TIME TOGETHER</Text>
          <Text style={st.coV}>{months > 0 ? `${months}개월` : `${shoe.summary?.runCount ?? 0}회`}</Text>
          <Text style={st.coS}>{periodOf(shoe)}</Text>
        </View>
      </View>

      <View style={st.coFoot}>
        <View style={st.coFootLine} />
        <Text style={st.coFootKg}>KEEGO</Text>
        <View style={st.coFootLine} />
      </View>
    </ScrollView>
  );
}

// ── 빈 상태(받침대 일러스트) ──────────────────────────────────────────────────────
function EmptyHall({onRegister}: {onRegister?: () => void}) {
  return (
    <View style={st.empty} testID="hall-empty">
      <Svg width={210} height={168}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="44%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#D6B478" stopOpacity={0.2} />
            <Stop offset="0.45" stopColor="#D6B478" stopOpacity={0.05} />
            <Stop offset="0.7" stopColor="#D6B478" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="105" cy="74" r="78" fill="url(#halo)" />
        <Path d="M44 116 L166 116 L189 168 L21 168 Z" fill="rgba(214,180,120,0.06)" stroke={G.soft} strokeWidth={1} />
        <Circle cx="105" cy="74" r="48" fill="none" stroke={G.soft} strokeWidth={1.5} strokeDasharray="5 6" />
        <Rect x="101" y="70" width="8" height="8" rx="1" fill={G.gold} opacity={0.7} transform="rotate(45 105 74)" />
      </Svg>

      <Text style={st.eLabel}>EMPTY HALL</Text>
      <Text style={st.eTitle}>아직 헌액된 신발이 없어요</Text>
      <Text style={st.eDesc}>신발 한 켤레와 끝까지 달린 뒤 은퇴시키면,{'\n'}그 여정이 이곳 명예의 전당에 영구히 새겨져요.</Text>

      <View style={st.ghosts}>
        {[0, 1, 2].map(i => (
          <View key={i} style={st.ghost}>
            <View style={st.ghostRing} />
            <View style={st.ghostBar} />
          </View>
        ))}
      </View>

      {!!onRegister && (
        <View style={st.cta}>
          <Pressable style={st.ctaBtn} onPress={onRegister} accessibilityRole="button" accessibilityLabel="내 신발 보러 가기">
            <Text style={st.ctaBtnTxt}>내 신발 보러 가기</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: {flex: 1, backgroundColor: G.bg},
  topbar: {height: 40, justifyContent: 'center', paddingHorizontal: 22},
  iconbtn: {width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: G.line, alignItems: 'center', justifyContent: 'center'},

  head: {alignItems: 'center', gap: 14, paddingTop: 14, paddingBottom: 22},
  title: {fontFamily: SERIF, fontSize: 25, fontWeight: '800', color: G.txt, letterSpacing: -0.3},
  orn: {flexDirection: 'row', alignItems: 'center', gap: 10, width: 150},
  ornLine: {flex: 1, height: 1, backgroundColor: G.soft, opacity: 0.55},
  ornDot: {width: 5, height: 5, backgroundColor: G.gold, transform: [{rotate: '45deg'}]},

  legacy: {flexDirection: 'row', borderWidth: 1, borderColor: G.line, borderRadius: 18, backgroundColor: 'rgba(214,180,120,0.04)', paddingVertical: 18, marginBottom: 28},
  lcell: {flex: 1, alignItems: 'center', gap: 5},
  lcellDiv: {borderLeftWidth: 1, borderLeftColor: G.line},
  lval: {fontSize: 24, fontWeight: '800', color: G.txt, letterSpacing: -0.5, fontVariant: ['tabular-nums']},
  llabel: {fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2, color: G.faint},

  sec: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13},
  secT: {fontSize: 13, fontWeight: '800', color: G.txt},
  secC: {fontSize: 11, fontWeight: '700', color: G.gold, letterSpacing: 0.4},

  featured: {borderRadius: 20, borderWidth: 1, borderColor: G.soft, backgroundColor: G.surface, padding: 22, paddingBottom: 20, marginBottom: 30, overflow: 'hidden'},
  featFrame: {position: 'absolute', top: 7, left: 7, right: 7, bottom: 7, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(214,180,120,0.16)'},
  featTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  badge: {flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: G.line, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10},
  badgeDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: G.gold},
  badgeTxt: {fontSize: 9, fontWeight: '800', letterSpacing: 1.4, color: G.gold},
  featYear: {fontFamily: SERIF_REG, fontSize: 13, color: G.muted},
  featBody: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginTop: 26},
  featName: {flex: 1},
  featBrand: {fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8, color: G.gold, textTransform: 'uppercase'},
  featModel: {fontFamily: SERIF, fontSize: 24, fontWeight: '800', color: G.txt, marginTop: 7},
  featQuote: {fontSize: 12, fontWeight: '600', color: G.muted, marginTop: 9},
  featDist: {flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14},
  featKm: {fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: G.txt, marginLeft: 6, marginBottom: 5},

  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14},
  plaque: {width: '48%', borderRadius: 16, borderWidth: 1, borderColor: G.line, backgroundColor: G.surface2, padding: 16, paddingBottom: 15, minHeight: 168, overflow: 'hidden'},
  plaqueFrame: {position: 'absolute', top: 6, left: 6, right: 6, bottom: 6, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(214,180,120,0.12)'},
  seal: {width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: G.soft, alignItems: 'center', justifyContent: 'center'},
  sealTxt: {fontFamily: SERIF, fontSize: 9, fontWeight: '800', color: G.gold},
  pbrand: {fontSize: 9, fontWeight: '800', letterSpacing: 1.4, color: G.gold, marginTop: 16, textTransform: 'uppercase'},
  pmodel: {fontFamily: SERIF, fontSize: 16, fontWeight: '800', color: G.txt, marginTop: 5, lineHeight: 18},
  pfoot: {marginTop: 'auto', paddingTop: 12, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: G.line},
  pkm: {fontSize: 17, fontWeight: '800', color: G.txt, letterSpacing: -0.3, fontVariant: ['tabular-nums']},
  pkmU: {fontSize: 10, fontWeight: '700', color: G.muted},
  pyear: {fontSize: 11, fontWeight: '600', color: G.faint, fontVariant: ['tabular-nums']},

  endmark: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 26},
  endLine: {width: 24, height: 1, backgroundColor: G.line},
  endTxt: {fontSize: 9.5, fontWeight: '800', letterSpacing: 3, color: G.gold},

  // 인증서
  certScreen: {flex: 1, backgroundColor: '#08070A'},
  certContent: {alignItems: 'center', paddingHorizontal: 28},
  certFrame: {position: 'absolute', left: 16, right: 16, bottom: 16, borderRadius: 18, borderWidth: 1, borderColor: G.soft},
  certX: {position: 'absolute', right: 24, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: G.line, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', zIndex: 2},
  certShareTop: {position: 'absolute', right: 66, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: G.line, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', zIndex: 2},
  coTitle: {fontFamily: SERIF, fontSize: 28, fontWeight: '800', color: G.gold, marginTop: 10, letterSpacing: 1},
  coOwner: {fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: G.txt, marginTop: 8},
  coOver: {fontSize: 9, fontWeight: '800', letterSpacing: 2.2, color: G.faint, marginTop: 30},
  coBrand: {fontSize: 13, fontWeight: '800', letterSpacing: 2.2, color: G.gold, marginTop: 30, textTransform: 'uppercase'},
  coModel: {fontFamily: SERIF, fontSize: 32, fontWeight: '800', color: G.txt, marginTop: 8, textAlign: 'center'},
  coUnit: {fontSize: 11, fontWeight: '800', letterSpacing: 3.4, color: G.txt, marginTop: 12},
  coQuote: {fontFamily: SERIF_REG, fontSize: 16, fontWeight: '700', color: G.txt, marginTop: 20, textAlign: 'center'},
  coMeta: {flexDirection: 'row', alignSelf: 'stretch', marginTop: 28},
  coCell: {flex: 1, gap: 5, paddingHorizontal: 8, alignItems: 'center'},
  coCellDiv: {borderLeftWidth: 1, borderLeftColor: G.line},
  coK: {fontSize: 8.5, fontWeight: '800', letterSpacing: 1.2, color: G.faint},
  coV: {fontSize: 13, fontWeight: '700', color: G.txt, textAlign: 'center', lineHeight: 18},
  coS: {fontSize: 11, fontWeight: '600', color: G.muted},
  coRule: {alignSelf: 'stretch', height: 1, backgroundColor: G.line, marginTop: 26},
  coAttest: {alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 22},
  coSeal: {width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: G.soft, alignItems: 'center', justifyContent: 'center'},
  coSealCorner: {position: 'absolute', left: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.25)', zIndex: 2},
  coSealInner: {position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 31, borderWidth: 1, borderColor: 'rgba(214,180,120,0.26)'},
  coSealT: {fontSize: 7, fontWeight: '800', letterSpacing: 1.3, color: G.gold},
  coSealN: {fontFamily: SERIF, fontSize: 16, fontWeight: '800', color: G.gold, lineHeight: 18},
  coSealB: {fontSize: 6.5, fontWeight: '800', letterSpacing: 1, color: G.faint},
  coSign: {alignItems: 'flex-end'},
  coSignK: {fontSize: 8.5, fontWeight: '800', letterSpacing: 1.4, color: G.faint},
  coSignNm: {fontFamily: SERIF, fontSize: 19, fontWeight: '800', color: G.txt, marginTop: 5},
  coShare: {marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: G.soft, backgroundColor: 'rgba(214,180,120,0.04)'},
  coShareTxt: {fontSize: 12, fontWeight: '800', letterSpacing: 0.4, color: G.gold},
  coFoot: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 44},
  coFootLine: {width: 22, height: 1, backgroundColor: G.soft},
  coFootKg: {fontSize: 10, fontWeight: '800', letterSpacing: 2.8, color: G.gold},

  // 빈 상태
  empty: {alignItems: 'center', paddingTop: 26},
  eLabel: {fontSize: 11, fontWeight: '800', letterSpacing: 3.3, color: G.gold, marginTop: 30},
  eTitle: {fontFamily: SERIF, fontSize: 24, fontWeight: '800', color: G.txt, marginTop: 14},
  eDesc: {fontSize: 13.5, fontWeight: '500', color: G.muted, lineHeight: 23, marginTop: 14, textAlign: 'center', maxWidth: 286},
  ghosts: {flexDirection: 'row', gap: 12, marginTop: 34},
  ghost: {width: 64, height: 76, borderRadius: 12, borderWidth: 1, borderColor: G.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8},
  ghostRing: {width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: G.soft, borderStyle: 'dashed'},
  ghostBar: {width: 26, height: 4, borderRadius: 2, backgroundColor: G.line},
  cta: {alignSelf: 'stretch', alignItems: 'center', gap: 14, marginTop: 38},
  ctaBtn: {alignSelf: 'stretch', height: 54, borderRadius: 16, borderWidth: 1, borderColor: G.soft, backgroundColor: 'rgba(214,180,120,0.10)', alignItems: 'center', justifyContent: 'center'},
  ctaBtnTxt: {fontSize: 15, fontWeight: '700', color: G.gold},
});

export default HallOfShoes;
