// ─── 신발 휴식 로테이션 추천 · 착용 타임라인 · km당 비용 (순수함수) ───────────────
// 모두 기존 데이터(신발 목록 + 런 기록)에서 파생된다. 새 상태/필드를 만들지 않고
// runs 로부터 "마지막 착용일"을 계산하므로 데이터 파괴 위험이 없다(iron law).
//
// 날짜는 'YYYY-MM-DD' 문자열을 직접 비교한다. ISO 날짜는 사전식 비교가 곧 시간순
// 비교이므로(예: '2026-05-31' < '2026-06-01') Date 파싱/타임존 모킹이 불필요하다.
// 경과 일수(restDays)만 로컬 자정 Date 차로 계산한다(goals.ts와 동일 규약).

import {isRetired, ShoeLike} from './shoe';

export type RunWithDate = {
  shoe_id?: string | number;
  run_date?: string;
};

/** 'YYYY-MM-DD[...]'의 날짜 부분만 떼어 로컬 자정 Date로 변환(DST 안전). */
function localMidnight(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 한 신발의 마지막 착용일('YYYY-MM-DD'). 해당 shoe_id로 기록된 런이 없으면 null.
 * 다른 신발의 런은 무시하므로 전체 런 목록을 그대로 넘겨도 안전하다.
 */
export function lastWornDate(
  shoeId: string | number | undefined,
  runs: RunWithDate[] = [],
): string | null {
  let latest: string | null = null;
  for (const r of runs || []) {
    if (!r || r.shoe_id !== shoeId) continue;
    const d = r.run_date ? String(r.run_date).slice(0, 10) : '';
    if (!d) continue;
    if (latest === null || d > latest) latest = d;
  }
  return latest;
}

/**
 * 마지막 착용일이 더 이른(=더 오래 쉰) 쪽이 true. 한 번도 안 신은 신발(null)은
 * 가장 오래 쉰 것으로 간주해 최우선. 동률이면 false를 반환해 입력 순서를 보존한다.
 */
function moreRested(a: string | null, b: string | null): boolean {
  if (a === b) return false;
  if (a === null) return true; // a: 미착용 → 더 오래 쉼
  if (b === null) return false; // b: 미착용 → b가 우선
  return a < b; // 더 이른 날짜가 더 오래 쉼
}

/**
 * '오늘은 이 신발' 휴식 로테이션 추천. 활성(보관 안 된) 신발 중 가장 오래 쉰
 * (마지막 착용일이 가장 이른) 신발의 id를 돌려준다. 한 번도 안 신은 신발이 최우선,
 * 동률이면 먼저 등록된(입력 순서) 신발. 활성 신발이 없으면 null.
 *
 * 신발을 번갈아 신어 한 켤레에 부하가 몰리지 않게 해 수명을 늘리는 게 목적이다.
 */
export function recommendShoeId(
  shoes: (ShoeLike & {id?: string | number})[] = [],
  runs: RunWithDate[] = [],
): string | number | null {
  const active = (shoes || []).filter((s) => s && !isRetired(s));
  if (!active.length) return null;
  let best = active[0];
  let bestWorn = lastWornDate(best.id, runs);
  for (let i = 1; i < active.length; i++) {
    const worn = lastWornDate(active[i].id, runs);
    if (moreRested(worn, bestWorn)) {
      best = active[i];
      bestWorn = worn;
    }
  }
  return best.id ?? null;
}

/**
 * 마지막 착용일이 더 늦은(=더 최근에 신은) 쪽이 true. 한 번도 안 신은 신발(null)은
 * 가장 오래된 것으로 간주(=최근 아님). 동률이면 false를 반환해 입력 순서를 보존한다.
 */
function moreRecent(a: string | null, b: string | null): boolean {
  if (a === b) return false;
  if (a === null) return false; // a: 미착용 → 최근 아님
  if (b === null) return true; // b: 미착용 → a가 더 최근
  return a > b; // 더 늦은 날짜가 더 최근
}

/**
 * '오늘 기본 히어로' 선택. 활성(보관 안 된) 신발 중 가장 최근에 신은(마지막 착용일이
 * 가장 늦은) 신발의 id를 돌려준다. 동률이거나 전부 미착용이면 먼저 등록된(입력 순서)
 * 신발. 활성 신발이 없으면 null.
 *
 * 사용자가 손이 가는(최근 신는) 신발을 홈에서 바로 보게 해 찾는 수고를 던다.
 * (이전의 '가장 오래 쉰 신발' 로테이션 추천과는 반대 기준 — recommendShoeId 참고.)
 */
export function mostRecentShoeId(
  shoes: (ShoeLike & {id?: string | number})[] = [],
  runs: RunWithDate[] = [],
): string | number | null {
  const active = (shoes || []).filter((s) => s && !isRetired(s));
  if (!active.length) return null;
  let best = active[0];
  let bestWorn = lastWornDate(best.id, runs);
  for (let i = 1; i < active.length; i++) {
    const worn = lastWornDate(active[i].id, runs);
    if (moreRecent(worn, bestWorn)) {
      best = active[i];
      bestWorn = worn;
    }
  }
  return best.id ?? null;
}

/**
 * 마지막 착용 이후 쉰 일수(오늘 기준). 한 번도 안 신었으면 null.
 * 미래 날짜(데이터 이상)는 0으로 하한 처리한다.
 */
export function restDays(
  shoeId: string | number | undefined,
  runs: RunWithDate[],
  todayISO: string,
): number | null {
  const worn = lastWornDate(shoeId, runs);
  if (worn === null) return null;
  const ms = localMidnight(todayISO).getTime() - localMidnight(worn).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * km당 비용(구매가 / 누적 거리). 구매가나 거리가 0 이하/비정상이면 null
 * (의미 없는 0 나눗셈·무한대 표시 금지). 통화 단위는 호출부가 정한다(저장 표준 원).
 */
export function costPerKm(price: number, usedKm: number): number | null {
  if (!(price > 0) || !(usedKm > 0)) return null;
  return price / usedKm;
}
