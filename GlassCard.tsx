// GlassCard.tsx — 핸드오프 프리미엄 카드 래퍼.
// KeegoHome 이 확립한 유리감을 앱 전역 카드가 공유한다:
//   · 기본: 모서리 하이라이트(애플 유리 엣지) — 좌상·우하만 빛나고 옆면은 사라지는 대각 스트로크.
//     기존 카드 배경 위에 얹어 프리미엄 느낌만 더한다(구조·배경은 호출측 그대로).
//   · surface: SVG 상승감 표면(HERO_BG→CARD 세로 그라데이션 + 은은한 상단 글로우)까지 —
//     히어로·요약 같은 prominent 카드용. 이때 배경은 GlassCard 가 담당(CARD).
// SVG 는 borderRadius + overflow:'hidden' 으로 카드 모서리에 클립된다.
import React, {useId} from 'react';
import {View, type ViewStyle, type StyleProp, type ViewProps} from 'react-native';
import {CARD, ACCENT} from './theme';
import {SurfaceBackground, GlassEdge} from './screens/KeegoHome';

type GlassCardProps = ViewProps & {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** true 면 상승감 표면(SVG 세로 그라데이션 + 글로우)까지 — 히어로·요약 카드용. */
  surface?: boolean;
  /** 상단 글로우 색(surface 일 때만). 기본 ACCENT — 은은하게. */
  glow?: string;
};

export function GlassCard({
  children,
  style,
  radius = 24,
  surface = false,
  glow = ACCENT,
  ...rest
}: GlassCardProps) {
  // SVG gradient id 는 document-전역 유일해야 한다 → 인스턴스별 useId(콜론 제거).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View {...rest} style={[{borderRadius: radius, overflow: 'hidden'}, surface && {backgroundColor: CARD}, style]}>
      {surface ? <SurfaceBackground id={`gcs${uid}`} glow={glow} /> : null}
      <GlassEdge id={`gce${uid}`} radius={radius} />
      {children}
    </View>
  );
}
