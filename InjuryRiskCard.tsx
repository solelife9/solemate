// ============================================================================
// InjuryRiskCard.tsx — 통합 부상위험 "신호등" 카드 (시그니처 #1+#2 프로토타입 UI)
//
// lib/injuryRisk.assessCombinedRisk(신발 마모 × 훈련 부하)를 신호등으로 보여주는
// 드롭인 카드. 홈 히어로 아래에 <InjuryRiskCard runs={runs} shoe={primaryShoe}/>
// 한 줄로 꽂으면 된다. 색만 raw 가 아니라 theme 토큰(GOOD/WARN/DANGER)을 쓴다.
//
// 표시:
//   · 신호등 점 + 등급 라벨(부상위험 낮음/주의/높음)
//   · keep-going 헤드라인(융합 카피)
//   · 분해 칩: ACWR 부하 + 신발 마모% (어느 신호가 위험을 끌어올렸는지 강조)
// ============================================================================
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  CARD, CARD_BORDER, GOOD, WARN, DANGER, T1, T2, T3, T4,
  SPACE, RADIUS, TYPE, withAlpha,
} from './theme';
import {
  assessCombinedRisk, RiskLevel, RiskDriver, RISK_LABEL, RISK_DISCLAIMER,
} from './lib/injuryRisk';
import { LoadRun, LOAD_WORD, loadRatioPhraseKo } from './lib/trainingLoad';

const LEVEL_COLOR: Record<RiskLevel, string> = {
  safe: GOOD,
  caution: WARN,
  high: DANGER,
};

/** UI 레이어 — 로컬 오늘 'YYYY-MM-DD'(lib는 주입받지만 화면은 Date 허용). */
function todayLocalISO(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface InjuryRiskCardProps {
  runs: LoadRun[];
  /** 오늘 신을/주력 신발의 used·max. 없으면 부하만으로 판정. */
  shoe?: { used?: number; max?: number };
  /** 기준일 주입(테스트용). 미지정 시 로컬 오늘. */
  todayISO?: string;
  /** 지정 시 카드 전체가 눌러져 상세(InjuryRiskDetail)를 열 수 있다. */
  onPress?: () => void;
}

function Chip({
  label, value, sub, on,
}: { label: string; value: string; sub?: string; on: boolean }) {
  // on(=이 신호가 위험을 끌어올림)이면 강조 테두리.
  return (
    <View style={[styles.chip, on && styles.chipOn]}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
      {sub ? <Text style={styles.chipSub}>{sub}</Text> : null}
    </View>
  );
}

export default function InjuryRiskCard({ runs, shoe, todayISO, onPress }: InjuryRiskCardProps) {
  const today = todayISO || todayLocalISO();
  const risk = React.useMemo(
    () => assessCombinedRisk({ runs: runs || [], shoe, todayISO: today }),
    [runs, shoe, today],
  );

  const color = LEVEL_COLOR[risk.level];
  const isDriven = (d: RiskDriver) => risk.drivers.includes(d);

  // 분해 칩 값 — 'ACWR'/원시 비율 대신 평어로 노출(사용자는 약자를 모른다).
  const loadWord = LOAD_WORD[risk.load.level];        // 가벼움/안정적/늘어남/급증
  const loadSub = loadRatioPhraseKo(risk.load);       // '평소의 1.4배' 등
  const wearPct = Math.round((risk.shoe.percentUsed || 0) * 100);

  const Container: any = onPress ? Pressable : View;
  const pressProps = onPress
    ? { onPress, accessibilityRole: 'button' as const,
        accessibilityHint: '부상위험 상세와 코칭 보기' }
    : { accessibilityRole: 'summary' as const };

  return (
    <Container
      style={[styles.card, { borderColor: withAlpha(color, 0.35) }]}
      testID={`injury-risk-card-${risk.level}`}
      accessibilityLabel={`${RISK_LABEL[risk.level]}. ${risk.message}`}
      {...pressProps}
    >
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.level, { color }]}>{RISK_LABEL[risk.level]}</Text>
        {onPress ? <Text style={styles.more}>자세히 ›</Text> : null}
      </View>

      <Text style={styles.message}>{risk.message}</Text>

      <View style={styles.chips}>
        <Chip
          label="이번 주 운동량"
          value={loadWord}
          sub={loadSub}
          on={isDriven('load')}
        />
        <Chip
          label="신발 상태"
          value={`${wearPct}% 닳음`}
          on={isDriven('shoe')}
        />
      </View>

      <Text style={styles.disclaimer}>{RISK_DISCLAIMER}</Text>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  level: { ...TYPE.label, color: T1 },
  more: { ...TYPE.caption, color: T3, marginLeft: 'auto' },
  message: { ...TYPE.body, color: T2, lineHeight: 21 },
  chips: { flexDirection: 'row', gap: SPACE.sm },
  chip: {
    flex: 1,
    backgroundColor: withAlpha(T1, 0.04),
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    gap: 2,
  },
  chipOn: { borderColor: withAlpha(WARN, 0.5) },
  chipLabel: { ...TYPE.caption, color: T3 },
  chipValue: { ...TYPE.heading, color: T1 },
  chipSub: { ...TYPE.caption, color: T3 },
  disclaimer: { ...TYPE.caption, color: T4 },
});
