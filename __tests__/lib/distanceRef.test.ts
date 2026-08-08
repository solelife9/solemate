/**
 * 폰↔워치 거리 대조 기록 — **폰 정확도를 잴 유일한 재료.**
 *
 * 2026-08-09 민우님 지적: "워치랑 폰 둘 다 각각으로도 정확해야 의미가 있을 텐데."
 * 폰+워치 동시 러닝에서 저장 거리는 워치 값인데, 폰도 자기 거리를 계속 잰다. 그 값을
 * 러닝이 끝나며 버리면 **폰 GPS 가 얼마나 정확한지 영영 못 잰다.** 몇 번만 같이 뛰면
 * "폰이 워치보다 N% 짧다"가 실측으로 나오고, 그게 GPS 계수를 고칠 근거다
 * (2026-07-11 의 +9% 교정도 같은 방식이었다).
 * @format
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveDistanceRef, loadDistanceRef, phoneDeltaPct, distanceRefLine,
} from '../../lib/distanceRef';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('남길 것과 남기지 않을 것', () => {
  test('워치가 기록자였으면 남긴다', async () => {
    expect(await saveDistanceRef('r1', {savedKm: 5.36, phoneKm: 5.14, source: 'watch'})).toBe(true);
    expect(await loadDistanceRef('r1')).toEqual({savedKm: 5.36, phoneKm: 5.14, source: 'watch'});
  });

  test('★ 폰 단독 러닝은 남기지 않는다 — 비교할 대상이 없다', async () => {
    expect(await saveDistanceRef('r2', {savedKm: 5.1, phoneKm: 5.1, source: 'phone'})).toBe(false);
    expect(await loadDistanceRef('r2')).toBeNull();
  });

  test.each([
    ['저장 거리 0', {savedKm: 0, phoneKm: 5}],
    ['폰 거리 0', {savedKm: 5, phoneKm: 0}],
    ['NaN', {savedKm: NaN, phoneKm: 5}],
    ['음수', {savedKm: 5, phoneKm: -1}],
  ])('%s 는 남기지 않는다 — 틀린 기준선은 없는 것보다 나쁘다', async (_l, o) => {
    const bad = o as {savedKm: number; phoneKm: number};
    expect(await saveDistanceRef('r3', {...bad, source: 'watch'})).toBe(false);
    expect(await loadDistanceRef('r3')).toBeNull();
  });

  test('runId 가 없으면 남기지 않는다', async () => {
    expect(await saveDistanceRef('', {savedKm: 5, phoneKm: 4, source: 'watch'})).toBe(false);
  });
});

describe('읽기는 안전하다', () => {
  test('없으면 null', async () => {
    expect(await loadDistanceRef('nope')).toBeNull();
  });

  test('깨진 JSON 이어도 죽지 않는다', async () => {
    await AsyncStorage.setItem('distref_bad', '{{{');
    expect(await loadDistanceRef('bad')).toBeNull();
  });

  test('값이 이상하면 null — 저장 이후에 오염됐을 수도 있다', async () => {
    await AsyncStorage.setItem('distref_x', JSON.stringify({savedKm: 0, phoneKm: 5}));
    expect(await loadDistanceRef('x')).toBeNull();
  });
});

describe('차이 계산', () => {
  test('폰이 짧으면 음수 — 기준은 워치(저장된 정본)다', () => {
    const d = phoneDeltaPct({savedKm: 5.36, phoneKm: 5.14, source: 'watch'});
    expect(d).toBeLessThan(0);
    expect(d).toBeCloseTo(-4.104, 2);
  });

  test('폰이 길면 양수', () => {
    expect(phoneDeltaPct({savedKm: 5.0, phoneKm: 5.5, source: 'watch'})).toBeCloseTo(10, 6);
  });

  test('0 으로 나누지 않는다', () => {
    expect(phoneDeltaPct({savedKm: 0, phoneKm: 5, source: 'watch'})).toBe(0);
  });
});

describe('화면 한 줄 — 절제', () => {
  test('차이가 크면 두 값을 다 보여준다', () => {
    const line = distanceRefLine({savedKm: 5.36, phoneKm: 5.14, source: 'watch'});
    expect(line).toContain('워치 5.36km');
    expect(line).toContain('폰 GPS 5.14km');
    expect(line).toContain('4.1%');
  });

  test('★ 1% 미만이면 줄 자체가 안 나온다 — 잡음은 보여줄 값어치가 없다', () => {
    expect(distanceRefLine({savedKm: 5.0, phoneKm: 5.04, source: 'watch'})).toBeNull();
  });

  test('기록이 없으면 null', () => {
    expect(distanceRefLine(null)).toBeNull();
  });
});

// ── 배선 ─────────────────────────────────────────────────────────────────────
// 기록만 하고 아무 데도 안 보이면 측정할 수 없다 — 민우님이 숫자를 읽을 수 있어야
// 폰 GPS 를 고칠 수 있다. 반대로 저장을 안 하면 러닝이 끝나며 값이 사라진다.
describe('배선 — 저장하고, 보여준다', () => {
  const read = (p: string) =>
    require('fs').readFileSync(require('path').join(__dirname, '../..', p), 'utf8');

  test('러닝 저장 시 엔진의 두 값을 그대로 남긴다', () => {
    const app = read('App.tsx');
    expect(app).toContain('saveDistanceRef');
    expect(app).toContain('runTracker.getPhoneDistanceKm()');
    expect(app).toContain('runTracker.getDistanceSource()');
  });

  test('러닝 상세가 읽어서 보여준다', () => {
    const h = read('HistoryScreen.rn.tsx');
    expect(h).toContain('loadDistanceRef');
    expect(h).toContain('distanceRefLine');
    expect(h).toContain('run-detail-distref');
  });
});
