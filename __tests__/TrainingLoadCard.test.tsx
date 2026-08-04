/**
 * TrainingLoadCard — 훈련 부하 상세(홈 '이번 주 러닝' 원카드 인라인 확장, B안 2026-07-25).
 *
 * 판정 산식은 lib/trainingLoad 단위 테스트가 담당 — 여기선 표시 계약만 본다:
 *   · 최근 4주 런 없으면 숨김, 확신 시 게이지, 콜드스타트는 게이지 없이
 *   · 약어(ACWR) 없이 평어("평소의 1.4배")만 노출
 *   · embedded: 표면(유리 헤어라인) 없이 내용만 — 부모 카드 이중 표면 금지
 *   (구 compact 접힘/펼침 변형은 폐지 — 홈 카드의 부하 셀이 그 역할을 맡는다.
 *    구 TrainingLoadSignal 조건부 한 줄도 폐지 — 계약 삭제)
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
    if (typeof n === 'string') { out += n; return; }
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

describe('TrainingLoadCard embedded (홈 원카드 인라인 확장)', () => {
  test('embedded 는 유리 헤어라인(GlassEdge) 없이 내용만 — 부모 카드가 표면을 소유', () => {
    const load = mk({level: 'caution', acwr: 1.4, message: LOAD_MSG.caution});
    const plain = render(<TrainingLoadCard load={load} embedded />);
    const carded = render(<TrainingLoadCard load={load} />);
    const edges = (r: ReactTestRenderer.ReactTestRenderer) =>
      r.root.findAll((n: any) => n?.props?.testID === 'glass-edge').length;
    expect(edges(plain)).toBe(0);
    expect(edges(carded)).toBeGreaterThan(0);
  });

  test('embedded 도 상세 전량(메시지·7일/4주 분해·면책)을 편다 — 접힘 상태는 없다', () => {
    const load = mk({level: 'high', acwr: 1.8, acuteKm: 30, chronicKm: 16, message: LOAD_MSG.high});
    const txt = textOf(render(<TrainingLoadCard load={load} embedded />).toJSON());
    expect(txt).toContain(LOAD_MSG.high);
    expect(txt).toContain('최근 7일');
    expect(txt).toContain('평소 주간 평균');
  });
});

describe('TrainingLoadCard (단독 카드)', () => {
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
