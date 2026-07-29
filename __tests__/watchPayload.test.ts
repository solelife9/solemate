// lib/watchPayload — 워치·위젯으로 보내는 값의 계약.
// 이 값들은 폰 화면에 안 보인다(손목을 봐야 안다). 그래서 조용히 어긋나도 한참 뒤에나
// 발견된다 — 여기서 형태와 경계값을 못 박는다.
import {buildWatchShoes, buildWatchRecentRuns, buildWidgetShoe} from '../lib/watchPayload';

const entry = (over: Record<string, any> = {}) => ({
  raw: {id: over.id ?? 's1'},
  ui: {
    id: over.id ?? 's1', brand: 'NIKE', model: 'Pegasus 41',
    used: 200, max: 800, maxBase: 800, retired: false, start_km: 0,
    ...over,
  } as any,
});

describe('buildWatchShoes', () => {
  it('lifePct 는 남은 수명 비율이다', () => {
    const {shoes} = buildWatchShoes([entry({used: 200, max: 800})], 30, 50);
    expect(shoes[0].lifePct).toBe(75);
  });

  it('수명을 넘겨 달렸어도 음수로 내려가지 않는다(링이 뒤집히지 않게)', () => {
    const {shoes} = buildWatchShoes([entry({used: 1200, max: 800})], 30, 50);
    expect(shoes[0].lifePct).toBe(0);
  });

  it('max 가 0 이어도 나눗셈이 터지지 않는다', () => {
    const {shoes} = buildWatchShoes([entry({used: 0, max: 0})], 30, 50);
    expect(shoes[0].lifePct).toBe(100);
    expect(Number.isFinite(shoes[0].lifePct)).toBe(true);
  });

  it('거리는 반올림 정수 km 로 보낸다', () => {
    const {shoes} = buildWatchShoes([entry({used: 199.6, max: 800.4})], 30, 50);
    expect(shoes[0].usedKm).toBe(200);
    expect(shoes[0].maxKm).toBe(800);
  });

  it('id 는 문자열로 정규화한다(워치가 문자열 키로 대조한다)', () => {
    const e = entry();
    e.raw.id = 42 as any;
    const {shoes} = buildWatchShoes([e], 30, 50);
    expect(shoes[0].id).toBe('42');
  });

  it('구버전 워치용 condition 문자열을 계속 실어 보낸다(호환)', () => {
    const {shoes} = buildWatchShoes([entry()], 30, 50);
    expect(typeof shoes[0].condition).toBe('string');
    expect(shoes[0].condition.length).toBeGreaterThan(0);
  });

  it('심박 기준을 함께 보낸다(안정시심박 미설정은 0)', () => {
    const {hr} = buildWatchShoes([], 30, 0);
    expect(hr.max).toBeGreaterThan(150);
    expect(hr.rest).toBe(0);
  });

  it('신발이 없어도 빈 목록으로 정상 동작한다', () => {
    expect(buildWatchShoes([], 30, 50).shoes).toEqual([]);
  });
});

describe('buildWatchRecentRuns', () => {
  const shoes = [{id: 's1', name: 'Nike Pegasus 41'}];
  const run = (over: Record<string, any> = {}) => ({
    id: 'r1', shoe_id: 's1', run_date: '2026-07-20', km: 10, duration: 3000, ...over,
  });

  it('최근 10개만 보낸다', () => {
    const many = Array.from({length: 25}, (_, i) => run({id: `r${i}`, updated_at: i}));
    expect(buildWatchRecentRuns(many, shoes)).toHaveLength(10);
  });

  it('updated_at 이 있으면 그 기준 최신순', () => {
    const list = [run({id: 'a', updated_at: 100}), run({id: 'b', updated_at: 300}), run({id: 'c', updated_at: 200})];
    expect(buildWatchRecentRuns(list, shoes).map(r => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('updated_at 이 없으면 날짜로 정렬한다', () => {
    const list = [run({id: 'a', run_date: '2026-07-01'}), run({id: 'b', run_date: '2026-07-25'})];
    expect(buildWatchRecentRuns(list, shoes).map(r => r.id)).toEqual(['b', 'a']);
  });

  it('거리 0 이거나 id 없는 레코드는 보내지 않는다(워치에 빈 줄로 뜬다)', () => {
    const list = [run({id: 'ok'}), run({id: 'zero', km: 0}), run({id: '', km: 5})];
    expect(buildWatchRecentRuns(list, shoes).map(r => r.id)).toEqual(['ok']);
  });

  it('0.2km 이하면 페이스를 0 으로 둔다(값이 튄다)', () => {
    const [r] = buildWatchRecentRuns([run({km: 0.15})], shoes);
    expect(r.avgPaceSecPerKm).toBe(0);
  });

  it('평균 페이스는 초/km 다', () => {
    const [r] = buildWatchRecentRuns([run({km: 10, duration: 3000})], shoes);
    expect(r.avgPaceSecPerKm).toBe(300);
  });

  it('신발 이름을 붙이고, 모르는 신발이면 빈 문자열이다', () => {
    const [a, b] = buildWatchRecentRuns(
      [run({id: 'a', updated_at: 2}), run({id: 'b', shoe_id: 'gone', updated_at: 1})],
      shoes,
    );
    expect(a.shoeName).toBe('Nike Pegasus 41');
    expect(b.shoeName).toBe('');
  });

  it('결측 지표는 0 으로 채운다(undefined 를 워치로 넘기지 않는다)', () => {
    const [r] = buildWatchRecentRuns([run()], shoes);
    expect(r.avgBpm).toBe(0);
    expect(r.cadence).toBe(0);
    expect(r.kcal).toBe(0);
    expect(r.elevGainM).toBe(0);
  });

  it('원본 배열을 정렬로 건드리지 않는다', () => {
    const list = [run({id: 'a', updated_at: 1}), run({id: 'b', updated_at: 9})];
    buildWatchRecentRuns(list, shoes);
    expect(list.map(r => r.id)).toEqual(['a', 'b']);
  });
});

describe('buildWidgetShoe', () => {
  it('활성 신발이 없으면 null(전송을 건너뛴다)', () => {
    expect(buildWidgetShoe(undefined)).toBeNull();
    expect(buildWidgetShoe(null)).toBeNull();
  });

  it('모델명을 이름으로 쓰고, 모델이 비면 브랜드로 폴백한다', () => {
    expect(buildWidgetShoe(entry())!.name).toBe('Pegasus 41');
    expect(buildWidgetShoe(entry({model: ''}))!.name).toBe('NIKE');
  });

  it('거리는 홈 히어로와 같은 값을 그대로 보낸다', () => {
    const p = buildWidgetShoe(entry({used: 200, max: 800}))!;
    expect(p.usedKm).toBe(200);
    expect(p.maxKm).toBe(800);
  });

  it('용도를 모르는 신발이면 분류를 빈 문자열로 둔다(지어내지 않는다)', () => {
    const p = buildWidgetShoe(entry({brand: '없는브랜드', model: '없는모델'}))!;
    expect(p.category).toBe('');
  });
});
