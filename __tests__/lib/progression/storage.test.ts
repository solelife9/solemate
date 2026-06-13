// lib/progression/storage — progression_v1 영속 라운드트립 + 손상 방어 + 키 격리.
//
// 관찰 가능한 동작:
//   · save→load 가 사용자 선택(장착 타이틀)·은퇴 기록·포인트를 보존한다.
//   · 누락/손상 JSON·부분 손상은 안전 기본값으로 복구하며 절대 throw 하지 않는다.
//   · 진척 저장이 기존 키(run/shoe/...)를 건드리지 않는다(격리).
//
// 알려진 누수(clearAllMockStorages) 회피: 각 테스트 전에 AsyncStorage.clear() 사용.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PROGRESSION_KEY,
  defaultProgressionState,
  loadProgression,
  saveProgression,
  normalizeProgressionState,
} from '../../../lib/progression/storage';
import {ProgressionState} from '../../../lib/progression/types';

beforeEach(async () => {
  await AsyncStorage.clear();
});

const sample: ProgressionState = {
  earnedTitles: [
    {key: 'running_100k', unlockedAt: '2026-06-01T00:00:00.000Z', isEquipped: true},
    {key: 'rotation_architect', unlockedAt: '2026-06-02T00:00:00.000Z', isEquipped: false},
  ],
  equippedTitleKey: 'running_100k',
  seenUnlocks: ['running_100k', 'rotation_architect'],
  retiredShoes: [
    {
      shoeId: 's1',
      name: 'Pegasus 40',
      km: 512,
      retiredAt: '2026-05-20T00:00:00.000Z',
      retireYear: 2026,
      grade: 'perfect',
    },
  ],
  points: 75,
};

describe('progression storage roundtrip', () => {
  test('save→load 가 전체 상태를 보존한다', async () => {
    await saveProgression(sample);
    const loaded = await loadProgression();
    expect(loaded).toEqual(sample);
  });

  test('save 는 단 하나의 키 progression_v1 만 쓴다', async () => {
    await saveProgression(sample);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toEqual([PROGRESSION_KEY]);
  });

  test('진척 저장이 기존 키를 건드리지 않는다(격리)', async () => {
    await AsyncStorage.setItem('runs', JSON.stringify([{id: 'r1'}]));
    await AsyncStorage.setItem('profile_name', '러너');
    await saveProgression(sample);
    expect(await AsyncStorage.getItem('runs')).toBe(JSON.stringify([{id: 'r1'}]));
    expect(await AsyncStorage.getItem('profile_name')).toBe('러너');
  });
});

describe('progression storage safe defaults', () => {
  test('누락(키 없음) → 기본값, throw 없음', async () => {
    await expect(loadProgression()).resolves.toEqual(defaultProgressionState());
  });

  test('손상 JSON → 기본값, throw 없음', async () => {
    await AsyncStorage.setItem(PROGRESSION_KEY, '{not valid json');
    await expect(loadProgression()).resolves.toEqual(defaultProgressionState());
  });

  test('JSON 이지만 객체 아님(배열/문자열) → 기본값', async () => {
    await AsyncStorage.setItem(PROGRESSION_KEY, '[1,2,3]');
    expect(await loadProgression()).toEqual(defaultProgressionState());
    await AsyncStorage.setItem(PROGRESSION_KEY, '"hello"');
    expect(await loadProgression()).toEqual(defaultProgressionState());
  });

  test('부분 손상(필드별 타입 오류)은 그 필드만 기본값으로 복구', async () => {
    await AsyncStorage.setItem(
      PROGRESSION_KEY,
      JSON.stringify({
        earnedTitles: 'nope', // 배열 아님 → []
        equippedTitleKey: 42, // 문자열 아님 → null
        seenUnlocks: ['a', 5, 'b', null], // 비문자 제거 → ['a','b']
        retiredShoes: [{name: 'no id'}], // shoeId 없음 → 버림
        points: -10, // 음수 → 0
      }),
    );
    const loaded = await loadProgression();
    expect(loaded.earnedTitles).toEqual([]);
    expect(loaded.equippedTitleKey).toBeNull();
    expect(loaded.seenUnlocks).toEqual(['a', 'b']);
    expect(loaded.retiredShoes).toEqual([]);
    expect(loaded.points).toBe(0);
  });
});

describe('normalizeProgressionState integrity', () => {
  test('장착 키가 보유 타이틀에 없으면 null 로 정정', () => {
    const s = normalizeProgressionState({
      earnedTitles: [{key: 'a', unlockedAt: '', isEquipped: false}],
      equippedTitleKey: 'ghost', // 보유하지 않은 키
    });
    expect(s.equippedTitleKey).toBeNull();
  });

  test('NaN points 는 0 으로 클램프', () => {
    expect(normalizeProgressionState({points: NaN}).points).toBe(0);
    expect(normalizeProgressionState({points: 'abc'}).points).toBe(0);
  });

  test('save 시 손상 입력도 정규화되어 디스크에 안전 값만 남는다', async () => {
    // points 음수·잘못된 장착 키를 저장 → load 시 정규화된 형태로 복구.
    await saveProgression({
      ...defaultProgressionState(),
      points: -5,
      equippedTitleKey: 'ghost',
    });
    const loaded = await loadProgression();
    expect(loaded.points).toBe(0);
    expect(loaded.equippedTitleKey).toBeNull();
  });
});
