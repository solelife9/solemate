// ============================================================================
// lib/medals.ts — 마라톤 메달 아카이브 데이터 모델 + 로컬 저장(로컬 우선)
//
// 완주한 대회의 메달·기록을 보관하는 컬렉션(신발 명예의 전당과 짝). 로컬 우선으로
// AsyncStorage 에 영속하고, App 이 백업 페이로드(medals)에 실어 Firestore 동기화한다.
// 정본 시간은 '공식 기록(칩 타임)' — GPS 앱 측정과 수십 초 차이가 날 수 있어서.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {RaceDistance} from '../data/raceEvents';

const K_MEDALS = 'medals_v1';

export interface Medal {
  id: string;
  /** 카탈로그 대회 id — 직접 입력/미매치면 없음. */
  raceId?: string;
  /** 표시용 대회명(카탈로그명 또는 직접 입력). */
  raceName: string;
  region?: string;
  /** 대회일 YYYY-MM-DD. */
  date: string;
  distance: RaceDistance;
  /** 공식 기록(칩 타임) 초 — 정본. 기록증/직접 입력. */
  officialTimeSec?: number;
  /** 앱 측정 시간 초 — 참고(공식과 차이 안내용). */
  appTimeSec?: number;
  /** 공식 기록 기준 1km 페이스(초). */
  paceSec?: number;
  /** 배번호 — 조회 키(상세에 작게). */
  bib?: string;
  /** 메달 사진(원형 크롭). */
  medalPhotoUri?: string;
  /** 기록증 사진(OCR 원본 보관). */
  certPhotoUri?: string;
  /** 연결된 러닝 id — 상세에서 그 러닝으로 이동. */
  runId?: string;
  /** 생성 시각 ISO(정렬 안정성). */
  createdAt: string;
  /** soft-delete 묘비 — true 면 삭제됨. 배열에 남겨 동기 시 삭제가 전파되게 한다(부활 방지). */
  deleted?: boolean;
  /** 마지막 변경 epoch ms — mergeMedals 의 '최신 우선' 머지 기준(삭제/재등록 우열). */
  updatedAt?: number;
}

/** 살아있는(삭제 안 된) 메달만 — 화면 렌더/집계용. 묘비는 배열에 남기되 여기서 거른다(방어적). */
export function liveMedals(medals: Medal[]): Medal[] {
  return (Array.isArray(medals) ? medals : []).filter((m) => m.deleted !== true);
}

/** 저장에 쓸 시간(초) — 공식 있으면 공식, 없으면 앱 측정. 라벨의 정본. */
export function medalTimeSec(m: Medal): number | undefined {
  return typeof m.officialTimeSec === 'number' && m.officialTimeSec > 0
    ? m.officialTimeSec
    : m.appTimeSec;
}

/** 최신 대회일 우선 정렬(같으면 생성 역순). 아카이브 갤러리 표시 순서. */
export function sortMedals(medals: Medal[]): Medal[] {
  return [...medals].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

// 종목별 거리(km) — 완주 거리 합계용. RaceDistance 와 1:1(누락 시 0).
const DIST_KM: Record<RaceDistance, number> = {full: 42.195, half: 21.0975, '10k': 10, '5k': 5};
// 최장 종목 판정 순서(작은→큰).
const DIST_ORDER: RaceDistance[] = ['5k', '10k', 'half', 'full'];

/**
 * 아카이브 요약 — 메달 수·완주 거리 합(km, 소수1자리)·최장 종목. 상단 요약 스탯 헤더용.
 * 빈 배열이면 {count:0, totalKm:0, longest:null}. 입력 불변.
 */
export function medalArchiveStats(medals: Medal[]): {count: number; totalKm: number; longest: RaceDistance | null} {
  const arr = liveMedals(Array.isArray(medals) ? medals : []);
  let totalKm = 0;
  let longest: RaceDistance | null = null;
  for (const m of arr) {
    totalKm += DIST_KM[m.distance] ?? 0;
    if (longest === null || DIST_ORDER.indexOf(m.distance) > DIST_ORDER.indexOf(longest)) longest = m.distance;
  }
  return {count: arr.length, totalKm: Math.round(totalKm * 10) / 10, longest};
}

/** 배열 정규화 — 백업/저장에서 읽은 unknown 을 안전한 Medal[] 로. */
export function normalizeMedals(raw: unknown): Medal[] {
  if (!Array.isArray(raw)) return [];
  const out: Medal[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.raceName !== 'string' || typeof o.date !== 'string') continue;
    const dist = o.distance;
    if (dist !== 'full' && dist !== 'half' && dist !== '10k' && dist !== '5k') continue;
    out.push({
      id: o.id,
      raceId: typeof o.raceId === 'string' ? o.raceId : undefined,
      raceName: o.raceName,
      region: typeof o.region === 'string' ? o.region : undefined,
      date: o.date,
      distance: dist,
      officialTimeSec: numOrU(o.officialTimeSec),
      appTimeSec: numOrU(o.appTimeSec),
      paceSec: numOrU(o.paceSec),
      bib: typeof o.bib === 'string' ? o.bib : undefined,
      medalPhotoUri: typeof o.medalPhotoUri === 'string' ? o.medalPhotoUri : undefined,
      certPhotoUri: typeof o.certPhotoUri === 'string' ? o.certPhotoUri : undefined,
      runId: typeof o.runId === 'string' ? o.runId : undefined,
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
      ...(o.deleted === true ? {deleted: true} : {}),
      ...(typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? {updatedAt: o.updatedAt} : {}),
    });
  }
  return out;
}
const numOrU = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

// ── 로컬 영속 ────────────────────────────────────────────────────────────────
export async function loadMedals(): Promise<Medal[]> {
  try {
    const raw = await AsyncStorage.getItem(K_MEDALS);
    return raw ? sortMedals(normalizeMedals(JSON.parse(raw))) : [];
  } catch {
    return [];
  }
}

export async function saveMedals(medals: Medal[]): Promise<void> {
  try {
    await AsyncStorage.setItem(K_MEDALS, JSON.stringify(medals));
  } catch {
    /* 저장 실패는 삼킨다(다음 저장에서 복구) */
  }
}

/** 메달 추가(중복 id 는 교체) → 최신순 정렬해 반환·영속. */
export async function addMedal(medal: Medal): Promise<Medal[]> {
  const cur = await loadMedals();
  const next = sortMedals([medal, ...cur.filter((m) => m.id !== medal.id)]);
  await saveMedals(next);
  return next;
}

/**
 * 메달 삭제 — 하드삭제 대신 soft-delete 묘비(`deleted:true` + updatedAt)로 남긴다. 배열에
 * 그대로 두어(드롭 않음) 동기 시 삭제가 다른 기기로 전파돼 부활을 막는다. 화면/집계는
 * liveMedals 로 거른다. 전체 배열(묘비 포함)을 영속·반환한다.
 */
export async function removeMedal(id: string, now: number): Promise<Medal[]> {
  const cur = await loadMedals();
  const next = cur.map((m) => (m.id === id ? {...m, deleted: true, updatedAt: now} : m));
  await saveMedals(next);
  return next;
}
