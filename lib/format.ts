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
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Pace as `m'ss"` for a given distance (km) and time (s).
 * Guards meaningless distances (< 0.01 km) with '--' so we never show a fake
 * pace derived from near-zero distance.
 */
export function fmtPace(km: number, s: number): string {
  if (km < 0.01) return '--';
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
