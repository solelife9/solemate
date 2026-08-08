// elevationHonesty.test.ts — **모르는 고도를 0 이라고 말하지 않는다.**
//
// 왜 있나 (2026-08-09)
// ----------------------------------------------------------------------------
// 고도 상승을 어떻게 계산할지가 오래 막혀 있었다. 임계·상한·이동평균을 조합해 GPS 고도의
// 노이즈를 거르려 했는데, 모델을 바꿀 때마다 결론이 뒤집혔다(90초 평활은 진짜 언덕 반복
// 200m 를 6m 로 죽였고, OU 모델은 현행 규칙이 200m 를 27m 로 **과소** 보고한다고 했다).
//
// 민우님이 "다른 프리미엄 앱들은 어떻게 하냐"고 물었고, 거기서 문제 설정이 틀렸다는 게
// 드러났다: **가민·애플·스트라바·NRC 는 아무도 폰 GPS 고도를 쓰지 않는다.**
// 전부 기압 고도계가 1순위이고, 스트라바는 기압계 없는 기기에서 GPS 고도 대신
// **지형 고도 DB(DEM)** 를 조회한다. 우리가 필터링하려던 신호는 업계가 버린 신호였다.
//
// 그래서 규칙을 바꿨다(민우님 A+C 확정):
//   A. 안드로이드도 기압계를 쓴다 — expo-sensors 가 relativeAltitude 를 안 주므로
//      pressure(hPa)에서 직접 상대고도를 만든다(lib/elevation).
//   C. 기압계가 아예 없으면 **고도를 만들지 않는다.** GPS 폴백 폐지.
//
// 이 파일은 C 를 고정한다. 0 은 "평지를 달렸다"는 주장이고, **모르는 것과 평지는 다르다.**
import {readFileSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');
const engine = () => readFileSync(join(ROOT, 'screens/RunEngine.tsx'), 'utf8');

describe('기압계가 없으면 고도를 지어내지 않는다', () => {
  it('GPS 고도로 폴백하지 않는다 — 3,262m·1,814m 를 만든 그 경로다', () => {
    const src = engine();
    // 예전 폴백들: 화면(`setElevGain(s.elevGainM)`)과 저장(`runTracker.getElevationGain()`).
    // 둘 다 기압계가 없을 때 GPS 누적을 그대로 썼다.
    expect(src).not.toMatch(/if\s*\(\s*!baroAvail\.current\s*\)\s*setElevGain/);
    expect(src).not.toMatch(/baroAvail\.current\s*\?[^:]+:\s*runTracker\.getElevationGain\(\)/);
  });

  it('저장 총합은 기압계가 있을 때만 만들어진다', () => {
    // `finElevTotal` 이 undefined 로 떨어져야 레코드에서 필드가 빠진다.
    expect(engine()).toMatch(/finElevTotal\s*=\s*baroAvail\.current\s*\?[^:]+:\s*undefined/);
  });

  it('화면 상태가 null 을 표현할 수 있다 — 0 과 구분되어야 한다', () => {
    expect(engine()).toMatch(/useState<number\s*\|\s*null>\(resume\?\.elevGainM\s*\?\?\s*null\)/);
  });
});

describe('안드로이드도 기압계를 쓴다', () => {
  it('relativeAltitude 가 없으면 pressure 에서 만든다 — 그냥 return 하지 않는다', () => {
    const src = engine();
    expect(src).toMatch(/relativeAltitudeFromPressure/);
    // 러닝 시작 시점 기압을 기준으로 삼는다(절대 고도가 아니라 상대 고도).
    expect(src).toMatch(/baroRefHPa/);
  });
});

describe('저장 계약', () => {
  it('elevation_m 은 값이 있을 때만 레코드에 만든다', () => {
    const app = readFileSync(join(ROOT, 'App.tsx'), 'utf8');
    // `elevation_m: elevM || 0` 이면 모름이 0 으로 뭉개진다 — 그 형태가 없어야 한다.
    expect(app).not.toMatch(/elevation_m\s*:\s*elevM\s*\|\|\s*0/);
    expect(app).toMatch(/elevM\s*!=\s*null\s*\?\s*\{elevation_m:\s*elevM\}\s*:\s*\{\}/);
  });
});
