/**
 * 건강 관련 문구 계약 — 2026-07-26 출시 심사 TOP30 #18(면책 전수).
 *
 * 심사 시점의 지적은 "RISK_DISCLAIMER 는 있으나 부하 카드·리캡·워치 노출이 미확인"이었다.
 * 전수 확인 결과는 다음과 같고, 이 테스트가 그 결론을 회귀 불가로 고정한다.
 *
 *   · TrainingLoadCard — **개인 평가 + 권고 문구**를 내는 유일한 화면이다
 *     ('무리하지 않게', '몸 상태를 살피며'). 단독/embedded **두 변형 모두** 고지를 낸다.
 *   · RunRecapScreen 의 부하 한 줄 — 서술형이다('이번 주 훈련 부하 급증 · 평소의 1.4배').
 *     자기가 기록한 거리의 산술 요약이라 의료 주장이 아니다 → 축하 화면에 법적 한 줄을
 *     더하는 것은 클러터일 뿐 위험을 줄이지 않는다(절제 원칙).
 *   · 신발 마모 배너(InjuryBanner) — **장비** 문구다('이 신발 곧 교체하면 …').
 *     사람을 진단하지 않으므로 고지 대상이 아니다.
 *
 * 그래서 이 테스트는 두 가지를 지킨다: (1) 평가 화면의 고지 노출, (2) 문구가 진단·처방으로
 * 넘어가지 않는 것.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TrainingLoadCard} from '../TrainingLoadCard';
import {RISK_DISCLAIMER} from '../lib/injuryRisk';
import {LOAD_MSG, LOAD_MSG_NEW} from '../lib/trainingLoad';
import {INJURY_HIGH_MSG, INJURY_CAUTION_MSG} from '../lib/injury';

const LOAD = {
  level: 'high' as const,
  acuteKm: 42,
  chronicKm: 30,
  acwr: 1.4,
  rampPct: 0.4,
  confident: true,
};

function textOf(r: ReactTestRenderer.ReactTestRenderer): string {
  return r.root
    .findAll(() => true)
    .flatMap((n: any) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]))
    .filter((c: any): c is string => typeof c === 'string')
    .join(' ');
}

function render(props: any) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<TrainingLoadCard load={LOAD as any} {...props} />);
  });
  return r;
}

describe('개인 평가 화면은 의료 고지를 함께 낸다', () => {
  it('단독 카드', () => {
    expect(textOf(render({}))).toContain(RISK_DISCLAIMER);
  });

  it('embedded 변형(홈 부하 셀 인라인 펼침) — 표면만 빠지고 고지는 남는다', () => {
    expect(textOf(render({embedded: true}))).toContain(RISK_DISCLAIMER);
  });

  it("고지 문구가 '의학적 조언이 아님'을 분명히 말한다", () => {
    expect(RISK_DISCLAIMER).toContain('의학적 조언은 아니에요');
  });
});

describe('문구가 진단·처방으로 넘어가지 않는다', () => {
  // 의료 행위를 연상시키는 단어. 이 목록이 문구에 등장하면 앱이 '진단하는 앱'이 된다
  // (App Review 1.4.1 · 국내 의료법 광고 규제 모두의 경계선).
  const FORBIDDEN = ['진단', '치료', '처방', '질환', '질병', '완치', '의학적 소견'];

  const ALL_COPY = [
    ...Object.values(LOAD_MSG),
    LOAD_MSG_NEW,
    INJURY_HIGH_MSG,
    INJURY_CAUTION_MSG,
  ];

  it.each(ALL_COPY)('"%s"', copy => {
    for (const word of FORBIDDEN) {
      expect(copy).not.toContain(word);
    }
  });

  it('신발 마모 문구는 장비 이야기다(사람을 평가하지 않는다)', () => {
    // '이 신발'처럼 대상이 장비임이 문장에 드러나야 한다.
    expect(INJURY_HIGH_MSG).toContain('신발');
    expect(INJURY_CAUTION_MSG).toContain('신발');
  });
});
