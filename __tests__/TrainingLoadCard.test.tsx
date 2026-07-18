/**
 * TrainingLoadCard / TrainingLoadSignal — 훈련 부하 재노출(2026-07-18, 시안 A).
 *
 * 판정 산식은 lib/trainingLoad 단위 테스트가 담당 — 여기선 표시 계약만 본다:
 *   · 홈 시그널은 침묵 기본(safe/미확신 = null), caution/high 에서만 한 줄
 *   · 기록 탭 카드는 최근 4주 런 없으면 숨김, 확신 시 게이지, 콜드스타트는 게이지 없이
 *   · 약어(ACWR) 없이 평어("평소의 1.4배")만 노출
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TrainingLoadCard, TrainingLoadSignal} from '../TrainingLoadCard';
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

describe('TrainingLoadSignal (홈 조건부 한 줄)', () => {
  test('안정적(safe) → 침묵(null) — 홈 다이어트 계약', () => {
    expect(render(<TrainingLoadSignal load={mk()} />).toJSON()).toBeNull();
    expect(render(<TrainingLoadSignal load={mk({level: 'low', acwr: 0.5})} />).toJSON()).toBeNull();
  });

  test('표본 부족(미확신) → caution 이어도 침묵', () => {
    const load = mk({level: 'caution', acwr: null, confident: false, message: LOAD_MSG_NEW});
    expect(render(<TrainingLoadSignal load={load} />).toJSON()).toBeNull();
  });

  test('늘어남(caution) → 한 줄 + 자세히, 탭 시 onPress', () => {
    const onPress = jest.fn();
    const r = render(<TrainingLoadSignal load={mk({level: 'caution', acwr: 1.4, message: LOAD_MSG.caution})} onPress={onPress} />);
    const txt = textOf(r.toJSON());
    expect(txt).toContain('운동량이 평소보다 빠르게 늘고 있어요');
    expect(txt).toContain('자세히');
    const host = r.root.findByProps({testID: 'training-load-signal-caution'});
    act(() => host.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });

  test('급증(high) → 배율을 숫자로 말한다("평소의 1.8배")', () => {
    const r = render(<TrainingLoadSignal load={mk({level: 'high', acwr: 1.8, message: LOAD_MSG.high})} />);
    expect(textOf(r.toJSON())).toContain('평소의 1.8배');
  });
});

describe('TrainingLoadCard (기록 탭 인사이트)', () => {
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
