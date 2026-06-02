/**
 * lib/backup 단위 테스트 — 버전드 JSON 백업의 직렬화/검증/라운드트립.
 *
 * 관찰 가능한 계약을 검증한다:
 *   1) serialize→parse 라운드트립으로 shoes/runs/settings 가 그대로 보존된다.
 *   2) 백업에는 version(≥1)·exportedAt(ISO) 메타가 박힌다.
 *   3) 손상/미지원/스키마위반 JSON 은 throw 한다(데이터 파괴 금지 — 부분 복원 없음).
 *
 * @format
 */
import {
  serializeBackup,
  parseBackup,
  BACKUP_VERSION,
} from '../../lib/backup';

const payload = {
  shoes: [{id: '1', brand: 'Nike', model: 'Pegasus 41', total_km: 120, target_km: 700}],
  runs: [{id: '10', shoe_id: 1, distance_km: 5.2, date: '2026-06-01'}],
  settings: {unit: 'km', goal_weekly_km: 30},
};

describe('serializeBackup', () => {
  test('JSON 문자열을 만들고 version·exportedAt 메타와 데이터를 담는다', () => {
    const json = serializeBackup(payload, '2026-06-03T00:00:00.000Z');
    expect(typeof json).toBe('string');
    const obj = JSON.parse(json);
    expect(obj.version).toBe(BACKUP_VERSION);
    expect(obj.version).toBeGreaterThanOrEqual(1);
    expect(obj.exportedAt).toBe('2026-06-03T00:00:00.000Z');
    expect(obj.shoes).toEqual(payload.shoes);
    expect(obj.runs).toEqual(payload.runs);
    expect(obj.settings).toEqual(payload.settings);
  });

  test('exportedAt 을 생략하면 유효한 ISO 8601 타임스탬프를 채운다', () => {
    const obj = JSON.parse(serializeBackup(payload));
    expect(typeof obj.exportedAt).toBe('string');
    // ISO 문자열은 Date 로 되읽혀 같은 시각으로 복원된다(유효성 확인).
    expect(new Date(obj.exportedAt).toISOString()).toBe(obj.exportedAt);
  });

  test('형태가 어긋난 입력(누락 필드)도 배열/객체로 정규화해 깨지지 않는다', () => {
    const json = serializeBackup({} as any);
    const obj = JSON.parse(json);
    expect(obj.shoes).toEqual([]);
    expect(obj.runs).toEqual([]);
    expect(obj.settings).toEqual({});
  });
});

describe('parseBackup 라운드트립', () => {
  test('serialize→parse 로 shoes/runs/settings 가 보존된다', () => {
    const restored = parseBackup(serializeBackup(payload));
    expect(restored.shoes).toEqual(payload.shoes);
    expect(restored.runs).toEqual(payload.runs);
    expect(restored.settings).toEqual(payload.settings);
  });

  test('복원된 백업은 version(≥1)·exportedAt 을 노출한다', () => {
    const restored = parseBackup(serializeBackup(payload, '2026-06-03T12:00:00.000Z'));
    expect(restored.version).toBeGreaterThanOrEqual(1);
    expect(restored.exportedAt).toBe('2026-06-03T12:00:00.000Z');
  });
});

describe('parseBackup 검증 — 손상/미지원은 throw(데이터 파괴 금지)', () => {
  test('JSON 이 아니면 throw', () => {
    expect(() => parseBackup('이건JSON아님')).toThrow();
    expect(() => parseBackup('')).toThrow();
  });

  test('지원하지 않는 버전은 throw', () => {
    expect(() => parseBackup('{"version":999,"shoes":[],"runs":[],"settings":{}}')).toThrow();
    expect(() => parseBackup('{"version":999}')).toThrow();
  });

  test('version 메타가 없거나 숫자가 아니면 throw', () => {
    expect(() => parseBackup('{"shoes":[],"runs":[],"settings":{}}')).toThrow();
    expect(() => parseBackup('{"version":"1","shoes":[],"runs":[],"settings":{}}')).toThrow();
  });

  test('shoes/runs 가 배열이 아니거나 settings 가 객체가 아니면 throw', () => {
    expect(() => parseBackup('{"version":1,"shoes":"x","runs":[],"settings":{}}')).toThrow();
    expect(() => parseBackup('{"version":1,"shoes":[],"runs":null,"settings":{}}')).toThrow();
    expect(() => parseBackup('{"version":1,"shoes":[],"runs":[],"settings":[]}')).toThrow();
  });

  test('최상위가 배열/원시값이면 throw', () => {
    expect(() => parseBackup('[]')).toThrow();
    expect(() => parseBackup('42')).toThrow();
    expect(() => parseBackup('null')).toThrow();
  });
});
