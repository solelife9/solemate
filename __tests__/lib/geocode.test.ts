/**
 * lib/geocode — 위치 라벨(OS 역지오코딩) 순수 포맷 + 실패 폴백.
 * Nominatim 은퇴(2026-07-17) 후 expo-location 내장 지오코더 기반. 라벨은 장식 —
 * 어떤 실패도 빈 문자열로 조용히 떨어져 러닝 저장을 막지 않는다.
 * @format
 */
import {formatGeoLabelKo, reverseGeoLabelKo} from '../../lib/geocode';
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
});
