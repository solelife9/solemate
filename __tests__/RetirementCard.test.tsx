/**
 * RetirementCard(은퇴 키프세이크 카드 SVG) + RetirementCardActions 렌더 테스트.
 *
 * 관찰 가능한 효과(2026-07-16 컴팩트 공유 카드 언어 통일 — E 정사각 / S 스토리):
 *   1) 두 포맷 모두 하나의 요약에서 카드를 렌더한다(신발명/거리/배웅/keego).
 *   2) format 미지정 시 기본은 E(정사각 1080²), S 는 스토리(1080×1920).
 *   3) 감정 keepsake 정합 — 등급 배지·게임화 카피는 싣지 않는다.
 *   4) MOST MEMORABLE 라벨은 이모지를 뗀 텍스트만(공유 카드 절제).
 *   5) 결손(하이라이트 없음) 요약도 크래시 없이 렌더된다.
 *   6) 액션 바의 [이미지 저장]/[공유하기] 누름이 핸들러를 호출한다.
 *   7) forwardRef 가 내부 Svg(toDataURL 보유)로 연결되어 캡처 가능.
 *   8) displayWidth 지정 시 축소 렌더(미리보기), 미지정 시 실캔버스(고해상 캡처).
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
  RETIREMENT_CARD_FORMATS,
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

describe('RetirementCard 2개 포맷 렌더(컴팩트 공유 카드 언어)', () => {
  test.each(RETIREMENT_CARD_FORMATS as RetirementCardFormat[])(
    '포맷 %s 는 하나의 요약에서 라벨/신발명/거리/배웅/keego 를 렌더한다',
    fmt => {
      const txt = textOf(render(<RetirementCard model={MODEL} format={fmt} />).root);
      expect(txt.toUpperCase()).toContain('RUNNING SHOE RETIREMENT');
      expect(txt.toLowerCase()).toContain('alphafly 3'.toLowerCase());
      expect(txt).toContain('512');
      expect(txt).toContain('고마웠어'); // 배웅(사용 기간 기반)
      expect(txt).toContain('keego'); // 파파야 워드마크(소문자)
    },
  );

  test('E(정사각): 지표 셀(RUNS/AVG PACE/LONGEST)과 함께 달린 거리 캡션, 1080×1080', () => {
    const r = render(<RetirementCard model={MODEL} format="E" />);
    const txt = textOf(r.root);
    expect(txt).toContain('RUNS');
    expect(txt).toContain('42');
    expect(txt).toContain('AVG PACE');
    expect(txt).toContain('LONGEST');
    expect(txt).toContain('함께 달린 거리');
    const svg = r.root.findAll(n => n.props?.width === 1080 && n.props?.height === 1080);
    expect(svg.length).toBeGreaterThan(0);
  });

  test('S(스토리 9:16): 함께 달린 거리·MOST MEMORABLE(이모지 제거)·기간, 1080×1920', () => {
    const r = render(<RetirementCard model={MODEL} format="S" />);
    const txt = textOf(r.root);
    expect(txt).toContain('함께 달린 거리');
    expect(txt).toContain('MOST MEMORABLE');
    expect(txt).toContain('풀코스 완주'); // 라벨 텍스트는 유지하되
    expect(txt).not.toContain('🏁'); // 선두 이모지는 절제(공유 카드)
    expect(txt).toContain('2026.03.12 → 2026.08.22');
    const svg = r.root.findAll(n => n.props?.width === 1080 && n.props?.height === 1920);
    expect(svg.length).toBeGreaterThan(0);
  });

  test('format 미지정 시 기본은 E(정사각) — 스토리 규격이 아니다', () => {
    const r = render(<RetirementCard model={MODEL} />);
    const txt = textOf(r.root);
    expect(txt.toUpperCase()).toContain('RUNNING SHOE RETIREMENT');
    expect(txt).toContain('고마웠어.');
    const story = r.root.findAll(n => n.props?.height === 1920);
    expect(story.length).toBe(0);
  });

  test('감정 keepsake 정합 — 등급 배지·게임화 카피를 싣지 않는다', () => {
    for (const fmt of RETIREMENT_CARD_FORMATS) {
      const txt = textOf(render(<RetirementCard model={MODEL} format={fmt} />).root);
      expect(txt).not.toContain('Perfect Retirement'); // 등급 배지 없음
      expect(txt).not.toContain('MISSION COMPLETE'); // 구 A 카피
      expect(txt).not.toContain('SHOE SCORE'); // 구 D 카피
    }
  });

  test('displayWidth 지정 시 축소 렌더(viewBox 유지), 미지정 시 실캔버스', () => {
    const preview = render(<RetirementCard model={MODEL} format="S" displayWidth={324} />);
    // 324 × (1920/1080) = 576
    const scaled = preview.root.findAll(n => n.props?.width === 324 && n.props?.height === 576);
    expect(scaled.length).toBeGreaterThan(0);
    const full = render(<RetirementCard model={MODEL} format="S" />);
    expect(full.root.findAll(n => n.props?.width === 1080).length).toBeGreaterThan(0);
  });

  test('하이라이트 없는(결손) 요약도 크래시 없이 렌더된다', () => {
    const lean = buildRetirementCardModel(
      {...SAMPLE, highlights: [], mostMemorable: null, avgPaceSec: null, bestPaceSec: null, longestRunKm: 0},
      'standard',
    );
    for (const fmt of RETIREMENT_CARD_FORMATS) {
      expect(() => render(<RetirementCard model={lean} format={fmt} />)).not.toThrow();
    }
    // 없는 지표 칸은 빠진다(AVG PACE/LONGEST 없음, RUNS 만).
    const txt = textOf(render(<RetirementCard model={lean} format="E" />).root);
    expect(txt).toContain('RUNS');
    expect(txt).not.toContain('AVG PACE');
    expect(txt).not.toContain('LONGEST');
    expect(txt).not.toContain('MOST MEMORABLE');
  });

  test('forwardRef 가 내부 Svg(toDataURL 보유)로 연결되어 캡처 가능하다', () => {
    const ref = React.createRef<any>();
    act(() => {
      ReactTestRenderer.create(<RetirementCard ref={ref} model={MODEL} format="E" />);
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
