// ============================================================================
// RunLiveMap.tsx — 러닝 중 라이브 지도(옵션 A: 지도 배경) + 가독성 스크림
// 러닝 화면 배경에 전체화면 다크 지도를 깔고 현재 위치를 따라가며(animateCamera)
// 지금까지 달린 경로를 오렌지 폴리라인으로 그린다. 지도 위에 어두운 스크림을 함께 얹어
// 위 레이어(링·지표·컨트롤)의 가독성을 확보한다(스크림을 이 컴포넌트가 소유해 지도가
// 실제로 보일 때만 어두워진다).
//
// 위치 소스 우선순위: ① 라이브 좌표(달리는 중 GPS 경로) → ② 마지막 알려진 위치(실내·시작
// 직후 프리뷰 — 지도를 즉시 띄워 준다). 둘 다 없으면 null → 배경은 기본 다크. 지도 미링크
// 빌드(react-native-maps 없음)에서도 조용히 no-op.
//
// CourseMap.tsx 의 옵셔널 require·다크 스타일 규약을 그대로 미러링(iOS=애플지도 다크,
// Android=Google+customMapStyle). liteMode 는 쓰지 않는다 — 라이브로 카메라가 움직여야 하므로.
// ============================================================================
import React, {useEffect, useRef, useState} from 'react';
import {View, StyleSheet, Platform} from 'react-native';
import * as Location from 'expo-location';
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
  const [preview, setPreview] = useState<LL | null>(null);
  const list = Array.isArray(coords) ? coords : [];
  const liveLast = list.length > 0 ? list[list.length - 1] : null;

  // 라이브 좌표가 아직 없으면(실내·시작 직후) 마지막 알려진 위치로 지도를 즉시 띄운다
  // (프리뷰). 라이브 좌표가 생기면 그걸 우선한다. 위치 권한은 러닝 진입 시 이미 허용됨.
  useEffect(() => {
    if (liveLast || !MAPS_AVAILABLE) return;
    let alive = true;
    Location.getLastKnownPositionAsync()
      .then(p => {
        if (alive && p?.coords) setPreview({lat: p.coords.latitude, lon: p.coords.longitude});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [liveLast]);

  const center = liveLast ?? preview;

  // 현재 위치를 부드럽게 따라간다(새 fix 마다 카메라 이동). animateCamera 존재 가드 —
  // 실기기엔 있고 테스트 mock 엔 없다(없으면 조용히 skip).
  useEffect(() => {
    const map = mapRef.current;
    if (!center || !map || typeof map.animateCamera !== 'function') return;
    map.animateCamera({center: {latitude: center.lat, longitude: center.lon}}, {duration: 700});
  }, [center?.lat, center?.lon]);

  // 라이브 좌표·프리뷰 위치 둘 다 없으면(권한 전·완전 미측정) 배경을 기본 다크로 둔다.
  if (!MAPS_AVAILABLE || !center) return null;

  const path = list.map(p => ({latitude: p.lat, longitude: p.lon}));

  return (
    <>
      <MapView
        ref={mapRef}
        // iOS=애플지도 다크(키 불필요), Android=Google+다크 스타일(CourseMap 과 동일 규약).
        provider={Platform.OS === 'android' ? MAP_PROVIDER_GOOGLE : undefined}
        userInterfaceStyle="dark"
        customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lon,
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
          coordinate={{latitude: center.lat, longitude: center.lon}}
          anchor={{x: 0.5, y: 0.5}}
          tracksViewChanges={false}>
          <View style={s.posOuter}>
            <View style={s.posInner} />
          </View>
        </MapMarker>
      </MapView>
      {/* 가독성 스크림 — 지도가 실제로 보일 때만 어둡게. 0.5 는 초기값(기기에서 튜닝). */}
      <View style={s.scrim} />
    </>
  );
}

const s = StyleSheet.create({
  scrim: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,6,9,0.4)'},
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
