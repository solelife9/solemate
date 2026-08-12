// 케이던스 시계열 — **평균 하나로는 답할 수 없던 질문을 위해.**
//
// 왜 있나 (2026-08-12)
// ----------------------------------------------------------------------------
// 지금까지 케이던스는 **러닝 전체 평균 한 값**만 남았다. 그래서 "언덕에서 케이던스를
// 지켰나" 같은 질문에 답할 수 없었다 — 러닝 타임라인이 답하려는 바로 그 질문이다.
//
// 심박(hrTrack)·페이스(paceTrack)·고도(gapTrack)와 **같은 규약**으로 붙였다:
// 달리는 중에만 · 값이 0 이하면 무시 · throttle · 일시정지 중에는 안 쌓는다.
//
// ⚠️ **과거 러닝은 채울 수 없다.** 시계열이 없던 시절의 런은 빈 배열이고, 화면은 그
// 지표를 조용히 감춘다 — 없는 걸 지어내지 않는다(고도·심박과 같은 원칙).
import {runTracker} from '../../lib/runTracker';

const SHOE = {id: 's1', name: 'Nike Pegasus'};

afterEach(() => {
  runTracker.stop();
});

/** 시계를 t0 부터 sec 초 뒤로 옮기고 케이던스를 먹인다. */
function feedAt(t0: number, sec: number, spm: number) {
  runTracker.setNow(() => t0 + sec * 1000);
  runTracker.setMeta({cadence: spm});
}

describe('달리는 동안 쌓인다', () => {
  it('표본이 시계열로 남는다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, t0});
    feedAt(t0, 0, 168);
    feedAt(t0, 10, 174);
    feedAt(t0, 20, 178);
    const tr = runTracker.getCadTrack();
    expect(tr.length).toBeGreaterThanOrEqual(3);
    expect(tr[0]).toMatchObject({spm: 168});
    expect(tr[tr.length - 1].spm).toBe(178);
    // 경과초가 단조 증가한다 — 곡선의 x축이다.
    for (let i = 1; i < tr.length; i++) expect(tr[i].t).toBeGreaterThanOrEqual(tr[i - 1].t);
  });

  it('setMeta 의 원래 일(위치·걸음)을 깨뜨리지 않는다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, t0});
    // 케이던스 적립을 끼워 넣으면서 기존 필드 처리를 깨뜨리지 않았는지만 본다.
    expect(() => runTracker.setMeta({cadence: 176, location: '한강', movingSteps: 900})).not.toThrow();
    expect(runTracker.getCadTrack()[0]).toMatchObject({spm: 176});
  });
});

describe('지어내지 않는다', () => {
  it('0 이하는 무시한다 — 곡선에 가짜 계곡을 만들지 않는다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, t0});
    feedAt(t0, 0, 0);
    feedAt(t0, 10, -5);
    expect(runTracker.getCadTrack()).toHaveLength(0);
  });

  it('일시정지 중에는 안 쌓는다 — 서 있는 시간이 곡선을 끌어내리면 안 된다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, t0});
    feedAt(t0, 0, 170);
    const before = runTracker.getCadTrack().length;
    runTracker.togglePause();
    feedAt(t0, 20, 170);
    feedAt(t0, 40, 170);
    expect(runTracker.getCadTrack()).toHaveLength(before);
  });

  it('러닝을 새로 시작하면 비워진다 — 지난 러닝이 섞이면 안 된다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, t0});
    feedAt(t0, 0, 170);
    expect(runTracker.getCadTrack().length).toBeGreaterThan(0);
    runTracker.stop();
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, t0});
    expect(runTracker.getCadTrack()).toHaveLength(0);
  });

  it('너무 촘촘한 표본은 솎는다 — 공급원이 5초 폴링이라 그보다 잦으면 같은 값이 겹친다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, t0});
    for (let i = 0; i < 10; i++) feedAt(t0, i, 170); // 1초 간격 10개
    expect(runTracker.getCadTrack().length).toBeLessThan(5);
  });
});

// ── 배선: 저장까지 이어지는가 ────────────────────────────────────────────────
describe('저장 경로까지 이어진다', () => {
  const read = (p: string) =>
    require('fs').readFileSync(require('path').join(__dirname, '..', '..', p), 'utf8') as string;

  it('엔진이 완주 시 시계열을 실어 보낸다', () => {
    const src = read('screens/RunEngine.tsx');
    expect(src).toMatch(/getCadTrack\(\)/);
    expect(src).toMatch(/cadTrackFin\)/); // onSave 의 마지막 인자
  });

  it('App 이 cadTrack_<id> 로 영속한다', () => {
    expect(read('App.tsx')).toMatch(/setItem\('cadTrack_'\+newId/);
  });

  it('런을 지우면 시계열도 지운다 — 사이드카가 고아로 남지 않게', () => {
    // 여기가 빠지면 삭제된 런의 시계열이 저장소에 영구히 남는다(기존 3종과 같은 규약).
    expect(read('App.tsx')).toMatch(/'cadTrack_'\][^\n]*removeItem|removeItem\(k\+sid\)/);
    expect(read('App.tsx')).toMatch(/cadTrack_/);
  });
});
