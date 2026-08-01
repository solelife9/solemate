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
//     초과분은 균등 스트라이드 다운샘플(울트라 런 방어). 단 **경로(route)만은 RDP** 로
//     줄인다 — 좌표열을 균등 추출하면 코너가 잘려 거리가 줄어든다(lib/geo 참조).
//     상한 안에서는 어떤 키도 손대지 않는다 — 백업은 로컬과 같아야 복원이 무손실이다.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import {simplifyRoute, ROUTE_SIMPLIFY_TOLERANCE_M} from './geo';

/** 사이드카 필드 ↔ AsyncStorage 키 프리픽스(HistoryScreen RunDetail 읽기 계약과 동일). */
const SIDECARS = {
  splits: 'splits_',
  paceTrack: 'paceTrack_',
  hrTrack: 'hrTrack_',
  gapTrack: 'gapTrack_',
  track: 'track_',
  // GPS 경로(2026-07-30). 여기 합류시키는 이유는 두 가지다.
  //  1) 지금까지 경로가 재설치를 넘어 살아남는 유일한 길은 **백업 문서 본문의 run.route**
  //     였다. 그런데 그 문서는 신발·런 전량이 들어가는 단일 문서이고 Firestore 상한이
  //     1MiB 다. 실측(2026-07-30, 주 계정)에서 경로 있는 런 12건이 런 데이터의 74%를
  //     차지했다 — 경로가 문서를 밀어 올리는 주범이다.
  //  2) 상세 사이드카는 이미 '단일 문서에 못 싣는 것'을 런별 하위 문서로 빼려고 만든
  //     자리다. 경로만 예외로 본문에 남아 있었을 뿐, 성격은 시계열과 같다.
  // 이 한 줄로 push·pull·복원·시그니처가 전부 따라온다. 본문 route 제거는 **다음 단계**다
  // — 새 집에 짐이 들어간 것을 확인하기 전에 옛 집을 비우면 그게 유실이다.
  route: 'route_',
} as const;
type SidecarKey = keyof typeof SIDECARS;

/**
 * 이 런의 경로가 **클라우드 사이드카에 확실히 올라가 있는가**.
 *
 * 판단 근거는 push 성공 시에만 기록되는 마커(detail_pushed_<id>)의 시그니처다. 시그니처는
 * `route:N` 형태로 키별 길이를 담으므로, N>0 이면 그 시점에 경로가 실제로 실려 올라갔다는
 * 뜻이다(빈 배열은 collectLocalDetail 이 애초에 담지 않는다).
 *
 * 왜 필요한가: 백업 문서 본문에서 route 를 빼도 되는지 판정하는 **유일한 안전 조건**이다.
 * 사이드카에 없는데 본문에서 빼면 그 경로는 어디에도 남지 않는다.
 */
export async function runsWithCloudRoute(runIds: readonly (string | number)[]): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = runIds.map(String).filter(Boolean);
  if (!ids.length) return out;
  try {
    const got = await AsyncStorage.getMany(ids.map(pushedKey));
    for (const id of ids) {
      const sig = got[pushedKey(id)];
      if (typeof sig === 'string' && /(^|\|)route:([1-9]\d*)(\||$)/.test(sig)) out.add(id);
    }
  } catch {
    /* 마커를 못 읽으면 '확인 안 됨' = 본문 route 를 그대로 둔다(안전한 기본값) */
  }
  return out;
}

/** 시계열 상한(점) — 1점/s 기준 3시간. 초과는 균등 다운샘플(스칼라 시계열 한정). */
export const DETAIL_SERIES_CAP = 10800;

/** push 시그니처 마킹 키 — 같은 내용을 매일 재업로드하지 않기 위한 로컬 마커. */
const pushedKey = (runId: string) => 'detail_pushed_' + runId;

/**
 * '이 런은 원격에도 상세가 없더라' 마커 키(AUDIT 2 I-5).
 *
 * 없었다: 로컬에도 원격에도 상세가 없는 런은 **매 스윕마다 다시 조회**됐다. 결과가
 * 늘 '없음'이라 아무것도 기록되지 않았고, 그래서 영원히 반복됐다(하루 최대 30 읽기).
 * 해당하는 런 — GPX 로 가져온 기록, 아주 짧은 런, 사이드카가 없던 초기 기록.
 */
const absentKey = (runId: string) => 'detail_absent_' + runId;

/**
 * '없음' 마커의 유효기간(ms). **영구가 아닌 이유가 중요하다.**
 *
 * 다른 기기에서 나중에 그 런의 상세를 올릴 수 있다(A 폰에서 달린 기록을 B 폰이 아직
 * 못 받은 상태). 마커를 영구로 두면 B 는 그 상세를 **영영 복원하지 못한다** — 읽기
 * 몇 번 아끼자고 사용자 데이터를 못 받게 만드는 건 본말전도다.
 *
 * 그래서 기한을 둔다. 7일이면 조회 빈도는 1/7 로 줄고(30 → 하루 약 4), 복원은
 * 늦어도 일주일 안에 따라잡는다.
 */
export const DETAIL_ABSENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 지금 이 런의 원격 조회를 건너뛸 것인가(마커가 아직 유효한가). 순수 판정.
 * 마커가 없거나·손상됐거나·기한이 지났으면 **조회한다**(안전한 쪽 = 데이터를 받는 쪽).
 */
export function isAbsentMarkerFresh(raw: string | null, now: number): boolean {
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at) || at <= 0) return false;
  if (at > now) return false; // 기기 시계가 뒤로 갔다 — 막지 않는다
  return now - at < DETAIL_ABSENT_TTL_MS;
}

/** 좌표열인가 — 첫 원소만 본다(사이드카는 동종 배열이고, 아니면 그냥 균등 경로로 빠진다). */
function isLatLonSeries(arr: unknown[]): arr is {lat: number; lon: number}[] {
  const p = arr[0] as {lat?: unknown; lon?: unknown} | null;
  return !!p && typeof p === 'object' && typeof p.lat === 'number' && typeof p.lon === 'number';
}

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
        // 백업은 **로컬과 같아야 한다** — 상한 안이면 어떤 키든 손대지 않고 그대로 올린다.
        // 상한을 넘을 때만 줄이되, 경로는 균등 추출이 곧 거리 손실이므로(코너가 잘린다 —
        // lib/geo 참조) RDP 로 줄인다. RunEngine 이 이미 RDP 로 저장하니 실제로는 거의
        // 발동하지 않는 안전 밸브다.
        if (parsed.length > 0) {
          out[k] =
            k === 'route' && parsed.length > DETAIL_SERIES_CAP && isLatLonSeries(parsed)
              ? simplifyRoute(parsed, ROUTE_SIMPLIFY_TOLERANCE_M, DETAIL_SERIES_CAP)
              : capSeries(parsed);
        }
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

/** 클라우드 상세 삭제 대기 목록 키(AUDIT 3 D-3). */
export const DETAIL_DELETE_QUEUE_KEY = 'detail_delete_pending_v1';

/**
 * 런을 지웠는데 클라우드 상세를 못 지웠을 때(오프라인·미로그인) 그 id 를 적어 둔다.
 *
 * 왜 큐가 필요한가: Firestore 오프라인 영속이 대부분의 삭제를 큐잉해 주지만, **로그인
 * 전이거나 포트가 삭제를 지원하지 않는 경우**엔 호출 자체가 실패한다. 표시를 안 남기면
 * 그 런의 GPS 경로는 서버에 영영 남는다 — 사용자는 지웠다고 믿는데.
 * 절대 throw 하지 않는다(삭제 흐름을 막지 않는다).
 */
export async function enqueueDetailDeletion(runId: string): Promise<void> {
  const id = String(runId || '');
  if (!id) return;
  try {
    const raw = await AsyncStorage.getItem(DETAIL_DELETE_QUEUE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const list: string[] = Array.isArray(arr) ? arr.map(String) : [];
    if (list.includes(id)) return; // 멱등
    list.push(id);
    await AsyncStorage.setItem(DETAIL_DELETE_QUEUE_KEY, JSON.stringify(list));
  } catch {
    /* 큐 기록 실패 — 삭제 흐름은 계속한다 */
  }
}

/**
 * 대기 중인 클라우드 상세 삭제를 재시도한다. 성공한 것만 큐에서 뺀다.
 * 지운 개수를 돌려준다. 전 과정 no-throw(비차단).
 */
export async function flushDetailDeletions(port: RunDetailPort): Promise<number> {
  if (!port?.deleteRunDetail) return 0;
  let list: string[] = [];
  try {
    const raw = await AsyncStorage.getItem(DETAIL_DELETE_QUEUE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    list = Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return 0;
  }
  if (list.length === 0) return 0;

  const remaining: string[] = [];
  let deleted = 0;
  for (const id of list) {
    try {
      await port.deleteRunDetail(id);
      deleted++;
      // 로컬 마커도 함께 정리한다(D-5) — 안 지우면 삭제된 런의 마커가 영구 누수된다.
      try {
        await AsyncStorage.removeMany([pushedKey(id), absentKey(id)]);
      } catch {
        /* 마커 정리 실패는 무시 */
      }
    } catch {
      remaining.push(id); // 다음 스윕에서 재시도
    }
  }
  try {
    await AsyncStorage.setItem(DETAIL_DELETE_QUEUE_KEY, JSON.stringify(remaining));
  } catch {
    /* 다음 스윕에서 다시 시도 */
  }
  return deleted;
}

export interface RunDetailPort {
  pushRunDetail?(runId: string, detail: Record<string, unknown>): Promise<void>;
  pullRunDetail?(runId: string): Promise<Record<string, unknown> | null>;
  deleteRunDetail?(runId: string): Promise<void>;
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
  opts?: {max?: number; now?: number},
): Promise<{pushed: number; restored: number}> {
  const max = opts?.max ?? 30;
  const now = opts?.now ?? Date.now();
  // 밀린 클라우드 상세 삭제를 먼저 처리한다(AUDIT 3 D-3) — 지운 런의 경로가 서버에
  // 남아 있는 상태를 먼저 정리하고 나서 나머지를 동기한다.
  await flushDetailDeletions(port);
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
        // AUDIT 2 I-5 — 최근에 '원격에도 없음'을 확인했으면 그 기간 동안은 다시 묻지 않는다.
        if (isAbsentMarkerFresh(await AsyncStorage.getItem(absentKey(runId)), now)) continue;
        const remote = await port.pullRunDetail(runId);
        if (remote && (await persistLocalDetailIfMissing(runId, remote)) > 0) {
          restored++;
          // 받아왔으면 '없음' 기록은 의미가 없다 — 지운다(다음에 또 스킵되지 않게).
          await AsyncStorage.removeItem(absentKey(runId));
        } else {
          // 원격도 비었다. **이 사실을 기억한다** — 안 그러면 매 스윕 같은 걸 또 묻는다.
          await AsyncStorage.setItem(absentKey(runId), String(now));
        }
      }
    } catch {
      /* 이 런 실패 — 다음 런(비차단). 마커 미기록이라 다음 스윕에서 재시도된다. */
    }
  }
  return {pushed, restored};
}
