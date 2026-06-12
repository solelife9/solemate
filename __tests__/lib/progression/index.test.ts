// lib/progression/index — 공개 셀렉터(엔진 합성) + 멱등 언락 알림.
//
// 관찰 가능한 동작(behavioral):
//   · getProgression: 시드된 런/신발/상태에서 일관된 rank+titles+achievements+points 뷰를
//     만든다(컨텍스트 1회 집계 → 모든 엔진 조립). 언락 업적과 포인트가 서로 모순되지 않는다.
//   · hidden 타이틀은 미달성 시 locked 갤러리에 노출되지 않는다(달성 순간 unlocked 로 공개).
//   · 동일 입력(참조 동일) 재호출 → 같은 결과 객체(메모이즈). now 가 바뀌면 재계산.
//   · detectNewUnlocks: 알림은 한 번만 발사되고, nextSeen 영속 후 재계산하면 다시 안 뜬다
//     (anti-scenario 8). 비정상 입력에서 throw 없이 안전.
//   · 빈 입력 → bronze/score 0/포인트 0/언락 없음(날조 금지).
//
// 순수 합성 엔진(ctx 만 읽음) — AsyncStorage 미사용. now 는 결정적으로 주입한다.

import {TIER_COLORS} from '../../../theme';
import {
  collectUnlockedKeys,
  detectNewUnlocks,
  getProgression,
} from '../../../lib/progression';
import {defaultProgressionState} from '../../../lib/progression/storage';
import {ProgressionState, RankTier} from '../../../lib/progression/types';

// 결정적 기준 시각(2026-06-12 로컬 자정) — context/titles.test 와 동일 규약.
const NOW = new Date(2026, 5, 12).getTime();

const ALL_TIERS: RankTier[] = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'legend',
];

// ── 시드: 100km 돌파 + 2켤레(하나는 조기 은퇴) ─────────────────────────────────
const runs: BackendRun[] = [
  {id: 'r1', shoe_id: 's1', km: 30, run_date: '2026-06-01', duration: 9000, run_time: '06:30'},
  {id: 'r2', shoe_id: 's1', km: 25, run_date: '2026-06-03', duration: 7500, run_time: '07:00'},
  {id: 'r3', shoe_id: 's2', km: 20, run_date: '2026-06-05', duration: 6000, run_time: '18:00'},
  {id: 'r4', shoe_id: 's1', km: 30, run_date: '2026-06-07', duration: 9000, run_time: '06:30'},
];

const shoes: BackendShoe[] = [
  {id: 's1', name: 'Pegasus 40', max_km: 600, retired: false},
  // 400/500 = 0.8 < 0.9 → overdue 전 교체(조기 은퇴) — injury_smart / Smart Swap.
  {id: 's2', name: 'Vaporfly 3', max_km: 500, retired: true, total_km: 400},
];

function stateWith(over: Partial<ProgressionState> = {}): ProgressionState {
  return {...defaultProgressionState(), ...over};
}

// ============================================================================
// 1) getProgression — 일관된 뷰(rank+titles+achievements+points)
// ============================================================================
describe('getProgression: 시드 데이터 → 일관된 뷰', () => {
  const state = stateWith({
    earnedTitles: [{key: 'running_100k', unlockedAt: '', isEquipped: true}],
    equippedTitleKey: 'running_100k',
  });
  const view = getProgression(runs, shoes, state, NOW);

  test('rank: 유효 티어·일치 색·0..100 점수', () => {
    expect(ALL_TIERS).toContain(view.rank.tier);
    expect(view.rank.color).toBe(TIER_COLORS[view.rank.tier]);
    expect(view.rank.score).toBeGreaterThanOrEqual(0);
    expect(view.rank.score).toBeLessThanOrEqual(100);
  });

  test('titles: 거리 사다리 언락(beginner·100k), 장착 키 반영', () => {
    const unlockedKeys = view.titles.unlocked.map(t => t.key);
    expect(unlockedKeys).toEqual(
      expect.arrayContaining(['running_beginner', 'running_100k']),
    );
    expect(view.titles.equipped).toBe('running_100k');
  });

  test('hidden 타이틀은 미달성 시 locked 갤러리에 없다(전부 unlocked=false)', () => {
    expect(view.titles.locked.some(t => t.hidden)).toBe(false);
    expect(view.titles.locked.every(t => t.unlocked === false)).toBe(true);
    // 충족된 타이틀은 unlocked=true 로만 unlocked 목록에 있다.
    expect(view.titles.unlocked.every(t => t.unlocked === true)).toBe(true);
  });

  test('achievements: 모든 항목이 진행률을 노출하고, 일부는 언락된다', () => {
    expect(view.achievements.length).toBeGreaterThan(0);
    // 진행률은 항상 0..target, target>0.
    for (const a of view.achievements) {
      expect(a.progress.target).toBeGreaterThan(0);
      expect(a.progress.current).toBeGreaterThanOrEqual(0);
      expect(a.progress.current).toBeLessThanOrEqual(a.progress.target);
    }
    // First Steps(첫 런)는 달성 → 진행률이 가득 차고 unlocked.
    const first = view.achievements.find(a => a.key === 'ach_first_run');
    expect(first?.unlocked).toBe(true);
    expect(first?.progress).toEqual({current: 1, target: 1});
  });

  test('points: 언락 업적 포인트 합과 정확히 일치하고 > 0', () => {
    const manual = view.achievements
      .filter(a => a.unlocked)
      .reduce((s, a) => s + a.points, 0);
    expect(view.points).toBe(manual);
    expect(view.points).toBeGreaterThan(0);
  });

  test('coherence: achievements.unlocked ⟺ collectUnlockedKeys 에 포함', () => {
    const collected = new Set(collectUnlockedKeys(view));
    for (const a of view.achievements) {
      expect(collected.has(a.key)).toBe(a.unlocked);
    }
    // 조기 은퇴(s2 0.8) → Smart Swap 업적 + injury_smart 타이틀 함께 충족.
    expect(collected.has('ach_smart_swap')).toBe(true);
    expect(view.titles.unlocked.map(t => t.key)).toContain('injury_smart');
  });
});

// ============================================================================
// 2) 빈/엣지 입력 — bronze/0/무언락(날조 금지)
// ============================================================================
describe('getProgression: 빈/엣지 입력', () => {
  test('빈 런·신발 → bronze, score 0, 포인트 0, 언락 타이틀 없음', () => {
    const view = getProgression([], [], defaultProgressionState(), NOW);
    expect(view.rank.tier).toBe('bronze');
    expect(view.rank.score).toBe(0);
    expect(view.rank.color).toBe(TIER_COLORS.bronze);
    expect(view.points).toBe(0);
    expect(view.titles.unlocked).toEqual([]);
    expect(view.titles.equipped).toBeNull();
    // 업적은 카탈로그가 보이되 전부 미달성.
    expect(view.achievements.every(a => a.unlocked === false)).toBe(true);
  });

  test('null/undefined 입력에서 throw 없이 안전한 뷰', () => {
    const view = getProgression(null, undefined, null, NOW);
    expect(view.rank.tier).toBe('bronze');
    expect(view.points).toBe(0);
    expect(view.titles.equipped).toBeNull();
  });
});

// ============================================================================
// 3) 메모이즈 — 동일 입력 재호출은 같은 객체, now 변경은 재계산
// ============================================================================
describe('getProgression 메모이즈', () => {
  test('동일 참조 입력 → 같은 결과 객체(toBe)', () => {
    const state = defaultProgressionState();
    const a = getProgression(runs, shoes, state, NOW);
    const b = getProgression(runs, shoes, state, NOW);
    expect(a).toBe(b);
  });

  test('now 가 바뀌면 재계산(다른 객체)', () => {
    const state = defaultProgressionState();
    const a = getProgression(runs, shoes, state, NOW);
    const b = getProgression(runs, shoes, state, NOW + 1);
    expect(a).not.toBe(b);
    // 값 자체는 동일 시드라 일관(랭크 티어 동일).
    expect(a.rank.tier).toBe(b.rank.tier);
  });
});

// ============================================================================
// 4) detectNewUnlocks — 멱등 언락 알림(한 번만 발사)
// ============================================================================
describe('detectNewUnlocks: 멱등 알림', () => {
  test('최초 → 모든 충족 키가 newlyUnlocked, 재계산 → 빈 발사(anti-scenario 8)', () => {
    const view = getProgression(runs, shoes, defaultProgressionState(), NOW);
    const current = collectUnlockedKeys(view);
    expect(current.length).toBeGreaterThan(0);

    // 1차: seen 비어 있음 → 전부 새로 알림.
    const first = detectNewUnlocks([], current);
    expect(first.newlyUnlocked).toEqual(current);
    expect(new Set(first.nextSeen)).toEqual(new Set(current));

    // 2차: nextSeen 을 영속했다고 가정하고 같은 입력 재계산 → 다시 안 뜸.
    const second = detectNewUnlocks(first.nextSeen, current);
    expect(second.newlyUnlocked).toEqual([]);
    expect(new Set(second.nextSeen)).toEqual(new Set(first.nextSeen));
  });

  test('일부만 새로 충족 → 그 차집합만 발사, 옛 seen 키는 보존', () => {
    const current = ['running_beginner', 'running_100k', 'ach_first_run'];
    const prevSeen = ['running_beginner', 'old_key_no_longer_unlocked'];
    const {newlyUnlocked, nextSeen} = detectNewUnlocks(prevSeen, current);
    expect(newlyUnlocked).toEqual(['running_100k', 'ach_first_run']);
    // 더 이상 충족되지 않는 옛 키도 seen 에 남는다(한 번 알린 건 영영 알린 것).
    expect(nextSeen).toEqual(
      expect.arrayContaining([
        'running_beginner',
        'old_key_no_longer_unlocked',
        'running_100k',
        'ach_first_run',
      ]),
    );
  });

  test('비정상/빈 입력에서 throw 없이 안전', () => {
    expect(detectNewUnlocks(null, null)).toEqual({
      newlyUnlocked: [],
      nextSeen: [],
    });
    expect(detectNewUnlocks(undefined, ['a'])).toEqual({
      newlyUnlocked: ['a'],
      nextSeen: ['a'],
    });
    // 중복 입력은 제거.
    expect(detectNewUnlocks([], ['a', 'a', 'b']).newlyUnlocked).toEqual([
      'a',
      'b',
    ]);
  });

  test('collectUnlockedKeys: 비정상 입력 → []', () => {
    expect(collectUnlockedKeys(null)).toEqual([]);
    expect(collectUnlockedKeys(undefined)).toEqual([]);
  });
});
