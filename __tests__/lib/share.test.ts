import {buildRunShareText} from '../../lib/share';

describe('buildRunShareText', () => {
  test('전체 필드가 있으면 거리/시간/페이스/신발/날짜가 모두 한국어 요약에 들어간다', () => {
    const text = buildRunShareText({
      distKm: 5.2,
      unit: 'km',
      pace: "5'02\"",
      time: '40:41',
      shoeBrand: 'NIKE',
      shoeModel: 'Pegasus 41',
      date: '5월 28일 수요일',
    });
    expect(text).toContain('🗓️ 5월 28일 수요일');
    expect(text).toContain('📍 거리 5.20 km');
    expect(text).toContain('⏱️ 시간 40:41');
    expect(text).toContain('⚡ 페이스 5\'02" /km');
    expect(text).toContain('👟 신발 NIKE Pegasus 41');
  });

  test('keep-going 응원 헤더와 Keego 해시태그 푸터가 항상 포함된다', () => {
    const text = buildRunShareText({distKm: 3});
    const lines = text.split('\n');
    expect(lines[0]).toBe('오늘도 한 걸음 더 — keep going! 🏃');
    expect(lines[lines.length - 1]).toBe('#Keego #keepgoing');
  });

  test('거리는 표시 단위(mi)로 환산하지만 페이스 라벨은 /km로 고정한다', () => {
    // 1.60934 km == 정확히 1.00 mi
    const text = buildRunShareText({distKm: 1.60934, unit: 'mi'});
    expect(text).toContain('📍 거리 1.00 mi');
    // 페이스 값은 항상 초/km 기준이므로 mi 모드라도 라벨은 /km로 고정(거짓 통계 방지)
    const withPace = buildRunShareText({distKm: 1.60934, unit: 'mi', pace: "8'00\""});
    expect(withPace).toContain('⚡ 페이스 8\'00" /km');
    expect(withPace).not.toContain('/mi'); // 페이스에 /mi 라벨이 절대 붙지 않는다
    // 거리는 mi 환산, 페이스는 /km — 한 공유 안에서 단위가 의도대로 다름
    expect(withPace).toContain('📍 거리 1.00 mi');
  });

  test("페이스·시간이 '--'(의미 없는 값)이면 해당 줄을 통째로 생략한다", () => {
    const text = buildRunShareText({distKm: 0.5, pace: '--', time: '--'});
    expect(text).not.toContain('페이스');
    expect(text).not.toContain('시간');
    // 거리 줄은 그대로 남는다
    expect(text).toContain('📍 거리 0.50 km');
  });

  test('신발/날짜가 비면 그 줄은 나오지 않지만 요약은 깨지지 않는다', () => {
    const text = buildRunShareText({distKm: 10, unit: 'km', pace: "5'30\"", time: '55:00'});
    expect(text).not.toContain('👟');
    expect(text).not.toContain('🗓️');
    expect(text).toContain('📍 거리 10.00 km');
    expect(text).toContain('⏱️ 시간 55:00');
  });

  test('브랜드만 있고 모델이 없으면 브랜드만 신발 줄에 들어간다(빈 공백 없음)', () => {
    const text = buildRunShareText({distKm: 4, shoeBrand: 'HOKA'});
    expect(text).toContain('👟 신발 HOKA');
    expect(text).not.toContain('👟 신발 HOKA ');
  });

  test('단위 미지정 시 km로 처리한다', () => {
    const text = buildRunShareText({distKm: 7.345});
    expect(text).toContain('📍 거리 7.35 km'); // 7.345 → 반올림 7.35
  });
});
