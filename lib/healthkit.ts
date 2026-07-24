// ============================================================================
// lib/healthkit.ts — Apple 건강(HealthKit) 포트
// ----------------------------------------------------------------------------
// v1 범위(워치 전용 앱 이전 단계 — 사용자가 애플워치를 곧 연결할 예정):
//   · 연동(hkLink): 심박·안정시심박 읽기 + 워크아웃 쓰기 권한 요청, 성공 시 플래그 영속.
//   · 심박 백필(hkBackfillHeartRate): 러닝 저장 직후 그 시간창의 HK 심박 샘플을
//     hrTrack_<id> 사이드카로 채운다(형식은 워치 컴패니언과 동일 {t,bpm}) —
//     사용자가 애플 기본 '운동' 앱을 병행 실행하면 촘촘한 심박이 들어온다.
//     이미 hrTrack 이 있으면(워치 컴패니언이 실시간 수집) 덮지 않는다.
//   · 워크아웃 기록(hkSaveRunWorkout): Keego 러닝을 Apple 건강에 러닝 워크아웃으로
//     저장한다(활동 링 크레딧 — 나이키런과 동급의 시민의식).
//   · 안정시심박(hkRestingHR): HK 최신값 → Karvonen(HR존) 정확도 향상용 자동 채움.
//
// 원칙: 전부 graceful — 모듈 부재(안드로이드/테스트)·미연동·권한거부·쿼리실패는
// 조용히 0/false 로 떨어지고 앱 동작에 영향이 없다. throw 금지.
// 실시간 심박 스트림은 watchOS 앱(HKWorkoutSession)에서 — 후속 단계.
// ============================================================================
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LINKED_KEY = 'hk_linked_v1';

type HKModule = typeof import('@kingstinct/react-native-healthkit');

// 모듈 lazy-load — Nitro 네이티브 바인딩은 iOS 기기에서만 존재한다.
// undefined = 미시도, null = 사용 불가(비 iOS/로드 실패).
let cached: HKModule | null | undefined;
function mod(): HKModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'ios') {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('@kingstinct/react-native-healthkit') as HKModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** 이 기기에서 HealthKit 을 쓸 수 있는가(연동 행 노출 여부). */
export function hkAvailable(): boolean {
  const m = mod();
  try {
    return !!m && m.isHealthDataAvailable();
  } catch {
    return false;
  }
}

/** 사용자가 연동을 완료했는가(플래그 영속 — 권한 UI 를 다시 띄우지 않기 위한 기억). */
export async function hkLinked(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LINKED_KEY)) === '1';
  } catch {
    return false;
  }
}

/**
 * 연동 — 권한 요청(심박·안정시심박 읽기, 워크아웃 쓰기). iOS 는 읽기 승인 여부를
 * 앱에 알려주지 않으므로(프라이버시), 요청 완료 자체를 연동 성공으로 기록한다.
 */
export async function hkLink(): Promise<boolean> {
  const m = mod();
  if (!m) return false;
  try {
    await m.requestAuthorization({
      toRead: [
        'HKQuantityTypeIdentifierHeartRate',
        'HKQuantityTypeIdentifierRestingHeartRate',
      ],
      toShare: ['HKWorkoutTypeIdentifier'],
    });
    await AsyncStorage.setItem(LINKED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * 러닝 시간창의 HK 심박 샘플 → hrTrack_<runId> 백필. 반환 = 저장한 샘플 수.
 * 이미 hrTrack 이 있으면(워치 컴패니언 실시간 수집) HK 가 덮지 않는다(실측 우선).
 */
export async function hkBackfillHeartRate(
  runId: string,
  startMs: number,
  endMs: number,
): Promise<number> {
  const m = mod();
  if (!m || !runId || !(startMs < endMs)) return 0;
  if (!(await hkLinked())) return 0;
  try {
    const samples = await m.queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
      limit: 0, // 비양수 = 전체
      ascending: true,
      unit: 'count/min',
      filter: {date: {startDate: new Date(startMs), endDate: new Date(endMs)}},
    });
    const track = (samples ?? [])
      .map(s => ({
        t: Math.max(0, Math.round((new Date(s.startDate as unknown as string | Date).getTime() - startMs) / 1000)),
        bpm: Math.round(Number(s.quantity) || 0),
      }))
      .filter(p => p.bpm > 30 && p.bpm < 240); // 명백한 노이즈 컷
    if (track.length < 2) return 0; // 표시 가치 없음(RunDetail 계약과 동일)
    // richer-wins — 기존 트랙이 더 촘촘하면 보존(실측 우선), 빈약/가짜(스트레이 1~2점 →
    // 평평한 가짜 직선)면 애플 건강 실측으로 교정한다. 저장 순간엔 워치→폰 HK 동기화가
    // 덜 돼 스트레이만 잡혔다가, 복귀/재시도 때 완전한 시계열로 덮어써진다.
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

/**
 * Keego 러닝을 Apple 건강에 러닝 워크아웃으로 기록한다(활동 링 크레딧).
 * totals.distance 는 미터, energyBurned 는 kcal(HK 기본 단위).
 * 같은 시간창에 이미 워크아웃이 있으면(워치 기본 '운동' 앱 병행 실행) 저장을 건너뛴다 —
 * 건강 앱에 중복 워크아웃 2개가 쌓여 운동 시간이 이중 집계되는 사고 방지.
 */
export async function hkSaveRunWorkout(
  km: number,
  startMs: number,
  endMs: number,
  kcal?: number,
): Promise<boolean> {
  const m = mod();
  if (!m || !(km > 0) || !(startMs < endMs)) return false;
  if (!(await hkLinked())) return false;
  try {
    const overlapping = await m.queryWorkoutSamples({
      limit: 1,
      filter: {date: {startDate: new Date(startMs), endDate: new Date(endMs)}},
    });
    if (overlapping && overlapping.length > 0) return false; // 워치가 이미 기록 — 중복 금지
  } catch {
    // 조회 실패는 저장을 막지 않는다(권한/버전 차이 graceful).
  }
  try {
    await m.saveWorkoutSample(
      m.WorkoutActivityType.running,
      [],
      new Date(startMs),
      new Date(endMs),
      {
        distance: Math.round(km * 1000),
        energyBurned: kcal && kcal > 0 ? Math.round(kcal) : undefined,
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** HK 최신 안정시심박(bpm). 미연동/부재/비현실값이면 0. */
export async function hkRestingHR(): Promise<number> {
  const m = mod();
  if (!m || !(await hkLinked())) return 0;
  try {
    const s = await m.getMostRecentQuantitySample(
      'HKQuantityTypeIdentifierRestingHeartRate',
      'count/min',
    );
    const v = s ? Math.round(Number((s as {quantity?: number}).quantity) || 0) : 0;
    return v > 25 && v < 120 ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * 러닝 상세 복구용 — 그 날짜의 HK 워크아웃 중 러닝 시간과 가장 근접한 것의 '실제 시간창'.
 * (2026-07-24, 실기기: 재설치로 로컬 사이드카(hrTrack_)가 초기화된 예전 기록의 심박 소급
 * 복구. 러닝 저장 시 hkSaveRunWorkout/워치가 남긴 워크아웃이 정확한 시각의 정본이다.)
 * 허용 오차(tolS) 안의 최적 매치가 없으면 null — 엉뚱한 창 백필(가짜 심박)이 '없음'보다
 * 나쁘므로 보수적으로 매치한다. 같은 날 비슷한 길이 런이 여럿이면 가장 근접한 것 하나.
 */
export async function hkFindRunWorkoutWindow(
  dateISO: string,
  durationS: number,
  tolS = 120,
): Promise<{startMs: number; endMs: number} | null> {
  const m = mod();
  if (!m || !dateISO || !(durationS > 0)) return null;
  if (!(await hkLinked())) return null;
  try {
    const dayStart = new Date(`${dateISO}T00:00:00`);
    if (isNaN(dayStart.getTime())) return null;
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const ws = await m.queryWorkoutSamples({
      limit: 0, // 비양수 = 전체(그 날 워크아웃 수는 소수)
      filter: {date: {startDate: dayStart, endDate: dayEnd}},
    });
    let best: {startMs: number; endMs: number} | null = null;
    let bestDiff = tolS + 1;
    for (const w of ws ?? []) {
      const s = new Date(w.startDate as unknown as string | Date).getTime();
      const e = new Date(w.endDate as unknown as string | Date).getTime();
      if (!(s < e)) continue;
      const diff = Math.abs((e - s) / 1000 - durationS);
      if (diff <= tolS && diff < bestDiff) {
        best = {startMs: s, endMs: e};
        bestDiff = diff;
      }
    }
    return best;
  } catch {
    return null;
  }
}
