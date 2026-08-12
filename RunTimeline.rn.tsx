// ============================================================================
// RunTimeline.rn.tsx — 러닝 탐색 뷰(전체화면). 확대·스크럽·지표 전환.
//
// 왜 전체화면인가 (2026-08-12 민우님과 함께 결론)
// ----------------------------------------------------------------------------
// 처음엔 상세 화면의 카드 하나에 다 넣으려 했다. 그랬더니 한 카드에 요소가 **9개**가
// 됐고(숫자·단위·시점·존 밑줄·존 이름·그래프·시간축·위성 3개·존 분포·인사이트),
// 민우님이 "보기가 더 복잡해진 것 같다"고 했다. 맞는 지적이었다 — 원래 심박 존 카드는
// 3덩어리였는데 내가 9개로 만들어 놓고 '정리했다'고 한 것이다.
//
// 원인은 **요약 화면에 탐색 도구를 욱여넣은 것**이었다. 두 맥락이 원하는 게 다르다:
//   · 상세 = "어땠나" (5초, 훑는다)
//   · 탐색 = "왜 그랬나" (몇 분, 파고든다)
// 그래서 나눴다. 애플 건강도 같은 구조다 — 작은 차트, 탭하면 전체화면.
// 상세의 심박 카드는 오히려 **지금 앱보다 짧아졌고**(접이식 곡선+5줄 막대 → 3덩어리),
// 여기서는 그래프가 세 배 커져 확대가 사치가 아니라 당연한 동작이 된다.
//
// 왜 이 기능인가: 조사해 보니 **폰에서 러닝 그래프를 파고들 수 있는 앱이 사실상 없다.**
// 가민 커넥트 모바일은 차트 확대가 안 되고(가로 회전·PC 웹으로 가야 한다), 스트라바는
// 자기 커뮤니티에 "앱 그래프는 웹에 비해 원시적"이라는 기능 요청이 올라와 있다.
//
// 계산은 전부 `lib/timeline`(순수)에 있다 — 이 파일은 그리기와 손가락만 맡는다.
// ============================================================================
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {View, StyleSheet, Modal, PanResponder, LayoutChangeEvent} from 'react-native';
import Svg, {Path, Line, Circle, Defs, LinearGradient, Stop, Rect, Mask} from 'react-native-svg';
import {Text} from './lib/text';
import {rf, rs, rv, ri} from './lib/responsive';
import {Tap} from './primitives';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, CARD, T1, T2, T3, FONT, RADIUS, HR_ZONE_COLORS, RING_ACCENT, withAlpha, ICON} from './theme';
import {HR_ZONE_LABEL, HRZone} from './lib/analytics/hrZones';
import {
  Metric, Range, TimePoint, MIN_SPAN_SEC,
  slice, downsample, stats, yRange, norm, clampRange, zoomAt, timeAt, pointAt, zoneSeconds,
} from './lib/timeline';

const CHART_H = 224;
const PAD_T = 12;
const PAD_B = 18;

const fmtClock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** Catmull-Rom → 베지어. 꺾인 폴리라인은 저렴해 보인다. */
function curvePath(pts: readonly TimePoint[], X: (p: TimePoint) => number, Y: (p: TimePoint) => number): string {
  if (pts.length < 2) return '';
  let d = `M${X(pts[0]).toFixed(2)},${Y(pts[0]).toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += `C${(X(p1) + (X(p2) - X(p0)) / 6).toFixed(2)},${(Y(p1) + (Y(p2) - Y(p0)) / 6).toFixed(2)}`
      + ` ${(X(p2) - (X(p3) - X(p1)) / 6).toFixed(2)},${(Y(p2) - (Y(p3) - Y(p1)) / 6).toFixed(2)}`
      + ` ${X(p2).toFixed(2)},${Y(p2).toFixed(2)}`;
  }
  return d;
}

export interface RunTimelineProps {
  visible: boolean;
  onClose: () => void;
  /** 그릴 수 있는 지표만 넘긴다(표본 2개 이상). 첫 번째가 히어로로 열린다. */
  metrics: Metric[];
  /** 러닝 총 길이(초). */
  totalSec: number;
  /** 심박 존 하한(bpm). 심박 지표가 있을 때만 존 색·분포를 쓴다. */
  zoneBounds?: Record<number, number> | null;
  /** 값 포맷(지표별) — 페이스는 4'38" 처럼 읽어야 한다. */
  formatValue: (key: string, v: number) => string;
  /** 열자마자 이 구간으로 확대해 들어간다(스플릿에서 진입할 때). */
  initialRange?: Range | null;
  /** 열자마자 이 지표를 히어로로(스플릿 진입 → 페이스). */
  initialMetric?: string | null;
  title?: string;
}

export default function RunTimeline({
  visible, onClose, metrics, totalSec, zoneBounds, formatValue, initialRange, initialMetric, title,
}: RunTimelineProps) {
  const total = Math.max(MIN_SPAN_SEC, totalSec || 0);
  const [heroKey, setHeroKey] = useState<string>(initialMetric || metrics[0]?.key || 'hr');
  const [range, setRange] = useState<Range>(() => clampRange(initialRange || {a: 0, b: total}, total));
  const [cursor, setCursor] = useState<number | null>(null);
  const [width, setWidth] = useState(320);

  // 제스처는 ref 로 붙잡고 state 로 그린다 — 매 프레임 setState 는 비싸지만 점 수를
  // 160 아래로 눌러 두면 견딘다(lib/timeline.downsample). 네이티브 드라이버는 못 쓴다
  // (SVG path 는 JS 에서 만들어야 한다).
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const pinchRef = useRef<{dist: number; span: number; anchor: number} | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  const hero = metrics.find(m => m.key === heroKey) || metrics[0] || null;
  const others = metrics.filter(m => m.key !== heroKey);
  const hrMetric = metrics.find(m => m.key === 'hr') || null;

  const zoneOf = useCallback(
    (bpm: number): number => {
      const b = zoneBounds;
      if (!b) return 1;
      return bpm >= b[5] ? 5 : bpm >= b[4] ? 4 : bpm >= b[3] ? 3 : bpm >= b[2] ? 2 : 1;
    },
    [zoneBounds],
  );

  // ── 보이는 구간의 데이터 ───────────────────────────────────────────────────
  const view = useMemo(() => {
    if (!hero) return null;
    const inRange = slice(hero.points, range);
    const drawn = downsample(inRange, 160);
    const y = yRange(inRange, hero.key === 'cad' ? 3 : hero.key === 'elev' ? 2 : 6);
    return {inRange, drawn, y};
  }, [hero, range]);

  const heroStats = useMemo(() => (view ? stats(view.inRange) : null), [view]);

  const zoneSecs = useMemo(() => {
    if (!hrMetric || !zoneBounds) return null;
    return zoneSeconds(slice(hrMetric.points, range), zoneOf, range);
  }, [hrMetric, zoneBounds, range, zoneOf]);

  const atPoint = useMemo(() => {
    if (cursor == null || !hero) return null;
    return pointAt(hero.points, cursor);
  }, [cursor, hero]);

  // ── 손가락 ────────────────────────────────────────────────────────────────
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const t = e.nativeEvent.touches;
          if (t.length >= 2) {
            const d = Math.abs(t[0].pageX - t[1].pageX) || 1;
            const mid = ((t[0].pageX + t[1].pageX) / 2) / Math.max(1, widthRef.current);
            pinchRef.current = {
              dist: d,
              span: rangeRef.current.b - rangeRef.current.a,
              anchor: timeAt(rangeRef.current, mid),
            };
            setCursor(null);
          } else {
            setCursor(timeAt(rangeRef.current, e.nativeEvent.locationX / Math.max(1, widthRef.current)));
          }
        },
        onPanResponderMove: (e) => {
          const t = e.nativeEvent.touches;
          if (t.length >= 2 && pinchRef.current) {
            const d = Math.abs(t[0].pageX - t[1].pageX) || 1;
            const p = pinchRef.current;
            // 손가락이 벌어지면(d 증가) 구간이 좁아진다 = 확대.
            const next = zoomAt(rangeRef.current, (p.span * (p.dist / d)) / (rangeRef.current.b - rangeRef.current.a), p.anchor, total);
            setRange(next);
          } else {
            setCursor(timeAt(rangeRef.current, e.nativeEvent.locationX / Math.max(1, widthRef.current)));
          }
        },
        onPanResponderRelease: () => {
          pinchRef.current = null;
          setCursor(null);
        },
        onPanResponderTerminate: () => {
          pinchRef.current = null;
          setCursor(null);
        },
      }),
    [total],
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.max(1, e.nativeEvent.layout.width));

  if (!hero || !view) return null;

  const W = width;
  const X = (p: TimePoint) => ((p.t - range.a) / Math.max(1e-6, range.b - range.a)) * W;
  const Y = (p: TimePoint) =>
    PAD_T + (1 - norm(p.v, view.y.lo, view.y.hi, hero.invert)) * (CHART_H - PAD_T - PAD_B);

  const path = curvePath(view.drawn, X, Y);
  const area = path
    ? `${path}L${X(view.drawn[view.drawn.length - 1]).toFixed(2)},${CHART_H - PAD_B}L${X(view.drawn[0]).toFixed(2)},${CHART_H - PAD_B}Z`
    : '';
  const zoomed = range.b - range.a < total - 1;
  const heroShown = atPoint ? atPoint.v : heroStats ? heroStats.avg : 0;
  const colorful = hero.key === 'hr' && !!zoneBounds;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={s.screen}>
        <View style={s.nav}>
          <Tap onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기" style={s.navBtn}>
            <Ionicons name="close" size={ri(ICON.action)} color={T1} />
          </Tap>
          <Text style={s.navTitle}>{title || '러닝 타임라인'}</Text>
          <View style={s.navBtn} />
        </View>

        {/* 히어로 — 지표 이름 · 큰 값 · 시점 */}
        <View style={s.heroWrap}>
          <Text style={s.metricName}>{hero.name}</Text>
          <View style={s.heroRow}>
            <Text style={s.heroV}>{formatValue(hero.key, heroShown)}</Text>
            <Text style={s.heroU}>{hero.unit}</Text>
            <Text style={s.heroWhen}>
              {atPoint ? fmtClock(atPoint.t) : zoomed ? '구간 평균' : '전체 평균'}
            </Text>
          </View>
        </View>

        {/* 그래프 */}
        <View style={s.plot} onLayout={onLayout} {...pan.panHandlers}
          accessible accessibilityRole="image"
          accessibilityLabel={`${hero.name} 곡선. ${heroStats ? `평균 ${formatValue(hero.key, heroStats.avg)}` : ''}`}>
          <Svg width="100%" height={CHART_H}>
            <Defs>
              <LinearGradient id="tlZone" x1="0" y1="0" x2="0" y2="1">
                {colorful && zoneBounds
                  ? ([5, 4, 3, 2, 1] as HRZone[]).flatMap(z => {
                      const hi = Math.min(z === 5 ? view.y.hi : zoneBounds[z + 1], view.y.hi);
                      const lo = Math.max(z === 1 ? view.y.lo : zoneBounds[z], view.y.lo);
                      if (hi <= lo) return [];
                      const o1 = ((view.y.hi - hi) / (view.y.hi - view.y.lo)) * 100;
                      const o2 = ((view.y.hi - lo) / (view.y.hi - view.y.lo)) * 100;
                      return [
                        <Stop key={`${z}a`} offset={`${o1}%`} stopColor={HR_ZONE_COLORS[z]} />,
                        <Stop key={`${z}b`} offset={`${o2}%`} stopColor={HR_ZONE_COLORS[z]} />,
                      ];
                    })
                  : [
                      <Stop key="n1" offset="0%" stopColor={T2} stopOpacity={0.3} />,
                      <Stop key="n2" offset="100%" stopColor={T2} stopOpacity={0.04} />,
                    ]}
              </LinearGradient>
              <LinearGradient id="tlFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={T1} stopOpacity={0.76} />
                <Stop offset="100%" stopColor={T1} stopOpacity={0.05} />
              </LinearGradient>
              <Mask id="tlMask">
                <Rect x={0} y={0} width={W} height={CHART_H} fill="url(#tlFade)" />
              </Mask>
            </Defs>

            {/* 존 경계 헤어라인 — 심박일 때만 */}
            {colorful && zoneBounds
              ? ([2, 3, 4, 5] as HRZone[]).map(z => {
                  const b = zoneBounds[z];
                  if (b <= view.y.lo || b >= view.y.hi) return null;
                  const y = PAD_T + (1 - norm(b, view.y.lo, view.y.hi)) * (CHART_H - PAD_T - PAD_B);
                  return <Line key={z} x1={0} y1={y} x2={W} y2={y} stroke={HR_ZONE_COLORS[z]} strokeWidth={1} opacity={0.16} />;
                })
              : null}

            {!!area && <Path d={area} fill="url(#tlZone)" mask="url(#tlMask)" />}
            {!!path && <Path d={path} fill="none" stroke={T1} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

            {/* 확대하면 실제 측정점이 드러난다 — 예쁘게 뭉갠 게 아니라는 신호(Truth only) */}
            {range.b - range.a <= 180
              ? view.inRange.filter((_, i) => i % (range.b - range.a <= 45 ? 1 : 3) === 0).map((p, i) => (
                  <Circle key={i} cx={X(p)} cy={Y(p)} r={1.5} fill={T1} opacity={0.42} />
                ))
              : null}

            {atPoint ? (
              <>
                <Line x1={X(atPoint)} y1={PAD_T} x2={X(atPoint)} y2={CHART_H - PAD_B} stroke={RING_ACCENT} strokeWidth={1.25} opacity={0.75} />
                <Circle cx={X(atPoint)} cy={Y(atPoint)} r={4} fill={BG} stroke={RING_ACCENT} strokeWidth={2} />
              </>
            ) : null}
          </Svg>
        </View>

        <View style={s.axis}>
          {[0, 1, 2, 3, 4].map(i => (
            <Text key={i} style={s.axisT}>{fmtClock(range.a + ((range.b - range.a) * i) / 4)}</Text>
          ))}
        </View>

        {zoomed ? (
          <Tap onPress={() => setRange({a: 0, b: total})} accessibilityRole="button" accessibilityLabel="전체 보기" style={s.backChip}>
            <Text style={s.backChipT}>← 전체 보기</Text>
          </Tap>
        ) : null}

        {/* 위성 = 판독값이자 지표 전환기(한 요소, 두 일) */}
        {others.length > 0 ? (
          <View style={s.sats}>
            {others.map(m => {
              const p = cursor != null ? pointAt(m.points, cursor) : null;
              const st = p ? null : stats(slice(m.points, range));
              const v = p ? p.v : st ? st.avg : null;
              return (
                <Tap key={m.key} onPress={() => setHeroKey(m.key)} accessibilityRole="button"
                  accessibilityLabel={`${m.name} 보기`} style={s.sat}>
                  <Text style={s.satK}>{m.name}</Text>
                  <Text style={s.satV}>{v == null ? '--' : formatValue(m.key, v)}</Text>
                </Tap>
              );
            })}
          </View>
        ) : null}

        {/* 존 분포 — 보이는 구간 기준. 확대하면 따라 움직인다 */}
        {zoneSecs ? (
          <View style={s.zones}>
            <Text style={s.zonesT}>{zoomed ? '이 구간 존' : '존 분포'}</Text>
            {([5, 4, 3, 2, 1] as HRZone[]).map(z => {
              const totalZ = Object.values(zoneSecs).reduce((a, b) => a + b, 0) || 1;
              return (
                <View key={z} style={s.zRow}>
                  <Text style={s.zName}>Z{z} {HR_ZONE_LABEL[z]}</Text>
                  <View style={s.zTrack}>
                    <View style={[s.zFill, {width: `${Math.round((zoneSecs[z] / totalZ) * 100)}%`, backgroundColor: HR_ZONE_COLORS[z]}]} />
                  </View>
                  <Text style={s.zVal}>{fmtClock(zoneSecs[z])}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG, paddingTop: rv(44)},
  nav: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rs(12), paddingBottom: rv(6)},
  navBtn: {width: rs(34), height: rs(34), alignItems: 'center', justifyContent: 'center'},
  navTitle: {color: T1, fontFamily: FONT, fontSize: rf(14), fontWeight: '700'},
  heroWrap: {paddingHorizontal: rs(18), paddingTop: rv(6)},
  metricName: {color: T3, fontFamily: FONT, fontSize: rf(11), letterSpacing: 1.4},
  heroRow: {flexDirection: 'row', alignItems: 'flex-end', gap: rs(6), minHeight: rv(56)},
  heroV: {color: T1, fontFamily: FONT, fontSize: rf(52), fontWeight: '700', letterSpacing: -1.6},
  heroU: {color: T3, fontFamily: FONT, fontSize: rf(11), paddingBottom: rv(9)},
  heroWhen: {color: T3, fontFamily: FONT, fontSize: rf(11), marginLeft: 'auto', paddingBottom: rv(10)},
  plot: {marginTop: rv(8), paddingHorizontal: rs(18)},
  axis: {flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: rs(18), marginTop: rv(4)},
  axisT: {color: T3, fontFamily: FONT, fontSize: rf(9.5)},
  backChip: {alignSelf: 'flex-start', marginLeft: rs(18), marginTop: rv(10), paddingHorizontal: rs(13), paddingVertical: rv(6),
    borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.07), borderWidth: 1, borderColor: withAlpha(T1, 0.1)},
  backChipT: {color: T2, fontFamily: FONT, fontSize: rf(10.5), fontWeight: '600'},
  sats: {flexDirection: 'row', gap: rs(7), paddingHorizontal: rs(18), marginTop: rv(14)},
  sat: {flex: 1, backgroundColor: CARD, borderRadius: RADIUS.sm, paddingVertical: rv(9), paddingHorizontal: rs(10)},
  satK: {color: T3, fontFamily: FONT, fontSize: rf(9)},
  satV: {color: T2, fontFamily: FONT, fontSize: rf(14.5), fontWeight: '700', marginTop: rv(1)},
  zones: {paddingHorizontal: rs(18), marginTop: rv(20)},
  zonesT: {color: T3, fontFamily: FONT, fontSize: rf(9.5), letterSpacing: 1, marginBottom: rv(8)},
  zRow: {flexDirection: 'row', alignItems: 'center', gap: rs(9), marginBottom: rv(7)},
  zName: {color: T3, fontFamily: FONT, fontSize: rf(11), width: rs(62)},
  zTrack: {flex: 1, height: rv(6), backgroundColor: withAlpha(T1, 0.07), borderRadius: RADIUS.pill, overflow: 'hidden'},
  zFill: {height: '100%', borderRadius: RADIUS.pill},
  zVal: {color: T3, fontFamily: FONT, fontSize: rf(11), width: rs(38), textAlign: 'right'},
});
