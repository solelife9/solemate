// ============================================================================
// MedalShareCard.tsx — 마라톤 메달 자랑 카드(이미지)
// ----------------------------------------------------------------------------
// 완주한 대회를 자랑하는 포스터: 원형 메달(사진 있으면 원형 클립, 없으면 골드 디스크) +
// 대회명 + 공식 기록(정본) + 종목·날짜. 프라이버시: BIB·러너 이름은 절대 넣지 않는다.
// 부모 ref → Svg.toDataURL() 로 PNG 캡처해 공유(lib/shareCard). react-native-svg 만.
// ============================================================================
import React from 'react';
import Svg, {Rect, Text as SvgText, G, Circle, Image as SvgImage, Defs, ClipPath} from 'react-native-svg';
import {BG, CARD, HALL_GOLD, T1, T2, T3, FONT, DISPLAY, CARD_BORDER} from './theme';
import {WORDMARK_FONT} from './primitives';

export const CARD_W = 1080;
export const CARD_H = 1350;
const PAD = 88;

export interface MedalShareModel {
  brand: string;       // 'keego'
  raceName: string;
  distanceLabel: string; // '10K' · '하프' · '풀코스'
  officialTime: string;  // 공식 기록 'H:MM:SS'
  date: string;          // 'YYYY.MM.DD'
  paceLabel?: string;    // "5'36\"/km" (선택)
  medalPhotoUri?: string; // 원형 메달 사진(선택)
}

const MedalShareCard = React.forwardRef<unknown, {model: MedalShareModel}>(({model}, ref) => {
  const cx = CARD_W / 2;
  const cy = 470;
  const r = 240;

  return (
    <Svg ref={ref as never} width={CARD_W} height={CARD_H}>
      <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill={BG} />
      <Rect x={PAD / 2} y={PAD / 2} width={CARD_W - PAD} height={CARD_H - PAD} rx={40} fill="none" stroke={CARD_BORDER} strokeWidth={2} />

      {/* 헤더 — 워드마크 + FINISHER */}
      <SvgText x={PAD} y={158} fill={T1} fontFamily={WORDMARK_FONT} fontWeight="500" fontSize={54} letterSpacing={-0.5}>
        {model.brand.toLowerCase()}
      </SvgText>
      <SvgText x={CARD_W - PAD} y={158} fill={HALL_GOLD} fontFamily={FONT} fontWeight="800" fontSize={28} letterSpacing={4} textAnchor="end">
        RACE FINISHER
      </SvgText>

      {/* 원형 메달 — 사진 있으면 원형 클립, 없으면 골드 디스크 + 종목 */}
      <Defs>
        <ClipPath id="medalClip">
          <Circle cx={cx} cy={cy} r={r} />
        </ClipPath>
      </Defs>
      {model.medalPhotoUri ? (
        <G>
          <SvgImage
            href={{uri: model.medalPhotoUri}}
            x={cx - r}
            y={cy - r}
            width={r * 2}
            height={r * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#medalClip)"
          />
          <Circle cx={cx} cy={cy} r={r} stroke={HALL_GOLD} strokeWidth={5} fill="none" />
        </G>
      ) : (
        <G>
          <Circle cx={cx} cy={cy} r={r} fill={CARD} stroke={HALL_GOLD} strokeWidth={5} />
          <SvgText x={cx} y={cy + 34} fill={HALL_GOLD} fontFamily={DISPLAY} fontWeight="800" fontSize={96} letterSpacing={-1} textAnchor="middle">
            {model.distanceLabel}
          </SvgText>
        </G>
      )}

      {/* 대회명 */}
      <SvgText x={cx} y={cy + r + 96} fill={T1} fontFamily={FONT} fontWeight="700" fontSize={46} letterSpacing={-0.8} textAnchor="middle">
        {model.raceName}
      </SvgText>

      {/* 공식 기록(정본) — 히어로 */}
      <SvgText x={cx} y={cy + r + 230} fill={HALL_GOLD} fontFamily={DISPLAY} fontWeight="800" fontSize={132} letterSpacing={-3} textAnchor="middle">
        {model.officialTime}
      </SvgText>

      {/* 종목 · 날짜 (· 페이스) */}
      <SvgText x={cx} y={cy + r + 300} fill={T3} fontFamily={FONT} fontWeight="600" fontSize={34} textAnchor="middle">
        {model.distanceLabel}  ·  {model.date}{model.paceLabel ? `  ·  ${model.paceLabel}` : ''}
      </SvgText>

      {/* 하단 라인 */}
      <Rect x={PAD} y={CARD_H - 150} width={CARD_W - PAD * 2} height={2} fill={CARD_BORDER} />
      <SvgText x={cx} y={CARD_H - 88} fill={T2} fontFamily={FONT} fontWeight="600" fontSize={30} textAnchor="middle">
        완주 메달 · keego 아카이브
      </SvgText>
    </Svg>
  );
});

MedalShareCard.displayName = 'MedalShareCard';
export default MedalShareCard;
