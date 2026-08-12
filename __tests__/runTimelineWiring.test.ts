// 러닝 타임라인 — **만들고 안 붙이면 없는 기능이다.**
//
// 왜 이 파일이 따로 있나 (2026-08-12)
// ----------------------------------------------------------------------------
// 바로 이틀 전에 같은 실수를 발견했다: 차량 감지 모듈 333줄 + 안드로이드 네이티브 171줄이
// 전부 있는데 **앱이 import 를 안 해서** 세 달 가까이 한 줄도 안 돌았다. 단위 테스트는
// 모듈을 직접 부르니 그걸 볼 수 없었다.
//
// 그래서 이번엔 만들면서 같이 붙인다. 이 파일은 로직이 아니라 **배선**을 본다.
// (로직은 __tests__/lib/timeline.test.ts 가 29건으로 고정한다.)
import {readFileSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('탐색 뷰가 화면에 걸려 있다', () => {
  const hist = () => read('HistoryScreen.rn.tsx');

  it('상세 화면이 RunTimeline 을 import 하고 렌더한다', () => {
    const src = hist();
    expect(src).toMatch(/from '\.\/RunTimeline\.rn'/);
    expect(src).toMatch(/<RunTimeline/);
  });

  it('심박 카드를 누르면 열린다 — 진입점이 있어야 기능이다', () => {
    expect(hist()).toMatch(/setTimelineOpen\(true\)/);
  });

  it('그릴 수 있는 지표만 넘긴다 — 표본 없는 지표는 레인이 안 뜬다', () => {
    const src = hist();
    expect(src).toMatch(/\.filter\(hasCurve\)/);
    // 네 지표를 모두 만들어 두고 거른다(케이던스는 2026-08-12 이후 러닝에만 있다).
    for (const k of ['hrPoints', 'pacePoints', 'elevPoints', 'cadPoints']) {
      expect(src).toContain(k);
    }
  });

  it('케이던스 시계열을 읽는다 — 없으면 그 레인만 조용히 빠진다', () => {
    expect(hist()).toMatch(/getItem\('cadTrack_' \+ run\.id\)/);
  });

  it('페이스 시계열도 읽는다 — 이 화면이 지금까지 안 읽던 것', () => {
    expect(hist()).toMatch(/getItem\('paceTrack_' \+ run\.id\)/);
  });
});

describe('스플릿 ↔ 탐색 연동', () => {
  it('구간 한 줄을 누르면 그 구간이 페이스로 열린다', () => {
    const src = read('HistoryScreen.rn.tsx');
    expect(src).toMatch(/onPickSplit=/);
    expect(src).toMatch(/metric: 'pace'/);
  });

  it('콜백이 없으면 표는 지금까지처럼 읽기 전용이다', () => {
    // 다른 화면(리캡 등)이 쓰는 같은 컴포넌트의 동작을 바꾸면 안 된다.
    const src = read('RunSplits.tsx');
    expect(src).toMatch(/onPickSplit\?:/);
    expect(src).toMatch(/disabled=\{!onPickSplit\}/);
  });
});

describe('옛 심박 존 카드는 사라졌다', () => {
  const hist = () => read('HistoryScreen.rn.tsx');

  it('접이식 곡선 상태가 남아 있지 않다 — 접을 대상이 탐색 뷰로 옮겨갔다', () => {
    const src = hist();
    expect(src).not.toMatch(/hrCurveOpen/);
    expect(src).not.toMatch(/HR_CURVE_OPEN_KEY/);
  });

  it('상세의 심박 카드는 조용하다 — 평균/최대 · 작은 곡선 · 존 두 줄', () => {
    const src = hist();
    expect(src).toMatch(/<HrSpark/);      // 작은 곡선
    expect(src).toMatch(/topZones\.map/); // 존 두 줄
  });
});

describe('탐색 뷰가 지키는 선', () => {
  const tl = () => read('RunTimeline.rn.tsx');

  it('계산을 자기가 다시 적지 않는다 — lib/timeline 이 소유한다', () => {
    const src = tl();
    expect(src).toMatch(/from '\.\/lib\/timeline'/);
    for (const f of ['zoneSeconds', 'zoomAt', 'clampRange', 'downsample']) {
      expect(src).toContain(f);
    }
  });

  it('존 분포를 보이는 구간으로 자른다 — 이 화면의 존재 이유', () => {
    // range 를 안 넘기면 확대해도 숫자가 안 변한다(경계 밖 시간이 섞인다).
    expect(tl()).toMatch(/zoneSeconds\([^)]*range[^)]*\)/s);
  });

  it('색은 심박에만 — 다른 지표는 무채', () => {
    // colorful 은 hero 가 심박일 때만 참이고, 존 그라데이션·경계선이 거기 묶여 있다.
    expect(tl()).toMatch(/colorful\s*=\s*hero\.key === 'hr'/);
  });

  it('확대해도 그리는 점이 늘지 않는다 — 보이는 구간만 솎아 그린다', () => {
    expect(tl()).toMatch(/downsample\(inRange/);
  });
});
