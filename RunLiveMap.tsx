// ============================================================================
// RunLiveMap.tsx — 러닝 중 라이브 지도(옵션 A: 지도 배경)
// 러닝 화면 배경에 전체화면 다크 지도를 깔고 현재 위치를 따라가며(animateCamera)
// 지금까지 달린 경로를 오렌지 폴리라인으로 그린다. 위 레이어(링·지표·컨트롤)의 가독성은
// 호출부가 스크림(어두운 오버레이)으로 확보한다. 좌표가 없으면(실내·GPS 미확보) 아무것도
// 그리지 않아 배경은 기본 다크로 유지된다. react-native-maps 미링크 빌드면 조용히 no-op.
//
// CourseMap.tsx 의 옵셔널 require·다크 스타일 규약을 그대로 미러링한다(iOS=애플지도 다크,
// Android=Google+customMapStyle). liteMode 는 쓰지 않는다 — 라이브로 카메라가 움직여야 하므로.
// ============================================================================
import React, {useEffect, useRef} from 'react';
import {View, StyleSheet, Platform} from 'react-native';
import {ACCENT} from './theme';
import {DARK_MAP_STYLE} from './lib/mapStyle';

// 옵셔널 require — 미링크 빌드에서 top-level import 가 앱을 죽이지 않게 감싼다(CourseMap 동일).
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
  /* 네이티브 미링크 — 지도 없이 배경은 기본 다크 */
}
const MAPS_AVAILABLE = !!MapView;

type LL = {lat: number; lon: number};

export function RunLiveMap({coords}: {coords: LL[]}) {
  const mapRef = useRef<any>(null);
  const list = Array.isArray(coords) ? coords : [];
  const last = list.length > 0 ? list[list.length - 1] : null;

  // 현재 위치를 부드럽게 따라간다(새 fix 마다 카메라 이동). 좌표가 없으면 no-op.
  useEffect(() => {
    // animateCamera 존재 가드 — 실기기엔 있고, 테스트 mock 엔 없다(없으면 조용히 skip).
    const map = mapRef.current;
    if (!last || !map || typeof map.animateCamera !== 'function') return;
    map.animateCamera(
      {center: {latitude: last.lat, longitude: last.lon}},
      {duration: 700},
    );
  }, [last?.lat, last?.lon]);

  // 지도 미링크 또는 첫 fix 전엔 배경을 기본 다크로 둔다(지도 깜빡임·빈 타일 방지).
  if (!MAPS_AVAILABLE || !last) return null;

  const path = list.map(p => ({latitude: p.lat, longitude: p.lon}));

  return (
    // pointerEvents none — 지도가 러닝 컨트롤(일시정지/종료) 터치를 가로채지 않게.
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <MapView
        ref={mapRef}
        // iOS=애플지도 다크(키 불필요), Android=Google+다크 스타일(CourseMap 과 동일 규약).
        provider={Platform.OS === 'android' ? MAP_PROVIDER_GOOGLE : undefined}
        userInterfaceStyle="dark"
        customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: last.lat,
          longitude: last.lon,
          latitudeDelta: 0.004,
          longitudeDelta: 0.004,
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        showsCompass={false}
        showsMyLocationButton={false}>
        {path.length >= 2 && (
          <MapPolyline
            coordinates={path}
            strokeColor={ACCENT}
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
          />
        )}
        <MapMarker
          coordinate={{latitude: last.lat, longitude: last.lon}}
          anchor={{x: 0.5, y: 0.5}}
          tracksViewChanges={false}>
          <View style={s.posOuter}>
            <View style={s.posInner} />
          </View>
        </MapMarker>
      </MapView>
    </View>
  );
}

const s = StyleSheet.create({
  posOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,122,45,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
