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

// ─── 2단계: 읽기를 하위 문서 델타로 ──────────────────────────────────────────
//
// 1단계에서 하위 문서에 **쓰기**만 했다면, 여기서 **읽기**가 넘어온다.
// 다만 덩어리 쓰기는 계속 유지한다(3단계에서 끊는다) — 어느 시점에 멈춰도 되돌릴 수
// 있게 하는 것이 이 이행의 핵심이다.
//
// 안전 설계 두 가지:
//  1) **합집합 병합이지 교체가 아니다.** 델타가 비어 오면 아무 일도 안 일어난다.
//     조회가 실패하거나 커서가 어긋나도 화면의 기록이 사라지지 않는다.
//  2) **경로(route)는 로컬 것을 지킨다.** 하위 문서는 일부러 route 를 안 담으므로
//     (runDetails 가 소유), 병합에서 원격이 이겨도 로컬 route 를 덮어쓰면 안 된다.
//     이걸 놓치면 동기 한 번에 모든 지도가 사라진다.

/** 컬렉션별 델타 커서(서버 updatedAt ms) 저장 키. */
export const CURSORS_KEY = 'recordSync_cursor_v1';

export type Cursors = Partial<Record<RecordKind, number>>;

/** 커서를 읽는다. 손상·부재는 빈 값(= 전량 조회, 안전한 쪽). */
export async function loadCursors(): Promise<Cursors> {
  try {
    const raw = await AsyncStorage.getItem(CURSORS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Cursors) : {};
  } catch {
    return {};
  }
}

async function saveCursors(c: Cursors): Promise<void> {
  try {
    await AsyncStorage.setItem(CURSORS_KEY, JSON.stringify(c));
  } catch {
    /* 다음 동기에 다시 시도 — 최악이 재조회라 유실은 없다 */
  }
}

/** 테스트 전용 — 커서를 지운다. */
export async function __resetCursorsForTests(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CURSORS_KEY);
  } catch {
    /* noop */
  }
}

/**
 * 하위 문서를 **로컬 레코드 모양**으로 되돌린다(순수).
 *
 * `editedAt`(문서) → `updatedAt`(로컬)로 되돌리는 게 핵심이다. 로컬·병합 코드는 전부
 * `updatedAt` 을 편집 시각으로 읽으므로, 여기서 이름을 맞춰 주면 기존 병합 로직
 * (cloudSync.mergeCloudData)이 **하나도 안 바뀌고** 그대로 동작한다.
 *
 * 서버 시각(`updatedAt` 문서 필드)은 커서 전용이라 레코드에 싣지 않는다.
 */
export function fromRecordDoc(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (k === 'editedAt' || k === 'updatedAt') continue; // 아래에서 다시 세운다
    if (v === undefined) continue;
    out[k] = v;
  }
  out.id = id;
  const edited = Number((data as {editedAt?: unknown})?.editedAt);
  out.updatedAt = Number.isFinite(edited) && edited > 0 ? edited : 0;
  return out;
}

/**
 * 원격에서 내려온 레코드를 로컬에 합친다(순수, 합집합).
 *
 * · 한쪽에만 있으면 그대로 보존(어느 쪽도 버리지 않는다)
 * · 양쪽에 있으면 `updatedAt`(편집 시각)이 큰 쪽. 동률이면 **삭제(묘비) 우선**
 * · 원격이 이겨도 **로컬의 route 는 지킨다** — 하위 문서엔 route 가 없기 때문이다
 *
 * `pulled` 가 비면 `local` 을 그대로(참조 동일) 돌려준다 — 조회 실패가 화면을 비우지 않는다.
 */
export function mergePulled<T extends Record<string, unknown>>(
  local: readonly T[],
  pulled: readonly T[],
): T[] {
  if (!Array.isArray(pulled) || pulled.length === 0) return local as T[];
  const byId = new Map<string, T>();
  const order: string[] = [];
  const noId: T[] = [];

  for (const rec of local) {
    const id = recordId(rec);
    if (id == null) {
      noId.push(rec);
      continue;
    }
    if (!byId.has(id)) order.push(id);
    byId.set(id, rec);
  }

  for (const rec of pulled) {
    const id = recordId(rec);
    if (id == null) continue;
    const mine = byId.get(id);
    if (!mine) {
      byId.set(id, rec);
      order.push(id);
      continue;
    }
    const ru = editedAtOf(rec);
    const mu = editedAtOf(mine);
    const remoteWins = ru > mu || (ru === mu && isTombstone(rec) && !isTombstone(mine));
    if (!remoteWins) continue;
    // 원격이 이겼다 — 다만 로컬의 route 는 살린다(하위 문서엔 route 가 없다).
    const localRoute = (mine as {route?: unknown}).route;
    const merged =
      localRoute && !(rec as {route?: unknown}).route && !isTombstone(rec)
        ? ({...rec, route: localRoute} as T)
        : rec;
    byId.set(id, merged);
  }

  return [...order.map(id => byId.get(id) as T), ...noId];
}

export interface PullResult {
  records: Partial<Record<RecordKind, Record<string, unknown>[]>>;
  cursors: Cursors;
  /** 포트가 조회를 지원하지 않거나 전부 실패했으면 true. */
  skipped: boolean;
}

/** 조회를 지원하는 최소 포트 계약. */
export interface RecordReadPort {
  listRecords?(
    collection: string,
    afterMs: number | null,
    limitN?: number,
  ): Promise<{docs: {id: string; data: Record<string, unknown>}[]; maxUpdatedAtMs: number}>;
}

/** 한 번에 받아오는 최대 문서 수. 초기 전량 조회는 이 크기로 반복한다. */
export const PULL_PAGE = 500;
/** 페이지 반복 상한(무한 루프 방지). 500 × 40 = 2만 건. */
const MAX_PAGES = 40;

/**
 * 하위 문서에서 **바뀐 것만** 받아온다. 커서는 성공한 컬렉션만 전진시킨다 —
 * 실패한 컬렉션은 다음 동기에 같은 지점부터 다시 받는다(누락 없음).
 * 전 과정 no-throw.
 */
export async function pullRecords(port: RecordReadPort): Promise<PullResult> {
  const out: PullResult = {records: {}, cursors: {}, skipped: true};
  if (!port?.listRecords) return out;

  const cursors = await loadCursors();
  const nextCursors: Cursors = {...cursors};
  let touched = false;

  for (const kind of Object.keys(RECORD_COLLECTIONS) as RecordKind[]) {
    const from = cursors[kind] ?? 0;
    const acc: Record<string, unknown>[] = [];
    let cursor = from;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await port.listRecords(RECORD_COLLECTIONS[kind], cursor || null, PULL_PAGE);
        const docs = res?.docs ?? [];
        for (const d of docs) if (d?.id) acc.push(fromRecordDoc(d.id, d.data));
        const next = Number(res?.maxUpdatedAtMs) || 0;
        // 커서가 안 움직이면 더 받을 게 없다(같은 페이지 무한 반복 방지).
        if (docs.length < PULL_PAGE || next <= cursor) {
          if (next > cursor) cursor = next;
          break;
        }
        cursor = next;
      }
      if (acc.length) out.records[kind] = acc;
      if (cursor > (cursors[kind] ?? 0)) {
        nextCursors[kind] = cursor;
        touched = true;
      }
      out.skipped = false;
    } catch {
      // 이 컬렉션만 실패 — 커서를 안 올렸으므로 다음에 같은 지점부터 다시 받는다.
    }
  }

  if (touched) await saveCursors(nextCursors);
  out.cursors = nextCursors;
  return out;
}

// ─── 3단계: 덩어리에서 레코드를 뺀다 ─────────────────────────────────────────
//
// 여기서 1MiB 천장이 사라진다. 덩어리는 설정·진척만 남은 작은 문서가 되고, 레코드는
// 문서 단위로 무한히 늘어날 수 있게 된다.
//
// **되돌리기가 비싼 유일한 단계다.** 그래서 규칙이 하나 있다:
//
//   > 새 집에 짐이 들어간 것을 확인하기 전에 옛 집을 비우면 그게 유실이다.
//
// 이 프로젝트는 이미 이 규칙으로 경로를 사이드카로 옮겼다(runDetailSync). 같은 방식으로,
// **모든 레코드가 하위 문서에 확실히 올라간 것을 확인한 뒤에만** 덩어리를 비운다.
// 하나라도 못 올라갔으면 이번 동기는 예전처럼 덩어리에 다 싣는다 — 다음 기회에 다시 본다.

/**
 * 이 종류의 레코드가 **전부** 하위 문서에 올라갔는가(순수).
 *
 * 판정 근거는 push 성공 시에만 갱신되는 마커다. 마커의 편집 시각이 현재 레코드와
 * 같아야 "그 내용이 올라갔다"는 뜻이다. id 없는 레코드는 문서를 만들 수 없으므로
 * **하나라도 있으면 미완료**로 본다(덩어리에 남겨야 유실이 없다).
 */
export function allMirrored<T extends object>(
  records: readonly T[],
  markers: Readonly<PushedMarkers>,
): boolean {
  if (!Array.isArray(records)) return false;
  for (const rec of records) {
    const id = recordId(rec);
    if (id == null) return false; // 문서로 못 만드는 레코드가 있다 — 덩어리가 필요하다
    if (markers[id] !== editedAtOf(rec)) return false;
  }
  return true;
}

/**
 * **병합 결과**가 전부 미러링됐는가 — 덩어리를 비워도 되는지의 유일한 판정(순수).
 *
 * ⚠️ 로컬만 보고 판정하면 안 된다. 새로 설치한 기기는 로컬이 비어 있어 "전부 올라갔다"가
 * 자동으로 참이 되고, 그러면 **원격 덩어리에만 있던 기록을 지워버린다.** 실제로 이 실수를
 * 했고 테스트가 잡았다(App.cloudsync).
 *
 * 그래서 기준은 `local ∪ remote` 인 **병합 결과**다. 거기 있는 모든 레코드가 하위 문서에
 * 올라간 것이 확인돼야 덩어리가 비로소 잉여가 된다. 새 기기는 첫 동기에서 원격 기록을
 * 받아 미러링하고, **그다음 동기에서** 비운다 — 스스로 낫는 순서다.
 */
export function isPayloadMirrored(
  payload: {shoes?: unknown; runs?: unknown; medals?: unknown},
  markers: Partial<Record<RecordKind, PushedMarkers>>,
): boolean {
  const pick = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  return (
    allMirrored(pick(payload.runs), markers.runs ?? {}) &&
    allMirrored(pick(payload.shoes), markers.shoes ?? {}) &&
    allMirrored(pick(payload.medals), markers.medals ?? {})
  );
}

/**
 * 덩어리 페이로드에서 레코드 배열을 **비운다**(순수).
 *
 * 키를 지우지 않고 **빈 배열로 둔다.** 이유: 병합(mergeCloudData)이 합집합이라,
 * 키가 없으면 원격에 남아 있던 옛 배열이 그대로 살아 돌아와 문서가 안 줄어든다.
 * 빈 배열을 명시적으로 써야 원격의 옛 내용이 지워진다.
 *
 * 설정·진척·기타 필드는 손대지 않는다.
 */
export function stripRecordArrays<T extends Record<string, unknown>>(payload: T): T {
  return {...payload, shoes: [], runs: [], medals: []};
}
