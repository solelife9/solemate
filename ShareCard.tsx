// ============================================================================
// ShareCard.tsx — 런 기록 공유 카드(이미지) · 투명 오버레이(스트라바 방식)
// ----------------------------------------------------------------------------
// 배경 없이(투명) GPS 경로(START/피니시 깃발) + 가로 스탯 그리드(거리/페이스/시간) +
// 하단 KEEGO 워드마크만 그린 세로형 카드. 사용자가 사진앱에 저장한 뒤 인스타 스토리에서
// 자기 사진 위에 스티커로 얹는다(우리는 배경 사진을 다루지 않는다). react-native-svg
// 만으로 그려 부모가 ref.toDataURL()로 투명 PNG 를 얻어 공유한다(lib/shareCard). 네이티브 0.
//
// 색은 theme 토큰만 사용(raw hex 0) — 투명도는 *Opacity prop 으로 표현한다.
// ============================================================================
import React from 'react';
import Svg, {Rect, Path, Circle, Text as SvgText, G} from 'react-native-svg';
import {ACCENT, T1} from './theme';

// [실험] 공유 카드 전용 폰트 — 레퍼런스(STEP STEP)의 깔끔한 네오-그로테스크 느낌.
// iOS 내장 Helvetica Neue(번들 0). Android 는 미보유 → 시스템 산세(Roboto)로 폴백.
const CF = 'Helvetica Neue';
import {projectRoute, LatLon, ScreenPoint} from './lib/route';
import {ShareCardModel} from './lib/shareCard';

// 1080×1350 세로형 — 인스타 피드/스토리에 드라마틱하게 맞는 4:5 비율.
export const CARD_W = 1080;
export const CARD_H = 1350;

// GPS 경로 히어로 박스(상단 중앙). projectRoute 가 [0,w]×[0,h]로 투영 → <G>로 평행이동.
const ROUTE_BOX = 600;
const ROUTE_X = (CARD_W - ROUTE_BOX) / 2;
const ROUTE_Y = 130;
export const ROUTE_BAND_BOTTOM = ROUTE_Y + ROUTE_BOX; // 730
// 가로 스탯 그리드 y(라벨/값). 경로 밴드 아래.
export const STATS_LABEL_Y = 942;
const STATS_VALUE_Y = 1018;

function pointsToPath(points: ScreenPoint[]): string {
  if (points.length < 2) return '';
  const r = (n: number) => Math.round(n * 100) / 100;
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)},${r(p.y)}`).join(' ');
}

export interface ShareCardProps {
  model: ShareCardModel;
  /** 기록된 GPS 경로(없거나 2점 미만이면 경로 생략). */
  route?: LatLon[];
}

const ShareCard = React.forwardRef<unknown, ShareCardProps>(({model, route = []}, ref) => {
  const proj = projectRoute(route, {width: ROUTE_BOX, height: ROUTE_BOX, padding: 76});
  const pathD = pointsToPath(proj.points);
  const start = proj.points[0];
  const end = proj.points[proj.points.length - 1];
  const hasMap = pathD !== '';

  // 가로 스탯 그리드: 거리 + model.stats(페이스/시간). 균등 분할(중앙 정렬 칼럼).
  const stats = [{label: 'DISTANCE', value: `${model.distance} ${model.unit}`}, ...model.stats];
  // 가운데로 살짝 모음 — 전체 폭이 아니라 86%만 점유(양 끝 여백 ↑).
  const span = CARD_W * 0.86;
  const x0 = (CARD_W - span) / 2;
  const slot = span / stats.length;

  // 도착 깃발 — 주황 체커보드(5열×3행 → 교차 칸이 행당 3·2·3 = '셋 둘 셋'). 빈 칸은 배경 비침.
  const finishFlag = (cx: number, cy: number) => {
    const u = 8;
    const cols = 5;
    const rows = 3;
    const ox = cx - (cols * u) / 2;
    const oy = cy - (rows * u) / 2;
    const cells: React.ReactNode[] = [];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if ((gx + gy) % 2 === 0) {
          cells.push(<Rect key={`${gx}-${gy}`} x={ox + gx * u} y={oy + gy * u} width={u} height={u} fill={ACCENT} />);
        }
      }
    }
    return <G>{cells}</G>;
  };

  return (
    <Svg ref={ref as never} width={CARD_W} height={CARD_H}>
      {/* 배경 없음(투명) — 인스타 스토리에서 사용자 사진 위에 스티커로 얹는다(스트라바 방식). */}

      {/* 좌상단: 달린 러닝화 이름(날짜는 표시하지 않음) */}
      {!!model.shoe && (
        <SvgText x={72} y={112} fill={T1} fillOpacity={0.92} fontFamily={CF} fontSize={36} fontWeight="700">
          {model.shoe}
        </SvgText>
      )}

      {/* GPS 경로 히어로 — 빛나는 오렌지(글로우 레이어 + 샤프) + START/피니시 마커 */}
      {hasMap && (
        <G transform={`translate(${ROUTE_X}, ${ROUTE_Y})`}>
          {/* 은은한 글로우 한 겹 + 깔끔한 한 줄(과한 발광 제거) */}
          <Path d={pathD} fill="none" stroke={ACCENT} strokeOpacity={0.12} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={pathD} fill="none" stroke={ACCENT} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          {/* 도착점: 작은 주황 점 / 시작점: START 라벨 + 주황 체커 깃발 */}
          {!!end && <Circle cx={end.x} cy={end.y} r={9} fill={ACCENT} />}
          {!!start && (
            <G>
              <Circle cx={start.x} cy={start.y} r={12} fill={T1} stroke={ACCENT} strokeWidth={5} />
              {finishFlag(start.x + 42, start.y - 28)}
              <SvgText x={start.x - 6} y={start.y - 24} fill={T1} fillOpacity={0.9} fontFamily={CF} fontSize={26} fontWeight="700" letterSpacing={3} textAnchor="end">
                START
              </SvgText>
            </G>
          )}
        </G>
      )}

      {/* 가로 스탯 그리드(DISTANCE / PACE / TIME) — 라벨 위·값 아래 */}
      {stats.map((s, i) => {
        const cx = x0 + slot * i + slot / 2;
        return (
          <G key={s.label}>
            <SvgText x={cx} y={STATS_LABEL_Y} fill={T1} fillOpacity={0.85} fontFamily={CF} fontSize={31} fontWeight="700" letterSpacing={2} textAnchor="middle">
              {s.label.toUpperCase()}
            </SvgText>
            <SvgText x={cx} y={STATS_VALUE_Y} fill={T1} fontFamily={CF} fontSize={64} fontWeight="800" letterSpacing={-0.5} textAnchor="middle">
              {s.value}
            </SvgText>
          </G>
        );
      })}

      {/* 하단: KEEGO 워드마크(볼드) — 해시태그는 제외 */}
      <SvgText x={CARD_W / 2} y={CARD_H - 96} fill={ACCENT} fontFamily={CF} fontSize={62} fontWeight="800" letterSpacing={4} textAnchor="middle">
        {model.brand.toUpperCase()}
      </SvgText>
    </Svg>
  );
});

ShareCard.displayName = 'ShareCard';

export default ShareCard;
