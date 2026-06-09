/**
 * ProfileScreen 돌아보기(리캡) 행동 테스트 — slice-8-recap-ui.
 *
 * props 주입(recapRuns·recapShoes·recapNow)으로 네이티브 없이 "관찰 가능한 결과"를 단언한다:
 *   1) 실데이터 렌더(주/월 분기) — 주간 토글은 이번 주 합(20km·3회)·주간 기간 라벨을,
 *      월간 토글은 이번 달 합(25km·4회)·월간 기간 라벨을 보여 준다. 토글로 분기가 바뀐다.
 *   2) 공유 press → 공유 함수 호출 — 카드 공유를 누르면 화면 밖 RecapShareCard 의 Svg
 *      toDataURL()로 만든 PNG dataURL 이 RN Share.share 에 url 로 전달된다.
 *   3) 빈 데이터 graceful(A8-5) — 런 0개면 수치 칸 대신 keep-going 카피가 뜨고 크래시 없음.
 *
 * toDataURL 은 jest.setup.js 의 Svg 목이 흉내 낸다(고정 base64). 새 네이티브 의존 0.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Share} from 'react-native';
import ProfileScreen from '../ProfileScreen.rn';
import type {RecapRun, RecapShoe} from '../lib/recap';

// 기준 시각: 2026-06-10(수). 이 주 월요일 = 06-08, 일요일 = 06-14. 이 달 = 6월.
const NOW = new Date(2026, 5, 10, 9, 0, 0);

const SHOES: RecapShoe[] = [
  {id: 's1', name: 'Nike Pegasus 41', target_km: 700},
  {id: 's2', name: 'Hoka Clifton 9', target_km: 700},
];

// 이번 주(06-08~06-14) 런: s1 6km+4km, s2 10km → 20km·3회.
const weekRuns: RecapRun[] = [
  {id: 'r1', shoe_id: 's1', km: '6', duration: 6 * 360, run_date: '2026-06-08'},
  {id: 'r2', shoe_id: 's1', km: 4, duration: 4 * 330, run_date: '2026-06-10'},
  {id: 'r3', shoe_id: 's2', km: '10', duration: 10 * 210, run_date: '2026-06-09'},
];
// 이번 달이지만 지난 주(06-01, 5km) — 주간엔 제외, 월간엔 포함 → 월간 25km·4회.
const earlierThisMonth: RecapRun = {id: 'r0', shoe_id: 's1', km: '5', duration: 5 * 360, run_date: '2026-06-01'};
const ALL_RUNS = [...weekRuns, earlierThisMonth];

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(props: any) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<ProfileScreen {...props} />);
  });
  return renderer.root;
}

function byTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id)[0];
}
function pressableByTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id && typeof n.props?.onPress === 'function')[0];
}
function hasId(root: ReactTestRenderer.ReactTestInstance, id: string): boolean {
  return root.findAll((n: any) => n.props?.testID === id).length > 0;
}
function press(node: ReactTestRenderer.ReactTestInstance) {
  act(() => {
    node.props.onPress();
  });
}
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ProfileScreen 리캡이 실데이터로 렌더(주/월 분기)', () => {
  test('주간 토글(기본): 이번 주 합 20km·3회·주간 기간 라벨을 보여 준다', () => {
    const root = render({recapRuns: ALL_RUNS, recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    // 빈 리캡이 아니다(실데이터 칸이 뜬다).
    expect(hasId(root, 'recap-empty')).toBe(false);
    expect(textOf(byTestId(root, 'recap-period'))).toBe('6.8–6.14');
    expect(textOf(byTestId(root, 'recap-total'))).toContain('20');
    expect(textOf(byTestId(root, 'recap-runcount'))).toContain('3');
    // 평균 페이스가 산출된다(무런 '--' 아님).
    expect(textOf(byTestId(root, 'recap-pace'))).not.toContain('--');
    // 최다 착용 신발이 노출된다.
    expect(hasId(root, 'recap-most-worn')).toBe(true);
  });

  test('월간 토글: 이번 달 합 25km·4회·월간 기간 라벨로 분기가 바뀐다', () => {
    const root = render({recapRuns: ALL_RUNS, recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    press(pressableByTestId(root, 'recap-toggle-monthly'));
    expect(textOf(byTestId(root, 'recap-period'))).toBe('2026년 6월');
    expect(textOf(byTestId(root, 'recap-total'))).toContain('25');
    expect(textOf(byTestId(root, 'recap-runcount'))).toContain('4');
    // 다시 주간으로 돌아오면 주간 합으로 복귀(분기 전환이 양방향).
    press(pressableByTestId(root, 'recap-toggle-weekly'));
    expect(textOf(byTestId(root, 'recap-period'))).toBe('6.8–6.14');
    expect(textOf(byTestId(root, 'recap-total'))).toContain('20');
  });

  test('PR(개인 기록)이 실데이터로 렌더된다', () => {
    const root = render({recapRuns: ALL_RUNS, recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    expect(hasId(root, 'recap-prs')).toBe(true);
    // 최장 거리(10km) 기록이 PR 박스 텍스트에 담긴다.
    expect(textOf(byTestId(root, 'recap-prs'))).toContain('최장 거리');
  });
});

describe('ProfileScreen 리캡 카드 공유 press → Share.share 호출', () => {
  let shareSpy: jest.SpyInstance;
  beforeEach(() => {
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as any);
  });
  afterEach(() => shareSpy.mockRestore());

  test('공유를 누르면 toDataURL PNG dataURL 이 url 로 전달된다', async () => {
    const root = render({recapRuns: ALL_RUNS, recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    await act(async () => {
      pressableByTestId(root, 'recap-share').props.onPress();
    });
    await flush();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0];
    // 이미지 공유: 텍스트(message)가 아니라 PNG dataURL(url).
    expect(arg.message).toBeUndefined();
    expect(typeof arg.url).toBe('string');
    expect(arg.url).toBe('data:image/png;base64,MOCK_SHARE_CARD_PNG_BASE64');
  });

  test('빈 리캡에서도 공유는 동작한다(크래시 없이 Share.share 호출)', async () => {
    const root = render({recapRuns: [], recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    await act(async () => {
      pressableByTestId(root, 'recap-share').props.onPress();
    });
    await flush();
    expect(shareSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ProfileScreen 리캡 빈 데이터 graceful(A8-5)', () => {
  test('런 0개 → keep-going 카피가 뜨고 수치 칸은 없다(크래시 없음)', () => {
    const root = render({recapRuns: [], recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    expect(hasId(root, 'recap-empty')).toBe(true);
    expect(textOf(byTestId(root, 'recap-empty'))).toContain('keep going');
    // 빈 리캡이면 수치/최다착용/PR 칸은 렌더하지 않는다.
    expect(hasId(root, 'recap-total')).toBe(false);
    expect(hasId(root, 'recap-most-worn')).toBe(false);
    expect(hasId(root, 'recap-prs')).toBe(false);
  });

  test('월간도 빈 데이터면 월간 keep-going 카피로 graceful', () => {
    const root = render({recapRuns: [], recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    press(pressableByTestId(root, 'recap-toggle-monthly'));
    expect(hasId(root, 'recap-empty')).toBe(true);
    expect(textOf(byTestId(root, 'recap-empty'))).toContain('이번 달');
  });
});
