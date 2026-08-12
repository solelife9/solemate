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
