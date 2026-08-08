/**
 * 신발 묘비 — **삭제한 신발의 이름은 사라지지 않는다.**
 *
 * 감사 Q-10(2026-08-08 종결): 신발 묘비가 90일 TTL 로 떨어지면서 그 안의 `name` 도 함께
 * 사라졌다. 결과 — **신발을 지운 지 3개월이 지나면 그 신발로 달린 모든 과거 기록에서
 * 이름이 영구히 없어진다.** 러닝 기록 자체는 남는데 무엇을 신고 뛰었는지만 빠지는 것이라
 * 사용자 입장에선 기록이 훼손된 것과 같다. 이름을 남기려고 SHOE_TOMBSTONE_KEEP 을
 * 일부러 뒀는데 TTL 이 그걸 되돌리고 있었다.
 *
 * 고침: 신발 묘비는 **나이가 아니라 개수**로 막는다(런 묘비의 TTL 은 그대로 — 그쪽은
 * 러닝을 지울 때마다 쌓여 개수 위험이 실재한다).
 * @format
 */
import {
  compactShoeTombstones, compactTombstones,
  SHOE_TOMBSTONE_MAX, TOMBSTONE_TTL_MS, SHOE_TOMBSTONE_KEEP,
} from '../../lib/cloudSync';

const NOW = 1_760_000_000_000;
const daysAgo = (d: number) => NOW - d * 24 * 60 * 60 * 1000;

const tomb = (id: string, at: number, name = `신발 ${id}`) =>
  ({id, deleted: true, updatedAt: at, name, brand: '버려질 필드', total_km: 123});
const live = (id: string) => ({id, name: `살아있는 ${id}`, total_km: 10});

describe('★ 회귀 — 오래된 신발 묘비도 이름을 지킨다', () => {
  test('90일이 훌쩍 지난 묘비도 남는다 (예전엔 여기서 사라졌다)', () => {
    const old = tomb('s1', daysAgo(365), 'Nike Pegasus 41');
    const out = compactShoeTombstones([old]);
    expect(out).toHaveLength(1);
    expect((out[0] as {name?: string}).name).toBe('Nike Pegasus 41');
  });

  test('런 묘비는 여전히 TTL 로 떨어진다 — 규칙이 다르다', () => {
    const oldRun = {id: 'r1', deleted: true, updatedAt: daysAgo(120)};
    expect(compactTombstones([oldRun], NOW)).toHaveLength(0);
    // 같은 나이의 신발 묘비는 남는다.
    expect(compactShoeTombstones([tomb('s1', daysAgo(120))])).toHaveLength(1);
  });

  test('TTL 상수는 그대로다 — 런 쪽 계약을 건드리지 않았다', () => {
    expect(TOMBSTONE_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});

describe('묘비를 껍데기로 줄인다', () => {
  test('코어 3필드 + name 만 남는다', () => {
    const out = compactShoeTombstones([tomb('s1', daysAgo(10), 'Hoka Clifton 9')]);
    expect(Object.keys(out[0]).sort()).toEqual(['deleted', 'id', 'name', 'updatedAt']);
    expect(SHOE_TOMBSTONE_KEEP).toContain('name');
  });

  test('살아 있는 신발은 하나도 건드리지 않는다', () => {
    const l = live('s9');
    const out = compactShoeTombstones([l, tomb('s1', daysAgo(400))]);
    expect(out).toContain(l);                        // 같은 참조 그대로
    expect((out.find(x => x.id === 's9') as never)).toBe(l);
  });
});

describe('개수 상한 — 나이 대신 이걸로 막는다', () => {
  const many = (n: number) =>
    Array.from({length: n}, (_, i) => tomb(`s${i}`, daysAgo(n - i))); // i 클수록 최신

  test(`상한(${SHOE_TOMBSTONE_MAX}) 이하면 전부 남는다`, () => {
    expect(compactShoeTombstones(many(50))).toHaveLength(50);
  });

  test('상한을 넘으면 오래된 것부터 버린다', () => {
    const out = compactShoeTombstones(many(10), 4);
    expect(out).toHaveLength(4);
    // 최신 4개(s9·s8·s7·s6)가 남아야 한다.
    expect(out.map(x => x.id).sort()).toEqual(['s6', 's7', 's8', 's9']);
  });

  test('상한을 세도 live 는 개수에 넣지 않는다', () => {
    const out = compactShoeTombstones([live('a'), live('b'), ...many(3)], 2);
    expect(out.filter(x => !('deleted' in x))).toHaveLength(2); // live 2개 온전
    expect(out.filter(x => 'deleted' in x)).toHaveLength(2);    // 묘비만 상한 적용
  });

  test('시각을 모르는 묘비는 버리지 않는다 — 지운 신발이 되살아나면 안 된다', () => {
    const unknown = {id: 'x', deleted: true, name: '시각 없음'};
    const out = compactShoeTombstones([unknown, ...many(5)], 1);
    expect(out.map(x => x.id)).toContain('x');
  });
});

describe('견고성', () => {
  test('빈 입력·비배열도 죽지 않는다', () => {
    expect(compactShoeTombstones([])).toEqual([]);
    expect(compactShoeTombstones(null as never)).toEqual([]);
  });
});

// ── 배선 ─────────────────────────────────────────────────────────────────────
describe('배선 — 백업이 신발 전용 정리를 쓴다', () => {
  const app = require('fs').readFileSync(
    require('path').join(__dirname, '../..', 'App.tsx'), 'utf8');

  test('신발은 compactShoeTombstones 로 싣는다', () => {
    expect(app).toMatch(/shoes:\[\.\.\.shoes,\.\.\.compactShoeTombstones\(/);
  });

  test('신발에 TTL 정리를 다시 쓰지 않는다 — 되돌아가면 이름이 또 사라진다', () => {
    expect(app).not.toMatch(/shoes:\[[^\]]*compactTombstones\(/);
  });

  test('런은 여전히 TTL 정리를 쓴다', () => {
    expect(app).toMatch(/runs:\[\.\.\.runs,\.\.\.compactTombstones\(/);
  });
});
