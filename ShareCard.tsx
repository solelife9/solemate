// ============================================================================
// ShareCard.tsx — 런 기록 공유 카드(이미지)
// ----------------------------------------------------------------------------
// 거리/페이스/시간/신발명/미니 코스맵을 react-native-svg만으로 그린 정사각 카드.
// 부모가 넘긴 ref가 내부 <Svg>에 연결되어, 부모는 ref.current.toDataURL()로 PNG
// dataURL을 얻어 공유한다(lib/shareCard captureCardDataUrl). 새 네이티브 의존 0.
//
// 코스 경로는 기존 lib/route projectRoute()를 그대로 재사용하되, CourseMap이 쓰는
// <Polyline>과 달리 <Path>로 그린다 — 한 화면에 둘 다 마운트돼도 폴리라인 카운트가
// 섞이지 않게 하기 위함(렌더 테스트 격리). 색은 theme 토큰만 사용(raw hex 0).
// ============================================================================
import React from 'react';
import Svg, {Rect, Path, Circle, Text as SvgText, G} from 'react-native-svg';
import {BG, CARD, CARD_DIM, ACCENT, T1, T2, T3, SEP, FONT, DISPLAY} from './theme';
import {projectRoute, LatLon, ScreenPoint} from './lib/route';
import {ShareCardModel} from './lib/shareCard';

// 1080×1080 정사각 — SNS 공유에 두루 맞는 픽셀 크기(Svg width/height = 출력 해상도).
export const CARD_W = 1080;
export const CARD_H = 1080;
const PAD = 88;

// 미니 코스맵 영역(카드 하단). projectRoute는 [0,w]×[0,h]로 투영하므로 <G>로 평행이동.
const MAP_X = PAD;
const MAP_W = CARD_W - PAD * 2;
const MAP_H = 300;
const MAP_Y = CARD_H - PAD - MAP_H;
const MAP_PAD = 28;

// projectRoute의 점들을 SVG path d 문자열로(첫 점 M, 이후 L). 빈 경로면 ''.
function pointsToPath(points: ScreenPoint[]): string {
  if (points.length < 2) return '';
  const r = (n: number) => Math.round(n * 100) / 100;
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)},${r(p.y)}`)
    .join(' ');
}

export interface ShareCardProps {
  model: ShareCardModel;
  /** 기록된 GPS 경로(없거나 2점 미만이면 미니맵 생략). */
  route?: LatLon[];
}

const ShareCard = React.forwardRef<unknown, ShareCardProps>(({model, route = []}, ref) => {
  const proj = projectRoute(route, {width: MAP_W, height: MAP_H, padding: MAP_PAD});
  const pathD = pointsToPath(proj.points);
  const start = proj.points[0];
  const end = proj.points[proj.points.length - 1];
  const hasMap = pathD !== '';

  // 부가 지표(페이스/시간) 칸 배치 — 카드 가로를 균등 분할.
  const statY = 712;
  const statSlot = MAP_W / Math.max(model.stats.length, 1);

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

      {/* 날짜 */}
      {!!model.date && (
        <SvgText x={PAD} y={360} fill={T2} fontFamily={FONT} fontSize={34}>
          {model.date}
        </SvgText>
      )}

      {/* 거리(히어로) */}
      <SvgText x={PAD} y={500} fill={T1} fontFamily={DISPLAY} fontSize={184} fontWeight="700">
        {model.distance}
      </SvgText>
      <SvgText x={PAD} y={566} fill={T2} fontFamily={FONT} fontSize={48}>
        {model.unit}
      </SvgText>

      {/* 신발명 */}
      {!!model.shoe && (
        <SvgText x={PAD} y={636} fill={ACCENT} fontFamily={FONT} fontSize={36} fontWeight="600">
          {`👟 ${model.shoe}`}
        </SvgText>
      )}

      {/* 부가 지표(페이스/시간) */}
      {model.stats.map((st, i) => {
        const cx = MAP_X + statSlot * i + statSlot / 2;
        return (
          <G key={st.label}>
            <SvgText x={cx} y={statY} fill={T3} fontFamily={FONT} fontSize={28} textAnchor="middle">
              {st.label}
            </SvgText>
            <SvgText
              x={cx}
              y={statY + 56}
              fill={T1}
              fontFamily={DISPLAY}
              fontSize={56}
              fontWeight="600"
              textAnchor="middle">
              {st.value}
            </SvgText>
          </G>
        );
      })}

      {/* 미니 코스맵(기존 route 폴리라인 재사용 → Path로 렌더) */}
      <Rect x={MAP_X} y={MAP_Y} width={MAP_W} height={MAP_H} rx={36} fill={CARD_DIM} stroke={SEP} strokeWidth={2} />
      {hasMap && (
        <G transform={`translate(${MAP_X}, ${MAP_Y})`}>
          <Path
            d={pathD}
            fill="none"
            stroke={ACCENT}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!!start && <Circle cx={start.x} cy={start.y} r={12} fill={ACCENT} />}
          {!!end && <Circle cx={end.x} cy={end.y} r={12} fill={T1} stroke={ACCENT} strokeWidth={5} />}
        </G>
      )}

      {/* 해시태그 푸터 */}
      <SvgText
        x={CARD_W - PAD}
        y={MAP_Y - 36}
        fill={T3}
        fontFamily={FONT}
        fontSize={28}
        textAnchor="end">
        {model.hashtag}
      </SvgText>
    </Svg>
  );
});

ShareCard.displayName = 'ShareCard';

export default ShareCard;
