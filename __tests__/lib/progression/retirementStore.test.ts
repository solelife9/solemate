// lib/progression/retirementStore — 은퇴 레코드 영속(ADDITIVE·멱등·키 격리).
//
// 관찰 가능한 동작:
//   · persistRetiredShoe 후 loadProgression 이 그 레코드를 돌려준다(라운드트립).
//   · 같은 shoeId 를 두 번 영속해도 retiredShoes 에 하나만(멱등).
//   · 진척 저장이 오직 progression_v1 만 쓰고 기존 키(runs 등)를 건드리지 않는다(격리).
//
// 알려진 누수(clearAllMockStorages) 회피: 각 테스트 전에 AsyncStorage.clear() 사용.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {persistRetiredShoe} from '../../../lib/progression/retirementStore';
import {
  PROGRESSION_KEY,
  loadProgression,
} from '../../../lib/progression/storage';
import {RetiredShoeRecord} from '../../../lib/progression/types';

beforeEach(async () => {
  await AsyncStorage.clear();
});

const rec: RetiredShoeRecord = {
  shoeId: 's1',
  name: 'Pegasus 40',
  km: 512,
  retiredAt: '2026-04-01T00:00:00.000Z',
  retireYear: 2026,
  grade: 'perfect',
};

describe('persistRetiredShoe 라운드트립/멱등', () => {
  test('영속 후 loadProgression 이 레코드를 돌려준다', async () => {
    await persistRetiredShoe(rec);
    const loaded = await loadProgression();
    expect(loaded.retiredShoes).toHaveLength(1);
    expect(loaded.retiredShoes[0]).toMatchObject({
      shoeId: 's1',
      km: 512,
      retireYear: 2026,
      grade: 'perfect',
    });
  });

  test('같은 shoeId 재영속 → 멱등(하나만)', async () => {
    await persistRetiredShoe(rec);
    await persistRetiredShoe(rec);
    const loaded = await loadProgression();
    expect(loaded.retiredShoes).toHaveLength(1);
  });

  test('다른 신발은 누적된다', async () => {
    await persistRetiredShoe(rec);
    await persistRetiredShoe({...rec, shoeId: 's2', name: 'Vaporfly'});
    const loaded = await loadProgression();
    expect(loaded.retiredShoes.map(r => r.shoeId).sort()).toEqual(['s1', 's2']);
  });
});

describe('키 격리(progression_v1 만)', () => {
  test('영속은 오직 progression_v1 만 쓴다', async () => {
    await persistRetiredShoe(rec);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toEqual([PROGRESSION_KEY]);
  });

  test('기존 run/shoe 키를 건드리지 않는다', async () => {
    await AsyncStorage.setItem('runs', JSON.stringify([{id: 'r1'}]));
    await AsyncStorage.setItem('profile_name', '러너');
    await persistRetiredShoe(rec);
    expect(await AsyncStorage.getItem('runs')).toBe(JSON.stringify([{id: 'r1'}]));
    expect(await AsyncStorage.getItem('profile_name')).toBe('러너');
  });

  test('기존 다른 진척 상태(점수/타이틀)는 보존하며 추가만 한다', async () => {
    await AsyncStorage.setItem(
      PROGRESSION_KEY,
      JSON.stringify({
        earnedTitles: [
          {key: 't1', unlockedAt: '2026-01-01T00:00:00.000Z', isEquipped: true},
        ],
        equippedTitleKey: 't1',
        seenUnlocks: ['t1'],
        retiredShoes: [],
        points: 50,
      }),
    );
    await persistRetiredShoe(rec);
    const loaded = await loadProgression();
    expect(loaded.points).toBe(50);
    expect(loaded.equippedTitleKey).toBe('t1');
    expect(loaded.retiredShoes).toHaveLength(1);
  });
});
