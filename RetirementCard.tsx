// ============================================================================
// RetirementCard.tsx — 은퇴 키프세이크 카드(이미지, 4 레이아웃)
// ----------------------------------------------------------------------------
// 하나의 RetirementCardModel(lib/progression/retirementCard) 을 react-native-svg 만으로
// 그린 정사각 1080×1080 카드. 부모가 넘긴 ref 가 내부 <Svg> 에 연결되어, 부모는
// ref.current.toDataURL() 로 PNG dataURL 을 얻어 저장/공유한다(lib/progression
// /retirementShare). 새 네이티브 의존 0 — 런/리캡 카드(ShareCard·RecapShareCard)와 동일
// 패턴. 색은 theme 토큰 + 등급 티어색(model.grade.color = TIER_COLORS)만(raw hex 0).
//
// `format` prop 으로 4개 레이아웃을 고른다(기본 'C'):
//   A — Nike 캠페인(거대 타이포 · 오렌지 바 · MISSION COMPLETE)
//   B — Modern premium(가는 굵기 · 디바이더 · '512 km Together')
//   C — Apple/한국어 감성(기본, '512km 함께했습니다 / 훌륭한 여정이었습니다')
//   D — Hall of Fame(인증서 프레임 · Shoe Score · Class of YYYY)
// 모든 포맷이 Smart Retirement Grade 배지 + KEEGO/Keep Going 워드마크(+ 장착 타이틀 은은)
// 를 함께 싣는다.
// ============================================================================
import React from 'react';
import Svg, {
  Rect,
  Text as SvgText,
  G,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import {
  BG,
  CARD,
  CARD_DIM,
  ACCENT,
  T1,
  T2,
  T3,
  SEP,
  FONT,
  DISPLAY,
  TIER_COLORS,
  withAlpha,
} from './theme';
import {
  RetirementCardModel,
  RetirementCardFormat,
  DEFAULT_RETIREMENT_CARD_FORMAT,
} from './lib/progression/retirementCard';

// 1080×1080 정사각 — 런/리캡 카드와 동일 출력 해상도(SNS 공유 호환).
export const CARD_W = 1080;
export const CARD_H = 1080;
const PAD = 88;
const CX = CARD_W / 2;

export interface RetirementCardProps {
  model: RetirementCardModel;
  /** 레이아웃 포맷(기본 C). */
  format?: RetirementCardFormat;
}

// ── 공통 조각 ──────────────────────────────────────────────────────────────────
/** Smart Retirement Grade 배지(이모지 + 라벨, 티어색 보더/텍스트). */
function GradeBadge({
  model,
  x,
  y,
  anchor = 'middle',
}: {
  model: RetirementCardModel;
  x: number;
  y: number;
  anchor?: 'start' | 'middle';
}) {
  const c = model.grade.color;
  const text = `${model.grade.emoji} ${model.grade.label}`;
  // 텍스트 폭 근사(정사각 캡션 기준) — 배지 알약 배경 크기.
  const w = Math.max(220, text.length * 22 + 80);
  const h = 64;
  const rectX = anchor === 'middle' ? x - w / 2 : x;
  return (
    <G>
      <Rect
        x={rectX}
        y={y - h / 2}
        width={w}
        height={h}
        rx={h / 2}
        fill={withAlpha(c, 0.14)}
        stroke={withAlpha(c, 0.5)}
        strokeWidth={2}
      />
      <SvgText
        x={x}
        y={y + 11}
        fill={c}
        fontFamily={FONT}
        fontSize={30}
        fontWeight="700"
        textAnchor={anchor}>
        {text}
      </SvgText>
    </G>
  );
}

/** KEEGO / Keep Going 워드마크 + 장착 타이틀(은은). */
function Wordmark({
  model,
  x,
  y,
  anchor = 'middle',
  color = T1,
}: {
  model: RetirementCardModel;
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  color?: string;
}) {
  return (
    <G>
      <SvgText
        x={x}
        y={y}
        fill={color}
        fontFamily={DISPLAY}
        fontSize={30}
        fontWeight="800"
        letterSpacing={10}
        textAnchor={anchor}>
        {model.brand}
      </SvgText>
      <SvgText
        x={x}
        y={y + 34}
        fill={T3}
        fontFamily={FONT}
        fontSize={22}
        textAnchor={anchor}>
        {model.equippedTitle ? `${model.wordmark} · ${model.equippedTitle}` : model.wordmark}
      </SvgText>
    </G>
  );
}

// ── A · Nike 캠페인 ─────────────────────────────────────────────────────────────
function FormatA({model}: {model: RetirementCardModel}) {
  const left = PAD + 28;
  const stats: {v: string; k: string}[] = [
    {v: model.runCountLabel, k: 'RUNS'},
    {v: model.bestPace ?? '--', k: 'BEST PACE'},
    {v: model.pbLabel ?? '×0', k: 'PB'},
  ];
  const slot = (CARD_W - left - PAD) / 3;
  return (
    <G>
      {/* 좌측 오렌지 바 */}
      <Rect x={0} y={0} width={20} height={CARD_H} fill={ACCENT} />
      <SvgText x={left} y={150} fill={ACCENT} fontFamily={FONT} fontSize={30} fontWeight="800" letterSpacing={8}>
        {model.tagA}
      </SvgText>
      {/* 모델명(대문자, 거대) */}
      <SvgText
        x={left}
        y={440}
        fill={T1}
        fontFamily={DISPLAY}
        fontSize={120}
        fontWeight="800"
        letterSpacing={-4}>
        {model.shoeName.toUpperCase()}
      </SvgText>
      {/* 거리 히어로 */}
      <SvgText x={left} y={620} fill={T1} fontFamily={DISPLAY} fontSize={230} fontWeight="800" letterSpacing={-12}>
        {model.distance}
        <SvgText fill={ACCENT} fontSize={84}>{` ${model.unit.toUpperCase()}`}</SvgText>
      </SvgText>
      {/* 통계 그리드 */}
      {stats.map((st, i) => (
        <G key={st.k}>
          <SvgText x={left + slot * i} y={770} fill={T1} fontFamily={DISPLAY} fontSize={64} fontWeight="800">
            {st.v}
          </SvgText>
          <SvgText x={left + slot * i} y={812} fill={T3} fontFamily={FONT} fontSize={26} fontWeight="700" letterSpacing={3}>
            {st.k}
          </SvgText>
        </G>
      ))}
      <SvgText x={left} y={880} fill={T2} fontFamily={FONT} fontSize={30} fontWeight="700" letterSpacing={2}>
        {model.dateRange}
      </SvgText>
      {/* 등급 배지(은은) */}
      <GradeBadge model={model} x={left} y={935} anchor="start" />
      {/* 푸터: MISSION COMPLETE + 워드마크 */}
      <Line x1={left} y1={985} x2={CARD_W - PAD} y2={985} stroke={SEP} strokeWidth={2} />
      <SvgText x={left} y={1035} fill={ACCENT} fontFamily={FONT} fontSize={36} fontWeight="800" letterSpacing={5}>
        {model.missionA}
      </SvgText>
      <Wordmark model={model} x={CARD_W - PAD} y={1025} anchor="end" />
    </G>
  );
}

// ── B · Modern premium ──────────────────────────────────────────────────────────
function FormatB({model}: {model: RetirementCardModel}) {
  const cells: {v: string; k: string; acc?: boolean}[] = [
    {v: model.runCountLabel, k: 'RUNS'},
    {v: model.pbLabel ?? '×0', k: 'PERSONAL BEST', acc: true},
    {v: model.longestRun ?? '--', k: 'LONGEST RUN'},
  ];
  const innerW = CARD_W - PAD * 2;
  const slot = innerW / 3;
  return (
    <G>
      <SvgText x={CX} y={250} fill={ACCENT} fontFamily={FONT} fontSize={28} fontWeight="700" letterSpacing={9} textAnchor="middle">
        {model.eyebrowB.toUpperCase()}
      </SvgText>
      {/* 모델명(가는 굵기) */}
      <SvgText x={CX} y={360} fill={T1} fontFamily={FONT} fontSize={80} fontWeight="400" textAnchor="middle">
        {model.shoeName}
      </SvgText>
      <SvgText x={CX} y={420} fill={T3} fontFamily={FONT} fontSize={34} textAnchor="middle">
        {model.togetherEn}
      </SvgText>
      <GradeBadge model={model} x={CX} y={500} />
      <Line x1={PAD + 40} y1={580} x2={CARD_W - PAD - 40} y2={580} stroke={SEP} strokeWidth={2} />
      {/* 3 셀 */}
      {cells.map((c, i) => {
        const cx = PAD + slot * i + slot / 2;
        return (
          <G key={c.k}>
            <SvgText x={cx} y={700} fill={c.acc ? ACCENT : T1} fontFamily={DISPLAY} fontSize={62} fontWeight="600" textAnchor="middle">
              {c.v}
            </SvgText>
            <SvgText x={cx} y={744} fill={T3} fontFamily={FONT} fontSize={24} letterSpacing={3} textAnchor="middle">
              {c.k}
            </SvgText>
            {i > 0 && <Line x1={PAD + slot * i} y1={660} x2={PAD + slot * i} y2={750} stroke={SEP} strokeWidth={2} />}
          </G>
        );
      })}
      <Line x1={PAD + 40} y1={800} x2={CARD_W - PAD - 40} y2={800} stroke={SEP} strokeWidth={2} />
      {/* 날짜(세로) */}
      <SvgText x={CX} y={880} fill={T2} fontFamily={FONT} fontSize={38} fontWeight="500" textAnchor="middle">
        {model.startMonth || model.startDate}
      </SvgText>
      <SvgText x={CX} y={925} fill={ACCENT} fontFamily={FONT} fontSize={34} textAnchor="middle">
        ↓
      </SvgText>
      <SvgText x={CX} y={970} fill={T2} fontFamily={FONT} fontSize={38} fontWeight="500" textAnchor="middle">
        {model.endMonth || model.endDate}
      </SvgText>
      <Wordmark model={model} x={CX} y={1030} />
    </G>
  );
}

// ── C · Apple / 한국어 감성(기본) ────────────────────────────────────────────────
function FormatC({model}: {model: RetirementCardModel}) {
  const meta: string[] = [`${model.runCountLabel}회 러닝`];
  if (model.avgPace) meta.push(`평균 페이스 ${model.avgPace}`);
  if (model.dateRange) meta.push(model.dateRange);
  return (
    <G>
      <GradeBadge model={model} x={CX} y={230} />
      <SvgText x={CX} y={400} fill={T1} fontFamily={FONT} fontSize={68} fontWeight="600" textAnchor="middle">
        {model.shoeName}
      </SvgText>
      <SvgText x={CX} y={480} fill={T2} fontFamily={FONT} fontSize={40} textAnchor="middle">
        <SvgText fill={T1} fontWeight="700">{model.distanceLabel}</SvgText>
        {' 함께했습니다'}
      </SvgText>
      {/* 메타(러닝 수 / 평균 페이스 / 기간) */}
      {meta.map((line, i) => (
        <SvgText key={line + i} x={CX} y={600 + i * 60} fill={T3} fontFamily={FONT} fontSize={32} textAnchor="middle">
          {line}
        </SvgText>
      ))}
      {/* Most Memorable Moment(있으면) */}
      {!!model.mostMemorable && (
        <SvgText x={CX} y={790} fill={T2} fontFamily={FONT} fontSize={30} textAnchor="middle">
          {model.mostMemorable}
        </SvgText>
      )}
      {/* 감성 클로징 */}
      <SvgText x={CX} y={900} fill={T3} fontFamily={FONT} fontSize={32} textAnchor="middle">
        {model.closingTop}
      </SvgText>
      <SvgText x={CX} y={952} fill={ACCENT} fontFamily={FONT} fontSize={44} fontWeight="600" textAnchor="middle">
        {model.closingBottom}
      </SvgText>
      <Wordmark model={model} x={CX} y={1035} />
    </G>
  );
}

// ── D · Hall of Fame(인증서) ─────────────────────────────────────────────────────
function FormatD({model}: {model: RetirementCardModel}) {
  const gold = TIER_COLORS.gold;
  const stats: {v: string; k: string; acc?: boolean}[] = [
    {v: model.runCountLabel, k: 'RUNS'},
    {v: model.pbLabel ?? '×0', k: 'PB', acc: true},
    {v: model.longestRun ?? '--', k: `LONGEST ${model.unit.toUpperCase()}`},
  ];
  const slot = (CARD_W - PAD * 2) / 3;
  return (
    <G>
      <Defs>
        <LinearGradient id="hofKm" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={gold} />
          <Stop offset="1" stopColor={ACCENT} />
        </LinearGradient>
      </Defs>
      {/* 인증서 이중 프레임 */}
      <Rect x={40} y={40} width={CARD_W - 80} height={CARD_H - 80} rx={40} fill="none" stroke={withAlpha(gold, 0.5)} strokeWidth={3} />
      <Rect x={58} y={58} width={CARD_W - 116} height={CARD_H - 116} rx={30} fill="none" stroke={withAlpha(ACCENT, 0.3)} strokeWidth={2} />
      <SvgText x={CX} y={185} fill={gold} fontFamily={FONT} fontSize={40} fontWeight="800" letterSpacing={14} textAnchor="middle">
        RETIRED
      </SvgText>
      <SvgText x={CX} y={245} fill={gold} fontFamily={FONT} fontSize={30} letterSpacing={10} textAnchor="middle">
        🌿 ★ 🌿
      </SvgText>
      <SvgText x={CX} y={345} fill={T1} fontFamily={FONT} fontSize={80} textAnchor="middle">
        👟
      </SvgText>
      <SvgText x={CX} y={425} fill={T1} fontFamily={FONT} fontSize={56} fontWeight="800" textAnchor="middle">
        {model.shoeName}
      </SvgText>
      {/* 거리(골드→오렌지 그라데이션) */}
      <SvgText x={CX} y={560} fill="url(#hofKm)" fontFamily={DISPLAY} fontSize={130} fontWeight="800" letterSpacing={-6} textAnchor="middle">
        {model.distance}
        <SvgText fontSize={56}>{model.unit}</SvgText>
      </SvgText>
      {/* 통계 */}
      {stats.map((st, i) => {
        const cx = PAD + slot * i + slot / 2;
        return (
          <G key={st.k}>
            <SvgText x={cx} y={665} fill={st.acc ? gold : T1} fontFamily={DISPLAY} fontSize={52} fontWeight="800" textAnchor="middle">
              {st.v}
            </SvgText>
            <SvgText x={cx} y={705} fill={T3} fontFamily={FONT} fontSize={24} letterSpacing={3} textAnchor="middle">
              {st.k}
            </SvgText>
          </G>
        );
      })}
      {/* Shoe Score 배지 */}
      <Rect x={CX - 170} y={760} width={340} height={70} rx={35} fill={withAlpha(gold, 0.1)} stroke={withAlpha(gold, 0.45)} strokeWidth={2} />
      <SvgText x={CX - 130} y={805} fill={gold} fontFamily={FONT} fontSize={26} fontWeight="700" letterSpacing={3}>
        SHOE SCORE
      </SvgText>
      <SvgText x={CX + 130} y={808} fill={T1} fontFamily={DISPLAY} fontSize={48} fontWeight="800" textAnchor="end">
        {model.shoeScore}
      </SvgText>
      {/* 등급 배지 */}
      <GradeBadge model={model} x={CX} y={895} />
      <SvgText x={CX} y={975} fill={T3} fontFamily={FONT} fontSize={30} fontWeight="800" letterSpacing={6} textAnchor="middle">
        {`CLASS OF `}
        <SvgText fill={gold}>{model.retireYear ? String(model.retireYear) : '—'}</SvgText>
      </SvgText>
      <Wordmark model={model} x={CX} y={1035} />
    </G>
  );
}

const LAYOUTS: Record<RetirementCardFormat, (p: {model: RetirementCardModel}) => React.JSX.Element> = {
  A: FormatA,
  B: FormatB,
  C: FormatC,
  D: FormatD,
};

const RetirementCard = React.forwardRef<unknown, RetirementCardProps>(
  ({model, format = DEFAULT_RETIREMENT_CARD_FORMAT}, ref) => {
    const fmt: RetirementCardFormat = LAYOUTS[format] ? format : DEFAULT_RETIREMENT_CARD_FORMAT;
    const Layout = LAYOUTS[fmt];
    // 포맷별 배경 — D 는 골드 음영, 그 외는 카드 토큰.
    const bgFill = fmt === 'D' ? CARD_DIM : fmt === 'A' ? BG : CARD;
    return (
      <Svg ref={ref as never} width={CARD_W} height={CARD_H}>
        <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill={BG} />
        <Rect
          x={PAD / 2}
          y={PAD / 2}
          width={CARD_W - PAD}
          height={CARD_H - PAD}
          rx={56}
          fill={bgFill}
          stroke={SEP}
          strokeWidth={2}
        />
        <Layout model={model} />
      </Svg>
    );
  },
);

RetirementCard.displayName = 'RetirementCard';

export default RetirementCard;
