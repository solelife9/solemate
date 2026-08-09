// buildFitnessInput — 레코드 → 체력 분석 입력 매핑의 **단일 소유자**.
//
// 왜 있나 (2026-08-08)
// ----------------------------------------------------------------------------
// 이 매핑이 화면마다 따로 적혀 있었고 **실제로 갈라졌다.** 마이 탭은 심박을 넘기는데
// (2026-08-04·08-07 수리) 홈은 안 넘겨서, 같은 사람의 `vo2max` 가 한쪽은 값이고 한쪽은
// 0 이었다. 그 0 이 공개 프로필 문서에 실려 나갔다.
//
// 여기서 고정하는 것 둘:
//   ① **추측하지 않는 선** — 나이·안정시 심박이 없으면 TRIMP 를 억지로 켜지 않는다.
//      없는 값을 지어내 부하를 계산하면 틀린 숫자를 자신 있게 보여주게 된다.
//   ② **실측 우선** — 그 러닝에서 관측된 최대 심박이 있으면 나이 추정보다 그걸 쓴다.
import {buildFitnessInput} from '../../lib/analytics/fitness';
import {estimateMaxHR} from '../../lib/analytics/hrZones';

const run = (over: Record<string, unknown> = {}) => ({
  km: 10,
  duration: 3000,
  run_date: '2026-08-01',
  ...over,
});

describe('레코드 형태를 둘 다 받는다', () => {
  it('저장 형태(km·duration·run_date·heart_rate)', () => {
    const {runs} = buildFitnessInput([run({heart_rate: 150})], {age: 30, restHR: 50});
    expect(runs[0]).toMatchObject({km: 10, durationS: 3000, runDate: '2026-08-01', hrAvg: 150});
  });

  it('표시 형태(dist·durationS·runDate·bpm)', () => {
    const {runs} = buildFitnessInput(
      [{dist: 5, durationS: 1500, runDate: '2026-08-02', bpm: 140}],
      {age: 30, restHR: 50},
    );
    expect(runs[0]).toMatchObject({km: 5, durationS: 1500, runDate: '2026-08-02', hrAvg: 140});
  });

  it('쓰레기 입력에 던지지 않는다', () => {
    expect(() => buildFitnessInput([null, undefined, 42, 'x'] as never, {})).not.toThrow();
    expect(buildFitnessInput([null] as never, {}).runs).toEqual([]);
  });
});

describe('추측하지 않는다', () => {
  it('나이가 없으면 최대 심박을 붙이지 않는다 — TRIMP 가 억지로 켜지지 않는다', () => {
    const {runs} = buildFitnessInput([run({heart_rate: 150})], {age: 0, restHR: 50});
    expect(runs[0].hrMax).toBeUndefined();
  });

  it('안정시 심박이 없으면 붙이지 않는다', () => {
    const {runs} = buildFitnessInput([run({heart_rate: 150})], {age: 30, restHR: 0});
    expect(runs[0].hrRest).toBeUndefined();
  });

  it('심박이 없는 런에는 최대·안정시도 붙이지 않는다 — 붙여 봐야 뜻이 없다', () => {
    const {runs} = buildFitnessInput([run()], {age: 30, restHR: 50});
    expect(runs[0].hrAvg).toBeUndefined();
    expect(runs[0].hrMax).toBeUndefined();
    expect(runs[0].hrRest).toBeUndefined();
  });
});

describe('실측이 추정을 이긴다', () => {
  it('관측된 최대 심박이 있으면 그걸 쓴다', () => {
    const {runs} = buildFitnessInput(
      [run({heart_rate: 150, heart_rate_max: 186})],
      {age: 30, restHR: 50},
    );
    expect(runs[0].hrMax).toBe(186);
  });

  it('없으면 나이 추정(Tanaka)으로 떨어진다', () => {
    const {runs} = buildFitnessInput([run({heart_rate: 150})], {age: 30, restHR: 50});
    expect(runs[0].hrMax).toBe(estimateMaxHR(30));
  });
});

describe('opts', () => {
  it('성별·나이를 그대로 넘긴다(TRIMP 계수·최대심박 추정에 쓰인다)', () => {
    expect(buildFitnessInput([], {age: 42, sex: 'female'}).opts).toEqual({sex: 'female', age: 42});
  });

  it('성별 누락은 male 로 — 값이 없다고 계산이 멈추면 안 된다', () => {
    expect(buildFitnessInput([], {}).opts).toEqual({sex: 'male', age: 0});
  });
});

// ── 스윕: 새 화면이 자기 매핑을 만들지 못하게 ────────────────────────────────
describe('매핑은 한 곳에만 있다', () => {
  it('화면이 fitnessSummary 에 직접 배열을 조립하지 않는다', () => {
    const {readFileSync, readdirSync} = require('fs');
    const {join} = require('path');
    const ROOT = join(__dirname, '..', '..');
    const files = readdirSync(ROOT).filter((f: string) => f.endsWith('.tsx'));
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8') as string;
      const at = src.indexOf('fitnessSummary(');
      if (at < 0) continue;
      const call = src.slice(at, at + 500);
      // `.map(` 이 인자로 바로 들어가면 그 화면이 자기 매핑을 갖고 있다는 뜻이다.
      if (/fitnessSummary\(\s*[\s\S]{0,80}\.map\(/.test(call)) offenders.push(f);
    }
    // 고치는 법: `buildFitnessInput(runs, {age, sex, restHR})` 를 쓴다.
    expect(offenders).toEqual([]);
  });
});
