// vehicleWiring.test.ts — **만들어 놓고 안 부르면 없는 기능이다.**
//
// 왜 있나 (2026-08-10)
// ----------------------------------------------------------------------------
// 2026-08-07 사고: 차를 타고 가며 앱을 켜 둔 것이 2.56km 러닝으로 저장돼 프로필의
// 「1km 최고」를 차지했다. 그걸 고치겠다고 두 커밋이 들어갔다 —
//   ffdcb10  lib/vehicleDetect.ts (188줄) + lib/activityRecognition.ts (145줄) + 테스트
//   82bde3b  KeegoActivityRecognitionModule.kt (171줄, 안드로이드 네이티브)
// 커밋 메시지는 "차량 구간을 가려낸다"고 적혀 있고, 단위 테스트는 전부 초록이었다.
//
// **그런데 두 모듈 다 앱 어디에서도 import 되지 않았다.** 엔진에 배선하는 커밋이
// 없었다. 파일·테스트·네이티브 모듈이 전부 있는데 런타임에는 한 줄도 돌지 않았고,
// 단위 테스트는 그 사실을 알 방법이 없었다(모듈을 직접 불러 검사하니까).
//
// 이 파일이 그 구멍을 막는다. 여기서 보는 것은 로직이 아니라 **배선**이다.
//
// 참고: 민우님이 "차 타고 갈 때 켜 보니 알아서 멈추던데?"라고 하셨고 그건 사실이다 —
// 자동 일시정지(lib/autoPause)와 걸음 정지 게이트(runTracker)는 배선돼 있다. 다만
// 걸음 게이트는 **칼만 속도가 STEP_GATE_MAX_SPEED_MPS 를 넘으면 일부러 풀린다**
// (걸음 센서가 동결된 진짜 러너의 거리를 죽이지 않으려는 안전선). 차가 빠를 때가
// 정확히 그 구간이고, 사고가 난 자리도 거기다. 차량 감지는 그 구멍을 맡는 층이다.
import {readFileSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('차량 감지가 엔진에 실제로 배선돼 있다', () => {
  const tracker = () => read('lib/runTracker.ts');
  const engine = () => read('screens/RunEngine.tsx');

  it('runTracker 가 백스톱 휴리스틱을 먹인다', () => {
    const src = tracker();
    expect(src).toMatch(/from '\.\/vehicleDetect'/);
    expect(src).toMatch(/feedVehicleSample\(/);
  });

  it('runTracker 가 OS 판정을 1순위로 합류시킨다 — 순서는 isVehicleNow 가 소유한다', () => {
    // 호출부가 `osVerdict ? ... : heuristic` 같은 자기 순서를 다시 쓰면 언젠가 한 곳이
    // 뒤집힌다. 합류는 반드시 이 함수 하나를 거친다.
    expect(tracker()).toMatch(/isVehicleNow\(/);
  });

  it('화면이 OS 활동 인식을 구독하고 판정을 밀어 넣는다', () => {
    const src = engine();
    expect(src).toMatch(/from '\.\.\/lib\/activityRecognition'/);
    expect(src).toMatch(/startActivityUpdates\(/);
    expect(src).toMatch(/vehicleFromActivity\(/);
    expect(src).toMatch(/setOsActivityVerdict\(/);
  });

  it('러닝이 끝나면 구독을 끊는다 — 배터리·프라이버시', () => {
    const src = engine();
    expect(src).toMatch(/stopActivityUpdates\(/);
    // stop() 안에서 끊어야 종료·완주·취소·언마운트가 모두 경유한다.
    const at = src.indexOf('function stop()');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 1200)).toMatch(/stopActivityUpdates/);
  });

  it('저장 전에 묻는다 — 조용히 저장하지도, 조용히 지우지도 않는다', () => {
    const src = engine();
    expect(src).toMatch(/vehicleVerdict\(/);
    const at = src.indexOf('vehicleVerdict(');
    const near = src.slice(Math.max(0, at - 200), at + 1400);
    expect(near).toMatch(/\.ask/); // 판정을 실제로 읽는다
    expect(near).toMatch(/showDialog\(/); // 사용자에게 묻는다
  });

  it('묻는 것이 저장보다 먼저다 — 저장한 뒤 물으면 최고 기록이 이미 오염된다', () => {
    const src = engine();
    const askAt = src.indexOf('vehicleVerdict(');
    const saveAt = src.indexOf('await onSave(');
    expect(askAt).toBeGreaterThan(-1);
    expect(saveAt).toBeGreaterThan(-1);
    expect(askAt).toBeLessThan(saveAt);
  });
});

// ── 스윕: 안전 모듈이 다시 '고아'가 되지 못하게 ──────────────────────────────
//
// 아래 목록은 **잘못되면 사용자가 알아챌 수 없는 종류의 결함**을 막는 모듈들이다.
// 로직이 맞는지는 각자의 단위 테스트가 보고, 여기서는 **앱이 그것을 부르는지**만 본다.
// 새 안전 모듈을 만들면 여기 한 줄 추가한다 — 그게 배선을 잊지 않는 유일한 장치다.
describe('안전 모듈은 고아가 될 수 없다', () => {
  const WIRED: {module: string; calledFrom: string[]}[] = [
    {module: 'vehicleDetect', calledFrom: ['lib/runTracker.ts', 'screens/RunEngine.tsx']},
    {module: 'activityRecognition', calledFrom: ['screens/RunEngine.tsx']},
    {module: 'autoPause', calledFrom: ['lib/runTracker.ts']},
    {module: 'elevation', calledFrom: ['lib/runTracker.ts', 'screens/RunEngine.tsx']},
  ];

  it.each(WIRED)('$module 은 앱 코드에서 import 된다', ({module, calledFrom}) => {
    const importers = calledFrom.filter(f => new RegExp(`from '[^']*${module}'`).test(read(f)));
    // 실패하면: 모듈은 있는데 아무도 안 부른다 = 그 방어는 런타임에 존재하지 않는다.
    expect(importers).toEqual(calledFrom);
  });
});
