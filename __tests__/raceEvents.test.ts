/**
 * 대회 감지·검색 순수 로직 — 러닝의 날짜+GPS 시작위치로 '그날 그 장소의 대회'를 특정한다.
 */
import {
  detectRace,
  completedRaceDistance,
  racesByProximity,
  searchRaces,
  haversineKm,
  SEED_RACES,
  type RaceEvent,
} from '../data/raceEvents';

const RACES: RaceEvent[] = [
  {id: 'jtbc', name: '2026 JTBC 서울마라톤', date: '2026-11-01', region: '서울', venue: '상암', startLat: 37.5683, startLon: 126.8972, distances: ['full', '10k']},
  {id: 'chuncheon', name: '2026 춘천마라톤', date: '2026-10-25', region: '춘천', venue: '의암호', startLat: 37.8544, startLon: 127.7086, distances: ['full', 'half', '10k']},
  {id: 'nocoord', name: '좌표없는대회', date: '2026-11-01', region: '부산', venue: '광안리', distances: ['half']},
];

describe('completedRaceDistance — 하프/풀 완주 판정(±3%)', () => {
  test('풀코스 42.195km ±3% 통과', () => {
    expect(completedRaceDistance(42.195)).toBe('full');
    expect(completedRaceDistance(42.0)).toBe('full');
    expect(completedRaceDistance(43.2)).toBe('full');
  });
  test('하프 21.0975km ±3% 통과', () => {
    expect(completedRaceDistance(21.1)).toBe('half');
    expect(completedRaceDistance(20.5)).toBe('half');
  });
  test('어중간한 거리는 null', () => {
    expect(completedRaceDistance(10)).toBeNull();
    expect(completedRaceDistance(30)).toBeNull();
  });
});

describe('detectRace — 날짜+위치 특정 감지', () => {
  test('그날 그 장소(반경 내) → 특정 대회 geo 감지', () => {
    // 상암월드컵경기장 바로 옆에서 11/1 하프 완주 → JTBC 서울마라톤 확정.
    const m = detectRace({date: '2026-11-01', startLat: 37.5690, startLon: 126.8980, km: 21.1}, RACES);
    expect(m).toEqual({kind: 'geo', race: expect.objectContaining({id: 'jtbc'}), distance: 'half'});
  });

  test('완주거리 미달이어도 geo 매치면 대회 최장 종목으로 추정', () => {
    // 상암 근처 11/1 10km → 여전히 JTBC 특정(종목은 완주 판정 없어 대회 최장=full 추정).
    const m = detectRace({date: '2026-11-01', startLat: 37.5690, startLon: 126.8980, km: 10}, RACES);
    expect(m?.kind).toBe('geo');
    expect(m?.race?.id).toBe('jtbc');
    expect(m?.distance).toBe('full');
  });

  test('같은 날 다른 장소 → geo 미스, 완주면 distance 폴백', () => {
    // 11/1 이지만 엉뚱한 위치(제주)에서 하프 완주 → 대회 미상 일반 감지.
    const m = detectRace({date: '2026-11-01', startLat: 33.45, startLon: 126.5, km: 21.1}, RACES);
    expect(m).toEqual({kind: 'distance', distance: 'half'});
  });

  test('날짜 안 맞으면 좌표 가까워도 geo 미스', () => {
    // 상암 근처지만 대회 없는 날 → geo 미스. 하프도 아니면 null.
    const m = detectRace({date: '2026-06-15', startLat: 37.5690, startLon: 126.8980, km: 10}, RACES);
    expect(m).toBeNull();
  });

  test('가장 가까운 대회를 고른다(같은 날 여러 대회)', () => {
    // 11/1 상암 근처 → 좌표없는대회(부산)보다 JTBC(상암)가 가까워 JTBC.
    const m = detectRace({date: '2026-11-01', startLat: 37.5690, startLon: 126.8980, km: 21.1}, RACES);
    expect(m?.race?.id).toBe('jtbc');
  });

  test('좌표 없는 러닝 → 완주거리 기반 distance 폴백만', () => {
    const m = detectRace({date: '2026-11-01', km: 42.2}, RACES);
    expect(m).toEqual({kind: 'distance', distance: 'full'});
  });
});

describe('racesByProximity / searchRaces', () => {
  test('러닝 날짜에 가까운 대회가 앞', () => {
    const sorted = racesByProximity('2026-10-24', RACES);
    expect(sorted[0].id).toBe('chuncheon'); // 10/25 가 10/24 에 가장 가까움
  });
  test('검색은 이름·지역 부분일치', () => {
    expect(searchRaces('춘천', RACES).map(r => r.id)).toEqual(['chuncheon']);
    expect(searchRaces('서울', RACES).length).toBe(1); // JTBC 서울
    expect(searchRaces('', RACES).length).toBe(3);
  });
});

describe('haversineKm / 시드 무결성', () => {
  test('haversine 대략 정확(서울↔춘천 ~65km)', () => {
    const d = haversineKm(37.5683, 126.8972, 37.8544, 127.7086);
    expect(d).toBeGreaterThan(55);
    expect(d).toBeLessThan(80);
  });
  test('번들 시드는 필수 필드를 갖춘다', () => {
    expect(SEED_RACES.length).toBeGreaterThanOrEqual(9);
    for (const r of SEED_RACES) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(/^\d{4}-\d{2}-\d{2}$/.test(r.date)).toBe(true);
      expect(r.distances.length).toBeGreaterThan(0);
    }
  });
});
