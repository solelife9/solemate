// ============================================================================
// RunnerSpecShareCard.tsx — 러너 스펙 공유 카드(이미지)
// ----------------------------------------------------------------------------
// VO2max(심폐 체력) + 거리 PB 훈장(5K·10K·하프·풀) + 최고페이스/최장을 '스펙 시트'
// 포스터로 그린다. 부모가 넘긴 ref 가 내부 <Svg> 에 연결되어 ref.current.toDataURL()로
// PNG 를 얻어 공유한다(lib/shareCard captureCardDataUrl). react-native-svg 만 — 네이티브 0.
// 색은 theme 토큰만. 큰 숫자는 포스터 관례상 800(인앱 700 규칙과 별개 — 대형 그래픽).
// ============================================================================
import React from 'react';
import Svg, {Rect, Text as SvgText, G, Circle} from 'react-native-svg';
import {BG, CARD_HI, ACCENT, T1, T2, T3, FONT, DISPLAY, CARD_BORDER} from './theme';
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
  vo2max: number;     // 0이면 심폐 체력 블록 숨김
  vo2maxLabel: string;
  medals: RunnerSpecMedal[];
  pace: string;       // "5'00\"/km" 또는 '--'
  longest: string;    // '21.1km' 또는 '--'
}

const RunnerSpecShareCard = React.forwardRef<unknown, {model: RunnerSpecShareModel}>(({model}, ref) => {
  const innerW = CARD_W - PAD * 2;
  const hasVo2 = model.vo2max > 0;

  // 세로 배치 — VO2max 유무에 따라 훈장 그리드 시작점만 이동.
  const medalTop = hasVo2 ? 850 : 620;
  const colX = [PAD, PAD + innerW / 2 + 8];
  const rowY = [medalTop, medalTop + 190];

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
      <SvgText x={PAD} y={300} fill={T1} fontFamily={DISPLAY} fontWeight="800" fontSize={72} letterSpacing={-1.5}>
        {model.runner}
      </SvgText>

      {/* 심폐 체력(VO2max) */}
      {hasVo2 && (
        <G>
          <SvgText x={PAD} y={470} fill={T2} fontFamily={FONT} fontWeight="600" fontSize={34}>
            심폐 체력
          </SvgText>
          <SvgText x={PAD} y={600} fill={T1} fontFamily={DISPLAY} fontWeight="800" fontSize={132} letterSpacing={-3}>
            {model.vo2max.toFixed(1)}
          </SvgText>
          <SvgText x={PAD + measureBig(model.vo2max.toFixed(1))} y={600} fill={T3} fontFamily={FONT} fontWeight="600" fontSize={40}>
            {'  VO₂max'}
          </SvgText>
          <SvgText x={PAD + measureBig(model.vo2max.toFixed(1))} y={548} fill={ACCENT} fontFamily={FONT} fontWeight="800" fontSize={34}>
            {'  ' + model.vo2maxLabel}
          </SvgText>
          <Rect x={PAD} y={690} width={innerW} height={2} fill={CARD_BORDER} />
        </G>
      )}

      {/* 거리 PB 훈장 2×2 */}
      {model.medals.slice(0, 4).map((m, i) => {
        const cx = colX[i % 2];
        const cy = rowY[Math.floor(i / 2)];
        return (
          <G key={m.label}>
            <Circle cx={cx + 11} cy={cy - 12} r={11} fill={m.earned ? ACCENT : CARD_HI} />
            <SvgText x={cx + 34} y={cy} fill={m.earned ? T1 : T3} fontFamily={FONT} fontWeight="800" fontSize={34} letterSpacing={1}>
              {m.label}
            </SvgText>
            <SvgText x={cx} y={cy + 76} fill={m.earned ? T1 : T3} fontFamily={DISPLAY} fontWeight="800" fontSize={64} letterSpacing={-1}>
              {m.value}
            </SvgText>
          </G>
        );
      })}

      {/* 하단: 최고페이스 · 최장 */}
      <Rect x={PAD} y={CARD_H - 236} width={innerW} height={2} fill={CARD_BORDER} />
      <SvgText x={CARD_W / 2} y={CARD_H - 150} fill={T2} fontFamily={FONT} fontWeight="600" fontSize={38} textAnchor="middle">
        {`1km 최고 ${model.pace}   ·   최장 ${model.longest}`}
      </SvgText>
    </Svg>
  );
});

// VO2max 숫자 폭 추정(단위/등급을 숫자 오른쪽에 붙이기 위한 근사). DISPLAY 132px 기준.
function measureBig(s: string): number {
  return s.length * 74;
}

RunnerSpecShareCard.displayName = 'RunnerSpecShareCard';
export default RunnerSpecShareCard;
