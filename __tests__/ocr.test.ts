/**
 * 기록증 OCR 파서 — 인식된 텍스트에서 공식 기록·페이스·거리·BIB 를 라벨 앵커로 추출.
 */
import {parseClock, distanceToStandard, parseCertText, extractCertFields} from '../lib/ocr';

describe('parseClock', () => {
  test('HH:MM:SS / MM:SS → 초', () => {
    expect(parseClock('01:20:32')).toBe(4832);
    expect(parseClock('08:03')).toBe(483);
    expect(parseClock('47:10')).toBe(2830);
  });
  test('비정상은 null', () => {
    expect(parseClock('99:99')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('1:2:3:4')).toBeNull();
  });
});

describe('distanceToStandard', () => {
  test('표준 거리 ±5% 매핑', () => {
    expect(distanceToStandard(10)).toBe('10k');
    expect(distanceToStandard(21.1)).toBe('half');
    expect(distanceToStandard(42.195)).toBe('full');
    expect(distanceToStandard(5)).toBe('5k');
  });
  test('애매하면 undefined', () => {
    expect(distanceToStandard(15)).toBeUndefined();
  });
});

describe('parseCertText — 강화해변마라톤 SMART CHIP 형식', () => {
  // 사용자가 올린 실제 기록증 화면 텍스트(인식 결과 근사).
  const CERT = [
    '제25회 강화해변마라톤대회',
    'SMART CHIP  No1 Timing System',
    '10km  BIB 5224',
    '01:20:32',
    'Speed 7.5 km/h',
    'Pace 08:03 min/km',
    'POINT   TIME       PASS TIME   PACE',
    '5.0km   00:37:50   10:15:17    07:34',
    '10.0km  01:20:32   10:57:59    08:32',
  ].join('\n');

  test('완주 시간 = 가장 큰 시각(01:20:32)', () => {
    expect(parseCertText(CERT).officialTimeSec).toBe(4832);
  });
  test('페이스 = Pace 라벨 인접(08:03)', () => {
    expect(parseCertText(CERT).paceSec).toBe(483);
  });
  test('거리 = 최대 km(10) → 10k', () => {
    const f = parseCertText(CERT);
    expect(f.distanceKm).toBe(10);
    expect(f.distance).toBe('10k');
  });
  test('BIB = 5224', () => {
    expect(parseCertText(CERT).bib).toBe('5224');
  });
});

describe('parseCertText — MBN 서울마라톤 10km(사용자 제공 실제 기록증)', () => {
  // 함정: PASS TIME 08:57:05(시계-of-day, 6h 초과) > 완주 00:55:42, Speed 10.91 km/h.
  const CERT = [
    '2025 MBN 서울마라톤',
    'SMART CHIP  No1 Timing System',
    '10km  BIB 1234',
    'Speed 10.91 km/h',
    'Pace 05:34 min/km',
    'POINT   TIME       PASS TIME   PACE',
    '5.0km   00:27:55   08:29:18    05:34',
    '10.0km  00:55:42   08:57:05    05:33',
  ].join('\n');

  test('완주 = 00:55:42(범위 내 최대) — PASS TIME/스플릿/속도 함정 배제', () => {
    expect(parseCertText(CERT).officialTimeSec).toBe(55 * 60 + 42);
  });
  test('페이스 05:34 · 거리 10k · 속도(km/h) 무시', () => {
    const f = parseCertText(CERT);
    expect(f.paceSec).toBe(5 * 60 + 34);
    expect(f.distance).toBe('10k');
    expect(f.distanceKm).toBe(10);
  });
});

describe('parseCertText — 한글 라벨/풀코스', () => {
  test('기록/페이스/배번 한글 라벨', () => {
    const t = '2026 JTBC 서울마라톤\n종목 풀코스 42.195km\n기록 3:52:10\n페이스 5:30\n배번호 1234';
    const f = parseCertText(t);
    expect(f.officialTimeSec).toBe(3 * 3600 + 52 * 60 + 10);
    expect(f.paceSec).toBe(5 * 60 + 30);
    expect(f.distance).toBe('full');
    expect(f.bib).toBe('1234');
  });
});

describe('extractCertFields — 인식기 주입', () => {
  test('주입된 인식기 텍스트를 파싱', async () => {
    const recognizer = {recognize: async () => 'TIME 47:10\nPace 04:43 min/km\n10km BIB 512'};
    const f = await extractCertFields(recognizer, 'file:///cert.jpg');
    expect(f.officialTimeSec).toBe(2830);
    expect(f.distance).toBe('10k');
    expect(f.bib).toBe('512');
  });
});
