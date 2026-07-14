// ============================================================================
// ShareCard.tsx — 런 기록 공유 카드(이미지) · 템플릿 구동(선택기용)
// ----------------------------------------------------------------------------
// 사용자는 공유 시 여러 템플릿을 넘겨보며 고른다(lib/shareCard 의 registry가 단일 진실원).
// 기본은 '투명 스티커'(배경 없음) — 러너가 인스타에 자기 사진을 올린 뒤 그 위에 이 카드를
// 얹어 크기를 조절한다. background='dark' 면 다크+파파야 경로의 '완성본'(카톡 등 직접 공유용).
// photoUri 가 오면(리캡 '오늘의 한 컷' 완성본) 사진을 배경으로 깐다.
//
// react-native-svg 만으로 그려 부모가 ref.toDataURL()로 PNG 를 얻어 공유한다(네이티브 0).
// 색은 theme 토큰만(raw hex 0). 폰트는 카드 전용 CF(Helvetica Neue/시스템 산세).
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

// 폭 1080 고정 — 높이는 포맷(피드 4:5 / 세로형 9:16)에 따라 registry(runCardDimensions)가 준다.

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
  /** 투명(기본, 사진 위 오버레이) / 다크(완성본). photoUri 있으면 무시. */
  background?: RunCardBackground;
  /** 글씨 크기 배율(사용자 조절). */
  textScale?: number;
  /** 지도 크기 배율(사용자 조절). */
  mapScale?: number;
}

const ShareCard = React.forwardRef<unknown, ShareCardProps>((props, ref) => {
  const {
    model,
    route = [],
    photoUri = null,
    template = 'classic',
    format = 'feed',
    background = 'transparent',
    textScale = 1,
    mapScale = 1,
  } = props;

  const {w: W, h: H} = runCardDimensions(format);
  const el = runCardElements(template);
  const tScale = clampRunCardScale(textScale);
  const mScale = clampRunCardScale(mapScale);

  const isPhoto = !!photoUri;
  const isDark = background === 'dark' && !isPhoto;
  // 투명·사진 위에선 흰색이 어떤 배경에도 읽힌다. 다크 완성본에선 파파야 경로가 브랜드 서명.
  const routeColor = isDark ? RING_ACCENT : ACCENT;
  const wordmarkColor = isDark ? RING_ACCENT : T1;
  const ink = T1;

  const PADX = 72;

  // ── 세로 배치(비율 기반 — 피드·세로형 모두 대응) ──────────────────────────
  const shoeY = Math.round(H * 0.085);
  const wordmarkY = Math.round(H - H * 0.07);
  // 스탯 행: 라벨(위) + 값(아래), 워드마크 위에 앵커.
  const statsValueY = Math.round(H - H * 0.115);
  const statsLabelY = statsValueY - Math.round(70 * tScale);
  // 히어로 거리(있으면): 지도가 있으면 상단, 없으면(미니멀) 중앙 근처.
  const heroBaselineY = el.map ? Math.round(H * 0.30) : Math.round(H * 0.46);

  // 지도 박스 — 히어로/스탯 유무에 따라 남는 세로 영역 중앙에 정사각으로.
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

  // 스탯 셀 — 히어로가 거리를 크게 보이면 거리 칸 제외(중복 방지).
  const statCells = [
    ...(el.statsIncludeDistance ? [{label: 'DISTANCE', value: `${model.distance} ${model.unit}`}] : []),
    ...model.stats,
  ];
  const span = W * 0.86;
  const x0 = (W - span) / 2;
  const slot = statCells.length > 0 ? span / statCells.length : span;

  // 도착 깃발 — 주황 체커(교차 칸). 빈 칸은 배경 비침.
  const finishFlag = (cx: number, cy: number) => {
    const u = Math.round(8 * (box / 600)); // 지도 크기에 비례
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
    <Svg ref={ref as never} width={W} height={H}>
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

      {/* 배경 — 다크 완성본이면 라디얼 다크, 사진이면 사진+스크림, 투명이면 없음. */}
      {isDark && <Rect x={0} y={0} width={W} height={H} fill="url(#kg-dark)" />}
      {isPhoto && (
        <G>
          <SvgImage href={{uri: photoUri as string}} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
          <Rect x={0} y={0} width={W} height={Math.round(H * 0.16)} fill={BG} fillOpacity={0.25} />
          <Rect x={0} y={H - Math.round(H * 0.42)} width={W} height={Math.round(H * 0.42)} fill={BG} fillOpacity={0.4} />
        </G>
      )}

      {/* 좌상단: 신발명(날짜는 표시 안 함) */}
      {!!model.shoe && (
        <SvgText x={PADX} y={shoeY} fill={ink} fillOpacity={0.92} fontFamily={CF} fontSize={shoeSize} fontWeight="700">
          {model.shoe}
        </SvgText>
      )}

      {/* 히어로 거리(미니멀·히어로) — 거대 숫자 + 단위 */}
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

      {/* GPS 경로 — 글로우 한 겹 + 샤프 + START/피니시 마커 */}
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

      {/* 가로 스탯 그리드 — 라벨(위)·값(아래) */}
      {el.statsRow && statCells.map((s, i) => {
        const cx = x0 + slot * i + slot / 2;
        return (
          <G key={s.label}>
            <SvgText x={cx} y={statsLabelY} fill={ink} fillOpacity={0.85} fontFamily={CF} fontSize={statLabelSize} fontWeight="700" letterSpacing={2} textAnchor="middle">
              {s.label.toUpperCase()}
            </SvgText>
            <SvgText x={cx} y={statsValueY} fill={ink} fontFamily={CF} fontSize={statValueSize} fontWeight="800" letterSpacing={-0.5} textAnchor="middle">
              {s.value}
            </SvgText>
          </G>
        );
      })}

      {/* 하단: keego 워드마크 — 투명·사진 위엔 흰색, 다크 완성본엔 파파야. */}
      <SvgText x={W / 2} y={wordmarkY} fill={wordmarkColor} fontFamily={CF} fontWeight="500" fontSize={wordmarkSize} letterSpacing={-0.5} textAnchor="middle">
        {model.brand.toLowerCase()}
      </SvgText>
    </Svg>
  );
});

ShareCard.displayName = 'ShareCard';

export default ShareCard;
