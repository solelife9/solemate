/**
 * 내보내기 ↔ 가져오기 왕복 계약 (2026-07-27).
 *
 * 두 모듈은 따로 만들어졌다(내보내기 2026-07-05, 가져오기 2026-07-27). 각자 테스트를
 * 통과해도 **서로 못 읽으면** 사용자에겐 기능이 아니다 — 기기를 옮길 때 자기 파일조차
 * 들여오지 못한다. 왕복이 성립하는지 못 박는다.
 *
 * @format
 */
import {buildGpx} from '../../lib/gpx';
import {parseGpx} from '../../lib/gpxImport';
test('내보낸 GPX 를 다시 읽으면 좌표가 보존된다(왕복)', () => {
  const pts = [{lat: 37.5301, lon: 127.0001}, {lat: 37.5388, lon: 127.0009}];
  const r = parseGpx(buildGpx(pts, {name: '테스트 런'}));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.data.points.map(p => ({lat: p.lat, lon: p.lon}))).toEqual(pts);
  expect(r.data.name).toBe('테스트 런');
});
