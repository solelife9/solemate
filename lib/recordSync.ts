// ============================================================================
// lib/recordSync.ts — 레코드 단위 클라우드 동기 (설계: docs/design/2026-08-01-cloud-data-model.md)
// ----------------------------------------------------------------------------
// 지금까지 클라우드 사본은 **문서 하나짜리 덩어리**였다 — 신발·러닝·설정·진척·메달이
// 전부 한 문서의 배열이라, 러닝 하나를 추가해도 그 문서 전체를 다시 썼다. 그래서
// 1MiB 천장에 두 번 부딪혔고(경로·묘비), 소셜을 얹으면 구조적으로 막힌다(러닝 한 건이
// 체중·나이와 한 문서에 있어 친구에게 열어줄 수가 없다).
//
// 이 모듈은 그 전환의 **순수 판정부**다. "무엇을 올려야 하는가"만 정하고 I/O 는 안 한다.
//
// ── 1단계에서 이 모듈이 하는 일 ─────────────────────────────────────────────
// 덩어리에 쓰던 것을 그대로 두고, **하위 문서로도 함께 쓴다**(이중 쓰기). 읽기는 아직
// 덩어리다. 두 저장소가 같은 내용인지 기계로 대조할 수 있어, 어느 시점에 멈춰도 옛
// 경로가 살아 있다. 이 프로젝트는 이미 이 패턴을 썼다 — 경로를 사이드카로 뺄 때
// "새 집에 짐이 들어간 것을 확인하기 전에 옛 집을 비우면 그게 유실이다"(runDetailSync).
//
// ── 시각 필드가 둘인 이유 ───────────────────────────────────────────────────
// 문서마다 두 개를 쓴다. 하나로는 안 된다.
//   · `updatedAt` — **서버**가 찍는다(serverTimestamp). 델타 조회의 커서.
//     기기 시계를 못 믿으니 커서는 서버 시각이어야 한다.
//   · `editedAt`  — **기기**가 찍는다(보정 시계 lib/clockOffset). 충돌 판정(LWW) 기준.
//     서버 시각만 쓰면 "오프라인에서 3일 전에 고친 것"이 나중에 도착해 오늘 편집을 덮는다.
//     실제로 나중에 고친 쪽이 이겨야 한다.
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

/** 하위 컬렉션 이름 — 경로 오타를 막으려고 한 곳에 모은다. */
export const RECORD_COLLECTIONS = {
  runs: 'runs',
  shoes: 'shoes',
  medals: 'medals',
} as const;
export type RecordKind = keyof typeof RECORD_COLLECTIONS;

/** 한 배치에 담는 최대 문서 수. Firestore writeBatch 상한이 500 이라 여유를 둔다. */
export const BATCH_LIMIT = 400;

/**
 * 레코드에서 **문서에 담지 않을** 필드.
 *
 * `route` 는 이미 `runDetails/{runId}` 가 소유한다(2026-07-30 분리). 여기 또 담으면
 * 같은 경로가 두 벌이 되고, 그게 바로 1MiB 천장을 만든 원인이었다.
 */
const OMIT_FIELDS = new Set(['route', '_pending']);

/** 레코드의 id 를 문자열로. 없으면 null(문서를 만들 수 없다). */
export function recordId(rec: unknown): string | null {
  const id = (rec as {id?: unknown} | null)?.id;
  if (id == null) return null;
  const s = String(id);
  return s.trim() ? s : null;
}

/** 레코드의 편집 시각(ms). 없거나 이상하면 0. */
export function editedAtOf(rec: unknown): number {
  const v = (rec as {updatedAt?: unknown} | null)?.updatedAt;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 묘비인가. */
export function isTombstone(rec: unknown): boolean {
  return (rec as {deleted?: unknown} | null)?.deleted === true;
}

/**
 * 로컬 레코드를 **하위 문서 본문**으로 바꾼다(순수).
 *
 * · `editedAt` 을 명시 필드로 승격한다(위 주석 참조)
 * · 묘비는 **껍데기만** — id·deleted·editedAt(+신발은 name). 지운 레코드의 본문을
 *   클라우드에 영구 보존할 이유가 없다(AUDIT 3 D-1 과 같은 판단)
 * · `route`·`_pending` 은 담지 않는다
 * · `updatedAt`(서버 시각)은 여기서 안 넣는다 — I/O 계층이 serverTimestamp 로 채운다
 */
export function toRecordDoc(rec: Record<string, unknown>, kind: RecordKind): Record<string, unknown> {
  const editedAt = editedAtOf(rec);
  if (isTombstone(rec)) {
    const out: Record<string, unknown> = {deleted: true, editedAt};
    // 신발 묘비의 이름은 남긴다 — 지난 기록의 신발 이름 표시에 쓰인다(buildNameById).
    if (kind === 'shoes' && typeof rec.name === 'string') out.name = rec.name;
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (OMIT_FIELDS.has(k)) continue;
    if (v === undefined) continue; // Firestore 는 undefined 를 거부한다
    out[k] = v;
  }
  out.editedAt = editedAt;
  return out;
}

/** 마지막으로 올린 레코드의 편집 시각 표(레코드 종류별). */
export type PushedMarkers = Record<string, number>;

/**
 * 올려야 할 레코드만 고른다(순수).
 *
 * 기준은 **편집 시각이 마커와 다른가**다. 같으면 이미 올라간 것이라 건너뛴다.
 * `>` 가 아니라 `!==` 인 이유: 기기 시계가 뒤로 갔거나 다른 기기의 더 오래된 값이
 * 들어온 경우에도 **한 번은 올려서 맞춘다**(덜 올리는 것보다 더 올리는 게 안전하다).
 *
 * id 가 없는 레코드는 문서를 만들 수 없으므로 제외한다(덩어리에는 그대로 남는다 —
 * 1단계에서는 덩어리가 여전히 정본이라 유실이 아니다).
 */
export function selectDirty<T extends object>(
  records: readonly T[],
  pushed: Readonly<PushedMarkers>,
): T[] {
  if (!Array.isArray(records)) return [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const rec of records) {
    const id = recordId(rec);
    if (id == null) continue;
    if (seen.has(id)) continue; // 같은 id 가 두 번 오면(라이브+묘비) 앞엣것만
    seen.add(id);
    if (pushed[id] === editedAtOf(rec)) continue;
    out.push(rec);
  }
  return out;
}

/** 푸시에 성공한 레코드로 마커를 갱신한다(순수, 비파괴). */
export function nextMarkers<T extends object>(
  prev: Readonly<PushedMarkers>,
  pushedRecords: readonly T[],
): PushedMarkers {
  const next: PushedMarkers = {...prev};
  for (const rec of pushedRecords) {
    const id = recordId(rec);
    if (id != null) next[id] = editedAtOf(rec);
  }
  return next;
}

/**
 * 더 이상 존재하지 않는 레코드의 마커를 정리한다(순수).
 *
 * 왜 필요한가: 묘비가 기한(90일)이 지나 사라지면 그 id 는 영영 안 온다. 마커를 안
 * 치우면 **삭제된 레코드의 흔적이 로컬에 영구 누적**된다 — 이번 재설계가 클라우드에서
 * 없애려는 바로 그 문제를 로컬에 다시 만드는 꼴이다.
 */
export function pruneMarkers<T extends object>(
  markers: Readonly<PushedMarkers>,
  currentRecords: readonly T[],
): PushedMarkers {
  const alive = new Set<string>();
  for (const rec of currentRecords) {
    const id = recordId(rec);
    if (id != null) alive.add(id);
  }
  const next: PushedMarkers = {};
  for (const [id, at] of Object.entries(markers)) if (alive.has(id)) next[id] = at;
  return next;
}

/** 배열을 배치 크기로 자른다(Firestore writeBatch 상한 대응). */
export function chunk<T>(arr: readonly T[], size: number = BATCH_LIMIT): T[][] {
  const n = Number.isFinite(size) && size > 0 ? Math.floor(size) : BATCH_LIMIT;
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * 두 저장소가 같은 내용인가 — **1단계의 안전장치**(순수).
 *
 * 덩어리와 하위 문서 양쪽에 쓰는 동안, 둘이 어긋나면 그건 이행이 잘못됐다는 뜻이다.
 * 어긋난 id 를 돌려주므로 호출부가 계측할 수 있다. 빈 배열 = 일치.
 *
 * 비교는 **id 집합과 편집 시각**만 본다. 본문 전체를 비교하지 않는 이유: 하위 문서는
 * 일부러 route 를 빼고 묘비를 껍데기로 만들기 때문에 본문이 같을 수 없다(그게 설계다).
 */
export function diffRecordIds<T extends object>(
  blobRecords: readonly T[],
  docRecords: readonly {id: string; editedAt: number}[],
): {missingInDocs: string[]; extraInDocs: string[]; staleInDocs: string[]} {
  const blob = new Map<string, number>();
  for (const rec of blobRecords) {
    const id = recordId(rec);
    if (id != null && !blob.has(id)) blob.set(id, editedAtOf(rec));
  }
  const docs = new Map<string, number>();
  for (const d of docRecords) if (d?.id) docs.set(String(d.id), Number(d.editedAt) || 0);

  const missingInDocs: string[] = [];
  const staleInDocs: string[] = [];
  for (const [id, at] of blob) {
    if (!docs.has(id)) missingInDocs.push(id);
    else if (docs.get(id) !== at) staleInDocs.push(id);
  }
  const extraInDocs: string[] = [];
  for (const id of docs.keys()) if (!blob.has(id)) extraInDocs.push(id);

  return {missingInDocs, extraInDocs, staleInDocs};
}

// ─── I/O 계층 (얇게) ─────────────────────────────────────────────────────────
// 판정은 위 순수 함수들이 하고, 여기서는 저장소/포트만 만진다.

/** 종류별 푸시 마커 저장 키. */
export const MARKERS_KEY = 'recordSync_pushed_v1';

/** 최소 포트 계약 — 테스트가 가짜를 주입할 수 있게 좁게 잡는다. */
export interface RecordPort {
  pushRecords?(collection: string, docs: {id: string; data: Record<string, unknown>}[]): Promise<void>;
}

type AllMarkers = Partial<Record<RecordKind, PushedMarkers>>;

/** 마커 전체를 읽는다. 손상·부재는 빈 값(그러면 전부 다시 올린다 — 안전한 쪽). */
export async function loadMarkers(): Promise<AllMarkers> {
  try {
    const raw = await AsyncStorage.getItem(MARKERS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as AllMarkers) : {};
  } catch {
    return {};
  }
}

async function saveMarkers(m: AllMarkers): Promise<void> {
  try {
    await AsyncStorage.setItem(MARKERS_KEY, JSON.stringify(m));
  } catch {
    /* 다음 동기에 다시 시도 — 최악이 중복 업로드라 유실은 없다 */
  }
}

/** 테스트 전용 — 마커를 지운다. */
export async function __resetMarkersForTests(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MARKERS_KEY);
  } catch {
    /* noop */
  }
}

export interface MirrorResult {
  /** 종류별로 실제 올린 문서 수. */
  pushed: Partial<Record<RecordKind, number>>;
  /** 포트가 지원하지 않거나 올릴 게 없어 아무것도 안 했으면 true. */
  skipped: boolean;
}

/**
 * 레코드를 하위 문서로 **미러링**한다(1단계 이중 쓰기).
 *
 * 덩어리 쓰기는 호출부가 이미 끝낸 뒤에 부른다 — 이 함수가 실패해도 **덩어리는 온전하다**.
 * 그래서 전 과정 no-throw 이고, 실패한 종류는 마커를 갱신하지 않아 다음 동기에 재시도된다.
 *
 * `records` 는 라이브 + 묘비를 합친 목록이어야 한다(삭제도 문서로 전파돼야 하므로).
 */
export async function mirrorRecords(
  port: RecordPort,
  records: Partial<Record<RecordKind, readonly Record<string, unknown>[]>>,
): Promise<MirrorResult> {
  const out: MirrorResult = {pushed: {}, skipped: true};
  if (!port?.pushRecords) return out;

  const markers = await loadMarkers();
  const nextAll: AllMarkers = {...markers};
  let touched = false;

  for (const kind of Object.keys(RECORD_COLLECTIONS) as RecordKind[]) {
    const list = records[kind];
    if (!Array.isArray(list)) continue;
    const prev = markers[kind] ?? {};
    const dirty = selectDirty(list, prev);
    // 사라진 레코드의 마커는 이번 기회에 치운다(로컬 흔적 영구 누적 방지).
    const pruned = pruneMarkers(prev, list);
    if (dirty.length === 0) {
      if (Object.keys(pruned).length !== Object.keys(prev).length) {
        nextAll[kind] = pruned;
        touched = true;
      }
      continue;
    }
    try {
      let done = 0;
      for (const part of chunk(dirty)) {
        const docs = part
          .map(rec => ({id: recordId(rec) as string, data: toRecordDoc(rec, kind)}))
          .filter(d => !!d.id);
        if (!docs.length) continue;
        await port.pushRecords(RECORD_COLLECTIONS[kind], docs);
        done += docs.length;
        // 배치 단위로 마커를 전진시킨다 — 중간에 끊겨도 이미 올린 건 다시 안 올린다.
        nextAll[kind] = nextMarkers(nextAll[kind] ?? pruned, part);
        touched = true;
      }
      out.pushed[kind] = done;
      out.skipped = false;
    } catch {
      // 이 종류만 실패 — 마커를 안 올렸으므로 다음 동기에 그대로 재시도된다.
      // 덩어리는 이미 성공했으므로 데이터 유실은 없다.
    }
  }

  if (touched) await saveMarkers(nextAll);
  return out;
}
