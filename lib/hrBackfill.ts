// lib/hrBackfill.ts — 러닝 심박(hrTrack) 지연 보강. 폰이 주머니에 있어(화면 꺼짐) 실시간
// WCSession 스트림을 놓쳐도 심박이 100% 기록되게 하는 안전망 두 갈래를 한 곳에서 관리한다:
//   A) 워치 직송(정본): 워치가 러닝 끝에 심박 기록 전체를 transferUserInfo(배달 보장)로
//      폰에 보낸다 → '시간창'으로 폰 런과 매칭해 hrTrack 저장. HealthKit 동기화 타이밍과
//      무관하고, 폰이 내내 주머니에 있어도 앱이 깨는 순간 배달돼 채워진다.
//   B) HealthKit 백필 재시도: 저장 순간엔 워치→폰 HK 동기화가 덜 됐을 수 있으므로,
//      앱 복귀·지연 시점에 다시 읽어 채운다(워치 직송이 실패/구버전일 때의 폴백).
//
// 둘 다 목표는 hrTrack_<runId> 채우기. 이미 채워졌으면(라이브 캡처·한쪽이 먼저) 건너뛴다.
// 미완료 런은 '대기 레지스트리'(pending)에 담아두고 재시도/매칭 대상으로 삼는다.

import AsyncStorage from '@react-native-async-storage/async-storage';

const K_PENDING = 'hr_backfill_pending_v1';
/** 12시간이 지나도록 못 채웠으면 포기(HK 동기화는 늦어도 그 안에 끝난다). */
export const HR_PENDING_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 20;
/** 유효 심박 범위(명백한 노이즈 컷 — RunDetail·healthkit 백필과 동일 계약). */
const MIN_BPM = 30;
const MAX_BPM = 240;

export type PendingHr = {
  /** 폰 런 id(hrTrack_<runId> 키). */
  runId: string;
  /** 폰 런 시간창(ms) — 워치 직송/HK 백필의 매칭·조회 범위. */
  startMs: number;
  endMs: number;
  /** 등록 시각(ms) — 만료 판정. */
  addedMs: number;
};

/** hrTrack_<runId> 시계열 한 점(초 오프셋 + bpm). RunDetail/리캡 계약과 동일 형태. */
export type HrPoint = {t: number; bpm: number};

export async function loadPending(): Promise<PendingHr[]> {
  try {
    const raw = await AsyncStorage.getItem(K_PENDING);
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a.filter(e => e && typeof e.runId === 'string') : [];
  } catch {
    return [];
  }
}

async function savePending(list: PendingHr[]): Promise<void> {
  try {
    await AsyncStorage.setItem(K_PENDING, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    /* 비치명적 — 다음 등록/재시도에서 재시도 */
  }
}

/** hrTrack_<runId> 가 이미 있으면 true(라이브 캡처·이전 보강으로 채워진 상태). */
export async function hasHrTrack(runId: string): Promise<boolean> {
  try {
    return !!(await AsyncStorage.getItem('hrTrack_' + runId));
  } catch {
    return false;
  }
}

/** 러닝 저장 시 호출 — 심박 보강 대기 목록에 런 시간창을 등록한다(중복은 무시). */
export async function registerRunForHr(
  runId: string,
  startMs: number,
  endMs: number,
  nowMs: number,
): Promise<void> {
  if (!runId || !(startMs < endMs)) return;
  const list = await loadPending();
  if (list.some(e => e.runId === runId)) return;
  list.push({runId, startMs, endMs, addedMs: nowMs});
  await savePending(list);
}

/** 두 시간창의 겹침(ms). 음수면 0. */
function overlapMs(aS: number, aE: number, bS: number, bE: number): number {
  return Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));
}

/**
 * (A) 워치가 보낸 심박 기록을 시간창으로 폰 런과 매칭해 저장한다.
 * 워치 런 창[wStart,wEnd] 과 가장 많이 겹치는 대기 런(겹침이 폰 런 길이의 50%↑)을 골라
 * 그 런의 hrTrack 을 채운다(이미 있으면 건너뜀). 절대 타임스탬프(ts=wStart+offsetS*1000)를
 * 폰 런 시작 기준 상대 초로 환산한다. 매칭·저장에 성공하면 그 런 id, 아니면 null.
 * samplesOffsetS/samplesBpm 는 워치 시작 기준 초 오프셋·bpm 병렬 배열.
 */
export async function saveWatchHrTrack(
  wStart: number,
  wEnd: number,
  samplesOffsetS: number[],
  samplesBpm: number[],
  nowMs: number,
): Promise<string | null> {
  if (!(wStart < wEnd) || !Array.isArray(samplesOffsetS) || !Array.isArray(samplesBpm)) return null;
  const list = await loadPending();
  // 만료 안 된 런 중, 워치 창과 겹치는 최적 매칭(겹침이 폰 런의 절반 이상).
  let best: PendingHr | null = null;
  let bestOv = 0;
  for (const e of list) {
    if (nowMs - e.addedMs > HR_PENDING_MAX_AGE_MS) continue;
    const ov = overlapMs(wStart, wEnd, e.startMs, e.endMs);
    const runLen = Math.max(1, e.endMs - e.startMs);
    if (ov >= runLen * 0.5 && ov > bestOv) {
      best = e;
      bestOv = ov;
    }
  }
  if (!best) return null;
  const track = buildHrTrack(best.startMs, wStart, samplesOffsetS, samplesBpm, best.endMs);
  if (track.length < 2) return null; // 표시 가치 없음 — 대기 유지(다음 기회/HK 폴백)
  // 기존 트랙과 비교 — 워치 직송이 더 촘촘하면(센서 실측·완전) 덮어쓴다. 스트레이 1~2점
  // HealthKit 백필이 먼저 만든 빈약한 트랙(예: 배경 안정심박 몇 점 → 평평한 가짜 직선)을
  // 완전한 워치 기록으로 교정한다. 기존이 더 촘촘하면(라이브 풀 캡처) 실측 우선으로 보존.
  try {
    const existingRaw = await AsyncStorage.getItem('hrTrack_' + best.runId);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw);
      if (Array.isArray(existing) && existing.length >= track.length) {
        await savePending(list.filter(e => e.runId !== best!.runId));
        return best.runId; // 기존이 더 촘촘 — 보존, 대기만 제거
      }
    }
  } catch {
    /* 파싱 실패 → 워치 트랙으로 덮어쓴다(더 나쁠 게 없다) */
  }
  try {
    await AsyncStorage.setItem('hrTrack_' + best.runId, JSON.stringify(track));
  } catch {
    return null;
  }
  await savePending(list.filter(e => e.runId !== best!.runId));
  return best.runId;
}

/**
 * 워치 절대 타임스탬프(wStart + offsetS*1000)를 폰 런 시작(runStartMs) 기준 상대 초로
 * 환산해 hrTrack 점 배열을 만든다. 음수 t·노이즈 bpm 은 버리고, t 오름차순 정렬.
 *
 * runEndMs(선택): 폰 런 종료 절대시각. 주어지면 그 이후(런 밖)의 표본을 버린다.
 * 워치 워크아웃이 폰 런보다 길게 기록되면(사용자가 워치를 늦게 멈춤/쿨다운 중 계속 측정)
 * 회복기 고심박이 평균·최대·존 시간에 유입돼 과대 표시된다 — 상한 클램프로 차단한다
 * (하한 t<0 은 이미 버림). 결측이면(구 호출부·라이브) 상한 없이 기존 동작 유지.
 */
export function buildHrTrack(
  runStartMs: number,
  wStart: number,
  samplesOffsetS: number[],
  samplesBpm: number[],
  runEndMs?: number,
): HrPoint[] {
  const n = Math.min(samplesOffsetS.length, samplesBpm.length);
  const maxT =
    Number.isFinite(runEndMs) && (runEndMs as number) > runStartMs
      ? Math.round(((runEndMs as number) - runStartMs) / 1000)
      : Infinity;
  const out: HrPoint[] = [];
  for (let i = 0; i < n; i++) {
    const bpm = Math.round(Number(samplesBpm[i]) || 0);
    if (!(bpm > MIN_BPM && bpm < MAX_BPM)) continue;
    const absMs = wStart + (Number(samplesOffsetS[i]) || 0) * 1000;
    const t = Math.round((absMs - runStartMs) / 1000);
    if (t < 0 || t > maxT) continue; // 런 밖(시작 전/종료 후) 표본 제외
    out.push({t, bpm});
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * (B) 대기 런들의 HealthKit 백필 재시도. 각 런에 대해: 이미 hrTrack 있으면 완료(제거),
 * 만료면 포기(제거), 아니면 hkBackfill 시도 — 채웠으면 제거, 아직이면 유지(다음 기회).
 * hkBackfill: (runId,startMs,endMs)=>Promise<채운 표본수>(0=못 채움).
 */
export async function retryPendingHr(
  nowMs: number,
  hkBackfill: (runId: string, startMs: number, endMs: number) => Promise<number>,
): Promise<void> {
  const list = await loadPending();
  if (!list.length) return;
  const keep: PendingHr[] = [];
  for (const e of list) {
    if (nowMs - e.addedMs > HR_PENDING_MAX_AGE_MS) continue; // 만료 — 포기
    if (await hasHrTrack(e.runId)) continue; // 이미 채워짐 — 완료
    let filled = 0;
    try {
      filled = await hkBackfill(e.runId, e.startMs, e.endMs);
    } catch {
      filled = 0;
    }
    if (filled > 0) continue; // 이번에 채움
    keep.push(e); // 아직 — 다음 복귀/지연에서 재시도
  }
  await savePending(keep);
}
