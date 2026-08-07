/**
 * GPX 내보내기(2026-07-05) 계약:
 *  1) buildGpx — 유효한 GPX 1.1 헤더·trk·trkseg + 좌표 6자리 trkpt.
 *  2) XML 특수문자(name) 이스케이프, 비유효 좌표 스킵.
 *  3) 빈/1점 경로도 유효 XML(빈 trkseg) — throw 없음.
 *  4) safeFileStem — 파일명 안전화.
 *
 * @format
 */
import {buildGpx, safeFileStem, exportGpx} from '../../lib/gpx';

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

// ============================================================================
// 안드로이드 공유 경로 (2026-08-07 감사)
//
// RN 의 Share 는 안드로이드에서 `url` 을 **그냥 버린다**(lib/shareCard.ts 에 갤럭시
// S10e 실측 기록). 그래서 GPX 내보내기는 **빈 공유 시트를 열고 {ok:true} 를 돌려주고
// 있었다** — 사용자는 파일을 내보냈다고 믿는데 아무것도 나가지 않는다.
// 공유 카드는 2026-08-06 에 expo-sharing 으로 고쳤는데 이 경로는 빠져 있었다.
//
// jest 의 기본 플랫폼이 ios 라 이런 결함은 **구조적으로 안 잡힌다.**
// 그래서 여기서는 Platform.OS 를 명시적으로 안드로이드로 바꿔 본다.
// ============================================================================
describe('GPX 내보내기 — 안드로이드', () => {
  const {Platform} = require('react-native');
  const Sharing = require('expo-sharing');
  const orig = Platform.OS;
  afterEach(() => {
    Platform.OS = orig;
    jest.clearAllMocks();
  });

  test('RN Share 가 아니라 expo-sharing 으로 파일을 붙인다', async () => {
    Platform.OS = 'android';
    const {Share} = require('react-native');
    const shareSpy = jest.spyOn(Share, 'share');
    const shareAsync = jest.spyOn(Sharing, 'shareAsync').mockResolvedValue(undefined as never);

    const res = await exportGpx('run-1', [
      {lat: 37.5, lon: 127.0},
      {lat: 37.501, lon: 127.001},
    ]);

    expect(res.ok).toBe(true);
    expect(shareAsync).toHaveBeenCalledTimes(1);
    // 파일 URI 와 GPX MIME 으로 넘긴다.
    expect(shareAsync.mock.calls[0][0]).toMatch(/\.gpx$/);
    expect(shareAsync.mock.calls[0][1]).toMatchObject({mimeType: 'application/gpx+xml'});
    // RN Share 로는 절대 가지 않는다 — 그게 빈 시트의 원인이었다.
    expect(shareSpy).not.toHaveBeenCalled();
    shareSpy.mockRestore();
  });

  test('공유가 불가능한 기기면 성공이라고 말하지 않는다', async () => {
    Platform.OS = 'android';
    jest.spyOn(Sharing, 'isAvailableAsync').mockResolvedValue(false as never);

    const res = await exportGpx('run-1', [
      {lat: 37.5, lon: 127.0},
      {lat: 37.501, lon: 127.001},
    ]);

    expect(res.ok).toBe(false);
  });
});
