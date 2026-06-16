// lib/progression/retirementCard + retirementShare — 은퇴 카드 뷰모델/저장·공유.
//
// 관찰 가능한 동작:
//   · 요약 + 등급 → 표시 필드(거리/페이스/날짜/PB/하이라이트/등급 배지/Shoe Score)
//     가 실제 집계에서 파생된다(날조 금지). 장착 타이틀은 모델에 실린다.
//   · 결손(하이라이트 없음/페이스 null/0거리) 요약도 throw 없이 안전하게 비운다.
//   · saveRetirementCardImage 는 캡처 dataURL 을 주입 저장기로 영속하고, 캡처 실패 시
//     텍스트 공유로 폴백한다(크래시 금지). shareRetirementCard 는 dataURL 을 시트로 내보내며
//     대상 앱이 없어도(Share reject) 예외를 삼킨다.
import {Share} from 'react-native';
import {
  buildRetirementCardModel,
  retirementGradeBadge,
  highlightLabel,
  DEFAULT_RETIREMENT_CARD_FORMAT,
  RETIREMENT_CARD_FORMATS,
} from '../../../lib/progression/retirementCard';
import {
  saveRetirementCardImage,
  shareRetirementCard,
  buildRetirementShareText,
  setCardImageSaver,
} from '../../../lib/progression/retirementShare';
import {RETIREMENT_HIGHLIGHT_KEYS as H} from '../../../lib/progression/retirement';
import {TIER_COLORS} from '../../../theme';
import type {RetirementSummary} from '../../../lib/progression/types';

const SAMPLE: RetirementSummary = {
  shoeId: 's1',
  name: 'Alphafly 3',
  totalKm: 512,
  runCount: 42,
  totalDurationS: 42 * 3000,
  avgPaceSec: 298, // 4'58"
  bestPaceSec: 261, // 4'21"
  longestRunKm: 32.1,
  firstRunDate: '2026-03-12',
  lastRunDate: '2026-08-22',
  usageDays: 163,
  grade: 'perfect',
  highlights: [H.marathon, H.pbLongestRun, H.pbFastestPace, H.trustedPartner500],
  mostMemorable: H.marathon,
};

describe('buildRetirementCardModel (필드 매핑)', () => {
  test('실제 집계가 표시 필드로 파생된다(거리/페이스/날짜/PB/하이라이트)', () => {
    const m = buildRetirementCardModel(SAMPLE, 'perfect', {equippedTitle: 'Marathon Mindset'});
    expect(m.shoeName).toBe('Alphafly 3');
    expect(m.distance).toBe('512');
    expect(m.distanceLabel).toBe('512km');
    expect(m.togetherLine).toBe('512km 함께했습니다');
    expect(m.runCountLabel).toBe('42');
    expect(m.avgPace).toBe("4'58\"");
    expect(m.bestPace).toBe("4'21\"");
    expect(m.longestRun).toBe('32.1');
    // PB 하이라이트 2개(pbLongestRun, pbFastestPace) → ×2 (날조 없는 실제 PB 수)
    expect(m.pbCount).toBe(2);
    expect(m.pbLabel).toBe('×2');
    expect(m.dateRange).toBe('2026.03.12 → 2026.08.22');
    expect(m.retireYear).toBe(2026);
    // 하이라이트 라벨이 우선순위 순으로 매핑된다
    expect(m.highlights[0]).toBe(highlightLabel(H.marathon));
    expect(m.mostMemorable).toBe(highlightLabel(H.marathon));
    // 장착 타이틀은 모델에 실린다(워드마크 근처 표시용)
    expect(m.equippedTitle).toBe('Marathon Mindset');
    expect(m.brand).toBe('KEEGO');
  });

  test('등급 배지는 TIER_COLORS 색만 쓰며 grade 인자가 summary.grade 보다 우선한다', () => {
    const badge = retirementGradeBadge('perfect');
    expect(badge.label).toBe('Perfect Retirement');
    expect(badge.color).toBe(TIER_COLORS[badge.tier]);
    // grade 인자(smart)가 summary.grade(perfect)를 덮어쓴다
    const m = buildRetirementCardModel(SAMPLE, 'smart');
    expect(m.grade.grade).toBe('smart');
    expect(m.grade.label).toBe('Smart Retirement');
    expect(m.grade.color).toBe(TIER_COLORS[m.grade.tier]);
  });

  test('Shoe Score 는 등급 + PB 수에서 결정론적으로 0..100 으로 환산된다', () => {
    const m = buildRetirementCardModel(SAMPLE, 'hallOfFame');
    // hallOfFame(99) + min(pbCount=2,3) = 101 → 100 으로 클램프
    expect(m.shoeScore).toBe(100);
    const std = buildRetirementCardModel({...SAMPLE, highlights: []}, 'standard');
    expect(std.shoeScore).toBe(72); // standard 기준점, PB 0
  });

  test('mi 단위는 거리/최장 런을 환산하되 함께했습니다 카피 단위도 따라간다', () => {
    const m = buildRetirementCardModel(SAMPLE, 'perfect', {unit: 'mi'});
    expect(m.unit).toBe('mi');
    expect(m.distanceLabel.endsWith('mi')).toBe(true);
    expect(m.togetherLine.endsWith('함께했습니다')).toBe(true);
  });

  test('결손 요약(하이라이트 없음/페이스 null/0거리/이름 없음)도 throw 없이 안전하게 비운다', () => {
    const lean: RetirementSummary = {
      shoeId: '',
      name: '',
      totalKm: 0,
      runCount: 0,
      totalDurationS: 0,
      avgPaceSec: null,
      bestPaceSec: null,
      longestRunKm: 0,
      firstRunDate: null,
      lastRunDate: null,
      usageDays: 0,
      grade: 'standard',
      highlights: [],
      mostMemorable: null,
    };
    const m = buildRetirementCardModel(lean);
    expect(m.shoeName).toBe('내 러닝화'); // 폴백
    expect(m.distance).toBe('0');
    expect(m.avgPace).toBeNull();
    expect(m.bestPace).toBeNull();
    expect(m.longestRun).toBeNull();
    expect(m.pbLabel).toBeNull();
    expect(m.highlights).toEqual([]);
    expect(m.mostMemorable).toBeNull();
    expect(m.dateRange).toBe('');
    expect(m.retireYear).toBe(0);
    // 미지정 등급은 standard 로 폴백
    expect(m.grade.grade).toBe('standard');
  });

  test('null 요약에서도 기본 등급 모델을 만든다(throw 금지)', () => {
    const m = buildRetirementCardModel(null);
    expect(m.shoeName).toBe('내 러닝화');
    expect(m.grade.grade).toBe('standard');
  });

  test('포맷 상수: 5개 포맷 + 기본 E(Midnight)', () => {
    expect(RETIREMENT_CARD_FORMATS).toEqual(['E', 'A', 'B', 'C', 'D']);
    expect(DEFAULT_RETIREMENT_CARD_FORMAT).toBe('E');
  });

  test('E(Midnight) 카피 필드: 거리 함께 · 기간 · 배웅 · 완주', () => {
    const m = buildRetirementCardModel(SAMPLE, 'perfect');
    expect(m.togetherDistance).toBe(`${m.distanceLabel} 함께`);
    expect(m.retireLabel).toBe('Running Shoe Retirement');
    expect(m.completed).toBe('이 신발은 여정을 완주했습니다.');
    expect(m.farewell).toMatch(/고마웠어\.$/);
  });
});

describe('retirementShare (저장/공유, 오프라인·크래시 금지)', () => {
  let spy: jest.SpyInstance;
  const model = buildRetirementCardModel(SAMPLE, 'perfect');
  beforeEach(() => {
    spy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as any);
  });
  afterEach(() => {
    spy.mockRestore();
    setCardImageSaver(null); // 주입 저장기 해제(테스트 격리)
  });

  test('saveRetirementCardImage: 캡처 dataURL 을 주입 저장기로 영속한다', async () => {
    const saver = jest.fn().mockResolvedValue(undefined);
    setCardImageSaver(saver);
    const ref = {current: {toDataURL: (cb: (b: string) => void) => cb('PNGDATA')}};
    const ok = await saveRetirementCardImage(ref, model);
    expect(ok).toBe(true);
    expect(saver).toHaveBeenCalledWith('data:image/png;base64,PNGDATA');
    // 저장기가 처리하므로 Share 시트는 열지 않는다
    expect(spy).not.toHaveBeenCalled();
  });

  test('saveRetirementCardImage: 저장기 미등록이면 기본 시트(url)로 저장한다', async () => {
    const ref = {current: {toDataURL: (cb: (b: string) => void) => cb('PNGDATA')}};
    const ok = await saveRetirementCardImage(ref, model);
    expect(ok).toBe(true);
    expect(spy).toHaveBeenCalledWith({url: 'data:image/png;base64,PNGDATA'});
  });

  test('saveRetirementCardImage: 캡처 실패 시 텍스트 폴백 공유(크래시 금지, false)', async () => {
    const ok = await saveRetirementCardImage(null, model);
    expect(ok).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].message).toBe(buildRetirementShareText(model));
  });

  test('shareRetirementCard: 캡처 성공 시 이미지 dataURL 을 url 로 공유한다', async () => {
    const ref = {current: {toDataURL: (cb: (b: string) => void) => cb('PNGDATA')}};
    await shareRetirementCard(ref, model);
    expect(spy).toHaveBeenCalledWith({url: 'data:image/png;base64,PNGDATA'});
  });

  test('shareRetirementCard: 대상 앱이 없어(Share reject) 예외를 삼키고 텍스트로 폴백한다', async () => {
    // 첫 호출(이미지 url 공유)은 reject — 대상 앱 부재. 폴백 텍스트 공유는 통과.
    spy.mockRejectedValueOnce(new Error('no target app'));
    const ref = {current: {toDataURL: (cb: (b: string) => void) => cb('PNGDATA')}};
    await expect(shareRetirementCard(ref, model)).resolves.toBeUndefined(); // throw 안 함
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0].message).toBe(buildRetirementShareText(model));
  });

  test('shareRetirementCard: 폴백 공유마저 실패해도(앱 전무) 크래시하지 않는다', async () => {
    spy.mockRejectedValue(new Error('nothing installed'));
    await expect(shareRetirementCard(null, model)).resolves.toBeUndefined();
  });
});
