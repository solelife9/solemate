// ============================================================================
// shoeRetirement — 은퇴 기록을 신발에 붙이기 (결정 A)
//
// 이 변경의 핵심은 **진실을 한 곳으로 모으는 것**이다. 그래서 테스트도 두 가지를 본다:
//   1) 이관이 무손실인가(있던 은퇴 기록이 사라지지 않는가)
//   2) 결정 A 가 지켜지는가(삭제한 신발은 명예의 전당에서도 사라지는가)
// ============================================================================
import {
  isValidRetirement,
  toShoeRetirement,
  setShoeRetirement,
  retirementRecordsFromShoes,
  migrateRetiredShoes,
} from '../../lib/shoeRetirement';
import type {RetiredShoeRecord} from '../../lib/progression/types';

const rec = (shoeId: string, over: Partial<RetiredShoeRecord> = {}): RetiredShoeRecord => ({
  shoeId,
  name: '페가수스 41',
  km: 640,
  retiredAt: '2026-06-01',
  retireYear: 2026,
  grade: 'gold' as any,
  ...over,
});

const shoe = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: '페가수스 41', max_km: 700, ...over,
});

describe('isValidRetirement', () => {
  test('km 과 retiredAt 이 있으면 유효', () => {
    expect(isValidRetirement({km: 640, retiredAt: '2026-06-01'})).toBe(true);
  });
  test('없거나 이상하면 무효 — 화면에 빈 카드가 뜨지 않게', () => {
    for (const bad of [null, undefined, 'x', [], {}, {km: 640}, {retiredAt: ''}, {km: 'a', retiredAt: 'x'}]) {
      expect(isValidRetirement(bad)).toBe(false);
    }
  });
});

describe('toShoeRetirement — shoeId 중복 제거', () => {
  test('신발 자신이 id 이므로 담지 않는다', () => {
    const r = toShoeRetirement(rec('s1'));
    expect('shoeId' in r).toBe(false);
    expect(r.km).toBe(640);
  });
});

describe('setShoeRetirement', () => {
  test('해당 신발에 붙이고 retired 도 켠다', () => {
    const out = setShoeRetirement([shoe('s1'), shoe('s2')], rec('s1'));
    expect((out[0] as any).retirement.km).toBe(640);
    expect((out[0] as any).retired).toBe(true);
    expect((out[1] as any).retirement).toBeUndefined();
  });

  test('재은퇴하면 최신으로 교체한다 — 낡은 레코드가 남지 않게', () => {
    const first = setShoeRetirement([shoe('s1')], rec('s1', {km: 400}));
    const second = setShoeRetirement(first, rec('s1', {km: 700, grade: 'platinum' as any}));
    expect((second[0] as any).retirement.km).toBe(700);
    expect((second[0] as any).retirement.grade).toBe('platinum');
  });

  test('대상이 없으면 원본 그대로(참조 동일)', () => {
    const shoes = [shoe('s1')];
    expect(setShoeRetirement(shoes, rec('없는신발'))).toBe(shoes);
  });

  test('입력을 변형하지 않는다', () => {
    const shoes = [shoe('s1')];
    setShoeRetirement(shoes, rec('s1'));
    expect((shoes[0] as any).retirement).toBeUndefined();
  });
});

describe('retirementRecordsFromShoes — 명예의 전당의 유일한 출처', () => {
  test('은퇴 스냅샷이 있는 신발만 나온다', () => {
    const shoes = [
      shoe('s1', {retirement: {km: 640, retiredAt: '2026-06-01', retireYear: 2026, grade: 'gold'}}),
      shoe('s2'), // 은퇴 안 함
      shoe('s3', {retired: true}), // 보관만 하고 명예의 전당 기록은 없음
    ];
    const out = retirementRecordsFromShoes(shoes);
    expect(out.map(r => r.shoeId)).toEqual(['s1']);
    expect(out[0].km).toBe(640);
    expect(out[0].name).toBe('페가수스 41');
  });

  // ── 결정 A ────────────────────────────────────────────────────────────────
  test('삭제한 신발은 명예의 전당에서도 사라진다(결정 A)', () => {
    const shoes = [
      shoe('s1', {deleted: true, retirement: {km: 640, retiredAt: '2026-06-01', retireYear: 2026, grade: 'gold'}}),
    ];
    expect(retirementRecordsFromShoes(shoes)).toHaveLength(0);
  });

  test('스냅샷이 손상되면 그 신발만 건너뛴다(화면 안 깨짐)', () => {
    const shoes = [shoe('s1', {retirement: {km: 'x'}}), shoe('s2', {retirement: {km: 10, retiredAt: '2026-01-01'}})];
    expect(retirementRecordsFromShoes(shoes).map(r => r.shoeId)).toEqual(['s2']);
  });

  test('id 없는 신발은 제외', () => {
    expect(retirementRecordsFromShoes([{retirement: {km: 1, retiredAt: 'x'}} as any])).toHaveLength(0);
  });
});

describe('migrateRetiredShoes — 옛 위치에서 이관(무손실)', () => {
  test('짝이 맞는 신발에 붙인다', () => {
    const {shoes, migrated} = migrateRetiredShoes([shoe('s1'), shoe('s2')], [rec('s1')]);
    expect(migrated).toBe(1);
    expect((shoes[0] as any).retirement.km).toBe(640);
    expect((shoes[0] as any).retired).toBe(true);
  });

  test('이미 신발에 있으면 덮지 않는다 — 그쪽이 최신이다', () => {
    const shoes0 = [shoe('s1', {retirement: {km: 700, retiredAt: '2026-07-01', retireYear: 2026, grade: 'platinum'}})];
    const {shoes, migrated} = migrateRetiredShoes(shoes0, [rec('s1', {km: 400})]);
    expect(migrated).toBe(0);
    expect((shoes[0] as any).retirement.km).toBe(700);
    expect(shoes).toBe(shoes0); // 참조까지 그대로
  });

  test('짝 없는 기록은 버린다 — 신발이 이미 삭제된 것이므로(결정 A)', () => {
    const {migrated, orphaned} = migrateRetiredShoes([shoe('s1')], [rec('없는신발')]);
    expect(migrated).toBe(0);
    expect(orphaned).toBe(1);
  });

  test('같은 신발 기록이 여러 개면 마지막 것을 쓴다', () => {
    const {shoes} = migrateRetiredShoes([shoe('s1')], [rec('s1', {km: 100}), rec('s1', {km: 900})]);
    expect((shoes[0] as any).retirement.km).toBe(900);
  });

  test('이관할 게 없으면 원본 그대로(참조 동일)', () => {
    const shoes = [shoe('s1')];
    expect(migrateRetiredShoes(shoes, []).shoes).toBe(shoes);
    expect(migrateRetiredShoes(shoes, null).shoes).toBe(shoes);
    expect(migrateRetiredShoes(shoes, undefined).shoes).toBe(shoes);
  });

  test('멱등하다 — 두 번 돌려도 결과가 같다', () => {
    const legacy = [rec('s1')];
    const once = migrateRetiredShoes([shoe('s1')], legacy);
    const twice = migrateRetiredShoes(once.shoes, legacy);
    expect(twice.migrated).toBe(0);
    expect(twice.shoes).toBe(once.shoes);
  });

  test('이관 뒤 명예의 전당이 같은 내용을 낸다(왕복 무손실)', () => {
    const legacy = [rec('s1', {km: 640}), rec('s2', {km: 300, name: '클리프톤'})];
    const {shoes} = migrateRetiredShoes([shoe('s1'), shoe('s2', {name: '클리프톤'})], legacy);
    const out = retirementRecordsFromShoes(shoes);
    expect(out.map(r => [r.shoeId, r.km])).toEqual([['s1', 640], ['s2', 300]]);
  });
});
