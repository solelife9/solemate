/**
 * lib/geocode — 위치 라벨(OS 역지오코딩) 순수 포맷 + 실패 폴백.
 * Nominatim 은퇴(2026-07-17) 후 expo-location 내장 지오코더 기반. 라벨은 장식 —
 * 어떤 실패도 빈 문자열로 조용히 떨어져 러닝 저장을 막지 않는다.
 * @format
 */
import {formatGeoLabelKo, reverseGeoLabelKo, GEOCODE_TIMEOUT_MS} from '../../lib/geocode';
import * as Location from 'expo-location';

describe('formatGeoLabelKo — "동네, 도시" 라벨', () => {
  test('district+city → "성수동, 서울"', () => {
    expect(formatGeoLabelKo({district: '성수동', city: '서울'})).toBe('성수동, 서울');
  });
  test('district 없으면 subregion→street→name 순 폴백', () => {
    expect(formatGeoLabelKo({subregion: '성동구', city: '서울'})).toBe('성동구, 서울');
    expect(formatGeoLabelKo({street: '왕십리로', city: '서울'})).toBe('왕십리로, 서울');
    expect(formatGeoLabelKo({name: '서울숲', city: '서울'})).toBe('서울숲, 서울');
  });
  test('city 없으면 region 폴백, 한 칸만 있으면 그 칸만', () => {
    expect(formatGeoLabelKo({district: '판교동', region: '경기'})).toBe('판교동, 경기');
    expect(formatGeoLabelKo({city: '부산'})).toBe('부산');
  });
  test('동일 값 중복 제거("서울, 서울" 방지)·빈 주소는 빈 문자열', () => {
    expect(formatGeoLabelKo({name: '서울', city: '서울'})).toBe('서울');
    expect(formatGeoLabelKo({})).toBe('');
    expect(formatGeoLabelKo(null)).toBe('');
  });
});

describe('reverseGeoLabelKo — OS 지오코더 배선·실패 폴백', () => {
  afterEach(() => {
    (Location.reverseGeocodeAsync as jest.Mock).mockReset();
    (Location.reverseGeocodeAsync as jest.Mock).mockResolvedValue([]);
  });
  test('첫 결과를 라벨로 포맷한다', async () => {
    (Location.reverseGeocodeAsync as jest.Mock).mockResolvedValue([
      {district: '성수동', city: '서울'},
    ]);
    await expect(reverseGeoLabelKo(37.54, 127.05)).resolves.toBe('성수동, 서울');
    expect(Location.reverseGeocodeAsync).toHaveBeenCalledWith({latitude: 37.54, longitude: 127.05});
  });
  test('빈 결과·예외 모두 빈 문자열(저장 비차단 계약)', async () => {
    (Location.reverseGeocodeAsync as jest.Mock).mockResolvedValue([]);
    await expect(reverseGeoLabelKo(0, 0)).resolves.toBe('');
    (Location.reverseGeocodeAsync as jest.Mock).mockRejectedValue(new Error('no geocoder'));
    await expect(reverseGeoLabelKo(0, 0)).resolves.toBe('');
  });
  // QA 감사 Q-3: 완주 저장 경로가 이 호출을 **기다린다**(저장 직전 폴백). 그 폴백이 도는
  // 조건이 "첫 fix 지오코딩 실패" = 네트워크 없음 이라, 응답하지 않는 지오코더는 곧 저장이
  // 멈추는 것이었다. 제한 시간은 모듈이 스스로 지킨다 — 호출부가 기다리든 말든 안전하게.
  test('응답하지 않는 지오코더도 제한 시간 안에 빈 문자열로 끝난다(저장이 멈추지 않는다)', async () => {
    jest.useFakeTimers();
    try {
      (Location.reverseGeocodeAsync as jest.Mock).mockReturnValue(new Promise(() => {})); // 영원히 pending
      const p = reverseGeoLabelKo(37.5, 127.0);
      let settled = false;
      void p.then(() => {
        settled = true;
      });

      // 제한 시간 직전까지는 아직 대기 중.
      jest.advanceTimersByTime(GEOCODE_TIMEOUT_MS - 1);
      await Promise.resolve();
      expect(settled).toBe(false);

      // 제한 시간을 넘기면 라벨 없이 진행한다.
      jest.advanceTimersByTime(2);
      await expect(p).resolves.toBe('');
    } finally {
      jest.useRealTimers();
    }
  });
});
