/**
 * lib/runInsights — 완주 리캡 자연어 인사이트(순수 파생) 검증.
 * 원칙: Truth only(실제 집계만)·절제(축마다 최대 1, 총 최대 3)·격려 톤·결정성(전역 시각 의존 0).
 * 날짜 인덱스(로직과 동일 계산): 07-12·13·14=연속 3일, 07-13~19=같은 주(월시작), 06-28→07-14=16일.
 * @format
 */
import {runInsights, type InsightRun, type InsightPriorRun} from '../../lib/runInsights';

// 스플릿 헬퍼 — 페이스(초/km) 배열을 {km,paceSec}[] 로.
const sp = (paces: number[]): {km: number; paceSec: number}[] =>
  paces.map((paceSec, i) => ({km: i + 1, paceSec}));
// 이전 런 헬퍼.
const prior = (runDate: string, dist = 5, durationS = 1500): InsightPriorRun => ({dist, durationS, runDate});

const baseRun = (over: Partial<InsightRun> = {}): InsightRun => ({
  km: 5,
  durationS: 1500,
  runDate: '2026-07-14',
  ...over,
});

describe('runInsights — 페이스 실행 축(스플릿 모양)', () => {
  test('네거티브 스플릿 — 후반이 유의미하게 빠름(n≥4)', () => {
    const out = runInsights(baseRun({splits: sp([320, 320, 300, 300])}), []);
    expect(out.map(i => i.kind)).toContain('negativeSplit');
  });

  test('막판 스퍼트 — 마지막 구간이 가장 빠름(n=3, 네거티브 미해당)', () => {
    const out = runInsights(baseRun({splits: sp([300, 300, 270])}), []);
    expect(out.map(i => i.kind)).toContain('strongFinish');
  });

  test('일정한 페이스 — 구간 편차가 작음', () => {
    const out = runInsights(baseRun({splits: sp([300, 302, 301, 299])}), []);
    expect(out.map(i => i.kind)).toContain('steadyPace');
  });

  test('우선순위: 네거티브 > 스퍼트 — 둘 다 성립해도 네거티브만', () => {
    // 후반 급가속 → 네거티브(반반)도, 막판 스퍼트도 성립할 값. 네거티브가 이겨야 함.
    const out = runInsights(baseRun({splits: sp([330, 330, 320, 280])}), []);
    const paceKinds = out.filter(i => ['negativeSplit', 'strongFinish', 'steadyPace'].includes(i.kind));
    expect(paceKinds).toHaveLength(1);
    expect(paceKinds[0].kind).toBe('negativeSplit');
  });

  test('스플릿 3개 미만 → 페이스 인사이트 없음', () => {
    expect(runInsights(baseRun({splits: sp([300, 300])}), [])).toHaveLength(0);
  });

  test('비유한·0·음수 페이스는 무시(cleanPaces) — 유효 3개 미만이면 없음', () => {
    const dirty = [
      {km: 1, paceSec: 0},
      {km: 2, paceSec: -5},
      {km: 3, paceSec: NaN},
      {km: 4, paceSec: 300},
    ];
    expect(runInsights(baseRun({splits: dirty}), [])).toHaveLength(0);
  });

  test('스플릿 없음/빈 배열 → 페이스 인사이트 없음', () => {
    expect(runInsights(baseRun({splits: []}), [])).toHaveLength(0);
    expect(runInsights(baseRun({}), [])).toHaveLength(0);
  });
});

describe('runInsights — 꾸준함 축', () => {
  test('오랜만의 러닝(공백 ≥14일) — 처벌 아닌 환영 문구', () => {
    const out = runInsights(baseRun(), [prior('2026-06-28')]); // 16일 공백
    const c = out.find(i => i.kind === 'comeback');
    expect(c).toBeTruthy();
    expect(c!.text).toBe('16일 만의 러닝');
  });

  test('N일 연속 러닝(≥3)', () => {
    const out = runInsights(baseRun(), [prior('2026-07-13'), prior('2026-07-12')]);
    const s = out.find(i => i.kind === 'streak');
    expect(s).toBeTruthy();
    expect(s!.text).toBe('3일 연속 러닝');
  });

  test('이번 주 N번째(≥2) — 연속·오랜만 아님', () => {
    // 07-15 기준, 같은 주 07-13 에 러닝(하루 건너뜀 → streak=1, gap 2일 → comeback 아님).
    const out = runInsights(baseRun({runDate: '2026-07-15'}), [prior('2026-07-13')]);
    const w = out.find(i => i.kind === 'weekCount');
    expect(w).toBeTruthy();
    expect(w!.text).toBe('이번 주 2번째 러닝');
  });

  test('같은 날 2회 = 이번 주 2번째(런 단위 카운트)', () => {
    const out = runInsights(baseRun(), [prior('2026-07-14')]);
    expect(out.find(i => i.kind === 'weekCount')?.text).toBe('이번 주 2번째 러닝');
  });

  test('우선순위: 오랜만 > 연속 — 공백 크면 comeback만', () => {
    // 마지막 런이 16일 전이면 연속일 수 없음 → comeback.
    const out = runInsights(baseRun(), [prior('2026-06-28')]);
    const consistency = out.filter(i => ['comeback', 'streak', 'weekCount'].includes(i.kind));
    expect(consistency).toHaveLength(1);
    expect(consistency[0].kind).toBe('comeback');
  });

  test('첫 러닝(이전 없음) → 꾸준함 인사이트 없음', () => {
    const consistency = runInsights(baseRun(), []).filter(i =>
      ['comeback', 'streak', 'weekCount'].includes(i.kind),
    );
    expect(consistency).toHaveLength(0);
  });
});

describe('runInsights — 볼륨 축', () => {
  test('이번 달 가장 긴 러닝(비교 대상 있고 이 런이 더 김)', () => {
    const out = runInsights(baseRun({km: 12}), [prior('2026-07-05', 8), prior('2026-07-02', 5)]);
    expect(out.find(i => i.kind === 'monthlyLongest')?.text).toBe('이번 달 가장 긴 러닝');
  });

  test('올타임 최장(longestDist PR)은 배지와 중복 → 볼륨 배제', () => {
    const out = runInsights(baseRun({km: 12}), [prior('2026-07-05', 8)], {prKinds: ['longestDist']});
    expect(out.map(i => i.kind)).not.toContain('monthlyLongest');
  });

  test('이번 달 다른 런이 없으면 → 볼륨 없음(비교 불가)', () => {
    const out = runInsights(baseRun({km: 12}), [prior('2026-06-20', 8)]); // 지난달만
    expect(out.map(i => i.kind)).not.toContain('monthlyLongest');
  });

  test('이번 달 더 긴 런이 있으면 → 볼륨 없음', () => {
    const out = runInsights(baseRun({km: 6}), [prior('2026-07-05', 10)]);
    expect(out.map(i => i.kind)).not.toContain('monthlyLongest');
  });

  test('km 0·비유한 → 볼륨 없음', () => {
    expect(runInsights(baseRun({km: 0}), [prior('2026-07-05', 8)]).map(i => i.kind)).not.toContain('monthlyLongest');
    expect(runInsights(baseRun({km: NaN}), [prior('2026-07-05', 8)]).map(i => i.kind)).not.toContain('monthlyLongest');
  });
});

describe('runInsights — 오케스트레이션(절제·순서)', () => {
  test('세 축 모두 성립 → [꾸준함, 페이스, 볼륨] 순 최대 3', () => {
    const out = runInsights(
      baseRun({km: 12, splits: sp([320, 320, 300, 300])}),
      [prior('2026-07-13', 5), prior('2026-07-12', 5)],
    );
    expect(out.map(i => i.kind)).toEqual(['streak', 'negativeSplit', 'monthlyLongest']);
  });

  test('총 최대 3개를 넘지 않음', () => {
    const out = runInsights(
      baseRun({km: 12, splits: sp([320, 320, 300, 300])}),
      [prior('2026-07-13', 5), prior('2026-07-12', 5)],
    );
    expect(out.length).toBeLessThanOrEqual(3);
  });

  test('longestDist PR → 볼륨 빠지고 나머지만', () => {
    const out = runInsights(
      baseRun({km: 12, splits: sp([320, 320, 300, 300])}),
      [prior('2026-07-13', 5), prior('2026-07-12', 5)],
      {prKinds: ['longestDist']},
    );
    expect(out.map(i => i.kind)).toEqual(['streak', 'negativeSplit']);
  });

  test('해당 없으면 빈 배열(화면은 통째로 숨김)', () => {
    expect(runInsights(baseRun(), [])).toEqual([]);
  });
});

describe('runInsights — 엣지(결정성·graceful)', () => {
  test('잘못된 runDate → 날짜 의존 인사이트 없음(throw 없음)', () => {
    const out = runInsights(baseRun({runDate: 'bad-date', km: 12}), [prior('2026-07-05', 8)]);
    // 날짜 파싱 실패 → 꾸준함·볼륨 모두 스킵. 스플릿 없으니 빈 배열.
    expect(out).toEqual([]);
  });

  test('null 런 → 빈 배열', () => {
    // 타입 계약상 non-null 이나 방어적으로 빈 배열을 보장(런타임 안전).
    expect(runInsights(null as unknown as InsightRun, [])).toEqual([]);
  });

  test('prior 가 배열이 아니어도 graceful', () => {
    const out = runInsights(baseRun({splits: sp([300, 300, 270])}), undefined as unknown as InsightPriorRun[]);
    expect(out.map(i => i.kind)).toContain('strongFinish');
  });

  test('동일 입력 → 동일 출력(결정성)', () => {
    const run = baseRun({km: 12, splits: sp([320, 320, 300, 300])});
    const priors = [prior('2026-07-13', 5)];
    expect(runInsights(run, priors)).toEqual(runInsights(run, priors));
  });
});
