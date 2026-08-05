// ─── Run aggregation / stats ─────────────────────────────────────
// Pure aggregation extracted from App.tsx.
//
// audit#11: week/month/year bucketing classifies runs by LOCAL calendar date
// (via `ymdLocal` and local Date components) so a late-night run lands in the
// day the runner actually ran it, not a UTC-shifted neighbor.

import {fmtPace, ymdLocal, fmtTime} from './format';

/** Structural mirror of HistoryScreen's PeriodSummary (km/runs/pace/time). */
export interface PeriodSummary {
  km: string;
  runs: number;
  pace: string;
  time: string;
}

/**
 * 집계가 실제로 읽는 런 행의 최소 형태. 백엔드는 km 을 문자열로도 숫자로도 보내므로
 * `string | number`. 세 필드 모두 선택(?)으로 둔다 — BackendRun(서버 truth) · RecapRun ·
 * pending 오버레이 등 호출부마다 채워진 필드가 달라, 이 인터페이스를 좁은 교집합으로
 * 유지해야 모두 그대로 넘길 수 있다(타입만 좁히고 런타임 방어 로직은 불변).
 * 집계 함수들은 이미 누락 필드를 방어(`parseFloat(km)||0`, `duration||0`)하므로
 * 선택 필드가 동작을 바꾸지 않는다. 필드명 오타는 이 형태로 컴파일에러로 잡힌다.
 */
export interface RunRow {
  km?: string | number;
  duration?: number;
  run_date?: string;
}

/** 비배열 입력(손상/스칼라 백엔드 응답 등)을 빈 배열로 정규화 — 집계 함수 크래시 방지. */
function asList<T>(list: T[]): T[] {
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

/** Sum of `km` (parsed) over a run list. */
export function sumKm(list: RunRow[]): number {
  return asList(list).reduce((a, r) => a + (parseFloat(r.km as string) || 0), 0);
}

/** Average pace label across runs with usable duration & distance, else '--'. */
export function avgPaceLabel(list: RunRow[]): string {
  const p = asList(list).filter(r => (r.duration || 0) > 0 && parseFloat(r.km as string) > 0.1);
  if (!p.length) return '--';
  // 기간 평균 페이스 = Σ시간 / Σ거리(거리 가중). 런별 페이스를 런 개수로 나눈 산술평균은
  // 짧은 런을 과대 가중해 값이 틀린다(예: 1km@7'00" + 20km@5'00" → 6'00"(오답)·정답 5'06").
  const totalSec = p.reduce((a, r) => a + r.duration!, 0);
  const totalKm = p.reduce((a, r) => a + parseFloat(r.km as string), 0);
  return fmtPace(totalKm, totalSec);
}

/** Format a duration in seconds as "Hh Mm" / "Mm", or '--' when not positive.
 *  Shared by totalTimeLabel (client-derived) and the server-truth `run_time`
 *  path (audit#9/#10) so both render identically. */
export function durationLabel(seconds: number): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return '--';
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  // 한국어 화면에 영문 h/m 이 노출되던 것 교정('9m' → '9분', 2026-07-05 캡처 감사).
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/**
 * 지속 시간을 **숫자/단위 조각**으로 쪼갠다 — `[{n:'1',u:'시간'},{n:'47',u:'분'}]`.
 *
 * 왜 필요한가: 지표 격자의 칸은 전부 `숫자(큰 글자) + 단위(작은 글자)` 꼴인데
 * (`21`+`km`, `12`+`회`), 러닝 시간만 "1시간 47분" 한 덩어리를 **전부 큰 글자로** 넣고
 * 있었다. 그래서 이 칸만 혼자 넓어졌고, 360dp 폰(갤럭시 S10e)에서 칸 폭(≈98dp)을 넘겨
 * 두 줄로 떨어졌다. 줄바꿈이 첫 줄 높이를 밀어 3×2 격자 전체가 어긋났다.
 *
 * 단위를 작은 글자로 내리면 같은 정보가 약 4분의 3 폭에 들어간다 — 글자를 줄이거나
 * 정보를 버리지 않고, 다른 칸들이 이미 쓰던 규칙을 그대로 적용하는 것뿐이다.
 *
 * 0 이하·비정상 입력은 빈 배열을 준다(호출부가 '--' 를 그대로 쓰게).
 */
export function durationParts(seconds: number): Array<{n: string; u: string}> {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return [];
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return [{n: String(h), u: '시간'}, {n: String(m), u: '분'}];
  return [{n: String(m), u: '분'}];
}

/** 총 이동 시간 'H시간 M분' / 'M분', 0이면 '--'. */
export function totalTimeLabel(list: RunRow[]): string {
  return durationLabel(asList(list).reduce((a, r) => a + (r.duration || 0), 0));
}

/** Period summary (distance/count/pace/time) for a run list. */
export function summaryOf(list: RunRow[]): PeriodSummary {
  const l = asList(list);
  return {
    km: sumKm(l).toFixed(1),
    runs: l.length,
    pace: avgPaceLabel(l),
    // 요약 '총 시간'도 러닝기록 행과 같은 시계 표기(mm:ss·H:MM:SS)로 통일 — '18분' 대신 '18:00'
    // (사용자 요청 2026-07-06). 0초(빈 기간)는 '--'.
    time: (() => {
      const sec = l.reduce((a, r) => a + (Number(r.duration) || 0), 0);
      return sec > 0 ? fmtTime(sec) : '--';
    })(),
  };
}

/** Longest run of consecutive calendar days present in `dates` (YYYY-MM-DD). */
export function maxDayStreak(dates: string[]): number {
  const uniq = [...new Set(asList(dates))].sort();
  let best = 0,
    cur = 0;
  let prev: Date | null = null;
  for (const ds of uniq) {
    const d = new Date(ds + 'T00:00:00');
    if (prev) {
      const diff = Math.round((d.getTime() - prev.getTime()) / 86400000);
      cur = diff === 1 ? cur + 1 : 1;
    } else cur = 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

/**
 * Daily distance (km) for the 7 days starting at `monday` (Mon..Sun).
 * Returns raw sums; callers round for display.
 */
export function weekBuckets(runs: RunRow[], monday: Date): number[] {
  const safe = asList(runs);
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    // run_date 를 10자(YYYY-MM-DD)로 정규화해 비교한다(month/year 버킷과 동일 규약).
    // 백엔드/Firestore 가 시간 접미사('...T09:00:00')를 실으면 정확 === 매칭이 실패해
    // 그 런이 주간 분포·주간 합계에서 통째로 누락됐다(월/년 뷰엔 보임 — 내부 불일치).
    const target = ymdLocal(d);
    out.push(sumKm(safe.filter(r => String(r.run_date).slice(0, 10) === target)));
  }
  return out;
}

/**
 * Weekly-bucketed distance (km) within a month. Bucket count = ceil(days/7).
 * Day-of-month is read from local Date components. Returns raw sums.
 */
export function monthBuckets(monthRuns: RunRow[], year: number, monthIndex: number): number[] {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weekCount = Math.ceil(daysInMonth / 7);
  const out: number[] = Array(weekCount).fill(0);
  asList(monthRuns).forEach(r => {
    if (!r.run_date) return;               // run_date 결측 시 NaN 버킷으로 새어 거리 소실 방지
    const day = new Date(String(r.run_date).slice(0, 10) + 'T00:00:00').getDate();
    if (!Number.isFinite(day)) return;
    const b = Math.min(weekCount - 1, Math.ceil(day / 7) - 1);
    out[b] += parseFloat(r.km as string) || 0;
  });
  return out;
}

/** Monthly-bucketed distance (km) for a year (Jan..Dec). Returns raw sums. */
export function yearBuckets(yearRuns: RunRow[]): number[] {
  const out: number[] = Array(12).fill(0);
  asList(yearRuns).forEach(r => {
    if (!r.run_date) return;               // run_date 결측 시 NaN 버킷으로 새어 거리 소실 방지
    const m = new Date(String(r.run_date).slice(0, 10) + 'T00:00:00').getMonth();
    if (!Number.isFinite(m)) return;
    out[m] += parseFloat(r.km as string) || 0;
  });
  return out;
}
