// ============================================================================
// data/raceEvents.ts — 마라톤 대회 카탈로그 (단일 소스)
//
// 번들 시드(races.json)는 "첫 실행 + 오프라인 폴백". 진짜 정본은 Firestore `races`
// 컬렉션이라 대회 추가/삭제/수정이 앱 재배포 없이 반영된다(lib/raceStore 가 로드·머지).
// 목록에 없는 대회는 직접 입력 + 기록증 OCR 대회명으로 커버한다.
//
// 핵심: 러닝의 GPS 시작 위치 + 날짜로 '그날 그 장소의 대회'를 특정 감지 —
// "2026 JTBC 서울마라톤 달리셨나요?" 를 콕 집어 띄운다(거리만 보는 것보다 정확).
// ============================================================================
import racesData from './races.json';

/** 종목 키 — bestEfforts STANDARD_DISTANCES 와 정렬(5k/10k/half/full). */
export type RaceDistance = 'full' | 'half' | '10k' | '5k';

export interface RaceEvent {
  id: string;
  name: string;
  /** 개최일 YYYY-MM-DD (로컬 날짜) */
  date: string;
  region: string;
  venue: string;
  /** 출발지 대표 좌표 — 없으면 위치 자동감지는 불가(검색/직접선택은 가능). */
  startLat?: number;
  startLon?: number;
  distances: RaceDistance[];
}

// 번들 시드 → 타입 정합. 좌표는 선택(없으면 undefined).
export const SEED_RACES: RaceEvent[] = (
  racesData.races as Array<Partial<RaceEvent> & {id: string; name: string; date: string}>
).map((r) => ({
  id: r.id,
  name: r.name,
  date: r.date,
  region: r.region ?? '',
  venue: r.venue ?? '',
  startLat: typeof r.startLat === 'number' ? r.startLat : undefined,
  startLon: typeof r.startLon === 'number' ? r.startLon : undefined,
  distances: (r.distances as RaceDistance[]) ?? [],
}));

// ── 지오 유틸 ────────────────────────────────────────────────────────────────
/** 두 위경도 사이 거리(km) — Haversine. 감지 반경 판정용. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 출발지 감지 반경(km) — 출발선 근사 좌표라 넉넉히. 다른 러닝과 구분되면 충분. */
export const RACE_DETECT_RADIUS_KM = 3;

// ── 감지 ────────────────────────────────────────────────────────────────────
export type RaceMatch = {
  /**
   * 'geo'        = 날짜+위치(좌표 반경)로 특정 대회 확정.
   * 'candidates' = 같은 날짜에 그 종목을 여는 알려진 대회가 있음(좌표 없는 캘린더 대회 등) →
   *                사용자가 목록에서 고른다(자동 단정 X, 제안 O). 여러 개일 수 있음.
   */
  kind: 'geo' | 'candidates';
  race?: RaceEvent;            // geo 매치일 때만(확정)
  candidates?: RaceEvent[];    // candidates 일 때(고를 후보들)
  distance: RaceDistance;      // 완주로 판정된 종목(아카이브 라벨)
};

/**
 * 대회 완주 거리 판정 — 실측 거리(km)를 표준 거리 ±3% 로 본다(GPS 오차 흡수).
 * 5K·10K 포함: 국내 마라톤은 10K·5K 참가자가 가장 많고 초보에겐 큰 자랑거리. 예전엔 5K 를
 * '훈련과 겹침'으로 제외했으나, 이제 감지가 '그 날짜에 실제 대회가 있을 때만' 뜨도록 게이팅돼
 * (detectRace Tier2) 데일리 5K 로는 배너가 안 뜬다 → 5K 대회도 안전하게 감지 대상에 포함.
 */
export function completedRaceDistance(km: number): RaceDistance | null {
  const within = (target: number) => Math.abs(km - target) / target <= 0.03;
  if (within(42.195)) return 'full';
  if (within(21.0975)) return 'half';
  if (within(10)) return '10k';
  if (within(5)) return '5k';
  return null;
}

/**
 * 러닝 → 대회 감지(3티어). 오탐(평일 롱런 스팸) 없이, 진짜 대회일 때만 뜬다.
 *  1) geo: 같은 날짜에 열린 대회 중 출발 좌표가 시작 위치와 반경 내 → 그 대회 확정(가장 가까운 것).
 *          위치+날짜가 맞으면 거리 미달이어도 대회로 보고 대회 최장 종목으로 라벨.
 *  2) candidates: 완주 거리가 대회 거리(풀/하프/10K/5K)이고, 같은 날짜에 그 종목을 여는 대회가
 *          있을 때 → 그 대회들을 후보로 제안. 단 좌표가 있는 대회인데 러닝이 그 반경 밖이면
 *          '거기엔 없었던 것'이라 제외한다(제주에서 뛴 날 서울 대회 안 뜸). 좌표 없는 캘린더
 *          대회는 위치 검증이 불가하므로 날짜+종목만으로 후보에 포함.
 *  3) 그 날짜에 알려진 대회가 없으면 null → 감지 안 함(평일 롱런엔 절대 안 뜬다).
 */
export function detectRace(
  input: {date: string; startLat?: number; startLon?: number; km: number},
  races: RaceEvent[] = SEED_RACES,
): RaceMatch | null {
  const {date, startLat, startLon, km} = input;
  const completed = completedRaceDistance(km);
  const hasCoords = typeof startLat === 'number' && typeof startLon === 'number';

  // 1) geo — 위치+날짜 특정.
  if (hasCoords) {
    let best: {race: RaceEvent; d: number} | null = null;
    for (const r of races) {
      if (r.date !== date || typeof r.startLat !== 'number' || typeof r.startLon !== 'number') continue;
      const d = haversineKm(startLat as number, startLon as number, r.startLat, r.startLon);
      if (d <= RACE_DETECT_RADIUS_KM && (!best || d < best.d)) best = {race: r, d};
    }
    if (best) {
      const distance = completed ?? longestDistance(best.race) ?? '10k';
      return {kind: 'geo', race: best.race, distance};
    }
  }

  // 2) candidates — 완주 거리가 대회 거리일 때만, 그 날짜에 그 종목 여는 대회 제안(위치로 부정 가능한 것 제외).
  if (completed) {
    const candidates = races.filter((r) => {
      if (r.date !== date || !r.distances.includes(completed)) return false;
      // 좌표 있는 대회 + 러닝 좌표 있음 → 반경 밖이면 거기엔 없었던 것(제외). geo(Tier1)에서 이미
      // 반경 내는 잡혔으므로 여기 남는 좌표대회는 사실상 '반경 밖'이라 제외된다.
      if (hasCoords && typeof r.startLat === 'number' && typeof r.startLon === 'number') {
        return haversineKm(startLat as number, startLon as number, r.startLat, r.startLon) <= RACE_DETECT_RADIUS_KM;
      }
      return true; // 좌표 없는 캘린더 대회 · 러닝 좌표 없음 → 위치 검증 불가 → 후보 포함
    });
    if (candidates.length > 0) return {kind: 'candidates', candidates, distance: completed};
  }

  // 3) 그 날짜에 알려진 대회 없음 → 감지 안 함(스팸 방지).
  return null;
}

/** 대회가 여는 종목 중 최장(라벨 추정용). */
export function longestDistance(r: RaceEvent): RaceDistance | null {
  const order: RaceDistance[] = ['full', 'half', '10k', '5k'];
  for (const d of order) if (r.distances.includes(d)) return d;
  return null;
}

// ── 선택/검색 ────────────────────────────────────────────────────────────────
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** 러닝 날짜 기준 근접순 정렬(대회 선택 화면 기본) — |race.date - runDate| 작은 순. */
export function racesByProximity(runDate: string, races: RaceEvent[] = SEED_RACES): RaceEvent[] {
  const t = Date.parse(runDate);
  const key = (r: RaceEvent) => {
    const rt = Date.parse(r.date);
    return Number.isNaN(rt) || Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : Math.abs(rt - t);
  };
  return [...races].sort((a, b) => key(a) - key(b));
}

/** 대회명·지역·개최월 검색(부분일치). 빈 쿼리는 전체. */
export function searchRaces(query: string, races: RaceEvent[] = SEED_RACES): RaceEvent[] {
  const q = norm(query);
  if (!q) return races;
  return races.filter((r) => norm(`${r.name} ${r.region} ${r.venue}`).includes(q));
}

/** 한글 종목 라벨(아카이브·감지 배너용). */
export const RACE_DISTANCE_LABEL: Record<RaceDistance, string> = {
  full: '풀코스',
  half: '하프',
  '10k': '10K',
  '5k': '5K',
};
