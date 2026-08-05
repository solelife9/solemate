// ============================================================================
// lib/health.ts — 심박·운동 기록 플랫폼 파사드
//
// 앱은 이 파일만 쓴다. 어느 플랫폼인지 알 필요가 없다:
//   iOS      → lib/healthkit.ts       (Apple 건강 / 애플워치)
//   Android  → lib/healthConnect.ts   (Health Connect / 갤럭시워치·가민·핏빗 등)
//
// 함수 이름을 `hk*` 그대로 둔 이유: 호출부가 45곳(App.tsx·ProfileScreen)인데 이름만 바꾸면
// 실익 없는 변경이 45줄 생긴다. 여기서는 'hk' 를 HealthKit 이 아니라 **'건강 데이터 창고'**
// 로 읽는다. 실제 구현이 어느 쪽인지는 이 파일이 정한다.
//
// ⚠️ 두 창고 모두 **센서가 아니라 저장소**다. 워치가 없으면 어느 쪽이든 심박이 없다
// (아이폰도 애플워치 없으면 없다) — 결함이 아니라 플랫폼 대칭이다.
// ============================================================================
import {Platform} from 'react-native';
import * as ios from './healthkit';
import * as android from './healthConnect';

const isAndroid = Platform.OS === 'android';

/** 이 기기에서 건강 창고를 쓸 수 있는가(동기 — 화면 분기용). */
export const hkAvailable = (): boolean => (isAndroid ? android.hcAvailable() : ios.hkAvailable());

/** 심박 읽기 권한이 이미 있는가(권한 창을 띄우지 않는다). */
export const hkLinked = (): Promise<boolean> => (isAndroid ? android.hcLinked() : ios.hkLinked());

/** 권한 창을 띄워 연결한다 — **사용자 명시 동작에서만** 호출할 것. */
export const hkLink = (): Promise<boolean> => (isAndroid ? android.hcLink() : ios.hkLink());

/** 이미 연결돼 있으면 통과, 아니면 권한 창. */
export const hkEnsureLinked = (): Promise<boolean> =>
  isAndroid ? android.hcEnsureLinked() : ios.hkEnsureLinked();

/** 러닝 시간창의 심박을 읽어 `hrTrack_<runId>` 로 저장. 반환 = 저장한 표본 수(0=미저장). */
export const hkBackfillHeartRate = (
  runId: string,
  startMs: number,
  endMs: number,
): Promise<number> =>
  isAndroid
    ? android.hcBackfillHeartRate(runId, startMs, endMs)
    : ios.hkBackfillHeartRate(runId, startMs, endMs);

/** 안정시 심박(bpm). 없으면 0. */
export const hkRestingHR = (): Promise<number> =>
  isAndroid ? android.hcRestingHR() : ios.hkRestingHR();

/** Keego 러닝을 건강 창고에 운동 세션으로 기록(중복 시간창이면 건너뜀). */
export const hkSaveRunWorkout = (
  km: number,
  startMs: number,
  endMs: number,
  kcal?: number,
): Promise<boolean> =>
  isAndroid
    ? android.hcSaveRunWorkout(km, startMs, endMs, kcal)
    : ios.hkSaveRunWorkout(km, startMs, endMs, kcal);

/** 워치가 기록한 러닝 세션의 실제 시간창(폰·워치 시계 어긋남 보정). */
export const hkFindRunWorkoutWindow = (
  dateISO: string,
  durationS: number,
  tolS?: number,
): Promise<{startMs: number; endMs: number} | null> =>
  isAndroid
    ? android.hcFindRunWorkoutWindow(dateISO, durationS, tolS)
    : ios.hkFindRunWorkoutWindow(dateISO, durationS, tolS);

// ── 안드로이드 전용 출구 ─────────────────────────────────────────────────────
// Health Connect 는 별도 앱(안드로이드 13 이하)이라 '미설치' 라는 상태가 존재한다.
// iOS 에는 없는 개념이므로 파사드가 아니라 이름 그대로 노출한다.

/** Health Connect SDK 가 실제로 설치·사용 가능한가. iOS 에서는 항상 false. */
export const healthStoreReady = (): Promise<boolean> =>
  isAndroid ? android.hcSdkReady() : Promise.resolve(false);

/** Health Connect 설정 열기(권한을 되돌리고 싶을 때의 출구). iOS 에서는 no-op. */
export const openHealthStoreSettings = (): void => {
  if (isAndroid) android.hcOpenSettings();
};

// ── 사용자에게 보여줄 이름 ───────────────────────────────────────────────────
// 화면 문구가 "Apple 건강" 으로 하드코딩돼 있어 안드로이드에서도 그렇게 떴다. 사용자는
// 자기 폰에 없는 앱 이름을 보고 무엇을 눌러야 할지 모른다. 이름은 여기서만 정한다.
export const HEALTH_STORE_NAME = Platform.OS === 'android' ? 'Health Connect' : 'Apple 건강';
