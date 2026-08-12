// ─── lib/timeline.ts — 러닝 타임라인의 순수 로직 ──────────────────────────────
//
// 러닝 상세의 **탐색 뷰**(확대·스크럽·지표 전환)가 쓰는 계산만 모은다. RN·SVG 를 모르는
// 순수 함수라 실기기 없이 전부 테스트된다(하네스 규약 — 센서·화면 의존 금지).
//
// 왜 이 화면인가 (2026-08-12 민우님 확정)
// ----------------------------------------------------------------------------
// 조사해 보니 **폰에서 러닝 그래프를 파고들 수 있는 앱이 사실상 없다.** 가민 커넥트
// 모바일은 차트 확대가 안 되고(가로 회전이나 PC 웹으로 가야 한다), 스트라바는 자기
// 커뮤니티에 "앱 그래프는 웹에 비해 원시적 — 웹에선 확대·구간 선택이 되는데 앱에선
// 불가능"이라는 글이 정식 기능 요청으로 올라와 있다. 웹에는 다 있는데 앱에는 없다.
//
// 핵심은 확대 자체가 아니라 **확대하면 요약이 따라 움직인다**는 점이다. 인터벌 한 개만
// 당겨 보면 그 구간만의 평균·최대·존 분포가 나온다 — 반복 4개의 질을 비교할 수 있다.
//
// ── 설계에서 지킨 선 ────────────────────────────────────────────────────────
//  · **모르는 것은 만들지 않는다.** 시계열이 없는 지표는 레인이 아예 안 뜬다(옛 러닝의
//    케이던스, 기압계 없는 기기의 고도). 0 으로 채우면 "평지를 달렸다"는 거짓말이 된다.
//  · **던지지 않는다.** 깨진 저장 데이터(문자열·NaN·역행 시각)가 화면을 죽이면 안 된다.
//  · 색은 심박에만 — 존 색이 곧 의미다(DESIGN.md).

/** 시계열 한 점. t = 러닝 시작 이후 경과초. */
export interface TimePoint {
  t: number;
  v: number;
}

export type MetricKey = 'hr' | 'pace' | 'elev' | 'cad';

/** 화면이 그릴 한 지표. 표본이 2개 미만이면 애초에 만들지 않는다. */
export interface Metric {
  key: MetricKey;
  /** 사용자에게 보이는 이름(한국어). */
  name: string;
  unit: string;
  points: TimePoint[];
  /**
   * 작을수록 좋은 지표인가(페이스). true 면 y축을 뒤집어 **빠를수록 위**로 그린다 —
   * 러너의 직관이 그렇고, 뒤집지 않으면 잘 달린 구간이 골짜기로 보인다.
   */
  invert?: boolean;
}

/** 보이는 구간 [a, b] (초). */
export interface Range {
  a: number;
  b: number;
}

/** 최대 확대 = 20초. 이보다 당기면 GPS 표본 간격보다 촘촘해져 의미가 없다. */
export const MIN_SPAN_SEC = 20;

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * 저장된 시계열(무엇이든)을 안전한 TimePoint[] 로 옮긴다.
 *
 * 저장 데이터는 **믿지 않는다** — 옛 버전이 쓴 형태, 손상된 JSON, NaN 이 섞여 있을 수
 * 있다. 걸러내고 시각 오름차순으로 세운다. 깨진 항목은 조용히 버린다(그 한 점이 없다고
 * 화면 전체를 못 그릴 이유가 없다).
 */
export function toPoints(
  raw: unknown,
  pick: (row: Record<string, unknown>) => {t: unknown; v: unknown},
): TimePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: TimePoint[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const {t, v} = pick(row as Record<string, unknown>);
    const tt = num(t);
    const vv = num(v);
    if (tt == null || vv == null || tt < 0) continue;
    out.push({t: tt, v: vv});
  }
  out.sort((p, q) => p.t - q.t);
  return out;
}

/** 이 지표를 화면에 올릴 수 있는가. 2점 미만은 곡선이 아니다. */
export function hasCurve(m: {points: TimePoint[]} | null | undefined): boolean {
  return !!m && m.points.length >= 2;
}

/** 구간에 걸리는 점들. 경계 바로 바깥 한 점씩 포함해 곡선이 잘리지 않게 한다. */
export function slice(points: readonly TimePoint[], r: Range): TimePoint[] {
  if (points.length === 0) return [];
  const out: TimePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.t < r.a) {
      // 구간 왼쪽 바깥 — 마지막 하나만 남긴다(곡선 시작을 화면 밖에서 이어 오려고).
      out.length = 0;
      out.push(p);
      continue;
    }
    if (p.t > r.b) {
      out.push(p); // 오른쪽 바깥 첫 점까지만
      break;
    }
    out.push(p);
  }
  return out;
}

/**
 * 그릴 점 수를 줄인다(전체 보기에서만 실효). **확대할수록 점이 늘지 않고 줄어든다** —
 * 보이는 구간만 그리기 때문이다. 그래서 확대 상태가 오히려 가볍다.
 *
 * 처음과 끝은 반드시 남긴다. 끝이 빠지면 곡선이 화면 중간에서 끊긴 것처럼 보인다.
 */
export function downsample(points: readonly TimePoint[], max = 160): TimePoint[] {
  if (points.length <= max || max < 2) return points.slice();
  const step = Math.ceil(points.length / max);
  const out: TimePoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** 구간의 통계. 표본이 없으면 null — 화면은 그때 값을 감춘다. */
export interface Stats {
  avg: number;
  min: number;
  max: number;
  count: number;
}

export function stats(points: readonly TimePoint[]): Stats | null {
  if (points.length === 0) return null;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    sum += p.v;
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  return {avg: sum / points.length, min, max, count: points.length};
}

/**
 * y축 범위. 위아래로 여백을 둬 곡선이 테두리에 붙지 않게 한다.
 *
 * 값이 전부 같으면(평지·정속) 폭이 0 이 되어 나눗셈이 무너진다 — 그때는 임의 폭을 준다.
 */
export function yRange(points: readonly TimePoint[], minPad = 4): {lo: number; hi: number} {
  const s = stats(points);
  if (!s) return {lo: 0, hi: 1};
  const spread = s.max - s.min;
  const pad = Math.max(minPad, spread * 0.17);
  if (spread === 0) return {lo: s.min - Math.max(1, minPad), hi: s.max + Math.max(1, minPad)};
  return {lo: s.min - pad, hi: s.max + pad};
}

/**
 * 값 → 0(아래)~1(위) 정규화. `invert` 면 뒤집는다(페이스는 빠를수록 위).
 *
 * 지표 전환 애니메이션이 이 공간에서 섞이기 때문에 정규화가 필요하다 — bpm 과 초/km 는
 * 단위가 달라 값끼리는 섞을 수 없지만, 0~1 끼리는 섞을 수 있다.
 */
export function norm(v: number, lo: number, hi: number, invert = false): number {
  const span = hi - lo;
  if (!(span > 0)) return 0.5;
  const f = (v - lo) / span;
  const c = f < 0 ? 0 : f > 1 ? 1 : f;
  return invert ? 1 - c : c;
}

/** 확대/이동 후 구간을 데이터 범위 안으로 되돌린다(폭 유지). */
export function clampRange(r: Range, total: number): Range {
  const max = Math.max(MIN_SPAN_SEC, total);
  let span = r.b - r.a;
  if (!(span > 0)) span = max;
  span = Math.min(Math.max(span, MIN_SPAN_SEC), max);
  let a = r.a;
  if (a + span > max) a = max - span;
  if (a < 0) a = 0;
  return {a, b: a + span};
}

/**
 * 한 점을 고정한 채 확대/축소한다(핀치의 두 손가락 중점, 휠의 커서 위치).
 *
 * 고정점이 없으면 확대할 때마다 화면이 중앙으로 튀어 "내가 보던 곳"을 잃는다.
 */
export function zoomAt(r: Range, factor: number, anchor: number, total: number): Range {
  const span = (r.b - r.a) * factor;
  const f = (r.b - r.a) > 0 ? (anchor - r.a) / (r.b - r.a) : 0.5;
  const a = anchor - f * span;
  return clampRange({a, b: a + span}, total);
}

/** 화면 x(0~1) → 시각(초). */
export function timeAt(r: Range, frac: number): number {
  const f = frac < 0 ? 0 : frac > 1 ? 1 : frac;
  return r.a + (r.b - r.a) * f;
}

/** 그 시각에 가장 가까운 점(스크럽 판독용). 없으면 null. */
export function pointAt(points: readonly TimePoint[], t: number): TimePoint | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = Math.abs(best.t - t);
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i].t - t);
    if (d < bestD) {
      bestD = d;
      best = points[i];
    }
  }
  return best;
}

/**
 * 심박 존별 체류 시간(초) — **보이는 구간만**으로 센다.
 *
 * 이 함수가 “확대하면 요약이 따라 움직인다”의 전부다. 표본 사이 간격을 시간으로 쳐서
 * 더하므로, 표본이 성길 때도(3초 간격 등) 총합이 실제 구간 길이에 가깝게 나온다.
 * `range` 를 주면 **그 구간과 겹치는 만큼만** 센다(확대 시 필수 — 아래 주석 참조).
 * 마지막 점은 다음 점이 없어 폭을 모르므로 세지 않는다(과대계상 방지).
 */
export function zoneSeconds(
  points: readonly TimePoint[],
  zoneOf: (bpm: number) => number,
  range?: Range,
): Record<number, number> {
  const out: Record<number, number> = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
  if (points.length < 2) return out;
  for (let i = 0; i < points.length - 1; i++) {
    let a = points[i].t;
    let b = points[i + 1].t;
    if (range) {
      // **구간과 겹치는 만큼만** 센다. 곡선을 그릴 땐 경계 바깥 점을 한 개씩 끌어오는데
      // (slice), 그 점을 그대로 요약에 쓰면 화면 밖 시간이 섞인다 — 확대해도 숫자가
      // 안 변하거나 엉뚱하게 나오는 원인이 된다.
      if (a < range.a) a = range.a;
      if (b > range.b) b = range.b;
    }
    const dt = b - a;
    if (!(dt > 0)) continue;
    const z = zoneOf(points[i].v);
    if (out[z] == null) continue;
    out[z] += dt;
  }
  return out;
}

/**
 * 가장 힘들었던 구간(평균이 가장 높은 `winSec` 창)을 찾는다.
 *
 * 사용자가 탐색법을 배우지 않아도 **가장 볼 만한 곳**에 데려다 놓기 위한 것이다.
 * 러닝이 창보다 짧으면 null — 없는 구간을 지어내지 않는다.
 */
export function hardestWindow(
  points: readonly TimePoint[],
  winSec = 120,
): {a: number; b: number; avg: number} | null {
  if (points.length < 2) return null;
  const total = points[points.length - 1].t - points[0].t;
  if (total < winSec) return null;
  let best: {a: number; b: number; avg: number} | null = null;
  let j = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i].t;
    const b = a + winSec;
    if (b > points[points.length - 1].t) break;
    // j 를 창 밖으로 밀며 합을 유지(양방향 슬라이딩).
    while (j < points.length && points[j].t <= b) {
      sum += points[j].v;
      n++;
      j++;
    }
    if (n > 0) {
      const avg = sum / n;
      if (!best || avg > best.avg) best = {a, b, avg};
    }
    // 왼쪽 경계를 한 칸 줄인다.
    sum -= points[i].v;
    n--;
  }
  return best;
}
