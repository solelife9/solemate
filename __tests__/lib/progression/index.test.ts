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
  pickRecentAchievement,
  type AchievementView,
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
// 2b) equipped 게이트 — 영속 장착 키는 '지금 충족된' 타이틀일 때만 노출(날조 금지)
// ============================================================================
describe('getProgression: equipped 검증(anti-scenario 1)', () => {
  test('미충족 타이틀을 가리키는 equippedTitleKey → equipped=null', () => {
    // running_1000k(1000km 필요)는 시드(~105km)로 충족되지 않는다. 손상/퇴행 상태가
    // 이를 장착한 것으로 영속했다 가정 — 셀렉터는 미획득 타이틀을 표면화하면 안 된다.
    const state = stateWith({
      earnedTitles: [{key: 'running_1000k', unlockedAt: '', isEquipped: true}],
      equippedTitleKey: 'running_1000k',
    });
    const view = getProgression(runs, shoes, state, NOW);
    expect(view.titles.unlocked.map(t => t.key)).not.toContain('running_1000k');
    expect(view.titles.equipped).toBeNull();
  });

  test('지금 충족된 타이틀을 장착 → 그 키가 그대로 노출', () => {
    const state = stateWith({
      earnedTitles: [{key: 'running_100k', unlockedAt: '', isEquipped: true}],
      equippedTitleKey: 'running_100k',
    });
    const view = getProgression(runs, shoes, state, NOW);
    expect(view.titles.unlocked.map(t => t.key)).toContain('running_100k');
    expect(view.titles.equipped).toBe('running_100k');
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

  test('now 미지정(문서화된 기본 호출형) 동일 참조 재호출 → memo hit(toBe)', () => {
    // 기본값 Date.now() 가 키에 새 나가면 매 호출이 재계산된다 — 그것을 막았는지 검증.
    const state = defaultProgressionState();
    const a = getProgression(runs, shoes, state);
    const b = getProgression(runs, shoes, state);
    expect(a).toBe(b);
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

// ============================================================================
// 5) pickRecentAchievement — 홈 '최근 달성'은 포인트가 아니라 해제 순서(recency)
// ============================================================================
describe('pickRecentAchievement: recency가 포인트를 이긴다', () => {
  const ach = (key: string, name: string, points: number): AchievementView => ({
    key,
    name,
    category: 'running',
    group: 'distance',
    rarity: 'bronze',
    points,
    hidden: false,
    progress: {current: 1, target: 1},
    unlocked: true,
  });
  // 최소 뷰(셀렉터는 achievements 만 읽는다) — 나머지는 형태만 맞춰 캐스팅.
  const viewWith = (achievements: AchievementView[]) =>
    ({achievements} as unknown as Parameters<typeof pickRecentAchievement>[0]);

  test('낮은 포인트 업적이 더 늦게(꼬리) 해제되면 그게 최근 달성으로 뽑힌다', () => {
    // big=900점은 먼저, small=10점은 나중에 해제 → seenUnlocks 꼬리에 small 이 온다.
    const view = viewWith([
      ach('ach_big', 'Marathon Legend', 900),
      ach('ach_small', 'First Steps', 10),
    ]);
    // 타이틀 키가 섞여 있어도(업적 맵에 없으니) 건너뛴다.
    const seen = ['running_beginner', 'ach_big', 'ach_small'];
    const pick = pickRecentAchievement(view, seen);
    expect(pick?.key).toBe('ach_small'); // recency가 포인트(900>10)를 이긴다
    expect(pick?.name).toBe('First Steps');
  });

  test('해제 순서가 반대면 결과도 반대(포인트 무관, 순서만 본다)', () => {
    const view = viewWith([
      ach('ach_big', 'Marathon Legend', 900),
      ach('ach_small', 'First Steps', 10),
    ]);
    const pick = pickRecentAchievement(view, ['ach_small', 'ach_big']);
    expect(pick?.key).toBe('ach_big'); // 이번엔 high-points가 더 늦게 해제됨
  });

  test('seenUnlocks 에 현재 해제 업적이 없으면 포인트 최고로 폴백', () => {
    const view = viewWith([
      ach('ach_big', 'Marathon Legend', 900),
      ach('ach_small', 'First Steps', 10),
    ]);
    // seen 엔 타이틀 키뿐 → recency 신호 없음 → 포인트 최고(ach_big).
    expect(pickRecentAchievement(view, ['running_beginner'])?.key).toBe('ach_big');
    expect(pickRecentAchievement(view, [])?.key).toBe('ach_big');
    expect(pickRecentAchievement(view, null)?.key).toBe('ach_big');
  });

  test('잠긴 업적 키가 seen 에 있어도 무시(현재 해제된 것만 매칭)', () => {
    const locked = ach('ach_locked', 'Locked', 50);
    locked.unlocked = false;
    const view = viewWith([locked, ach('ach_small', 'First Steps', 10)]);
    // 꼬리의 ach_locked 는 지금 잠겨 있으니 건너뛰고 ach_small 로.
    expect(pickRecentAchievement(view, ['ach_small', 'ach_locked'])?.key).toBe('ach_small');
  });

  test('해제 업적이 하나도 없으면 null, 비정상 입력도 안전', () => {
    expect(pickRecentAchievement(viewWith([]), ['x'])).toBeNull();
    expect(pickRecentAchievement(null, ['x'])).toBeNull();
    expect(pickRecentAchievement(undefined, null)).toBeNull();
  });

  test('실데이터 경로: getProgression 뷰 + seenUnlocks 로 최근 업적을 고른다', () => {
    const view = getProgression(runs, shoes, defaultProgressionState(), NOW);
    const unlocked = view.achievements.filter(a => a.unlocked);
    expect(unlocked.length).toBeGreaterThan(1);
    // 임의로 '가장 늦게' 해제한 키를 꼬리에 두면 그게 뽑혀야 한다(포인트와 무관).
    const last = unlocked[0]; // 카탈로그 첫 해제 업적을 일부러 꼬리에 배치
    const seen = [...unlocked.map(a => a.key).filter(k => k !== last.key), last.key];
    expect(pickRecentAchievement(view, seen)?.key).toBe(last.key);
  });
});
