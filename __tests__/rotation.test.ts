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

  test('같은 카테고리·동일 휴식이면 누적거리(Σ km) 적은 신발이 우선(마모 분산)', () => {
    const shoes: RotationShoe[] = [
      {id: 'far', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'near', brand: 'Adidas', model: 'Adizero SL2'},
    ];
    // 둘 다 같은 날 마지막 착용(휴식 동률). 'far' 누적 40km, 'near' 누적 10km → near 우선.
    const runs: RotationRun[] = [
      {shoeId: 'far', date: '2026-06-01', km: 40},
      {shoeId: 'near', date: '2026-06-01', km: 10},
    ];
    const picks = recommendRotation({shoes, runs, runType: 'easy', today: '2026-06-03'});
    expect(picks[0].shoe.id).toBe('near');
    expect(picks[1].shoe.id).toBe('far');
  });

  test('마모 분산 tie-break 는 등록거리(start_km)도 센다 — 이미 신던 신발로 몰아주지 않음', () => {
    // 둘 다 같은 날 마지막 착용(휴식 동률). 'preworn' 은 등록 450km + 런 20km(오도미터 470),
    // 'newish' 는 등록 0 + 런 60km(오도미터 60). 런 km 만 보면 preworn(20)<newish(60)라
    // preworn 이 '덜 마모'로 먼저 추천되지만(과거 버그), 오도미터로는 newish 가 덜 마모 →
    // newish 우선(더 마모된 preworn 에 몰아주는 역효과 차단).
    const shoes: RotationShoe[] = [
      {id: 'preworn', brand: 'Nike', model: 'Pegasus 41', start_km: 450},
      {id: 'newish', brand: 'Adidas', model: 'Adizero SL2', start_km: 0},
    ];
    const runs: RotationRun[] = [
      {shoeId: 'preworn', date: '2026-06-01', km: 20},
      {shoeId: 'newish', date: '2026-06-01', km: 60},
    ];
    const picks = recommendRotation({shoes, runs, runType: 'easy', today: '2026-06-03'});
    expect(picks[0].shoe.id).toBe('newish');
    expect(picks[1].shoe.id).toBe('preworn');
  });

  test('거리 tie-break는 런 수 대용이 아니다: 런 1회 30km > 런 3회 9km 로 마모 판정', () => {
    // 'big' 은 30km 1회(런 수 1, 거리 30), 'small' 은 3km 3회(런 수 3, 거리 9).
    // run count 로 정렬하면 'big'(1회)이 '덜 씀'이라 먼저 와 의도가 뒤집히지만,
    // 누적거리(30 > 9)로 정렬하면 'small'(9km)이 덜 마모 → 먼저 추천돼야 한다.
    const shoes: RotationShoe[] = [
      {id: 'big', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'small', brand: 'Adidas', model: 'Adizero SL2'},
    ];
    const runs: RotationRun[] = [
      {shoeId: 'big', date: '2026-06-01', km: 30}, // 1회 30km
      {shoeId: 'small', date: '2026-06-01', km: 3}, // 3km × 3회 = 9km
      {shoeId: 'small', date: '2026-05-31', km: 3},
      {shoeId: 'small', date: '2026-05-30', km: 3},
    ];
    const picks = recommendRotation({shoes, runs, runType: 'easy', today: '2026-06-03'});
    // 휴식 동률(둘 다 06-01) → 거리(small 9 < big 30)로 small 이 먼저.
    expect(picks[0].shoe.id).toBe('small');
    expect(picks[1].shoe.id).toBe('big');
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

  test('구조화 필드(reasonKind·restDays) — UI 가 reason 문자열을 파싱하지 않아도 되는 계약', () => {
    const shoes: RotationShoe[] = [
      {id: 'daily', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'carbon', brand: 'Nike', model: 'Vaporfly 4'},
      {id: 'unworn', brand: 'Adidas', model: 'Adizero SL2'},
    ];
    const runs: RotationRun[] = [
      {shoeId: 'daily', date: '2026-06-01'}, // 2일 휴식
      {shoeId: 'carbon', date: '2026-05-28'}, // 6일 휴식(카본)
    ];
    const picks = recommendRotation({shoes, runs, today: '2026-06-03'});
    const byId = Object.fromEntries(picks.map(p => [p.shoe.id, p]));

    expect(byId.unworn.reasonKind).toBe('unworn');
    expect(byId.unworn.restDays).toBeUndefined();

    // 카본화는 '아껴두기' 분류 + 휴식 일수 병기.
    expect(byId.carbon.reasonKind).toBe('carbon');
    expect(byId.carbon.restDays).toBe(6);

    // 비카본 신발은 reason 에 '카본화는 쉬게'가 들어가도 rest 분류다
    // (구 정규식 파싱이 이 문구를 카본으로 오판하던 회귀 방지).
    expect(byId.daily.reason).toContain('카본화는 쉬게');
    expect(byId.daily.reasonKind).toBe('rest');
    expect(byId.daily.restDays).toBe(2);
  });

  test('오늘 신은 신발은 reasonKind=today (카본화여도 today 유지)', () => {
    const shoes: RotationShoe[] = [
      {id: 'daily', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'carbon', brand: 'Nike', model: 'Vaporfly 4'},
    ];
    const runs: RotationRun[] = [
      {shoeId: 'daily', date: '2026-06-01'},
      {shoeId: 'carbon', date: '2026-06-03'}, // 오늘
    ];
    const picks = recommendRotation({shoes, runs, today: '2026-06-03'});
    const byId = Object.fromEntries(picks.map(p => [p.shoe.id, p]));
    expect(byId.carbon.reasonKind).toBe('today');
    expect(byId.carbon.restDays).toBeUndefined();
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

// ── 마모 분산 기준 = 사용률(2026-07-26 출시 심사 B-14) ───────────────────────
// 절대 누적 km 로 비교하면 수명이 짧은 신발이 과대평가돼 '더 닳은 신발'을 먼저 권한다.
describe('마모 분산은 수명 대비 사용률로 판단한다', () => {
  const base = (id: string, brand: string, model: string, max_km: number, start_km: number) =>
    ({id, brand, model, max_km, start_km});

  test('누적거리가 더 적어도 사용률이 높으면 뒤로 밀린다', () => {
    // 카본화: 400/500 = 80% 소모 · 데일리화: 450/800 = 56% 소모
    // 절대 km 로는 카본화(400)가 앞서지만, 사용률로는 데일리화가 먼저 와야 한다.
    const shoes = [
      base('carbon', 'Nike', 'Alphafly 3', 500, 400),
      base('daily', 'Nike', 'Pegasus 41', 800, 450),
    ];
    const picks = recommendRotation({shoes, runs: []});
    expect(picks[0].shoe.id).toBe('daily');
    expect(picks[1].shoe.id).toBe('carbon');
  });

  test('수명이 같으면 예전처럼 누적거리 적은 쪽이 먼저다', () => {
    const shoes = [
      base('more', 'Nike', 'Pegasus 41', 600, 300),
      base('less', 'Nike', 'Pegasus 41', 600, 100),
    ];
    const picks = recommendRotation({shoes, runs: []});
    expect(picks[0].shoe.id).toBe('less');
  });

  test('max_km 이 전부 없으면 결과가 절대 거리 순과 같다(하위호환)', () => {
    const shoes = [
      {id: 'a', brand: 'Nike', model: 'Pegasus 41', start_km: 300},
      {id: 'b', brand: 'Nike', model: 'Pegasus 41', start_km: 100},
    ];
    const picks = recommendRotation({shoes, runs: []});
    expect(picks.map(p => p.shoe.id)).toEqual(['b', 'a']);
  });

  test('런 거리도 사용률에 반영된다(등록거리 + 런 합)', () => {
    const shoes = [
      base('short', 'Nike', 'Alphafly 3', 400, 0),
      base('long', 'Nike', 'Pegasus 41', 1000, 0),
    ];
    // 같은 날 같은 거리를 달렸다면 수명이 짧은 쪽 사용률이 더 높다.
    const runs = [
      {shoeId: 'short', date: '2026-07-01', km: 200},
      {shoeId: 'long', date: '2026-07-01', km: 200},
    ];
    const picks = recommendRotation({shoes, runs, today: '2026-07-10'});
    expect(picks[0].shoe.id).toBe('long'); // 20% < 50%
  });
});
