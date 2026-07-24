/**
 * hkFindRunWorkoutWindow — 러닝 상세 복구용 워크아웃 시간창 매칭(2026-07-24).
 * 계약: 그 날짜 워크아웃 중 러닝 시간과 ±tolS 이내 최적 매치의 실제 시간창을 돌려주고,
 * 매치가 없으면 null(엉뚱한 창 백필 금지 — 보수적).
 * @format
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {hkFindRunWorkoutWindow} from '../../lib/healthkit';

const hk = require('@kingstinct/react-native-healthkit');

const day = '2026-07-20';
const at = (h: number, m: number, dur: number) => {
  const s = new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  return {startDate: s.toISOString(), endDate: new Date(s.getTime() + dur * 1000).toISOString()};
};

beforeEach(async () => {
  await AsyncStorage.setItem('hk_linked_v1', '1'); // 연동 상태
  (hk.queryWorkoutSamples as jest.Mock).mockReset();
});

test('러닝 시간과 가장 근접한 워크아웃의 실제 시간창을 돌려준다', async () => {
  (hk.queryWorkoutSamples as jest.Mock).mockResolvedValue([
    at(7, 0, 1500),   // 25분 — 차이 300s(허용 밖)
    at(19, 30, 1830), // 30.5분 — 차이 30s(최적)
    at(21, 0, 1900),  // 31.7분 — 차이 100s(허용 안이지만 차선)
  ]);
  const win = await hkFindRunWorkoutWindow(day, 1800);
  expect(win).not.toBeNull();
  const dur = (win!.endMs - win!.startMs) / 1000;
  expect(dur).toBe(1830);
});

test('허용 오차(±120s) 밖이면 null — 엉뚱한 창 백필 금지', async () => {
  (hk.queryWorkoutSamples as jest.Mock).mockResolvedValue([at(7, 0, 3600)]);
  await expect(hkFindRunWorkoutWindow(day, 1800)).resolves.toBeNull();
});

test('미연동이면 null(조회 자체 생략)', async () => {
  await AsyncStorage.removeItem('hk_linked_v1');
  (hk.queryWorkoutSamples as jest.Mock).mockResolvedValue([at(19, 30, 1800)]);
  await expect(hkFindRunWorkoutWindow(day, 1800)).resolves.toBeNull();
  expect(hk.queryWorkoutSamples).not.toHaveBeenCalled();
});

test('워크아웃 없음·조회 실패는 null (graceful)', async () => {
  (hk.queryWorkoutSamples as jest.Mock).mockResolvedValue([]);
  await expect(hkFindRunWorkoutWindow(day, 1800)).resolves.toBeNull();
  (hk.queryWorkoutSamples as jest.Mock).mockRejectedValue(new Error('no perm'));
  await expect(hkFindRunWorkoutWindow(day, 1800)).resolves.toBeNull();
});
