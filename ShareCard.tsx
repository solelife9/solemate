// ============================================================================
// ShareCard.tsx — 런 기록 공유 카드(이미지) · 템플릿 구동(선택기·에디터 공용)
// ----------------------------------------------------------------------------
// 사용자는 공유 시 여러 템플릿을 넘겨보며 고른다(lib/shareCard 의 registry가 단일 진실원).
// 기본은 '투명 스티커'(배경 없음) — 러너가 인스타에 자기 사진을 올린 뒤 그 위에 이 카드를
// 얹어 크기를 조절한다. background='dark' 면 다크+파파야 경로의 '완성본'(카톡 등 직접 공유용).
// photoUri 가 오면(리캡 '오늘의 한 컷' 완성본) 사진을 배경으로 깐다.
//
// 카드 본문(ShareCardBody)은 Svg 래퍼 없이 SVG 요소만 반환 — 에디터(ShareCardEditor)가
// 사진 위에 카드를 임의 위치·크기로 합성해 캡처할 때 <G transform> 안에 그대로 재사용한다.
// react-native-svg 만으로 그려 부모가 ref.toDataURL()로 PNG 를 얻어 공유한다(네이티브 0).
// ============================================================================
import React from 'react';
import Svg, {Rect, Path, Circle, Text as SvgText, G, Image as SvgImage, Defs, RadialGradient, Stop, LinearGradient} from 'react-native-svg';
import {ACCENT, T1, RING_ACCENT, BG} from './theme';
import {WORDMARK_FONT} from './primitives';
const CF = WORDMARK_FONT;
import {projectRoute, LatLon, ScreenPoint} from './lib/route';
import {
  ShareCardModel,
  runCardDimensions,
  runCardElements,
  clampRunCardScale,
  type RunCardTemplate,
  type RunCardFormat,
  type RunCardBackground,
} from './lib/shareCard';

function pointsToPath(points: ScreenPoint[]): string {
  if (points.length < 2) return '';
  const r = (n: number) => Math.round(n * 100) / 100;
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)},${r(p.y)}`).join(' ');
}

export interface ShareCardProps {
  model: ShareCardModel;
  /** 기록된 GPS 경로(없거나 2점 미만이면 경로 생략). */
  route?: LatLon[];
  /** 완성본(리캡 '오늘의 한 컷') — 있으면 사진을 배경으로 깔고 스탯을 얹는다. */
  photoUri?: string | null;
  /** 담을 요소(지도·지표·히어로). 기본 클래식(지도+D/P/T). */
  template?: RunCardTemplate;
  /** 피드(4:5) / 세로형 스토리(9:16). 기본 피드. */
  format?: RunCardFormat;
  /** 투명(기본, 사진 위 오버레이) / 다크(완성본) / 사진. photoUri 없으면 photo=투명 취급. */
  background?: RunCardBackground;
  /** 글씨 크기 배율(사용자 조절). */
  textScale?: number;
  /** 지도 크기 배율(사용자 조절). */
  mapScale?: number;
  /** 표시 폭(미리보기용) — 지정 시 viewBox로 축소 렌더. 미지정=실제 캔버스(캡처용 고해상). */
  displayWidth?: number;
}

/** 카드 SVG 캔버스 크기(polyfill 편의). 에디터가 배치 계산에 쓴다. */
export function shareCardCanvas(format: RunCardFormat = 'feed'): {w: number; h: number} {
  return runCardDimensions(format);
}

/**
 * 카드 본문 — Svg 래퍼 없이 SVG 요소(Defs + 레이어)만 반환. ShareCard 는 이걸 <Svg>로 감싸고,
 * ShareCardEditor 는 <G transform> 안에 넣어 사진 위에 임의 위치·크기로 합성한다.
 * 배경(다크/사진)도 여기서 그린다 — 단, 에디터에서 카드를 '스티커'로 얹을 땐 투명으로 쓴다.
 */
export function ShareCardBody({
  model,
  route = [],
  photoUri = null,
  template = 'classic',
  format = 'feed',
  background = 'transparent',
  textScale = 1,
  mapScale = 1,
}: Omit<ShareCardProps, 'displayWidth'>) {
  const {w: W, h: H} = runCardDimensions(format);
  const el = runCardElements(template);
  const tScale = clampRunCardScale(textScale);
  const mScale = clampRunCardScale(mapScale);

  const isPhoto = !!photoUri;
  const isDark = background === 'dark' && !isPhoto;
  const routeColor = isDark ? RING_ACCENT : ACCENT;
  const wordmarkColor = isDark ? RING_ACCENT : T1;
  const ink = T1;

  const PADX = 72;
  const shoeY = Math.round(H * 0.085);
  const wordmarkY = Math.round(H - H * 0.07);
  const statsValueY = Math.round(H - H * 0.115);
  const statsLabelY = statsValueY - Math.round(70 * tScale);
  const heroBaselineY = el.map ? Math.round(H * 0.30) : Math.round(H * 0.46);

  const mapTop = el.heroDistance ? Math.round(H * 0.36) : Math.round(H * 0.15);
  const mapBottom = el.statsRow ? statsLabelY - Math.round(H * 0.03) : wordmarkY - Math.round(H * 0.04);
  const availH = Math.max(0, mapBottom - mapTop);
  const boxBase = Math.min(W - PADX * 2, availH);
  const box = Math.max(220, Math.round(boxBase * mScale));
  const mapX = Math.round((W - box) / 2);
  const mapY = Math.round(mapTop + (availH - box) / 2);

  const proj = el.map ? projectRoute(route, {width: box, height: box, padding: Math.round(box * 0.13)}) : {points: [] as ScreenPoint[]};
  const pathD = pointsToPath(proj.points);
  const hasMap = el.map && pathD !== '';
  const start = proj.points[0];
  const end = proj.points[proj.points.length - 1];

  const statCells = [
    ...(el.statsIncludeDistance ? [{label: 'DISTANCE', value: `${model.distance} ${model.unit}`}] : []),
    ...model.stats,
  ];
  const span = W * 0.86;
  const x0 = (W - span) / 2;
  const slot = statCells.length > 0 ? span / statCells.length : span;

  const finishFlag = (cx: number, cy: number) => {
    const u = Math.round(8 * (box / 600));
    const cols = 5, rows = 3;
    const ox = cx - (cols * u) / 2;
    const oy = cy - (rows * u) / 2;
    const cells: React.ReactNode[] = [];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if ((gx + gy) % 2 === 0) {
          cells.push(<Rect key={`${gx}-${gy}`} x={ox + gx * u} y={oy + gy * u} width={u} height={u} fill={routeColor} />);
        }
      }
    }
    return <G>{cells}</G>;
  };

  const heroSize = Math.round((el.map ? 150 : 200) * tScale);
  const heroUnitSize = Math.round(52 * tScale);
  const shoeSize = Math.round(36 * tScale);
  const statLabelSize = Math.round(31 * tScale);
  const statValueSize = Math.round(64 * tScale);
  const wordmarkSize = Math.round(62 * tScale);

  return (
    <>
      <Defs>
        <RadialGradient id="kg-dark" cx="50%" cy="12%" r="95%">
          <Stop offset="0" stopColor="#17110B" />
          <Stop offset="0.55" stopColor="#0B0B0C" />
          <Stop offset="1" stopColor="#070707" />
        </RadialGradient>
        <LinearGradient id="kg-route" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFB458" />
          <Stop offset="1" stopColor="#E56600" />
        </LinearGradient>
      </Defs>

      {isDark && <Rect x={0} y={0} width={W} height={H} fill="url(#kg-dark)" />}
      {isPhoto && (
        <G>
          <SvgImage href={{uri: photoUri as string}} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
          <Rect x={0} y={0} width={W} height={Math.round(H * 0.16)} fill={BG} fillOpacity={0.25} />
          <Rect x={0} y={H - Math.round(H * 0.42)} width={W} height={Math.round(H * 0.42)} fill={BG} fillOpacity={0.4} />
        </G>
      )}

      {!!model.shoe && (
        <SvgText x={PADX} y={shoeY} fill={ink} fillOpacity={0.92} fontFamily={CF} fontSize={shoeSize} fontWeight="700">
          {model.shoe}
        </SvgText>
      )}

      {el.heroDistance && (
        <G>
          <SvgText x={PADX} y={heroBaselineY} fill={ink} fontFamily={CF} fontSize={heroSize} fontWeight="800" letterSpacing={-4}>
            {model.distance}
          </SvgText>
          <SvgText x={PADX + 8} y={heroBaselineY + Math.round(heroUnitSize * 0.9)} fill={ink} fillOpacity={0.7} fontFamily={CF} fontSize={heroUnitSize} fontWeight="700">
            {model.unit}
          </SvgText>
        </G>
      )}

      {hasMap && (
        <G transform={`translate(${mapX}, ${mapY})`}>
          <Path d={pathD} fill="none" stroke={routeColor} strokeOpacity={0.14} strokeWidth={Math.round(16 * (box / 600))} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={pathD} fill="none" stroke={isDark ? 'url(#kg-route)' : routeColor} strokeWidth={Math.round(7 * (box / 600))} strokeLinecap="round" strokeLinejoin="round" />
          {!!end && <Circle cx={end.x} cy={end.y} r={Math.round(9 * (box / 600))} fill={routeColor} />}
          {!!start && (
            <G>
              <Circle cx={start.x} cy={start.y} r={Math.round(12 * (box / 600))} fill={ink} stroke={routeColor} strokeWidth={Math.round(5 * (box / 600))} />
              {finishFlag(start.x + Math.round(42 * (box / 600)), start.y - Math.round(28 * (box / 600)))}
              <SvgText x={start.x - Math.round(6 * (box / 600))} y={start.y - Math.round(24 * (box / 600))} fill={ink} fillOpacity={0.9} fontFamily={CF} fontSize={Math.round(26 * (box / 600))} fontWeight="700" letterSpacing={3} textAnchor="end">
                START
              </SvgText>
            </G>
          )}
        </G>
      )}

      {el.statsRow && statCells.map((sc, i) => {
        const cx = x0 + slot * i + slot / 2;
        return (
          <G key={sc.label}>
            <SvgText x={cx} y={statsLabelY} fill={ink} fillOpacity={0.85} fontFamily={CF} fontSize={statLabelSize} fontWeight="700" letterSpacing={2} textAnchor="middle">
              {sc.label.toUpperCase()}
            </SvgText>
            <SvgText x={cx} y={statsValueY} fill={ink} fontFamily={CF} fontSize={statValueSize} fontWeight="800" letterSpacing={-0.5} textAnchor="middle">
              {sc.value}
            </SvgText>
          </G>
        );
      })}

      <SvgText x={W / 2} y={wordmarkY} fill={wordmarkColor} fontFamily={CF} fontWeight="500" fontSize={wordmarkSize} letterSpacing={-0.5} textAnchor="middle">
        {model.brand.toLowerCase()}
      </SvgText>
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
