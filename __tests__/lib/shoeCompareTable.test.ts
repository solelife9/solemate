/**
 * 러닝화 비교 표 — 계약.
 *
 * 지키는 것 셋:
 *  1) 모르는 값은 비우고, 없는 비교를 지어내지 않는다
 *  2) 차이는 항상 기준(첫 칸) 대비다
 *  3) 좋고 나쁨을 말하지 않는다 — 부호만 적는다
 */
import {
  buildCompareTable,
  formatDelta,
  mineSummary,
  MAX_COMPARE,
  type CompareShoe,
} from '../../lib/shoeCompareTable';

const shoe = (over: Partial<CompareShoe> & {id: string; name: string}): CompareShoe => ({
  brand: 'ASICS', ...over,
});

const SUPERBLAST: CompareShoe = shoe({
  id: 'a', name: '슈퍼블라스트 3', weight: 230, weightBasis: 'US9', drop: 8,
  stackHeight: {heel: 46, forefoot: 38}, plate: 'none', lifespanKm: 650,
});
const NOVABLAST: CompareShoe = shoe({
  id: 'b', name: '노바블라스트 6', weight: 249, weightBasis: 'US9', drop: 8,
  stackHeight: {heel: 42, forefoot: 34}, plate: 'none', lifespanKm: 650,
});
const PEGASUS: CompareShoe = shoe({
  id: 'c', brand: 'Nike', name: '페가수스 42', weight: 292, weightBasis: 'US9', drop: 10,
  stackHeight: {heel: 38, forefoot: 28}, plate: 'none', lifespanKm: 650,
});

const rowOf = (rows: ReturnType<typeof buildCompareTable>, key: string) =>
  rows.find((r) => r.key === key)!;

describe('차이 표기', () => {
  it('부호를 붙이고, 같으면 0', () => {
    expect(formatDelta(62)).toBe('+62');
    expect(formatDelta(-8)).toBe('−8');
    expect(formatDelta(0)).toBe('0');
  });

  it('음수는 하이픈이 아니라 마이너스 기호 — +와 시각적 무게를 맞춘다', () => {
    expect(formatDelta(-4).charCodeAt(0)).toBe('−'.charCodeAt(0));
  });

  it('소수점은 한 자리까지', () => {
    expect(formatDelta(9.54)).toBe('+9.5');
  });
});

describe('표 구성', () => {
  const rows = buildCompareTable([SUPERBLAST, NOVABLAST, PEGASUS]);

  it('첫 칸이 기준이라 차이가 없다', () => {
    expect(rowOf(rows, 'weight').cells[0].delta).toBeNull();
  });

  it('나머지는 기준 대비로 적힌다', () => {
    const w = rowOf(rows, 'weight').cells;
    expect(w[1].delta).toBe('+19');
    expect(w[2].delta).toBe('+62');
  });

  it('쿠션 두께는 뒤꿈치가 기준값, 앞발은 기준 칸에만 보조로', () => {
    const s = rowOf(rows, 'stack').cells;
    expect(s[0].value).toBe('46');
    expect(s[0].sub).toBe('앞발 38');
    expect(s[1].sub).toBeUndefined();
    expect(s[2].delta).toBe('−8');
  });

  it('드롭이 같으면 0으로 명시한다(빈칸이 아니다)', () => {
    expect(rowOf(rows, 'drop').cells[1].delta).toBe('0');
  });

  it('카본은 문구로만 — 차이를 계산하지 않는다', () => {
    const p = rowOf(rows, 'plate').cells;
    expect(p.map((c) => c.value)).toEqual(['없음', '없음', '없음']);
    expect(p.every((c) => c.delta === null)).toBe(true);
  });

  it('플레이트 종류를 구분해 적는다', () => {
    const r = buildCompareTable([
      {...SUPERBLAST, plate: 'carbon'},
      {...NOVABLAST, plate: 'other'},
    ]);
    expect(rowOf(r, 'plate').cells.map((c) => c.value)).toEqual(['카본', '있음 (카본 아님)']);
  });
});

describe('모르는 값', () => {
  it('값이 없으면 null 이고 차이도 만들지 않는다', () => {
    const rows = buildCompareTable([SUPERBLAST, {...NOVABLAST, weight: null}]);
    const w = rowOf(rows, 'weight').cells[1];
    expect(w.value).toBeNull();
    expect(w.delta).toBeNull();
  });

  it('기준을 모르면 다른 칸도 차이를 못 만든다 — 없는 비교를 지어내지 않는다', () => {
    const rows = buildCompareTable([{...SUPERBLAST, weight: null}, NOVABLAST]);
    const w = rowOf(rows, 'weight').cells[1];
    expect(w.value).toBe('249');
    expect(w.delta).toBeNull();
  });

  it('전부 모르는 행은 표에서 빠진다', () => {
    const rows = buildCompareTable([
      {...SUPERBLAST, plate: null},
      {...NOVABLAST, plate: null},
    ]);
    expect(rows.find((r) => r.key === 'plate')).toBeUndefined();
  });

  it('한 켤레라도 알면 행은 남는다 — 비어 있다는 사실도 정보다', () => {
    const rows = buildCompareTable([{...SUPERBLAST, plate: null}, NOVABLAST]);
    const p = rowOf(rows, 'plate');
    expect(p.cells[0].value).toBeNull();
    expect(p.cells[1].value).toBe('없음');
  });

  it('무게 기준 사이즈가 표준(270mm)이 아니면 mm 로 표시한다', () => {
    const rows = buildCompareTable([SUPERBLAST, {...NOVABLAST, weightBasis: 'US9.5'}]);
    expect(rowOf(rows, 'weight').cells[1].sub).toBe('275mm');
    expect(rowOf(rows, 'weight').cells[0].sub).toBeUndefined();
  });
});

// 무게는 같은 사이즈에서 잰 것끼리만 비교할 수 있다. 반 사이즈가 6~9g 인데 신발끼리
// 실제 차이가 20~60g 이라, 기준이 섞인 차이는 사용자를 속인다.
describe('무게는 잰 사이즈가 같을 때만 차이를 낸다', () => {
  const other = (basis: string | null) => ({...NOVABLAST, weightBasis: basis});

  it('기준이 같으면 차이를 낸다 — 표기가 달라도(US9 = M9 = 270mm)', () => {
    for (const b of ['US9', 'M9', '270mm', '사이즈 9']) {
      const rows = buildCompareTable([SUPERBLAST, other(b)]);
      expect(rowOf(rows, 'weight').cells[1].delta).toBe('+19');
    }
  });

  it('기준이 다르면 차이를 적지 않는다 — 값은 그대로 보여준다', () => {
    const rows = buildCompareTable([SUPERBLAST, other('US9.5')]);
    const c = rowOf(rows, 'weight').cells[1];
    expect(c.value).toBe('249');
    expect(c.delta).toBeNull();
    expect(c.sub).toBe('275mm');
  });

  it('기준을 모르면 차이를 적지 않는다 — 모르는 걸 270mm 라고 가정하지 않는다', () => {
    const rows = buildCompareTable([SUPERBLAST, other(null)]);
    const c = rowOf(rows, 'weight').cells[1];
    expect(c.value).toBe('249');
    expect(c.delta).toBeNull();
    expect(c.sub).toBe('기준 모름');
  });

  it('기준이 갈리면 그 이유를 줄에 적는다', () => {
    expect(buildCompareTable([SUPERBLAST, other('US10')]).find((r) => r.key === 'weight')!.hint)
      .toBe('잰 사이즈가 달라 차이는 비교하지 않음');
  });

  it('기준이 다 같으면 그런 설명을 붙이지 않는다', () => {
    expect(buildCompareTable([SUPERBLAST, other('US9')]).find((r) => r.key === 'weight')!.hint)
      .toBeUndefined();
  });

  it('다른 축(스택·드롭)은 사이즈와 무관하므로 그대로 비교한다', () => {
    const rows = buildCompareTable([SUPERBLAST, other('US10')]);
    expect(rowOf(rows, 'stack').cells[1].delta).toBe('−4');
    expect(rowOf(rows, 'drop').cells[1].delta).toBe('0');
  });
});

describe('내 신발 요약', () => {
  it('내 신발이 아니면 없다', () => {
    expect(mineSummary(SUPERBLAST)).toBeNull();
  });

  it('쓴 거리와 남은 거리를 준다', () => {
    const s = mineSummary({...SUPERBLAST, mine: {usedKm: 412, lifespanKm: 650}})!;
    expect(s.usedKm).toBe(412);
    expect(s.remainKm).toBe(238);
    expect(s.pct).toBeCloseTo(0.634, 2);
  });

  it('수명을 넘겨도 막대는 넘치지 않고 남은 거리는 0', () => {
    const s = mineSummary({...SUPERBLAST, mine: {usedKm: 800, lifespanKm: 650}})!;
    expect(s.pct).toBe(1);
    expect(s.remainKm).toBe(0);
  });

  it('수명이 0이면 계산하지 않는다(나눗셈 폭발 방지)', () => {
    expect(mineSummary({...SUPERBLAST, mine: {usedKm: 10, lifespanKm: 0}})).toBeNull();
  });
});

describe('입력을 건드리지 않는다', () => {
  it('원본 배열·객체가 그대로다', () => {
    const input = [SUPERBLAST, NOVABLAST];
    const snapshot = JSON.stringify(input);
    buildCompareTable(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('빈 입력은 빈 표', () => {
    expect(buildCompareTable([])).toEqual([]);
  });

  it('한 켤레만 넣어도 동작한다', () => {
    const rows = buildCompareTable([SUPERBLAST]);
    expect(rowOf(rows, 'weight').cells).toHaveLength(1);
  });

  it('한 화면 상한은 3켤레', () => {
    expect(MAX_COMPARE).toBe(3);
  });
});
