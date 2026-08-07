/**
 * 안드로이드 하드웨어 뒤로가기 스택 — 실기기 사고에서 나온 계약.
 *
 * 2026-08-07 갤럭시 S10e 실측: 기록 탭 → 러닝 상세 → 시스템 뒤로가기 를 눌렀더니
 * 목록으로 돌아가는 게 아니라 **앱이 통째로 종료됐다**(mResumedActivity 가 런처로 바뀜).
 * 저장소 전체에 `BackHandler` 가 0건이었다.
 *
 * 이 스위트가 고정하는 것은 "닫힌다"뿐이 아니라 **순서**와 **닫히면 안 되는 것**이다.
 * @format
 */
import {
  pushBackCloser, handleBack, backStackSize, resetBackStack,
} from '../../lib/backStack';

beforeEach(() => resetBackStack());

describe('순서 — 마지막에 등록된 것이 화면 맨 위다', () => {
  test('가장 나중에 등록된 것부터 처리한다', () => {
    const order: string[] = [];
    pushBackCloser(() => { order.push('아래'); return true; });
    pushBackCloser(() => { order.push('위'); return true; });

    expect(handleBack()).toBe(true);
    expect(order).toEqual(['위']); // 아래는 불리지 않는다
  });

  test('맨 위가 "닫을 게 없다"(false)면 그 아래로 내려간다', () => {
    const order: string[] = [];
    pushBackCloser(() => { order.push('아래'); return true; });
    pushBackCloser(() => { order.push('위'); return false; });

    expect(handleBack()).toBe(true);
    expect(order).toEqual(['위', '아래']);
  });

  test('아무도 처리하지 않으면 false — 호출부가 앱을 닫도록 넘긴다', () => {
    pushBackCloser(() => false);
    expect(handleBack()).toBe(false);
  });

  test('빈 스택도 죽지 않는다', () => {
    expect(handleBack()).toBe(false);
  });
});

describe('해제 — 자기 것만 빼낸다', () => {
  test('해제하면 더 이상 불리지 않는다', () => {
    const fn = jest.fn(() => true);
    const off = pushBackCloser(fn);
    off();
    expect(handleBack()).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    expect(backStackSize()).toBe(0);
  });

  test('중간 것을 해제해도 나머지 순서가 유지된다 — pop 이 아니라 제거다', () => {
    // 형제 화면의 언마운트 순서는 React 가 약속하지 않는다. 끝을 pop 하면
    // 엉뚱한 화면의 닫기가 사라진다.
    const order: string[] = [];
    pushBackCloser(() => { order.push('A'); return false; });
    const offB = pushBackCloser(() => { order.push('B'); return false; });
    pushBackCloser(() => { order.push('C'); return false; });

    offB();
    handleBack();
    expect(order).toEqual(['C', 'A']);
  });

  test('두 번 해제해도 남의 것을 지우지 않는다', () => {
    const off = pushBackCloser(() => false);
    pushBackCloser(() => true);
    off();
    off(); // 멱등이어야 한다
    expect(backStackSize()).toBe(1);
    expect(handleBack()).toBe(true);
  });
});

describe('견고성 — 뒤로가기 한 번이 앱을 죽이지 않는다', () => {
  test('닫기가 던져도 아래로 계속 내려간다', () => {
    const below = jest.fn(() => true);
    pushBackCloser(below);
    pushBackCloser(() => { throw new Error('boom'); });

    expect(() => handleBack()).not.toThrow();
    expect(handleBack()).toBe(true);
    expect(below).toHaveBeenCalled();
  });

  test('닫기가 실행 중에 자기 자신을 해제해도 순회가 어긋나지 않는다', () => {
    // 정상 흐름이다 — 닫으면 화면이 언마운트되고 cleanup 이 해제를 부른다.
    const seen: string[] = [];
    pushBackCloser(() => { seen.push('아래'); return true; });
    let offTop: (() => void) | null = null;
    offTop = pushBackCloser(() => { seen.push('위'); offTop?.(); return true; });

    expect(handleBack()).toBe(true);
    expect(seen).toEqual(['위']);
    expect(backStackSize()).toBe(1);
  });
});

// ── 배선 확인 ────────────────────────────────────────────────────────────────
// 레지스트리만 있고 `BackHandler` 에 붙이지 않으면 **아무 일도 일어나지 않는다** —
// 테스트는 전부 초록인데 실기기에선 여전히 앱이 꺼진다. 이 저장소가 겪은
// "만들었는데 배선이 안 된" 사고와 같은 종류라 소스 레벨로 못 박는다.
describe('배선 — 실제로 하드웨어 뒤로가기에 붙어 있다', () => {
  const app = require('fs').readFileSync(
    require('path').join(__dirname, '../..', 'App.tsx'), 'utf8');

  test('App.tsx 가 BackHandler 를 구독한다', () => {
    expect(app).toContain('BackHandler');
    expect(app).toContain('hardwareBackPress');
    expect(app).toContain('handleBack');
  });

  test('러닝 중에는 뒤로가기를 먹어 버린다 — 한 번에 러닝이 날아가면 Iron Law 위반', () => {
    // overlay==='run' 을 가로채는 분기가 App.tsx 의 뒤로가기 처리에 있어야 한다.
    expect(/overlay\s*===\s*'run'/.test(app)).toBe(true);
  });
});
