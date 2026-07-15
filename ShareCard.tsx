// ============================================================================
// ShareCard.tsx — 런 기록 공유 카드(이미지) · 레이아웃+토글 구동(스트라바 방식)
// ----------------------------------------------------------------------------
// 레이아웃(가로/세로/히어로)만 고르고, 지도·지표는 on/off 토글로 넣었다 뺐다 한다.
// 기본은 '투명 스티커' — 러너가 인스타에 사진을 올리고 그 위에 얹으면 위치·크기는 인스타가
// 처리한다. 지도·로고는 항상 파파야(주황)라 사진 위에서도 브랜드가 또렷하다. background=
// 'dark'=다크 완성본, 'photo'=사진 배경 합성(하단 스크림). 세로/히어로는 하단 좌측 로크업.
//
// 좌표는 SVG 를 PNG 로 렌더해 눈으로 맞춘 값(scratchpad/render-card.mjs). 본문(ShareCardBody)은
// Svg 래퍼 없이 SVG 요소만 반환. react-native-svg 만으로 그려 ref.toDataURL()로 캡처(네이티브 0).
// ============================================================================
import React from 'react';
import Svg, {Rect, Path, Circle, Text as SvgText, G, Image as SvgImage, Defs, RadialGradient, LinearGradient, Stop} from 'react-native-svg';
import {T1, RING_ACCENT, BG} from './theme';
import {WORDMARK_FONT} from './primitives';
const CF = WORDMARK_FONT;
import {projectRoute, LatLon, ScreenPoint} from './lib/route';
import {
  ShareCardModel,
  runCardDimensions,
  runCardElements,
  clampRunCardScale,
  type RunCardLayout,
  type RunCardFormat,
  type RunCardBackground,
} from './lib/shareCard';

function pointsToPath(points: ScreenPoint[]): string {
  if (points.length < 2) return '';
  const r = (n: number) => Math.round(n * 100) / 100;
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)},${r(p.y)}`).join(' ');
}
// 숫자 폭 근사(단위 x 위치용) — 소수점/쉼표는 좁게.
function textWidth(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of String(s)) w += ch === '.' || ch === ',' ? 0.3 : 0.56;
  return Math.round(w * fontSize);
}

// 사진 위 가독성용 텍스트 — 어두운 복사본을 뒤에 오프셋(수동 그림자, react-native-svg 필터
// 불안정 회피). 다크 배경에선 그림자가 안 보여 무해. 원본을 위에 그린다.
function Txt({x, y, size, weight, fill, opacity = 1, anchor = 'start', ls = 0, children}: {
  x: number; y: number; size: number; weight: '500' | '700' | '800'; fill: string;
  opacity?: number; anchor?: 'start' | 'middle' | 'end'; ls?: number; children: React.ReactNode;
}) {
  const dy = Math.max(2, Math.round(size * 0.04));
  return (
    <>
      <SvgText x={x + 2} y={y + dy} fill="#08090C" fillOpacity={0.45} fontFamily={CF} fontSize={size} fontWeight={weight} letterSpacing={ls} textAnchor={anchor}>{children}</SvgText>
      <SvgText x={x} y={y} fill={fill} fillOpacity={opacity} fontFamily={CF} fontSize={size} fontWeight={weight} letterSpacing={ls} textAnchor={anchor}>{children}</SvgText>
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
  format?: RunCardFormat;
  background?: RunCardBackground;
  textScale?: number;
  mapScale?: number;
  displayWidth?: number;
}

export function ShareCardBody({
  model,
  route = [],
  photoUri = null,
  layout = 'classic',
  showMap = true,
  showStats = true,
  format = 'feed',
  background = 'transparent',
  textScale = 1,
  mapScale = 1,
}: Omit<ShareCardProps, 'displayWidth'>) {
  const {w: W, h: H} = runCardDimensions(format);
  const el = runCardElements(layout, showMap, showStats);
  const tScale = clampRunCardScale(textScale);
  const mScale = clampRunCardScale(mapScale);

  const isPhoto = !!photoUri;
  const isDark = background === 'dark' && !isPhoto;
  // 지도·로고는 항상 파파야(사진 위 가독성+브랜드). 지표 글씨는 흰색.
  const routeSolid = RING_ACCENT;
  const wordmarkColor = RING_ACCENT;
  const ink = T1;
  const PADX = 72;

  const statCells = [
    ...(el.includeDistanceInRow ? [{label: 'DISTANCE', value: `${model.distance} ${model.unit}`}] : []),
    ...(el.showStatsRow ? model.stats : []),
  ];

  // 지도 박스 — 가로는 중앙 큰 정사각, 세로/히어로는 우상단 작은 경로.
  let mapBox = 0, mapX = 0, mapY = 0;
  if (el.map && !el.bigDistance) {
    mapBox = Math.round(560 * mScale);
    mapX = Math.round((W - mapBox) / 2);
    mapY = 250;
  } else if (el.map && el.bigDistance) {
    mapBox = Math.round(W * 0.34 * mScale);
    mapX = Math.round(W - PADX - mapBox);
    mapY = 150;
  }
  const proj = el.map ? projectRoute(route, {width: Math.max(1, mapBox), height: Math.max(1, mapBox), padding: Math.round(mapBox * 0.1)}) : {points: [] as ScreenPoint[]};
  const pathD = pointsToPath(proj.points);
  const hasMap = el.map && mapBox > 0 && pathD !== '';
  const start = proj.points[0];
  const end = proj.points[proj.points.length - 1];
  const mk = (n: number) => Math.max(1, Math.round(n * (mapBox / 600)));

  const shoeSize = Math.round(34 * tScale);

  return (
    <>
      <Defs>
        <RadialGradient id="kg-dark" cx="50%" cy="12%" r="95%">
          <Stop offset="0" stopColor="#17110B" /><Stop offset="0.55" stopColor="#0B0B0C" /><Stop offset="1" stopColor="#070707" />
        </RadialGradient>
        <LinearGradient id="kg-route" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFB458" /><Stop offset="1" stopColor="#E56600" />
        </LinearGradient>
        <LinearGradient id="kg-scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#08090C" stopOpacity="0" /><Stop offset="1" stopColor="#08090C" stopOpacity="0.86" />
        </LinearGradient>
      </Defs>

      {isDark && <Rect x={0} y={0} width={W} height={H} fill="url(#kg-dark)" />}
      {isPhoto && (
        <G>
          <SvgImage href={{uri: photoUri as string}} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
          <Rect x={0} y={0} width={W} height={Math.round(H * 0.18)} fill={BG} fillOpacity={0.26} />
          <Rect x={0} y={Math.round(H * 0.42)} width={W} height={Math.round(H * 0.58)} fill="url(#kg-scrim)" />
        </G>
      )}

      {/* 신발명 좌상단 */}
      {!!model.shoe && (
        <Txt x={PADX} y={112} size={shoeSize} weight="700" fill={ink} opacity={0.95}>{model.shoe}</Txt>
      )}

      {/* 지도(경로) — 항상 파파야, 다크만 그라데이션 */}
      {hasMap && (
        <G transform={`translate(${mapX}, ${mapY})`}>
          <Path d={pathD} fill="none" stroke={routeSolid} strokeOpacity={0.16} strokeWidth={mk(16)} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={pathD} fill="none" stroke={isDark ? 'url(#kg-route)' : routeSolid} strokeWidth={mk(7)} strokeLinecap="round" strokeLinejoin="round" />
          {!!end && <Circle cx={end.x} cy={end.y} r={mk(9)} fill={routeSolid} />}
          {!!start && <Circle cx={start.x} cy={start.y} r={mk(12)} fill={ink} stroke={routeSolid} strokeWidth={mk(5)} />}
        </G>
      )}

      {/* ── 가로(classic): 중앙 지도 + 하단 가로 스탯(라벨 위·값 아래) ── */}
      {!el.bigDistance && statCells.length > 0 && (() => {
        const valueY = Math.round(950 * 1);
        const labelY = valueY - Math.round(66 * tScale);
        const span = W * 0.86;
        const x0 = (W - span) / 2;
        const slot = span / statCells.length;
        return statCells.map((sc, i) => {
          const cx = x0 + slot * i + slot / 2;
          return (
            <G key={sc.label}>
              <Txt x={cx} y={labelY} size={Math.round(31 * tScale)} weight="700" fill={ink} opacity={0.85} anchor="middle" ls={2}>{sc.label.toUpperCase()}</Txt>
              <Txt x={cx} y={valueY} size={Math.round(62 * tScale)} weight="800" fill={ink} anchor="middle" ls={-0.5}>{sc.value}</Txt>
            </G>
          );
        });
      })()}

      {/* ── 세로·히어로: 하단 좌측 로크업 — 파파야 라인 + 거대 거리 + 세로 스탯(라벨 위·값 아래) ── */}
      {el.bigDistance && (() => {
        const heroV = Math.round((layout === 'hero' ? 220 : 168) * tScale);
        const valSize = Math.round(60 * tScale);
        const labSize = Math.round(27 * tScale);
        const cells = el.showStatsRow ? model.stats : [];
        const els: React.ReactNode[] = [];
        // 아래에서 위로: 스탯(TIME→PACE) 값·라벨.
        let y = H - Math.round(175 * tScale);
        for (let i = cells.length - 1; i >= 0; i--) {
          const vy = y, ly = y - valSize - Math.round(16 * tScale);
          els.push(<Txt key={`v${i}`} x={PADX} y={vy} size={valSize} weight="800" fill={ink} ls={-0.5}>{cells[i].value}</Txt>);
          els.push(<Txt key={`l${i}`} x={PADX + 2} y={ly} size={labSize} weight="700" fill={ink} opacity={0.75} ls={2}>{cells[i].label.toUpperCase()}</Txt>);
          y = y - valSize - Math.round(16 * tScale) - labSize - Math.round(46 * tScale);
        }
        // 거대 거리
        const distBaseY = y;
        const distLabelY = distBaseY - Math.round(heroV * 0.72) - Math.round(22 * tScale);
        const accentY = distLabelY - Math.round(40 * tScale) - Math.round(11 * tScale);
        const dw = textWidth(model.distance, heroV);
        els.push(<Rect key="acc" x={PADX} y={accentY} width={Math.round(104 * tScale)} height={Math.round(12 * tScale)} rx={Math.round(5 * tScale)} fill={RING_ACCENT} />);
        els.push(<Txt key="dl" x={PADX + 2} y={distLabelY} size={Math.round(30 * tScale)} weight="700" fill={ink} opacity={0.75} ls={2}>DISTANCE</Txt>);
        els.push(<Txt key="dv" x={PADX} y={distBaseY} size={heroV} weight="800" fill={ink} ls={-3}>{model.distance}</Txt>);
        els.push(<Txt key="du" x={PADX + dw + Math.round(18 * tScale)} y={distBaseY} size={Math.round(52 * tScale)} weight="700" fill={ink} opacity={0.8}>{model.unit}</Txt>);
        return <G>{els}</G>;
      })()}

      {/* 워드마크 — 세로/히어로는 우하단, 가로는 하단 중앙. 항상 파파야. */}
      {el.bigDistance ? (
        <Txt x={W - PADX} y={H - Math.round(90 * tScale)} size={Math.round(58 * tScale)} weight="500" fill={wordmarkColor} anchor="end" ls={-0.5}>{model.brand.toLowerCase()}</Txt>
      ) : (
        <Txt x={W / 2} y={1120} size={Math.round(58 * tScale)} weight="500" fill={wordmarkColor} anchor="middle" ls={-0.5}>{model.brand.toLowerCase()}</Txt>
      )}
    </>
  );
}

const ShareCard = React.forwardRef<unknown, ShareCardProps>((props, ref) => {
  const {format = 'feed', displayWidth} = props;
  const {w: W, h: H} = runCardDimensions(format);
  const dispW = displayWidth && displayWidth > 0 ? Math.round(displayWidth) : W;
  const dispH = Math.round((dispW * H) / W);
  return (
    <Svg ref={ref as never} width={dispW} height={dispH} viewBox={`0 0 ${W} ${H}`}>
      <ShareCardBody {...props} />
    </Svg>
  );
});

ShareCard.displayName = 'ShareCard';

export default ShareCard;
