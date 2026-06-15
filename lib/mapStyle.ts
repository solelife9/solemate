// lib/mapStyle.ts — Google Maps(react-native-maps) 다크 스타일 JSON.
// Google Maps customMapStyle 은 hex 색을 요구하므로 hex 리터럴이 여기 모인다(화면 파일의
// "raw hex 0" 디자인 규칙과 분리). 상세보기 코스 지도에서만 쓴다.
export const DARK_MAP_STYLE = [
  {elementType: 'geometry', stylers: [{color: '#0f0f10'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#6b6b72'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#0f0f10'}]},
  {featureType: 'road', elementType: 'geometry', stylers: [{color: '#262626'}]},
  {featureType: 'road.arterial', elementType: 'geometry', stylers: [{color: '#333338'}]},
  {featureType: 'road.highway', elementType: 'geometry', stylers: [{color: '#3a3a3f'}]},
  {featureType: 'water', elementType: 'geometry', stylers: [{color: '#07070a'}]},
  {featureType: 'poi', stylers: [{visibility: 'off'}]},
  {featureType: 'transit', stylers: [{visibility: 'off'}]},
];
