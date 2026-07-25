/**
 * TrainingLoadCard — 훈련 부하(홈 상주, 안 A 개편 2026-07-25).
 *
 * 판정 산식은 lib/trainingLoad 단위 테스트가 담당 — 여기선 표시 계약만 본다:
 *   · 최근 4주 런 없으면 숨김, 확신 시 게이지, 콜드스타트는 게이지 없이
 *   · 약어(ACWR) 없이 평어("평소의 1.4배")만 노출
 *   · compact(홈): 접힘 = 헤더+게이지만, 탭 = 상세(메시지·분해·면책) 확장
 *   (구 TrainingLoadSignal 조건부 한 줄은 안 A 로 폐지 — 계약 삭제)
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TrainingLoadCard} from '../TrainingLoadCard';
import {LOAD_MSG, LOAD_MSG_NEW, type TrainingLoadAssessment} from '../lib/trainingLoad';

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
function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}

/** 확신(3주+) 상태의 기본 평가 — 케이스별로 필요한 필드만 덮어쓴다. */
function mk(over: Partial<TrainingLoadAssessment> = {}): TrainingLoadAssessment {
  return {
    acwr: 1.0, acuteKm: 20, chronicKm: 20, acuteLoad: 20, chronicLoad: 20,
    rampPct: 0, level: 'safe', confident: true, message: LOAD_MSG.safe,
    recentConsecutiveDays: 0,
    ...over,
  };
}

describe('TrainingLoadCard compact (홈 상주 — 안 A)', () => {
  test('접힘 기본: 헤더(워드·배율)+게이지만, 메시지·분해·면책은 숨김', () => {
    const load = mk({level: 'caution', acwr: 1.4, acuteKm: 24.2, chronicKm: 17.3, message: LOAD_MSG.caution});
    const r = render(<TrainingLoadCard load={load} compact />);
    const txt = textOf(r.toJSON());
    expect(txt).toContain('늘어남');
    expect(txt).toContain('평소의 1.4배');
    expect(txt).not.toContain(LOAD_MSG.caution); // 상세 메시지는 접힘
    expect(txt).not.toContain('최근 7일'); // 주간 분해도 접힘
    expect(r.root.findAllByProps({testID: 'training-load-gauge'}).length).toBeGreaterThan(0);
  });

  test('탭 → 상세 확장(메시지·7일/4주 분해), 다시 탭 → 접힘', () => {
    const load = mk({level: 'high', acwr: 1.8, acuteKm: 30, chronicKm: 16, message: LOAD_MSG.high});
    const r = render(<TrainingLoadCard load={load} compact />);
    const host = r.root.findByProps({testID: 'training-load-card-high'});
    act(() => host.props.onPress());
    let txt = textOf(r.toJSON());
    expect(txt).toContain(LOAD_MSG.high);
    expect(txt).toContain('최근 7일');
    act(() => host.props.onPress());
    txt = textOf(r.toJSON());
    expect(txt).not.toContain('최근 7일');
  });

  test('안전(safe)이어도 상시 노출 — 구 조건부 침묵 계약 폐지', () => {
    const r = render(<TrainingLoadCard load={mk()} compact />);
    expect(r.toJSON()).not.toBeNull();
    expect(textOf(r.toJSON())).toContain('훈련 부하');
  });
});

describe('TrainingLoadCard (상세 — compact 아님)', () => {
  test('최근 4주 런 없음 → 숨김(빈 게이지 날조 금지)', () => {
    const load = mk({acuteKm: 0, chronicKm: 0, acuteLoad: 0, chronicLoad: 0, acwr: null, confident: false});
    expect(render(<TrainingLoadCard load={load} />).toJSON()).toBeNull();
    expect(render(<TrainingLoadCard load={null} />).toJSON()).toBeNull();
  });

  test('확신 + 늘어남 → 평어 워드·배율·keep-going 문구·게이지·7일/4주 분해', () => {
    const load = mk({
      level: 'caution', acwr: 1.4, acuteKm: 24.2, chronicKm: 17.3,
      message: LOAD_MSG.caution,
    });
    const r = render(<TrainingLoadCard load={load} />);
    const txt = textOf(r.toJSON());
    expect(txt).toContain('훈련 부하');
    expect(txt).toContain('늘어남');
    expect(txt).toContain('평소의 1.4배');
    expect(txt).toContain(LOAD_MSG.caution);
    expect(txt).toContain('24.2');
    expect(txt).toContain('17.3');
    expect(txt).toContain('최근 7일');
    expect(txt).toContain('평소 주간 평균');
    expect(txt).not.toContain('ACWR'); // 약어 금지 — 평어만
    expect(r.root.findAllByProps({testID: 'training-load-gauge'}).length).toBeGreaterThan(0);
  });

  test('콜드스타트(미확신) → "기록 쌓는 중" + 게이지 없음', () => {
    const load = mk({
      acwr: null, confident: false, level: 'safe',
      acuteKm: 12, chronicKm: 3, rampPct: null, message: LOAD_MSG_NEW,
    });
    const r = render(<TrainingLoadCard load={load} />);
    const txt = textOf(r.toJSON());
    expect(txt).toContain('기록 쌓는 중');
    expect(txt).toContain(LOAD_MSG_NEW);
    expect(r.root.findAllByProps({testID: 'training-load-gauge'})).toHaveLength(0);
  });

  test('마일 단위 → 거리 칩이 mi 로 환산된다', () => {
    const load = mk({level: 'safe', acwr: 1.0, acuteKm: 16.09, chronicKm: 16.09, message: LOAD_MSG.safe});
    const txt = textOf(render(<TrainingLoadCard load={load} unit="mi" />).toJSON());
    expect(txt).toContain('10');
    expect(txt).toContain('mi');
  });
});
