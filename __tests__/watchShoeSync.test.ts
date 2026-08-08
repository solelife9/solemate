/**
 * 폰 ↔ 워치 — **같은 러닝이 두 건이 되지 않게** 하는 두 가지 계약.
 *
 * 둘 다 결과가 같다: 같은 러닝이 두 레코드로 남고 **신발이 이중 차감**된다
 * (2026-07-28 실측 선례: 5.4km 러닝이 신발에 10.50km).
 *
 *  N-2 폰이 '이번 러닝의 신발'을 워치에 안 알려줬다 → 워치는 자기 스와이프 기록으로만
 *      신발을 골랐고, 두 기기가 다른 신발로 세션을 열면 병합 조건(shoe_id 동일)이 깨진다.
 *  N-3 콜드런치 버퍼 재생 순서가 runs → stops 였다 → 워치 런이 도착할 때 폰 런이 아직
 *      저장 전이라 시간창 병합이 붙을 대상을 못 찾는다.
 *
 * **왜 소스를 문자열로 검사하나.** 워치 코드는 Swift 라 jest 가 실행할 수 없고, 실기기
 * 검증도 TestFlight 를 거쳐야 한다(Xcode 가 이 워치를 인식하지 못한다 — 저장소 기록).
 * 그 사이에 계약이 조용히 되돌아가는 것만은 막는다.
 * @format
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PHONE_NATIVE = 'ios/SoleMate/WatchSessionModule.swift';
const WATCH_LINK = 'ios/SoleMateWatch Watch App/WatchLink.swift';

describe('N-2 — 폰이 고른 신발이 워치까지 간다', () => {
  test('JS 가 선택 신발 id 를 전달한다', () => {
    expect(read('lib/watchSession.ts')).toContain('selectedShoeId');
    // App.tsx 가 실제로 넘겨야 의미가 있다(포트만 열고 안 부르면 그대로다).
    expect(read('App.tsx')).toMatch(/updateShoes\([^)]*selectedShoeId/);
  });

  test('폰 네이티브가 컨텍스트에 실어 보낸다', () => {
    const s = read(PHONE_NATIVE);
    expect(s).toContain('payload["selectedShoeId"]');
    expect(s).toContain('patch["selectedShoeId"]');
  });

  test('빈 값은 보내지 않는다 — 컨텍스트는 통째 교체라 유효한 선택을 지운다', () => {
    expect(read(PHONE_NATIVE)).toMatch(/payload\["selectedShoeId"\] as\? String, !sel\.isEmpty/);
  });

  test('워치가 그 값을 읽어 선택에 반영한다', () => {
    const s = read(WATCH_LINK);
    expect(s).toContain('context["selectedShoeId"]');
    expect(s).toContain('Keys.selectedShoe');
  });

  test('러닝 중에는 신발을 바꾸지 않는다 — 그 세션 기록이 엉뚱한 신발에 붙는다', () => {
    const s = read(WATCH_LINK);
    const block = s.slice(s.indexOf('context["selectedShoeId"]'));
    expect(block.slice(0, 600)).toContain('!WorkoutManager.shared.isActive');
  });

  test('폰 값이 바뀌었을 때만 따라간다 — 워치에서 한 스와이프를 되돌리지 않는다', () => {
    const s = read(WATCH_LINK);
    expect(s).toContain('lastPhoneSelectedShoeId');
    expect(s).toContain('sel != lastPhoneSelectedShoeId');
    // 워치 선택과 **별도 키**로 보관해야 '바뀌었는지'를 판단할 수 있다.
    expect(s).toContain('phoneSelectedShoe');
  });
});

describe('N-3 — 콜드런치 버퍼 재생 순서', () => {
  const s = read(PHONE_NATIVE);
  const replay = s.slice(s.indexOf('override func startObserving()'));
  const end = replay.indexOf('override func stopObserving()');
  const body = replay.slice(0, end);

  test('stops → runs → hrs 순서다', () => {
    const iStop = body.indexOf('onWatchStop');
    const iRun = body.indexOf('onWatchRun');
    const iHr = body.indexOf('onWatchHrTrack');
    expect(iStop).toBeGreaterThan(-1);
    expect(iRun).toBeGreaterThan(-1);
    expect(iHr).toBeGreaterThan(-1);
    // 정지가 먼저여야 폰 런이 확정 저장되고, 그 뒤 워치 런을 runMerge 가 합친다.
    expect(iStop).toBeLessThan(iRun);
    // 심박 기록은 붙일 런이 있어야 하므로 런 뒤.
    expect(iRun).toBeLessThan(iHr);
  });

  test('세 버퍼를 모두 비운다 — 하나라도 남으면 다음 콜드런치에 다시 재생된다', () => {
    for (const q of ['pendingStops', 'pendingRuns', 'pendingHrTracks']) {
      expect(body).toContain(`self.${q} = []`);
    }
  });
});
