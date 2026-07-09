import {medalCropRect} from '../../lib/medalCrop';

describe('medalCropRect — 원 가이드 → 사진 픽셀 크롭(cover 역변환)', () => {
  test('동일 비율(1:2): 중앙 원 → 사진 중앙 정사각형', () => {
    // pw1000×ph2000, screen500×1000(같은 1:2), 원 중앙(250,500) r100 → 오버플로 0
    expect(medalCropRect(1000, 2000, 500, 1000, 250, 500, 100)).toEqual({originX: 300, originY: 800, size: 400});
  });
  test('세로 화면 + 정사각 사진: cover 가 좌우를 크롭 → 원 중심은 사진 중심', () => {
    expect(medalCropRect(1000, 1000, 500, 1000, 250, 500, 100)).toEqual({originX: 400, originY: 400, size: 200});
  });
  test('원이 화면 상단(y=250)이면 크롭도 위로 이동', () => {
    const c = medalCropRect(1000, 2000, 500, 1000, 250, 250, 100);
    expect(c.size).toBe(400);
    expect(c.originX).toBe(300);
    expect(c.originY).toBe(300); // (250-100)/0.5
  });
  test('사진 크기 0 → size 0(호출부가 원본 사용)', () => {
    expect(medalCropRect(0, 0, 500, 1000, 250, 500, 100).size).toBe(0);
  });
  test('가장자리 원은 사진 경계로 클램프(삐짐 없음)', () => {
    const c = medalCropRect(1000, 2000, 500, 1000, 480, 500, 100);
    expect(c.originX).toBeGreaterThanOrEqual(0);
    expect(c.originX + c.size).toBeLessThanOrEqual(1000);
    expect(c.originY + c.size).toBeLessThanOrEqual(2000);
  });
});
