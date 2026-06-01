/**
 * 런 상세 '공유' 버튼(HistoryScreen RunDetail) 통합 테스트.
 *
 * 관찰 가능한 효과를 검증한다:
 *   1) 런 상세에서 공유 버튼을 누르면 RN Share.share가 호출되고, 전달된 message가
 *      거리·페이스·시간·신발명을 담은 buildRunShareText 결과와 일치한다.
 *   2) 단위가 mi인 런은 거리/페이스 라벨이 mi로 환산되어 공유된다.
 *
 * Share는 네이티브 모듈이므로 jest.spyOn으로 가로채 호출 인자만 검사한다(실제
 * 공유 시트는 띄우지 않는다 — 네이티브 추가 0의 RN 표준 API 사용을 확인).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Share} from 'react-native';
import HistoryScreen from '../HistoryScreen.rn';
import {buildRunShareText} from '../lib/share';

const SHOE = {brand: 'NIKE', model: 'Pegasus 41', used: 0, max: 800, condition: '양호'} as any;

const RUN = {
  id: 'r1',
  date: '5월 28일',
  day: '수',
  dateNum: '28',
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

function shareButton(root: ReactTestRenderer.ReactTestInstance) {
  return root.find(
    (n: any) => n && n.props && n.props.accessibilityLabel === '공유' && typeof n.props.onPress === 'function',
  );
}

describe('HistoryScreen 공유 버튼', () => {
  let shareSpy: jest.SpyInstance;

  beforeEach(() => {
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as any);
  });
  afterEach(() => {
    shareSpy.mockRestore();
  });

  test('공유 버튼을 누르면 Share.share가 거리/페이스/시간/신발명 요약으로 호출된다', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={[RUN]} unit="km" />);
    });
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');

    await act(async () => {
      shareButton(root).props.onPress();
    });
    await flush();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0];
    const msg: string = arg.message;
    expect(msg).toContain('📍 거리 5.20 km');
    expect(msg).toContain('⚡ 페이스 5\'02" /km');
    expect(msg).toContain('⏱️ 시간 40:41');
    expect(msg).toContain('👟 신발 NIKE Pegasus 41');
    expect(msg).toContain('keep going');
    // 화면에 보이는 데이터와 정확히 같은 순수함수 결과인지 확인
    expect(msg).toBe(
      buildRunShareText({
        distKm: 5.2,
        unit: 'km',
        pace: "5'02\"",
        time: '40:41',
        shoeBrand: 'NIKE',
        shoeModel: 'Pegasus 41',
        date: '5월 28일 수요일',
      }),
    );
  });

  test('mi 단위 런은 거리/페이스가 mi로 환산되어 공유된다', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={[RUN]} unit="mi" />);
    });
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');
    await act(async () => {
      shareButton(root).props.onPress();
    });
    await flush();

    const msg: string = shareSpy.mock.calls[0][0].message;
    // 5.2 km == 3.23 mi
    expect(msg).toContain('📍 거리 3.23 mi');
    expect(msg).toContain('/mi');
  });
});
