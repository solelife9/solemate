// lib/appViewModel — 백엔드 레코드 → 화면 형태 변환(순수).
// 이 로직은 App.tsx 안에 있어서 앱을 통째로 마운트해야만 검증할 수 있었다. 밖으로
// 꺼내면서 계약을 직접 못 박는다 — 특히 '모르는 건 비운다'와 정렬 규칙.
import {
  toUiShoe, toUiRun, buildIdxById, buildNameById, homeShoePairs, sortRunsByDateDesc,
} from '../lib/appViewModel';
import {DEFAULT_MAX_KM} from '../lib/shoe';

const shoe = (over: Record<string, any> = {}) => ({
  id: 's1', name: 'Nike Pegasus 41', max_km: 800, start_km: 0, retired: false, ...over,
});
const run = (over: Record<string, any> = {}) => ({
  id: 'r1', shoe_id: 's1', run_date: '2026-07-20', km: 10, duration: 3000, ...over,
});

describe('toUiShoe', () => {
  it('이름을 브랜드·모델로 나눈다', () => {
    const ui = toUiShoe(shoe(), [], 65);
    expect(ui.brand).toBe('NIKE'); // parseShoeName 이 브랜드를 대문자로 정규화한다
    expect(ui.model).toBe('Pegasus 41');
  });

  it('브랜드를 못 나누면 이름 전체를 브랜드로 두고 모델을 비운다', () => {
    const ui = toUiShoe(shoe({name: '이름없는신발'}), [], 65);
    expect(ui.brand).toBe('이름없는신발');
    expect(ui.model).toBe('');
  });

  it('주행거리는 실제 런에서 도출한다(정수 반올림)', () => {
    const ui = toUiShoe(shoe(), [run({km: 10.4}), run({id: 'r2', km: 5.2})], 65);
    expect(ui.used).toBe(16); // 15.6 → 16
  });

  it('max_km 이 없으면 기본 수명을 쓴다', () => {
    const ui = toUiShoe(shoe({max_km: 0}), [], 65);
    expect(ui.maxBase).toBe(DEFAULT_MAX_KM);
  });

  it('표시용 max 는 몸무게 보정을 받고, 편집용 maxBase 는 원본 그대로다', () => {
    // 기준 체중(65)보다 무거우면 유효 수명이 짧아진다 — 두 값이 섞이면 편집 화면이
    // 보정된 값을 원본으로 저장해 수명이 계속 깎인다(오염 방지가 이 분리의 이유).
    const heavy = toUiShoe(shoe(), [], 95);
    expect(heavy.maxBase).toBe(800);
    expect(heavy.max).toBeLessThan(800);
  });

  it('구매가는 양수일 때만 싣는다(0·결측은 모름)', () => {
    expect(toUiShoe(shoe({price_krw: 189000}), [], 65).priceKrw).toBe(189000);
    expect(toUiShoe(shoe({price_krw: 0}), [], 65).priceKrw).toBeUndefined();
    expect(toUiShoe(shoe(), [], 65).priceKrw).toBeUndefined();
  });

  it('보관 상태를 그대로 전달한다', () => {
    expect(toUiShoe(shoe({retired: true}), [], 65).retired).toBe(true);
  });
});

describe('buildNameById', () => {
  it('삭제된 신발 이름도 남긴다(그 신발로 달린 런의 공유 카드용)', () => {
    const map = buildNameById([shoe()], [{id: 'gone', name: 'Hoka Clifton 9'}]);
    expect(map.s1).toBe('Nike Pegasus 41');
    expect(map.gone).toBe('Hoka Clifton 9');
  });

  it('같은 id 면 살아있는 신발 이름이 이긴다(묘비가 덮지 않는다)', () => {
    const map = buildNameById([shoe({name: '새 이름'})], [{id: 's1', name: '옛 이름'}]);
    expect(map.s1).toBe('새 이름');
  });

  it('묘비가 없어도 동작한다', () => {
    expect(buildNameById([shoe()])).toEqual({s1: 'Nike Pegasus 41'});
  });
});

describe('buildIdxById', () => {
  it('id → 배열 인덱스', () => {
    expect(buildIdxById([shoe(), shoe({id: 's2'})])).toEqual({s1: 0, s2: 1});
  });
});

describe('homeShoePairs', () => {
  const a = shoe({id: 'a', name: 'A A'});
  const b = shoe({id: 'b', name: 'B B'});
  const c = shoe({id: 'c', name: 'C C'});
  const uiOf = (list: any[]) => list.map((s) => toUiShoe(s, [], 65));

  it('보관된 신발은 빠진다', () => {
    const list = [a, shoe({id: 'z', retired: true})];
    const out = homeShoePairs(list, uiOf(list), []);
    expect(out.map((x) => x.raw.id)).toEqual(['a']);
  });

  it('가장 최근에 신은 신발이 앞에 온다', () => {
    const list = [a, b, c];
    const runs = [
      {shoe_id: 'a', run_date: '2026-07-01'},
      {shoe_id: 'c', run_date: '2026-07-25'},
      {shoe_id: 'b', run_date: '2026-07-10'},
    ];
    const out = homeShoePairs(list, uiOf(list), runs);
    expect(out.map((x) => x.raw.id)).toEqual(['c', 'b', 'a']);
  });

  it('한 번도 안 신은 신발은 뒤로 가고, 동률이면 등록순을 지킨다', () => {
    const list = [a, b, c];
    const runs = [{shoe_id: 'c', run_date: '2026-07-25'}];
    const out = homeShoePairs(list, uiOf(list), runs);
    expect(out.map((x) => x.raw.id)).toEqual(['c', 'a', 'b']);
  });

  it('ui 와 raw 가 같은 신발끼리 짝지어진다(인덱스 어긋남 방지)', () => {
    const list = [a, b, c];
    const out = homeShoePairs(list, uiOf(list), [{shoe_id: 'c', run_date: '2026-07-25'}]);
    for (const pair of out) expect(pair.ui.id).toBe(pair.raw.id);
  });
});

describe('sortRunsByDateDesc', () => {
  it('최근이 앞이고 원본을 건드리지 않는다', () => {
    const input = [run({id: '1', run_date: '2026-07-01'}), run({id: '2', run_date: '2026-07-20'})];
    const out = sortRunsByDateDesc(input);
    expect(out.map((r) => r.id)).toEqual(['2', '1']);
    expect(input.map((r) => r.id)).toEqual(['1', '2']);
  });
});

describe('toUiRun', () => {
  const idx = {s1: 0};
  const names = {s1: 'Nike Pegasus 41'};

  it('거리는 소수 둘째 자리까지', () => {
    expect(toUiRun(run({km: 10.456}), idx, names).dist).toBe(10.46);
  });

  it('시간이 없으면 페이스·시간을 지어내지 않는다', () => {
    const ui = toUiRun(run({duration: 0}), idx, names);
    expect(ui.pace).toBe('--');
    expect(ui.time).toBe('--');
  });

  it('거리가 0.1km 이하면 페이스를 계산하지 않는다(정지 상태 기록)', () => {
    expect(toUiRun(run({km: 0.05}), idx, names).pace).toBe('--');
  });

  it('모르는 신발이면 인덱스가 -1 이고 이름은 빈 문자열이다', () => {
    const ui = toUiRun(run({shoe_id: 'unknown'}), idx, names);
    expect(ui.shoe).toBe(-1);
    expect(ui.shoeName).toBe('');
  });

  it('삭제된 신발이어도 이름 맵에 있으면 이름이 뜬다', () => {
    const ui = toUiRun(run({shoe_id: 'gone'}), idx, {...names, gone: 'Hoka Clifton 9'});
    expect(ui.shoeName).toBe('Hoka Clifton 9');
  });

  it('빈 메모·빈 경로는 undefined 로 비운다(빈 문자열을 값으로 두지 않는다)', () => {
    const ui = toUiRun(run({memo: '   ', route: ''}), idx, names);
    expect(ui.memo).toBeUndefined();
    expect(ui.route).toBeUndefined();
  });

  it('경로가 있으면 그대로 전달한다(상세 지도 폴백)', () => {
    const ui = toUiRun(run({route: '37.5,127.0;37.6,127.1'}), idx, names);
    expect(ui.route).toBe('37.5,127.0;37.6,127.1');
  });

  it('편집 프리필용 원본값을 함께 싣는다', () => {
    const ui = toUiRun(run({run_date: '2026-07-20', duration: 3000}), idx, names);
    expect(ui.runDate).toBe('2026-07-20');
    expect(ui.durationS).toBe(3000);
  });
});
