// 폰 → 워치 명령은 **배달이 보장되는 채널**로 보낸다.
//
// 왜 있나 (2026-08-12 실기기)
// ----------------------------------------------------------------------------
// 민우님: "폰에서 러닝 완료하면 워치도 완료되나? 안 되는 것 같던데." — 맞았다.
// 그리고 이어서 물으셨다: "기록 따로 저장하려고 일부러 안 멈추는 건 아니지?"
// **아니다.** 코드의 의도는 한 쌍이다 — `startWatchWorkout` 의 짝으로 `stopWatchWorkout`
// 을 부르고 있었다. 기록도 하나여야 한다(runTrackerWatchMirror 머리말: "업계는 기록자를
// 시작할 때 하나로 정한다").
//
// 그런데 **명령이 도착하지 않았다.** 옛 코드는 이랬다:
//     if s.isReachable { sendMessage } else { pushContext }   // applicationContext
//   ① `isReachable` 은 워치 앱이 **포그라운드일 때만** 참이다. 러닝 중 손목을 내리면
//      거짓이라, 실제 러닝에서는 거의 항상 아래로 떨어진다.
//   ② `applicationContext` 는 '최신 상태 동기화'용이지 명령용이 아니다. iOS 가 기회가 될
//      때 전달하므로 몇 분 뒤이거나 아예 안 온다.
//
// 그 결과가 오늘의 두 사고였다: 워치 러닝 3.52km 가 유령으로 따로 저장됐고, 살아남은
// 워치 워크아웃이 다음 폰 러닝에 누적 거리 0.45km 를 물려줬다. **한 뿌리였다.**
//
// 워치 → 폰 방향은 이미 올바른 규약을 쓰고 있었다(sendMessage 실패 시 transferUserInfo).
// 이 파일은 폰 → 워치도 같은 규약을 지키게 못 박는다.
import {readFileSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const phone = () => read('ios/SoleMate/WatchSessionModule.swift');
/** 주석을 뺀 실제 코드만 — 설명으로 언급하는 것과 구현하는 것은 다르다. */
const codeOnly = (src: string) =>
  src.split('\n').filter(l => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n');
const watch = () => read('ios/SoleMateWatch Watch App/WatchLink.swift');

describe('정지 명령은 놓치지 않는다', () => {
  it('배달 보장 큐(transferUserInfo)로 보낸다 — applicationContext 가 아니다', () => {
    const at = phone().indexOf('func stopWatchWorkout');
    expect(at).toBeGreaterThan(-1);
    const body = codeOnly(phone().slice(at, at + 2600));
    expect(body).toMatch(/transferUserInfo/);
    // applicationContext 경로로 되돌아가면 다시 새기 시작한다.
    expect(body).not.toMatch(/pushContext/);
  });

  it('도달 가능하면 즉시 보내되, 실패하면 큐로 넘긴다', () => {
    const body = codeOnly(phone().slice(phone().indexOf('func stopWatchWorkout'), phone().indexOf('func stopWatchWorkout') + 2600));
    expect(body).toMatch(/isReachable/);
    expect(body).toMatch(/errorHandler:.*transferUserInfo/s);
  });

  it('워치가 큐 배달을 받는 수신부를 갖는다 — 없으면 보내도 소용없다', () => {
    const w = watch();
    expect(w).toMatch(/didReceiveUserInfo/);
    // 받은 cmd 를 실제로 처리해야 한다.
    const at = w.indexOf('didReceiveUserInfo');
    expect(w.slice(at, at + 400)).toMatch(/handle\(cmd:/);
  });

  it('워치 → 폰 방향도 같은 규약을 유지한다(회귀 방지)', () => {
    expect(watch()).toMatch(/sendMessage\([^)]*errorHandler:[^}]*transferUserInfo/s);
  });
});

describe('한 러닝은 한 기록이다', () => {
  it('폰이 러닝을 끝낼 때 워치 종료를 부른다 — 시작의 짝', () => {
    const s = read('screens/RunEngine.tsx');
    const at = s.indexOf('function stop()');
    expect(at).toBeGreaterThan(-1);
    expect(s.slice(at, at + 1400)).toMatch(/watchSession\.stopWorkout\(\)/);
  });

  it('폰이 러닝을 시작할 때 워치 시작을 부른다', () => {
    expect(read('screens/RunEngine.tsx')).toMatch(/watchSession\.startWorkout\(\)/);
  });
});
