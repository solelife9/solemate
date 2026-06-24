// trainingLoad.test.ts — ACWR 훈련 부하 부상위험(순수) 단위 테스트.
// 기준시각(todayISO)을 주입하므로 Date 모킹 불필요(goals.ts 규약).
import {
  assessTrainingLoad,
  loadRatioPhraseKo,
  nextWeekSafeKm,
  LOAD_MSG_NEW,
  ACWR_HIGH_AT,
} from '../../lib/trainingLoad';

const TODAY = '2026-06-23';
const DAY_MS = 86400000;

/** TODAY 기준 n일 전 'YYYY-MM-DD'. */
function ago(n: number): string {
  const [y, m, d] = TODAY.split('-').map(Number);
  const t = new Date(y, m - 1, d).getTime() - n * DAY_MS;
  const dt = new Date(t);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

describe('assessTrainingLoad — ACWR', () => {
  it('빈 배열: ACWR null·safe·신뢰 불가(갓 시작 카피)', () => {
    const a = assessTrainingLoad([], TODAY);
    expect(a.acwr).toBeNull();
    expect(a.acuteKm).toBe(0);
    expect(a.level).toBe('safe');
    expect(a.confident).toBe(false);
    expect(a.message).toBe(LOAD_MSG_NEW);
  });

  it('꾸준한 러너(매주 동일 거리): ACWR≈1.0 → safe', () => {
    // 4주간 매주 동일하게 분포 → 급성=만성주간평균 → ACWR≈1
    const runs = [] as {run_date: string; km: number}[];
    for (let w = 0; w < 4; w++) {
      runs.push({run_date: ago(w * 7 + 1), km: 5});
      runs.push({run_date: ago(w * 7 + 4), km: 5});
    }
    const a = assessTrainingLoad(runs, TODAY);
    expect(a.confident).toBe(true);
    expect(a.acwr).not.toBeNull();
    expect(a.acwr!).toBeGreaterThan(0.8);
    expect(a.acwr!).toBeLessThan(1.3);
    expect(a.level).toBe('safe');
  });

  it('급증(낮은 만성 + 큰 급성): ACWR>1.5 → high', () => {
    // 지난 3주 거의 안 뜀(주 2km), 이번 주 폭증(30km)
    const runs = [
      {run_date: ago(20), km: 2},
      {run_date: ago(13), km: 2},
      // 이번 주 폭증
      {run_date: ago(2), km: 15},
      {run_date: ago(1), km: 15},
    ];
    const a = assessTrainingLoad(runs, TODAY);
    expect(a.confident).toBe(true);
    expect(a.acwr!).toBeGreaterThanOrEqual(ACWR_HIGH_AT);
    expect(a.level).toBe('high');
  });

  it('신참(최근 7일에만 런): ACWR 신뢰 불가 → safe + 갓 시작 카피', () => {
    const runs = [
      {run_date: ago(1), km: 5},
      {run_date: ago(3), km: 5},
    ];
    const a = assessTrainingLoad(runs, TODAY);
    expect(a.confident).toBe(false);
    expect(a.level).toBe('safe');
    expect(a.message).toBe(LOAD_MSG_NEW);
  });

  it('콜드스타트(이력 2주): ACWR 대신 지난주 대비 거리 증가율로 판정', () => {
    // 지난주 4km → 이번주 10km(+150%). 4주 이력 없음 → ramp 폴백이 잡아야 한다.
    const runs = [
      {run_date: ago(10), km: 4}, // 지난주
      {run_date: ago(2), km: 10}, // 이번주 급증
    ];
    const a = assessTrainingLoad(runs, TODAY);
    expect(a.confident).toBe(false); // ACWR은 신뢰 안 함
    expect(a.acwr).toBeNull();
    expect(a.rampPct).toBeCloseTo(1.5, 5);
    expect(a.level).toBe('high'); // 그래도 급증을 놓치지 않는다
    expect(loadRatioPhraseKo(a)).toBe('지난주보다 +150%');
  });

  it('거짓 high 방지: 만성을 보유 주수로 나눠 가입 직후 과경고를 막는다', () => {
    // 3주 연속 주 10km(꾸준). 항상 4로 나누면 만성 과소→ACWR 1.33(주의)로 거짓 경고.
    // 보유 주수(3)로 나누면 ACWR≈1 → 안전.
    const runs = [
      {run_date: ago(2), km: 10},
      {run_date: ago(9), km: 10},
      {run_date: ago(16), km: 10},
    ];
    const a = assessTrainingLoad(runs, TODAY);
    expect(a.confident).toBe(true);
    expect(a.acwr!).toBeGreaterThan(0.85);
    expect(a.acwr!).toBeLessThan(1.15);
    expect(a.level).toBe('safe');
  });

  it('부하 가벼움(급성 << 만성): low', () => {
    // 과거엔 많이 뛰었는데 이번 주 거의 안 뜀
    const runs = [
      {run_date: ago(25), km: 20},
      {run_date: ago(18), km: 20},
      {run_date: ago(11), km: 20},
      {run_date: ago(2), km: 1}, // 이번 주 거의 0
    ];
    const a = assessTrainingLoad(runs, TODAY);
    expect(a.acwr!).toBeLessThan(0.8);
    expect(a.level).toBe('low');
  });

  it('주간 급증(ramp)이 ACWR보다 위험하면 등급을 끌어올린다', () => {
    // 지난 주 4km → 이번 주 8km(+100%) : ramp high. 만성 이력도 충분.
    const runs = [
      {run_date: ago(25), km: 6},
      {run_date: ago(18), km: 6},
      {run_date: ago(10), km: 4}, // 지난 주
      {run_date: ago(2), km: 8}, // 이번 주(+100%)
    ];
    const a = assessTrainingLoad(runs, TODAY);
    expect(a.rampPct).not.toBeNull();
    expect(a.rampPct!).toBeCloseTo(1.0, 5);
    expect(a.level).toBe('high');
  });

  it('강도 반영: 거리는 같아도 이번 주를 빠르게 뛰면 ACWR이 올라간다', () => {
    // 4주 모두 주 10km(2런×5km) 동일 거리. 차이는 '이번 주 페이스'뿐.
    const weeks = [0, 1, 2, 3];
    const build = (thisWeekPace: number) => {
      const easy = 360; // 6'00"/km
      const runs: any[] = [];
      for (const w of weeks) {
        const pace = w === 0 ? thisWeekPace : easy;
        runs.push({run_date: ago(w * 7 + 1), km: 5, durationS: 5 * pace});
        runs.push({run_date: ago(w * 7 + 4), km: 5, durationS: 5 * pace});
      }
      return runs;
    };
    const easyWeek = assessTrainingLoad(build(360), TODAY); // 평소와 같은 페이스
    const fastWeek = assessTrainingLoad(build(240), TODAY); // 이번 주만 4'00"/km

    // 실제 거리는 동일(가중과 무관) — 다음 주 안전거리 계산은 거리 기준 유지.
    expect(fastWeek.acuteKm).toBe(easyWeek.acuteKm);
    // 가중 부하·ACWR은 빠른 주가 더 높다.
    expect(fastWeek.acuteLoad).toBeGreaterThan(easyWeek.acuteLoad);
    expect(fastWeek.acwr!).toBeGreaterThan(easyWeek.acwr!);
    expect(easyWeek.level).toBe('safe'); // 평소 페이스 = ACWR≈1
    expect(fastWeek.level).not.toBe('safe'); // 강도 급증 → 등급 상향
  });

  it('duration 없는 런: 가중 1.0(거리 기반과 동일, graceful)', () => {
    const runs = [
      {run_date: ago(2), km: 10},   // duration 없음
      {run_date: ago(14), km: 10},  // 만성 이력
    ];
    const a = assessTrainingLoad(runs, TODAY);
    expect(a.acuteLoad).toBe(a.acuteKm); // 페이스 없으면 부하=거리
  });

  it('평어 변환: ACWR을 약자 없이 "평소의 N배"로 노출', () => {
    // 신뢰 불가 → '기록 쌓는 중'
    expect(loadRatioPhraseKo(assessTrainingLoad([], TODAY))).toBe('기록 쌓는 중');
    // 급증 → '평소의 N.N배'
    const spike = [
      {run_date: ago(20), km: 2},
      {run_date: ago(13), km: 2},
      {run_date: ago(2), km: 15},
      {run_date: ago(1), km: 15},
    ];
    const p = loadRatioPhraseKo(assessTrainingLoad(spike, TODAY));
    expect(p).toMatch(/^평소의 \d+\.\d배$/);
    expect(p).not.toContain('ACWR');
  });

  it('연속 러닝일: 오늘부터 내리 달리면 카운트, 쉬었으면 0', () => {
    const consec = assessTrainingLoad(
      [
        {run_date: ago(0), km: 4},
        {run_date: ago(1), km: 4},
        {run_date: ago(2), km: 4},
        {run_date: ago(14), km: 4}, // 만성 이력
      ],
      TODAY,
    );
    expect(consec.recentConsecutiveDays).toBe(3);
    // 마지막 런이 사흘 전(이미 쉼) → 0
    const rested = assessTrainingLoad([{run_date: ago(3), km: 4}], TODAY);
    expect(rested.recentConsecutiveDays).toBe(0);
  });

  it('다음 주 안전 거리: 이번 주 거리의 110%(정수), 0이면 0', () => {
    const a = assessTrainingLoad(
      [
        {run_date: ago(2), km: 10},
        {run_date: ago(14), km: 10}, // 만성 이력
      ],
      TODAY,
    );
    expect(nextWeekSafeKm(a)).toBe(11); // 10 * 1.1
    expect(nextWeekSafeKm(assessTrainingLoad([], TODAY))).toBe(0);
  });

  it('문자열 km·미래 날짜·0km를 graceful 처리', () => {
    const runs = [
      {run_date: ago(2), km: '5'},     // 문자열
      {run_date: ago(-3), km: 99},     // 미래 → 무시
      {run_date: ago(3), km: 0},       // 0km → 무시
      {run_date: ago(10), km: 5},      // 만성 이력
    ];
    const a = assessTrainingLoad(runs as any, TODAY);
    expect(Number.isFinite(a.acuteKm)).toBe(true);
    expect(a.acuteKm).toBe(5); // 문자열 5만 급성에 반영(미래·0 제외)
  });
});
