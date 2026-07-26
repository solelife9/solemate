// ============================================================================
// lib/raceStore.ts — 대회 카탈로그 Firestore 로더 (서버 갱신형)
//
// 번들 시드(SEED_RACES)에 Firestore 'races' 컬렉션을 머지한다(원격 우선). 서버에서 대회를
// 추가/수정하면 앱 재배포 없이 다음 부팅에 반영된다. Firestore 미링크/네트워크 실패/규칙
// 거부 시 시드만 반환(앱 안 죽음). 'races' 는 전역 읽기 컬렉션(계정별 아님) — Firestore
// 규칙에서 공개 read 허용 + 문서 필드는 RaceEvent 와 동일.
//   좌표(startLat/startLon) 있으면 Tier1(위치 자동감지), 없으면 Tier2(검색·선택만).
// ============================================================================
import {SEED_RACES, type RaceEvent, type RaceDistance} from '../data/raceEvents';

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

/**
 * Firestore 'races' 를 읽어 시드에 머지해 반환. 실패(미링크/네트워크/규칙/빈 컬렉션)면
 * 시드만. App 이 부팅 시 1회 호출해 races 상태로 쓴다(감지·대회 선택).
 */
export async function fetchRaces(): Promise<RaceEvent[]> {
  try {

    const fs = require('@react-native-firebase/firestore');
    const getFirestore = fs.getFirestore;
    const collection = fs.collection;
    const getDocs = fs.getDocs;
    if (!getFirestore || !collection || !getDocs) return SEED_RACES;
    const snap = await getDocs(collection(getFirestore(), 'races'));
    const remote: RaceEvent[] = [];
    snap.forEach((docSnap: {id: string; data: () => unknown}) => {
      const r = normalizeRace(docSnap.id, docSnap.data());
      if (r) remote.push(r);
    });
    return remote.length ? mergeRaces(SEED_RACES, remote) : SEED_RACES;
  } catch {
    return SEED_RACES;
  }
}
