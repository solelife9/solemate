/**
 * 데이터 0인 신규 계정으로 전 화면 순회 — 2026-07-26 출시 심사 §8-⑥.
 *
 * 왜 이 테스트가 없었나: 지금까지의 모든 UI·UX 감사는 **데이터가 있는 화면**만 봤다.
 * 개발 기기에는 러닝 기록이 가득해서, 신규 사용자가 처음 3분간 보는 화면 —
 * 빈 차트·0 통계·미달성 업적 — 을 아무도 본 적이 없다. 스토어 전환의 승패는 거기서 갈린다.
 *
 * 이 테스트가 잡는 것:
 *   1) 빈 데이터로 렌더가 **깨지지 않는다**(0으로 나누기·빈 배열 접근으로 인한 크래시).
 *   2) 화면에 계산 사고의 흔적이 새어나오지 않는다 — 'NaN' · 'Infinity' · 'undefined' ·
 *      'null' · '-0' 같은 문자열은 사용자가 절대 보면 안 되는 값이다.
 *   3) 빈 화면이 **말을 한다** — 아무 안내 없는 백지는 고장으로 읽힌다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import ShoesScreen from '../ShoesScreen.rn';
import HistoryScreen from '../HistoryScreen.rn';
import ProfileScreen from '../ProfileScreen.rn';
import ProgressionScreen from '../ProgressionScreen.rn';
import {Text} from '../lib/text';

/**
 * 렌더된 모든 텍스트를 이어붙인다.
 *
 * ⚠️ **숫자 자식을 반드시 포함해야 한다.** `{count}` 처럼 숫자를 그대로 넣으면 자식이
 * number 타입이라, 문자열만 모으면 화면에 보이는 값이 통째로 빠진다. 특히 NaN 은
 * `typeof NaN === 'number'` 라서 문자열만 보는 검사로는 **절대 잡히지 않는다** —
 * 이 테스트가 잡으려는 바로 그 사고를 놓치게 된다(2026-07-27 자체 검증에서 발견).
 */
function allText(r: ReactTestRenderer.ReactTestRenderer): string {
  return r.root
    .findAll(() => true)
    .flatMap((n: any) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]))
    .filter((c: any) => typeof c === 'string' || typeof c === 'number')
    .map((c: any) => String(c))
    .join(' ');
}

function renderScreen(el: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

const noop = () => {};

// 신규 계정 = 신발 0, 런 0, 목표 0, 진척 없음.
const EMPTY_SCREENS: {name: string; el: React.ReactElement}[] = [
  {
    name: '홈',
    el: (
      <HomeScreen
        shoes={[]}
        onStart={noop}
        onAddShoe={noop}
        onTab={noop}
        onSelect={noop}
        week={{km: '0.0', runs: 0, pace: '--'}}
        weeklyGoalKm={0}
        weekDays={[false, false, false, false, false, false, false]}
        weekTodayIdx={-1}
      />
    ),
  },
  {
    name: '신발',
    el: (
      <ShoesScreen
        shoes={[]}
        runs={[]}
        totals={{}}
        onAddShoe={noop}
        onTab={noop}
        onRename={noop}
        onDelete={noop}
        onRetire={noop}
        onSetMaxKm={noop}
        onStartRun={noop}
      />
    ),
  },
  {
    name: '기록',
    el: <HistoryScreen runs={[]} shoes={[]} onTab={noop} />,
  },
  {
    name: '마이',
    el: <ProfileScreen records={[]} recapRuns={[]} recapShoes={[]} onTab={noop} />,
  },
  {
    name: '진척',
    el: <ProgressionScreen runs={[]} shoes={[]} onBack={noop} />,
  },
];

describe('빈 계정 — 전 화면이 깨지지 않는다', () => {
  it.each(EMPTY_SCREENS.map(s => [s.name, s.el] as const))('%s 화면이 렌더된다', (_name, el) => {
    expect(() => renderScreen(el)).not.toThrow();
  });
});

// 이 테스트가 스스로 눈이 멀지 않았는지 먼저 확인한다 — 처음 작성했을 때 문자열 자식만
// 모아서 숫자로 렌더된 NaN 을 통째로 놓쳤다(typeof NaN === 'number'). 검사 도구가
// 검사 대상을 못 보면 통과는 아무 의미가 없다.
describe('검사 도구 자체 검증', () => {
  it('숫자로 렌더된 NaN 을 잡아낸다', () => {
    const Broken = () => <Text>{0 / 0}</Text>;
    const text = allText(renderScreen(<Broken />));
    expect(text).toContain('NaN');
  });

  it('숫자 0 을 놓치지 않는다', () => {
    const Zero = () => <Text>{0}</Text>;
    expect(allText(renderScreen(<Zero />))).toContain('0');
  });
});

describe('빈 계정 — 계산 사고가 화면으로 새지 않는다', () => {
  // 사용자가 절대 보면 안 되는 문자열. 0으로 나누기(NaN·Infinity)와 옵셔널 누락(undefined)이
  // 빈 데이터에서 가장 흔히 터지는 두 가지다.
  const LEAKS = ['NaN', 'Infinity', 'undefined', 'null', '[object Object]'];

  it.each(EMPTY_SCREENS.map(s => [s.name, s.el] as const))('%s 화면', (_name, el) => {
    const text = allText(renderScreen(el));
    for (const leak of LEAKS) {
      expect(text).not.toContain(leak);
    }
  });
});

describe('빈 계정 — 백지가 아니라 말을 한다', () => {
  // 아무 안내 없는 빈 화면은 '고장'으로 읽힌다. 각 화면이 다음에 뭘 하면 되는지
  // 최소한 한 문장은 말해야 한다.
  it.each(EMPTY_SCREENS.map(s => [s.name, s.el] as const))('%s 화면에 안내 문구가 있다', (_name, el) => {
    const text = allText(renderScreen(el)).replace(/\s+/g, ' ').trim();
    // 한글이 최소 10자 이상 — 숫자·라벨만 있는 백지를 걸러낸다.
    const hangul = text.replace(/[^가-힣]/g, '');
    expect(hangul.length).toBeGreaterThanOrEqual(10);
  });
});
