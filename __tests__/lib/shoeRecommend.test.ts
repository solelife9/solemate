import {
  lastWornDate,
  recommendShoeId,
  restDays,
  costPerKm,
} from '../../lib/shoeRecommend';

describe('lastWornDate — 신발별 마지막 착용일(런에서 파생)', () => {
  const runs = [
    {shoe_id: 's1', run_date: '2026-05-20'},
    {shoe_id: 's1', run_date: '2026-05-28'}, // s1 최신
    {shoe_id: 's1', run_date: '2026-05-24'},
    {shoe_id: 's2', run_date: '2026-05-30'},
  ];

  test('해당 shoe_id의 가장 최근 run_date를 돌려준다', () => {
    expect(lastWornDate('s1', runs)).toBe('2026-05-28');
    expect(lastWornDate('s2', runs)).toBe('2026-05-30');
  });

  test('런이 없는 신발은 null(미착용)', () => {
    expect(lastWornDate('s3', runs)).toBeNull();
    expect(lastWornDate('s1', [])).toBeNull();
  });

  test('run_date에 시각이 붙어도 날짜 부분만 비교한다', () => {
    expect(
      lastWornDate('s1', [
        {shoe_id: 's1', run_date: '2026-05-28T23:00:00'},
        {shoe_id: 's1', run_date: '2026-05-29T01:00:00'},
      ]),
    ).toBe('2026-05-29');
  });
});

describe('recommendShoeId — 휴식 로테이션(가장 오래 쉰 신발)', () => {
  const shoes = [
    {id: 's1', max_km: 600},
    {id: 's2', max_km: 600},
    {id: 's3', max_km: 600},
  ];

  test('마지막 착용일이 가장 이른(가장 오래 쉰) 신발을 추천', () => {
    const runs = [
      {shoe_id: 's1', run_date: '2026-05-28'}, // 최근
      {shoe_id: 's2', run_date: '2026-05-20'}, // 가장 오래 쉼
      {shoe_id: 's3', run_date: '2026-05-25'},
    ];
    expect(recommendShoeId(shoes, runs)).toBe('s2');
  });

  test('한 번도 안 신은 신발이 최우선으로 추천된다', () => {
    const runs = [
      {shoe_id: 's1', run_date: '2026-05-28'},
      {shoe_id: 's2', run_date: '2026-05-20'},
      // s3은 미착용
    ];
    expect(recommendShoeId(shoes, runs)).toBe('s3');
  });

  test('보관(retired)된 신발은 추천에서 제외한다', () => {
    const withRetired = [
      {id: 's1', max_km: 600, retired: true}, // 미착용이지만 보관됨 → 제외
      {id: 's2', max_km: 600},
      {id: 's3', max_km: 600},
    ];
    const runs = [
      {shoe_id: 's2', run_date: '2026-05-28'},
      {shoe_id: 's3', run_date: '2026-05-20'},
    ];
    expect(recommendShoeId(withRetired, runs)).toBe('s3');
  });

  test('동률(둘 다 미착용)이면 먼저 등록된 신발을 유지(안정 정렬)', () => {
    expect(recommendShoeId(shoes, [])).toBe('s1');
  });

  test('활성 신발이 없으면 null', () => {
    expect(recommendShoeId([], [])).toBeNull();
    expect(
      recommendShoeId([{id: 's1', retired: true}], []),
    ).toBeNull();
  });
});

describe('restDays — 마지막 착용 이후 쉰 일수', () => {
  const runs = [{shoe_id: 's1', run_date: '2026-05-28'}];

  test('오늘과의 일수 차를 돌려준다', () => {
    expect(restDays('s1', runs, '2026-05-31')).toBe(3);
    expect(restDays('s1', runs, '2026-05-28')).toBe(0); // 오늘 신음
  });

  test('미착용 신발은 null', () => {
    expect(restDays('s9', runs, '2026-05-31')).toBeNull();
  });

  test('미래 착용일(데이터 이상)은 0으로 하한', () => {
    expect(restDays('s1', runs, '2026-05-20')).toBe(0);
  });
});

describe('costPerKm — km당 비용(구매가 / 누적 거리)', () => {
  test('구매가를 누적 거리로 나눈다', () => {
    expect(costPerKm(180000, 600)).toBeCloseTo(300, 5); // 600km 뛴 18만원 신발 → 300원/km
    expect(costPerKm(150000, 300)).toBeCloseTo(500, 5);
  });

  test('거리 0(새 신발)·구매가 0/미입력은 null(의미 없는 비용/0 나눗셈 금지)', () => {
    expect(costPerKm(180000, 0)).toBeNull();
    expect(costPerKm(0, 600)).toBeNull();
    expect(costPerKm(NaN, 600)).toBeNull();
    expect(costPerKm(180000, -5)).toBeNull();
  });
});
