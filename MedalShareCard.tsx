// ============================================================================
// MedalShareCard.tsx — 마라톤 메달 자랑 카드(이미지) · 컴팩트 공유 카드 언어
// ----------------------------------------------------------------------------
// 완주한 대회를 자랑하는 포스터: 원형 메달(사진 있으면 원형 클립, 없으면 골드 디스크) +
// 대회명 + 공식 기록(정본) + 종목·날짜. 프라이버시: BIB·러너 이름은 절대 넣지 않는다.
// 부모 ref → Svg.toDataURL() 로 PNG 캡처해 공유(lib/shareCard). react-native-svg 만.
//
// 시각 언어(2026-07-16 통일): 다크 라디얼 배경(SHARE_DARK_STOPS) + keego 파파야 워드마크
// + 흰 보조 지표(그림자). 골드는 성취 도메인이라 유지(메달 링·공식 기록·FINISHER).
// ============================================================================
import React from 'react';
import Svg, {Rect, Text as SvgText, G, Circle, Image as SvgImage, Line, Defs, ClipPath, RadialGradient, Stop} from 'react-native-svg';
import {CARD, CARD_BORDER, FONT, HALL_GOLD, T1, RING_ACCENT, DISPLAY} from './theme';
import {SHARE_DARK_STOPS, SHARE_TEXT_SHADOW} from './theme.palettes';
import {WORDMARK_FONT} from './primitives';

const CF = WORDMARK_FONT;

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

// 런/리캡/은퇴 카드와 동일 문법의 텍스트 그림자. 본문 폰트=FONT(Pretendard) — 한글에
// WORDMARK_FONT(Helvetica)가 걸리던 것 회수(감사 #57). 라틴 로고타입만 font=CF 로 덮는다.
function Tx({x, y, size, weight, anchor = 'middle', ls = 0, opacity = 1, fill = T1, font = FONT, children}: {
  x: number; y: number; size: number; weight: '500' | '600' | '700' | '800';
  anchor?: 'start' | 'middle' | 'end'; ls?: number; opacity?: number; fill?: string; font?: string;
  children: string;
}) {
  const dy = Math.max(2, Math.round(size * 0.04));
  return (
    <>
      <SvgText x={x + 2} y={y + dy} fill={SHARE_TEXT_SHADOW} fillOpacity={0.45} fontFamily={font} fontSize={size} fontWeight={weight} letterSpacing={ls} textAnchor={anchor}>{children}</SvgText>
      <SvgText x={x} y={y} fill={fill} fillOpacity={opacity} fontFamily={font} fontSize={size} fontWeight={weight} letterSpacing={ls} textAnchor={anchor}>{children}</SvgText>
    </>
  );
}

const MedalShareCard = React.forwardRef<unknown, {model: MedalShareModel}>(({model}, ref) => {
  const cx = CARD_W / 2;
  const cy = 470;
  const r = 240;
  // 헤어라인 = 전역 CARD_BORDER(흰 7%) — 사설 0.14 를 RunnerSpec 과 통일(감사 #57).
  const hair = CARD_BORDER;

  return (
    <Svg ref={ref as never} width={CARD_W} height={CARD_H}>
      <Defs>
        <RadialGradient id="medal-dark" cx="50%" cy="18%" r="110%">
          <Stop offset="0" stopColor={SHARE_DARK_STOPS[0]} />
          <Stop offset="0.55" stopColor={SHARE_DARK_STOPS[1]} />
          <Stop offset="1" stopColor={SHARE_DARK_STOPS[2]} />
        </RadialGradient>
        <ClipPath id="medalClip">
          <Circle cx={cx} cy={cy} r={r} />
        </ClipPath>
      </Defs>
      <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill="url(#medal-dark)" />

      {/* 헤더 — keego 파파야 워드마크(4종 통일: 파파야·54·좌상) + FINISHER(골드=성취).
          caps 코너 라벨은 28px·y168 — RunnerSpec 헤더 기준선과 픽셀 통일(감사 #57). */}
      <Tx x={PAD} y={168} size={54} weight="500" ls={-0.5} anchor="start" fill={RING_ACCENT} font={CF}>{model.brand.toLowerCase()}</Tx>
      <SvgText x={CARD_W - PAD} y={168} fill={HALL_GOLD} fontFamily={FONT} fontWeight="800" fontSize={28} letterSpacing={4} textAnchor="end">
        RACE FINISHER
      </SvgText>

      {/* 원형 메달 — 사진 있으면 원형 클립, 없으면 골드 디스크 + 종목 */}
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
      <Tx x={cx} y={cy + r + 96} size={46} weight="700" ls={-0.8}>{model.raceName}</Tx>

      {/* 공식 기록(정본) — 히어로(골드=성취). 폰트=DISPLAY(RunnerSpec 히어로 숫자와 통일). */}
      <SvgText x={cx} y={cy + r + 230} fill={HALL_GOLD} fontFamily={DISPLAY} fontWeight="800" fontSize={132} letterSpacing={-3} textAnchor="middle">
        {model.officialTime}
      </SvgText>

      {/* 종목 · 날짜 (· 페이스) */}
      <Tx x={cx} y={cy + r + 302} size={34} weight="600" opacity={0.62}>
        {`${model.distanceLabel}  ·  ${model.date}${model.paceLabel ? `  ·  ${model.paceLabel}` : ''}`}
      </Tx>

      {/* 하단 라인 */}
      <Line x1={PAD} y1={CARD_H - 150} x2={CARD_W - PAD} y2={CARD_H - 150} stroke={hair} strokeWidth={2} />
      <Tx x={cx} y={CARD_H - 88} size={30} weight="600" opacity={0.62}>완주 메달 · keego 아카이브</Tx>
    </Svg>
  );
});

MedalShareCard.displayName = 'MedalShareCard';
export default MedalShareCard;
