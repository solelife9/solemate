// lib/genId — 클라이언트 레코드 id 생성 seam (Phase 5b · Stage 1)
//
// 검증: 형식(prefix_now_rand), 기존 런 localId 형식과의 동등성, 주입 결정성, 고유성.

import {genClientId, genRunId, genShoeId} from '../../lib/genId';

describe('genClientId', () => {
  test('형식: prefix_now_rand(base36 7자)', () => {
    const id = genClientId('run', 1718900000000, () => 0.123456789);
    expect(id.startsWith('run_1718900000000_')).toBe(true);
    const suffix = id.split('_')[2];
    expect(suffix).toBe((0.123456789).toString(36).slice(2, 9));
    expect(suffix.length).toBeLessThanOrEqual(7);
  });

  test('기존 런 localId 형식과 바이트 동일(주입 rand 동일 시)', () => {
    const now = 1718900000000;
    const rand = 0.42;
    const legacy = 'run_' + now + '_' + rand.toString(36).slice(2, 9);
    expect(genClientId('run', now, () => rand)).toBe(legacy);
  });

  test('prefix 별 접두사', () => {
    expect(genRunId(1, () => 0.5).startsWith('run_1_')).toBe(true);
    expect(genShoeId(1, () => 0.5).startsWith('shoe_1_')).toBe(true);
  });

  test('서로 다른 호출은 (시간/랜덤이 다르면) 다른 id', () => {
    const a = genClientId('shoe', 1, () => 0.1);
    const b = genClientId('shoe', 2, () => 0.1); // now 다름
    const c = genClientId('shoe', 1, () => 0.9); // rand 다름
    expect(new Set([a, b, c]).size).toBe(3);
  });

  test('기본 인자(now/rand 미주입)도 형식 충족', () => {
    const id = genRunId();
    expect(/^run_\d+_[0-9a-z]+$/.test(id)).toBe(true);
  });
});
