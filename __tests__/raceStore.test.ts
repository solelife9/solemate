/**
 * 대회 Firestore 로더 — 문서 정규화 + 시드/원격 머지(원격 우선). fetchRaces 의
 * Firestore I/O 는 네이티브라 여기선 순수 로직(normalizeRace·mergeRaces)만 검증한다.
 */
import {normalizeRace, mergeRaces} from '../lib/raceStore';
import {SEED_RACES, type RaceEvent} from '../data/raceEvents';

describe('normalizeRace', () => {
  test('유효 문서 → RaceEvent(좌표·종목 포함)', () => {
    const r = normalizeRace('jtbc-2027', {
      name: '2027 JTBC 서울마라톤', date: '2027-11-07', region: '서울', venue: '상암',
      startLat: 37.5683, startLon: 126.8972, distances: ['full', '10k', 'x'],
    });
    expect(r).toEqual({
      id: 'jtbc-2027', name: '2027 JTBC 서울마라톤', date: '2027-11-07', region: '서울',
      venue: '상암', startLat: 37.5683, startLon: 126.8972, distances: ['full', '10k'],
    });
  });
  test('좌표 없는 Tier2 문서(검색만) — 좌표 undefined', () => {
    const r = normalizeRace('local-10k', {name: '지역 10K', date: '2026-09-01', distances: ['10k']});
    expect(r?.startLat).toBeUndefined();
    expect(r?.distances).toEqual(['10k']);
  });
  test('필수(name/date) 없으면 null', () => {
    expect(normalizeRace('x', {name: '이름만'})).toBeNull();
    expect(normalizeRace('x', null)).toBeNull();
    expect(normalizeRace('x', 'garbage')).toBeNull();
  });
});

describe('mergeRaces', () => {
  const seed: RaceEvent[] = [
    {id: 'a', name: 'A', date: '2026-01-01', region: '', venue: '', distances: ['10k']},
    {id: 'b', name: 'B', date: '2026-02-01', region: '', venue: '', distances: ['half']},
  ];
  test('원격에 없는 시드는 유지, 원격 신규는 추가', () => {
    const remote: RaceEvent[] = [{id: 'c', name: 'C', date: '2026-03-01', region: '', venue: '', distances: ['full']}];
    expect(mergeRaces(seed, remote).map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });
  test('같은 id 는 원격(서버 갱신)이 시드를 덮어쓴다', () => {
    const remote: RaceEvent[] = [{id: 'a', name: 'A 갱신', date: '2026-01-02', region: '부산', venue: '', distances: ['5k']}];
    const merged = mergeRaces(seed, remote);
    const a = merged.find((r) => r.id === 'a')!;
    expect(a.name).toBe('A 갱신');
    expect(a.date).toBe('2026-01-02');
  });
});

describe('SEED_RACES 폴백 무결성', () => {
  test('시드는 Tier1(좌표) 대회를 포함한다(위치 자동감지 가능)', () => {
    const withCoords = SEED_RACES.filter((r) => typeof r.startLat === 'number');
    expect(withCoords.length).toBeGreaterThanOrEqual(9);
  });
});
