/**
 * 런 상세 '카드 공유'(이미지) 버튼 통합 테스트.
 *
 * 관찰 가능한 효과를 검증한다:
 *   1) 런 상세에서 카드 공유 버튼을 누르면, 화면 밖에 마운트된 ShareCard의 Svg
 *      ref.toDataURL()로 만든 PNG dataURL이 RN Share.share에 url로 전달된다.
 *   2) 기존 텍스트 공유 버튼('공유')은 그대로 유지되어 message로 공유한다(회귀 가드).
 *
 * toDataURL은 jest.setup.js의 Svg 목이 흉내 내므로(고정 base64) 네이티브 캔버스 없이
 * dataURL 생성→공유 경로 전체를 검증한다. 새 네이티브 의존은 추가하지 않는다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Share, Alert} from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import HistoryScreen from '../HistoryScreen.rn';

const SHOE = {brand: 'NIKE', model: 'Pegasus 41', used: 0, max: 800, condition: '양호'} as any;

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
    if (typeof n === 'string') return void (out += n);
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

function byLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.find(
    (n: any) => n && n.props && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
}

// '공유' 버튼은 액션시트(Alert)를 띄운다 — 사진앱에 저장 / 공유 시트로 / 취소.
// 카드 PNG 공유(Share.share)는 '공유 시트로' 에서 일어난다.
function tapAlert(alertSpy: jest.SpyInstance, label: string) {
  const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  const buttons = (call[2] as any[]) || [];
  const btn = buttons.find(b => b.text === label);
  if (!btn) throw new Error(`공유 액션시트에 "${label}" 가 없음`);
  return btn.onPress();
}

describe('HistoryScreen 카드 공유(이미지) 버튼', () => {
  let shareSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as any);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    shareSpy.mockRestore();
    alertSpy.mockRestore();
  });

  test('카드 공유를 누르면 toDataURL PNG dataURL이 Share.share에 url로 전달된다', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={[RUN]} unit="km" />);
    });
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');

    await act(async () => {
      byLabel(root, '공유').props.onPress(); // 액션시트 표시
    });
    await act(async () => {
      tapAlert(alertSpy, '공유 시트로'); // '사진 없이' → 캡처·공유
    });
    await flush();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0];
    // 이미지 공유: 텍스트(message)가 아니라 PNG dataURL(url)을 보낸다.
    expect(arg.message).toBeUndefined();
    expect(typeof arg.url).toBe('string');
    expect(arg.url.startsWith('data:image/png;base64,')).toBe(true);
    // jest.setup의 Svg 목이 내보내는 고정 base64가 그대로 dataURL에 담긴다.
    expect(arg.url).toBe('data:image/png;base64,MOCK_SHARE_CARD_PNG_BASE64');
  });

  test("'사진앱에 저장' → 투명 PNG가 MediaLibrary 로 사진앱에 저장된다(인스타 스토리용)", async () => {
    const saveSpy = jest.spyOn(MediaLibrary, 'saveToLibraryAsync').mockResolvedValue(undefined as any);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={[RUN]} unit="km" />);
    });
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');

    await act(async () => {
      byLabel(root, '공유').props.onPress();
    });
    await act(async () => {
      await tapAlert(alertSpy, '사진앱에 저장');
    });
    await flush();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(String(saveSpy.mock.calls[0][0])).toContain('keego-run'); // 임시 PNG 파일 경로
    expect(shareSpy).not.toHaveBeenCalled(); // 저장 경로는 공유 시트를 띄우지 않는다
    saveSpy.mockRestore();
  });

  test('카드 공유가 reject 돼도 예외가 표면화되지 않는다(조용히 무시)', async () => {
    shareSpy.mockRejectedValue(new Error('user dismissed / native failure'));
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={[RUN]} unit="km" />);
    });
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');

    await expect(
      (async () => {
        await act(async () => {
          byLabel(root, '공유').props.onPress();
        });
        await act(async () => {
          tapAlert(alertSpy, '공유 시트로');
        });
        await flush();
      })(),
    ).resolves.toBeUndefined();
  });
});
