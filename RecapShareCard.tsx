// ============================================================================
// RecapShareCard.tsx — 기간 리캡(주간/월간) 공유 카드(이미지)
// ----------------------------------------------------------------------------
// 총거리(히어로) + 런수·평균 페이스·최다 착용 + 개인 기록(PR)을 react-native-svg만으로
// 그린 정사각 카드. 부모가 넘긴 ref가 내부 <Svg>에 연결되어, 부모는 ref.current
// .toDataURL()로 PNG dataURL을 얻어 공유한다(lib/shareCard shareRecapCard). 새 네이티브
// 의존 0 — 런 카드(ShareCard.tsx)와 동일 패턴, 색은 theme 토큰만(raw hex 0).
//
// 빈 리캡(런 0개)이면 수치 대신 keep-going 카피(A8-5)만 중앙에 보여 준다.
// ============================================================================
import React from 'react';
import Svg, {Rect, Text as SvgText, G} from 'react-native-svg';
import {BG, CARD, CARD_DIM, ACCENT, T1, T2, T3, SEP, FONT, DISPLAY} from './theme';
import {RecapShareCardModel} from './lib/shareCard';

// 1080×1080 정사각 — 런 카드와 동일 출력 해상도(SNS 공유 호환).
export const CARD_W = 1080;
export const CARD_H = 1080;
const PAD = 88;

export interface RecapShareCardProps {
  model: RecapShareCardModel;
}

const RecapShareCard = React.forwardRef<unknown, RecapShareCardProps>(({model}, ref) => {
  // 부가 지표(런수·페이스·최다 착용) 칸 — 카드 가로를 균등 분할.
  const innerX = PAD;
  const innerW = CARD_W - PAD * 2;
  const statY = 612;
  const statSlot = innerW / Math.max(model.stats.length, 1);

  // 개인 기록 행(PR) — 통계 아래로 한 줄씩 쌓는다.
  const prBaseY = 800;
  const prStep = 78;

  return (
    <Svg ref={ref as never} width={CARD_W} height={CARD_H}>
      {/* 배경 + 카드 면 */}
      <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill={BG} />
      <Rect
        x={PAD / 2}
        y={PAD / 2}
        width={CARD_W - PAD}
        height={CARD_H - PAD}
        rx={56}
        fill={CARD}
        stroke={SEP}
        strokeWidth={2}
      />

      {/* 헤더: Keego 워드마크 + 응원 한 줄 */}
      <SvgText x={PAD} y={170} fill={ACCENT} fontFamily={DISPLAY} fontSize={64} fontWeight="700">
        {model.brand}
      </SvgText>
      <SvgText x={PAD} y={228} fill={T3} fontFamily={FONT} fontSize={30}>
        {model.tagline}
      </SvgText>
      <SvgText
        x={CARD_W - PAD}
        y={228}
        fill={T3}
        fontFamily={FONT}
        fontSize={28}
        textAnchor="end">
        {model.hashtag}
      </SvgText>

      {/* 리캡 제목 + 기간 */}
      <SvgText x={PAD} y={344} fill={T1} fontFamily={FONT} fontSize={44} fontWeight="600">
        {model.title}
      </SvgText>
      <SvgText x={PAD} y={398} fill={T2} fontFamily={FONT} fontSize={32}>
        {model.period}
      </SvgText>

      {model.isEmpty ? (
        // 빈 리캡 — keep-going 카피만(A8-5). 수치/PR 없음.
        <SvgText
          x={CARD_W / 2}
          y={620}
          fill={T2}
          fontFamily={FONT}
          fontSize={40}
          textAnchor="middle">
          {model.emptyCopy}
        </SvgText>
      ) : (
        <G>
          {/* 총거리(히어로) */}
          <SvgText x={PAD} y={460} fill={T3} fontFamily={FONT} fontSize={30}>
            {`총 거리 (${model.unit})`}
          </SvgText>
          <SvgText x={PAD} y={540} fill={T1} fontFamily={DISPLAY} fontSize={184} fontWeight="700">
            {model.distance}
          </SvgText>

          {/* 부가 지표 행 */}
          {model.stats.map((st, i) => {
            const cx = innerX + statSlot * i + statSlot / 2;
            return (
              <G key={st.label}>
                <SvgText x={cx} y={statY} fill={T3} fontFamily={FONT} fontSize={28} textAnchor="middle">
                  {st.label}
                </SvgText>
                <SvgText
                  x={cx}
                  y={statY + 54}
                  fill={T1}
                  fontFamily={DISPLAY}
                  fontSize={48}
                  fontWeight="600"
                  textAnchor="middle">
                  {st.value}
                </SvgText>
              </G>
            );
          })}

          {/* 개인 기록(PR) */}
          {model.prs.length > 0 && (
            <Rect
              x={PAD}
              y={prBaseY - 48}
              width={innerW}
              height={model.prs.length * prStep + 32}
              rx={28}
              fill={CARD_DIM}
              stroke={SEP}
              strokeWidth={2}
            />
          )}
          {model.prs.map((pr, i) => {
            const y = prBaseY + i * prStep;
            return (
              <G key={pr.label}>
                <SvgText x={PAD + 36} y={y} fill={T3} fontFamily={FONT} fontSize={30}>
                  {pr.label}
                </SvgText>
                <SvgText
                  x={CARD_W - PAD - 36}
                  y={y}
                  fill={ACCENT}
                  fontFamily={DISPLAY}
                  fontSize={36}
                  fontWeight="600"
                  textAnchor="end">
                  {pr.value}
                </SvgText>
              </G>
            );
          })}
        </G>
      )}
    </Svg>
  );
});

RecapShareCard.displayName = 'RecapShareCard';

export default RecapShareCard;
