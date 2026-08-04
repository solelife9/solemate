/**
 * 런 상세 '카드 공유'(이미지) 통합 테스트 — 공유 카드 선택기(ShareCardPicker) 경유.
 *
 * 관찰 가능한 효과를 검증한다:
 *   1) 상세의 공유 버튼을 누르면 선택기가 열리고, 선택기의 '공유'가 오프스크린 ShareCard의
 *      Svg ref.toDataURL()로 만든 PNG dataURL을 RN Share.share에 url로 전달한다.
 *   2) 선택기의 '저장'은 투명 PNG를 MediaLibrary(사진앱)에 저장한다.
 *   3) 공유가 reject 돼도 예외가 표면화되지 않는다(텍스트 폴백, 조용히 무시).
 *
 * toDataURL은 jest.setup.js의 Svg 목이 흉내 내므로(고정 base64) 네이티브 캔버스 없이
 * dataURL 생성→공유 경로 전체를 검증한다. 새 네이티브 의존은 추가하지 않는다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Share} from 'react-native';
import * as dialogLib from '../lib/dialog';
import * as MediaLibrary from 'expo-media-library/legacy';
import HistoryScreen from '../HistoryScreen.rn';

const SHOE = {brand: 'NIKE', model: 'Pegasus 41', used: 0, max: 800} as any;

// 기본 기간 '월'(이번 달)이 런을 거르지 않도록 run_date를 이번 달로 둔다(Phase 5b 이후
// 월 목록은 run_date startsWith(이번 달)로 필터된다). 표시값(date/day)은 그대로.
const THIS_MONTH = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-10`; })();

const RUN = {
  id: 'r1',
  date: '5월 28일',
  day: '수',
  dateNum: '28',
  run_date: THIS_MONTH,
  dist: 5.2,
  pace: "5'02\"",
  time: '40:41',
  shoe: 0,
  cal: 0,
  cadence: 0,
  bpm: 0,
  elev: 0,
} as any;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

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

async function openDetail(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  await act(async () => {
    hits[0].props.onPress();
  });
  await flush();
}

function byTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  const hits = root.findAll((n: any) => n && n.props && n.props.testID === id && typeof n.props.onPress === 'function');
  if (!hits.length) throw new Error(`testID "${id}" 인 누를 수 있는 노드가 없음`);
  return hits[0];
}

// 상세의 공유 버튼(testID=detail-share)을 눌러 선택기를 연다.
async function openPicker(root: ReactTestRenderer.ReactTestInstance) {
  await act(async () => { byTestId(root, 'detail-share').props.onPress(); });
  await flush();
}

describe('HistoryScreen 카드 공유(이미지) — 선택기 경유', () => {
  let shareSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;
  // 렌더러를 추적해 **테스트마다 반드시 언마운트한다**(2026-07-30 flaky 대응).
  //
  // 이 스위트만 언마운트를 안 하고 있었다(App.* 스위트들은 전부 한다). 런 상세를 열면
  // HistoryScreen 이 사진·경로·스플릿·트랙·노면을 AsyncStorage 에서 비동기로 읽고
  // `.then(() => alive && setXxx(...))` 로 상태를 넣는다(HistoryScreen.rn.tsx:196·321·332·350·367).
  // 그 `alive` 는 **언마운트(정리 함수)에서만** false 가 되므로, 트리를 띄운 채 테스트가
  // 끝나면 남은 promise 가 나중에 착지해 act 밖에서 React 커밋을 일으킨다 —
  // jest.setup.after.js 헤더가 적어둔 그 실패 계열이고, 실제 관측된 스택도
  // flushLayoutEffects ← commitRoot ← 스케줄러였다. CPU 경합이 심할 때만 늦게 착지해
  // 간헐적으로만 터졌다(단독 20회·전체 14회 연속으로는 재현되지 않음).
  let renderers: ReactTestRenderer.ReactTestRenderer[] = [];
  const mount = async (node: React.ReactElement) => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { r = ReactTestRenderer.create(node); });
    renderers.push(r);
    return r;
  };
  beforeEach(() => {
    renderers = [];
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as any);
    alertSpy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  });
  afterEach(async () => {
    // 언마운트 → 각 effect 의 cleanup 이 alive=false 로 만들어, 뒤늦게 오는 promise 가
    // setState 를 하지 않는다. 남은 microtask 도 여기서 흘려보낸다.
    await act(async () => { renderers.forEach(r => r.unmount()); });
    await flush();
    renderers = [];
    shareSpy.mockRestore();
    alertSpy.mockRestore();
  });

  test('선택기의 공유 → toDataURL PNG dataURL이 Share.share에 url로 전달된다', async () => {
    const renderer = await mount(<HistoryScreen shoes={[SHOE]} runs={[RUN]} unit="km" />);
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');
    await openPicker(root);

    await act(async () => { byTestId(root, 'sharecard-share').props.onPress(); });
    await flush();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0];
    // 이미지 공유: 텍스트(message)가 아니라 PNG dataURL(url)을 보낸다.
    expect(arg.message).toBeUndefined();
    expect(typeof arg.url).toBe('string');
    expect(arg.url.startsWith('data:image/png;base64,')).toBe(true);
    expect(arg.url).toBe('data:image/png;base64,MOCK_SHARE_CARD_PNG_BASE64');
  });

  test("선택기의 저장 → 투명 PNG가 MediaLibrary 로 사진앱에 저장된다", async () => {
    const saveSpy = jest.spyOn(MediaLibrary, 'saveToLibraryAsync').mockResolvedValue(undefined as any);
    const renderer = await mount(<HistoryScreen shoes={[SHOE]} runs={[RUN]} unit="km" />);
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');
    await openPicker(root);

    await act(async () => { byTestId(root, 'sharecard-save').props.onPress(); });
    await flush();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(String(saveSpy.mock.calls[0][0])).toContain('keego-run'); // 임시 PNG 파일 경로
    expect(shareSpy).not.toHaveBeenCalled(); // 저장 경로는 공유 시트를 띄우지 않는다
    saveSpy.mockRestore();
  });

  test('공유가 reject 돼도 예외가 표면화되지 않는다(텍스트 폴백, 조용히 무시)', async () => {
    shareSpy.mockRejectedValue(new Error('user dismissed / native failure'));
    const renderer = await mount(<HistoryScreen shoes={[SHOE]} runs={[RUN]} unit="km" />);
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');
    await openPicker(root);

    await expect(
      (async () => {
        await act(async () => { byTestId(root, 'sharecard-share').props.onPress(); });
        await flush();
      })(),
    ).resolves.toBeUndefined();
  });
});
