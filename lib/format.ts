// ─── Formatting & date helpers ───────────────────────────────────
// Pure formatting extracted from App.tsx.
//
// audit#11 fix: `ymdLocal` derives the calendar date from LOCAL time
// components instead of `Date#toISOString()` (which is UTC). The old UTC-based
// `ymd`/`today` mislabeled late-night / early-morning runs (e.g. a 01:00 KST
// run was bucketed into the previous UTC day). Callers now use local dates so
// week/month/year stats classify runs by the day the runner experienced.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** Elapsed seconds → "H:MM:SS" (with hours) or "MM:SS". */
export function fmtTime(s: number): string {
  // 비유한/음수 입력은 0초로 정규화(NaN:NaN 같은 깨진 표기 방지).
  const t = Number.isFinite(s) && s > 0 ? Math.floor(s) : 0;
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    sec = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Pace as `m'ss"` for a given distance (km) and time (s).
 * Guards meaningless distances (< 0.01 km) with '--' so we never show a fake
 * pace derived from near-zero distance.
 */
export function fmtPace(km: number, s: number): string {
  // 의미 없는 거리(<0.01km)·비유한·0 이하 시간은 가짜 페이스 대신 '--'.
  if (!Number.isFinite(km) || km < 0.01 || !Number.isFinite(s) || s <= 0) return '--';
  const p = s / km;
  return `${Math.floor(p / 60)}'${String(Math.round(p % 60)).padStart(2, '0')}"`;
}

/** Local calendar date as `YYYY-MM-DD` (audit#11: local, not UTC). */
export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Local calendar month as `YYYY-MM` (audit#11: local, not UTC).
 * Derived from `ymdLocal` so the two stay byte-identical on their shared prefix
 * — month bucketing can never desync from the day bucketing it slices.
 */
export function ymLocal(d: Date): string {
  return ymdLocal(d).slice(0, 7);
}

/** Monday (00:00 local) of the week containing `d`. Sunday rolls back 6 days. */
export function getMonday(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Korean run-card date parts from an ISO `YYYY-MM-DD` string. */
export function fmtKDate(iso: string): {date: string; day: string; dateNum: string} {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return {date: iso, day: '', dateNum: ''};
  return {
    date: `${d.getMonth() + 1}월 ${d.getDate()}일`,
    day: DOW[d.getDay()],
    dateNum: String(d.getDate()),
  };
}
