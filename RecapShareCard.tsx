// ============================================================================
// RecapShareCard.tsx — 기간 리캡(주간/월간) 공유 카드(이미지) · 컴팩트 언어
// ----------------------------------------------------------------------------
// 런 공유 카드(ShareCard.tsx)와 같은 시각 언어로 그린 1080×1080 완성본 카드:
// 다크 라디얼 배경 · 흰 지표(caps 라벨 + 굵은 값, 그림자) · 성취(PR)는 파파야 리본 ·
// 하단 keego 파파야 워드마크. 부모가 넘긴 ref가 내부 <Svg>에 연결되어 toDataURL()로
// PNG를 얻어 공유한다(lib/shareCard shareRecapCard). 새 네이티브 의존 0.
//
// 빈 리캡(런 0개)이면 수치 대신 keep-going 카피(A8-5)만 중앙에 보여 준다.
// ============================================================================
import React from 'react';
import Svg, {Rect, Text as SvgText, Defs, RadialGradient, Stop, G} from 'react-native-svg';
import {T1, RING_ACCENT} from './theme';
import {SHARE_DARK_STOPS, SHARE_TEXT_SHADOW} from './theme.palettes';
import {WORDMARK_FONT} from './primitives';
import {RecapShareCardModel} from './lib/shareCard';

const CF = WORDMARK_FONT;

// 1080×1080 정사각 — 런 카드와 동일 출력 해상도(SNS 공유 호환).
export const CARD_W = 1080;
export const CARD_H = 1080;
const PAD = 88;
const CX = CARD_W / 2;

// 사진 없는 다크 완성본이지만 런 카드와 동일 문법 유지 — 어두운 복사본 그림자(무해).
function Tx({x, y, size, weight, anchor = 'middle', ls = 0, opacity = 1, fill = T1, children}: {
  x: number; y: number; size: number; weight: '500' | '600' | '700' | '800';
  anchor?: 'start' | 'middle' | 'end'; ls?: number; opacity?: number; fill?: string;
  children: string;
}) {
  const dy = Math.max(2, Math.round(size * 0.04));
  return (
    <>
      <SvgText x={x + 2} y={y + dy} fill={SHARE_TEXT_SHADOW} fillOpacity={0.45} fontFamily={CF} fontSize={size} fontWeight={weight} letterSpacing={ls} textAnchor={anchor}>{children}</SvgText>
      <SvgText x={x} y={y} fill={fill} fillOpacity={opacity} fontFamily={CF} fontSize={size} fontWeight={weight} letterSpacing={ls} textAnchor={anchor}>{children}</SvgText>
    </>
  );
}

/** 폭에 맞춰 폰트 크기를 줄인다(긴 신발명·PR 문자열 오버플로 방지). */
function fitSize(text: string, base: number, maxW: number): number {
  const w = text.length * base * 0.56;
  return w <= maxW ? base : Math.max(22, Math.floor(maxW / (text.length * 0.56)));
}

export interface RecapShareCardProps {
  model: RecapShareCardModel;
}

const RecapShareCard = React.forwardRef<unknown, RecapShareCardProps>(({model}, ref) => {
  // 히어로 거리 — 자릿수가 늘면(1000km+) 폭에 맞춰 축소.
  const hero = `${model.distance} ${model.unit}`;
  const heroSize = fitSize(hero, 190, CARD_W - PAD * 2);

  // 지표 3셀(RUNS · AVG PACE · TOP SHOE) — 카드 가로 균등 분할.
  const span = CARD_W * 0.92;
  const x0 = (CARD_W - span) / 2;
  const slot = span / Math.max(model.stats.length, 1);

  // PR 리본 — 성취는 파파야(런 카드 '기록' 리본과 동일 문법). 전부 한 줄로 잇는다.
  const prLine = model.prs.map(pr => `${pr.label} ${pr.value}`).join('  ·  ');
  const prSize = prLine ? fitSize(`★  ${prLine}`, 34, CARD_W - PAD * 2 - 96) : 0;
  const prW = prLine ? Math.min(CARD_W - PAD * 2, Math.round(prLine.length * prSize * 0.56 + 96 + 54)) : 0;

  return (
    <Svg ref={ref as never} width={CARD_W} height={CARD_H}>
      <Defs>
        <RadialGradient id="recap-dark" cx="50%" cy="18%" r="110%">
          <Stop offset="0" stopColor={SHARE_DARK_STOPS[0]} /><Stop offset="0.55" stopColor={SHARE_DARK_STOPS[1]} /><Stop offset="1" stopColor={SHARE_DARK_STOPS[2]} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill="url(#recap-dark)" />

      {/* 상단: caps 타이틀 + 기간 */}
      <Tx x={CX} y={200} size={34} weight="700" ls={6} opacity={0.85}>{model.titleEn}</Tx>
      <Tx x={CX} y={262} size={36} weight="500" opacity={0.62}>{model.period}</Tx>

      {model.isEmpty ? (
        // 빈 리캡 — keep-going 카피만(A8-5). 수치/PR 없음.
        <Tx x={CX} y={560} size={40} weight="500" opacity={0.85}>{model.emptyCopy}</Tx>
      ) : (
        <G>
          {/* 히어로: 총거리 */}
          <Tx x={CX} y={420} size={28} weight="700" ls={2} opacity={0.8}>DISTANCE</Tx>
          <Tx x={CX} y={580} size={heroSize} weight="800" ls={-4}>{hero}</Tx>

          {/* 지표 3셀 */}
          {model.stats.map((st, i) => {
            const cx = x0 + slot * i + slot / 2;
            const vSize = fitSize(st.value, 54, slot * 0.94);
            return (
              <G key={st.label}>
                <Tx x={cx} y={720} size={28} weight="700" ls={2} opacity={0.8}>{st.label}</Tx>
                <Tx x={cx} y={720 + vSize + 20} size={vSize} weight="800" ls={-0.5}>{st.value}</Tx>
              </G>
            );
          })}

          {/* 개인 기록(PR) 리본 — 성취=파파야 */}
          {!!prLine && (
            <G>
              <Rect x={CX - prW / 2} y={852} width={prW} height={76} rx={38} fill={RING_ACCENT} fillOpacity={0.16} stroke={RING_ACCENT} strokeOpacity={0.5} strokeWidth={2.5} />
              <SvgText x={CX - prW / 2 + Math.round(prSize * 1.1)} y={852 + 38 + Math.round(prSize * 0.36)} fontFamily={CF} fontSize={prSize} fill={RING_ACCENT}>★</SvgText>
              <SvgText x={CX + Math.round(prSize * 0.65)} y={852 + 38 + Math.round(prSize * 0.36)} fontFamily={CF} fontSize={prSize} fontWeight="800" fill={RING_ACCENT} textAnchor="middle" letterSpacing={0.5}>{prLine}</SvgText>
            </G>
          )}
        </G>
      )}

      {/* 하단: keego 워드마크(파파야) */}
      <Tx x={CX} y={1010} size={54} weight="500" ls={-0.5} fill={RING_ACCENT}>{model.brand.toLowerCase()}</Tx>
    </Svg>
  );
});

RecapShareCard.displayName = 'RecapShareCard';

export default RecapShareCard;
