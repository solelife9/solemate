// ─── lib/stepCounter.ts — 걸음수 파사드(안드로이드 하드웨어 카운터) ────────────
//
// 왜 있나 (2026-08-12 실기기)
// ----------------------------------------------------------------------------
// 민우님이 같은 러닝을 가민·갤럭시로 동시에 쟀는데 케이던스가
// **가민 168 spm / keego 1 spm** 이었다. 원인은 `expo-sensors` 다:
//
//   · `SensorProxy.onHostPause()` → `stopObserving()` — 앱이 백그라운드로 가면 구독을 뗀다.
//   · `PedometerModule` 은 리스너가 다시 붙을 때마다 기준을 지운다
//     (`listenerDecorator = { stepsAtTheBeginning = null }`).
//
// 즉 **폰을 주머니에 넣고 달리면 걸음을 아예 못 센다.** 러닝 앱에서 그건 예외가 아니라
// 기본이다. JS 에서 증분을 누적해도 못 고친다 — 받을 이벤트 자체가 없기 때문이다.
//
// 그래서 `TYPE_STEP_COUNTER`(부팅 이후 누적, 저전력 보조칩)를 **직접** 구독하는 네이티브
// 모듈을 두고 이 파일이 그 파사드가 된다. 새 의존성은 0 이다(SensorManager 는 표준).
//
// 파사드 규약(lib/activityRecognition·lib/health 와 동일):
//   · 모듈이 없거나 실패하면 **조용히 못 쓴다고 답한다** — 앱은 계속 돈다.
//   · 모르면 `null` 이다. 0 은 "안 걸었다"는 주장이고 모르는 것과 다르다.
//   · iOS 는 이 경로를 쓰지 않는다 — CMPedometer 가 구간 조회를 제대로 준다.
import {NativeModules, Platform} from 'react-native';

type NativeSC = {
  isAvailable?: () => Promise<boolean>;
  start?: () => Promise<boolean>;
  stop?: () => Promise<void>;
  /** 이 러닝의 걸음수. 모르면 -1. */
  current?: () => Promise<number>;
};

function mod(): NativeSC | null {
  if (Platform.OS !== 'android') return null;
  const m = (NativeModules as Record<string, unknown>).KeegoStepCounter;
  return m ? (m as NativeSC) : null;
}

/** 이 기기에서 하드웨어 걸음 카운터를 쓸 수 있는가. */
export async function stepCounterAvailable(): Promise<boolean> {
  const m = mod();
  if (!m?.isAvailable) return false;
  try {
    return !!(await m.isAvailable());
  } catch {
    return false;
  }
}

/** 러닝 시작 — 기준을 잡는다. 실패는 false(호출부는 기존 경로로 폴백). */
export async function startStepCounter(): Promise<boolean> {
  const m = mod();
  if (!m?.start) return false;
  try {
    return !!(await m.start());
  } catch {
    return false;
  }
}

/** 러닝 종료 — 반드시 부른다(배터리). 실패는 삼킨다. */
export async function stopStepCounter(): Promise<void> {
  const m = mod();
  if (!m?.stop) return;
  try {
    await m.stop();
  } catch {
    /* 종료 실패로 앱을 흔들지 않는다 */
  }
}

/**
 * 이 러닝에서 센 걸음수. **모르면 null**(0 이 아니다).
 *
 * 하드웨어 누적이라 화면이 꺼져 있던 구간도 포함된다 — 이 모듈의 존재 이유다.
 */
export async function currentSteps(): Promise<number | null> {
  const m = mod();
  if (!m?.current) return null;
  try {
    const v = await m.current();
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null; // -1 = 모름
    return Math.floor(n);
  } catch {
    return null;
  }
}
