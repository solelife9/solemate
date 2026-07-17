// ─── geocode — 러닝 위치 라벨(역지오코딩) ──────────────────────────────────────
// Nominatim(OSM 공용 서버) 은퇴(2026-07-17): 상용 앱 사용은 OSM 정책 회색지대 +
// 외부 서버 의존이었다 → 이미 승인된 의존성 expo-location 의 OS 내장 역지오코딩
// (iOS CLGeocoder/Android Geocoder)으로 교체. 기기 로케일(한국어)로 지명이 온다.
// 라벨 문법은 기존과 동일: "동네, 도시"(예: "성수동, 서울") — 저장 포맷 불변.

import * as Location from 'expo-location';

type Addr = {
  district?: string | null;
  subregion?: string | null;
  street?: string | null;
  name?: string | null;
  city?: string | null;
  region?: string | null;
};

/**
 * OS 역지오코딩 주소 → "동네, 도시" 라벨(순수 — 테스트 가능).
 * 앞칸=가장 좁은 동네 단위(district→subregion→street→name), 뒤칸=도시(city→region).
 * 값이 같으면 중복 제거("서울, 서울" 방지), 없으면 빈 문자열.
 */
export function formatGeoLabelKo(addr: Addr | null | undefined): string {
  if (!addr) return '';
  const hood = addr.district || addr.subregion || addr.street || addr.name || '';
  const city = addr.city || addr.region || '';
  const parts = [hood, city].filter(Boolean);
  const uniq = parts.filter((p, i) => parts.indexOf(p) === i);
  return uniq.join(', ');
}

/**
 * 좌표 → 위치 라벨. 실패/미확인은 빈 문자열(라벨은 장식 — 러닝 저장을 막지 않는다).
 * OS 지오코더는 네트워크 상태에 따라 수 초 걸릴 수 있어 호출부는 비차단으로 쓴다.
 */
export async function reverseGeoLabelKo(lat: number, lon: number): Promise<string> {
  try {
    const res = await Location.reverseGeocodeAsync({latitude: lat, longitude: lon});
    return formatGeoLabelKo(res && res[0]);
  } catch {
    return '';
  }
}
