/**
 * lib/shareCard — 공유 카드 템플릿·포맷·배경·크기 registry(순수) 검증.
 * picker/렌더가 공유하는 단일 진실원. 전부 투명 스티커(배경 없음)가 기본이고,
 * 템플릿은 '어떤 요소(지도·지표·히어로)를 담느냐'만 다르다.
 * @format
 */
import {
  RUN_CARD_TEMPLATES,
  RUN_CARD_TEMPLATE_LABEL,
  RUN_CARD_FORMAT_LABEL,
  RUN_CARD_BACKGROUND_LABEL,
  runCardElements,
  runCardDimensions,
  clampRunCardScale,
  RUN_CARD_SCALE_MIN,
  RUN_CARD_SCALE_MAX,
  type RunCardTemplate,
} from '../../lib/shareCard';

describe('RUN_CARD_TEMPLATES (순서·라벨)', () => {
  test('클래식이 맨 앞(기본 선택, 가장 많이 씀)', () => {
    expect(RUN_CARD_TEMPLATES[0]).toBe('classic');
  });

  test('5종 — 클래식·히어로·미니멀·스탯·지도', () => {
    expect(RUN_CARD_TEMPLATES).toEqual(['classic', 'hero', 'minimal', 'stats', 'route']);
  });

  test('모든 템플릿에 한글 라벨이 있다', () => {
    for (const t of RUN_CARD_TEMPLATES) {
      expect(RUN_CARD_TEMPLATE_LABEL[t]).toBeTruthy();
    }
  });

  test('포맷·배경 라벨(피드/세로형, 투명/다크)', () => {
    expect(RUN_CARD_FORMAT_LABEL.feed).toBe('피드');
    expect(RUN_CARD_FORMAT_LABEL.story).toBe('세로형');
    expect(RUN_CARD_BACKGROUND_LABEL.transparent).toBe('투명');
    expect(RUN_CARD_BACKGROUND_LABEL.dark).toBe('다크');
    expect(RUN_CARD_BACKGROUND_LABEL.photo).toBe('사진');
  });
});

describe('runCardElements (요소 on/off)', () => {
  test('클래식 = 지도 + 스탯(D/P/T)', () => {
    expect(runCardElements('classic')).toEqual({
      map: true, statsRow: true, heroDistance: false, statsIncludeDistance: true,
    });
  });

  test('히어로 = 거대 거리 + 지도 + 스탯(거리 제외 → P/T)', () => {
    const e = runCardElements('hero');
    expect(e.heroDistance).toBe(true);
    expect(e.map).toBe(true);
    expect(e.statsRow).toBe(true);
    // 히어로가 거리를 크게 보이므로 스탯 행은 거리 칸을 뺀다(중복 방지).
    expect(e.statsIncludeDistance).toBe(false);
  });

  test('미니멀 = 거리 하나(지도·스탯 off)', () => {
    expect(runCardElements('minimal')).toEqual({
      map: false, statsRow: false, heroDistance: true, statsIncludeDistance: false,
    });
  });

  test('스탯 = D/P/T (지도 off)', () => {
    const e = runCardElements('stats');
    expect(e.map).toBe(false);
    expect(e.statsRow).toBe(true);
    expect(e.statsIncludeDistance).toBe(true);
  });

  test('지도 = 지도만 (지표 off)', () => {
    expect(runCardElements('route')).toEqual({
      map: true, statsRow: false, heroDistance: false, statsIncludeDistance: false,
    });
  });

  test('statsIncludeDistance 는 스탯행이 있고 히어로가 아닐 때만 참', () => {
    for (const t of RUN_CARD_TEMPLATES) {
      const e = runCardElements(t);
      expect(e.statsIncludeDistance).toBe(e.statsRow && !e.heroDistance);
    }
  });

  test('알 수 없는 값 → 클래식으로 폴백(방어)', () => {
    expect(runCardElements('bogus' as RunCardTemplate)).toEqual(runCardElements('classic'));
  });
});

describe('runCardDimensions (포맷별 캔버스)', () => {
  test('피드 = 1080×1350 (4:5)', () => {
    expect(runCardDimensions('feed')).toEqual({w: 1080, h: 1350});
  });
  test('세로형 = 1080×1920 (9:16)', () => {
    expect(runCardDimensions('story')).toEqual({w: 1080, h: 1920});
  });
});

describe('clampRunCardScale (크기 배율 보정)', () => {
  test('범위 안은 그대로', () => {
    expect(clampRunCardScale(1)).toBe(1);
    expect(clampRunCardScale(1.2)).toBe(1.2);
  });
  test('상·하한으로 클램프', () => {
    expect(clampRunCardScale(5)).toBe(RUN_CARD_SCALE_MAX);
    expect(clampRunCardScale(0.1)).toBe(RUN_CARD_SCALE_MIN);
  });
  test('비유한(NaN·Infinity) → 1로 폴백', () => {
    expect(clampRunCardScale(NaN)).toBe(1);
    expect(clampRunCardScale(Infinity)).toBe(1);
    expect(clampRunCardScale(-Infinity)).toBe(1);
  });
});
