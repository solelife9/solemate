/**
 * 개인 기록에 **사람이 낼 수 없는 페이스**가 올라오지 않는다.
 *
 * 발견(2026-08-07 실기기, 갤럭시 S10e): 마이 탭 프로필에 「1km 최고 **00:02**」가 떠 있었다 —
 * 같은 화면의 5K 기록이 31:28(6'17"/km)인 사용자에게. 거리는 정상인데 시간이 몇 초인
 * 레코드 하나가 최고 기록 자리를 차지한 것이다. 테스트 3,207개가 전부 그린인 상태였다.
 *
 * 이 스위트가 고정하는 것:
 *  ① 오염된 값이 최고 기록이 되지 않는다(goals·records **두 구현 모두**).
 *  ② 그렇다고 정상 기록을 자르지 않는다 — 경계값과 엘리트 페이스를 함께 고정한다.
 *  ③ 오염된 런도 **버리지 않는다** — 최장 거리 등 다른 집계에는 그대로 남는다
 *     (Iron Law: 사용자 데이터 파괴 금지. 순위 경쟁에서만 뺀다).
 * @format
 */
import {personalRecords as goalsPR} from '../../lib/goals';
import {personalRecords as recordsPR, detectPRs} from '../../lib/records';
import {MIN_PLAUSIBLE_SEC_PER_KM} from '../../lib/engineConstants';

const gRun = (km: number, durationS: number, run_date = '2026-08-01') => ({run_date, km, durationS});
const rRun = (dist: number, durationS: number, runDate = '2026-08-01') => ({dist, durationS, runDate} as any);

describe('개인 기록 — 불가능한 페이스는 후보가 아니다', () => {
  test('goals: 실기기에서 실제로 본 상태 — 오염된 런이 6\'17" 러너의 1km 최고를 차지하지 않는다', () => {
    const runs = [
      gRun(5.07, 1923),  // 6'19"/km — 진짜 기록
      gRun(12.1, 3100),  // 4'16"/km — 진짜 최고
      gRun(12.1, 24),    // 2초/km  — 오염(거리는 맞고 시간만 깨진 레코드)
    ];
    const pr = goalsPR(runs);
    expect(pr.fastest1k).toBeCloseTo(3100 / 12.1, 3); // 04:16 — 00:02 이 아니다
    // 오염된 런도 최장 거리에는 그대로 남는다(데이터를 버리지 않는다).
    expect(pr.longest).toBe(12.1);
  });

  test('goals: 오염된 런밖에 없으면 최고 기록은 null 이다 — 없는 걸 지어내지 않는다', () => {
    const pr = goalsPR([gRun(10, 20)]);
    expect(pr.fastest1k).toBeNull();
    expect(pr.fastest5k).toBeNull();
    expect(pr.longest).toBe(10); // 거리는 살아 있다
  });

  test('goals: 경계값 — 하한 이상은 채택하고, 하한 미만만 자른다', () => {
    const justOk = goalsPR([gRun(1, MIN_PLAUSIBLE_SEC_PER_KM)]);
    expect(justOk.fastest1k).toBe(MIN_PLAUSIBLE_SEC_PER_KM);
    const justUnder = goalsPR([gRun(1, MIN_PLAUSIBLE_SEC_PER_KM - 1)]);
    expect(justUnder.fastest1k).toBeNull();
  });

  test('goals: 엘리트 실제 기록은 그대로 통과한다 — 정상 기록을 자르면 안 된다', () => {
    // 마라톤 세계기록급(2:00:35 / 42.195km ≈ 171초/km)
    const pr = goalsPR([gRun(42.195, 7235)]);
    expect(pr.fastest1k).toBeCloseTo(7235 / 42.195, 3);
    expect(pr.fastest5k).not.toBeNull();
  });

  test('records: 같은 불변식이 은퇴 카드·PR 감지 쪽에도 걸린다', () => {
    const pr = recordsPR([rRun(12.1, 3100), rRun(12.1, 24)]);
    expect(pr.fastestPaceSec).toBeCloseTo(3100 / 12.1, 3);
    expect(pr.longestKm).toBe(12.1); // 오염분도 거리 집계엔 남는다
  });

  test('records: 오염된 런이 "PB 달성" 축하를 띄우지 않는다', () => {
    const prior = [rRun(12.1, 3100, '2026-07-01')];
    // 2초/km 짜리 런 — 숫자만 보면 역대 최고지만 사람이 낸 기록이 아니다.
    expect(detectPRs(rRun(12.1, 24, '2026-08-01'), prior)).not.toContain('fastestPace');
    // 진짜로 빨라진 런은 정상 감지된다(가드가 기능을 죽이지 않았다).
    expect(detectPRs(rRun(12.1, 2900, '2026-08-01'), prior)).toContain('fastestPace');
  });
});
