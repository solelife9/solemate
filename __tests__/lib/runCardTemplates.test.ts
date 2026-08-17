/**
 * lib/shareCard — 공유 카드 레이아웃 registry + 컴팩트 배치(layoutShareCard) 검증.
 * 세로/가로/6지표, 지도·지표 토글, keego 를 지표 밑에 붙인 컴팩트 스티커(캔버스=내용 높이).
 * @format
 */
import {
  RUN_CARD_LAYOUTS,
  RUN_CARD_LAYOUT_LABEL,
  RUN_CARD_BACKGROUND_LABEL,
  buildShareCardModel,
  layoutShareCard,
  clampRunCardScale,
  RUN_CARD_SCALE_MIN,
  RUN_CARD_SCALE_MAX,
} from '../../lib/shareCard';

const MODEL = buildShareCardModel({
  distKm: 5.2, unit: 'km', pace: "5'02\"", time: '40:41', durationS: 2441,
  calories: 234, bpm: 161, cadence: 172, elevM: 24,
});
const labelsOf = (cfg: any) => layoutShareCard(MODEL, cfg).texts.map(t => t.value);

describe('RUN_CARD_LAYOUTS (순서·라벨)', () => {
  test('지도(hero)가 맨 앞(기본), 4종', () => {
    // 2026-08-17: 지도가 주인공인 'hero' 를 신설하고 기본으로 올렸다(민우님 확정).
    // 종전 기본은 'vertical' 이었고, 지도가 카드의 23% 라 작다는 지적이 계기였다.
    expect(RUN_CARD_LAYOUTS).toEqual(['hero', 'vertical', 'classic', 'grid']);
    expect(RUN_CARD_LAYOUT_LABEL.hero).toBe('지도');
    expect(RUN_CARD_LAYOUT_LABEL.vertical).toBe('세로');
    expect(RUN_CARD_LAYOUT_LABEL.classic).toBe('가로');
    expect(RUN_CARD_LAYOUT_LABEL.grid).toBe('6지표');
  });
  test('배경 라벨', () => {
    expect(RUN_CARD_BACKGROUND_LABEL.transparent).toBe('투명');
    expect(RUN_CARD_BACKGROUND_LABEL.dark).toBe('다크');
    expect(RUN_CARD_BACKGROUND_LABEL.photo).toBe('사진');
  });
});

describe('buildShareCardModel — 6지표 추가 지표', () => {
  test('칼로리·케이던스·심박·고도가 stats 에 붙는다(있을 때)', () => {
    const labels = MODEL.stats.map(s => s.label);
    expect(labels).toEqual(['PACE', 'TIME', 'CALORIES', 'CADENCE', 'HR', 'ELEV']);
    expect(MODEL.stats.find(s => s.label === 'HR')!.value).toBe('161');
    expect(MODEL.stats.find(s => s.label === 'CALORIES')!.value).toBe('234');
    expect(MODEL.stats.find(s => s.label === 'ELEV')!.value).toBe('24 m');
  });
  test('없으면 안 붙는다', () => {
    const m = buildShareCardModel({distKm: 3, pace: "6'00\"", time: '18:00'});
    expect(m.stats.map(s => s.label)).toEqual(['PACE', 'TIME']);
  });
});

describe('layoutShareCard — 컴팩트 배치', () => {
  test('세로/가로 = 거리·페이스·시간 3지표(추가지표 제외)', () => {
    for (const layout of ['vertical', 'classic'] as const) {
      const v = labelsOf({layout, showMap: true, showStats: true});
      expect(v).toContain('DISTANCE');
      expect(v).toContain('5.20 km');
      expect(v).toContain('PACE');
      expect(v).toContain('TIME');
      expect(v).not.toContain('HR');       // 6지표에서만
      expect(v).toContain('keego');
    }
  });

  test('6지표 = 거리+페이스+시간+칼로리+케이던스+심박(최대 6, 초과분 ELEV 는 밀림)', () => {
    const v = labelsOf({layout: 'grid', showMap: true, showStats: true});
    ['DISTANCE', 'PACE', 'TIME', 'CALORIES', 'CADENCE', 'HR'].forEach(l => expect(v).toContain(l));
    // 7번째(ELEV)는 6칸을 넘어 제외.
    expect(v).not.toContain('ELEV');
  });

  test('지표 off(세로/가로) → 거리만', () => {
    const v = labelsOf({layout: 'vertical', showMap: true, showStats: false});
    expect(v).toContain('DISTANCE');
    expect(v).not.toContain('PACE');
  });

  test('지도 off → map null, 있으면 박스', () => {
    expect(layoutShareCard(MODEL, {layout: 'vertical', showMap: false, showStats: true}).map).toBeNull();
    const withMap = layoutShareCard(MODEL, {layout: 'vertical', showMap: true, showStats: true}).map;
    expect(withMap).not.toBeNull();
    expect(withMap!.size).toBeGreaterThan(0);
  });

  test('컴팩트 — 캔버스 폭 1080, 높이는 양수·내용 크기(1350 미만이면 컴팩트)', () => {
    const L = layoutShareCard(MODEL, {layout: 'vertical', showMap: true, showStats: true});
    expect(L.w).toBe(1080);
    expect(L.h).toBeGreaterThan(400);
    // keego 는 지표 밑에 붙어 캔버스 하단 근처(맨 아래 텍스트).
    const wm = L.texts.find(t => t.papaya);
    expect(wm).toBeTruthy();
    expect(wm!.y).toBeGreaterThan(L.h - 200);
  });

  test('지도 크기 배율 → 지도 박스·캔버스 높이 반영', () => {
    const small = layoutShareCard(MODEL, {layout: 'vertical', showMap: true, showStats: true, mapScale: 0.8});
    const big = layoutShareCard(MODEL, {layout: 'vertical', showMap: true, showStats: true, mapScale: 1.3});
    expect(big.map!.size).toBeGreaterThan(small.map!.size);
    expect(big.h).toBeGreaterThan(small.h);
  });
});

describe('기록 모먼트(moment) — 리본', () => {
  test('moment 는 기본 레이아웃 목록엔 없고 라벨만 있다', () => {
    expect(RUN_CARD_LAYOUTS).not.toContain('moment');
    expect(RUN_CARD_LAYOUT_LABEL.moment).toBe('기록');
  });
  test('buildShareCardModel 이 moment 를 담는다', () => {
    expect(buildShareCardModel({distKm: 10, moment: '네거티브 스플릿'}).moment).toBe('네거티브 스플릿');
    expect(buildShareCardModel({distKm: 10}).moment).toBe('');
  });
  test('layout=moment → 리본 + 세로 지표', () => {
    const m = buildShareCardModel({distKm: 10.42, pace: "5'01\"", time: '52:18', moment: '개인 최고 거리'});
    const L = layoutShareCard(m, {layout: 'moment', showMap: true, showStats: true});
    expect(L.ribbon).not.toBeNull();
    expect(L.ribbon!.text).toBe('개인 최고 거리');
    const labels = L.texts.map(t => t.value);
    expect(labels).toContain('DISTANCE');
    expect(labels).toContain('PACE');
  });
  test('다른 레이아웃엔 리본 없음(moment 있어도)', () => {
    const m = buildShareCardModel({distKm: 10, moment: '개인 최고 거리'});
    expect(layoutShareCard(m, {layout: 'vertical', showMap: true, showStats: true}).ribbon).toBeNull();
  });
});

describe('clampRunCardScale', () => {
  test('범위·비유한 보정', () => {
    expect(clampRunCardScale(1.2)).toBe(1.2);
    expect(clampRunCardScale(9)).toBe(RUN_CARD_SCALE_MAX);
    expect(clampRunCardScale(0.1)).toBe(RUN_CARD_SCALE_MIN);
    expect(clampRunCardScale(NaN)).toBe(1);
  });
});
