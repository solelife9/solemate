// lib/timeline — 러닝 타임라인(확대·스크럽 탐색 뷰)의 순수 로직.
//
// 왜 있나 (2026-08-12)
// ----------------------------------------------------------------------------
// 조사 결과 **폰에서 러닝 그래프를 파고들 수 있는 앱이 사실상 없다** — 가민 모바일은
// 차트 확대가 안 되고, 스트라바는 자기 커뮤니티가 "앱 그래프는 웹에 비해 원시적"이라고
// 적고 있다. 그 빈칸을 채우는 화면이고, 계산은 전부 여기 모여 있다.
//
// 이 파일이 고정하는 것 셋:
//   ① **저장 데이터를 믿지 않는다** — 깨진 항목 하나가 화면을 죽이면 안 된다.
//   ② **모르는 것은 만들지 않는다** — 표본이 없으면 곡선도 없다(0 으로 안 채운다).
//   ③ **확대하면 요약이 따라 움직인다** — 이 화면의 존재 이유다.
import {
  toPoints, hasCurve, slice, downsample, stats, yRange, norm,
  clampRange, zoomAt, timeAt, pointAt, zoneSeconds, hardestWindow, MIN_SPAN_SEC,
} from '../../lib/timeline';

const P = (t: number, v: number) => ({t, v});
const ramp = (n: number, step = 1) =>
  Array.from({length: n}, (_, i) => P(i * step, 100 + i));

describe('저장 데이터를 믿지 않는다', () => {
  const pick = (r: Record<string, unknown>) => ({t: r.t, v: r.bpm});

  it('배열이 아니면 빈 결과 — 던지지 않는다', () => {
    expect(() => toPoints(null, pick)).not.toThrow();
    expect(toPoints('망가짐', pick)).toEqual([]);
    expect(toPoints({t: 1}, pick)).toEqual([]);
  });

  it('깨진 항목만 버리고 나머지는 살린다', () => {
    const out = toPoints(
      [{t: 0, bpm: 120}, null, {t: 'x', bpm: 130}, {t: 5, bpm: NaN}, {t: 10, bpm: 150}],
      pick,
    );
    expect(out).toEqual([P(0, 120), P(10, 150)]);
  });

  it('문자열 숫자도 받아들인다 — 옛 저장 형태가 그럴 수 있다', () => {
    expect(toPoints([{t: '3', bpm: '140'}], pick)).toEqual([P(3, 140)]);
  });

  it('시각이 뒤섞여 있으면 세워 준다', () => {
    const out = toPoints([{t: 9, bpm: 1}, {t: 2, bpm: 2}, {t: 5, bpm: 3}], pick);
    expect(out.map(p => p.t)).toEqual([2, 5, 9]);
  });

  it('음수 시각은 버린다 — 러닝 시작 이전은 없다', () => {
    expect(toPoints([{t: -4, bpm: 120}, {t: 1, bpm: 130}], pick)).toEqual([P(1, 130)]);
  });
});

describe('모르는 것은 만들지 않는다', () => {
  it('표본 2개 미만이면 곡선이 아니다 — 레인이 아예 안 뜬다', () => {
    expect(hasCurve(null)).toBe(false);
    expect(hasCurve({points: []})).toBe(false);
    expect(hasCurve({points: [P(0, 1)]})).toBe(false);
    expect(hasCurve({points: [P(0, 1), P(1, 2)]})).toBe(true);
  });

  it('표본이 없으면 통계도 null — 0 이라고 답하지 않는다', () => {
    expect(stats([])).toBeNull();
  });
});

describe('보이는 구간', () => {
  it('경계 바깥 한 점씩 포함한다 — 곡선이 화면 끝에서 잘리지 않게', () => {
    const pts = ramp(10); // t=0..9
    const s = slice(pts, {a: 3, b: 5});
    expect(s[0].t).toBe(2);                    // 왼쪽 바깥 한 점
    expect(s[s.length - 1].t).toBe(6);         // 오른쪽 바깥 한 점
  });

  it('구간이 데이터보다 넓으면 전부 준다', () => {
    expect(slice(ramp(5), {a: -10, b: 999})).toHaveLength(5);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(slice([], {a: 0, b: 10})).toEqual([]);
  });
});

describe('그릴 점 줄이기', () => {
  it('상한 이하면 그대로', () => {
    expect(downsample(ramp(10), 160)).toHaveLength(10);
  });

  it('상한을 넘으면 솎되 처음과 끝은 반드시 남긴다', () => {
    const pts = ramp(1000);
    const d = downsample(pts, 100);
    expect(d.length).toBeLessThanOrEqual(102);
    expect(d[0]).toEqual(pts[0]);
    expect(d[d.length - 1]).toEqual(pts[pts.length - 1]);
  });
});

describe('y축', () => {
  it('위아래 여백을 둔다 — 곡선이 테두리에 붙지 않게', () => {
    const r = yRange([P(0, 100), P(1, 200)]);
    expect(r.lo).toBeLessThan(100);
    expect(r.hi).toBeGreaterThan(200);
  });

  it('값이 전부 같아도 폭이 0 이 되지 않는다 — 나눗셈이 무너진다', () => {
    const r = yRange([P(0, 150), P(1, 150), P(2, 150)]);
    expect(r.hi).toBeGreaterThan(r.lo);
  });

  it('정규화는 0~1 로 갇힌다', () => {
    expect(norm(150, 100, 200)).toBeCloseTo(0.5, 5);
    expect(norm(50, 100, 200)).toBe(0);
    expect(norm(999, 100, 200)).toBe(1);
  });

  it('페이스는 뒤집힌다 — 빠를수록 위', () => {
    // 4'00"(240초)가 6'00"(360초)보다 위에 그려져야 한다.
    const fast = norm(240, 200, 400, true);
    const slow = norm(360, 200, 400, true);
    expect(fast).toBeGreaterThan(slow);
  });
});

describe('확대·이동', () => {
  const TOTAL = 600;

  it('데이터 밖으로 나가지 않는다(폭은 유지)', () => {
    const r = clampRange({a: -100, b: 100}, TOTAL);
    expect(r.a).toBe(0);
    expect(r.b - r.a).toBe(200);
    const r2 = clampRange({a: 550, b: 750}, TOTAL);
    expect(r2.b).toBe(TOTAL);
  });

  it('최대 확대 아래로는 못 내려간다', () => {
    const r = clampRange({a: 100, b: 101}, TOTAL);
    expect(r.b - r.a).toBe(MIN_SPAN_SEC);
  });

  it('고정점이 유지된다 — 확대할 때 보던 곳을 잃지 않는다', () => {
    const before = {a: 0, b: 600};
    const anchor = 150;
    const after = zoomAt(before, 0.5, anchor, TOTAL);
    // 고정점의 화면상 상대 위치가 그대로여야 한다.
    const fBefore = (anchor - before.a) / (before.b - before.a);
    const fAfter = (anchor - after.a) / (after.b - after.a);
    expect(fAfter).toBeCloseTo(fBefore, 5);
  });

  it('축소는 전체를 넘지 않는다', () => {
    const r = zoomAt({a: 100, b: 200}, 100, 150, TOTAL);
    expect(r.a).toBe(0);
    expect(r.b).toBe(TOTAL);
  });
});

describe('스크럽', () => {
  it('화면 비율이 시각으로 바뀐다(밖은 잘린다)', () => {
    expect(timeAt({a: 100, b: 200}, 0.5)).toBe(150);
    expect(timeAt({a: 100, b: 200}, -1)).toBe(100);
    expect(timeAt({a: 100, b: 200}, 2)).toBe(200);
  });

  it('가장 가까운 점을 집는다', () => {
    const pts = [P(0, 1), P(10, 2), P(20, 3)];
    expect(pointAt(pts, 11)?.t).toBe(10);
    expect(pointAt(pts, 16)?.t).toBe(20);
    expect(pointAt([], 5)).toBeNull();
  });
});

// ── 이 화면의 존재 이유 ──────────────────────────────────────────────────────
describe('확대하면 요약이 따라 움직인다', () => {
  const zoneOf = (b: number) => (b >= 171 ? 5 : b >= 152 ? 4 : b >= 133 ? 3 : b >= 114 ? 2 : 1);

  it('존 시간은 표본 간격을 시간으로 센다 — 성긴 표본에서도 총합이 맞는다', () => {
    const pts = [P(0, 120), P(10, 120), P(20, 160), P(30, 160)];
    const z = zoneSeconds(pts, zoneOf);
    expect(z[2]).toBe(20); // 0~20초를 Z2 로
    expect(z[4]).toBe(10); // 20~30초를 Z4 로
  });

  it('구간을 좁히면 그 구간만 세어진다', () => {
    const pts = [P(0, 120), P(10, 120), P(20, 160), P(30, 160)];
    // 그리기용 slice 는 경계 바깥 점을 끌어오므로, 요약은 range 를 함께 넘겨 잘라야 한다.
    const zoomed = zoneSeconds(slice(pts, {a: 20, b: 30}), zoneOf, {a: 20, b: 30});
    expect(zoomed[2]).toBe(0);           // 전체에선 20초였던 Z2 가
    expect(zoomed[4]).toBeGreaterThan(0); // 이 구간엔 Z4 만 있다
  });

  it('표본 1개면 시간을 만들지 않는다 — 폭을 모른다', () => {
    expect(zoneSeconds([P(0, 180)], zoneOf)).toEqual({1: 0, 2: 0, 3: 0, 4: 0, 5: 0});
  });

  it('시각이 역행해도 음수 시간을 만들지 않는다', () => {
    const z = zoneSeconds([P(10, 120), P(0, 120)], zoneOf);
    expect(Object.values(z).every(v => v >= 0)).toBe(true);
  });
});

describe('가장 힘들었던 구간', () => {
  it('평균이 가장 높은 창을 찾는다', () => {
    // 0~100초는 낮고, 200~320초가 높다.
    const pts: {t: number; v: number}[] = [];
    for (let t = 0; t <= 400; t += 10) pts.push(P(t, t >= 200 && t <= 320 ? 175 : 120));
    const w = hardestWindow(pts, 120);
    expect(w).not.toBeNull();
    expect(w!.a).toBeGreaterThanOrEqual(190);
    expect(w!.a).toBeLessThanOrEqual(210);
    expect(w!.avg).toBeGreaterThan(160);
  });

  it('러닝이 창보다 짧으면 null — 없는 구간을 지어내지 않는다', () => {
    expect(hardestWindow([P(0, 150), P(30, 150)], 120)).toBeNull();
  });

  it('표본이 모자라도 던지지 않는다', () => {
    expect(() => hardestWindow([], 120)).not.toThrow();
    expect(hardestWindow([], 120)).toBeNull();
  });
});
