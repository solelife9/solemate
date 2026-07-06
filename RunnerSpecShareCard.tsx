// ============================================================================
// RunnerSpecShareCard.tsx — 러너 스펙 공유 카드(이미지)
// ----------------------------------------------------------------------------
// 2026-07-07 A안 위계: 거리 PB 훈장(5K·10K·하프·풀)이 히어로, 그 아래 누적·최장·
// 1km 최고 서브 라인, VO2max(심폐 체력)는 낯설고 앱마다 값이 달라 하단 푸터로 강등.
// 부모가 넘긴 ref 가 내부 <Svg> 에 연결되어 ref.current.toDataURL()로 PNG 를 얻어
// 공유한다(lib/shareCard captureCardDataUrl). react-native-svg 만 — 네이티브 0.
// 색은 theme 토큰만. 큰 숫자는 포스터 관례상 800(인앱 700 규칙과 별개 — 대형 그래픽).
// ============================================================================
import React from 'react';
import Svg, {Rect, Text as SvgText, G, Circle} from 'react-native-svg';
import {BG, CARD, CARD_HI, ACCENT, HALL_GOLD, T1, T2, T3, FONT, DISPLAY, CARD_BORDER} from './theme';
import {WORDMARK_FONT} from './primitives';

export const CARD_W = 1080;
export const CARD_H = 1350;
const PAD = 88;

export interface RunnerSpecMedal {
  label: string;   // '5K' · '10K' · '하프' · '풀'
  value: string;   // 완주 시 시간('24:30'), 미완주 시 '아직'
  earned: boolean;
}
export interface RunnerSpecShareModel {
  runner: string;
  brand: string;      // 'Keego'
  vo2max: number;     // 0이면 심폐 체력 푸터 숨김
  vo2maxLabel: string;
  medals: RunnerSpecMedal[];
  pace: string;       // "5'00\"/km" 또는 '--'
  longest: string;    // '21.1km' 또는 '--'
  totalKm?: string;   // '1,248km' — 있으면 서브 라인 맨 앞에 '누적'으로 표시
}

const RunnerSpecShareCard = React.forwardRef<unknown, {model: RunnerSpecShareModel}>(({model}, ref) => {
  const innerW = CARD_W - PAD * 2;
  const hasVo2 = model.vo2max > 0;

  // 거리 PB 훈장 = 히어로. 2×2 카드 타일.
  const gap = 24;
  const tileW = (innerW - gap) / 2;
  const tileH = 196;
  const gridTop = 430;
  const colX = [PAD, PAD + tileW + gap];
  const rowY = [gridTop, gridTop + tileH + gap];

  // 서브 라인(누적 · 최장 · 1km 최고) — totalKm 있으면 3분할, 없으면 기존 2분할 문구.
  const subLine = model.totalKm
    ? `누적 ${model.totalKm}    ·    최장 ${model.longest}    ·    1km ${model.pace}`
    : `1km 최고 ${model.pace}    ·    최장 ${model.longest}`;
  const subY = rowY[1] + tileH + 92;

  return (
    <Svg ref={ref as never} width={CARD_W} height={CARD_H}>
      <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill={BG} />
      <Rect x={PAD / 2} y={PAD / 2} width={CARD_W - PAD} height={CARD_H - PAD} rx={40} fill="none" stroke={CARD_BORDER} strokeWidth={2} />

      {/* 헤더 — 워드마크 + 러너 스펙 + 이름 */}
      <SvgText x={PAD} y={168} fill={T1} fontFamily={WORDMARK_FONT} fontWeight="500" fontSize={58} letterSpacing={-0.5}>
        {model.brand.toLowerCase()}
      </SvgText>
      <SvgText x={CARD_W - PAD} y={168} fill={ACCENT} fontFamily={FONT} fontWeight="800" fontSize={30} letterSpacing={4} textAnchor="end">
        RUNNER SPEC
      </SvgText>
      <SvgText x={PAD} y={310} fill={T1} fontFamily={DISPLAY} fontWeight="800" fontSize={72} letterSpacing={-1.5}>
        {model.runner}
      </SvgText>

      {/* 거리 PB 훈장 2×2 — 히어로. 달성=CARD_HI 판 + 골드 메달, 미달성=흐린 판. */}
      {model.medals.slice(0, 4).map((m, i) => {
        const x = colX[i % 2];
        const y = rowY[Math.floor(i / 2)];
        return (
          <G key={m.label}>
            <Rect x={x} y={y} width={tileW} height={tileH} rx={28} fill={m.earned ? CARD_HI : CARD} />
            <Circle cx={x + 46} cy={y + 58} r={15} fill={m.earned ? HALL_GOLD : CARD_BORDER} />
            <SvgText x={x + 76} y={y + 72} fill={m.earned ? T1 : T3} fontFamily={FONT} fontWeight="800" fontSize={36} letterSpacing={1}>
              {m.label}
            </SvgText>
            <SvgText x={x + 44} y={y + 156} fill={m.earned ? T1 : T3} fontFamily={DISPLAY} fontWeight="800" fontSize={66} letterSpacing={-1}>
              {m.value}
            </SvgText>
          </G>
        );
      })}

      {/* 서브 라인: 누적 · 최장 · 1km 최고 */}
      <SvgText x={CARD_W / 2} y={subY} fill={T2} fontFamily={FONT} fontWeight="600" fontSize={38} textAnchor="middle">
        {subLine}
      </SvgText>

      {/* 심폐 체력(VO2max) — 강등 푸터(있을 때만). */}
      {hasVo2 && (
        <G>
          <Rect x={PAD} y={CARD_H - 218} width={innerW} height={2} fill={CARD_BORDER} />
          <SvgText x={CARD_W / 2} y={CARD_H - 128} fill={T3} fontFamily={FONT} fontWeight="600" fontSize={34} textAnchor="middle">
            {`심폐 체력  ${model.vo2max.toFixed(1)} VO₂max  ·  ${model.vo2maxLabel}`}
          </SvgText>
        </G>
      )}
    </Svg>
  );
});

RunnerSpecShareCard.displayName = 'RunnerSpecShareCard';
export default RunnerSpecShareCard;
