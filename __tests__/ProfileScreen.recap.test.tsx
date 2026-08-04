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
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

// 만든 렌더러를 추적해 각 테스트 뒤 언마운트+마이크로태스크 플러시. ProfileScreen 은
// 마운트 시 비동기 로드(스토리지 등)를 여럿 걸어, 정리 없이 환경이 내려가면 지연
// setState 가 티어다운 뒤 발화 → "import after teardown" → 워커 크래시(단독 실행에서
// 재현되던 그 크래시, 2026-07-17 근본수정). 테스트 결과 자체는 불변.
const liveRenderers: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    liveRenderers.splice(0).forEach(r => r.unmount());
    await Promise.resolve(); // 남은 마이크로태스크(비동기 로드 체인) 소진
  });
});

function render(props: any) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<ProfileScreen {...props} />);
  });
  liveRenderers.push(renderer);
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
// (press 헬퍼 제거 — 주간/월간 토글 폐지로 이 파일에 누를 대상이 없다, 간결화 E2 2026-07-26)
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ProfileScreen 리캡이 실데이터로 렌더(주/월 분기)', () => {
  // 주간 모드 폐지(간결화 E2, 2026-07-26): weeklyRecap 은 홈 '이번 주 러닝' 원카드와 같은
  // 창·같은 3지표라 마이 탭에서 중복이었다. 리캡은 이제 월간 전용(토글 없음).
  test('월간 전용: 이번 달 합 25km·4회·월간 기간 라벨을 보여 준다', () => {
    const root = render({recapRuns: ALL_RUNS, recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    // 빈 리캡이 아니다(실데이터 칸이 뜬다).
    expect(hasId(root, 'recap-empty')).toBe(false);
    expect(textOf(byTestId(root, 'recap-period'))).toBe('2026년 6월');
    expect(textOf(byTestId(root, 'recap-total'))).toContain('25');
    expect(textOf(byTestId(root, 'recap-runcount'))).toContain('4');
    // 평균 페이스가 산출된다(무런 '--' 아님).
    expect(textOf(byTestId(root, 'recap-pace'))).not.toContain('--');
    // 최다 착용 신발이 노출된다.
    expect(hasId(root, 'recap-most-worn')).toBe(true);
  });

  test('주간/월간 토글은 더 이상 렌더하지 않는다(홈 원카드와 중복 제거)', () => {
    const root = render({recapRuns: ALL_RUNS, recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    expect(hasId(root, 'recap-toggle-weekly')).toBe(false);
    expect(hasId(root, 'recap-toggle-monthly')).toBe(false);
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
    expect(textOf(byTestId(root, 'recap-empty'))).toContain('Keep Going');
    // 빈 리캡이면 수치/최다착용/PR 칸은 렌더하지 않는다.
    expect(hasId(root, 'recap-total')).toBe(false);
    expect(hasId(root, 'recap-most-worn')).toBe(false);
    expect(hasId(root, 'recap-prs')).toBe(false);
  });

  test('빈 데이터 카피는 월간 기준으로 말한다', () => {
    const root = render({recapRuns: [], recapShoes: SHOES, recapNow: NOW, unit: 'km'});
    expect(hasId(root, 'recap-empty')).toBe(true);
    expect(textOf(byTestId(root, 'recap-empty'))).toContain('이번 달');
  });
});
