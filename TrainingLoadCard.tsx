// ============================================================================
// TrainingLoadCard.tsx — 오늘의 훈련 부하 (재노출 2026-07-18, 시안 A 승인)
//
// 07-05 애널리틱스 다이어트에서 걷어냈던 훈련 부하를 두 표면으로 되살린다:
//   · TrainingLoadSignal — 홈 조건부 한 줄. 침묵이 기본 — confident 하고 부하가
//     '늘어남(caution)' 이상일 때만 나타난다(매일 처방하던 옛 실수 반복 금지).
//     탭하면 기록 탭 인사이트로(보기 축은 기록 탭, 홈은 신호만).
//   · TrainingLoadCard — 기록 탭 인사이트 상세. 스윗스팟 게이지(ACWR 위치) +
//     최근 7일 / 평소 주간 평균 분해. 약어(ACWR) 없이 평어만.
//
// 판정·문구는 lib/trainingLoad(assessTrainingLoad)가 단일 소스 — 이 파일은 표시
// 전용이다(assessment 를 주입받는다). 색은 조건색 토큰(GOOD/WARN/DANGER)만 쓴다.
// ============================================================================
import React from 'react';
import { rs, rv } from './lib/responsive';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  CARD_BORDER, GOOD, WARN, DANGER, T1, T2, T3, T4,
  SPACE, RADIUS, TYPE, GLASS, withAlpha,
} from './theme';
import { RISK_DISCLAIMER } from './lib/injuryRisk';
import {
  TrainingLoadAssessment, LoadLevel, LOAD_WORD, loadRatioPhraseKo,
  ACWR_LOW_AT, ACWR_CAUTION_AT, ACWR_HIGH_AT,
} from './lib/trainingLoad';
import { Unit, displayNum } from './lib/units';

const LEVEL_COLOR: Record<LoadLevel, string> = {
  low: T3,        // 가벼움 = 정보성(무채) — 경고가 아니다
  safe: GOOD,
  caution: WARN,
  high: DANGER,
};

// ── 홈 조건부 시그널 ─────────────────────────────────────────────────────────

/** 홈 한 줄 문구 — 카드(LOAD_MSG)보다 짧게. 배율이 서면 숫자로 말한다. */
function signalMsg(load: TrainingLoadAssessment): string {
  const phrase = loadRatioPhraseKo(load); // '평소의 1.8배' 등
  if (load.level === 'high') {
    return phrase.includes('배') ? `최근 운동량이 ${phrase}예요` : '최근 운동량이 급증했어요';
  }
  return '운동량이 평소보다 빠르게 늘고 있어요';
}

export function TrainingLoadSignal({
  load, onPress, style,
}: { load?: TrainingLoadAssessment | null; onPress?: () => void; style?: any }) {
  // 침묵 계약: 표본 부족(미확신)이거나 안정/가벼움이면 홈에 아무것도 띄우지 않는다.
  if (!load || !load.confident) return null;
  if (load.level !== 'caution' && load.level !== 'high') return null;

  const color = LEVEL_COLOR[load.level];
  const msg = signalMsg(load);
  const Host: any = onPress ? Pressable : View;
  return (
    <Host
      style={[s.signal, { backgroundColor: withAlpha(color, 0.1), borderColor: withAlpha(color, 0.35) }, style]}
      testID={`training-load-signal-${load.level}`}
      accessibilityLabel={`훈련 부하 ${LOAD_WORD[load.level]}. ${msg}`}
      {...(onPress
        ? { onPress, accessibilityRole: 'button' as const, accessibilityHint: '기록 탭에서 훈련 부하 자세히 보기' }
        : { accessibilityRole: 'summary' as const })}
    >
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.signalMsg} numberOfLines={1}>{msg}</Text>
      {onPress ? <Text style={s.signalMore}>자세히 ›</Text> : null}
    </Host>
  );
}

// ── 기록 탭 인사이트 카드 ────────────────────────────────────────────────────

// 게이지 눈금 — ACWR 0~GAUGE_MAX 를 가로 100% 에 선형 매핑. 2.0 캡이면 스윗스팟
// (0.8~1.3)이 화면 가운데 40~65% 에 놓여 '내가 어디쯤인지'가 한눈에 읽힌다.
const GAUGE_MAX = 2.0;
const pct = (v: number): `${number}%` => `${Math.min(97, Math.max(2, (v / GAUGE_MAX) * 100))}%`;

export function TrainingLoadCard({
  load, unit = 'km', style,
}: { load?: TrainingLoadAssessment | null; unit?: Unit; style?: any }) {
  // 최근 4주에 런이 하나도 없으면 숨김(빈 게이지 날조 금지 — Truth only).
  if (!load) return null;
  if (load.acuteKm <= 0 && load.chronicKm <= 0) return null;

  const confident = load.confident && load.acwr != null;
  const level = confident ? load.level : null;
  const color = level ? LEVEL_COLOR[level] : T3;
  const word = level ? LOAD_WORD[level] : '기록 쌓는 중';
  const phrase = loadRatioPhraseKo(load);
  const acuteOn = level === 'caution' || level === 'high';

  return (
    <View style={[s.card, style]} testID={`training-load-card-${level ?? 'new'}`} accessibilityRole="summary">
      <View style={s.head}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.title}>훈련 부하 — <Text style={{ color }}>{word}</Text></Text>
        <Text style={s.phrase}>{phrase}</Text>
      </View>

      <Text style={s.msg}>{load.message}</Text>

      {confident && (
        <View style={s.gauge} testID="training-load-gauge">
          <View style={s.bar}>
            <View style={[s.seg, { flex: ACWR_LOW_AT, backgroundColor: withAlpha(T3, 0.35) }]} />
            <View style={[s.seg, { flex: ACWR_CAUTION_AT - ACWR_LOW_AT, backgroundColor: withAlpha(GOOD, 0.75) }]} />
            <View style={[s.seg, { flex: ACWR_HIGH_AT - ACWR_CAUTION_AT, backgroundColor: withAlpha(WARN, 0.75) }]} />
            <View style={[s.seg, { flex: GAUGE_MAX - ACWR_HIGH_AT, backgroundColor: withAlpha(DANGER, 0.8) }]} />
            <View style={[s.pin, { left: pct(load.acwr as number) }]} />
          </View>
          <View style={s.ticks}>
            <Text style={[s.tick, { left: pct(ACWR_LOW_AT) }]}>0.8</Text>
            <Text style={[s.tick, s.tickSweet, { left: pct((ACWR_LOW_AT + ACWR_CAUTION_AT) / 2) }]}>스윗스팟</Text>
            <Text style={[s.tick, { left: pct(ACWR_CAUTION_AT) }]}>1.3</Text>
            <Text style={[s.tick, { left: pct(ACWR_HIGH_AT) }]}>1.5</Text>
          </View>
        </View>
      )}

      <View style={s.split}>
        <View style={[s.chip, acuteOn && { borderColor: withAlpha(WARN, 0.4), backgroundColor: withAlpha(WARN, 0.07) }]}>
          <Text style={s.chipLb}>최근 7일</Text>
          <Text style={s.chipV}>{displayNum(load.acuteKm, unit, 1)}<Text style={s.chipU}>{unit}</Text></Text>
        </View>
        <View style={s.chip}>
          <Text style={s.chipLb}>평소 주간 평균</Text>
          <Text style={s.chipV}>{displayNum(load.chronicKm, unit, 1)}<Text style={s.chipU}>{unit}</Text></Text>
          <Text style={s.chipS}>최근 4주</Text>
        </View>
      </View>

      <Text style={s.disc}>{RISK_DISCLAIMER}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  // 시그널 — InjuryRiskCard signal 과 동일 문법(점 + 한 줄 + 자세히)
  signal: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    borderRadius: RADIUS.md, borderCurve: 'continuous', borderWidth: 1,
    paddingVertical: rv(11), paddingHorizontal: rs(14),
  },
  signalMsg: { ...TYPE.caption, color: T2, flex: 1 },
  signalMore: { ...TYPE.caption, color: T3 },
  dot: { width: rs(9), height: rs(9), borderRadius: rs(5) },

  // 카드 — 기록 탭 형제 카드와 같은 유리 재질
  card: {
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.lg, borderCurve: 'continuous',
    borderWidth: 1, borderColor: CARD_BORDER,
    padding: SPACE.lg, gap: SPACE.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  title: { ...TYPE.label, fontWeight: '700', color: T1, flex: 1 },
  phrase: { ...TYPE.caption, color: T3, fontVariant: ['tabular-nums'] },
  msg: { ...TYPE.caption, color: T2, lineHeight: rv(19) },

  gauge: { marginTop: rv(2), marginBottom: rv(12) },
  bar: { flexDirection: 'row', height: rv(6), borderRadius: rv(3), overflow: 'visible' },
  seg: { height: '100%' },
  pin: {
    position: 'absolute', top: rv(-4), width: rs(3), height: rv(14),
    borderRadius: rs(2), backgroundColor: T1, marginLeft: rs(-1),
  },
  ticks: { height: rv(14), marginTop: rv(6) },
  tick: {
    position: 'absolute', ...TYPE.micro, fontWeight: '600', color: T4,
    fontVariant: ['tabular-nums'], marginLeft: rs(-8),
  },
  tickSweet: { color: withAlpha(GOOD, 0.8), marginLeft: rs(-18) },

  split: { flexDirection: 'row', gap: SPACE.sm },
  chip: {
    flex: 1, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: RADIUS.sm, borderCurve: 'continuous',
    paddingVertical: rv(9), paddingHorizontal: rs(12), gap: rv(2),
  },
  chipLb: { ...TYPE.micro, color: T4 },
  chipV: { ...TYPE.label, fontWeight: '800', color: T1, fontVariant: ['tabular-nums'] },
  chipU: { ...TYPE.micro, color: T3, fontWeight: '600' },
  chipS: { ...TYPE.micro, color: T3, fontWeight: '500', letterSpacing: 0.2 },
  disc: { ...TYPE.micro, fontWeight: '500', color: T4, letterSpacing: 0.2 },
});
