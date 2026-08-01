// ============================================================================
// publicProfile — 공개 프로필 미러
//
// keego 는 이 실수를 이미 한 번 했다: 동의도 화면도 없는데 닉네임과 월간 운동량이
// 전원 읽기 가능한 컬렉션에 쌓였다(767032e, AUDIT 1). 그래서 이 파일의 테스트는
// **"무엇이 나가는가"보다 "무엇이 안 나가는가"** 를 더 촘촘히 본다.
// ============================================================================
import {
  buildPublicProfile,
  profileSignature,
  MAX_ACTIVE_SHOES,
  MAX_HALL_OF_FAME,
  type ProfileVisibility,
} from '../../lib/publicProfile';

const shoe = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `Nike Pegasus ${id}`, max_km: 700, start_km: 0, ...over,
});
const run = (id: string, shoeId: string, km: number, date = '2026-08-01') => ({
  id, shoe_id: shoeId, km, run_date: date,
});

const NOW = new Date('2026-08-15T00:00:00Z').getTime();

const build = (over: Record<string, unknown> = {}) =>
  buildPublicProfile({
    visibility: 'public' as ProfileVisibility,
    nickname: '민우',
    shoes: [shoe('a')],
    runs: [run('r1', 'a', 10)],
    nowMs: NOW,
    ...over,
  } as never);

// ─── 동의 ─────────────────────────────────────────────────────────────────────
describe('동의 없으면 아무것도 만들지 않는다', () => {
  test('미결정(unset)은 비공개와 같다 — "아직 안 물어봤다"가 "공개해도 된다"가 되면 안 된다', () => {
    expect(build({visibility: 'unset'})).toBeNull();
  });

  test('명시적 비공개도 당연히 null', () => {
    expect(build({visibility: 'private'})).toBeNull();
  });

  test('이상한 값도 null(기본이 안전한 쪽)', () => {
    expect(build({visibility: undefined})).toBeNull();
    expect(build({visibility: 'PUBLIC'})).toBeNull();
  });

  test('public 일 때만 만든다', () => {
    expect(build()).not.toBeNull();
  });
});

// ─── 유출 방어 (이 파일의 존재 이유) ──────────────────────────────────────────
describe('개인정보가 새지 않는다', () => {
  test('민감 필드가 신발/러닝에 섞여 있어도 미러에 안 나간다', () => {
    const p = build({
      shoes: [shoe('a', {
        purchase_price: 189000, memo: '아내 선물', photoUri: 'file:///집사진.jpg',
      })],
      runs: [{
        ...run('r1', 'a', 10),
        route: '[{"lat":37.5,"lon":127.0}]',   // 집 주소
        memo: '집 앞 공원 두 바퀴',
        location: '서울 강남구 역삼동',
        heart_rate: 152,
      }],
    })!;
    const json = JSON.stringify(p);
    for (const leak of ['37.5', '127.0', '아내 선물', '집사진', '역삼동', '집 앞 공원', '189000', '152']) {
      expect(json).not.toContain(leak);
    }
  });

  test('신체 지표는 애초에 입력받지 않는다 — 담을 수가 없는 구조', () => {
    const p = build()!;
    const json = JSON.stringify(p);
    for (const k of ['weight', 'age', 'sex', 'restHR', 'rest_hr', 'body']) {
      expect(json).not.toContain(k);
    }
  });

  test('개별 러닝은 담지 않는다 — 합계만 나간다', () => {
    const p = build({runs: [run('r1', 'a', 10, '2026-08-03'), run('r2', 'a', 5, '2026-08-09')]})!;
    const json = JSON.stringify(p);
    expect(json).not.toContain('2026-08-03'); // 언제 달렸는지도 안 나간다
    expect(json).not.toContain('r1');
    expect(p.stats.totalKm).toBe(15);
  });

  test('나가는 최상위 키가 정확히 이것뿐이다(새 필드가 저절로 새지 않게)', () => {
    expect(Object.keys(build()!).sort()).toEqual([
      'activeShoes', 'hallOfFame', 'nickname', 'stats', 'visibility',
    ]);
  });

  test('신발 항목의 키도 고정이다', () => {
    expect(Object.keys(build()!.activeShoes[0]).sort()).toEqual([
      'brand', 'maxKm', 'model', 'name', 'usedKm',
    ]);
  });
});

// ─── 내용 ─────────────────────────────────────────────────────────────────────
describe('현역 신발', () => {
  test('많이 신은 순으로 나온다', () => {
    const p = build({
      shoes: [shoe('a'), shoe('b')],
      runs: [run('r1', 'a', 10), run('r2', 'b', 50)],
    })!;
    expect(p.activeShoes[0].usedKm).toBe(50);
  });

  test('은퇴·보관한 신발은 현역에서 빠진다', () => {
    const p = build({
      shoes: [shoe('a'), shoe('b', {retired: true}), shoe('c', {retirement: {km: 600, retiredAt: '2026-01-01'}})],
      runs: [],
    })!;
    expect(p.activeShoes).toHaveLength(1);
  });

  test('삭제된 신발은 안 나온다', () => {
    const p = build({shoes: [shoe('a', {deleted: true})], runs: []})!;
    expect(p.activeShoes).toHaveLength(0);
  });

  test('상한을 넘지 않는다(미러를 작게 유지)', () => {
    const many = Array.from({length: MAX_ACTIVE_SHOES + 5}, (_, i) => shoe(`s${i}`));
    expect(build({shoes: many, runs: []})!.activeShoes).toHaveLength(MAX_ACTIVE_SHOES);
  });

  test('브랜드/모델을 나눠 담는다 — 보는 사람 앱이 스펙을 붙일 수 있게', () => {
    const p = build({shoes: [{id: 'a', name: 'Hoka Clifton 9', max_km: 600}], runs: []})!;
    expect(p.activeShoes[0]).toMatchObject({brand: 'Hoka', model: 'Clifton 9', name: 'Hoka Clifton 9'});
  });

  test('이름이 한 단어여도 깨지지 않는다', () => {
    const p = build({shoes: [{id: 'a', name: '직접입력화', max_km: 600}], runs: []})!;
    expect(p.activeShoes[0]).toMatchObject({brand: '직접입력화', model: ''});
  });

  test('이름 없는 신발은 제외(빈 카드 방지)', () => {
    expect(build({shoes: [{id: 'a', max_km: 600}], runs: []})!.activeShoes).toHaveLength(0);
  });
});

describe('명예의 전당', () => {
  const retired = (id: string, year: number, km: number) =>
    shoe(id, {retirement: {km, retiredAt: `${year}-06-01`, retireYear: year, grade: 'gold'}});

  test('은퇴 신발이 최근 순으로 나온다', () => {
    const p = build({shoes: [retired('a', 2024, 600), retired('b', 2026, 700)], runs: []})!;
    expect(p.hallOfFame.map(h => h.year)).toEqual([2026, 2024]);
  });

  test('삭제한 신발은 명예의 전당에서도 빠진다(결정 A)', () => {
    const s = retired('a', 2026, 600);
    const p = build({shoes: [{...s, deleted: true}], runs: []})!;
    expect(p.hallOfFame).toHaveLength(0);
  });

  test('상한을 넘지 않는다', () => {
    const many = Array.from({length: MAX_HALL_OF_FAME + 4}, (_, i) => retired(`s${i}`, 2020 + i, 500));
    expect(build({shoes: many, runs: []})!.hallOfFame).toHaveLength(MAX_HALL_OF_FAME);
  });
});

describe('통계', () => {
  test('이번 달 거리는 그달 것만 센다', () => {
    const p = build({
      runs: [run('r1', 'a', 10, '2026-08-05'), run('r2', 'a', 7, '2026-07-30')],
    })!;
    expect(p.stats.monthKm).toBe(10);
    expect(p.stats.totalKm).toBe(17);
  });

  test('삭제된 러닝은 안 센다', () => {
    const p = build({runs: [run('r1', 'a', 10), {...run('r2', 'a', 5), deleted: true}]})!;
    expect(p.stats.totalKm).toBe(10);
    expect(p.stats.runCount).toBe(1);
  });

  test('이상한 거리는 무시한다(음수·NaN 이 화면에 안 나가게)', () => {
    const p = build({runs: [run('r1', 'a', -5), run('r2', 'a', NaN as never), run('r3', 'a', 10)]})!;
    expect(p.stats.totalKm).toBe(10);
  });
});

describe('닉네임', () => {
  test('비어 있으면 기본값', () => {
    expect(build({nickname: '   '})!.nickname).toBe('러너');
  });
  test('공백을 다듬는다', () => {
    expect(build({nickname: '  민우  '})!.nickname).toBe('민우');
  });
});

describe('profileSignature — 안 바뀌면 안 쓴다', () => {
  test('같은 내용이면 같은 시그니처', () => {
    expect(profileSignature(build())).toBe(profileSignature(build()));
  });
  test('내용이 바뀌면 달라진다', () => {
    expect(profileSignature(build())).not.toBe(profileSignature(build({nickname: '다른사람'})));
  });
  test('null 은 빈 문자열(쓸 것이 없다)', () => {
    expect(profileSignature(null)).toBe('');
  });
});
