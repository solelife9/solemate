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
import {PixelRatio} from 'react-native';
import Svg, {Rect, Path, Circle, Text as SvgText, G, Image as SvgImage, Defs, RadialGradient, LinearGradient, Stop} from 'react-native-svg';
import {T1, RING_ACCENT, RING_ACCENT_HI, RING_ACCENT_LO, BG} from './theme';
import {SHARE_DARK_STOPS, SHARE_TEXT_SHADOW} from './theme.palettes';
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
      <SvgText x={t.x + 2} y={t.y + dy} fill={SHARE_TEXT_SHADOW} fillOpacity={0.45} fontFamily={CF} fontSize={t.size} fontWeight={t.weight} letterSpacing={t.ls} textAnchor={t.anchor}>{t.value}</SvgText>
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
  // 캡처 기본 폭 = 설계 px ÷ 화면 배율 (2026-08-07).
  //
  // 예전 기본값은 W(=설계 px)를 **dp 로** 넘기는 것이었다. react-native-svg 의 width 는
  // dp 라, 3배율 기기에서 1080dp → **3240px** 이 구워졌다. 어느 플랫폼도 그 해상도로
  // 표시하지 않고, 9배를 더 그리느라 안드로이드 공유가 실측 3.6초 걸렸다.
  //
  // 형제 카드 3종(RecapShareCard·MedalShareCard·RunnerSpecShareCard)은 2026-08-06 에
  // 같은 수정을 받았는데 **가장 많이 쓰는 이 카드(러닝 리캡 → 공유)만 빠졌다.**
  // viewBox 가 좌표계를 W×H 로 유지하므로 카드 내부 좌표는 한 줄도 바뀌지 않고,
  // 결과 이미지는 배율과 무관하게 항상 설계 치수가 된다.
  //
  // ⚠️ toDataURL(cb,{width,height}) 로 줄이는 방법은 쓰지 말 것 — 안드로이드에서는
  // 축소가 아니라 **잘라내기**라 카드 왼쪽 위만 남는다(lib/shareCard.ts 주석).
  const captureScale = PixelRatio.get() || 1;
  const dispW = displayWidth && displayWidth > 0 ? Math.round(displayWidth) : Math.round(W / captureScale);
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
  // 도착 체커 깃발(파파야) — 경로 마지막 좌표(피니시) 옆. 교차 칸만 채워 격자 느낌.
  // (감사 #57: 체커 깃발=도착 기호인데 START 마커 옆에 그려져 의미가 뒤집혀 있었다.)
  const finishFlag = (fx: number, fy: number) => {
    const u = Math.max(3, mk(9)), cols = 5, rows = 3;
    const ox = fx - (cols * u) / 2, oy = fy - (rows * u) / 2;
    const cells: React.ReactNode[] = [];
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      if ((gx + gy) % 2 === 0) cells.push(<Rect key={`${gx}-${gy}`} x={ox + gx * u} y={oy + gy * u} width={u} height={u} fill={routeColor} />);
    }
    return <G>{cells}</G>;
  };

  return (
    <Svg ref={ref as never} width={dispW} height={dispH} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <RadialGradient id="kg-dark" cx="50%" cy="18%" r="110%">
          <Stop offset="0" stopColor={SHARE_DARK_STOPS[0]} /><Stop offset="0.55" stopColor={SHARE_DARK_STOPS[1]} /><Stop offset="1" stopColor={SHARE_DARK_STOPS[2]} />
        </RadialGradient>
        <LinearGradient id="kg-route" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={RING_ACCENT_HI} /><Stop offset="1" stopColor={RING_ACCENT_LO} />
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
          {!!end && (
            <G>
              <Circle cx={end.x} cy={end.y} r={mk(9)} fill={routeColor} />
              {finishFlag(end.x + mk(40), end.y - mk(26))}
            </G>
          )}
          {!!start && (
            <G>
              <Circle cx={start.x} cy={start.y} r={mk(12)} fill={ink} stroke={routeColor} strokeWidth={mk(5)} />
              <SvgText x={start.x - mk(6)} y={start.y - mk(22)} fill={ink} fillOpacity={0.92} fontFamily={CF} fontSize={mk(26)} fontWeight="700" letterSpacing={mk(3)} textAnchor="end">START</SvgText>
            </G>
          )}
        </G>
      )}

      {/* 성취 리본('기록' 카드) — 파파야 필 + ★ + 텍스트 */}
      {L.ribbon && (() => {
        const rb = L.ribbon;
        const yMid = rb.y + rb.height / 2 + Math.round(rb.fontSize * 0.36);
        return (
          <G>
            <Rect x={rb.x} y={rb.y} width={rb.width} height={rb.height} rx={Math.round(rb.height / 2)} fill={RING_ACCENT} fillOpacity={0.16} stroke={RING_ACCENT} strokeOpacity={0.5} strokeWidth={2.5} />
            <SvgText x={rb.x + Math.round(rb.fontSize * 1.1)} y={yMid} fontFamily={CF} fontSize={rb.fontSize} fill={RING_ACCENT}>★</SvgText>
            <SvgText x={W / 2 + Math.round(rb.fontSize * 0.65)} y={yMid} fontFamily={CF} fontSize={rb.fontSize} fontWeight="800" fill={RING_ACCENT} textAnchor="middle" letterSpacing={0.5}>{rb.text}</SvgText>
          </G>
        );
      })()}

      {/* 지표·워드마크 — 흰색(파파야=워드마크), 그림자로 사진 위 가독성 */}
      {L.texts.map((t, i) => (
        <Txt key={i} t={t} fill={t.papaya ? RING_ACCENT : ink} />
      ))}
    </Svg>
  );
});

ShareCard.displayName = 'ShareCard';

export default ShareCard;
