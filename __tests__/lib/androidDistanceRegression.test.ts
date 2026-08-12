// 안드로이드 거리·케이던스 — **잘 되던 것이 되돌아간 자리.**
//
// 왜 있나 (2026-08-12 실기기 3중 대조)
// ----------------------------------------------------------------------------
// 민우님이 같은 러닝을 가민·아이폰·갤럭시로 동시에 재서 가져왔다.
//
//              가민      갤럭시(keego)
//   거리      2.96km     2.79km    (-5.7%)
//   케이던스   168spm     1spm      (!!)
//
// 두 가지가 드러났고 **둘 다 새로 생긴 게 아니라 조건이 달라져 드러난 것**이었다.
//
// ① 거리 — 08-10 에 계산 방식이 '위치 차분' → 'OS 속도 적분(도플러)' 으로 바뀌었다.
//    그 커밋의 검증은 **전부 합성 트레이스**였고 실기기 대조가 없었다. 반면 08-05
//    4중 대조에서 **위치 방식은 오차 0%** 로 확인돼 있었다. 안드로이드
//    `Location.getSpeed()` 는 기기마다 품질이 다르고 보통 평활·지연돼 나와서, 적분하면
//    계통적으로 낮게 나온다. 검증된 방식이 있는데 미검증 방식을 쓸 이유가 없어 되돌렸다.
//    (민우님 B안 확정. iOS 는 유지 — 오늘 아이폰 위치 실측 2.95km 가 가민 2.96 과 맞았다.)
//
// ② 케이던스 — expo-sensors 가 리스너를 다시 등록할 때마다 기준을 지운다
//    (`listenerDecorator = { stepsAtTheBeginning = null }`). 앱이 백그라운드로 가면
//    SensorProxy 가 리스너를 떼므로, 주머니에 넣고 달리다 화면을 켜면 걸음이 **0 부터
//    다시** 시작한다. 우리 주석은 "복귀 시 그동안의 걸음이 그대로 실려 온다"였는데
//    **틀린 전제**였다. 8월 5일 러닝도 케이던스가 0 이었다 — 그때도 깨져 있었고
//    "안드로이드 검증 완료"는 거리만 본 것이었다.
import {Platform} from 'react-native';
import {accumulateSteps} from '../../lib/stepCadence';

describe('안드로이드는 도플러로 거리를 재지 않는다', () => {
  const src = () =>
    require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'lib', 'runTracker.ts'),
      'utf8',
    ) as string;

  it('플랫폼 분기가 dopplerSpeedMps 안에 있다 — 여기가 빠지면 조용히 되돌아간다', () => {
    const s = src();
    const at = s.indexOf('private dopplerSpeedMps');
    expect(at).toBeGreaterThan(-1);
    const body = s.slice(at, at + 1600);
    expect(body).toMatch(/Platform\.OS === 'android'/);
    expect(body).toMatch(/return null/);
  });

  it('두 방식의 거리를 **둘 다** 센다 — 다음 실기기 러닝에서 판가름내려고', () => {
    const s = src();
    expect(s).toMatch(/dopDistKm/);
    expect(s).toMatch(/posDistKm/);
    expect(s).toMatch(/getDistanceDiag\(\)/);
  });

  it('도플러가 이끄는 동안에도 위치 누적은 계속 센다(버리더라도)', () => {
    // 여기서 세지 않으면 진단이 반쪽이 된다 — 비교 대상이 없어진다.
    expect(src()).toMatch(/this\.posDistKm \+= Math\.max\(0, posGain\)/);
  });

  it('진단 값은 계산에 관여하지 않는다 — 거리는 여전히 addDistanceKm 만 바꾼다', () => {
    const s = src();
    // dopDistKm/posDistKm 이 this.dist 에 직접 대입되는 일이 없어야 한다.
    expect(s).not.toMatch(/this\.dist\s*=\s*this\.(dop|pos)DistKm/);
  });
});

describe('걸음 누적 — expo 가 기준을 옮겨도 총합을 잃지 않는다', () => {
  it('정상 증가는 그대로 더한다', () => {
    let st = {total: 0, lastRaw: 0};
    for (const raw of [10, 25, 60, 120]) st = accumulateSteps(st, raw);
    expect(st.total).toBe(120);
  });

  it('기준이 리셋돼 값이 0 부터 다시 와도 총합이 이어진다 — 1 spm 사고의 핵심', () => {
    let st = {total: 0, lastRaw: 0};
    for (const raw of [100, 200, 300]) st = accumulateSteps(st, raw);
    expect(st.total).toBe(300);
    // 앱이 백그라운드 갔다 오면서 expo 가 기준을 옮겼다 → raw 가 작아진다.
    for (const raw of [5, 40, 90]) st = accumulateSteps(st, raw);
    expect(st.total).toBe(390); // 300 + 5 + 35 + 50
  });

  it('예전 방식이었다면 총합이 무너졌다 — 이 테스트가 그 차이를 못 박는다', () => {
    // 예전: stepsRef.current = raw (마지막 값만 남는다) → 90 걸음.
    let st = {total: 0, lastRaw: 0};
    for (const raw of [100, 200, 300, 5, 40, 90]) st = accumulateSteps(st, raw);
    expect(st.total).toBeGreaterThan(90 * 3);
  });

  it('쓰레기 표본은 총합을 흔들지 않는다', () => {
    let st = {total: 0, lastRaw: 0};
    st = accumulateSteps(st, 50);
    for (const bad of [NaN, -3, undefined, null, 'x']) st = accumulateSteps(st, bad);
    expect(st.total).toBe(50);
  });

  it('같은 값이 반복돼도 늘지 않는다(중복 배달)', () => {
    let st = {total: 0, lastRaw: 0};
    for (const raw of [70, 70, 70]) st = accumulateSteps(st, raw);
    expect(st.total).toBe(70);
  });
});

describe('화면이 걸음 누적기를 실제로 쓴다', () => {
  it('RunEngine 이 accumulateSteps 로 센다 — raw 를 그대로 대입하지 않는다', () => {
    const s = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'screens', 'RunEngine.tsx'),
      'utf8',
    ) as string;
    expect(s).toMatch(/accumulateSteps\(acc/);
    // 옛 형태가 되살아나면 다시 1 spm 이 된다.
    expect(s).not.toMatch(/stepsRef\.current\s*=\s*r\?\.steps/);
  });
});

// 플랫폼 상수가 테스트 환경에서 무엇이든, 위 소스 단언은 플랫폼과 무관하게 성립한다.
it('테스트 환경 확인용 — Platform 이 로드된다', () => {
  expect(typeof Platform.OS).toBe('string');
});

// ── 하드웨어 걸음 카운터 (2026-08-12) ────────────────────────────────────────
// JS 증분 누적만으로는 부족했다. `SensorProxy.onHostPause()` 가 구독을 **떼기** 때문에
// 주머니에 넣고 달리면 이벤트가 아예 안 온다 — 더할 증분이 없다. 러닝 앱에서 그건
// 예외가 아니라 기본이므로, TYPE_STEP_COUNTER(부팅 이후 누적)를 직접 구독한다.
describe('걸음은 백그라운드에서도 세어야 한다', () => {
  const read = (p: string) =>
    require('fs').readFileSync(require('path').join(__dirname, '..', '..', p), 'utf8') as string;

  it('네이티브 모듈이 있고 패키지에 등록돼 있다 — 등록을 빠뜨리면 조용히 없는 모듈이 된다', () => {
    const mod = read('android/app/src/main/java/com/keego/app/KeegoStepCounterModule.kt');
    expect(mod).toMatch(/TYPE_STEP_COUNTER/);
    expect(mod).toMatch(/registerListener/);
    // expo 와 달리 백그라운드에서 떼지 않는다 — 해제는 stop() 에서만 일어나야 한다.
    // (주석에 onHostPause 를 '설명으로' 언급하는 것과, 그 훅을 '구현하는' 것은 다르다.)
    const code = mod.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/onHostPause|onHostResume/);
    expect(code).toMatch(/fun stop\(/);
    expect(code).toMatch(/unregisterListener/);
    expect(read('android/app/src/main/java/com/keego/app/KeegoWidgetPackage.kt'))
      .toMatch(/KeegoStepCounterModule\(reactContext\)/);
  });

  it('모르면 -1 을 돌려준다 — 0 은 "안 걸었다"는 주장이라 다르다', () => {
    expect(read('android/app/src/main/java/com/keego/app/KeegoStepCounterModule.kt'))
      .toMatch(/-1\.0/);
  });

  it('화면이 하드웨어 카운터를 1순위로 쓰고, 없으면 expo 로 폴백한다', () => {
    const s = read('screens/RunEngine.tsx');
    expect(s).toMatch(/startStepCounter\(\)/);
    expect(s).toMatch(/currentSteps\(\)/);
    expect(s).toMatch(/hwStepsRef\.current\s*\?/); // 켜졌을 때만 하드웨어 값을 읽는다
    expect(s).toMatch(/if\(!hwStepsRef\.current\)/); // 폴백 분기
  });

  it('러닝이 끝나면 구독을 끊는다 — 배터리', () => {
    const s = read('screens/RunEngine.tsx');
    const at = s.indexOf('function stop()');
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, at + 1400)).toMatch(/stopStepCounter\(\)/);
  });
});

// ── 워치 현재 페이스 (2026-08-12) ────────────────────────────────────────────
// 민우님: "애플워치 페이스가 너무 날뛴다" + "일정하게 달리면 페이스는 원래 안 튄다."
// 후자가 정확한 진단이다 — 튀는 건 러너가 아니라 측정이다.
// 업계 문헌: 위치는 점당 ±10m 오차라 거리 미분으로 만든 현재 페이스는 "마일당 30초 이상
// 튄다"(Fellrnr). 가민은 평균 창을 20~30초로 늘렸다가 "반응이 없다"는 불평을 얻었다.
// 정석은 창 길이가 아니라 **소스 교체**다 — 도플러 속도는 모든 벤더가 5~6년 이상 써 온
// 방식이고 오차가 0.05~0.15 m/s 라 계단이 없다.
describe('워치 현재 페이스는 속도를 직접 잰다', () => {
  const wm = () =>
    require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'ios', 'SoleMateWatch Watch App', 'WorkoutManager.swift'),
      'utf8',
    ) as string;

  it('도플러 속도를 페이스에 먹인다', () => {
    const s = wm();
    expect(s).toMatch(/func feedPaceSpeed/);
    expect(s).toMatch(/feedPaceSpeed\(loc\.speed >= 0 \? loc\.speed : derived\)/);
  });

  it('거리 기반은 폴백으로만 — 도플러가 신선하면 끼어들지 않는다', () => {
    expect(wm()).toMatch(/lastPaceFromSpeedAt <= Self\.paceSpeedFreshS/);
  });

  it('조건 미달이어도 0 으로 떨어뜨리지 않는다 — 화면 깜빡임의 정체였다', () => {
    const s = wm();
    const at = s.indexOf('private func updateCurrentPace');
    const body = s.slice(at, at + 900);
    expect(body).not.toMatch(/currentPaceSecPerKm = \(dt/); // 옛 삼항 형태
    expect(body).toMatch(/guard dt >= 8, dd >= 0\.03 else \{ return \}/);
  });

  it('멈추면 무한대를 만들지 않는다', () => {
    expect(wm()).toMatch(/guard mps >= Self\.paceMinSpeedMps else \{ return \}/);
  });

  it('창은 폰과 같은 30초다 — 두 화면이 다른 규칙을 쓰면 숫자가 갈린다', () => {
    expect(wm()).toMatch(/paceWindowS: Double = 30/);
  });
});
