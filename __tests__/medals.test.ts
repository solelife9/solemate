/**
 * 메달 아카이브 데이터 모델 — 정렬·정규화·시간 정본·로컬 CRUD.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  medalTimeSec,
  sortMedals,
  normalizeMedals,
  loadMedals,
  liveMedals,
  addMedal,
  removeMedal,
  medalArchiveStats,
  type Medal,
} from '../lib/medals';

const mk = (over: Partial<Medal> = {}): Medal => ({
  id: 'm1',
  raceName: '2026 JTBC 서울마라톤',
  date: '2026-11-01',
  distance: 'half',
  createdAt: '2026-11-01T10:00:00.000Z',
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('medalTimeSec — 공식 우선 정본', () => {
  test('공식 기록이 있으면 공식(칩 타임)', () => {
    expect(medalTimeSec(mk({officialTimeSec: 7083, appTimeSec: 7104}))).toBe(7083);
  });
  test('공식이 없으면 앱 측정 폴백', () => {
    expect(medalTimeSec(mk({appTimeSec: 7104}))).toBe(7104);
  });
  test('공식 0/음수는 앱 측정으로 폴백', () => {
    expect(medalTimeSec(mk({officialTimeSec: 0, appTimeSec: 7104}))).toBe(7104);
  });
});

describe('sortMedals — 최신 대회일 우선', () => {
  test('대회일 내림차순, 같으면 생성 역순', () => {
    const a = mk({id: 'a', date: '2026-04-04'});
    const b = mk({id: 'b', date: '2026-11-01'});
    const c = mk({id: 'c', date: '2026-11-01', createdAt: '2026-11-01T12:00:00.000Z'});
    const sorted = sortMedals([a, b, c]).map((m) => m.id);
    expect(sorted[0]).toBe('c'); // 11/01 중 늦게 생성
    expect(sorted[1]).toBe('b'); // 11/01
    expect(sorted[2]).toBe('a'); // 04/04
  });
});

describe('normalizeMedals — 안전 파싱', () => {
  test('필수 필드/유효 종목만 통과', () => {
    const raw = [
      mk({id: 'ok'}),
      {id: 'nodist', raceName: 'x', date: '2026-01-01'}, // distance 없음
      {id: 'baddist', raceName: 'x', date: '2026-01-01', distance: '3k'}, // 잘못된 종목
      null,
      'garbage',
    ];
    const out = normalizeMedals(raw);
    expect(out.map((m) => m.id)).toEqual(['ok']);
  });
  test('배열 아니면 빈 배열', () => {
    expect(normalizeMedals(null)).toEqual([]);
    expect(normalizeMedals({})).toEqual([]);
  });
});

describe('로컬 CRUD', () => {
  test('addMedal → loadMedals 라운드트립(최신순)', async () => {
    await addMedal(mk({id: 'a', date: '2026-04-04'}));
    await addMedal(mk({id: 'b', date: '2026-11-01'}));
    const loaded = await loadMedals();
    expect(loaded.map((m) => m.id)).toEqual(['b', 'a']); // 최신 대회일 우선
  });
  test('같은 id 는 교체(중복 안 쌓임)', async () => {
    await addMedal(mk({id: 'a', bib: '111'}));
    const next = await addMedal(mk({id: 'a', bib: '222'}));
    expect(next.length).toBe(1);
    expect(next[0].bib).toBe('222');
  });
  test('removeMedal 은 soft-delete 묘비(배열에 남고 live 에선 제외)', async () => {
    await addMedal(mk({id: 'a'}));
    await addMedal(mk({id: 'b'}));
    const next = await removeMedal('a', 1700000000000);
    // 'a' 는 묘비로 배열에 남는다(삭제 전파용).
    const a = next.find((m) => m.id === 'a');
    expect(a?.deleted).toBe(true);
    expect(a?.updatedAt).toBe(1700000000000);
    // 화면/집계는 live 만 본다.
    expect(liveMedals(next).map((m) => m.id)).toEqual(['b']);
  });
  test('삭제한 id 를 다시 추가하면 live 로 복귀(묘비 교체)', async () => {
    await addMedal(mk({id: 'a'}));
    await removeMedal('a', 1700000000000);
    const next = await addMedal(mk({id: 'a', updatedAt: 1700000000001}));
    expect(liveMedals(next).map((m) => m.id)).toEqual(['a']);
    expect(next.find((m) => m.id === 'a')?.deleted).not.toBe(true);
  });
});

describe('liveMedals — 묘비 필터', () => {
  test('deleted:true 는 제외, 나머지 유지', () => {
    const arr = [mk({id: 'a'}), mk({id: 'b', deleted: true}), mk({id: 'c'})];
    expect(liveMedals(arr).map((m) => m.id)).toEqual(['a', 'c']);
  });
  test('배열 아니면 빈 배열(방어적)', () => {
    expect(liveMedals(null as unknown as Medal[])).toEqual([]);
  });
});

describe('medalArchiveStats — 아카이브 요약', () => {
  it('빈 배열이면 0/null', () => {
    expect(medalArchiveStats([])).toEqual({count: 0, totalKm: 0, longest: null});
  });
  it('개수·완주 거리 합(km)·최장 종목', () => {
    const s = medalArchiveStats([
      mk({id: 'a', distance: 'full'}),
      mk({id: 'b', distance: '10k'}),
      mk({id: 'c', distance: 'half'}),
    ]);
    expect(s.count).toBe(3);
    expect(s.totalKm).toBeCloseTo(73.3, 1); // 42.195 + 10 + 21.0975
    expect(s.longest).toBe('full');
  });
  it('묘비(deleted)는 개수·거리·최장에서 제외', () => {
    const s = medalArchiveStats([
      mk({id: 'a', distance: 'full', deleted: true}),
      mk({id: 'b', distance: '10k'}),
      mk({id: 'c', distance: 'half'}),
    ]);
    expect(s.count).toBe(2); // 'a' 묘비 제외
    expect(s.totalKm).toBeCloseTo(31.1, 1); // 10 + 21.0975 (full 제외)
    expect(s.longest).toBe('half'); // full 제외 → half 가 최장
  });
});
