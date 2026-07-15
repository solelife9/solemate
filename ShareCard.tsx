// ============================================================================
// ShareCard.tsx — 런 기록 공유 카드(이미지) · 레이아웃+토글 구동(스트라바 방식)
// ----------------------------------------------------------------------------
// 레이아웃(가로/세로/히어로)만 고르고, 지도·지표는 on/off 토글로 넣었다 뺐다 한다.
// 기본은 '투명 스티커'(배경 없음) — 러너가 인스타에 자기 사진을 올리고 그 위에 얹으면
// 위치·크기는 인스타가 처리한다. background='dark'=다크 완성본, 'photo'=사진 배경 합성.
// 세로형은 스트라바처럼 하단에 지표를 세로로 통합(사진이면 스크림 위)한다.
//
// 카드 본문(ShareCardBody)은 Svg 래퍼 없이 SVG 요소만 반환 — 필요 시 다른 합성에 재사용.
// react-native-svg 만으로 그려 부모가 ref.toDataURL()로 PNG 를 얻어 공유한다(네이티브 0).
// ============================================================================
import React from 'react';
import Svg, {Rect, Path, Circle, Text as SvgText, G, Image as SvgImage, Defs, RadialGradient, LinearGradient, Stop} from 'react-native-svg';
import {ACCENT, T1, RING_ACCENT, BG} from './theme';
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

export interface ShareCardProps {
  model: ShareCardModel;
  /** 기록된 GPS 경로(없거나 2점 미만이면 경로 생략). */
  route?: LatLon[];
  /** 사진 배경(완성본) — 있으면 사진을 깔고 하단 스크림 위에 지표를 얹는다. */
  photoUri?: string | null;
  /** 지표 배치: 가로(classic)/세로(vertical)/히어로. 기본 classic. */
  layout?: RunCardLayout;
  /** 지도(경로) 표시. 기본 true. */
  showMap?: boolean;
  /** 지표(페이스·시간) 표시. 기본 true. */
  showStats?: boolean;
  /** 피드(4:5) 고정. */
  format?: RunCardFormat;
  /** 투명(기본, 사진 위 오버레이) / 다크(완성본) / 사진. */
  background?: RunCardBackground;
  /** 글씨 크기 배율. */
  textScale?: number;
  /** 지도 크기 배율. */
  mapScale?: number;
  /** 표시 폭(미리보기용) — 지정 시 viewBox로 축소 렌더. */
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
  const routeColor = isDark ? RING_ACCENT : ACCENT;
  const wordmarkColor = isDark ? RING_ACCENT : T1;
  const ink = T1;
  const PADX = 72;

  // 스탯 셀(페이스·시간 등). 가로+지표on 이면 맨 앞에 DISTANCE 를 끼운다.
  const statCells = [
    ...(el.includeDistanceInRow ? [{label: 'DISTANCE', value: `${model.distance} ${model.unit}`}] : []),
    ...(el.showStatsRow ? model.stats : []),
  ];

  // 지도 박스 — 세로/히어로는 우상단 작은 경로, 가로는 중앙 큰 경로.
  const mapForClassic = el.map && !el.bigDistance;
  const mapCorner = el.map && el.bigDistance;
  let mapBox = 0, mapX = 0, mapY = 0;
  if (mapForClassic) {
    // 가로: 상단~중앙 큰 정사각.
    mapBox = Math.round(Math.min(W - PADX * 2, H * 0.42) * mScale);
    mapX = Math.round((W - mapBox) / 2);
    mapY = Math.round(H * 0.16);
  } else if (mapCorner) {
    // 세로/히어로: 우상단 작은 경로.
    mapBox = Math.round(W * 0.30 * mScale);
    mapX = Math.round(W - PADX - mapBox);
    mapY = Math.round(H * 0.11);
  }
  const proj = el.map ? projectRoute(route, {width: Math.max(1, mapBox), height: Math.max(1, mapBox), padding: Math.round(mapBox * 0.14)}) : {points: [] as ScreenPoint[]};
  const pathD = pointsToPath(proj.points);
  const hasMap = el.map && mapBox > 0 && pathD !== '';
  const start = proj.points[0];
  const end = proj.points[proj.points.length - 1];
  const mk = (n: number) => Math.round(n * (mapBox / 600));

  const shoeY = Math.round(H * 0.085);
  const shoeSize = Math.round(34 * tScale);
  const wordmarkSize = Math.round(58 * tScale);

  // ── 하단 통합 로크업(세로·히어로): 아래에서 위로 쌓아 y 계산 ─────────────────
  const bottomPad = Math.round(H * 0.075);        // 워드마크 아래 여백
  const wordBaseline = H - bottomPad;

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
          <Rect x={0} y={0} width={W} height={Math.round(H * 0.2)} fill={BG} fillOpacity={0.28} />
          <Rect x={0} y={Math.round(H * 0.42)} width={W} height={Math.round(H * 0.58)} fill="url(#kg-scrim)" />
        </G>
      )}

      {/* 신발명 좌상단 */}
      {!!model.shoe && (
        <SvgText x={PADX} y={shoeY} fill={ink} fillOpacity={0.92} fontFamily={CF} fontSize={shoeSize} fontWeight="700">{model.shoe}</SvgText>
      )}

      {/* 지도(경로) */}
      {hasMap && (
        <G transform={`translate(${mapX}, ${mapY})`}>
          <Path d={pathD} fill="none" stroke={routeColor} strokeOpacity={0.14} strokeWidth={mk(16)} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={pathD} fill="none" stroke={isDark ? 'url(#kg-route)' : routeColor} strokeWidth={mk(7)} strokeLinecap="round" strokeLinejoin="round" />
          {!!end && <Circle cx={end.x} cy={end.y} r={mk(9)} fill={routeColor} />}
          {!!start && <Circle cx={start.x} cy={start.y} r={mk(12)} fill={ink} stroke={routeColor} strokeWidth={mk(5)} />}
        </G>
      )}

      {/* ── 가로(classic): 중앙 지도 + 하단 가로 스탯 행 ── */}
      {!el.bigDistance && statCells.length > 0 && (() => {
        const span = W * 0.86;
        const x0 = (W - span) / 2;
        const slot = span / statCells.length;
        const valueY = Math.round(H - H * 0.155);
        const labelY = valueY - Math.round(66 * tScale);
        return statCells.map((sc, i) => {
          const cx = x0 + slot * i + slot / 2;
          return (
            <G key={sc.label}>
              <SvgText x={cx} y={labelY} fill={ink} fillOpacity={0.85} fontFamily={CF} fontSize={Math.round(31 * tScale)} fontWeight="700" letterSpacing={2} textAnchor="middle">{sc.label.toUpperCase()}</SvgText>
              <SvgText x={cx} y={valueY} fill={ink} fontFamily={CF} fontSize={Math.round(62 * tScale)} fontWeight="800" letterSpacing={-0.5} textAnchor="middle">{sc.value}</SvgText>
            </G>
          );
        });
      })()}

      {/* ── 세로(vertical)·히어로: 하단 좌측 로크업 — 파파야 라인 + 거대 거리 + 세로 스탯 ── */}
      {el.bigDistance && (() => {
        const heroSize = Math.round((layout === 'hero' ? 210 : 168) * tScale);
        const heroUnit = Math.round(52 * tScale);
        const statValSize = Math.round((el.statsVertical ? 58 : 52) * tScale);
        const statLabSize = Math.round(26 * tScale);
        const nStats = statCells.length;
        // 아래에서 위로: 워드마크(우하단, 별도) → 스탯들 → 거리 → 파파야 라인.
        const rowH = Math.round((statValSize + statLabSize + 22 * tScale));
        const statsBottom = wordBaseline - Math.round(76 * tScale); // 워드마크 위
        const statsTop = statsBottom - nStats * rowH;
        const distBaseline = statsTop - Math.round(22 * tScale);
        const distLabelY = distBaseline + Math.round(heroUnit * 0.72);
        const accentY = distBaseline - heroSize - Math.round(18 * tScale);

        const els: React.ReactNode[] = [];
        // 파파야 액센트 라인
        els.push(<Rect key="acc" x={PADX} y={accentY} width={Math.round(96 * tScale)} height={Math.round(9 * tScale)} rx={Math.round(4 * tScale)} fill={RING_ACCENT} />);
        // 거대 거리 + 단위 + 라벨
        els.push(<SvgText key="dv" x={PADX} y={distBaseline} fill={ink} fontFamily={CF} fontSize={heroSize} fontWeight="800" letterSpacing={-4}>{model.distance}</SvgText>);
        els.push(<SvgText key="du" x={PADX + Math.round(heroSize * 0.02) + measureApprox(model.distance, heroSize)} y={distBaseline} fill={ink} fillOpacity={0.75} fontFamily={CF} fontSize={heroUnit} fontWeight="700">{` ${model.unit}`}</SvgText>);
        els.push(<SvgText key="dl" x={PADX + 4} y={distLabelY} fill={ink} fillOpacity={0.7} fontFamily={CF} fontSize={statLabSize} fontWeight="700" letterSpacing={2}>DISTANCE</SvgText>);
        // 세로 스탯(페이스·시간)
        if (el.statsVertical) {
          statCells.forEach((sc, i) => {
            const vy = statsTop + i * rowH + statValSize;
            els.push(<SvgText key={`sv${i}`} x={PADX} y={vy} fill={ink} fontFamily={CF} fontSize={statValSize} fontWeight="800" letterSpacing={-0.5}>{sc.value}</SvgText>);
            els.push(<SvgText key={`sl${i}`} x={PADX + 4} y={vy + Math.round(statLabSize + 8 * tScale)} fill={ink} fillOpacity={0.7} fontFamily={CF} fontSize={statLabSize} fontWeight="700" letterSpacing={2}>{sc.label.toUpperCase()}</SvgText>);
          });
        } else if (nStats > 0) {
          // 히어로: 스탯을 가로 한 줄로(작게) 거리 아래.
          const rowY = statsTop + statValSize;
          const gap = Math.round(W * 0.86 / Math.max(1, nStats));
          statCells.forEach((sc, i) => {
            const cx = PADX + i * gap;
            els.push(<SvgText key={`hv${i}`} x={cx} y={rowY} fill={ink} fontFamily={CF} fontSize={statValSize} fontWeight="800" letterSpacing={-0.5}>{sc.value}</SvgText>);
            els.push(<SvgText key={`hl${i}`} x={cx + 4} y={rowY + Math.round(statLabSize + 8 * tScale)} fill={ink} fillOpacity={0.7} fontFamily={CF} fontSize={statLabSize} fontWeight="700" letterSpacing={2}>{sc.label.toUpperCase()}</SvgText>);
          });
        }
        return <G>{els}</G>;
      })()}

      {/* 워드마크 — 세로/히어로는 우하단, 가로는 하단 중앙. */}
      {el.bigDistance ? (
        <SvgText x={W - PADX} y={wordBaseline} fill={wordmarkColor} fontFamily={CF} fontWeight="500" fontSize={wordmarkSize} letterSpacing={-0.5} textAnchor="end">{model.brand.toLowerCase()}</SvgText>
      ) : (
        <SvgText x={W / 2} y={H - Math.round(H * 0.07)} fill={wordmarkColor} fontFamily={CF} fontWeight="500" fontSize={Math.round(62 * tScale)} letterSpacing={-0.5} textAnchor="middle">{model.brand.toLowerCase()}</SvgText>
      )}
    </>
  );
}

// 숫자 폭 근사(단위 x 위치용) — Jost/HN 계열 대략 폭 0.56em·소수점 0.28em.
function measureApprox(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of String(s)) w += ch === '.' ? 0.3 : ch === ',' ? 0.3 : 0.58;
  return Math.round(w * fontSize);
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
