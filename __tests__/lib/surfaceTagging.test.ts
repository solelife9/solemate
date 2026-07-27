/**
 * 노면 자동 태깅 계약 (2026-07-27, TOP50 #11 후속).
 *
 * 배경: 마모 모델은 완성돼 있었다 — SURFACE_FACTOR(트레드밀 0.85 · 트랙 0.9 · 로드 1.0 ·
 * 트레일 1.15)로 실효 마모를 계산한다. 그런데 노면을 **넣어주는 곳이 수동 런 추가/편집 폼
 * 하나뿐**이라, 실제로 달린 GPS 런은 전부 road(1.0)로 계산됐다. 정확도 장치가 실사용에서
 * 죽어 있던 것이다.
 *
 * 트랙 모드는 사용자가 직접 고른 **확정 정보**라 추측 없이 태깅할 수 있다.
 * 여기서는 그 태깅이 마모 계산에 실제로 반영되는지를 고정한다(배선은 App 이 한다).
 *
 * @format
 */
import {
  SURFACE_FACTOR,
  runEffectiveWear,
  parseSurface,
  getRunSurface,
  setRunSurface,
} from '../../lib/wearModel';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RUN = {shoe_id: 's1', distance_km: 10, duration_s: 3000}; // 10km, 5'00"/km

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('노면 계수가 마모에 반영된다', () => {
  it('트랙은 로드보다 덜 닳는다', () => {
    const road = runEffectiveWear(RUN, {surface: 'road'});
    const track = runEffectiveWear(RUN, {surface: 'track'});
    expect(track).toBeLessThan(road);
    expect(track / road).toBeCloseTo(SURFACE_FACTOR.track, 5);
  });

  it('트레일은 로드보다 더 닳는다', () => {
    expect(runEffectiveWear(RUN, {surface: 'trail'})).toBeGreaterThan(
      runEffectiveWear(RUN, {surface: 'road'}),
    );
  });

  it('트레드밀이 가장 덜 닳는다(쿠션·균일)', () => {
    const all = (['treadmill', 'track', 'road', 'trail'] as const).map(sfc =>
      runEffectiveWear(RUN, {surface: sfc}),
    );
    expect(Math.min(...all)).toBe(all[0]);
  });

  it('노면 미지정은 로드로 계산한다(추측하지 않는다)', () => {
    expect(runEffectiveWear(RUN)).toBeCloseTo(runEffectiveWear(RUN, {surface: 'road'}), 5);
  });
});

describe('노면 태그 저장·조회', () => {
  it("트랙으로 태깅하면 그대로 읽힌다", async () => {
    await setRunSurface('r1', 'track');
    await expect(getRunSurface('r1')).resolves.toBe('track');
  });

  it('태그가 없는 런은 로드로 읽힌다', async () => {
    await expect(getRunSurface('없는런')).resolves.toBe('road');
  });

  it('손상된 값은 로드로 정규화한다', () => {
    expect(parseSurface('우주')).toBe('road');
    expect(parseSurface(null)).toBe('road');
    expect(parseSurface(undefined)).toBe('road');
  });

  it('10km 트랙 런이면 마모가 9km 로 잡힌다(계수 0.9)', () => {
    // 사용자가 체감하는 크기 — '트랙 10km 를 달렸는데 신발은 9km 만큼 닳았다'.
    expect(runEffectiveWear(RUN, {surface: 'track'})).toBeCloseTo(9, 1);
  });
});
