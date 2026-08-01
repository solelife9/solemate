// ============================================================================
// lib/raceStore.ts — 대회 카탈로그 Firestore 조회 + 정규화/머지 (서버 갱신형)
//
// 서버에서 대회를 추가/수정하면 앱 재배포 없이 반영된다. 'races' 는 전역 컬렉션(계정별
// 아님)이고 규칙상 로그인 사용자에게 **읽기 전용**이다(쓰기는 admin SDK 스크립트만 —
// scripts/seed-races.mjs). 좌표(startLat/startLon) 있으면 Tier1(위치 자동감지), 없으면
// Tier2(검색·선택만).
//
// ⚠️ **캐시·간격·시드 머지는 이 파일의 책임이 아니다** — lib/raceCatalogRemote 가 맡는다.
// 원래 여기 있던 `fetchRaces()` 는 부팅마다 컬렉션 전량을 읽어 사용자 하루 읽기의 96%를
// 쓰고 있었다(AUDIT 2 I-1). 같은 실수가 되풀이되지 않도록 **전량 조회 함수를 아예 두지
// 않는다** — 이 파일이 내주는 조회는 커서 기반 증분 하나뿐이다.
// ============================================================================
import {type RaceEvent, type RaceDistance} from '../data/raceEvents';

const DISTS: RaceDistance[] = ['full', 'half', '10k', '5k'];

/** Firestore 문서 → RaceEvent(방어적). 필수(name·date) 없으면 null(버림). */
export function normalizeRace(id: string, d: unknown): RaceEvent | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.date !== 'string') return null;
  const distances = Array.isArray(o.distances)
    ? (o.distances.filter((x) => (DISTS as string[]).includes(x as string)) as RaceDistance[])
    : [];
  return {
    id,
    name: o.name,
    date: o.date,
    region: typeof o.region === 'string' ? o.region : '',
    venue: typeof o.venue === 'string' ? o.venue : '',
    startLat: typeof o.startLat === 'number' ? o.startLat : undefined,
    startLon: typeof o.startLon === 'number' ? o.startLon : undefined,
    distances,
  };
}

/** 시드 + 원격 머지 — 같은 id 는 원격(서버 갱신) 우선. */
export function mergeRaces(seed: RaceEvent[], remote: RaceEvent[]): RaceEvent[] {
  const byId = new Map<string, RaceEvent>();
  for (const r of seed) byId.set(r.id, r);
  for (const r of remote) byId.set(r.id, r);
  return [...byId.values()];
}

/** Firestore Timestamp(또는 숫자) → ms. 없거나 이상하면 0. */
function updatedAtMs(data: unknown): number {
  const u = (data as {updatedAt?: unknown} | null)?.updatedAt as
    | {toMillis?: () => number}
    | number
    | undefined;
  if (typeof u === 'number') return Number.isFinite(u) ? u : 0;
  if (u && typeof u.toMillis === 'function') {
    const ms = u.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

/**
 * Firestore 'races' 에서 **바뀐 것만** 읽는다(AUDIT 2 I-1).
 *
 * 원래는 부팅마다 컬렉션 전량(82문서)을 읽었다 — 하루 앱 실행 3회면 246 읽기이고, 그게
 * 사용자 한 명 하루 읽기의 96% 였다. 대회 목록은 연 단위로 바뀌는 데이터인데 실행 단위로
 * 읽고 있었던 것이다. 신발 카탈로그가 같은 문제를 이미 커서 방식으로 풀어 뒀다
 * (services/shoes.listShoesUpdatedAfter) — 그 규약을 그대로 따른다.
 *
 * 돌려주는 `maxUpdatedAtMs` 는 **서버가 찍은 값 중 최대**다. 클라이언트 시계를 기준으로
 * 삼으면 기기 시간이 앞서 있을 때 그 사이 올라온 문서를 영영 못 받는다.
 *
 * **실패와 '변경 0건'을 구분한다.** 실패는 `null`(캐시를 그대로 두라), 변경 없음은 빈 배열.
 * 이 구분이 없으면 오프라인 한 번에 캐시가 비워진다.
 *
 * ⚠️ 증분이 성립하려면 문서에 `updatedAt` 이 있어야 한다(scripts/seed-races.mjs 가 찍는다).
 * 없는 문서는 커서에 걸리지 않지만, 커서가 0인 **첫 조회는 전량**이라 캐시에는 들어온다.
 */
export async function fetchRacesUpdatedAfter(
  afterMs: number | null,
): Promise<{races: RaceEvent[]; maxUpdatedAtMs: number} | null> {
  try {
    const fs = require('@react-native-firebase/firestore');
    const {getFirestore, collection, getDocs, query, where} = fs;
    if (!getFirestore || !collection || !getDocs) return null;
    const col = collection(getFirestore(), 'races');
    const useCursor = !!afterMs && afterMs > 0 && !!query && !!where;
    const snap = useCursor
      ? await getDocs(query(col, where('updatedAt', '>', new Date(afterMs))))
      : await getDocs(col);

    const races: RaceEvent[] = [];
    let maxMs = afterMs ?? 0;
    snap.forEach((docSnap: {id: string; data: () => unknown}) => {
      const data = docSnap.data();
      const ms = updatedAtMs(data);
      if (ms > maxMs) maxMs = ms;
      const r = normalizeRace(docSnap.id, data);
      if (r) races.push(r);
    });
    return {races, maxUpdatedAtMs: maxMs};
  } catch {
    // 미링크·오프라인·규칙 거부 — 캐시를 유지하라는 뜻으로 null.
    return null;
  }
}
