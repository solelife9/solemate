// ============================================================================
// TrainingLoadCard.tsx — 오늘의 훈련 부하 (재노출 2026-07-18, 시안 A 승인)
//
// 배치 개편 2차(2026-07-25 민우님 홈 B안 확정): 훈련 부하는 홈 '이번 주 러닝' 원카드의
// 3열째 셀(상태 워드)로 흡수되고, 셀 탭 시 이 카드가 카드 안 인라인 상세로 펼쳐진다.
// embedded 변형 = 표면(유리 배경·GlassEdge·패딩) 없이 내용만 — 부모 카드 이중 표면 방지.
// 구 compact(자체 헤더 접힘/펼침) 변형은 셀이 그 역할을 대체해 폐지. ACWR 판정·문구는
// lib/trainingLoad(assessTrainingLoad)가 단일 소스 — 이 파일은 표시 전용. 색은 조건색 토큰만.
// ============================================================================
import React from 'react';
import { rs, rv } from './lib/responsive';
import { View, StyleSheet } from 'react-native';
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

// 레벨 → 조건색(홈 부하 셀의 상태 점도 같은 권위를 소비 — 색 이중정의 금지).
export const LEVEL_COLOR: Record<LoadLevel, string> = {
  low: T3,        // 가벼움 = 정보성(무채) — 경고가 아니다
  safe: GOOD,
  caution: WARN,
  high: DANGER,
};

// ── 훈련 부하 카드(상세) ──────────────────────────────────────────────────────

// 게이지 눈금 — ACWR 0~GAUGE_MAX 를 가로 100% 에 선형 매핑. 2.0 캡이면 스윗스팟
// (0.8~1.3)이 화면 가운데 40~65% 에 놓여 '내가 어디쯤인지'가 한눈에 읽힌다.
const GAUGE_MAX = 2.0;
const pct = (v: number): `${number}%` => `${Math.min(97, Math.max(2, (v / GAUGE_MAX) * 100))}%`;

export function TrainingLoadCard({
  load, unit = 'km', style, embedded = false,
}: { load?: TrainingLoadAssessment | null; unit?: Unit; style?: any;
  /** 홈 원카드 인라인 상세용 — 표면(유리 배경·GlassEdge·패딩) 없이 내용만 렌더. */
  embedded?: boolean;
}) {
  // 최근 4주에 런이 하나도 없으면 숨김(빈 게이지 날조 금지 — Truth only).
  if (!load) return null;
  if (load.acuteKm <= 0 && load.chronicKm <= 0) return null;

  // load.confident 는 acwr != null 을 함의한다(assessTrainingLoad: canACWR 조건).
  const level = load.confident ? load.level : null;
  const color = level ? LEVEL_COLOR[level] : T3;
  const word = level ? LOAD_WORD[level] : '기록 쌓는 중';
  const phrase = loadRatioPhraseKo(load);
  const acuteOn = level === 'caution' || level === 'high';

  return (
    <View
      style={[embedded ? s.plain : s.card, style]}
      testID={`training-load-card-${level ?? 'new'}`}
      accessibilityRole="summary">
      {/* embedded 는 부모 카드가 표면을 소유 — 유리 헤어라인 중복 금지. */}
      {!embedded && <GlassEdge glints={false} radius={RADIUS.lg} />}
      {/* 헤더(점 + '훈련 부하 — 주의')는 embedded 에선 생략(간결화 G1, 2026-07-26): 홈 원카드의
          부하 셀이 바로 위에서 같은 점+워드를 이미 보여주고, 그 셀을 눌러 펼친 결과가 같은 줄로
          시작하면 반복으로 읽혔다. 비율 문구(phrase)는 게이지보다 빨리 읽히는 정보라 유지하되,
          헤더가 사라진 embedded 에선 설명 문장 옆에 붙여 자리를 지킨다. 단독 카드는 종전대로. */}
      {embedded ? (
        <Text style={s.phrase}>{phrase}</Text>
      ) : (
        <View style={s.head}>
          <View style={[s.dot, { backgroundColor: color }]} />
          <Text style={s.title}>훈련 부하 — <Text style={{ color }}>{word}</Text></Text>
          <Text style={s.phrase}>{phrase}</Text>
        </View>
      )}

      <Text style={s.msg}>{load.message}</Text>

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
  dot: { width: rs(9), height: rs(9), borderRadius: rs(5) },

  // 카드 — 기록 탭 형제 카드와 같은 유리 재질(외곽선은 GlassEdge 헤어라인이 소유).
  card: {
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.lg, borderCurve: 'continuous',
    overflow: 'hidden',
    padding: SPACE.lg, gap: SPACE.md,
  },
  // embedded — 표면 없음(배경·radius·패딩은 부모 카드 소유), 내용 리듬만 유지.
  plain: { gap: SPACE.md },
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
