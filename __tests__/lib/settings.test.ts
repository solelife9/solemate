// lib/settings 순수 파서 + AsyncStorage 라운드트립 테스트.
// 관찰 가능한 동작: 손상/누락 영속값은 기본값으로 정규화되고, save→load가 값을
// 보존하며, 범위 밖 값은 저장 시점에 클램프된다(잘못된 설정이 화면을 깨지 않음).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseUnit, parseGoal, parseAlerts, clampGoal, clampThreshold,
  parseWeight, clampWeight, saveWeight,
  loadSettings, saveUnit, saveGoal, saveAlerts,
  K_GOAL, K_WEIGHT, DEFAULT_SETTINGS, DEFAULT_ALERTS, DEFAULT_WEIGHT_KG,
  parseAge, clampAge, parseSex, parseRestHR, clampRestHR,
  saveAge, saveSex, saveRestHR, K_AGE, K_SEX, K_REST_HR,
  MIN_AGE, MAX_AGE, MIN_REST_HR, MAX_REST_HR,
} from '../../lib/settings';

describe('settings parsers', () => {
  test('parseUnit: mi는 명시적일 때만, 그 외(누락/손상)는 km', () => {
    expect(parseUnit('mi')).toBe('mi');
    expect(parseUnit('km')).toBe('km');
    expect(parseUnit(null)).toBe('km');
    expect(parseUnit('garbage')).toBe('km');
  });

  test('parseGoal: 양수만 채택, 비정상은 기본값, 범위는 클램프', () => {
    expect(parseGoal('30')).toBe(30);
    expect(parseGoal(null)).toBe(DEFAULT_SETTINGS.goalWeeklyKm);
    expect(parseGoal('0')).toBe(DEFAULT_SETTINGS.goalWeeklyKm);
    expect(parseGoal('-5')).toBe(DEFAULT_SETTINGS.goalWeeklyKm);
    expect(parseGoal('abc')).toBe(DEFAULT_SETTINGS.goalWeeklyKm);
    expect(parseGoal('99999')).toBe(500); // MAX_GOAL_KM 클램프
  });

  test('clampGoal: 1..500 정수', () => {
    expect(clampGoal(30)).toBe(30);
    expect(clampGoal(0)).toBe(1);
    expect(clampGoal(10000)).toBe(500);
    expect(clampGoal(29.6)).toBe(30);
  });

  test('parseWeight/clampWeight: 30..200 정수, 비정상은 기본값', () => {
    expect(parseWeight('70')).toBe(70);
    expect(parseWeight(null)).toBe(DEFAULT_WEIGHT_KG);
    expect(parseWeight('0')).toBe(DEFAULT_WEIGHT_KG);
    expect(parseWeight('abc')).toBe(DEFAULT_WEIGHT_KG);
    expect(clampWeight(10)).toBe(30);   // MIN
    expect(clampWeight(500)).toBe(200); // MAX
    expect(clampWeight(70.4)).toBe(70);
  });

  test('saveWeight→load: 체중이 보존된다', async () => {
    await AsyncStorage.clear();
    await saveWeight(72);
    expect(await AsyncStorage.getItem(K_WEIGHT)).toBe('72');
    const s = await loadSettings();
    expect(s.weightKg).toBe(72);
  });

  test('clampThreshold: 50..100 정수', () => {
    expect(clampThreshold(90)).toBe(90);
    expect(clampThreshold(10)).toBe(50);
    expect(clampThreshold(200)).toBe(100);
    expect(clampThreshold(NaN)).toBe(DEFAULT_ALERTS.thresholdPct);
  });

  test('parseAlerts: 손상/누락 → 기본값, 유효값은 정규화', () => {
    expect(parseAlerts(null)).toEqual(DEFAULT_ALERTS);
    expect(parseAlerts('not json')).toEqual(DEFAULT_ALERTS);
    expect(parseAlerts(JSON.stringify({enabled: false, thresholdPct: 75}))).toEqual({enabled: false, thresholdPct: 75});
    // 범위 밖 임계값은 클램프(5 → 50)
    expect(parseAlerts(JSON.stringify({enabled: false, thresholdPct: 5}))).toEqual({enabled: false, thresholdPct: 50});
    // enabled 비불리언은 기본 enabled로 폴백
    expect(parseAlerts(JSON.stringify({thresholdPct: 80}))).toEqual({enabled: true, thresholdPct: 80});
  });
});

describe('settings 영속(AsyncStorage 라운드트립)', () => {
  test('storage가 비면 loadSettings는 기본값', async () => {
    await AsyncStorage.clear();
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test('saveUnit/saveGoal/saveAlerts → loadSettings가 그대로 복원', async () => {
    await saveUnit('mi');
    await saveGoal(45);
    await saveAlerts({enabled: false, thresholdPct: 80});
    const st = await loadSettings();
    expect(st.unit).toBe('mi');
    expect(st.goalWeeklyKm).toBe(45);
    expect(st.alerts).toEqual({enabled: false, thresholdPct: 80});
  });

  test('saveGoal은 저장 전에 클램프한다(0 → 1)', async () => {
    await saveGoal(0);
    expect(await AsyncStorage.getItem(K_GOAL)).toBe('1');
  });

  test('saveAlerts는 임계값을 클램프해 저장(5 → 50)', async () => {
    await saveAlerts({enabled: true, thresholdPct: 5});
    const st = await loadSettings();
    expect(st.alerts.thresholdPct).toBe(50);
  });
});

describe('신체지표(심박존용) 파서·저장', () => {
  test('parseAge: 미설정/비정상은 0, 정상은 클램프', () => {
    expect(parseAge(null)).toBe(0);
    expect(parseAge('0')).toBe(0);
    expect(parseAge('abc')).toBe(0);
    expect(parseAge('35')).toBe(35);
    expect(clampAge(5)).toBe(MIN_AGE);   // 하한 클램프
    expect(clampAge(200)).toBe(MAX_AGE); // 상한 클램프
  });

  test('parseSex: female만 female, 그 외는 male', () => {
    expect(parseSex('female')).toBe('female');
    expect(parseSex('male')).toBe('male');
    expect(parseSex(null)).toBe('male');
    expect(parseSex('garbage')).toBe('male');
  });

  test('parseRestHR: 미설정/비정상은 0, 정상은 클램프', () => {
    expect(parseRestHR(null)).toBe(0);
    expect(parseRestHR('50')).toBe(50);
    expect(clampRestHR(10)).toBe(MIN_REST_HR);
    expect(clampRestHR(300)).toBe(MAX_REST_HR);
  });

  test('save→load 라운드트립(나이·성별·안정심박)', async () => {
    await AsyncStorage.clear();
    await saveAge(42);
    await saveSex('female');
    await saveRestHR(48);
    const st = await loadSettings();
    expect(st.age).toBe(42);
    expect(st.sex).toBe('female');
    expect(st.restHR).toBe(48);
    // 키 직접 확인(클램프 저장).
    expect(await AsyncStorage.getItem(K_AGE)).toBe('42');
    expect(await AsyncStorage.getItem(K_SEX)).toBe('female');
    expect(await AsyncStorage.getItem(K_REST_HR)).toBe('48');
  });

  test('저장 시 클램프(나이 5→10, 안정심박 300→110)', async () => {
    await saveAge(5);
    await saveRestHR(300);
    expect(await AsyncStorage.getItem(K_AGE)).toBe(String(MIN_AGE));
    expect(await AsyncStorage.getItem(K_REST_HR)).toBe(String(MAX_REST_HR));
  });
});
