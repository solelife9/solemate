import {trimp, paceLoad, performanceChart, currentPmc, tsbLabel, effortBand, formStatus} from '../../../lib/analytics/load';

describe('trimp (Banister 1991)', () => {
  test('남 60min HRr0.6 → 73', () => {
    // (140-50)/(200-50)=0.6; 60×0.6×0.64×e^1.152 = 72.9 → 73
    expect(trimp(3600, 140, 200, 50, 'male')).toBe(73);
  });
  test('여 60min HRr0.6 → 84 (계수 다름)', () => {
    expect(trimp(3600, 140, 200, 50, 'female')).toBe(84);
  });
  test('강도 높을수록 TRIMP 지수적으로 증가', () => {
    expect(trimp(3600, 180, 200, 50)).toBeGreaterThan(trimp(3600, 140, 200, 50));
  });
  test('심박 비유효는 0', () => {
    expect(trimp(3600, 0, 200, 50)).toBe(0);
    expect(trimp(3600, 140, 200, 200)).toBe(0);
    expect(trimp(0, 140, 200, 50)).toBe(0);
  });
});

describe('paceLoad (rTSS 유사)', () => {
  test('임계 페이스로 1시간 = IF1 → TSS 100', () => {
    expect(paceLoad(15, 3600, 240)).toBe(100); // 15km/3600s=240s/km=임계 → IF1, 1hr
  });
  test('임계보다 빠르면 TSS↑ (IF²)', () => {
    expect(paceLoad(10, 2400, 240)).toBeGreaterThan(paceLoad(10, 2600, 240));
  });
  test('비유효는 0', () => {
    expect(paceLoad(0, 3600, 240)).toBe(0);
    expect(paceLoad(10, 2400, 0)).toBe(0);
  });
});

describe('performanceChart (PMC CTL/ATL/TSB)', () => {
  test('첫날 부하100 → CTL 2.4, ATL 13.3, TSB 0', () => {
    const pmc = performanceChart([{date: '2026-06-30', load: 100}], '2026-06-30');
    expect(pmc).toHaveLength(1);
    expect(pmc[0].ctl).toBeCloseTo(2.4, 1);
    expect(pmc[0].atl).toBeCloseTo(13.3, 1);
    expect(pmc[0].tsb).toBe(0);
  });

  test('일정 부하 장기(400일) → CTL·ATL 모두 부하로 수렴, TSB→0', () => {
    const loads = Array.from({length: 400}, (_, i) => {
      const d = new Date(Date.UTC(2025, 0, 1));
      d.setUTCDate(d.getUTCDate() + i);
      return {date: d.toISOString().slice(0, 10), load: 100};
    });
    const pmc = performanceChart(loads, loads[loads.length - 1].date);
    const cur = currentPmc(pmc);
    expect(cur.ctl).toBeCloseTo(100, 0); // 400일≈9.5τ → ~99.99
    expect(cur.atl).toBeCloseTo(100, 0);
    expect(Math.abs(cur.tsb)).toBeLessThan(1);
  });

  test('체력 쌓고 테이퍼(휴식) → ATL 급감, 폼(TSB) 양수로 전환', () => {
    // 30일 꾸준(load 80)으로 CTL 쌓은 뒤 10일 휴식 → ATL 가 CTL 아래로, TSB 양수.
    const loads: {date: string; load: number}[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.UTC(2026, 5, 1)); d.setUTCDate(d.getUTCDate() + i);
      loads.push({date: d.toISOString().slice(0, 10), load: 80});
    }
    const pmc = performanceChart(loads, '2026-07-10'); // 06-30 마지막 런 + 10일 휴식
    const cur = currentPmc(pmc);
    expect(cur.atl).toBeLessThan(cur.ctl); // 휴식으로 피로가 체력 아래로
    expect(cur.tsb).toBeGreaterThan(0);    // 폼 양수(신선)
  });

  test('빈 입력/비유효 날짜는 []', () => {
    expect(performanceChart([], '2026-06-30')).toEqual([]);
    expect(performanceChart([{date: 'bad', load: 50}], '2026-06-30')).toEqual([]);
  });
});

test('effortBand 부하 정성 라벨(경계 + 단조)', () => {
  expect(effortBand(0)).toBe('');
  expect(effortBand(-5)).toBe('');
  expect(effortBand(20)).toBe('가벼움');
  expect(effortBand(34)).toBe('가벼움');
  expect(effortBand(35)).toBe('적당');
  expect(effortBand(74)).toBe('적당');
  expect(effortBand(75)).toBe('높음');
  expect(effortBand(119)).toBe('높음');
  expect(effortBand(120)).toBe('매우 높음');
  expect(effortBand(200)).toBe('매우 높음');
});

test('formStatus 컨디션 + 조언(경계별)', () => {
  expect(formStatus(20).label).toBe('아주 신선');
  expect(formStatus(8).label).toBe('신선');
  expect(formStatus(0).label).toBe('균형');
  expect(formStatus(-15).label).toBe('피로 쌓임');
  expect(formStatus(-30).label).toBe('과부하');
  // 각 상태에 실행 가능한 한 줄 조언이 붙는다.
  expect(formStatus(8).advice.length).toBeGreaterThan(0);
  expect(formStatus(-30).advice).toContain('회복');
});

test('tsbLabel 폼 해석', () => {
  expect(tsbLabel(20)).toContain('신선');
  expect(tsbLabel(0)).toBe('균형');
  expect(tsbLabel(-30)).toContain('과부하');
});
