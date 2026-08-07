// ============================================================================
// RetirementCard.tsx — 은퇴 키프세이크 카드(이미지) · 컴팩트 공유 카드 언어
// ----------------------------------------------------------------------------
// 하나의 RetirementCardModel(lib/progression/retirementCard) 을 react-native-svg 만으로
// 그린다. 부모가 넘긴 ref 가 내부 <Svg> 에 연결되어, 부모는 ref.current.toDataURL() 로
// PNG dataURL 을 얻어 저장/공유한다(lib/progression/retirementShare). 새 네이티브 의존 0.
//
// 시각 언어 = 런/리캡 공유 카드와 동일(2026-07-16 통일): 다크 라디얼 배경(SHARE_DARK_STOPS)
// · 흰 지표(caps 라벨 + 굵은 값, 그림자) · 거리 히어로만 파파야 그라데이션(성취) · 하단
// keego 파파야 워드마크. 구 A/B/C/D 목업 포맷과 보랏빛 Midnight 팔레트는 폐기.
//
// `format` prop: E 정사각(1080², 기본) / S 스토리(1080×1920, 인스타 9:16).
// 감정적 keepsake 정합 — 게임화 배지(등급)는 싣지 않고 배웅 문장을 중심에 둔다.
// ============================================================================
import React from 'react';
import {PixelRatio} from 'react-native';
import Svg, {Rect, Text as SvgText, G, Line, Defs, LinearGradient, RadialGradient, Stop} from 'react-native-svg';
import {T1, RING_ACCENT, RING_ACCENT_HI, RING_ACCENT_LO, withAlpha} from './theme';
import {SHARE_DARK_STOPS, SHARE_TEXT_SHADOW} from './theme.palettes';
import {WORDMARK_FONT} from './primitives';
import {
  RetirementCardModel,
  RetirementCardFormat,
  DEFAULT_RETIREMENT_CARD_FORMAT,
} from './lib/progression/retirementCard';

const CF = WORDMARK_FONT;

// 1080×1080 정사각(E) — 런/리캡 카드와 동일 출력 해상도(SNS 공유 호환).
export const CARD_W = 1080;
export const CARD_H = 1080;
/** 'S' 스토리 포맷(인스타 9:16). */
export const STORY_H = 1920;
const CX = CARD_W / 2;
const PAD = 88;

export interface RetirementCardProps {
  model: RetirementCardModel;
  /** 레이아웃 포맷(기본 E 정사각). */
  format?: RetirementCardFormat;
  /** 표시 폭(미리보기용) — 지정 시 축소 렌더(viewBox). 미지정=실제 캔버스(고해상 캡처). */
  displayWidth?: number;
}

// 런 카드와 동일 문법의 텍스트 그림자(다크 배경에선 안 보여 무해).
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

/** 폭에 맞춰 폰트 크기를 줄인다(긴 신발명 오버플로 방지). */
function fitSize(text: string, base: number, maxW: number): number {
  const w = text.length * base * 0.56;
  return w <= maxW ? base : Math.max(24, Math.floor(maxW / (text.length * 0.56)));
}

/** 하이라이트 라벨의 선두 이모지 제거(공유 카드 절제 — 화면 내 라벨은 이모지 유지). */
function stripEmoji(label: string): string {
  const i = label.search(/[가-힣A-Za-z0-9]/);
  return i > 0 ? label.slice(i) : label;
}

/** 지표 3셀(RUNS · AVG PACE · LONGEST) — 없는 값은 칸째 빠진다. */
function statCells(model: RetirementCardModel): {label: string; value: string}[] {
  const cells: {label: string; value: string}[] = [{label: 'RUNS', value: model.runCountLabel}];
  if (model.avgPace) cells.push({label: 'AVG PACE', value: model.avgPace});
  if (model.longestRun) cells.push({label: 'LONGEST', value: `${model.longestRun} ${model.unit}`});
  return cells;
}

// ── E · 정사각(1080²) ──────────────────────────────────────────────────────────
function FormatE({model}: {model: RetirementCardModel}) {
  const hair = withAlpha(T1, 0.14);
  const cells = statCells(model);
  const span = CARD_W * 0.86;
  const x0 = (CARD_W - span) / 2;
  const slot = span / cells.length;
  const nameSize = fitSize(model.shoeName, 78, CARD_W - PAD * 2);
  const heroSize = fitSize(`${model.distance} ${model.unit}`, 170, CARD_W - PAD * 2);
  const caption = model.periodRange ? `함께 달린 거리 · ${model.periodRange}` : '함께 달린 거리';
  return (
    <G>
      <Line x1={CX - 250} y1={150} x2={CX + 250} y2={150} stroke={hair} strokeWidth={2} />
      <Tx x={CX} y={214} size={28} weight="700" ls={7} opacity={0.62}>{model.retireLabel.toUpperCase()}</Tx>

      {/* 주인공: 신발명 */}
      <Tx x={CX} y={452} size={nameSize} weight="800" ls={-2}>{model.shoeName}</Tx>

      {/* 거리 히어로 — 파파야 그라데이션(성취) + 캡션 */}
      <SvgText x={CX} y={646} fill="url(#retire-papaya)" fontFamily={CF} fontSize={heroSize} fontWeight="800" letterSpacing={-6} textAnchor="middle">{`${model.distance} ${model.unit}`}</SvgText>
      <Tx x={CX} y={712} size={32} weight="500" opacity={0.6}>{caption}</Tx>

      {/* 지표 셀 */}
      {cells.map((c, i) => {
        const cx = x0 + slot * i + slot / 2;
        return (
          <G key={c.label}>
            <Tx x={cx} y={800} size={26} weight="700" ls={2} opacity={0.8}>{c.label}</Tx>
            <Tx x={cx} y={862} size={50} weight="800" ls={-0.5}>{c.value}</Tx>
          </G>
        );
      })}

      {/* 배웅 + keego */}
      <Tx x={CX} y={962} size={44} weight="700" opacity={0.92}>{model.farewell}</Tx>
      <Tx x={CX} y={1018} size={54} weight="500" ls={-0.5} fill={RING_ACCENT}>{model.brand.toLowerCase()}</Tx>
    </G>
  );
}

// ── S · 스토리(1080×1920) ──────────────────────────────────────────────────────
function FormatS({model}: {model: RetirementCardModel}) {
  const hair = withAlpha(T1, 0.12);
  const moment = model.mostMemorable ? stripEmoji(model.mostMemorable) : '';
  const nameSize = fitSize(model.shoeName, 84, CARD_W - PAD * 2);
  const numSize = fitSize(model.distance, 240, CARD_W - PAD * 2);
  return (
    <G>
      <Line x1={CX - 250} y1={330} x2={CX + 250} y2={330} stroke={hair} strokeWidth={2} />
      <Tx x={CX} y={398} size={32} weight="700" ls={8} opacity={0.6}>{model.retireLabel.toUpperCase()}</Tx>

      {/* 주인공: 신발명 */}
      <Tx x={CX} y={720} size={nameSize} weight="800" ls={-2}>{model.shoeName}</Tx>

      {/* 거대 거리(파파야 그라데이션) + 단위 + 캡션 */}
      <SvgText x={CX} y={1020} fill="url(#retire-papaya)" fontFamily={CF} fontSize={numSize} fontWeight="800" letterSpacing={-9} textAnchor="middle">{model.distance}</SvgText>
      <SvgText x={CX} y={1118} fill="url(#retire-papaya)" fontFamily={CF} fontSize={72} fontWeight="800" textAnchor="middle">{model.unit}</SvgText>
      <Tx x={CX} y={1208} size={38} weight="500" opacity={0.58}>함께 달린 거리</Tx>

      {/* 메타 — 기간 + 기억에 남는 순간 */}
      {!!model.dateRange && (
        <Tx x={CX} y={1320} size={40} weight="600" opacity={0.62}>{model.dateRange}</Tx>
      )}
      {!!moment && (
        <G>
          <Tx x={CX} y={1426} size={26} weight="700" ls={4} opacity={0.5}>MOST MEMORABLE</Tx>
          <Tx x={CX} y={1486} size={42} weight="700" opacity={0.95}>{moment}</Tx>
        </G>
      )}

      {/* 배웅 + keego */}
      <Tx x={CX} y={1640} size={52} weight="700" opacity={0.95}>{model.farewell}</Tx>
      <Line x1={CX - 250} y1={1730} x2={CX + 250} y2={1730} stroke={hair} strokeWidth={2} />
      <Tx x={CX} y={1806} size={56} weight="500" ls={-0.5} fill={RING_ACCENT}>{model.brand.toLowerCase()}</Tx>
    </G>
  );
}

const RetirementCard = React.forwardRef<unknown, RetirementCardProps>(
  ({model, format = DEFAULT_RETIREMENT_CARD_FORMAT, displayWidth}, ref) => {
    const fmt: RetirementCardFormat = format === 'S' ? 'S' : 'E';
    const cardH = fmt === 'S' ? STORY_H : CARD_H;
    // 캡처 기본 폭 = 설계 px ÷ 화면 배율 (2026-08-07 — 형제 카드 3종과 같은 규약).
    // CARD_W 를 그대로 넘기면 그건 **dp** 라, 3배율 기기에서 3240px 이 구워진다.
    // viewBox 가 좌표계를 유지하므로 카드 내부 좌표는 그대로다.
    const captureScale = PixelRatio.get() || 1;
    const dispW = displayWidth && displayWidth > 0 ? Math.round(displayWidth) : Math.round(CARD_W / captureScale);
    const dispH = Math.round((dispW * cardH) / CARD_W);
    return (
      <Svg ref={ref as never} width={dispW} height={dispH} viewBox={`0 0 ${CARD_W} ${cardH}`}>
        <Defs>
          <RadialGradient id="retire-dark" cx="50%" cy="18%" r="110%">
            <Stop offset="0" stopColor={SHARE_DARK_STOPS[0]} />
            <Stop offset="0.55" stopColor={SHARE_DARK_STOPS[1]} />
            <Stop offset="1" stopColor={SHARE_DARK_STOPS[2]} />
          </RadialGradient>
          {/* 러닝 링과 동일한 파파야 그라데이션(HI→LO) — 거리 히어로 전용 */}
          <LinearGradient id="retire-papaya" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={RING_ACCENT_HI} />
            <Stop offset="1" stopColor={RING_ACCENT_LO} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={CARD_W} height={cardH} fill="url(#retire-dark)" />
        {fmt === 'S' ? <FormatS model={model} /> : <FormatE model={model} />}
      </Svg>
    );
  },
);

RetirementCard.displayName = 'RetirementCard';

export default RetirementCard;
