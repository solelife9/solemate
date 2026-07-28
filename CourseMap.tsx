// ============================================================================
// CourseMap.tsx — 러닝 경로 지도 카드(공용)
// HistoryScreen(RunDetail)에서 추출 — 러닝 완료 리캡(RunRecapScreen)과 상세가
// 같은 코스 지도를 공유한다. 진짜 지도(react-native-maps, 다크 스타일) 위 경로가
// 기본이고, 네이티브 미링크/옛 빌드에선 SVG 폴리라인으로 자동 폴백(앱 안 죽음).
// points < 2 면 스스로 숨는다(경로 없는 수동 기록·GPS 실패 런은 여백도 안 생김).
// ============================================================================
import React, {useState} from 'react';
import { rf, rs, rv } from './lib/responsive';
import {View, StyleSheet, Platform, type LayoutChangeEvent} from 'react-native';
import {Text} from './lib/text';
import Svg, {Polyline, Circle} from 'react-native-svg';
import {CARD, CARD_DIM, BRAND, T1, T2, T3, FONT, RADIUS} from './theme';
import {GlassEdge} from './primitives';
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
            stroke={BRAND}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!!start && <Circle cx={start.x} cy={start.y} r={5} fill={BRAND} />}
          {!!end && <Circle cx={end.x} cy={end.y} r={5} fill={T1} stroke={BRAND} strokeWidth={2} />}
        </Svg>
      )}
      {/* 지도 위 오버레이라 마지막 자식(콘텐츠가 absoluteFill 이면 첫 자식은 덮인다). */}
      <GlassEdge glints={false} radius={rs(14)} />
    </View>
  );
}

export function CourseMap({points, title, style}: {
  points: LatLon[];
  /** 카드 라벨. **생략하면 라벨 없이 지도만** 그린다(2026-07-28 완주 화면 정리 —
   *  지도를 보면 코스인 걸 아는데 라벨이 세로 공간을 먹어 지도가 눌렸다). */
  title?: string;
  style?: object;
}) {
  if (points.length < 2) return null;
  const coords = points.map(p => ({latitude: p.lat, longitude: p.lon}));
  const start = coords[0];
  const end = coords[coords.length - 1];
  return (
    <View style={[m.card, style]} testID="course-map">
      <GlassEdge glints={false} radius={RADIUS.lg} />
      {!!title && <Text style={m.label}>{title}</Text>}
      {MAPS_AVAILABLE ? (
        <View style={[m.mapWell, {overflow: 'hidden'}]}>
          <MapView
            // iOS 는 Google 서브스펙(Podfile 'react-native-maps/Google') 미설치 —
            // PROVIDER_GOOGLE 을 주면 네이티브 뷰가 못 떠 지도가 통째로 빈다(실기기 버그).
            // 애플 지도(기본)로 두고 userInterfaceStyle 로 다크만 강제한다(키 불필요).
            // Android 는 Google(매니페스트에 API 키 있음) + customMapStyle 다크 유지.
            provider={Platform.OS === 'android' ? MAP_PROVIDER_GOOGLE : undefined}
            userInterfaceStyle="dark"
            style={StyleSheet.absoluteFill}
            customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
            initialRegion={routeRegion(points)}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            liteMode
          >
            <MapPolyline coordinates={coords} strokeColor={BRAND} strokeWidth={4} lineCap="round" lineJoin="round" />
            <MapMarker coordinate={start} anchor={{x: 0.5, y: 0.5}} tracksViewChanges={false}>
              <View style={m.startDot} />
            </MapMarker>
            <MapMarker coordinate={end} anchor={{x: 0.5, y: 0.5}} tracksViewChanges={false}>
              <View style={m.endDot} />
            </MapMarker>
          </MapView>
          {/* 지도 위 오버레이 — MapView 가 absoluteFill 이라 뒤(위)에 그린다. */}
          <GlassEdge glints={false} radius={rs(14)} />
        </View>
      ) : (
        <SvgCourse points={points} />
      )}
    </View>
  );
}

const m = StyleSheet.create({
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  card: {backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', padding: rs(16)},
  label: {color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '600', letterSpacing: 0.4},
  mapWell: {height: MAP_H, marginTop: rv(10), borderRadius: rs(14), borderCurve: 'continuous', overflow: 'hidden', backgroundColor: CARD_DIM},
  startDot: {width: rs(12), height: rs(12), borderRadius: rs(6), borderCurve: 'continuous', backgroundColor: T2, borderWidth: 2, borderColor: T1},
  endDot: {width: rs(14), height: rs(14), borderRadius: rs(7), borderCurve: 'continuous', backgroundColor: T1, borderWidth: 3, borderColor: BRAND},
});

export default CourseMap;
