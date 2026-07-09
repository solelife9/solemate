// ============================================================================
// RunLiveMap.tsx — 러닝 경로 지도(일시정지 시 노출)
// 두 가지로 쓰인다:
//   · 패널(interactive=false): 상단 절반 미리보기. 조작 불가(부모 Pressable 이 탭을 받아
//     전체화면으로 확장), 현재 위치로 카메라를 맞춘다.
//   · 전체화면(interactive=true): 팬·줌 가능. 사용자가 지도를 자유롭게 움직인다.
// 위치 소스: ① 라이브 좌표(경로) → ② 마지막 알려진 위치(실내 프리뷰). 둘 다 없으면 null.
// react-native-maps 미링크 빌드면 조용히 no-op(CourseMap 규약 재사용).
// ============================================================================
import React, {useEffect, useRef, useState} from 'react';
import { rs } from './lib/responsive';
import {View, StyleSheet, Platform} from 'react-native';
import * as Location from 'expo-location';
import {ACCENT, T2} from './theme';
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
  /* 네이티브 미링크 — 지도 없이 no-op */
}
const MAPS_AVAILABLE = !!MapView;

type LL = {lat: number; lon: number};

export function RunLiveMap({coords, interactive = false, recenterKey = 0}: {coords: LL[]; interactive?: boolean; recenterKey?: number}) {
  const mapRef = useRef<any>(null);
  const [preview, setPreview] = useState<LL | null>(null);
  const list = Array.isArray(coords) ? coords : [];
  const liveLast = list.length > 0 ? list[list.length - 1] : null;

  // 라이브 좌표가 없으면(실내) 마지막 알려진 위치로 지도를 띄운다(프리뷰). 위치 권한은
  // 러닝 진입 시 이미 허용됨. 라이브 좌표가 생기면 그걸 우선.
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

  // 패널 모드에선 현재 위치로 카메라를 맞춘다. 전체화면(interactive)에선 사용자가 직접
  // 움직이므로 자동 이동을 하지 않는다. animateCamera 존재 가드(테스트 mock 안전).
  useEffect(() => {
    if (interactive) return;
    const map = mapRef.current;
    if (!center || !map || typeof map.animateCamera !== 'function') return;
    map.animateCamera({center: {latitude: center.lat, longitude: center.lon}}, {duration: 500});
    // center 객체 대신 좌표 프리미티브에 의존 — 객체 정체성이 바뀌어도 좌표가 같으면 카메라를
    // 다시 안 움직인다(의도적 granular dep).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lon, interactive]);

  // '내 위치로 이동' — recenterKey 가 바뀔 때(전체화면 좌하단 버튼) 현재 좌표로 카메라 이동.
  // interactive 모드에서도 동작(사용자가 지도를 옮긴 뒤 내 위치로 복귀).
  useEffect(() => {
    if (!recenterKey) return; // 0 = 초기값, 무시
    const map = mapRef.current;
    if (!center || !map || typeof map.animateCamera !== 'function') return;
    map.animateCamera({center: {latitude: center.lat, longitude: center.lon}, zoom: 16}, {duration: 500});
    // recenterKey(버튼) 변화에만 재센터 — center 를 dep 에 넣으면 매 GPS 갱신마다 카메라가
    // 튀어 사용자 팬을 덮어쓴다. 의도적 생략.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  if (!MAPS_AVAILABLE || !center) return null;

  const path = list.map(p => ({latitude: p.lat, longitude: p.lon}));

  return (
    // 패널 모드는 pointerEvents none — 부모 Pressable 이 탭을 받아 전체화면으로 확장한다.
    // 전체화면 모드는 auto — 지도 자체가 팬·줌 제스처를 받는다.
    <View style={StyleSheet.absoluteFill} pointerEvents={interactive ? 'auto' : 'none'}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? MAP_PROVIDER_GOOGLE : undefined}
        userInterfaceStyle="dark"
        customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lon,
          latitudeDelta: interactive ? 0.01 : 0.004,
          longitudeDelta: interactive ? 0.01 : 0.004,
        }}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
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
    </View>
  );
}

const s = StyleSheet.create({
  posOuter: {
    width: rs(22),
    height: rs(22),
    borderRadius: rs(11),
    backgroundColor: 'rgba(255,122,45,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posInner: {
    width: rs(12),
    height: rs(12),
    borderRadius: rs(6),
    backgroundColor: T2,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
