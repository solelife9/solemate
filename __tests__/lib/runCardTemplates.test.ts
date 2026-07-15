/**
 * lib/shareCard — 공유 카드 레이아웃·배경·크기 registry(순수) 검증.
 * 스트라바 방식: 레이아웃(가로/세로/히어로)만 고르고 지도·지표는 on/off 토글.
 * @format
 */
import {
  RUN_CARD_LAYOUTS,
  RUN_CARD_LAYOUT_LABEL,
  RUN_CARD_BACKGROUND_LABEL,
  runCardElements,
  runCardDimensions,
  clampRunCardScale,
  RUN_CARD_SCALE_MIN,
  RUN_CARD_SCALE_MAX,
} from '../../lib/shareCard';

describe('RUN_CARD_LAYOUTS (순서·라벨)', () => {
  test('가로(classic)가 맨 앞(기본)', () => {
    expect(RUN_CARD_LAYOUTS[0]).toBe('classic');
  });
  test('3종 — 가로·세로·히어로', () => {
    expect(RUN_CARD_LAYOUTS).toEqual(['classic', 'vertical', 'hero']);
    expect(RUN_CARD_LAYOUT_LABEL.classic).toBe('가로');
    expect(RUN_CARD_LAYOUT_LABEL.vertical).toBe('세로');
    expect(RUN_CARD_LAYOUT_LABEL.hero).toBe('히어로');
  });
  test('배경 라벨(투명/다크/사진)', () => {
    expect(RUN_CARD_BACKGROUND_LABEL.transparent).toBe('투명');
    expect(RUN_CARD_BACKGROUND_LABEL.dark).toBe('다크');
    expect(RUN_CARD_BACKGROUND_LABEL.photo).toBe('사진');
  });
});

describe('runCardElements (레이아웃 + 지도/지표 토글)', () => {
  test('가로 + 지도on + 지표on → 거리 포함 가로 행, 히어로 아님', () => {
    expect(runCardElements('classic', true, true)).toEqual({
      bigDistance: false, showStatsRow: true, statsVertical: false, includeDistanceInRow: true, map: true,
    });
  });

  test('가로 + 지표off → 거리를 거대 히어로로(단독), 행 없음', () => {
    const e = runCardElements('classic', true, false);
    expect(e.bigDistance).toBe(true);
    expect(e.showStatsRow).toBe(false);
    expect(e.includeDistanceInRow).toBe(false);
  });

  test('지도 토글 → map 반영', () => {
    expect(runCardElements('classic', false, true).map).toBe(false);
    expect(runCardElements('classic', true, true).map).toBe(true);
  });

  test('세로 → 거대 거리 + 세로 스탯(거리 행 미포함)', () => {
    expect(runCardElements('vertical', true, true)).toEqual({
      bigDistance: true, showStatsRow: true, statsVertical: true, includeDistanceInRow: false, map: true,
    });
  });

  test('히어로 → 거대 거리, 세로 아님', () => {
    const e = runCardElements('hero', true, true);
    expect(e.bigDistance).toBe(true);
    expect(e.statsVertical).toBe(false);
    expect(e.includeDistanceInRow).toBe(false);
  });

  test('세로·히어로는 지표 유무와 무관하게 항상 거대 거리', () => {
    expect(runCardElements('vertical', true, false).bigDistance).toBe(true);
    expect(runCardElements('hero', false, false).bigDistance).toBe(true);
  });

  test('includeDistanceInRow 는 가로+지표on 일 때만', () => {
    expect(runCardElements('classic', true, true).includeDistanceInRow).toBe(true);
    expect(runCardElements('classic', true, false).includeDistanceInRow).toBe(false);
    expect(runCardElements('vertical', true, true).includeDistanceInRow).toBe(false);
    expect(runCardElements('hero', true, true).includeDistanceInRow).toBe(false);
  });
});

describe('runCardDimensions (피드 4:5 고정)', () => {
  test('1080×1350', () => {
    expect(runCardDimensions()).toEqual({w: 1080, h: 1350});
    expect(runCardDimensions('feed')).toEqual({w: 1080, h: 1350});
  });
});

describe('clampRunCardScale', () => {
  test('범위 안은 그대로, 밖은 클램프, 비유한→1', () => {
    expect(clampRunCardScale(1.2)).toBe(1.2);
    expect(clampRunCardScale(9)).toBe(RUN_CARD_SCALE_MAX);
    expect(clampRunCardScale(0.1)).toBe(RUN_CARD_SCALE_MIN);
    expect(clampRunCardScale(NaN)).toBe(1);
    expect(clampRunCardScale(Infinity)).toBe(1);
  });
});
