// ============================================================================
// RotationInsightPanel.tsx — 신발 로테이션 인사이트 패널(신발 탭)
// 홈에서 이관(심사 #13, 2026-07-22): 표시 전용 정보라 홈의 '오늘 달린다' 맥락보다
// 신발을 훑어보는 신발 탭이 맞는 자리다(홈 스크롤 다이어트 겸).
// 추천(어떤 신발을 신어라)이 아닌 인사이트(사용 패턴이 어떻다)를 제공한다 — 배지도
// 추천 언어 없이 데이터 기반으로만. 활성 2켤레+ 일 때만 rotation 이 채워지므로,
// 비었으면 통째로 숨긴다. 행 탭은 그 신발로 포커스(호출부가 의미 결정 — 신발 탭=상세).
// ============================================================================
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { rf, rs, rv } from './lib/responsive';
import {
  ACCENT, GOOD, WARN, T1, T3, CARD_HI, FONT, DISPLAY, TYPE, RADIUS, GLASS, SPACE, withAlpha,
} from './theme';
import { GlassEdge, SectionTitle } from './primitives';
import { RotationPick } from './lib/rotation';

// 인사이트 배지 색 토큰 — 추천 언어 없이 데이터 기반으로만 표시.
const INSIGHT_TONE: Record<string, { bg: string; text: string }> = {
  neutral: { bg: CARD_HI,                 text: T3     },
  warn:    { bg: withAlpha(WARN, 0.12),   text: WARN   },
  good:    { bg: withAlpha(GOOD, 0.12),   text: GOOD   },
  accent:  { bg: withAlpha(ACCENT, 0.12), text: ACCENT },
};

// RotationPick 의 reason 문자열(lib/rotation 생성)에서 UI 인사이트를 파생한다.
export function insightBadge(
  pick: RotationPick,
  index: number,
  total: number,
): { badge: string; description: string; toneKey: string } {
  const r = pick.reason;
  const daysMatch = r.match(/(\d+)일 휴식/);
  const days      = daysMatch ? parseInt(daysMatch[1], 10) : null;
  const neverWorn = r.includes('아직 안 신은');
  const usedToday = r.includes('오늘 신은');
  const isCarbon  = r.includes('카본화');
  const isFirst   = index === 0;
  const isLast    = total > 1 && index === total - 1;

  if (neverWorn)
    return { badge: '미착용',       description: '아직 한 번도 신지 않은 신발이에요.',      toneKey: 'neutral' };
  if (usedToday && isLast)
    return { badge: '사용 빈도 높음', description: '요즘 가장 많이 신는 신발이에요.',    toneKey: 'accent'  };
  if (usedToday)
    return { badge: '오늘 사용',     description: '오늘 신은 신발이에요.',                   toneKey: 'good'    };
  if (isCarbon) {
    const dText = days != null ? `${days}일 미사용` : '휴식중';
    return { badge: dText,           description: '레이스를 위해 아껴두는 신발이에요.',              toneKey: 'neutral' };
  }
  if (isLast)
    return { badge: '사용 빈도 높음', description: '요즘 가장 많이 신는 신발이에요.',    toneKey: 'accent'  };
  if (isFirst && days != null && days > 6)
    return { badge: `${days}일 미사용`, description: '최근 가장 오래 쉬고 있는 신발이에요.', toneKey: days > 14 ? 'warn' : 'neutral' };
  if (days != null && days > 14)
    return { badge: '장기 휴식중',   description: '로테이션에 포함해보세요.',                toneKey: 'warn'    };
  if (days != null && days > 0)
    return { badge: `${days}일 미사용`, description: '로테이션에 포함해보세요.',             toneKey: 'neutral' };
  return   { badge: '로테이션 필요', description: '균형 잡힌 로테이션을 위해 활용해보세요.', toneKey: 'neutral' };
}

export default function RotationInsightPanel({ rotation, onPickShoe, flush }: {
  rotation: RotationPick[];
  onPickShoe?: (shoeId: string) => void;
  /** 부모가 이미 좌우 패딩을 주는 스크롤(신발 탭 GUTTER) 안에서는 자체 여백을 끈다. */
  flush?: boolean;
}) {
  if (!rotation || rotation.length === 0) return null;
  return (
    <View testID="rotation-insight" style={p.wrap}>
      <SectionTitle style={[p.sectionLabel, flush && { paddingHorizontal: 0 }]}>로테이션 인사이트</SectionTitle>
      <View style={[p.card, flush && { marginHorizontal: 0 }]}>
        <GlassEdge glints={false} radius={RADIUS.lg} />
        {rotation.map((pick, i) => {
          const { badge, description, toneKey } = insightBadge(pick, i, rotation.length);
          const tone = INSIGHT_TONE[toneKey] ?? INSIGHT_TONE.neutral;
          return (
            <Pressable
              key={pick.shoe.id ?? i}
              testID={`rotation-pick-${i}`}
              onPress={onPickShoe ? () => onPickShoe(pick.shoe.id) : undefined}
              accessibilityRole="button"
              accessibilityLabel={`${pick.shoe.brand} ${pick.shoe.model}`}
              style={({ pressed }) => [p.row, i > 0 && p.rowSep, pressed && onPickShoe ? p.pressed : null]}>
              <View style={p.rowTop}>
                <Text style={p.brand} numberOfLines={1}>{pick.shoe.brand}</Text>
                <View style={[p.badgeChip, { backgroundColor: tone.bg }]}>
                  <Text style={[p.badgeText, { color: tone.text }]}>{badge}</Text>
                </View>
              </View>
              <Text style={p.model} numberOfLines={1}>{pick.shoe.model}</Text>
              <Text style={p.desc} numberOfLines={2}>{description}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const p = StyleSheet.create({
  wrap: { marginTop: SPACE.lg },
  sectionLabel: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.sm },
  card: { marginHorizontal: SPACE.xl, backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingHorizontal: SPACE.lg },
  row: { paddingVertical: rv(14) },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rv(8) },
  brand: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '500', letterSpacing: 1.2 },
  model: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.body.fontSize, fontWeight: '600', letterSpacing: -0.1, marginTop: rv(4) },
  desc: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, letterSpacing: -0.1, marginTop: rv(4), lineHeight: rf(18) },
  badgeChip: { borderRadius: RADIUS.pill, paddingHorizontal: rs(10), paddingVertical: rv(4), flexShrink: 0 },
  badgeText: { fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: -0.1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
