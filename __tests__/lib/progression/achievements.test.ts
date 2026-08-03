// lib/progression/achievements — 업적 카탈로그(라이브 진행 + 정직 언락).
//
// 관찰 가능한 동작(behavioral):
//   · progress(ctx) 의 current/target 이 실제 데이터와 일치한다(예: 누적 거리 640/1000km).
//   · 진행이 target 에 닿는 순간이 정확히 언락 순간(진행바·언락 모순 불가).
//   · 미충족 업적은 절대 unlocked 를 보고하지 않는다(anti-scenario 1 — 날조 금지).
//   · 6개 카테고리를 모두 커버한다.
//   · 빈/비정상 컨텍스트 → 아무 업적도 언락 안 함, throw 없음.
//   · 업적 XP(반복형 포함)가 카탈로그 정의와 일치한다.
//
// 순수 엔진(ctx 만 읽음)이라 AsyncStorage 를 쓰지 않는다 — 키 격리 자명.

import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_KEY,
  achievementDef,
  achievementProgress,
  computeTotalXp,
  earnedXpFor,
  evaluateAchievements,
  unlockedAchievements,
} from '../../../lib/progression/achievements';
import {
  AchievementCategory,
  PerShoeStats,
  ProgressionContext,
} from '../../../lib/progression/types';

const NOW = new Date(2026, 5, 12).getTime();

function emptyCtx(over: Partial<ProgressionContext> = {}): ProgressionContext {
  return {
    now: NOW,
    cumulativeKm: 0,
    runCount: 0,
    totalDurationS: 0,
    longestRunKm: 0,
    bestPaceSec: null,
    avgPaceSec: null,
    currentStreak: 0,
    longestStreak: 0,
    weeklyActiveRatio: 0,
    earlyRunCount: 0,
    nightRunCount: 0,
    longestGapDays: 0,
    registeredShoeCount: 0,
    wornShoeCount: 0,
    retiredShoeCount: 0,
    perShoe: {},
    earnedTitleKeys: [],
    earnedTitleCount: 0,
    completedChallengeCount: 0,
    ...over,
  };
}

function shoe(over: Partial<PerShoeStats> & {id: string}): PerShoeStats {
  return {
    id: over.id,
    name: over.name ?? over.id,
    km: over.km ?? 0,
    runs: over.runs ?? 0,
    firstWorn: over.firstWorn ?? null,
    lastWorn: over.lastWorn ?? null,
    retired: over.retired ?? false,
    maxKm: over.maxKm ?? 0,
  };
}

function perShoeMap(...shoes: PerShoeStats[]): Record<string, PerShoeStats> {
  const m: Record<string, PerShoeStats> = {};
  for (const s of shoes) m[s.id] = s;
  return m;
}

/** 키로 업적 progress 단축 조회(정의는 반드시 존재). */
function progressOf(key: string, ctx: ProgressionContext) {
  const def = achievementDef(key);
  if (!def) throw new Error(`unknown achievement: ${key}`);
  return achievementProgress(def, ctx);
}

// ============================================================================
// 1) progress current/target — 실제 데이터와 정합
// ============================================================================
describe('progress current/target', () => {
  test('누적 거리 진행: 1000km 가 실제 누적과 일치', () => {
    const ctx = emptyCtx({cumulativeKm: 640});
    expect(progressOf('dist_1000', ctx)).toEqual({
      current: 640,
      target: 1000,
    });
  });

  test('누적 거리 진행: 5000km 도달 → 언락 + current=target(초과 캡)', () => {
    const at = emptyCtx({cumulativeKm: 5200});
    expect(progressOf('dist_5000', at)).toEqual({current: 5000, target: 5000});
    expect(achievementDef('dist_5000')!.unlocked(at)).toBe(true);
  });

  test('누적 거리 진행: 100km 가 실제 누적과 일치', () => {
    expect(progressOf('dist_100', emptyCtx({cumulativeKm: 73}))).toEqual({
      current: 73,
      target: 100,
    });
  });
});

// ============================================================================
// 2) 진행이 target 에 닿는 순간 = 언락 순간(경계 일관성)
// ============================================================================
describe('진행·언락 경계 일관성', () => {
  test('마라톤 완주: 42.195km 경계', () => {
    const def = achievementDef('first_marathon')!;
    expect(def.unlocked(emptyCtx({longestRunKm: 42.195}))).toBe(true);
    expect(def.unlocked(emptyCtx({longestRunKm: 42.19}))).toBe(false);
    // 미달 진행은 current<target.
    const p = progressOf('first_marathon', emptyCtx({longestRunKm: 40}));
    expect(p.current).toBeCloseTo(40);
    expect(p.target).toBeCloseTo(42.195);
  });

  test('모든 metric 업적: unlocked ⟺ progress.current ≥ target', () => {
    // 충분히 큰 사실로 모두 채운 컨텍스트 — 닿은 업적은 모두 언락이어야.
    // (반복형 shoeMemory 업적은 target=신발수로 동작이 달라 별도 검증; 여기선 제외.)
    const rich = emptyCtx({
      runCount: 500,
      cumulativeKm: 9000,
      longestRunKm: 50,
      longestStreak: 200,
      weeklyActiveRatio: 1,
      registeredShoeCount: 12,
      bestPaceSec: 250,
      earlyRunCount: 30,
      nightRunCount: 30,
      hasWinterRun: true,
      hasSummerRun: true,
      completedChallengeCount: 20,
      retirementCount: 12,
      perShoe: perShoeMap(
        shoe({id: 'a', km: 1200, maxKm: 1500, runs: 100}),
        shoe({id: 'b', km: 1100, maxKm: 1500, runs: 90}),
        shoe({id: 'c', km: 1000, maxKm: 1500, runs: 80}),
        shoe({id: 'd', km: 900, maxKm: 1500, runs: 70}),
        shoe({id: 'e', km: 800, maxKm: 1500, runs: 60}),
      ),
    });
    for (const def of ACHIEVEMENTS) {
      if (def.repeatablePerShoe) continue;
      const p = achievementProgress(def, rich);
      const reached = p.current >= p.target && p.target > 0;
      expect(def.unlocked(rich)).toBe(reached);
    }
  });
});

// ============================================================================
// 3) anti-scenario 1 — 미충족 업적은 절대 언락되지 않는다(날조 금지)
// ============================================================================
describe('anti-scenario 1: 미충족 무언락', () => {
  test('빈 컨텍스트 → 아무 업적도 언락 안 함', () => {
    expect(evaluateAchievements(emptyCtx())).toEqual([]);
    expect(unlockedAchievements(emptyCtx())).toEqual([]);
  });

  test('≥42km 런 없는 유저는 마라톤 완주를 절대 보고하지 않는다', () => {
    const ctx = emptyCtx({runCount: 300, cumulativeKm: 4000, longestRunKm: 30});
    expect(evaluateAchievements(ctx)).not.toContain('first_marathon');
  });

  test('각 업적: 진행이 target 미만이면 unlocked=false (개별)', () => {
    // 누적 거리만 약간 미달(499 < 500) → dist_500 언락 금지.
    const ctx = emptyCtx({cumulativeKm: 499});
    expect(achievementDef('dist_500')!.unlocked(ctx)).toBe(false);
    expect(evaluateAchievements(ctx)).not.toContain('dist_500');
  });

  test('shoeMemory(여정 완주): 수명의 90% 기준 — 카본화(450)도 405km면 언락(2026-07-04 재설계)', () => {
    const def = achievementDef('journey_full')!;
    // 옛 '함께 500km'는 카본 수명(450)보다 길어 교체 권고를 어겨야 따지는 모순.
    // 이제 수명 비율 90%: 카본 405km 도달이면 언락 — 교체 권장 시점과 정확히 정렬.
    const carbonReached = emptyCtx({
      perShoe: perShoeMap(shoe({id: 'carbon', km: 405, maxKm: 450})),
    });
    expect(def.unlocked(carbonReached)).toBe(true);

    // 데일리(650)는 90% = 585km 미만이면 미언락, 진행은 best km/목표 km.
    const below = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 100, maxKm: 650}),
        shoe({id: 'b', km: 500, maxKm: 650}),
      ),
    });
    expect(def.unlocked(below)).toBe(false);
    expect(progressOf('journey_full', below)).toEqual({current: 500, target: 585});
  });

  test('shoeMemory(반환점): 수명의 50% — maxKm 미상이면 기본 650 폴백', () => {
    const def = achievementDef('journey_half')!;
    expect(def.unlocked(emptyCtx({
      perShoe: perShoeMap(shoe({id: 'a', km: 225, maxKm: 450})),
    }))).toBe(true);
    // maxKm 0(미상) → 650 기준: 절반 325km.
    expect(def.unlocked(emptyCtx({
      perShoe: perShoeMap(shoe({id: 'a', km: 324, maxKm: 0})),
    }))).toBe(false);
    expect(def.unlocked(emptyCtx({
      perShoe: perShoeMap(shoe({id: 'a', km: 325, maxKm: 0})),
    }))).toBe(true);
  });

  test('shoeMemory 반복 적립: earnedCount = 임계 충족 신발 수', () => {
    const def = achievementDef('together_100')!;
    const ctx = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 120}),
        shoe({id: 'b', km: 300}),
        shoe({id: 'c', km: 50}), // 100km 미달
      ),
    });
    expect(def.repeatablePerShoe).toBe(true);
    expect(def.earnedCount!(ctx)).toBe(2);
    // 적립 XP = xp × earnedCount.
    expect(earnedXpFor(def, ctx)).toBe(def.xp * 2);
    // 진행 바는 충족 신발 수.
    expect(progressOf('together_100', ctx)).toEqual({current: 2, target: 2});
  });

  test('나이트 런: 야간 런 ≥1 에서만 언락', () => {
    const def = achievementDef('night_run')!;
    expect(def.unlocked(emptyCtx({nightRunCount: 1}))).toBe(true);
    expect(def.unlocked(emptyCtx({nightRunCount: 0}))).toBe(false);
  });

  test('일출 런: 새벽 런 ≥1 에서만 언락', () => {
    const def = achievementDef('sunrise_run')!;
    expect(def.unlocked(emptyCtx({earlyRunCount: 1}))).toBe(true);
    expect(def.unlocked(emptyCtx({earlyRunCount: 0}))).toBe(false);
  });

  test('계절 런: 겨울/여름 플래그가 정확히 언락을 좌우', () => {
    expect(achievementDef('winter_run')!.unlocked(emptyCtx({hasWinterRun: true}))).toBe(true);
    expect(achievementDef('winter_run')!.unlocked(emptyCtx({hasWinterRun: false}))).toBe(false);
    expect(achievementDef('summer_run')!.unlocked(emptyCtx({hasSummerRun: true}))).toBe(true);
    expect(achievementDef('summer_run')!.unlocked(emptyCtx({hasSummerRun: false}))).toBe(false);
  });

  test('영원히 잠긴 업적(트레일·빗속)은 카탈로그에서 제거됐다(2026-07-04)', () => {
    // 데이터가 없어 절대 못 따는 업적을 노출하면 신뢰를 깎는다 — 데이터 생기면 재도입.
    expect(achievementDef('trail_run')).toBeUndefined();
    expect(achievementDef('rain_run')).toBeUndefined();
  });

  test('비정상 입력에서 throw 없이 [] 반환', () => {
    // @ts-expect-error 의도적 비정상 입력.
    expect(evaluateAchievements(null)).toEqual([]);
    // @ts-expect-error 의도적 비정상 입력.
    expect(unlockedAchievements(undefined)).toEqual([]);
  });

  test('NaN/음수 필드는 0 으로 클램프되어 언락되지 않는다', () => {
    const ctx = emptyCtx({
      cumulativeKm: NaN,
      longestRunKm: -10,
      longestStreak: Number.POSITIVE_INFINITY,
    });
    expect(evaluateAchievements(ctx)).toEqual([]);
  });
});

// ============================================================================
// 4) XP — 카탈로그 정의 일치 + 총합(2-pass)
// ============================================================================
describe('업적 XP 정합', () => {
  test('단발 업적: 언락 시 정확히 def.xp 적립, 미언락이면 0', () => {
    const def = achievementDef('first_marathon')!;
    expect(earnedXpFor(def, emptyCtx({longestRunKm: 42.195}))).toBe(def.xp);
    expect(earnedXpFor(def, emptyCtx({longestRunKm: 10}))).toBe(0);
  });

  test('computeTotalXp = 언락 업적 XP 합(반복형은 신발수 배수)', () => {
    const ctx = emptyCtx({
      cumulativeKm: 120,
      longestRunKm: 6,
      runCount: 3,
      registeredShoeCount: 1,
      perShoe: perShoeMap(shoe({id: 'a', km: 120})),
    });
    // 직접 합산과 일치해야 한다(권위 단일).
    const manual = ACHIEVEMENTS.reduce((s, d) => s + earnedXpFor(d, ctx), 0);
    expect(computeTotalXp(ctx)).toBe(manual);
    expect(manual).toBeGreaterThan(0);
  });

  test('빈/비정상 컨텍스트의 총 XP 는 0', () => {
    expect(computeTotalXp(emptyCtx())).toBe(0);
    // @ts-expect-error 의도적 비정상 입력.
    expect(computeTotalXp(null)).toBe(0);
  });

  test('모든 업적의 xp 는 양의 유한값', () => {
    for (const def of ACHIEVEMENTS) {
      expect(Number.isFinite(def.xp)).toBe(true);
      expect(def.xp).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// 5) 카탈로그 무결성 + 카테고리 커버리지
// ============================================================================
describe('카탈로그 무결성', () => {
  test('키는 고유하고 ACHIEVEMENTS_BY_KEY 와 일치한다', () => {
    const keys = ACHIEVEMENTS.map(a => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(ACHIEVEMENTS_BY_KEY).length).toBe(ACHIEVEMENTS.length);
  });

  test('7개 카테고리를 모두 커버한다', () => {
    const cats = new Set(ACHIEVEMENTS.map(a => a.category));
    (
      [
        'runningMilestone',
        'distanceMilestone',
        'consistency',
        'shoeJourney',
        'shoeMemory',
        'experience',
        'keego',
      ] as AchievementCategory[]
    ).forEach(c => expect(cats.has(c)).toBe(true));
  });

  test('모든 rarity 는 신규 4단계 집합에 속한다', () => {
    const allowed = new Set(['common', 'rare', 'epic', 'legendary']);
    for (const def of ACHIEVEMENTS) {
      expect(allowed.has(def.rarity)).toBe(true);
    }
  });

  test('반복형 업적은 earnedCount 를 제공한다(계약 보장)', () => {
    for (const def of ACHIEVEMENTS) {
      if (def.repeatablePerShoe) {
        expect(typeof def.earnedCount).toBe('function');
      }
    }
  });

  test('마라톤 완주가 카탈로그에 존재한다(단일 런 이정표·legendary)', () => {
    const def = achievementDef('first_marathon');
    expect(def?.name).toBe('마라톤 완주');
    expect(def?.category).toBe('runningMilestone');
    expect(def?.rarity).toBe('legendary');
  });
});

// ============================================================================
// 5b) consistency — 꾸준함(런 횟수·스트릭·누적 시간)
// ============================================================================
describe('consistency: 꾸준함', () => {

  test("꾸준함 v4('쉼표 있는 리듬'): 유예 1주 스트릭이 단일 지표", () => {
    expect(achievementDef('weeks_4')!.unlocked(emptyCtx({longestWeeklyStreak: 4}))).toBe(true);
    expect(achievementDef('weeks_52')!.unlocked(emptyCtx({longestWeeklyStreak: 52}))).toBe(true);
    expect(achievementDef('weeks_52')!.unlocked(emptyCtx({longestWeeklyStreak: 51}))).toBe(false);
    // 단순 누적 주 수로는 열리지 않는다(리듬 유지가 조건 — 누적 거리와 구분).
    expect(achievementDef('weeks_52')!.unlocked(emptyCtx({qualifiedWeekCount: 60, longestWeeklyStreak: 30}))).toBe(false);
    // 일일 스트릭·횟수 업적은 폐기 상태 유지(카탈로그 계약).
    expect(achievementDef('streak_3')).toBeUndefined();
    expect(achievementDef('streak_7')).toBeUndefined();
    expect(achievementDef('runs_10')).toBeUndefined();
    const consistency = ACHIEVEMENTS.filter(a => a.category === 'consistency');
    expect(consistency.map(a => a.key)).toEqual(['weeks_4', 'weeks_12', 'weeks_26', 'weeks_52']);
  });
  test('keego = 시그니처 한 장(킵고잉, 1년) — 온전한 하루·잘 보내주었다 제거', () => {
    expect(achievementDef('time_24h')).toBeUndefined();
    expect(achievementDef('well_sent')).toBeUndefined();
    const keego = ACHIEVEMENTS.filter(a => a.category === 'keego');
    expect(keego.map(a => a.key)).toEqual(['keep_going_year']);
  });
});

// ============================================================================
// 6) keego — 킵고잉, 1년(러너의 여정: 첫 런 → 마지막 런)
// ============================================================================
// 2026-07-04 재설계: 옛 '오랜 동반자'(한 켤레 1년)는 적게 달리거나 수명 지난 신발로
// 달려야 유리한 역인센티브 → 러너 자신의 여정(runSpanDays)으로 교체.
describe('keego: 킵고잉, 1년', () => {
  test('첫 런과 마지막 런이 365일 이상 떨어져 있으면 언락', () => {
    const def = achievementDef('keep_going_year')!;
    expect(def.unlocked(emptyCtx({runSpanDays: 365}))).toBe(true);
    expect(def.unlocked(emptyCtx({runSpanDays: 364}))).toBe(false);
    expect(def.unlocked(emptyCtx({}))).toBe(false); // 필드 부재도 안전
  });

  test('진행 바는 runSpanDays/365 로 캡된다', () => {
    const def = achievementDef('keep_going_year')!;
    const p = achievementProgress(def, emptyCtx({runSpanDays: 100}));
    expect(p).toEqual({current: 100, target: 365});
    expect(achievementProgress(def, emptyCtx({runSpanDays: 9999})).current).toBe(365);
  });

  test('옛 키(longtime_partner)는 카탈로그에 없다', () => {
    expect(achievementDef('longtime_partner')).toBeUndefined();
  });

});

// ─── 검증 가능한 값만 XP 가 된다 (2026-08-03) ─────────────────────────────────
// 등록 수(registeredShoeCount)는 자기 신고라 앱이 진위를 판별할 수 없다. 이름만 열 번
// 입력하면 shoe_3·5·10 이 한 번에 열려 **180 XP + 랭크 티어 상승 + 타이틀**이 따라왔고,
// 그 티어는 랭킹 목록의 모든 행에 색과 이름으로 표시된다 — 실제로 달린 사람보다 위에.
// MISSION 의 'Truth only(모든 숫자는 실제 집계)' 위반이라 기준을 러닝 기록으로 옮겼다.
describe('신발 업적은 등록이 아니라 실제 주행을 센다', () => {
  const shoeXp = (ctx: ProgressionContext) =>
    unlockedAchievements(ctx)
      .filter(a => a.key.startsWith('shoe_'))
      .reduce((sum, a) => sum + (Number((a as {xp?: number}).xp) || 0), 0);

  test('등록만 10켤레 — 첫 신발(10 XP)만 열린다', () => {
    const paper = emptyCtx({registeredShoeCount: 10, wornShoeCount: 0});
    const keys = unlockedAchievements(paper).map(a => a.key);
    expect(keys).toContain('shoe_1');
    for (const k of ['shoe_3', 'shoe_5', 'shoe_10']) expect(keys).not.toContain(k);
    expect(shoeXp(paper)).toBe(10); // 구조 변경 전에는 190 이었다
  });

  test('신고 달린 켤레가 늘어야 사다리가 열린다', () => {
    const worn = (n: number) => emptyCtx({registeredShoeCount: 10, wornShoeCount: n});
    expect(unlockedAchievements(worn(3)).map(a => a.key)).toContain('shoe_3');
    expect(unlockedAchievements(worn(2)).map(a => a.key)).not.toContain('shoe_3');
    expect(shoeXp(worn(10))).toBe(190); // 전부 실제로 신고 달렸을 때만 만점
  });

  test('첫 신발은 등록 기준을 유지한다 — 첫 완주 리캡을 축하가 가리지 않게', () => {
    // 'worn' 으로 옮기면 첫 러닝 저장 순간에 언락되는데, CelebrationScreen 이 렌더
    // 사다리에서 RunRecapScreen 보다 앞이라 완주 리캡을 덮는다(App.tsx).
    expect(unlockedAchievements(emptyCtx({registeredShoeCount: 1, wornShoeCount: 0})).map(a => a.key))
      .toContain('shoe_1');
  });
});
