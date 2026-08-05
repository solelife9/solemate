// ============================================================================
// lib/healthConnect.ts — 안드로이드 심박 소스 (Health Connect)
//
// 왜: 안드로이드에는 심박이 아예 없었다. 그래서 평균 심박·심박 존·VO2max 가 전부 비고,
// 트레이닝 부하도 심박 기반이 아니라 페이스 기반으로 떨어진다(실측 2026-08-05: 같은 러닝을
// 아이폰은 76(심박 기반), 안드로이드는 52(페이스 기반)로 봤다). 심박 없이 출시하면
// 안드로이드는 반쪽 앱이다 — 민우님 판단으로 출시 전 필수로 올렸다.
//
// 이 파일은 lib/healthkit.ts 의 **안드로이드 짝**이다. 함수 이름·인자·반환·부작용을 그대로
// 맞춘다(hrTrack_<runId> 저장 규약, richer-wins 정책, 실패 시 조용한 0/false). 그래야
// 호출부(lib/health.ts 파사드)가 플랫폼을 몰라도 된다.
//
// ── Health Connect 가 무엇인가 ────────────────────────────────────────────────
// 안드로이드의 '건강 데이터 창고'다(애플의 건강 앱에 해당). **센서가 아니다** — 갤럭시 워치·
// 가민·핏빗 같은 기기가 여기에 쓰고, 우리는 읽는다. 즉 워치가 없는 안드로이드 사용자에게는
// 여전히 심박이 없다. 이건 아이폰도 마찬가지다(애플워치 없으면 심박 없음) — 결함이 아니라
// 플랫폼 대칭이다.
//
// ── 안전 규약 (lib/healthkit.ts 와 동일) ─────────────────────────────────────
//  · 네이티브 모듈은 지연 require — 모듈 결측(jest·시뮬)에서 import 만으로 죽지 않는다.
//  · 모든 함수는 throw 하지 않는다. 심박은 부가 정보이고 러닝 기록이 본질이다.
//  · 권한이 없으면 조용히 0/false. 사용자를 막지 않는다.
// ============================================================================
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** 우리가 쓰는 만큼만 타입을 좁혀 둔다(라이브러리 전체 타입을 앱에 퍼뜨리지 않는다). */
interface HCPermission {
  accessType: 'read' | 'write';
  recordType: string;
}
interface HCModule {
  getSdkStatus(): Promise<number>;
  initialize(): Promise<boolean>;
  requestPermission(perms: HCPermission[]): Promise<HCPermission[]>;
  getGrantedPermissions(): Promise<HCPermission[]>;
  readRecords(recordType: string, options: unknown): Promise<{records: unknown[]}>;
  insertRecords(records: unknown[]): Promise<string[]>;
  openHealthConnectSettings(): void;
}

/** SDK 사용 가능 상태 코드(라이브러리 상수와 동일). 3 = 사용 가능. */
const SDK_AVAILABLE = 3;

let cached: HCModule | null | undefined;
function mod(): HCModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'android') {
    cached = null;
    return cached;
  }
  try {
    cached = require('react-native-health-connect') as HCModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** 우리가 요구하는 권한 — 읽기는 심박·안정시 심박, 쓰기는 러닝 세션(활동 기록 크레딧). */
const PERMISSIONS: HCPermission[] = [
  {accessType: 'read', recordType: 'HeartRate'},
  {accessType: 'read', recordType: 'RestingHeartRate'},
  {accessType: 'read', recordType: 'ExerciseSession'},
  {accessType: 'write', recordType: 'ExerciseSession'},
  {accessType: 'write', recordType: 'Distance'},
  {accessType: 'write', recordType: 'TotalCaloriesBurned'},
];

const has = (granted: HCPermission[], accessType: 'read' | 'write', recordType: string): boolean =>
  granted.some(p => p.accessType === accessType && p.recordType === recordType);

/**
 * 이 기기에서 Health Connect 를 쓸 수 있는가(동기 판정 — 화면 분기용).
 * 모듈 존재만 본다. SDK 설치 여부는 비동기라 hcEnsureLinked 에서 확인한다.
 */
export function hcAvailable(): boolean {
  return mod() !== null;
}

/** SDK 가 실제로 설치·사용 가능한 상태인가(Health Connect 앱 미설치면 false). */
export async function hcSdkReady(): Promise<boolean> {
  const m = mod();
  if (!m) return false;
  try {
    return (await m.getSdkStatus()) === SDK_AVAILABLE;
  } catch {
    return false;
  }
}

/** 심박 읽기 권한이 이미 허용돼 있는가. 권한 창을 띄우지 않는다. */
export async function hcLinked(): Promise<boolean> {
  const m = mod();
  if (!m) return false;
  try {
    if (!(await hcSdkReady())) return false;
    await m.initialize();
    const granted = await m.getGrantedPermissions();
    return has(granted, 'read', 'HeartRate');
  } catch {
    return false;
  }
}

/**
 * 권한 창을 띄워 연결한다(사용자 명시 동작에서만 호출할 것).
 * 심박 읽기가 허용되면 true — 나머지(쓰기 등)는 없어도 앱은 동작한다.
 */
export async function hcLink(): Promise<boolean> {
  const m = mod();
  if (!m) return false;
  try {
    if (!(await hcSdkReady())) return false;
    await m.initialize();
    const granted = await m.requestPermission(PERMISSIONS);
    return has(granted ?? [], 'read', 'HeartRate');
  } catch {
    return false;
  }
}

/** Health Connect 설정 화면 열기 — 사용자가 권한을 되돌리고 싶을 때의 출구. */
export function hcOpenSettings(): void {
  try {
    mod()?.openHealthConnectSettings();
  } catch {
    /* 설정 앱이 없거나 실패 — 무시 */
  }
}

/**
 * 러닝 시간창의 심박을 읽어 `hrTrack_<runId>` 로 저장한다.
 * lib/healthkit.ts 의 hkBackfillHeartRate 와 **동일한 계약**(반환=저장한 표본 수, 0=미저장).
 *
 * richer-wins: 기존 트랙이 더 촘촘하면 보존한다(실측 우선). 빈약한 스트레이 몇 점만 있으면
 * 창고 실측으로 교정한다 — 저장 직후엔 워치→폰 동기화가 덜 돼 몇 점만 잡히는 일이 흔하다.
 */
export async function hcBackfillHeartRate(
  runId: string,
  startMs: number,
  endMs: number,
): Promise<number> {
  const m = mod();
  if (!m || !runId || !(startMs < endMs)) return 0;
  if (!(await hcLinked())) return 0;
  try {
    const res = await m.readRecords('HeartRate', {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
      },
    });
    // HeartRate 레코드는 한 건에 여러 samples 를 담는다(구간 묶음) — 전부 펼친다.
    const track: {t: number; bpm: number}[] = [];
    for (const rec of (res?.records ?? []) as {samples?: {time: string; beatsPerMinute: number}[]}[]) {
      for (const s of rec?.samples ?? []) {
        const tMs = new Date(s.time).getTime();
        if (!Number.isFinite(tMs)) continue;
        const bpm = Math.round(Number(s.beatsPerMinute) || 0);
        if (!(bpm > 30 && bpm < 240)) continue; // 명백한 노이즈 컷(HK 경로와 동일 기준)
        track.push({t: Math.max(0, Math.round((tMs - startMs) / 1000)), bpm});
      }
    }
    if (track.length < 2) return 0; // 표시 가치 없음(RunDetail 계약과 동일)
    track.sort((a, b) => a.t - b.t);

    const existing = await AsyncStorage.getItem('hrTrack_' + runId);
    if (existing) {
      try {
        const ex = JSON.parse(existing);
        if (Array.isArray(ex) && ex.length >= track.length) return 0;
      } catch {
        /* 파싱 실패 → 덮어쓴다 */
      }
    }
    await AsyncStorage.setItem('hrTrack_' + runId, JSON.stringify(track));
    return track.length;
  } catch {
    return 0;
  }
}

/** 안정시 심박(bpm). 최근 30일 중 가장 최신 값. 없으면 0. */
export async function hcRestingHR(): Promise<number> {
  const m = mod();
  if (!m) return 0;
  if (!(await hcLinked())) return 0;
  try {
    const end = Date.now();
    const start = end - 30 * 24 * 3600 * 1000;
    const res = await m.readRecords('RestingHeartRate', {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
      },
    });
    const recs = (res?.records ?? []) as {time: string; beatsPerMinute: number}[];
    if (recs.length === 0) return 0;
    // 가장 최신 한 건. 시간 파싱 실패는 건너뛴다.
    let bestT = -1;
    let bpm = 0;
    for (const r of recs) {
      const t = new Date(r.time).getTime();
      if (!Number.isFinite(t) || t <= bestT) continue;
      const v = Math.round(Number(r.beatsPerMinute) || 0);
      if (v > 25 && v < 150) {
        bestT = t;
        bpm = v;
      }
    }
    return bpm;
  } catch {
    return 0;
  }
}

/**
 * Keego 러닝을 Health Connect 에 운동 세션으로 기록한다(삼성헬스 등에서 보이게).
 * 같은 시간창에 이미 세션이 있으면 건너뛴다 — 중복 기록으로 운동 시간이 이중 집계되는 사고 방지
 * (hkSaveRunWorkout 과 동일한 방어).
 */
export async function hcSaveRunWorkout(
  km: number,
  startMs: number,
  endMs: number,
  kcal?: number,
): Promise<boolean> {
  const m = mod();
  if (!m || !(km > 0) || !(startMs < endMs)) return false;
  if (!(await hcLinked())) return false;
  try {
    const granted = await m.getGrantedPermissions();
    if (!has(granted, 'write', 'ExerciseSession')) return false;
    if (await hcFindRunWorkoutWindowMs(startMs, endMs)) return false; // 이미 있다

    const startTime = new Date(startMs).toISOString();
    const endTime = new Date(endMs).toISOString();
    const records: unknown[] = [
      {recordType: 'ExerciseSession', startTime, endTime, exerciseType: 56 /* RUNNING */, title: 'Keego 러닝'},
      {recordType: 'Distance', startTime, endTime, distance: {unit: 'meters', value: Math.round(km * 1000)}},
    ];
    if (kcal && kcal > 0 && has(granted, 'write', 'TotalCaloriesBurned')) {
      records.push({
        recordType: 'TotalCaloriesBurned',
        startTime,
        endTime,
        energy: {unit: 'kilocalories', value: Math.round(kcal)},
      });
    }
    await m.insertRecords(records);
    return true;
  } catch {
    return false;
  }
}

/** 주어진 시간창과 겹치는 운동 세션이 이미 있는가(중복 저장 방지 내부 헬퍼). */
async function hcFindRunWorkoutWindowMs(startMs: number, endMs: number): Promise<boolean> {
  const m = mod();
  if (!m) return false;
  try {
    const res = await m.readRecords('ExerciseSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
      },
    });
    return (res?.records ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * 워치가 기록한 러닝 세션의 실제 시간창을 찾는다(폰 시계와 워치 시계가 어긋날 때 보정용).
 * lib/healthkit.ts 의 hkFindRunWorkoutWindow 와 동일 계약.
 */
export async function hcFindRunWorkoutWindow(
  dateISO: string,
  durationS: number,
  tolS = 120,
): Promise<{startMs: number; endMs: number} | null> {
  const m = mod();
  if (!m || !dateISO || !(durationS > 0)) return null;
  if (!(await hcLinked())) return null;
  try {
    const dayStart = new Date(dateISO + 'T00:00:00').getTime();
    if (!Number.isFinite(dayStart)) return null;
    const res = await m.readRecords('ExerciseSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(dayStart).toISOString(),
        endTime: new Date(dayStart + 24 * 3600 * 1000).toISOString(),
      },
    });
    let best: {startMs: number; endMs: number} | null = null;
    let bestDiff = Infinity;
    for (const r of (res?.records ?? []) as {startTime: string; endTime: string}[]) {
      const s = new Date(r.startTime).getTime();
      const e = new Date(r.endTime).getTime();
      if (!Number.isFinite(s) || !Number.isFinite(e) || !(s < e)) continue;
      const diff = Math.abs((e - s) / 1000 - durationS);
      if (diff <= tolS && diff < bestDiff) {
        bestDiff = diff;
        best = {startMs: s, endMs: e};
      }
    }
    return best;
  } catch {
    return null;
  }
}

/** 이미 연결돼 있으면 true, 아니면 권한 창을 띄운다(자동 호출 금지 — 사용자 동작에서만). */
export async function hcEnsureLinked(): Promise<boolean> {
  if (await hcLinked()) return true;
  return hcLink();
}
