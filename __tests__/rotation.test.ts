/**
 * lib/rotation.ts — recommendRotation 의 정렬 규칙 단위 검증.
 * 수용 테스트(@slice-4 신발 로테이션 추천)가 다루지 않는 가지 — runType 카테고리
 * 매칭 우선, 누적 사용(런 수) 마모 분산 tie-break, 브랜드 폴백 — 을 못박는다.
 */
import {recommendRotation, RotationShoe, RotationRun} from '../lib/rotation';

describe('recommendRotation — 정렬 규칙', () => {
  test('runType 카테고리 매칭이 휴식보다 우선한다', () => {
    // 카본화(Vaporfly)는 어제 신었고(덜 쉼), 데일리(Pegasus)는 더 오래 쉬었다.
    // 그래도 runType=race 면 카테고리 매칭(carbon_racing)이 우선 → 카본화가 pick-0.
    const shoes: RotationShoe[] = [
      {id: 'daily', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'carbon', brand: 'Nike', model: 'Vaporfly 4'},
    ];
    const runs: RotationRun[] = [
      {shoeId: 'daily', date: '2026-05-20'}, // 더 오래 쉼
      {shoeId: 'carbon', date: '2026-06-02'}, // 덜 쉼
    ];
    const picks = recommendRotation({shoes, runs, runType: 'race', today: '2026-06-03'});
    expect(picks[0].shoe.id).toBe('carbon');
    expect(picks[1].shoe.id).toBe('daily');
  });

  test('같은 카테고리·같은 휴식이면 누적 사용(런 수) 적은 신발이 우선(마모 분산)', () => {
    const shoes: RotationShoe[] = [
      {id: 'worn', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'fresh', brand: 'Adidas', model: 'Adizero SL2'},
    ];
    // 둘 다 같은 날 마지막 착용(휴식 동률), 'worn' 은 런 3회·'fresh' 는 1회 → fresh 우선.
    const runs: RotationRun[] = [
      {shoeId: 'worn', date: '2026-05-30'},
      {shoeId: 'worn', date: '2026-05-29'},
      {shoeId: 'worn', date: '2026-06-01'},
      {shoeId: 'fresh', date: '2026-06-01'},
    ];
    const picks = recommendRotation({shoes, runs, runType: 'easy', today: '2026-06-03'});
    expect(picks[0].shoe.id).toBe('fresh');
  });

  test('커스텀/미매칭 신발도 브랜드 폴백으로 카테고리를 얻어 추천에 포함된다', () => {
    // 'Nike Custom XYZ' 는 카탈로그에 없지만 Nike 브랜드 폴백으로 카테고리를 추정한다.
    const shoes: RotationShoe[] = [
      {id: 'custom', brand: 'Nike', model: 'Custom XYZ'},
      {id: 'known', brand: 'Adidas', model: 'Adizero SL2'},
    ];
    const picks = recommendRotation({shoes, runs: [], today: '2026-06-03'});
    expect(picks.length).toBe(2);
    expect(picks.every(p => typeof p.reason === 'string' && p.reason.length > 0)).toBe(true);
    expect(picks.map(p => p.shoe.id).sort()).toEqual(['custom', 'known']);
  });

  test('score 는 우선순위 내림차순(pick-0 가 최고점)', () => {
    const shoes: RotationShoe[] = [
      {id: 'a', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'c', brand: 'Adidas', model: 'Adizero SL2'},
    ];
    const runs: RotationRun[] = [
      {shoeId: 'a', date: '2026-06-02'},
      {shoeId: 'c', date: '2026-05-26'},
    ];
    const picks = recommendRotation({shoes, runs, today: '2026-06-03'});
    expect(picks[0].score).toBeGreaterThan(picks[1].score);
  });
});
