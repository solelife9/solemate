/**
 * RunScreens.haptics.test.tsx — Run* 화면의 lib/haptics 배선 + 핸들러 + 접근성 행동 테스트.
 *
 * 관찰 가능한 결과를 단언한다(실제 react-test-renderer 트리 + 모킹된 lib/haptics 호출):
 *   · RunCountdownScreen: 3·2·1 비트마다 countdownBeat, GO 에서 go 가 호출된다.
 *   · RunGoalScreen: '러닝 시작' CTA 가 tap 햅틱 + onStart(목표 km) 를 부른다.
 *   · RunActiveScreen: 일시정지/재개 = tap, 목표 달성 = impactHeavy,
 *     길게 눌러 종료 확정 = warning + onStop. 홀드 진행 링이 렌더된다.
 *   · 접근성: 터치요소에 role/label, 권한상실 배너 assertive live-region,
 *     라이브 거리/시간 라벨.
 *
 * lib/haptics 는 jest.mock 으로 가로채 의미 메서드 호출만 관찰한다(진동 자체는 무관).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

// 의미 햅틱을 모킹 — 화면이 각 의미 메서드를 부르는지(배선)만 관찰한다.
jest.mock('../lib/haptics', () => ({
  tap: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  countdownBeat: jest.fn(),
  go: jest.fn(),
  impactHeavy: jest.fn(),
  setHapticsEnabled: jest.fn(),
  isHapticsEnabled: jest.fn(() => true),
}));

import * as haptics from '../lib/haptics';
import RunActiveScreen from '../RunActiveScreen.rn';
import RunGoalScreen from '../RunGoalScreen.rn';
import RunCountdownScreen from '../RunCountdownScreen.rn';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

// accessibilityLabel 로 누를 수 있는(혹은 길게 누를 수 있는) 노드를 찾는다.
function pressableByLabel(root: any, label: string) {
  const hits = root.findAll(
    (n: any) =>
      n &&
      n.props &&
      n.props.accessibilityLabel === label &&
      (typeof n.props.onPress === 'function' ||
        typeof n.props.onLongPress === 'function'),
  );
  if (!hits.length) throw new Error(`no pressable with label "${label}"`);
  return hits[0];
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── RunCountdownScreen: 카운트다운 비트 + GO 햅틱 ─────────────────────────────
describe('RunCountdownScreen — 카운트다운 비트(3·2·1)와 GO 햅틱', () => {
  test('3·2·1 비트마다 countdownBeat, 종료(GO)에서 go 가 호출된다', () => {
    jest.useFakeTimers();
    let r!: ReactTestRenderer.ReactTestRenderer;
    try {
      act(() => {
        r = ReactTestRenderer.create(
          <RunCountdownScreen goalKm={5} onDone={() => {}} onCancel={() => {}} />,
        );
      });
      // GPS 락(1750ms) → 비트 3개(1750/2750/3750) → GO(4750). 넉넉히 진행.
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(haptics.countdownBeat).toHaveBeenCalledTimes(3);
      expect(haptics.go).toHaveBeenCalledTimes(1);
    } finally {
      // 남은 타이머/애니메이션 프레임이 환경 teardown 이후 발화하지 않도록
      // 먼저 언마운트(컴포넌트 clearAll 발동)하고, 남은 setTimeout/RAF 를 한 번
      // 흘려보낸 뒤 전부 비우고 실시간 타이머로 복원한다.
      act(() => {
        r?.unmount();
      });
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test('취소 버튼이 role=button + 접근성 라벨을 노출한다', () => {
    const root = render(
      <RunCountdownScreen goalKm={5} onCancel={() => {}} />,
    ).root;
    const cancel = pressableByLabel(root, '카운트다운 취소');
    expect(cancel.props.accessibilityRole).toBe('button');
  });
});

// ── RunGoalScreen: 런 시작 CTA 햅틱 + onStart ────────────────────────────────
describe('RunGoalScreen — 런 시작 햅틱과 onStart 핸들러', () => {
  test("'러닝 시작' CTA 가 tap 햅틱 + onStart(기본 5km) 를 부른다", () => {
    const onStart = jest.fn();
    const root = render(<RunGoalScreen onStart={onStart} />).root;
    act(() => {
      pressableByLabel(root, '러닝 시작').props.onPress();
    });
    expect(haptics.tap).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith({ km: 5, durationMin: 0, pacePlan: [] });
  });

  test('시간 모드 선택 후 시작하면 onStart(시간 목표 분)', () => {
    const onStart = jest.fn();
    const root = render(<RunGoalScreen onStart={onStart} />).root;
    act(() => {
      pressableByLabel(root, '시간 목표').props.onPress();
    });
    act(() => {
      pressableByLabel(root, '러닝 시작').props.onPress();
    });
    expect(onStart).toHaveBeenCalledWith({ km: 0, durationMin: 30, pacePlan: [] });
  });

  test('스피드 모드 선택 후 시작하면 거리 + km별 페이스 플랜이 onStart 로 전달된다', () => {
    const onStart = jest.fn();
    const root = render(<RunGoalScreen onStart={onStart} />).root;
    act(() => {
      pressableByLabel(root, '스피드 목표').props.onPress();
    });
    act(() => {
      pressableByLabel(root, '러닝 시작').props.onPress();
    });
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ km: 5, durationMin: 0 }));
    const arg = onStart.mock.calls[0][0];
    expect(Array.isArray(arg.pacePlan)).toBe(true);
    expect(arg.pacePlan.length).toBe(5); // 5km → km별 5칸
  });

  test('세그먼트/프리셋 버튼이 role=button + selected 상태를 노출한다', () => {
    const root = render(<RunGoalScreen />).root;
    const seg = pressableByLabel(root, '거리 목표'); // 기본 km 모드 = 선택됨
    expect(seg.props.accessibilityRole).toBe('button');
    expect(seg.props.accessibilityState.selected).toBe(true);
    const preset = pressableByLabel(root, '5km 목표 선택'); // 기본 5km = 선택됨
    expect(preset.props.accessibilityState.selected).toBe(true);
  });
});

// ── RunActiveScreen: 일시정지/재개/목표달성/종료 햅틱 + 접근성 ────────────────
describe('RunActiveScreen — 런 컨트롤 햅틱과 핸들러', () => {
  test('일시정지 → tap, 이어 재개 → tap (둘 다 가벼운 햅틱)', () => {
    const root = render(
      <RunActiveScreen distanceKm={2} goalKm={5} />,
    ).root;
    // 비일시정지 상태: 일시정지 버튼 노출
    act(() => {
      pressableByLabel(root, '일시정지').props.onPress();
    });
    expect(haptics.tap).toHaveBeenCalledTimes(1);
    // 일시정지 후: 재개 버튼 노출
    act(() => {
      pressableByLabel(root, '재개').props.onPress();
    });
    expect(haptics.tap).toHaveBeenCalledTimes(2);
  });

  test('목표 달성 시 impactHeavy 가 한 번 호출되고 달성 토스트가 announce 된다', () => {
    const root = render(
      <RunActiveScreen distanceKm={5.2} goalKm={5} />,
    ).root;
    expect(haptics.impactHeavy).toHaveBeenCalledTimes(1);
    // 달성이 polite live-region 으로 announce 된다(토스트·링 라벨 등).
    const announced = root.findAll(
      (n: any) =>
        n &&
        n.props &&
        n.props.accessibilityLiveRegion === 'polite' &&
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.includes('달성'),
    );
    expect(announced.length).toBeGreaterThan(0);
  });

  test('길게 눌러 종료 확정 = warning 햅틱 + onStop, 홀드 진행 링이 렌더된다', () => {
    const onStop = jest.fn();
    const root = render(
      <RunActiveScreen distanceKm={2} goalKm={5} paused onStop={onStop} />,
    ).root;
    const stop = pressableByLabel(root, '길게 눌러 종료');
    // 홀드 시작/해제 핸들러(시각 진행 제어)가 배선돼 있다.
    expect(typeof stop.props.onPressIn).toBe('function');
    expect(typeof stop.props.onPressOut).toBe('function');
    // 홀드 진행 링: strokeDashoffset 가 묶인 원호 노드가 존재한다(시각적 hold 표시).
    const holdRing = root.findAll(
      (n: any) => n && n.props && n.props.strokeDashoffset != null,
    );
    expect(holdRing.length).toBeGreaterThan(0);
    // 확정(롱프레스)
    act(() => {
      stop.props.onLongPress();
    });
    expect(haptics.warning).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('권한 상실 배너는 assertive live-region + 버튼 role 로 즉시 announce 된다', () => {
    const onOpenSettings = jest.fn();
    const root = render(
      <RunActiveScreen distanceKm={2} goalKm={5} permLost onOpenSettings={onOpenSettings} />,
    ).root;
    const banner = root.find(
      (n: any) =>
        n &&
        n.props &&
        n.props.accessibilityLiveRegion === 'assertive' &&
        n.props.accessibilityRole === 'button',
    );
    expect(banner).toBeTruthy();
    act(() => {
      banner.props.onPress();
    });
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  test('라이브 거리/시간이 접근성 라벨로 읽힌다', () => {
    const root = render(
      <RunActiveScreen distanceKm={3.2} goalKm={5} timeLabel="16:04" />,
    ).root;
    const labels = root
      .findAll((n: any) => n && n.props && typeof n.props.accessibilityLabel === 'string')
      .map((n: any) => n.props.accessibilityLabel);
    expect(labels.some((l: string) => l.includes('거리') && l.includes('3.2'))).toBe(true);
    expect(labels.some((l: string) => l.includes('시간') && l.includes('16:04'))).toBe(true);
  });
});
