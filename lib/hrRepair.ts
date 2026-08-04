// ============================================================================
// lib/hrRepair.ts — 지난 러닝의 심박 소급 복구 (일회성 스윕)
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-04): 애플 건강 연동을 켜기 전에 달린 러닝들은 심박이 비어 있다.
// 민우님 실제 데이터가 그랬다 — **36건 중 심박이 있는 건 1건**이었고, 워치를 차고
// 달린 런(source: watch)도 전부 0 이었다. 연동이 꺼져 있으면 앱이 HealthKit 을 읽을
// 수 없기 때문이고, 앱은 그 사실을 어디서도 말하지 않았다.
//
// 기존 백필(lib/hrBackfill)은 **12시간 안의 런**만 대상으로 한다(방금 저장한 런이
// 워치→폰 HK 동기화를 기다리는 상황용). 연동을 뒤늦게 켠 사용자의 과거 기록은
// 그 대기열에 애초에 등록된 적이 없어 영영 복구되지 않는다. 이 모듈이 그 구멍을 메운다.
//
// ── 설계 원칙 ────────────────────────────────────────────────────────────────
//  · **없는 값을 지어내지 않는다.** HealthKit 에 그 시간대 심박이 실제로 있을 때만 채운다.
//    워크아웃을 못 찾거나 표본이 없으면 그 런은 그냥 건너뛴다(Truth only).
//  · **이미 있는 값은 건드리지 않는다.** 심박이 있는 런은 후보에서 빠진다.
//  · **한 번만 돈다.** 완료 표시를 남겨 매 부팅마다 HealthKit 을 훑지 않는다.
//  · **실패해도 조용하다.** 복구는 부가 기능이라 앱 흐름을 막지 않는다(throw 금지).
//
// 순수 로직(후보 선정)과 I/O(HealthKit 조회)를 분리해 후보 선정은 테스트 가능하게 뒀다.
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

/** 스윕 완료 표시 — 한 번 돌면 다시 돌지 않는다. */
export const HR_REPAIR_DONE_KEY = 'hr_repair_done_v1';

/**
 * 한 번의 스윕에서 시도할 최대 런 수. HealthKit 조회는 런당 워크아웃 검색 + 심박 조회라
 * 비용이 있다 — 오래된 기록까지 무한정 훑지 않는다.
 */
export const MAX_REPAIR_RUNS = 60;

/**
 * 소급 복구 대상 기간(일). 이보다 오래된 기록은 HealthKit 에도 남아 있을 가능성이 낮고,
 * 있더라도 그때의 체력 추정에 쓰이지 않는다(체력 창은 90일).
 */
export const REPAIR_WINDOW_DAYS = 180;

/** 복구 후보 판정에 필요한 최소 런 정보. */
export interface RepairCandidate {
  id: string;
  runDate: string;   // 'YYYY-MM-DD'
  durationS: number;
  /** 현재 저장된 평균 심박(0/없음이면 복구 대상). */
  heartRate?: number | null;
}

/**
 * 복구할 런을 고른다 — **순수 함수**.
 *
 * 제외 대상:
 *  · 이미 심박이 있는 런(덮어쓰지 않는다)
 *  · 날짜·시간이 없어 HealthKit 에서 찾을 수 없는 런
 *  · 너무 짧은 런(1분 미만 — 워크아웃 매칭이 무의미하다)
 *  · 창 밖(오래된) 런
 *
 * 최신순으로 돌려준다 — 최근 기록일수록 HealthKit 에 남아 있을 확률이 높고,
 * 체력 추정에도 먼저 쓰인다.
 */
export function pickRepairCandidates(
  runs: readonly RepairCandidate[],
  todayISO: string,
  opts?: {windowDays?: number; max?: number},
): RepairCandidate[] {
  const windowDays = opts?.windowDays ?? REPAIR_WINDOW_DAYS;
  const max = opts?.max ?? MAX_REPAIR_RUNS;
  const t = Date.parse(`${todayISO}T00:00:00Z`);
  const cutoff = Number.isFinite(t)
    ? new Date(t - windowDays * 86400000).toISOString().slice(0, 10)
    : '';

  return (Array.isArray(runs) ? runs : [])
    .filter(r => {
      if (!r || !r.id) return false;
      if ((Number(r.heartRate) || 0) > 0) return false;          // 이미 있다
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.runDate))) return false; // 날짜 불명
      if (!(Number(r.durationS) > 60)) return false;             // 너무 짧다
      if (cutoff && r.runDate < cutoff) return false;            // 창 밖
      return true;
    })
    .sort((a, b) => (a.runDate < b.runDate ? 1 : a.runDate > b.runDate ? -1 : 0))
    .slice(0, max);
}

/** 스윕이 이미 끝났는가. 저장소 오류는 '끝났다'로 본다(재시도 폭주 방지). */
export async function hrRepairDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HR_REPAIR_DONE_KEY)) === '1';
  } catch {
    return true;
  }
}

/** 스윕 완료 표시. 실패는 삼킨다(다음 부팅에 한 번 더 도는 것뿐이다). */
export async function markHrRepairDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(HR_REPAIR_DONE_KEY, '1');
  } catch {
    /* noop */
  }
}

/** 복구 결과 — 화면이 "N건 채웠어요"를 말할 수 있게 한다. */
export interface HrRepairResult {
  /** 실제로 심박을 채운 런 수. */
  repaired: number;
  /** 시도한 런 수. */
  attempted: number;
}

/** 이 모듈이 필요로 하는 HealthKit 능력(주입 가능 — 테스트가 실 네이티브 없이 돈다). */
export interface HrRepairPort {
  /** 날짜·소요시간으로 워치 워크아웃의 시간창을 찾는다. 없으면 null. */
  findWindow(dateISO: string, durationS: number): Promise<{startMs: number; endMs: number} | null>;
  /** 그 시간창의 심박을 읽어 저장한다. 채운 표본 수를 돌려준다(0이면 없음). */
  backfill(runId: string, startMs: number, endMs: number): Promise<number>;
}

/**
 * 지난 러닝의 심박을 소급 복구한다.
 *
 * 각 후보마다: 워크아웃 시간창을 찾고 → 그 창의 심박을 읽어 채운다.
 * **찾지 못하면 건너뛴다** — 시간창을 추측해서 남의 심박을 끌어오면 안 된다
 * (run_time 이 없는 런이 많아, 날짜만으로 창을 만들면 그날의 다른 활동이 섞인다).
 *
 * 전 과정 no-throw. 하나가 실패해도 나머지는 계속한다.
 */
export async function repairHeartRates(
  port: HrRepairPort,
  candidates: readonly RepairCandidate[],
): Promise<HrRepairResult> {
  let repaired = 0;
  let attempted = 0;
  for (const r of candidates || []) {
    if (!r?.id) continue;
    attempted += 1;
    try {
      const win = await port.findWindow(r.runDate, Number(r.durationS) || 0);
      if (!win || !(win.startMs < win.endMs)) continue; // 워크아웃 없음 — 지어내지 않는다
      const n = await port.backfill(r.id, win.startMs, win.endMs);
      if (n > 0) repaired += 1;
    } catch {
      /* 이 런은 건너뛴다 — 복구는 부가 기능이고 앱 흐름을 막지 않는다 */
    }
  }
  return {repaired, attempted};
}
