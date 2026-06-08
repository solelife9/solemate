/**
 * lib/recap 단위 테스트 — Slice 8 리텐션 기간 리캡(순수 파생).
 *
 * 관찰 가능한 계약을 검증한다:
 *   S8-5 총거리·런수·평균 페이스·최다 착용 신발·신발별 실효 마모·PR이 실데이터로 산출.
 *        주/월 기간 필터가 결정적으로(now 주입) 동작한다.
 *   A8-5 빈 데이터 graceful — 런 0개 → isEmpty true·0값·mostWornShoe null·무NaN/Infinity.
 *   A8-1 원본 runs/shoes(및 원소)는 변경되지 않는다(읽기 전용 파생).
 *
 * 순수 단위 — react-test-renderer/네이티브 불요. now는 opts로 주입해 전역 Date 모킹 없음.
 *
 * @format
 */
import {weeklyRecap, monthlyRecap, type RecapRun, type RecapShoe} from '../../lib/recap';

// 기준 시각: 2026-06-10(수). 이 주의 월요일은 2026-06-08.
const NOW = new Date(2026, 5, 10, 9, 0, 0);

const SHOES: RecapShoe[] = [
  {id: 's1', name: 'Nike Pegasus 41', target_km: 700},
  {id: 's2', name: 'Hoka Clifton 9', target_km: 700},
];

// 이번 주(06-08~06-14) 런: s1 두 번(6km easy, 4km), s2 한 번(10km race 페이스).
const weekRuns: RecapRun[] = [
  {id: 'r1', shoe_id: 's1', km: '6', duration: 6 * 360, run_date: '2026-06-08'}, // 6:00/km
  {id: 'r2', shoe_id: 's1', km: 4, duration: 4 * 330, run_date: '2026-06-10'}, // 5:30/km
  {id: 'r3', shoe_id: 's2', km: '10', duration: 10 * 210, run_date: '2026-06-09'}, // 3:30/km race
];
// 지난 주(06-01) 런 — 주간 리캡에선 제외, 6월 월간엔 포함.
const lastWeekRun: RecapRun = {id: 'r0', shoe_id: 's1', km: '5', duration: 5 * 360, run_date: '2026-06-01'};
// 지난 달(5월) 런 — 6월 월간 리캡에서도 제외.
const mayRun: RecapRun = {id: 'rm', shoe_id: 's2', km: '8', duration: 8 * 300, run_date: '2026-05-20'};

describe('S8-5 주간 리캡(weeklyRecap) — 실데이터 요약', () => {
  const recap = weeklyRecap([...weekRuns, lastWeekRun, mayRun], SHOES, {now: NOW});

  test('총거리 = 이번 주 런 합(6+4+10=20km)·지난 주/달 런 제외', () => {
    expect(recap.totalKm).toBe(20);
    expect(recap.isEmpty).toBe(false);
  });

  test('런수 = 이번 주 런 3개', () => {
    expect(recap.runCount).toBe(3);
  });

  test('평균 페이스 라벨이 산출된다(무런 아님)', () => {
    expect(recap.avgPaceLabel).not.toBe('--');
    expect(typeof recap.avgPaceLabel).toBe('string');
  });

  test('기간 라벨 = 월요일~일요일 범위(6.8–6.14)', () => {
    expect(recap.periodLabel).toBe('6.8–6.14');
  });

  test('신발별 실효 마모: 두 신발 모두 양수, 내림차순 정렬', () => {
    expect(recap.perShoeWear.length).toBe(2);
    expect(recap.perShoeWear[0].effectiveKm).toBeGreaterThanOrEqual(
      recap.perShoeWear[1].effectiveKm,
    );
    recap.perShoeWear.forEach(s => expect(s.effectiveKm).toBeGreaterThan(0));
  });

  test('최다 착용 신발 = 실효 마모 최댓값 신발(race 10km의 s2 Hoka)', () => {
    // s2: 10km × road(1.0) × racePace(1.10) = 11.0  vs  s1: 6+4=10km × ~1.0 = ~10.0
    expect(recap.mostWornShoe).not.toBeNull();
    expect(recap.mostWornShoe!.name).toBe('Hoka Clifton 9');
    expect(recap.mostWornShoe!.km).toBe(recap.perShoeWear[0].effectiveKm);
    expect(recap.mostWornShoe!.km).toBeGreaterThan(0);
  });

  test('개인 기록(PR): 최장 거리 = 10km, 1km/5km 페이스 기록 존재', () => {
    expect(recap.prs.longest).toBe(10);
    expect(recap.prs.fastest1k).not.toBeNull();
    expect(recap.prs.fastest5k).not.toBeNull();
    // 1km 최고 페이스는 race 런(3:30/km=210초)에서 나온다.
    expect(recap.prs.fastest1k).toBeCloseTo(210, 5);
  });
});

describe('S8-5 월간 리캡(monthlyRecap) — 달 전체 필터', () => {
  const recap = monthlyRecap([...weekRuns, lastWeekRun, mayRun], SHOES, {now: NOW});

  test('총거리 = 6월 런 합(20 + 지난주 5 = 25km)·5월 런 제외', () => {
    expect(recap.totalKm).toBe(25);
    expect(recap.runCount).toBe(4);
  });

  test('기간 라벨 = "2026년 6월"', () => {
    expect(recap.periodLabel).toBe('2026년 6월');
  });

  test('5월 런(8km)은 PR 최장 거리에 영향 없음(10km 유지)', () => {
    expect(recap.prs.longest).toBe(10);
  });
});

describe('A8-5 빈 데이터 graceful — 무NaN/Infinity', () => {
  test('런 0개 → isEmpty true·0값·mostWornShoe null·빈 perShoeWear', () => {
    const recap = weeklyRecap([], SHOES, {now: NOW});
    expect(recap.isEmpty).toBe(true);
    expect(recap.totalKm).toBe(0);
    expect(recap.runCount).toBe(0);
    expect(recap.avgPaceLabel).toBe('--');
    expect(recap.mostWornShoe).toBeNull();
    expect(recap.perShoeWear).toEqual([]);
    expect(recap.prs).toEqual({fastest1k: null, fastest5k: null, longest: null});
  });

  test('해당 기간에 런이 없으면(다른 주만 존재) 빈 리캡', () => {
    const recap = weeklyRecap([lastWeekRun, mayRun], SHOES, {now: NOW});
    expect(recap.isEmpty).toBe(true);
    expect(recap.totalKm).toBe(0);
    expect(recap.mostWornShoe).toBeNull();
  });

  test('결측·0·음수·비정상 입력에서도 NaN/Infinity/음수가 없다', () => {
    const messy: RecapRun[] = [
      {id: 'x1', shoe_id: 's1', km: 'abc', duration: 0, run_date: '2026-06-09'}, // 파싱 불가 km
      {id: 'x2', shoe_id: 's2', km: -5, duration: -10, run_date: '2026-06-10'}, // 음수
      {id: 'x3', shoe_id: 's1', km: 3, duration: NaN as any, run_date: '2026-06-11'}, // NaN duration
      {id: 'x4', km: 2, duration: 600, run_date: 'not-a-date'}, // 잘못된 날짜 → 제외
      {id: 'x5', km: 2, duration: 600}, // run_date 결측 → 제외
    ];
    const recap = weeklyRecap(messy, SHOES, {now: NOW});
    expect(Number.isFinite(recap.totalKm)).toBe(true);
    expect(recap.totalKm).toBeGreaterThanOrEqual(0);
    recap.perShoeWear.forEach(s => {
      expect(Number.isFinite(s.effectiveKm)).toBe(true);
      expect(s.effectiveKm).toBeGreaterThan(0);
    });
    // x3(km=3, surface road, pace 무효→1.0)만 양수 마모 → s1.
    expect(recap.mostWornShoe?.name).toBe('Nike Pegasus 41');
    expect(recap.mostWornShoe!.km).toBeGreaterThan(0);
    expect(Number.isFinite(recap.mostWornShoe!.km)).toBe(true);
  });

  test('빈 신발 목록이어도 graceful(마모는 폴백 이름)', () => {
    const recap = weeklyRecap(weekRuns, [], {now: NOW});
    expect(recap.totalKm).toBe(20);
    recap.perShoeWear.forEach(s => expect(s.name).toBe('신발'));
    expect(recap.mostWornShoe).not.toBeNull();
  });
});

describe('A8-1 원본 불변 — 읽기 전용 파생', () => {
  test('runs/shoes 및 원소가 변경되지 않는다', () => {
    const runs: RecapRun[] = weekRuns.map(r => ({...r}));
    const shoes: RecapShoe[] = SHOES.map(s => ({...s}));
    const runsSnapshot = JSON.stringify(runs);
    const shoesSnapshot = JSON.stringify(shoes);
    const runsLen = runs.length;

    weeklyRecap(runs, shoes, {now: NOW});
    monthlyRecap(runs, shoes, {now: NOW});

    expect(JSON.stringify(runs)).toBe(runsSnapshot);
    expect(JSON.stringify(shoes)).toBe(shoesSnapshot);
    expect(runs.length).toBe(runsLen); // 필터가 원본 배열을 줄이지 않음
  });
});
