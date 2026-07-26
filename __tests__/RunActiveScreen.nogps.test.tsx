/**
 * 실내(무신호) 안내 계약 — 2026-07-26 출시 심사 B-13.
 *
 * 배경: 러닝 화면의 GPS 경고는 `gpsLevel === 1`(약함)에서만 떴고, **한 번도 fix 를 못 받은
 * 상태(level 0)** 는 조건에서 빠져 있었다. 그래서 트레드밀·지하에서는 거리가 0 인 채
 * 화면이 아무 말도 하지 않았다. 더 나쁜 건 그 km 가 신발 마모에도 안 잡힌다는 점이다
 * (차별점이 조용히 틀린다). 실내 러닝 모드가 생기기 전까지는 정직하게 알린다.
 *
 * 관찰:
 *   1) noGpsFix 면 실내 안내가 뜬다.
 *   2) 평소(신호 정상)에는 뜨지 않는다 — 상시 상태 표시가 아니다.
 *   3) 권한 회수 배너가 우선한다(더 구체적인 원인).
 *   4) 무신호일 때 '약함' 배너와 겹쳐 두 줄이 되지 않는다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunActiveScreen from '../RunActiveScreen.rn';

function render(props: any) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(
      <RunActiveScreen
        insets={{top: 0, bottom: 0}}
        shoeLabel="Pegasus 41"
        km={0}
        elapsed={90}
        onPause={() => {}}
        onStop={() => {}}
        onOpenSettings={() => {}}
        {...props}
      />,
    );
  });
  return r;
}

const has = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n: any) => n.props?.testID === id).length > 0;

const allText = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAll(() => true)
    .flatMap((n: any) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]))
    .filter((c: any): c is string => typeof c === 'string')
    .join(' ');

test('무신호가 이어지면 실내 안내가 뜬다', () => {
  const r = render({noGpsFix: true, gpsLevel: 0});
  expect(has(r, 'no-gps-fix')).toBe(true);
  expect(allText(r)).toContain('실내 러닝은 거리가 기록되지 않아요');
});

test('신호가 정상이면 뜨지 않는다(상시 표시 아님)', () => {
  const r = render({noGpsFix: false, gpsLevel: 3});
  expect(has(r, 'no-gps-fix')).toBe(false);
  expect(allText(r)).not.toContain('실내 러닝은');
});

test('권한 회수 상태에서는 실내 안내를 띄우지 않는다(원인이 다르다)', () => {
  const r = render({noGpsFix: true, gpsLevel: 0, permLost: true});
  expect(has(r, 'no-gps-fix')).toBe(false);
  expect(allText(r)).toContain('위치 권한이 꺼져');
});

test("무신호일 때 'GPS 신호 약함' 배너와 겹치지 않는다", () => {
  const r = render({noGpsFix: true, gpsLevel: 1});
  expect(has(r, 'no-gps-fix')).toBe(true);
  expect(allText(r)).not.toContain('GPS 신호 약함');
});
