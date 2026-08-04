/**
 * UX 감사 ① 회귀 가드 — 러닝 중 상태 배너의 스크린리더 공지.
 *
 * 왜 필요한가: `accessibilityLiveRegion` 은 **Android 전용 prop** 이라 iOS VoiceOver 는
 * 보지 않는다. 러닝 화면의 배너 5종(GPS 없음·GPS 약함·위치권한 회수·백업 실패·일시정지 중
 * 이동)은 liveRegion 만 달고 있어 iOS 에서 **한 마디도 들리지 않았다.** 위치권한 회수·백업
 * 실패는 "기록이 사라진다"는 경고라, 못 들으면 시각장애 러너는 아무것도 안 남는 러닝을
 * 완주하게 된다(코드 리뷰로는 통과하고 실사용에서만 실패하는 종류).
 *
 * 이 파일이 지키는 계약:
 *   1) 배너 조건이 켜지는 순간 iOS 에서 announceForAccessibility 가 1회 불린다
 *   2) 조건이 유지되는 동안 반복 공지하지 않는다(배너는 상태를 읊는 게 아니다)
 *   3) Android 에서는 공지하지 않는다(liveRegion 이 이미 읽으므로 중복 금지)
 *   4) 링 센터 거리 라벨에는 live region 이 **없다** — 1Hz 로 바뀌는 값이라 TalkBack 이
 *      러닝 내내 그 긴 문장을 반복해 다른 컨트롤 탐색이 불가능해졌다
 *
 * @format
 */
import React from 'react';
import {AccessibilityInfo, Platform} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import RunActiveScreen from '../RunActiveScreen.rn';

const rendered: ReactTestRenderer.ReactTestRenderer[] = [];
function render(el: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let r!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(el); });
  rendered.push(r);
  return r;
}
const update = (r: ReactTestRenderer.ReactTestRenderer, el: React.ReactElement) => {
  ReactTestRenderer.act(() => { r.update(el); });
};

let spy: jest.SpyInstance;
beforeEach(() => {
  spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  Platform.OS = 'ios';
});
afterEach(() => {
  ReactTestRenderer.act(() => { rendered.splice(0).forEach(r => r.unmount()); });
  spy.mockRestore();
  Platform.OS = 'ios';
});

const said = () => spy.mock.calls.map((c: unknown[]) => String(c[0]));

/** 렌더 트리에서 accessibilityLiveRegion 이 붙은 노드들의 라벨. */
const liveRegionLabels = (root: ReactTestRenderer.ReactTestInstance): string[] =>
  root.findAll((n: any) => !!n.props?.accessibilityLiveRegion)
    .map((n: any) => String(n.props.accessibilityLabel ?? ''));

const allLabels = (root: ReactTestRenderer.ReactTestInstance): string[] =>
  root.findAll((n: any) => typeof n.props?.accessibilityLabel === 'string')
    .map((n: any) => String(n.props.accessibilityLabel));

describe('러닝 중 배너 — iOS VoiceOver 공지(UX 감사 ①)', () => {
  test('위치 권한 회수 배너가 뜨는 순간 공지된다', () => {
    const r = render(<RunActiveScreen permLost={false} />);
    expect(said().some(s => s.includes('위치 권한이 꺼져'))).toBe(false);

    update(r, <RunActiveScreen permLost />);
    expect(said().some(s => s.includes('위치 권한이 꺼져'))).toBe(true);
  });

  test('백업 실패 배너도 공지된다(기록 손실 경고)', () => {
    const r = render(<RunActiveScreen snapshotFailing={false} />);
    update(r, <RunActiveScreen snapshotFailing />);
    expect(said().some(s => s.includes('저장 공간이 부족해'))).toBe(true);
  });

  test('GPS 를 못 찾은 상태도 공지된다', () => {
    const r = render(<RunActiveScreen noGpsFix={false} />);
    update(r, <RunActiveScreen noGpsFix />);
    expect(said().some(s => s.includes('GPS를 찾지 못했어요'))).toBe(true);
  });

  test('조건이 유지되는 동안 반복 공지하지 않는다(거리만 바뀌는 실제 러닝)', () => {
    const r = render(<RunActiveScreen permLost />);
    const n = said().filter(s => s.includes('위치 권한이 꺼져')).length;
    expect(n).toBe(1);
    update(r, <RunActiveScreen permLost distanceKm={1.2} />);
    update(r, <RunActiveScreen permLost distanceKm={1.3} />);
    expect(said().filter(s => s.includes('위치 권한이 꺼져')).length).toBe(1);
  });

  test('Android 에서는 공지하지 않는다 — liveRegion 이 이미 읽는다(중복 금지)', () => {
    Platform.OS = 'android';
    const r = render(<RunActiveScreen permLost={false} />);
    update(r, <RunActiveScreen permLost />);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('링 센터 거리 — live region 금지(UX 감사 ①)', () => {
  test('1Hz 로 바뀌는 거리 라벨에는 live region 이 없다', () => {
    const {root} = render(<RunActiveScreen distanceKm={3.24} goalKm={5} />);
    expect(liveRegionLabels(root).some(l => l.startsWith('달린 거리'))).toBe(false);
  });

  test('그래도 라벨 자체는 남는다 — 스와이프로 언제든 현재 거리를 읽을 수 있어야 한다', () => {
    const {root} = render(<RunActiveScreen distanceKm={3.24} goalKm={5} />);
    expect(allLabels(root).some(l => l.startsWith('달린 거리 3.24킬로미터'))).toBe(true);
  });

  test('상태 라벨(러닝 중/일시정지)은 live region 을 유지한다 — 자주 안 바뀐다', () => {
    const {root} = render(<RunActiveScreen />);
    expect(liveRegionLabels(root).some(l => l.startsWith('상태:'))).toBe(true);
  });
});
