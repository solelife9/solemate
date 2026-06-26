// ============================================================================
// RunRecapScreen.rn.tsx — 완주 직후 리캡(축하) 풀스크린 (P0-2)
// 러닝을 마치면 기록 탭으로 바로 점프하던 흐름 대신, 러너가 가장 자랑스러운 순간에
// 거리/시간/페이스 + km 스플릿 막대 + 신기록(PR) 배지를 보여준 뒤 '완료'로 닫는다.
// 순수 프레젠테이션 — App 이 방금 저장한 런 데이터만 주입한다(데이터 생성 0).
// 닫기(onClose)에서 App 이 기록 탭으로 이동한다.
// ============================================================================
import React from 'react';
import {View, Text, ScrollView, Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, CARD, CARD_HI, ACCENT, GOOD, T1, T2, T3, FONT, DISPLAY, RADIUS, SEP, withAlpha} from './theme';
import {fmtPace} from './lib/format';
import {RunSplits, Split} from './RunSplits';
import {PRKind, PR_LABEL} from './lib/records';
import {Unit} from './lib/units';

/** 초 → "h:mm:ss"(1시간↑) 또는 "m:ss". 음수/비유한은 0 처리. */
function fmtDur(s: number): string {
  const t = Number.isFinite(s) ? Math.max(0, Math.round(s)) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function Stat({label, value, sub}: {label: string; value: string; sub?: string}) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statLabel}>{label}{sub ? <Text style={s.statSub}> {sub}</Text> : null}</Text>
    </View>
  );
}

export default function RunRecapScreen({
  km,
  durationS,
  cadence = 0,
  splits = [],
  elevationM = 0,
  calories = 0,
  prKinds = [],
  shoeName,
  goalKm,
  unit = 'km',
  onClose,
}: {
  km: number;
  durationS: number;
  cadence?: number;
  splits?: Split[];
  elevationM?: number;
  calories?: number;
  /** 방금 런이 세운 신기록 종류(있으면 배지로 축하). */
  prKinds?: PRKind[];
  /** 신발 이름(파싱된 모델 라벨 권장). 없으면 신발 줄 숨김. */
  shoeName?: string;
  /** 목표 거리(km). km >= goalKm 이면 '목표 달성' 배지. 없으면 숨김. */
  goalKm?: number;
  unit?: Unit;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const goalHit = !!goalKm && goalKm > 0 && km >= goalKm;
  return (
    <View style={[s.screen, {paddingTop: insets.top}]} testID="run-recap-screen">
      <ScrollView contentContainerStyle={{paddingHorizontal: 18, paddingBottom: insets.bottom + 24, paddingTop: 8}} showsVerticalScrollIndicator={false}>
        {/* 축하 헤더 */}
        <View style={s.celebrate}>
          <View style={s.medal}><Ionicons name="checkmark-done" size={26} color={GOOD} /></View>
          <Text style={s.title}>러닝 완료</Text>
          {shoeName ? <Text style={s.shoe} numberOfLines={1}>{shoeName}</Text> : null}
        </View>

        {/* 거리 히어로 */}
        <View style={s.hero}>
          <Text style={s.heroNum} testID="recap-distance">{(Number.isFinite(km) ? km : 0).toFixed(2)}</Text>
          <Text style={s.heroUnit}>{unit}</Text>
        </View>

        {/* 배지 — 목표 달성 / 신기록 */}
        {(goalHit || prKinds.length > 0) && (
          <View style={s.badges}>
            {goalHit && (
              <View style={[s.badge, {borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.12)}]}>
                <Ionicons name="flag" size={13} color={ACCENT} />
                <Text style={[s.badgeTxt, {color: ACCENT}]}>목표 {goalKm}{unit} 달성</Text>
              </View>
            )}
            {prKinds.map((k) => (
              <View key={k} testID={`recap-pr-${k}`} style={[s.badge, {borderColor: withAlpha(GOOD, 0.4), backgroundColor: withAlpha(GOOD, 0.12)}]}>
                <Ionicons name="trophy" size={13} color={GOOD} />
                <Text style={[s.badgeTxt, {color: GOOD}]}>신기록 · {PR_LABEL[k]}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 핵심 지표 그리드 */}
        <View style={s.grid}>
          <Stat label="시간" value={fmtDur(durationS)} />
          <Stat label="평균 페이스" value={fmtPace(km, durationS)} sub={`/${unit}`} />
          {calories > 0 && <Stat label="칼로리" value={`${Math.round(calories)}`} sub="kcal" />}
          {cadence > 0 && <Stat label="케이던스" value={`${Math.round(cadence)}`} sub="spm" />}
          {elevationM > 0 && <Stat label="누적 상승" value={`${Math.round(elevationM)}`} sub="m" />}
        </View>

        {/* km 스플릿 막대(2구간↑일 때만 자체적으로 표시) */}
        <RunSplits splits={splits} />
      </ScrollView>

      <View style={[s.footer, {paddingBottom: insets.bottom + 10}]}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="완료" testID="recap-done"
          style={({pressed}) => [s.doneBtn, pressed && {opacity: 0.85}]}>
          <Text style={s.doneTxt}>완료</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  celebrate: {alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 6},
  medal: {width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(GOOD, 0.14)},
  title: {color: T1, fontFamily: FONT, fontSize: 22, fontWeight: '800', letterSpacing: -0.4},
  shoe: {color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600'},
  hero: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6, marginTop: 8, marginBottom: 14},
  heroNum: {color: T1, fontFamily: DISPLAY, fontSize: 64, fontWeight: '800', letterSpacing: -2, lineHeight: 68},
  heroUnit: {color: T2, fontFamily: FONT, fontSize: 20, fontWeight: '700', marginBottom: 10},
  badges: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 16},
  badge: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 30, borderRadius: RADIUS.pill, borderWidth: 1},
  badgeTxt: {fontFamily: FONT, fontSize: 13, fontWeight: '700'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, paddingVertical: 6},
  stat: {width: '50%', paddingVertical: 14, paddingHorizontal: 18, alignItems: 'flex-start'},
  statValue: {color: T1, fontFamily: DISPLAY, fontSize: 26, fontWeight: '800', letterSpacing: -0.6},
  statLabel: {color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', marginTop: 3},
  statSub: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500'},
  footer: {paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP, backgroundColor: CARD_HI},
  doneBtn: {height: 52, borderRadius: RADIUS.lg, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center'},
  doneTxt: {color: '#000', fontFamily: FONT, fontSize: 16, fontWeight: '800'},
});
