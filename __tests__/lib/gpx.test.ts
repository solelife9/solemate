/**
 * GPX 내보내기(2026-07-05) 계약:
 *  1) buildGpx — 유효한 GPX 1.1 헤더·trk·trkseg + 좌표 6자리 trkpt.
 *  2) XML 특수문자(name) 이스케이프, 비유효 좌표 스킵.
 *  3) 빈/1점 경로도 유효 XML(빈 trkseg) — throw 없음.
 *  4) safeFileStem — 파일명 안전화.
 *
 * @format
 */
import {buildGpx, safeFileStem} from '../../lib/gpx';

const P = (lat: number, lon: number) => ({lat, lon});

test('유효 GPX 1.1 구조 + 좌표 6자리 trkpt', () => {
  const gpx = buildGpx([P(37.5665, 126.9780), P(37.5670, 126.9785)], {name: '7월 5일 러닝'});
  expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(gpx).toContain('<gpx version="1.1" creator="Keego"');
  expect(gpx).toContain('http://www.topografix.com/GPX/1/1');
  expect(gpx).toContain('<trk>');
  expect(gpx).toContain('<trkseg>');
  expect(gpx).toContain('<trkpt lat="37.566500" lon="126.978000">');
  expect(gpx).toContain('<name>7월 5일 러닝</name>');
  // trkpt 개수 = 점 개수
  expect(gpx.match(/<trkpt /g)?.length).toBe(2);
});

test('name XML 이스케이프 + timeISO', () => {
  const gpx = buildGpx([P(1, 2), P(3, 4)], {name: 'A & B <run>', timeISO: '2026-07-05T09:00:00Z'});
  expect(gpx).toContain('A &amp; B &lt;run&gt;');
  expect(gpx).not.toContain('A & B <run>');
  expect(gpx).toContain('<time>2026-07-05T09:00:00Z</time>');
});

test('비유효 좌표는 스킵, 빈 경로도 유효 XML(빈 trkseg)', () => {
  const gpx = buildGpx([P(NaN, 1), P(37.5, 127), P(999, 999)], {});
  expect(gpx.match(/<trkpt /g)?.length).toBe(1); // 유효 1점만
  const empty = buildGpx([], {});
  expect(empty).toContain('<trkseg>');
  expect(empty).toContain('</trkseg>');
  expect(empty.match(/<trkpt /g)).toBeNull();
  expect(empty).toContain('</gpx>');
});

test('safeFileStem — 영숫자·하이픈만, 빈 값 폴백', () => {
  expect(safeFileStem('7월 5일 · ASICS')).toBe('7-5-ASICS');
  expect(safeFileStem('  ')).toBe('run');
  expect(safeFileStem('run/../etc')).toBe('run-etc');
});
