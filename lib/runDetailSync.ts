// ============================================================================
// lib/runDetailSync.ts — 런 상세 사이드카 클라우드 백업/복원 (2026-07-24)
// ----------------------------------------------------------------------------
// 배경(실기기 사고): 재설치로 AsyncStorage 가 초기화되면 기록 레코드(클라우드)는 살아도
// 상세를 그리는 사이드카(구간 스플릿·페이스/심박/경사 시계열·트랙 메타)가 통째로 유실됐다.
// 이 모듈이 런별로 사이드카를 모아 CloudPort.pushRunDetail(런별 하위 문서)로 올리고,
// 로컬이 비어 있으면 pullRunDetail 로 내려받아 복원한다.
//
// 원칙:
//   · 로컬 우선 — 로컬에 있으면 push(변경 시그니처가 달라졌을 때만), 없으면 pull 복원.
//   · 복원은 '빈 자리만' 채운다(persistLocalDetailIfMissing) — 로컬 실측을 덮지 않는다.
//   · 전 과정 no-throw — 개별 런 실패는 삼키고 다음 런으로(비차단), 결과는 카운트로 관찰.
//   · 시계열 상한 CAP(1점/s 기준 3시간) — Firestore 문서 1MB 여유를 크게 남기는 안전 상한,
//     초과분은 균등 스트라이드 다운샘플(울트라 런 방어).
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

/** 사이드카 필드 ↔ AsyncStorage 키 프리픽스(HistoryScreen RunDetail 읽기 계약과 동일). */
const SIDECARS = {
  splits: 'splits_',
  paceTrack: 'paceTrack_',
  hrTrack: 'hrTrack_',
  gapTrack: 'gapTrack_',
  track: 'track_',
} as const;
type SidecarKey = keyof typeof SIDECARS;

/** 시계열 상한(점) — 1점/s 기준 3시간. 초과는 균등 다운샘플(lib/geo.simplifyRoute 규약). */
export const DETAIL_SERIES_CAP = 10800;

/** push 시그니처 마킹 키 — 같은 내용을 매일 재업로드하지 않기 위한 로컬 마커. */
const pushedKey = (runId: string) => 'detail_pushed_' + runId;

function capSeries<T>(arr: T[], max = DETAIL_SERIES_CAP): T[] {
  if (arr.length <= max) return arr;
  return Array.from({length: max}, (_, i) =>
    arr[Math.min(Math.floor((i * (arr.length - 1)) / (max - 1)), arr.length - 1)],
  );
}

/** 로컬 사이드카를 모아 상세 객체로. 하나도 없으면 null. 손상 JSON 은 그 키만 건너뜀. */
export async function collectLocalDetail(runId: string): Promise<Record<string, unknown> | null> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(SIDECARS) as SidecarKey[]) {
    try {
      const raw = await AsyncStorage.getItem(SIDECARS[k] + runId);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0) out[k] = capSeries(parsed);
      } else if (parsed && typeof parsed === 'object') {
        out[k] = parsed; // track 메타({lapM,laps,lapTimes})
      }
    } catch {
      /* 손상 사이드카 — 이 키만 생략 */
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** 원격 상세를 '로컬에 없는 키만' 복원한다(로컬 실측 우선). 복원한 키 수를 돌려준다. */
export async function persistLocalDetailIfMissing(
  runId: string,
  detail: Record<string, unknown>,
): Promise<number> {
  let restored = 0;
  for (const k of Object.keys(SIDECARS) as SidecarKey[]) {
    const v = detail[k];
    const valid = Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object';
    if (!valid) continue;
    try {
      const key = SIDECARS[k] + runId;
      if (await AsyncStorage.getItem(key)) continue; // 로컬 우선 — 실측 보존
      await AsyncStorage.setItem(key, JSON.stringify(v));
      restored++;
    } catch {
      /* 개별 실패 — 다음 키 */
    }
  }
  return restored;
}

/** 상세의 내용 시그니처(키별 길이) — 변경 감지용(같으면 재업로드 생략). */
export function detailSignature(detail: Record<string, unknown>): string {
  return (Object.keys(SIDECARS) as SidecarKey[])
    .map(k => {
      const v = detail[k];
      return `${k}:${Array.isArray(v) ? v.length : v ? 1 : 0}`;
    })
    .join('|');
}

export interface RunDetailPort {
  pushRunDetail?(runId: string, detail: Record<string, unknown>): Promise<void>;
  pullRunDetail?(runId: string): Promise<Record<string, unknown> | null>;
}

/**
 * 런 목록(최신 우선 권장)을 순회하며 상세를 양방향 동기한다:
 *   로컬 有 → 시그니처가 마커와 다르면 push(성공 시 마킹)
 *   로컬 無 → pull → 빈 자리 복원(성공 시 다음 push 재계산을 위해 마킹도 갱신)
 * 개별 런의 실패는 삼키고 계속한다. {pushed, restored} 카운트를 돌려준다.
 */
export async function syncRunDetails(
  runs: {id: string | number}[],
  port: RunDetailPort,
  opts?: {max?: number},
): Promise<{pushed: number; restored: number}> {
  const max = opts?.max ?? 30;
  let pushed = 0;
  let restored = 0;
  for (const r of runs.slice(0, max)) {
    const runId = String(r.id || '');
    if (!runId) continue;
    try {
      const local = await collectLocalDetail(runId);
      if (local) {
        if (!port.pushRunDetail) continue;
        const sig = detailSignature(local);
        if ((await AsyncStorage.getItem(pushedKey(runId))) === sig) continue;
        await port.pushRunDetail(runId, local);
        await AsyncStorage.setItem(pushedKey(runId), sig);
        pushed++;
      } else if (port.pullRunDetail) {
        const remote = await port.pullRunDetail(runId);
        if (remote && (await persistLocalDetailIfMissing(runId, remote)) > 0) restored++;
      }
    } catch {
      /* 이 런 실패 — 다음 런(비차단). 마커 미기록이라 다음 스윕에서 재시도된다. */
    }
  }
  return {pushed, restored};
}
