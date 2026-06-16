/**
 * RetirementCard(은퇴 키프세이크 카드 SVG) + RetirementCardActions 렌더 테스트.
 *
 * 관찰 가능한 효과:
 *   1) 4개 포맷(A/B/C/D) 모두 하나의 요약에서 카드를 렌더한다(거리/신발명/등급 배지).
 *   2) format 미지정 시 기본은 E(Midnight 배웅 키프세이크).
 *   3) Smart Retirement Grade 배지(이모지+라벨)가 모든 포맷에 보인다.
 *   4) 장착 타이틀이 KEEGO/Keep Going 워드마크 근처에 은은하게 렌더된다.
 *   5) 결손(하이라이트 없음) 요약도 크래시 없이 렌더된다.
 *   6) 액션 바의 [이미지 저장]/[공유하기] 누름이 핸들러를 호출한다.
 *   7) forwardRef 가 내부 Svg(toDataURL 보유)로 연결되어 캡처 가능.
 *
 * SVG 프리미티브는 jest.setup.js 에서 View 로 목킹되며 displayName 은 보존된다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RetirementCard from '../RetirementCard';
import RetirementCardActions from '../RetirementCardActions';
import {
  buildRetirementCardModel,
  RetirementCardFormat,
} from '../lib/progression/retirementCard';
import {RETIREMENT_HIGHLIGHT_KEYS as H} from '../lib/progression/retirement';
import type {RetirementSummary} from '../lib/progression/types';

const SAMPLE: RetirementSummary = {
  shoeId: 's1',
  name: 'Alphafly 3',
  totalKm: 512,
  runCount: 42,
  totalDurationS: 42 * 3000,
  avgPaceSec: 298,
  bestPaceSec: 261,
  longestRunKm: 32.1,
  firstRunDate: '2026-03-12',
  lastRunDate: '2026-08-22',
  usageDays: 163,
  grade: 'perfect',
  highlights: [H.marathon, H.pbLongestRun, H.pbFastestPace, H.trustedPartner500],
  mostMemorable: H.marathon,
};

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') {
      out += String(n);
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(el: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(el);
  });
  return renderer;
}

const MODEL = buildRetirementCardModel(SAMPLE, 'perfect', {equippedTitle: 'Marathon Mindset'});

describe('RetirementCard 5개 포맷 렌더', () => {
  // 등급 배지를 싣는 포맷(A~D). E(Midnight)는 감정 keepsake라 배지를 비운다(별도 검증).
  const formats: RetirementCardFormat[] = ['A', 'B', 'C', 'D'];
  const allFormats: RetirementCardFormat[] = ['E', 'A', 'B', 'C', 'D'];

  test.each(formats)('포맷 %s 는 하나의 요약에서 거리/신발명/등급 배지를 렌더한다', fmt => {
    const txt = textOf(render(<RetirementCard model={MODEL} format={fmt} />).root);
    // 신발명·거리는 모든 포맷 공통(대문자 변형 가능 → 소문자 비교로 흡수)
    expect(txt.toLowerCase()).toContain('alphafly 3'.toLowerCase());
    expect(txt).toContain('512');
    // Smart Retirement Grade 배지(이모지+라벨)
    expect(txt).toContain('Perfect Retirement');
    expect(txt).toContain(MODEL.grade.emoji);
    // KEEGO 워드마크
    expect(txt).toContain('KEEGO');
  });

  test('포맷별 시그니처 카피가 각 레이아웃에 나타난다', () => {
    expect(textOf(render(<RetirementCard model={MODEL} format="A" />).root)).toContain('MISSION COMPLETE');
    expect(textOf(render(<RetirementCard model={MODEL} format="B" />).root)).toContain('Together');
    expect(textOf(render(<RetirementCard model={MODEL} format="C" />).root)).toContain('함께했습니다');
    const d = textOf(render(<RetirementCard model={MODEL} format="D" />).root);
    expect(d).toContain('SHOE SCORE');
    expect(d).toContain('CLASS OF');
    expect(d).toContain('2026');
  });

  test('format 미지정 시 기본은 E(Midnight 배웅), A/C/D 시그니처는 없다', () => {
    const txt = textOf(render(<RetirementCard model={MODEL} />).root);
    expect(txt.toUpperCase()).toContain('RUNNING SHOE RETIREMENT'); // E 상단 라벨
    expect(txt).toContain('512km 함께'); // E 거리 그라데이션
    expect(txt).toContain('이 신발은 여정을 완주했습니다.'); // E 완주 한 줄
    expect(txt).toContain('고마웠어.'); // E 배웅
    expect(txt).toContain('KEEGO');
    expect(txt).not.toContain('MISSION COMPLETE'); // A
    expect(txt).not.toContain('함께했습니다'); // C
    expect(txt).not.toContain('SHOE SCORE'); // D
  });

  test('E(Midnight)는 등급 배지 대신 배웅을 중심에 둔다', () => {
    const txt = textOf(render(<RetirementCard model={MODEL} format="E" />).root);
    expect(txt).toContain('고마웠어.');
    expect(txt).not.toContain('Perfect Retirement'); // 배지 없음(디자인 정합)
  });

  test('장착 타이틀이 워드마크(Keep Going) 근처에 은은하게 렌더된다', () => {
    const txt = textOf(render(<RetirementCard model={MODEL} format="C" />).root);
    expect(txt).toContain('Keep Going · Marathon Mindset');
    // 타이틀이 없으면 워드마크 보조줄은 'Keep Going'만
    const noTitle = buildRetirementCardModel(SAMPLE, 'perfect');
    const txt2 = textOf(render(<RetirementCard model={noTitle} format="C" />).root);
    expect(txt2).toContain('Keep Going');
    expect(txt2).not.toContain('Marathon Mindset');
  });

  test('하이라이트 없는(결손) 요약도 크래시 없이 렌더된다', () => {
    const lean = buildRetirementCardModel(
      {...SAMPLE, highlights: [], mostMemorable: null, avgPaceSec: null, bestPaceSec: null, longestRunKm: 0},
      'standard',
    );
    for (const fmt of allFormats) {
      expect(() => render(<RetirementCard model={lean} format={fmt} />)).not.toThrow();
    }
    // PB 0 → '×0' 폴백이 보이고 등급은 standard 배지
    const txt = textOf(render(<RetirementCard model={lean} format="D" />).root);
    expect(txt).toContain('Standard Retirement');
  });

  test('forwardRef 가 내부 Svg(toDataURL 보유)로 연결되어 캡처 가능하다', () => {
    const ref = React.createRef<any>();
    act(() => {
      ReactTestRenderer.create(<RetirementCard ref={ref} model={MODEL} format="C" />);
    });
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.toDataURL).toBe('function');
  });
});

describe('RetirementCardActions 누름 → 핸들러 호출', () => {
  function pressByTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
    const node = root.find((n: any) => n.props && n.props.testID === id);
    act(() => {
      node.props.onPress();
    });
  }

  test('[이미지 저장] 누름이 onSave 를, [공유하기] 누름이 onShare 를 호출한다', () => {
    const onSave = jest.fn();
    const onShare = jest.fn();
    const renderer = render(<RetirementCardActions onSave={onSave} onShare={onShare} />);
    pressByTestId(renderer.root, 'retire-card-save');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onShare).not.toHaveBeenCalled();
    pressByTestId(renderer.root, 'retire-card-share');
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  test('저장이 진행 중이면 빠른 연타·다른 버튼 누름을 무시한다(중복 트리거 가드)', async () => {
    // onSave 는 끝나지 않는 Promise 를 돌려줘 "진행 중" 상태를 고정한다.
    let resolveSave!: () => void;
    const onSave = jest.fn(() => new Promise<void>(r => (resolveSave = r)));
    const onShare = jest.fn();
    const renderer = render(<RetirementCardActions onSave={onSave} onShare={onShare} />);

    // 저장을 빠르게 두 번 눌러도 핸들러는 한 번만 실행된다.
    pressByTestId(renderer.root, 'retire-card-save');
    pressByTestId(renderer.root, 'retire-card-save');
    expect(onSave).toHaveBeenCalledTimes(1);

    // 저장이 진행 중인 동안엔 공유 버튼도 잠겨 호출되지 않는다.
    pressByTestId(renderer.root, 'retire-card-share');
    expect(onShare).not.toHaveBeenCalled();

    // 진행이 끝나면 잠금이 풀려 다시 눌러진다.
    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });
    pressByTestId(renderer.root, 'retire-card-share');
    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
