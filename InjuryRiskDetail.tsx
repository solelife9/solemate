// ============================================================================
// InjuryRiskDetail.tsx — 부상위험 "자세히" 상세 (시그니처 #1+#2 완성 슬라이스 UI)
//
// InjuryRiskCard 를 탭하면 열리는 상세. 신호등 헤드라인 + 두 신호(신발/운동량) 분해 +
// buildInjuryGuidance 의 구체 코칭 카드들을 보여준다. 약자·원시 숫자 없이 평어만.
// 시트/스크린 어디에 얹어도 되도록 순수 프레젠테이션(상태/네비게이션 0).
// ============================================================================
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  CARD, CARD_HI, CARD_BORDER, GOOD, WARN, DANGER, T1, T2, T3,
  SPACE, RADIUS, TYPE, withAlpha,
} from './theme';
import { assessCombinedRisk, RiskLevel } from './lib/injuryRisk';
import { LoadRun, LOAD_WORD, loadRatioPhraseKo } from './lib/trainingLoad';
import { buildInjuryGuidance, GuidanceTone } from './lib/injuryGuidance';

const LEVEL_COLOR: Record<RiskLevel, string> = { safe: GOOD, caution: WARN, high: DANGER };
const LEVEL_LABEL: Record<RiskLevel, string> = {
  safe: '부상위험 낮음',
  caution: '부상위험 주의',
  high: '부상위험 높음',
};
const TONE_COLOR: Record<GuidanceTone, string> = { good: GOOD, caution: WARN, high: DANGER };

function todayLocalISO(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface InjuryRiskDetailProps {
  runs: LoadRun[];
  shoe?: { used?: number; max?: number };
  todayISO?: string;
}

function SignalRow({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <View style={styles.signalRow}>
      <View style={[styles.signalDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.signalLabel}>{label}</Text>
        {sub ? <Text style={styles.signalSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.signalValue}>{value}</Text>
    </View>
  );
}

function GuidanceCard({ tone, icon, title, body }: {
  tone: GuidanceTone; icon: string; title: string; body: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <View style={[styles.guide, { borderColor: withAlpha(color, 0.3) }]}>
      <View style={[styles.guideIcon, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.guideTitle}>{title}</Text>
        <Text style={styles.guideBody}>{body}</Text>
      </View>
    </View>
  );
}

export default function InjuryRiskDetail({ runs, shoe, todayISO }: InjuryRiskDetailProps) {
  const today = todayISO || todayLocalISO();
  const { risk, guidance } = React.useMemo(() => {
    const r = assessCombinedRisk({ runs: runs || [], shoe, todayISO: today });
    return { risk: r, guidance: buildInjuryGuidance(r) };
  }, [runs, shoe, today]);

  const color = LEVEL_COLOR[risk.level];
  const wearPct = Math.round((risk.shoe.percentUsed || 0) * 100);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      testID={`injury-risk-detail-${risk.level}`}
    >
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.level, { color }]}>{LEVEL_LABEL[risk.level]}</Text>
      </View>
      <Text style={styles.headline}>{guidance.headline}</Text>

      <View style={styles.signals}>
        <SignalRow
          label="이번 주 운동량"
          sub={loadRatioPhraseKo(risk.load)}
          value={LOAD_WORD[risk.load.level]}
          color={risk.drivers.includes('load') ? WARN : T3}
        />
        <View style={styles.signalSep} />
        <SignalRow
          label="신발 상태"
          value={`${wearPct}% 닳음`}
          color={risk.drivers.includes('shoe') ? WARN : T3}
        />
      </View>

      <Text style={styles.sectionTitle}>이렇게 하면 부상 없이 킵고잉</Text>
      <View style={{ gap: SPACE.sm }}>
        {guidance.items.map((g, i) => (
          <GuidanceCard key={i} tone={g.tone} icon={g.icon} title={g.title} body={g.body} />
        ))}
      </View>

      <Text style={styles.foot}>
        운동량은 거리에 강도(페이스)를 함께 반영해요. 평소(최근 4주 평균)보다 갑자기 늘거나
        신발이 닳을수록 부상 위험이 커져요.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: CARD, borderRadius: RADIUS.xl },
  content: { padding: SPACE.lg, gap: SPACE.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  level: { ...TYPE.label, color: T1 },
  headline: { ...TYPE.title, color: T1, lineHeight: 30 },
  // 신호 분해
  signals: {
    backgroundColor: CARD_HI,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
  },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.md },
  signalDot: { width: 8, height: 8, borderRadius: 4 },
  signalLabel: { ...TYPE.body, color: T1 },
  signalSub: { ...TYPE.caption, color: T3, marginTop: 1 },
  signalValue: { ...TYPE.heading, color: T1 },
  signalSep: { height: 1, backgroundColor: CARD_BORDER },
  // 코칭
  sectionTitle: { ...TYPE.label, color: T3, marginTop: SPACE.xs },
  guide: {
    flexDirection: 'row',
    gap: SPACE.md,
    backgroundColor: CARD_HI,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACE.md,
  },
  guideIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  guideTitle: { ...TYPE.body, color: T1 },
  guideBody: { ...TYPE.label, color: T2, lineHeight: 19, marginTop: 3, fontWeight: '400' },
  foot: { ...TYPE.caption, color: T3, lineHeight: 16, marginTop: SPACE.xs },
});
