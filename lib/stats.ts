// ─── Run aggregation / stats ─────────────────────────────────────
// Pure aggregation extracted from App.tsx.
//
// audit#11: week/month/year bucketing classifies runs by LOCAL calendar date
// (via `ymdLocal` and local Date components) so a late-night run lands in the
// day the runner actually ran it, not a UTC-shifted neighbor.

import {fmtPace, ymdLocal} from './format';

/** Structural mirror of HistoryScreen's PeriodSummary (km/runs/pace/time). */
export interface PeriodSummary {
  km: string;
  runs: number;
  pace: string;
  time: string;
}

/** Sum of `km` (parsed) over a run list. */
export function sumKm(list: any[]): number {
  return list.reduce((a, r) => a + (parseFloat(r.km) || 0), 0);
}

/** Average pace label across runs with usable duration & distance, else '--'. */
export function avgPaceLabel(list: any[]): string {
  const p = list.filter(r => (r.duration || 0) > 0 && parseFloat(r.km) > 0.1);
  if (!p.length) return '--';
  const sec = p.reduce((a, r) => a + r.duration / parseFloat(r.km), 0) / p.length;
  return fmtPace(1, sec);
}

/** Format a duration in seconds as "Hh Mm" / "Mm", or '--' when not positive.
 *  Shared by totalTimeLabel (client-derived) and the server-truth `run_time`
 *  path (audit#9/#10) so both render identically. */
export function durationLabel(seconds: number): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return '--';
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Total moving time as "Hh Mm" / "Mm", or '--' when zero. */
export function totalTimeLabel(list: any[]): string {
  return durationLabel(list.reduce((a, r) => a + (r.duration || 0), 0));
}

/** Period summary (distance/count/pace/time) for a run list. */
export function summaryOf(list: any[]): PeriodSummary {
  return {
    km: sumKm(list).toFixed(1),
    runs: list.length,
    pace: avgPaceLabel(list),
    time: totalTimeLabel(list),
  };
}

/** Longest run of consecutive calendar days present in `dates` (YYYY-MM-DD). */
export function maxDayStreak(dates: string[]): number {
  const uniq = [...new Set(dates)].sort();
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
export function weekBuckets(runs: any[], monday: Date): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(sumKm(runs.filter(r => r.run_date === ymdLocal(d))));
  }
  return out;
}

/**
 * Weekly-bucketed distance (km) within a month. Bucket count = ceil(days/7).
 * Day-of-month is read from local Date components. Returns raw sums.
 */
export function monthBuckets(monthRuns: any[], year: number, monthIndex: number): number[] {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weekCount = Math.ceil(daysInMonth / 7);
  const out: number[] = Array(weekCount).fill(0);
  monthRuns.forEach(r => {
    const day = new Date(r.run_date + 'T00:00:00').getDate();
    const b = Math.min(weekCount - 1, Math.ceil(day / 7) - 1);
    out[b] += parseFloat(r.km) || 0;
  });
  return out;
}

/** Monthly-bucketed distance (km) for a year (Jan..Dec). Returns raw sums. */
export function yearBuckets(yearRuns: any[]): number[] {
  const out: number[] = Array(12).fill(0);
  yearRuns.forEach(r => {
    const m = new Date(r.run_date + 'T00:00:00').getMonth();
    out[m] += parseFloat(r.km) || 0;
  });
  return out;
}
