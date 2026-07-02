// ============================================================================
// CourseMap.tsx — 러닝 경로 지도 카드(공용)
// HistoryScreen(RunDetail)에서 추출 — 러닝 완료 리캡(RunRecapScreen)과 상세가
// 같은 코스 지도를 공유한다. 진짜 지도(react-native-maps, 다크 스타일) 위 경로가
// 기본이고, 네이티브 미링크/옛 빌드에선 SVG 폴리라인으로 자동 폴백(앱 안 죽음).
// points < 2 면 스스로 숨는다(경로 없는 수동 기록·GPS 실패 런은 여백도 안 생김).
// ============================================================================
import React, {useState} from 'react';
import {View, Text, StyleSheet, type LayoutChangeEvent} from 'react-native';
import Svg, {Polyline, Circle} from 'react-native-svg';
import {CARD, CARD_DIM, CARD_BORDER, ACCENT, T1, T3, FONT, RADIUS, SEP} from './theme';
import {DARK_MAP_STYLE} from './lib/mapStyle';
import {projectRoute, type LatLon} from './lib/route';

const MAP_H = 180;
const MAP_PAD = 16;

// 옵셔널 require — 미링크 빌드에서 top-level import 가 앱을 죽이지 않게 감싼다.
let MapView: any = null;
let MapPolyline: any = null;
let MapMarker: any = null;
let MAP_PROVIDER_GOOGLE: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const maps = require('react-native-maps');
  MapView = maps.default ?? maps.MapView;
  MapPolyline = maps.Polyline;
  MapMarker = maps.Marker;
  MAP_PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} catch {
  // 네이티브 미링크 — SVG 폴백.
}
const MAPS_AVAILABLE = !!MapView;

/** 경로 bbox → MapView region(중심 + 델타, 패딩 1.5배·최소 델타). */
function routeRegion(points: LatLon[]) {
  const lats = points.map(p => p.lat);
  const lons = points.map(p => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.003),
    longitudeDelta: Math.max((maxLon - minLon) * 1.5, 0.003),
  };
}

/** SVG 폴백(지도 네이티브 미링크 시) — 순수 projectRoute 폴리라인. */
function SvgCourse({points}: {points: LatLon[]}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const proj = w > 0 ? projectRoute(points, {width: w, height: MAP_H, padding: MAP_PAD}) : null;
  const start = proj?.points[0];
  const end = proj?.points[proj.points.length - 1];
  return (
    <View style={m.mapWell} onLayout={onLayout}>
      {proj && proj.svgPoints !== '' && (
        <Svg width={w} height={MAP_H}>
          <Polyline
            points={proj.svgPoints}
            fill="none"
            stroke={ACCENT}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!!start && <Circle cx={start.x} cy={start.y} r={5} fill={ACCENT} />}
          {!!end && <Circle cx={end.x} cy={end.y} r={5} fill={T1} stroke={ACCENT} strokeWidth={2} />}
        </Svg>
      )}
    </View>
  );
}

export function CourseMap({points, title = '코스', style}: {
  points: LatLon[];
  title?: string;
  style?: object;
}) {
  if (points.length < 2) return null;
  const coords = points.map(p => ({latitude: p.lat, longitude: p.lon}));
  const start = coords[0];
  const end = coords[coords.length - 1];
  return (
    <View style={[m.card, style]} testID="course-map">
      <Text style={m.label}>{title}</Text>
      {MAPS_AVAILABLE ? (
        <View style={[m.mapWell, {overflow: 'hidden'}]}>
          <MapView
            provider={MAP_PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            customMapStyle={DARK_MAP_STYLE}
            initialRegion={routeRegion(points)}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            liteMode
          >
            <MapPolyline coordinates={coords} strokeColor={ACCENT} strokeWidth={4} lineCap="round" lineJoin="round" />
            <MapMarker coordinate={start} anchor={{x: 0.5, y: 0.5}} tracksViewChanges={false}>
              <View style={m.startDot} />
            </MapMarker>
            <MapMarker coordinate={end} anchor={{x: 0.5, y: 0.5}} tracksViewChanges={false}>
              <View style={m.endDot} />
            </MapMarker>
          </MapView>
        </View>
      ) : (
        <SvgCourse points={points} />
      )}
    </View>
  );
}

const m = StyleSheet.create({
  card: {backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER, padding: 16},
  label: {color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.4},
  mapWell: {height: MAP_H, marginTop: 10, borderRadius: 14, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: CARD_DIM, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  startDot: {width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT, borderWidth: 2, borderColor: T1},
  endDot: {width: 14, height: 14, borderRadius: 7, backgroundColor: T1, borderWidth: 3, borderColor: ACCENT},
});

export default CourseMap;
