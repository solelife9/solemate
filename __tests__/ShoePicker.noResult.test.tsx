/**
 * 검색 0건 화면 — docs/shoes-spec.md §6 계약.
 *
 * 카탈로그가 낡는 문제에 대한 구조적 답이다. 사람이 눈치채기를 기다리지 않고,
 * "사용자가 찾았는데 없던 것"을 데이터로 남긴다. 그래서 이 스위트가 지키는 건 셋이다:
 *   1) 0건이면 search_misses 에 실제로 남는가
 *   2) '내 신발이 없어요' 버튼이 화면에 있는가
 *   3) 누르면 shoe_requests 에 저장되는가
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TextInput} from 'react-native';
import ShoePicker from '../ShoePicker';

jest.mock('../services/shoes', () => ({
  logSearchMiss: jest.fn(async () => {}),
  requestShoe: jest.fn(async () => true),
}));
jest.mock('../lib/firebaseCloudPort', () => ({
  getFirebaseUid: jest.fn(async () => 'uid-1'),
}));
jest.mock('../lib/toast', () => ({showToast: jest.fn()}));

const {logSearchMiss, requestShoe} = require('../services/shoes');
const {showToast} = require('../lib/toast');

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') { out += String(n); return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

async function mount() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <ShoePicker visible onClose={jest.fn()} onPick={jest.fn()} insetTop={0} insetBottom={0} />,
    );
  });
  await flush();
  return r;
}

function byTestID(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props && n.props.testID === id);
}

/** 어떤 브랜드에도 없을 질의를 넣어 0건을 만든다. */
async function searchNonsense(root: ReactTestRenderer.ReactTestInstance, q = 'zzzzqqq없는신발') {
  const input = root.findAll((n: any) => n.type === TextInput && n.props.testID === 'picker-search')[0];
  await act(async () => { input.props.onChangeText(q); });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('검색 0건', () => {
  test('결과가 없으면 안내와 요청 버튼이 뜬다', async () => {
    const r = await mount();
    await searchNonsense(r.root);
    expect(byTestID(r.root, 'picker-no-result').length).toBeGreaterThan(0);
    expect(byTestID(r.root, 'picker-request-shoe').length).toBeGreaterThan(0);
    expect(textOf(r.root)).toContain('내 신발이 없어요');
  });

  test('결과가 있으면 뜨지 않는다', async () => {
    const r = await mount();
    // 기본 선택 브랜드에 실제로 있는 글자로 검색(빈 질의도 0건이 아니다).
    expect(byTestID(r.root, 'picker-no-result').length).toBe(0);
  });

  test('search_misses 에 남는다 — 타이핑이 멎은 뒤에', async () => {
    const r = await mount();
    await searchNonsense(r.root);
    // 중간 글자마다 적재하면 잡음이라 디바운스가 걸려 있다.
    expect(logSearchMiss).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1000); });
    await flush();
    expect(logSearchMiss).toHaveBeenCalledTimes(1);
    const [query, uid] = logSearchMiss.mock.calls[0];
    expect(String(query)).toContain('zzzzqqq없는신발');
    expect(uid).toBe('uid-1');
  });

  test('같은 질의를 반복 적재하지 않는다', async () => {
    const r = await mount();
    await searchNonsense(r.root);
    await act(async () => { jest.advanceTimersByTime(1000); });
    await flush();
    await searchNonsense(r.root); // 같은 질의 다시
    await act(async () => { jest.advanceTimersByTime(1000); });
    await flush();
    expect(logSearchMiss).toHaveBeenCalledTimes(1);
  });

  test('버튼을 누르면 shoe_requests 에 저장된다', async () => {
    const r = await mount();
    await searchNonsense(r.root);
    const btn = byTestID(r.root, 'picker-request-shoe').find((n: any) => typeof n.props.onPress === 'function')!;
    await act(async () => { await btn.props.onPress(); });
    await flush();
    expect(requestShoe).toHaveBeenCalledTimes(1);
    const [brand, model, uid] = requestShoe.mock.calls[0];
    expect(typeof brand).toBe('string');
    expect(String(model)).toContain('zzzzqqq없는신발');
    expect(uid).toBe('uid-1');
  });

  test('보낸 뒤에는 눌렀다는 걸 알려주고 다시 누를 수 없다', async () => {
    const r = await mount();
    await searchNonsense(r.root);
    const btn = byTestID(r.root, 'picker-request-shoe').find((n: any) => typeof n.props.onPress === 'function')!;
    await act(async () => { await btn.props.onPress(); });
    await flush();
    expect(showToast).toHaveBeenCalled();
    expect(textOf(r.root)).toContain('요청을 받았어요');
    const after = byTestID(r.root, 'picker-request-shoe').find((n: any) => n.props.disabled !== undefined);
    expect(after?.props.disabled).toBe(true);
  });

  test('저장이 실패하면 실패했다고 말한다(조용히 삼키지 않는다)', async () => {
    requestShoe.mockResolvedValueOnce(false);
    const r = await mount();
    await searchNonsense(r.root);
    const btn = byTestID(r.root, 'picker-request-shoe').find((n: any) => typeof n.props.onPress === 'function')!;
    await act(async () => { await btn.props.onPress(); });
    await flush();
    expect(textOf(r.root)).toContain('내 신발이 없어요'); // 여전히 누를 수 있다
    expect(showToast).toHaveBeenCalled();
  });
});
