/**
 * 차량 이동 감지 — 실제 사고에서 나온 계약.
 *
 * 2026-08-07: 차를 타고 가며 앱을 켜 둔 것이 **2.56km 러닝으로 저장돼** 있었다
 * (7분 24초 = 시속 20.8km). 그게 프로필 「1km 최고」를 차지해 2'53"/km 를 띄웠다.
 * 기존 걸음 정지 게이트는 "걸음이 없어도 2.5m/s 보다 빠르면 통과"라는 탈출구가 있어
 * 시내 주행이 그대로 지나갔다.
 *
 * 이 스위트가 고정하는 것은 잡는 것뿐 아니라 **잡으면 안 되는 것**이다:
 *  · 엘리트 러너(6m/s + 걸음 있음) → 사람
 *  · 걸음 센서가 죽은 러너(표본 없음) → **판정하지 않는다**(거리를 버리지 않는다)
 *  · OS 가 "사람"이라고 답하면 → 휴리스틱을 **이긴다**
 * @format
 */
import {
  initVehicleState, feedVehicleSample, vehicleVerdict, isVehicleNow,
  VEHICLE_SPEED_MPS, VEHICLE_SUSTAIN_FAST_MS, VEHICLE_SUSTAIN_SLOW_MS,
  VEHICLE_ASK_MIN_KM,
} from '../../lib/vehicleDetect';
import {
  normalizeActivityKind, vehicleFromActivity, VEHICLE_CONFIDENCE_MIN,
} from '../../lib/activityRecognition';

/** fix 를 연속으로 먹인다(1초 간격). */
function run(samples: Array<Partial<Parameters<typeof feedVehicleSample>[1]> & {nowMs: number}>) {
  let st = initVehicleState();
  let last = false;
  for (const s of samples) {
    const r = feedVehicleSample(st, {
      nowMs: s.nowMs,
      speedMps: s.speedMps ?? null,
      stepsFresh: s.stepsFresh ?? true,
      msSinceStepIncrease: s.msSinceStepIncrease ?? 60000,
      segKm: s.segKm ?? 0,
      segMs: s.segMs ?? 1000,
    });
    st = r.state;
    last = r.isVehicle;
  }
  return {state: st, isVehicle: last};
}

describe('차량 감지 — 잡아야 하는 것', () => {
  test('시내 주행(5.6m/s · 걸음 0)이 90초 지속되면 차량으로 본다', () => {
    const samples = [];
    for (let t = 0; t <= VEHICLE_SUSTAIN_SLOW_MS + 5000; t += 1000) {
      samples.push({nowMs: t, speedMps: 5.6, msSinceStepIncrease: 60000, segKm: 0.0056});
    }
    const {isVehicle, state} = run(samples);
    expect(isVehicle).toBe(true);
    expect(state.flaggedKm).toBeGreaterThan(0);
  });

  test('고속(7m/s · 걸음 0)은 20초면 확정된다 — 오래 기다릴 이유가 없다', () => {
    const samples = [];
    for (let t = 0; t <= VEHICLE_SUSTAIN_FAST_MS + 2000; t += 1000) {
      samples.push({nowMs: t, speedMps: 7.0, msSinceStepIncrease: 60000, segKm: 0.007});
    }
    expect(run(samples).isVehicle).toBe(true);
  });
});

describe('차량 감지 — 절대 잡으면 안 되는 것', () => {
  test('엘리트 러너: 6m/s 인데 걸음이 늘고 있다 → 사람', () => {
    const samples = [];
    for (let t = 0; t <= 200000; t += 1000) {
      samples.push({nowMs: t, speedMps: 6.0, msSinceStepIncrease: 300, segKm: 0.006});
    }
    const {isVehicle, state} = run(samples);
    expect(isVehicle).toBe(false);
    expect(state.flaggedKm).toBe(0);
  });

  test('걸음 센서가 죽었다(표본 없음) → 판정하지 않는다. 거리를 버리지 않는다', () => {
    const samples = [];
    for (let t = 0; t <= 200000; t += 1000) {
      samples.push({nowMs: t, speedMps: 8.0, stepsFresh: false, msSinceStepIncrease: 999999, segKm: 0.008});
    }
    const {isVehicle, state} = run(samples);
    expect(isVehicle).toBe(false);
    expect(state.flaggedKm).toBe(0);
  });

  test('속도를 모르면(칼만 미수렴) 판정하지 않는다', () => {
    const samples = [];
    for (let t = 0; t <= 200000; t += 1000) samples.push({nowMs: t, speedMps: null, segKm: 0.005});
    expect(run(samples).isVehicle).toBe(false);
  });

  test('사람 속도(2.5m/s)는 걸음이 없어도 차량이 아니다 — 신호대기는 걸음 게이트 몫', () => {
    const samples = [];
    for (let t = 0; t <= 200000; t += 1000) {
      samples.push({nowMs: t, speedMps: 2.5, msSinceStepIncrease: 60000, segKm: 0.0025});
    }
    expect(run(samples).isVehicle).toBe(false);
  });

  test('짧은 스파이크는 확정하지 않는다 — 지속을 요구한다', () => {
    const samples = [];
    for (let t = 0; t <= 10000; t += 1000) {
      samples.push({nowMs: t, speedMps: VEHICLE_SPEED_MPS + 1, msSinceStepIncrease: 60000, segKm: 0.007});
    }
    const {isVehicle, state} = run(samples);
    expect(isVehicle).toBe(false);
    expect(state.flaggedKm).toBe(0);
  });

  test('중간에 걸음이 잡히면 의심이 처음부터 다시 쌓인다', () => {
    const samples = [];
    for (let t = 0; t <= 60000; t += 1000) samples.push({nowMs: t, speedMps: 5.6, msSinceStepIncrease: 60000, segKm: 0.0056});
    samples.push({nowMs: 61000, speedMps: 5.6, msSinceStepIncrease: 100, segKm: 0.0056}); // 걸음!
    for (let t = 62000; t <= 120000; t += 1000) samples.push({nowMs: t, speedMps: 5.6, msSinceStepIncrease: 60000, segKm: 0.0056});
    // 리셋 뒤 58초밖에 안 됐다 → 저속 기준(90초) 미달
    expect(run(samples).isVehicle).toBe(false);
  });
});

describe('저장 시점 — 자동으로 지우지 않고 물어볼지만 정한다', () => {
  test('의심 거리가 기준을 넘으면 묻는다', () => {
    const st = {since: null, flaggedKm: VEHICLE_ASK_MIN_KM + 0.1, flaggedMs: 60000};
    expect(vehicleVerdict(st, 5).ask).toBe(true);
  });

  test('짧은 러닝에서 비율이 크면 거리가 작아도 묻는다', () => {
    const st = {since: null, flaggedKm: 0.25, flaggedMs: 30000};
    expect(vehicleVerdict(st, 1.0).ask).toBe(true);   // 25%
    expect(vehicleVerdict(st, 1.0).share).toBeCloseTo(0.25, 3);
  });

  test('의심 구간이 없으면 묻지 않는다', () => {
    expect(vehicleVerdict(initVehicleState(), 10).ask).toBe(false);
  });

  test('전체 거리가 0이어도 죽지 않는다', () => {
    expect(() => vehicleVerdict(initVehicleState(), 0)).not.toThrow();
    expect(vehicleVerdict(initVehicleState(), 0).share).toBe(0);
  });
});

describe('OS 활동 인식 — 1순위', () => {
  test('플랫폼별 원문을 공통 값으로 정규화한다', () => {
    expect(normalizeActivityKind('automotive')).toBe('automotive');  // iOS
    expect(normalizeActivityKind('IN_VEHICLE')).toBe('automotive');  // Android
    expect(normalizeActivityKind('on_foot')).toBe('walking');
    expect(normalizeActivityKind('아무말')).toBe('unknown');         // 지어내지 않는다
  });

  test('신뢰도가 낮으면 판정하지 않는다 — 확신 없이 거리를 버리지 않는다', () => {
    expect(vehicleFromActivity({kind: 'automotive', confidence: VEHICLE_CONFIDENCE_MIN - 1})).toBeNull();
    expect(vehicleFromActivity({kind: 'automotive', confidence: VEHICLE_CONFIDENCE_MIN})).toBe(true);
  });

  test('사람 활동이면 false — 자전거는 답할 수 없으므로 null', () => {
    expect(vehicleFromActivity({kind: 'running', confidence: 90})).toBe(false);
    expect(vehicleFromActivity({kind: 'walking', confidence: 90})).toBe(false);
    expect(vehicleFromActivity({kind: 'cycling', confidence: 90})).toBeNull();
    expect(vehicleFromActivity(null)).toBeNull();
  });
});

describe('최종 판정 — OS 가 휴리스틱을 이긴다', () => {
  test('OS 가 차량이라 하면 휴리스틱이 아니라 해도 차량', () => {
    expect(isVehicleNow(true, false)).toBe(true);
  });

  test('OS 가 사람이라 하면 휴리스틱이 차량이라 해도 사람 — 진짜 러너의 거리를 지킨다', () => {
    expect(isVehicleNow(false, true)).toBe(false);
  });

  test('OS 를 못 쓰면 휴리스틱을 따른다', () => {
    expect(isVehicleNow(null, true)).toBe(true);
    expect(isVehicleNow(null, false)).toBe(false);
  });
});

// ── 배선 확인 ────────────────────────────────────────────────────────────────
// 네이티브 모듈은 **등록을 빠뜨려도 조용하다** — JS 파사드가 'unknown' 폴백을 돌려주므로
// 앱은 멀쩡히 돌고, 1순위(OS)가 영영 안 켜진 채 백스톱만 도는 상태가 된다.
// 이 저장소가 겪은 "만들었는데 배선이 안 된" 사고(고도 상한·헬스커넥트 근거 화면)와 같은
// 종류라 소스 레벨로 못 박는다.
describe('배선 — OS 활동 인식 모듈이 실제로 앱에 등록돼 있다', () => {
  const read = (f: string) => require('fs').readFileSync(require('path').join(__dirname, '../..', f), 'utf8');
  const AND = 'android/app/src/main/java/com/keego/app';

  test('안드로이드 모듈이 존재하고 이름이 JS 파사드와 같다', () => {
    const mod = read(`${AND}/KeegoActivityRecognitionModule.kt`);
    expect(mod).toContain('const val NAME = "KeegoActivityRecognition"');
    // JS 는 NativeModules.KeegoActivityRecognition 으로 찾는다 — 이름이 갈리면 영영 못 만난다.
    expect(read('lib/activityRecognition.ts')).toContain('KeegoActivityRecognition');
  });

  test('ReactPackage 에 등록돼 있다 — 안 하면 모듈이 조용히 없는 상태가 된다', () => {
    expect(read(`${AND}/KeegoWidgetPackage.kt`)).toContain('KeegoActivityRecognitionModule(reactContext)');
  });

  test('네이티브가 돌려주는 문자열을 JS 가 전부 해석할 수 있다', () => {
    const mod = read(`${AND}/KeegoActivityRecognitionModule.kt`);
    // Kotlin kindOf() 가 내보내는 값 ↔ normalizeActivityKind() 가 아는 값
    for (const k of ['in_vehicle', 'on_bicycle', 'running', 'walking', 'still']) {
      expect(mod).toContain(`"${k}"`);
      expect(normalizeActivityKind(k)).not.toBe('unknown');
    }
  });

  test('권한이 매니페스트에 선언돼 있다', () => {
    expect(read('android/app/src/main/AndroidManifest.xml'))
      .toContain('android.permission.ACTIVITY_RECOGNITION');
  });
});
