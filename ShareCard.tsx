// ============================================================================
// ShareCard.tsx — 런 기록 공유 카드(이미지) · 컴팩트 스티커(스트라바 방식)
// ----------------------------------------------------------------------------
// 배치는 순수 함수 layoutShareCard 가 계산한다(지도+지표+keego 딱 붙은 한 덩어리, 캔버스
// 높이=내용에 맞춤). 여기선 그 결과를 SVG 로 그린다. 기본은 투명 스티커 — 러너가 인스타에
// 자기 사진을 올리고 그 위 일부에 얹어 크기를 조절한다. 지도·로고는 항상 파파야, 흰 지표엔
// 수동 그림자(사진 위 가독성). background=dark/photo 는 인스타 안 거치는 완성본용.
// react-native-svg 만으로 그려 ref.toDataURL()로 캡처(네이티브 0).
// ============================================================================
import React from 'react';
import Svg, {Rect, Path, Circle, Text as SvgText, G, Image as SvgImage, Defs, RadialGradient, LinearGradient, Stop} from 'react-native-svg';
import {T1, RING_ACCENT, BG} from './theme';
import {WORDMARK_FONT} from './primitives';
const CF = WORDMARK_FONT;
import {projectRoute, LatLon, ScreenPoint} from './lib/route';
import {
  ShareCardModel,
  layoutShareCard,
  type RunCardLayout,
  type RunCardBackground,
  type CardText,
} from './lib/shareCard';

function pointsToPath(points: ScreenPoint[]): string {
  if (points.length < 2) return '';
  const r = (n: number) => Math.round(n * 100) / 100;
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)},${r(p.y)}`).join(' ');
}

// 사진 위 가독성용 텍스트 — 어두운 복사본을 뒤에 오프셋(수동 그림자, react-native-svg 필터
// 불안정 회피). 다크 배경에선 그림자가 안 보여 무해. 원본을 위에 그린다.
function Txt({t, fill}: {t: CardText; fill: string}) {
  const dy = Math.max(2, Math.round(t.size * 0.04));
  return (
    <>
      <SvgText x={t.x + 2} y={t.y + dy} fill="#08090C" fillOpacity={0.45} fontFamily={CF} fontSize={t.size} fontWeight={t.weight} letterSpacing={t.ls} textAnchor={t.anchor}>{t.value}</SvgText>
      <SvgText x={t.x} y={t.y} fill={fill} fillOpacity={t.opacity} fontFamily={CF} fontSize={t.size} fontWeight={t.weight} letterSpacing={t.ls} textAnchor={t.anchor}>{t.value}</SvgText>
    </>
  );
}

export interface ShareCardProps {
  model: ShareCardModel;
  route?: LatLon[];
  photoUri?: string | null;
  layout?: RunCardLayout;
  showMap?: boolean;
  showStats?: boolean;
  background?: RunCardBackground;
  textScale?: number;
  mapScale?: number;
  /** 표시 폭(미리보기용) — 지정 시 축소 렌더(viewBox). 미지정=실제 캔버스(고해상 캡처). */
  displayWidth?: number;
}

const ShareCard = React.forwardRef<unknown, ShareCardProps>((props, ref) => {
  const {
    model, route = [], photoUri = null,
    layout = 'vertical', showMap = true, showStats = true,
    background = 'transparent', textScale = 1, mapScale = 1, displayWidth,
  } = props;

  const L = layoutShareCard(model, {layout, showMap, showStats, textScale, mapScale});
  const W = L.w, H = L.h;
  const dispW = displayWidth && displayWidth > 0 ? Math.round(displayWidth) : W;
  const dispH = Math.round((dispW * H) / W);

  const isPhoto = !!photoUri;
  const isDark = background === 'dark' && !isPhoto;
  const routeColor = RING_ACCENT;
  const ink = T1;

  // 지도(경로) — 컴팩트 박스 안에 투영.
  const box = L.map ? L.map.size : 0;
  const proj = L.map ? projectRoute(route, {width: box, height: box, padding: Math.round(box * 0.1)}) : {points: [] as ScreenPoint[]};
  const pathD = pointsToPath(proj.points);
  const hasMap = !!L.map && pathD !== '';
  const start = proj.points[0];
  const end = proj.points[proj.points.length - 1];
  const mk = (n: number) => Math.max(1, Math.round(n * (box / 600)));

  return (
    <Svg ref={ref as never} width={dispW} height={dispH} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <RadialGradient id="kg-dark" cx="50%" cy="18%" r="110%">
          <Stop offset="0" stopColor="#17110B" /><Stop offset="0.55" stopColor="#0B0B0C" /><Stop offset="1" stopColor="#070707" />
        </RadialGradient>
        <LinearGradient id="kg-route" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFB458" /><Stop offset="1" stopColor="#E56600" />
        </LinearGradient>
      </Defs>

      {isDark && <Rect x={0} y={0} width={W} height={H} fill="url(#kg-dark)" />}
      {isPhoto && (
        <G>
          <SvgImage href={{uri: photoUri as string}} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
          <Rect x={0} y={0} width={W} height={H} fill={BG} fillOpacity={0.34} />
        </G>
      )}

      {/* 지도(경로) — 항상 파파야, 다크만 그라데이션 */}
      {hasMap && L.map && (
        <G transform={`translate(${L.map.x}, ${L.map.y})`}>
          <Path d={pathD} fill="none" stroke={routeColor} strokeOpacity={0.16} strokeWidth={mk(16)} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={pathD} fill="none" stroke={isDark ? 'url(#kg-route)' : routeColor} strokeWidth={mk(7)} strokeLinecap="round" strokeLinejoin="round" />
          {!!end && <Circle cx={end.x} cy={end.y} r={mk(9)} fill={routeColor} />}
          {!!start && <Circle cx={start.x} cy={start.y} r={mk(12)} fill={ink} stroke={routeColor} strokeWidth={mk(5)} />}
        </G>
      )}

      {/* 지표·워드마크 — 흰색(파파야=워드마크), 그림자로 사진 위 가독성 */}
      {L.texts.map((t, i) => (
        <Txt key={i} t={t} fill={t.papaya ? RING_ACCENT : ink} />
      ))}
    </Svg>
  );
});

ShareCard.displayName = 'ShareCard';

export default ShareCard;
