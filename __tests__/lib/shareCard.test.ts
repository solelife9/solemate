import {Share} from 'react-native';
import {
  buildShareCardModel,
  captureCardDataUrl,
  shareRunCard,
} from '../../lib/shareCard';
import {buildRunShareText} from '../../lib/share';

describe('buildShareCardModel (필드 매핑)', () => {
  test('전체 필드 → 거리(2자리)/단위/페이스·시간 칸/신발명/날짜/브랜드 매핑', () => {
    const m = buildShareCardModel({
      distKm: 5.2,
      unit: 'km',
      pace: "5'02\"",
      time: '40:41',
      shoeBrand: 'NIKE',
      shoeModel: 'Pegasus 41',
      date: '5월 28일 수요일',
    });
    expect(m.distance).toBe('5.20');
    expect(m.unit).toBe('km');
    expect(m.shoe).toBe('NIKE Pegasus 41');
    expect(m.date).toBe('5월 28일 수요일');
    expect(m.brand).toBe('Keego');
    expect(m.hashtag).toBe('#Keego #keepgoing');
    // 페이스·시간이 순서대로 stats 칸에 들어가고 페이스 라벨은 /km 고정
    expect(m.stats).toEqual([
      {label: 'PACE', value: "5'02\" /km"},
      {label: 'TIME', value: '40:41'},
    ]);
  });

  test('거리는 표시 단위(mi)로 환산하되 페이스 라벨은 /km로 고정한다', () => {
    // 1.60934 km == 정확히 1.00 mi
    const m = buildShareCardModel({distKm: 1.60934, unit: 'mi', pace: "8'00\""});
    expect(m.distance).toBe('1.00');
    expect(m.unit).toBe('mi');
    expect(m.stats[0]).toEqual({label: 'PACE', value: "8'00\" /km"});
    // 페이스 값에 /mi 라벨이 절대 붙지 않는다(거짓 per-mile 통계 방지)
    expect(JSON.stringify(m.stats)).not.toContain('/mi');
  });

  test("페이스·시간이 '--'면 그 칸이 stats에서 빠진다", () => {
    const m = buildShareCardModel({distKm: 0.5, pace: '--', time: '--'});
    expect(m.stats).toEqual([]);
    expect(m.distance).toBe('0.50'); // 거리 칸은 유지
  });

  test('신발/날짜가 비면 빈 문자열이라 카드가 깨지지 않는다', () => {
    const m = buildShareCardModel({distKm: 10, unit: 'km', time: '55:00'});
    expect(m.shoe).toBe('');
    expect(m.date).toBe('');
    expect(m.stats).toEqual([{label: 'TIME', value: '55:00'}]); // 시간만 남음
  });

  test('브랜드만 있고 모델이 없으면 신발명은 브랜드만(앞뒤 공백 없음)', () => {
    const m = buildShareCardModel({distKm: 4, shoeBrand: 'HOKA'});
    expect(m.shoe).toBe('HOKA');
  });

  test('durationS 가 있으면 TIME 을 항상 6자리 HH:MM:SS 로 표기한다(레퍼런스 톤)', () => {
    expect(buildShareCardModel({distKm: 5, time: '45:04', durationS: 2704}).stats).toEqual([
      {label: 'TIME', value: '00:45:04'},
    ]);
    expect(buildShareCardModel({distKm: 5, time: '1:05:00', durationS: 3900}).stats[0]).toEqual({
      label: 'TIME',
      value: '01:05:00',
    });
    // durationS 없으면 표시 문자열 그대로(폴백).
    expect(buildShareCardModel({distKm: 5, time: '45:04'}).stats[0].value).toBe('45:04');
  });

  test('단위 미지정 시 km로 처리한다', () => {
    const m = buildShareCardModel({distKm: 7.345});
    expect(m.distance).toBe('7.35'); // 7.345 → 반올림 7.35
    expect(m.unit).toBe('km');
  });
});

describe('captureCardDataUrl (dataURL 생성 경로)', () => {
  test('Svg ref.toDataURL 콜백 base64를 data:image/png;base64,… 로 감싼다', async () => {
    const ref = {current: {toDataURL: (cb: (b: string) => void) => cb('ABC123')}};
    await expect(captureCardDataUrl(ref)).resolves.toBe('data:image/png;base64,ABC123');
  });

  test('ref가 비었거나 toDataURL이 없으면(=캔버스 미준비) reject 한다', async () => {
    await expect(captureCardDataUrl(null)).rejects.toThrow();
    await expect(captureCardDataUrl({current: null})).rejects.toThrow();
    await expect(captureCardDataUrl({current: {} as any})).rejects.toThrow();
  });

  test('빈 base64는 실패로 본다(빈 이미지 공유 방지)', async () => {
    const ref = {current: {toDataURL: (cb: (b: string) => void) => cb('')}};
    await expect(captureCardDataUrl(ref)).rejects.toThrow();
  });

  test('toDataURL이 동기 throw 해도 reject로 변환한다(예외 누출 없음)', async () => {
    const ref = {
      current: {
        toDataURL: () => {
          throw new Error('native canvas exploded');
        },
      },
    };
    await expect(captureCardDataUrl(ref)).rejects.toThrow('native canvas exploded');
  });
});

describe('shareRunCard (캡처→공유, 실패 시 텍스트 폴백)', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as any);
  });
  afterEach(() => spy.mockRestore());

  test('캡처 성공 시 이미지 dataURL을 url로 공유한다', async () => {
    const ref = {current: {toDataURL: (cb: (b: string) => void) => cb('PNGDATA')}};
    await shareRunCard(ref, {distKm: 5.2});
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({url: 'data:image/png;base64,PNGDATA'});
  });

  test('캡처 실패 시 buildRunShareText 텍스트로 폴백 공유한다', async () => {
    await shareRunCard(null, {distKm: 5.2, unit: 'km', shoeBrand: 'NIKE', shoeModel: 'Pegasus 41'});
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg.url).toBeUndefined();
    expect(arg.message).toBe(
      buildRunShareText({distKm: 5.2, unit: 'km', shoeBrand: 'NIKE', shoeModel: 'Pegasus 41'}),
    );
  });
});
