// 음성 코칭 설정(VoiceSettings) — 파서 정규화 + 저장/로드 왕복(탑티어 패리티 #14).
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseVoiceSettings,
  loadVoiceSettings,
  saveVoiceSettings,
  DEFAULT_VOICE,
  K_VOICE,
} from '../../lib/settings';

describe('parseVoiceSettings — 손상 입력은 필드 단위 기본값', () => {
  test('null/빈 문자열/깨진 JSON → 기본값', () => {
    expect(parseVoiceSettings(null)).toEqual(DEFAULT_VOICE);
    expect(parseVoiceSettings('')).toEqual(DEFAULT_VOICE);
    expect(parseVoiceSettings('{not json')).toEqual(DEFAULT_VOICE);
  });

  test('유효 필드만 반영, 이상값은 기본값 유지', () => {
    const v = parseVoiceSettings(JSON.stringify({
      enabled: false,
      intervalKm: 0.5,
      paceCue: false,
      paceBasis: 'avg',
      timeCue: false,
      volume: 0.7,
    }));
    expect(v).toEqual({enabled: false, intervalKm: 0.5, paceCue: false, paceBasis: 'avg', timeCue: false, volume: 0.7});

    const bad = parseVoiceSettings(JSON.stringify({
      enabled: 'yes', // 비불리언 → 기본
      intervalKm: 3, // 허용 밖 → 기본
      paceBasis: 'lap', // 허용 밖 → 기본
      volume: 9, // 범위 밖 → 기본
    }));
    expect(bad).toEqual(DEFAULT_VOICE);
  });
});

describe('저장/로드 왕복', () => {
  beforeEach(() => AsyncStorage.clear());

  test('save → load 가 같은 값을 돌려준다', async () => {
    const v = {...DEFAULT_VOICE, intervalKm: 2 as const, timeCue: false, volume: 0.85};
    await saveVoiceSettings(v);
    expect(await loadVoiceSettings()).toEqual(v);
    expect(await AsyncStorage.getItem(K_VOICE)).toBe(JSON.stringify(v));
  });

  test('저장값 없음 → 기본값(전부 on, 1km, 구간, 볼륨 최대)', async () => {
    expect(await loadVoiceSettings()).toEqual(DEFAULT_VOICE);
  });
});
