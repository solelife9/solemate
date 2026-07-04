// ============================================================================
// HallOfShoes.rn.tsx — 명예의 전당(은퇴한 러닝화의 기록)
// ----------------------------------------------------------------------------
// 2026-07-04 애플 톤 재설계(사용자 지시): 사설 블랙&골드 팔레트·명조 세리프·포일
// 그라데이션·이중 액자 장식을 폐기하고 앱 디자인 시스템(BG/CARD/T1–T4/SEP + FONT/
// DISPLAY, 굵기 상한 700)으로 통일했다. 전당의 '식장' 무드는 theme.HALL_GOLD
// 단일 토큰(전당 전용 예외)과 트래킹 잡은 마이크로 캡스, 넉넉한 여백으로만 낸다 —
// 장식이 아니라 절제가 격을 만든다.
//   · 레거시 요약(총 KM · 은퇴 켤레 · 함께한 러닝)
//   · 최근 헌액 히어로 카드 → 탭하면 은퇴 인증서(전체화면 모달)
//   · 컬렉션 2열 그리드(연도 씰 + 모델 + km)
//   · 빈 상태(스포트라이트 받침대 — '첫 헌액을 기다려요')
// 데이터 날조 0. 테스트 계약(hall-back/hall-empty/hall-plaque-*/모달) 유지.
// ============================================================================
import React, {useMemo, useState} from 'react';
import {View, Text, ScrollView, Pressable, Modal, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, {Defs, LinearGradient, RadialGradient, Stop, Rect, Path, Circle} from 'react-native-svg';
import {Unit, displayNum} from './lib/units';
import {SwipeBack, Button} from './primitives';
import {BG, CARD, CARD_HI, T1, T2, T3, T4, SEP, FONT, DISPLAY, RADIUS, HALL_GOLD, withAlpha} from './theme';
import type {RetiredShoeRecord} from './lib/progression/types';

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
    // 엣지 스와이프 백 — 왼쪽 가장자리 우측 드래그로 복귀(iOS pop 제스처 대응).
    <SwipeBack onBack={onBack}>
    <View style={[st.screen, {paddingTop: insets.top + 8}]}>
      <View style={st.topbar}>
        <Pressable style={st.iconbtn} onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="뒤로" testID="hall-back">
          <Ionicons name="chevron-back" size={18} color={T2} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 20, paddingBottom: insets.bottom + 30}}>
        {/* 라지 타이틀(좌측 정렬) — 애플 내비게이션 문법 */}
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
                <Text style={[st.lval, {color: HALL_GOLD}]}>{displayNum(totalKm, unit, 0)}</Text>
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
                <View style={st.medal}>
                  <Ionicons name="trophy" size={13} color={HALL_GOLD} />
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
                  <Text style={st.featKm}>{unit.toUpperCase()}</Text>
                </View>
              </View>
            </Pressable>

            {/* 전당 컬렉션 */}
            <View style={st.sec}>
              <Text style={st.secT}>컬렉션</Text>
              <Text style={st.secC}>전체 {count}</Text>
            </View>
            <View style={st.grid}>
              {list.map(r => {
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
                      <Text style={st.sealTxt}>{yy ? `’${yy.slice(2)}` : '··'}</Text>
                    </View>
                    {!!nm.brand && <Text style={st.pbrand}>{nm.brand}</Text>}
                    <Text style={st.pmodel} numberOfLines={2}>{nm.model}</Text>
                    <View style={st.pfoot}>
                      <Text style={st.pkm}>
                        {displayNum(r.km, unit, 0)}
                        <Text style={st.pkmU}> {unit}</Text>
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
        {sel && <Certificate shoe={sel} unit={unit} userName={userName} onClose={() => setSel(null)} />}
      </Modal>
    </View>
    </SwipeBack>
  );
}

// ── 은퇴 인증서(전체화면 모달) — 애플 초대장 문법: 한 장의 어두운 카드, 얇은 골드
//    키라인 하나, 큰 숫자(Barlow), 트래킹 잡은 캡스 라벨. 장식 액자·포일 없음. ──────
function Certificate({shoe, unit, userName, onClose}: {shoe: RetiredShoeRecord; unit: Unit; userName?: string; onClose: () => void}) {
  const insets = useSafeAreaInsets();
  const nm = splitName(shoe.name);
  const d = displayNum(shoe.km, unit, 0);
  const months = monthsOf(shoe);
  const memorable = shoe.summary?.mostMemorable;
  const runner = (typeof userName === 'string' && userName.trim()) || '러너';
  return (
    <View style={st.certScreen}>
      <ScrollView contentContainerStyle={[st.certContent, {paddingTop: insets.top + 76, paddingBottom: insets.bottom + 40}]} showsVerticalScrollIndicator={false}>
        {/* RETIRED 씰 — 한 겹의 얇은 링만 */}
        <View style={st.coSeal}>
          <Text style={st.coSealT}>RETIRED</Text>
          <Text style={st.coSealN}>{yearOf(shoe)}</Text>
        </View>

        <Text style={st.coTitle}>은퇴 인증서</Text>
        <Text style={st.coOwner}>{runner}의 러닝화</Text>

        {!!nm.brand && <Text style={st.coBrand}>{nm.brand}</Text>}
        <Text style={st.coModel}>{nm.model}</Text>

        <Text style={st.coNum}>{d}</Text>
        <Text style={st.coUnit}>{unit.toUpperCase()} TOGETHER</Text>
        <Text style={st.coQuote}>{d}{unit}의 여정, 고마웠어.</Text>

        <View style={st.coRule} />

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
      <Pressable style={[st.certX, {top: insets.top + 8}]} onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
        <Ionicons name="close" size={17} color={T2} />
      </Pressable>
    </View>
  );
}

// ── 빈 상태(스포트라이트 받침대) ──────────────────────────────────────────────────
function EmptyHall({onRegister}: {onRegister?: () => void}) {
  return (
    <View style={st.empty} testID="hall-empty">
      {/* 스포트라이트가 비치는 빈 받침대 — '당신의 첫 신발이 여기 선다'는 기대감. */}
      <View style={st.emptyArt}>
        <Svg width={250} height={190} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="40%" rx="56%" ry="56%">
              <Stop offset="0" stopColor={HALL_GOLD} stopOpacity={0.2} />
              <Stop offset="0.5" stopColor={HALL_GOLD} stopOpacity={0.05} />
              <Stop offset="0.76" stopColor={HALL_GOLD} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="beam" x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor={HALL_GOLD} stopOpacity={0.12} />
              <Stop offset="1" stopColor={HALL_GOLD} stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="plinth" x1="0.5" y1="0" x2="0.5" y2="1">
              <Stop offset="0" stopColor={HALL_GOLD} stopOpacity={0.18} />
              <Stop offset="1" stopColor={HALL_GOLD} stopOpacity={0.03} />
            </LinearGradient>
          </Defs>
          <Circle cx="125" cy="78" r="96" fill="url(#halo)" />
          <Path d="M96 0 L154 0 L178 150 L72 150 Z" fill="url(#beam)" />
          <Path d="M72 163 L178 163 L196 190 L54 190 Z" fill="url(#plinth)" />
          <Rect x="80" y="149" width="90" height="14" rx="3" fill="url(#plinth)" />
          <Rect x="80" y="149" width="90" height="2.5" rx="1.2" fill={HALL_GOLD} opacity={0.45} />
        </Svg>
        <View style={st.emblem}>
          <Ionicons name="trophy" size={30} color={HALL_GOLD} />
        </View>
      </View>

      <Text style={st.eTitle}>첫 헌액을 기다려요</Text>
      <Text style={st.eDesc}>신발 한 켤레와 끝까지 달린 뒤 은퇴시키면,{'\n'}그 여정이 이곳에 영원히 새겨져요.</Text>

      {!!onRegister && (
        <Button label="내 신발 보러 가기" variant="ghost" onPress={onRegister} style={st.cta} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  topbar: {height: 40, justifyContent: 'center', paddingHorizontal: 20},
  iconbtn: {width: 36, height: 36, borderRadius: 18, borderCurve: 'continuous', backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},

  head: {paddingTop: 10, paddingBottom: 22, gap: 5},
  title: {fontFamily: FONT, fontSize: 28, fontWeight: '700', color: T1, letterSpacing: -0.5},
  subtitle: {fontFamily: FONT, fontSize: 13, fontWeight: '500', color: T3},

  legacy: {flexDirection: 'row', backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', paddingVertical: 18, marginBottom: 28},
  lcell: {flex: 1, alignItems: 'center', gap: 5},
  lcellDiv: {borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP},
  lval: {fontFamily: DISPLAY, fontSize: 23, fontWeight: '700', color: T1, letterSpacing: -0.4, fontVariant: ['tabular-nums']},
  llabel: {fontFamily: FONT, fontSize: 11, fontWeight: '500', color: T3},

  sec: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12},
  secT: {fontFamily: FONT, fontSize: 13, fontWeight: '700', color: T3, letterSpacing: 0.4},
  secC: {fontFamily: DISPLAY, fontSize: 12, fontWeight: '600', color: T4, fontVariant: ['tabular-nums']},

  featured: {backgroundColor: CARD, borderRadius: RADIUS.xl, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(HALL_GOLD, 0.35), padding: 20, marginBottom: 28},
  featTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  medal: {width: 30, height: 30, borderRadius: 15, borderCurve: 'continuous', backgroundColor: withAlpha(HALL_GOLD, 0.12), alignItems: 'center', justifyContent: 'center'},
  featYear: {fontFamily: DISPLAY, fontSize: 12, fontWeight: '500', color: T3, fontVariant: ['tabular-nums']},
  featBody: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginTop: 22},
  featName: {flex: 1},
  featBrand: {fontFamily: DISPLAY, fontSize: 11, fontWeight: '600', letterSpacing: 1.6, color: HALL_GOLD, textTransform: 'uppercase'},
  featModel: {fontFamily: FONT, fontSize: 23, fontWeight: '700', color: T1, letterSpacing: -0.4, marginTop: 6},
  featQuote: {fontFamily: FONT, fontSize: 12, fontWeight: '500', color: T3, marginTop: 8},
  featDist: {flexDirection: 'row', alignItems: 'baseline', gap: 5},
  featNum: {fontFamily: DISPLAY, fontSize: 42, fontWeight: '700', color: HALL_GOLD, letterSpacing: -1.5, fontVariant: ['tabular-nums']},
  featKm: {fontFamily: DISPLAY, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, color: T3},

  grid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12},
  plaque: {width: '48.4%', backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', padding: 16, paddingBottom: 14, minHeight: 158},
  seal: {width: 28, height: 28, borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: withAlpha(HALL_GOLD, 0.4), alignItems: 'center', justifyContent: 'center'},
  sealTxt: {fontFamily: DISPLAY, fontSize: 10, fontWeight: '600', color: HALL_GOLD},
  pbrand: {fontFamily: DISPLAY, fontSize: 9, fontWeight: '600', letterSpacing: 1.3, color: HALL_GOLD, marginTop: 14, textTransform: 'uppercase'},
  pmodel: {fontFamily: FONT, fontSize: 15, fontWeight: '700', color: T1, marginTop: 4, lineHeight: 19},
  pfoot: {marginTop: 'auto', paddingTop: 12, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  pkm: {fontFamily: DISPLAY, fontSize: 16, fontWeight: '700', color: T1, letterSpacing: -0.3, fontVariant: ['tabular-nums']},
  pkmU: {fontFamily: FONT, fontSize: 10, fontWeight: '500', color: T3},
  pyear: {fontFamily: DISPLAY, fontSize: 11, fontWeight: '500', color: T4, fontVariant: ['tabular-nums']},

  endmark: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 28},
  endLine: {width: 22, height: StyleSheet.hairlineWidth, backgroundColor: withAlpha(HALL_GOLD, 0.4)},
  endTxt: {fontFamily: DISPLAY, fontSize: 10, fontWeight: '600', letterSpacing: 3, color: withAlpha(HALL_GOLD, 0.8)},

  // 인증서
  certScreen: {flex: 1, backgroundColor: BG},
  certContent: {alignItems: 'center', paddingHorizontal: 28},
  certX: {position: 'absolute', right: 20, width: 34, height: 34, borderRadius: 17, borderCurve: 'continuous', backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},
  coSeal: {width: 64, height: 64, borderRadius: 32, borderCurve: 'continuous', borderWidth: 1, borderColor: withAlpha(HALL_GOLD, 0.45), alignItems: 'center', justifyContent: 'center', gap: 1},
  coSealT: {fontFamily: DISPLAY, fontSize: 7, fontWeight: '600', letterSpacing: 1.4, color: HALL_GOLD},
  coSealN: {fontFamily: DISPLAY, fontSize: 15, fontWeight: '700', color: HALL_GOLD, fontVariant: ['tabular-nums']},
  coTitle: {fontFamily: FONT, fontSize: 22, fontWeight: '700', color: T1, marginTop: 24, letterSpacing: -0.3},
  coOwner: {fontFamily: FONT, fontSize: 13, fontWeight: '500', color: T3, marginTop: 6},
  coBrand: {fontFamily: DISPLAY, fontSize: 12, fontWeight: '600', letterSpacing: 2, color: HALL_GOLD, marginTop: 34, textTransform: 'uppercase'},
  coModel: {fontFamily: FONT, fontSize: 28, fontWeight: '700', color: T1, marginTop: 6, textAlign: 'center', letterSpacing: -0.5},
  coNum: {fontFamily: DISPLAY, fontSize: 76, fontWeight: '700', color: HALL_GOLD, letterSpacing: -2.5, marginTop: 16, fontVariant: ['tabular-nums']},
  coUnit: {fontFamily: DISPLAY, fontSize: 11, fontWeight: '600', letterSpacing: 3, color: T2, marginTop: 6},
  coQuote: {fontFamily: FONT, fontSize: 15, fontWeight: '500', color: T2, marginTop: 18, textAlign: 'center'},
  coRule: {alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: withAlpha(HALL_GOLD, 0.35), marginTop: 28},
  coMeta: {flexDirection: 'row', alignSelf: 'stretch', marginTop: 24},
  coCell: {flex: 1, gap: 5, paddingHorizontal: 8, alignItems: 'center'},
  coCellDiv: {borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP},
  coK: {fontFamily: DISPLAY, fontSize: 9, fontWeight: '600', letterSpacing: 1.2, color: T4},
  coV: {fontFamily: FONT, fontSize: 13, fontWeight: '600', color: T1, textAlign: 'center', lineHeight: 18},
  coS: {fontFamily: DISPLAY, fontSize: 11, fontWeight: '500', color: T3, fontVariant: ['tabular-nums']},
  coFoot: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 44},
  coFootLine: {width: 22, height: StyleSheet.hairlineWidth, backgroundColor: withAlpha(HALL_GOLD, 0.4)},
  coFootKg: {fontFamily: DISPLAY, fontSize: 10, fontWeight: '600', letterSpacing: 2.8, color: HALL_GOLD},

  // 빈 상태
  empty: {alignItems: 'center', paddingTop: 26},
  emptyArt: {width: 250, height: 190, alignItems: 'center'},
  emblem: {width: 66, height: 66, borderRadius: 33, borderCurve: 'continuous', borderWidth: 1, borderColor: withAlpha(HALL_GOLD, 0.4), backgroundColor: withAlpha(HALL_GOLD, 0.08), alignItems: 'center', justifyContent: 'center', marginTop: 45},
  eTitle: {fontFamily: FONT, fontSize: 22, fontWeight: '700', color: T1, marginTop: 34, letterSpacing: -0.3},
  eDesc: {fontFamily: FONT, fontSize: 14, fontWeight: '500', color: T3, lineHeight: 22, marginTop: 12, textAlign: 'center', maxWidth: 286},
  cta: {alignSelf: 'stretch', marginTop: 36},
});

export default HallOfShoes;
