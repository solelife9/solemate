// ─── geocode — 러닝 위치 라벨(역지오코딩) ──────────────────────────────────────
// Nominatim(OSM 공용 서버) 은퇴(2026-07-17): 상용 앱 사용은 OSM 정책 회색지대 +
// 외부 서버 의존이었다 → 이미 승인된 의존성 expo-location 의 OS 내장 역지오코딩
// (iOS CLGeocoder/Android Geocoder)으로 교체. 기기 로케일(한국어)로 지명이 온다.
// 라벨 문법은 기존과 동일: "동네, 도시"(예: "성수동, 서울") — 저장 포맷 불변.

import * as Location from 'expo-location';
import {withTimeoutOr} from './withTimeout';

/**
 * 역지오코딩 제한 시간(ms).
 *
 * 왜 필요한가(2026-08-04 QA 감사 Q-3): 이 모듈은 스스로 "호출부는 비차단으로 쓴다"고
 * 적어 뒀지만, **완주 저장 경로는 실제로 이 호출을 기다리고 있었다**(RunEngine 의 저장 직전
 * 폴백). 그 폴백이 도는 조건이 하필 "첫 fix 지오코딩이 실패했다" = 네트워크가 없다 이므로,
 * 오프라인 러닝은 매번 이 대기를 탄다. 라벨은 장식이고 러닝 기록은 정본이다 — 우선순위가
 * 뒤집혀 있었다. 이제 제한 시간을 모듈이 스스로 지켜서, 어느 호출부가 기다리든 안전하다.
 * 5초: OS 지오코더가 정상 응답하는 시간(수백 ms)보다 충분히 크고, 사용자가 "멈췄다"고
 * 느끼기 전이다.
 */
export const GEOCODE_TIMEOUT_MS = 5000;

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
 * 좌표 → 위치 라벨. 실패·미확인·시간 초과는 전부 빈 문자열이다.
 *
 * **이 함수는 반드시 GEOCODE_TIMEOUT_MS 안에 끝난다.** 라벨은 장식이고 러닝 저장은 정본이라,
 * 호출부가 기다리든 말든 저장을 늦추지 않는 것이 이 모듈의 책임이다(Q-3). 늦게 도착한
 * 응답은 버려진다 — 그 라벨이 필요했다면 다음 러닝에서 다시 물으면 된다.
 */
export async function reverseGeoLabelKo(lat: number, lon: number): Promise<string> {
  return withTimeoutOr(
    (async () => {
      try {
        const res = await Location.reverseGeocodeAsync({latitude: lat, longitude: lon});
        return formatGeoLabelKo(res && res[0]);
      } catch {
        return '';
      }
    })(),
    GEOCODE_TIMEOUT_MS,
    '역지오코딩',
    '',
  );
}
