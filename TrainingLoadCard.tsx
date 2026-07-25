// ============================================================================
// TrainingLoadCard.tsx — 오늘의 훈련 부하 (재노출 2026-07-18, 시안 A 승인)
//
// 배치 개편(2026-07-25 민우님 안 A 확정): 훈련 부하의 소비 시점은 '러닝 전' — 홈으로
// 이동한다. 홈 = TrainingLoadCard compact(헤더+게이지 상시, 탭하면 상세 확장),
// 기록 탭 카드·구 조건부 Signal 은 폐지. ACWR 판정·문구는 lib/trainingLoad
// (assessTrainingLoad)가 단일 소스 — 이 파일은 표시 전용. 색은 조건색 토큰만.
// ============================================================================
import React, { useState } from 'react';
import { rs, rv, ri } from './lib/responsive';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Text} from './lib/text';
import {
  CARD_BORDER, GOOD, WARN, DANGER, T1, T2, T3,
  SPACE, RADIUS, TYPE, GLASS, LEADING, withAlpha,
} from './theme';
import { GlassEdge } from './primitives';
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

// (구 TrainingLoadSignal — 홈 조건부 한 줄 — 은 안 A 로 폐지: 컴팩트 카드가 상시
//  담당한다. "평소에 안 보이면 지표를 신뢰/학습할 기회가 없다"는 단점도 함께 해소.)

// ── 훈련 부하 카드(홈 상주) ──────────────────────────────────────────────────

// 게이지 눈금 — ACWR 0~GAUGE_MAX 를 가로 100% 에 선형 매핑. 2.0 캡이면 스윗스팟
// (0.8~1.3)이 화면 가운데 40~65% 에 놓여 '내가 어디쯤인지'가 한눈에 읽힌다.
const GAUGE_MAX = 2.0;
const pct = (v: number): `${number}%` => `${Math.min(97, Math.max(2, (v / GAUGE_MAX) * 100))}%`;

export function TrainingLoadCard({
  load, unit = 'km', style, compact = false,
}: { load?: TrainingLoadAssessment | null; unit?: Unit; style?: any;
  /** 홈 배치용(안 A) — 헤더+게이지만 상시, 탭하면 상세(메시지·주간 분해·면책) 확장. */
  compact?: boolean;
}) {
  // compact 확장 상태 — 훅은 이른 반환보다 위(훅 규칙).
  const [open, setOpen] = useState(false);
  // 최근 4주에 런이 하나도 없으면 숨김(빈 게이지 날조 금지 — Truth only).
  if (!load) return null;
  if (load.acuteKm <= 0 && load.chronicKm <= 0) return null;

  // load.confident 는 acwr != null 을 함의한다(assessTrainingLoad: canACWR 조건).
  const level = load.confident ? load.level : null;
  const color = level ? LEVEL_COLOR[level] : T3;
  const word = level ? LOAD_WORD[level] : '기록 쌓는 중';
  const phrase = loadRatioPhraseKo(load);
  const acuteOn = level === 'caution' || level === 'high';
  const expanded = !compact || open;
  const Host: any = compact ? Pressable : View;

  return (
    <Host
      style={[s.card, style]}
      testID={`training-load-card-${level ?? 'new'}`}
      {...(compact
        ? {onPress: () => setOpen(v => !v), accessibilityRole: 'button' as const,
           accessibilityLabel: `훈련 부하 ${word}. ${load.message}`,
           accessibilityHint: open ? '접기' : '자세히 보기'}
        : {accessibilityRole: 'summary' as const})}>
      {/* 균일 RN 보더 폐지 → 전 화면 카드 공통 코너 페이드 헤어라인(GlassEdge). */}
      <GlassEdge glints={false} radius={RADIUS.lg} />
      <View style={s.head}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.title}>훈련 부하 — <Text style={{ color }}>{word}</Text></Text>
        <Text style={s.phrase}>{phrase}</Text>
        {compact && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={ri(13)} color={T3} />}
      </View>

      {expanded && <Text style={s.msg}>{load.message}</Text>}

      {level && (
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

      {expanded && (
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
      )}

      {expanded && <Text style={s.disc}>{RISK_DISCLAIMER}</Text>}
    </Host>
  );
}

const s = StyleSheet.create({
  dot: { width: rs(9), height: rs(9), borderRadius: rs(5) },

  // 카드 — 기록 탭 형제 카드와 같은 유리 재질(외곽선은 GlassEdge 헤어라인이 소유).
  card: {
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.lg, borderCurve: 'continuous',
    overflow: 'hidden',
    padding: SPACE.lg, gap: SPACE.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  title: { ...TYPE.label, fontWeight: '700', color: T1, flex: 1 },
  phrase: { ...TYPE.caption, color: T3, fontVariant: ['tabular-nums'] },
  // 행간 = LEADING 램프(body — 본문 문단) × 폰트 크기: 세로 rv 스케일 유령값 폐지.
  msg: { ...TYPE.caption, color: T2, lineHeight: Math.round(TYPE.caption.fontSize * LEADING.body) },

  gauge: { marginTop: rv(2), marginBottom: rv(12) },
  bar: { flexDirection: 'row', height: rv(6), borderRadius: rv(3), overflow: 'visible' },
  seg: { height: '100%' },
  pin: {
    position: 'absolute', top: rv(-4), width: rs(3), height: rv(14),
    borderRadius: rs(2), backgroundColor: T1, marginLeft: rs(-1),
  },
  ticks: { height: rv(14), marginTop: rv(6) },
  // 축 라벨 — 게이지 판독용 정보라 T4→T3 승격(T4 는 장식/disabled 전용).
  tick: {
    position: 'absolute', ...TYPE.micro, fontWeight: '600', color: T3,
    fontVariant: ['tabular-nums'], marginLeft: rs(-8),
  },
  tickSweet: { color: withAlpha(GOOD, 0.8), marginLeft: rs(-18) },

  split: { flexDirection: 'row', gap: SPACE.sm },
  chip: {
    flex: 1, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: RADIUS.sm, borderCurve: 'continuous',
    paddingVertical: rv(9), paddingHorizontal: rs(12), gap: rv(2),
  },
  chipLb: { ...TYPE.micro, color: T3 }, // 칩 라벨 — 정보성 T4→T3 승격
  chipV: { ...TYPE.label, fontWeight: '800', color: T1, fontVariant: ['tabular-nums'] },
  chipU: { ...TYPE.micro, color: T3, fontWeight: '600' },
  chipS: { ...TYPE.micro, color: T3, fontWeight: '500', letterSpacing: 0.2 },
  disc: { ...TYPE.micro, fontWeight: '500', color: T3, letterSpacing: 0.2 }, // 면책 — 읽혀야 하는 문구라 T3
});
