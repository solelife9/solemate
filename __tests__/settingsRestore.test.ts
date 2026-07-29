// lib/settingsRestore — 백업/클라우드 병합 결과에서 되돌릴 설정 고르기.
// 여기 규칙이 어긋나면 조용히 아프다: 동기 중에 바꾼 설정이 원위치되거나(2026-07-16 실제
// 버그), 백업 파일의 이상한 값이 체중 0 으로 들어가 내구도 계산을 통째로 망가뜨린다.
import {
  settingsTsOf, shouldApplySettings, pickRestorableSettings, nextSettingsTs,
} from '../lib/settingsRestore';

const CUR = {alerts: {enabled: true, thresholdPct: 85}};

describe('settingsTsOf', () => {
  it('숫자 updated_at 을 읽는다', () => {
    expect(settingsTsOf({updated_at: 1700000000000})).toBe(1700000000000);
  });

  it('없거나 이상하면 0(모르는 시각을 최신으로 오해하지 않는다)', () => {
    expect(settingsTsOf(undefined)).toBe(0);
    expect(settingsTsOf({})).toBe(0);
    expect(settingsTsOf({updated_at: 'yesterday'})).toBe(0);
    expect(settingsTsOf({updated_at: -5})).toBe(0);
    expect(settingsTsOf({updated_at: NaN})).toBe(0);
  });
});

describe('shouldApplySettings — LWW 클로버 가드', () => {
  it('병합 결과가 더 오래됐으면 설정을 되돌리지 않는다', () => {
    // 동기 왕복 중에 사용자가 단위를 바꿨다 → stale 스냅샷이 그걸 원위치시키면 안 된다.
    expect(shouldApplySettings(100, 200, false)).toBe(false);
  });

  it('더 최신이면 적용한다', () => {
    expect(shouldApplySettings(300, 200, false)).toBe(true);
  });

  it('같은 시각이면 적용한다(같은 값을 되돌리는 건 무해하다)', () => {
    expect(shouldApplySettings(200, 200, false)).toBe(true);
  });

  it('명시적 가져오기는 가드를 건너뛴다(사용자 의사가 백업으로 교체)', () => {
    expect(shouldApplySettings(1, 999999, true)).toBe(true);
  });
});

describe('pickRestorableSettings', () => {
  it('아무것도 없으면 빈 객체(그 설정들을 건드리지 않는다)', () => {
    expect(pickRestorableSettings({}, CUR)).toEqual({});
    expect(pickRestorableSettings(null, CUR)).toEqual({});
    expect(pickRestorableSettings(undefined, CUR)).toEqual({});
  });

  it('단위는 km·mi 만 받는다', () => {
    expect(pickRestorableSettings({unit: 'km'}, CUR).unit).toBe('km');
    expect(pickRestorableSettings({unit: 'mi'}, CUR).unit).toBe('mi');
    expect(pickRestorableSettings({unit: 'furlong'}, CUR).unit).toBeUndefined();
  });

  it('주간 목표는 숫자만 받고 범위를 클램프한다', () => {
    expect(pickRestorableSettings({goal_weekly_km: 40}, CUR).goalWeeklyKm).toBe(40);
    expect(pickRestorableSettings({goal_weekly_km: '40'}, CUR).goalWeeklyKm).toBeUndefined();
    const huge = pickRestorableSettings({goal_weekly_km: 99999}, CUR).goalWeeklyKm!;
    expect(huge).toBeLessThan(99999);
  });

  it('알림이 부분 객체로 와도 빠진 필드는 현재 값을 지킨다', () => {
    // 백업에 enabled 만 있다고 임계값이 0 으로 떨어지면 알림이 매일 울린다.
    const p = pickRestorableSettings({alerts: {enabled: false}}, CUR);
    expect(p.alerts).toEqual({enabled: false, thresholdPct: 85});
  });

  it('알림 임계값이 숫자가 아니면 현재 값을 유지한다', () => {
    const p = pickRestorableSettings({alerts: {thresholdPct: 'high'}}, CUR);
    expect(p.alerts).toEqual({enabled: true, thresholdPct: 85});
  });

  it('체중·나이·안정시심박의 0 과 음수는 버린다(미설정으로 다룬다)', () => {
    const p = pickRestorableSettings({weight_kg: 0, age: 0, rest_hr: 0}, CUR);
    expect(p.weightKg).toBeUndefined();
    expect(p.age).toBeUndefined();
    expect(p.restHR).toBeUndefined();
    const n = pickRestorableSettings({weight_kg: -70, age: -30, rest_hr: -50}, CUR);
    expect(n.weightKg).toBeUndefined();
    expect(n.age).toBeUndefined();
    expect(n.restHR).toBeUndefined();
  });

  it('체중·나이·안정시심박은 유효하면 클램프해 받는다', () => {
    const p = pickRestorableSettings({weight_kg: 72, age: 34, rest_hr: 52}, CUR);
    expect(p.weightKg).toBe(72);
    expect(p.age).toBe(34);
    expect(p.restHR).toBe(52);
  });

  it('성별은 male·female 만 받는다', () => {
    expect(pickRestorableSettings({sex: 'male'}, CUR).sex).toBe('male');
    expect(pickRestorableSettings({sex: 'M'}, CUR).sex).toBeUndefined();
  });

  it('문자열로 들어온 숫자는 받지 않는다(백업 파일은 사람이 편집할 수 있다)', () => {
    const p = pickRestorableSettings({weight_kg: '72', age: '34', rest_hr: '52'}, CUR);
    expect(p.weightKg).toBeUndefined();
    expect(p.age).toBeUndefined();
    expect(p.restHR).toBeUndefined();
  });
});

describe('nextSettingsTs', () => {
  it('명시적 가져오기는 지금으로 올린다(이후 동기에서 이긴다)', () => {
    expect(nextSettingsTs(true, 100, 200, 999)).toBe(999);
  });

  it('동기 병합은 둘 중 큰 값을 유지한다(시각이 뒤로 가지 않게)', () => {
    expect(nextSettingsTs(false, 300, 200, 999)).toBe(300);
    expect(nextSettingsTs(false, 100, 200, 999)).toBe(200);
  });
});
