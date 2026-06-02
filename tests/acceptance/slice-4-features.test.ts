// ============================================================================
// Acceptance tests — Slice 4: 차별점 강화(부상예방·로테이션) + 백업 + 공유카드 + 챌린지
// slice: 4   tag: @slice-4
//
// Pure-logic contracts for Slice 4. UI/integration behaviors (AddShoe browse,
// run-screen icon removal, history density, shoe-card bar removal, share-card
// image, ProfileScreen backup UI, challenge UI) are covered by per-job behavior
// tests. These pure-logic tests will fail until the Slice 4 lib modules exist (TDD).
//
// Contracts:
//   lib/injury.ts      — assessInjuryRisk(percentUsed) → 마모도 기반 부상위험 등급/문구
//   lib/rotation.ts    — recommendRotation({shoes, runs, runType?}) → 휴식·카테고리·마모분산 추천
//   lib/backup.ts      — serializeBackup / parseBackup (버전드 JSON 백업 라운드트립)
//   lib/challenges.ts  — challengeProgress(challenge, runs) → 개인 챌린지 진행률/달성
// ============================================================================

import { assessInjuryRisk } from '../../lib/injury';
import { recommendRotation } from '../../lib/rotation';
import { serializeBackup, parseBackup } from '../../lib/backup';
import { challengeProgress } from '../../lib/challenges';

// ── 차별점: 부상예방 경고 (마모도 → 위험 등급) ───────────────────────────────
// NOTE: 각 블록은 .skip 으로 시작한다(스텁 단계 — npm test green 유지). 해당 dev 잡이
// lib 모듈을 실제 구현하면 자기 블록의 `.skip` 을 제거한다. slice-4-e2e 가 잔존 `.skip` 0 을 검증.
describe.skip('@slice-4 부상예방 경고', () => {
  test('마모도 구간별 위험 등급: <75% 안전, 75~90% 주의, >90% 위험', () => {
    expect(assessInjuryRisk(0.4).level).toBe('safe');
    expect(assessInjuryRisk(0.8).level).toBe('caution');
    expect(assessInjuryRisk(0.95).level).toBe('high');
  });

  test('경계값 안정성: 0과 1을 벗어난 입력도 등급으로 클램프', () => {
    expect(assessInjuryRisk(0).level).toBe('safe');
    expect(assessInjuryRisk(1).level).toBe('high');
    expect(assessInjuryRisk(1.5).level).toBe('high');
    expect(assessInjuryRisk(-0.2).level).toBe('safe');
  });

  test('주의/위험 등급은 keep-going 보이스의 한국어 안내 문구를 제공한다', () => {
    expect(assessInjuryRisk(0.8).message.length).toBeGreaterThan(0);
    expect(assessInjuryRisk(0.95).message.length).toBeGreaterThan(0);
  });
});

// ── 차별점: 신발 로테이션 추천 ───────────────────────────────────────────────
describe.skip('@slice-4 신발 로테이션 추천', () => {
  const mk = (id: string, brand: string, model: string, extra: object = {}) =>
    ({ id, brand, model, ...extra });

  test('신발이 0~1켤레면 추천 없음(로테이션은 2켤레 이상에서만 의미)', () => {
    expect(recommendRotation({ shoes: [], runs: [] })).toEqual([]);
    expect(recommendRotation({ shoes: [mk('a', 'Nike', 'Pegasus 41')], runs: [] })).toEqual([]);
  });

  test('보관(retired) 신발은 추천에서 제외한다', () => {
    const shoes = [
      mk('a', 'Nike', 'Pegasus 41'),
      mk('b', 'Hoka', 'Bondi 9', { retired: true }),
      mk('c', 'Adidas', 'Adizero SL2'),
    ];
    const picks = recommendRotation({ shoes, runs: [] });
    expect(picks.every(p => p.shoe.id !== 'b')).toBe(true);
  });

  test('같은 조건이면 더 오래 쉰 신발을 먼저 추천한다(폼 회복·로테이션)', () => {
    const shoes = [mk('a', 'Nike', 'Pegasus 41'), mk('c', 'Nike', 'Pegasus 41')];
    // a는 어제, c는 8일 전 착용 → c가 더 오래 쉼 → c 우선
    const runs = [
      { shoeId: 'a', date: '2026-06-02' },
      { shoeId: 'c', date: '2026-05-26' },
    ];
    const picks = recommendRotation({ shoes, runs, runType: 'easy' });
    expect(picks.length).toBeGreaterThanOrEqual(2);
    expect(picks[0].shoe.id).toBe('c');
    expect(typeof picks[0].reason).toBe('string');
    expect(picks[0].reason.length).toBeGreaterThan(0);
  });
});

// ── 데이터 백업/복원 (버전드 JSON 라운드트립) ────────────────────────────────
describe.skip('@slice-4 데이터 백업/복원', () => {
  const payload = {
    shoes: [{ id: '1', brand: 'Nike', model: 'Pegasus 41', total_km: 120, target_km: 700 }],
    runs: [{ id: '10', shoe_id: 1, distance_km: 5.2, date: '2026-06-01' }],
    settings: { unit: 'km', goal_weekly_km: 30 },
  };

  test('serialize→parse 라운드트립으로 데이터가 보존된다', () => {
    const json = serializeBackup(payload);
    expect(typeof json).toBe('string');
    const restored = parseBackup(json);
    expect(restored.shoes).toEqual(payload.shoes);
    expect(restored.runs).toEqual(payload.runs);
    expect(restored.settings).toEqual(payload.settings);
  });

  test('백업에는 버전 필드가 있어 향후 마이그레이션이 가능하다', () => {
    const restored = parseBackup(serializeBackup(payload));
    expect(restored.version).toBeGreaterThanOrEqual(1);
  });

  test('잘못된/손상된 JSON은 throw 하여 데이터 파괴를 막는다', () => {
    expect(() => parseBackup('이건JSON아님')).toThrow();
    expect(() => parseBackup('{"version":999}')).toThrow();
  });
});

// ── 개인 챌린지 (거리·스트릭) ────────────────────────────────────────────────
describe.skip('@slice-4 개인 챌린지', () => {
  test('거리 챌린지: 기간 내 런 거리 합산으로 진행률·달성 판정', () => {
    const ch = { id: 'c1', kind: 'distance' as const, targetKm: 100, startDate: '2026-06-01', endDate: '2026-06-30' };
    const runs = [
      { date: '2026-06-03', dist: 40 },
      { date: '2026-06-10', dist: 30 },
      { date: '2026-05-30', dist: 99 }, // 기간 밖 → 미포함
    ];
    const p = challengeProgress(ch, runs);
    expect(p.current).toBeCloseTo(70, 5);
    expect(p.target).toBe(100);
    expect(p.pct).toBeCloseTo(0.7, 5);
    expect(p.completed).toBe(false);
  });

  test('목표 도달 시 completed=true, pct는 1로 캡', () => {
    const ch = { id: 'c2', kind: 'distance' as const, targetKm: 50, startDate: '2026-06-01', endDate: '2026-06-30' };
    const runs = [{ date: '2026-06-05', dist: 60 }];
    const p = challengeProgress(ch, runs);
    expect(p.completed).toBe(true);
    expect(p.pct).toBe(1);
  });

  test('런이 없으면 진행 0·미달성', () => {
    const ch = { id: 'c3', kind: 'distance' as const, targetKm: 30, startDate: '2026-06-01', endDate: '2026-06-30' };
    const p = challengeProgress(ch, []);
    expect(p.current).toBe(0);
    expect(p.completed).toBe(false);
  });
});
