/**
 * 영수증·박스 라벨 OCR 파싱 계약 (2026-07-27, 앞당김 #17).
 *
 * 신발 등록은 온보딩 최대 마찰점이고 리텐션의 분기점이다. 다만 **틀린 값을 채우는 것은
 * 비워두는 것보다 나쁘다** — 잘못된 모델로 등록되면 권장수명이 달라져 수명·교체 예측이
 * 조용히 전부 틀린다. 그래서 이 파서는 확신이 없으면 비운다.
 *
 * @format
 */
import {
  parseReceiptText,
  parseReceiptDate,
  parseReceiptPrice,
  findShoeInText,
  extractShoeFromImage,
  EMPTY_RECEIPT,
} from '../../lib/shoeReceipt';

describe('구매일 찾기', () => {
  it.each([
    ['하이픈', '거래일시 2026-07-27 14:30', '2026-07-27'],
    ['점', '2026.07.27 결제완료', '2026-07-27'],
    ['슬래시', '판매일 2026/07/27', '2026-07-27'],
    ['한글', '2026년 7월 27일 구매', '2026-07-27'],
    ['한 자리 월일', '2026-7-5', '2026-07-05'],
  ])('%s 표기를 읽는다', (_n, text, expected) => {
    expect(parseReceiptDate(text)).toBe(expected);
  });

  it('날짜가 여럿이면 가장 이른 것을 고른다(발행일 vs 교환기한)', () => {
    // 영수증엔 구매일 외에 유효기간·교환기한 같은 미래 날짜가 함께 찍힌다.
    expect(parseReceiptDate('구매 2026-07-27\n교환기한 2026-08-26')).toBe('2026-07-27');
  });

  it('말이 안 되는 날짜는 버린다', () => {
    expect(parseReceiptDate('2026-13-45')).toBe('');
    expect(parseReceiptDate('1999-01-01')).toBe('');
  });

  it('날짜가 없으면 빈 문자열', () => {
    expect(parseReceiptDate('영수증')).toBe('');
  });
});

describe('금액 찾기', () => {
  it("'합계' 라벨이 있는 줄을 우선한다", () => {
    const t = ['상품 189,000', '부가세 17,181', '합계 206,181'].join('\n');
    expect(parseReceiptPrice(t)).toBe(206181);
  });

  it('라벨이 없으면 가장 큰 금액을 고른다', () => {
    expect(parseReceiptPrice('159,000원\n10,000원')).toBe(159000);
  });

  it('러닝화 가격대를 벗어난 값은 잡음으로 버린다', () => {
    expect(parseReceiptPrice('거스름돈 500원')).toBeNull();
    expect(parseReceiptPrice('사업자번호 1234567890')).toBeNull();
  });

  it('금액이 없으면 null', () => {
    expect(parseReceiptPrice('나이키 매장')).toBeNull();
  });
});

describe('카탈로그 매칭 — 틀리느니 비운다', () => {
  it('모델명이 통째로 있으면 찾는다', () => {
    const m = findShoeInText('NIKE PEGASUS 41  189,000');
    expect(m).toBeTruthy();
    expect(m?.model.toLowerCase()).toContain('pegasus 41');
  });

  it('띄어쓰기·대소문자가 달라도 찾는다', () => {
    expect(findShoeInText('nikepegasus41')).toBeTruthy();
  });

  it('더 구체적인 모델을 고른다(부분 일치로 엉뚱한 수명 배정 방지)', () => {
    const m = findShoeInText('Pegasus 41');
    // 'Pegasus' 로 시작하는 다른 모델이 아니라 정확히 41 을 골라야 한다.
    expect(m?.model).toContain('41');
  });

  it('카탈로그에 없는 신발은 비운다(추측하지 않는다)', () => {
    expect(findShoeInText('무명 러닝화 XYZ-999')).toBeNull();
  });

  it('빈 텍스트는 비운다', () => {
    expect(findShoeInText('')).toBeNull();
  });
});

describe('parseReceiptText — 통합', () => {
  const RECEIPT = [
    '무신사 스토어',
    '2026-07-27 14:32',
    'NIKE Pegasus 41 270mm',
    '판매금액 159,000',
    '합계 159,000원',
  ].join('\n');

  it('브랜드·모델·날짜·금액을 함께 뽑는다', () => {
    const r = parseReceiptText(RECEIPT);
    expect(r.brand).toBeTruthy();
    expect(r.model).toContain('41');
    expect(r.purchaseDate).toBe('2026-07-27');
    expect(r.priceKrw).toBe(159000);
    expect(r.matched?.recommendedKm).toBeGreaterThan(0); // 수명 기본값을 쓸 수 있다
  });

  it('신발을 못 찾아도 날짜·금액은 살린다(부분 성공)', () => {
    const r = parseReceiptText('어느 매장\n2026-07-27\n합계 159,000원');
    expect(r.model).toBe('');
    expect(r.purchaseDate).toBe('2026-07-27');
    expect(r.priceKrw).toBe(159000);
  });

  it('빈 입력은 빈 결과', () => {
    expect(parseReceiptText('')).toEqual(EMPTY_RECEIPT);
    expect(parseReceiptText('   ')).toEqual(EMPTY_RECEIPT);
  });
});

describe('extractShoeFromImage — 실패해도 손으로 등록하는 길은 열려 있다', () => {
  it('인식 성공 시 파싱 결과를 돌려준다', async () => {
    const rec = {recognize: jest.fn(async () => 'NIKE Pegasus 41\n2026-07-27\n합계 159,000원')};
    const r = await extractShoeFromImage(rec, 'file:///x.jpg');
    expect(r.model).toContain('41');
    expect(rec.recognize).toHaveBeenCalledWith('file:///x.jpg');
  });

  it('인식이 실패해도 던지지 않고 빈 결과를 준다', async () => {
    const rec = {recognize: jest.fn(async () => { throw new Error('ml kit down'); })};
    await expect(extractShoeFromImage(rec, 'file:///x.jpg')).resolves.toEqual(EMPTY_RECEIPT);
  });
});
