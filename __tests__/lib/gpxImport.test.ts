/**
 * GPX 가져오기 파서 계약 (2026-07-27, 앞당김 #35).
 *
 * 다른 앱이 내보낸 파일은 우리가 만든 것과 다르게 생겼다 — 속성 순서·따옴표·네임스페이스
 * 접두사·구간 분할이 제각각이다. 실제로 마주치는 변형을 여기서 고정한다.
 * 그리고 무엇보다: **어떤 파일을 넣어도 throw 하지 않는다**(사용자가 아무 파일이나 고른다).
 *
 * @format
 */
import {parseGpx, gpxToRunInput} from '../../lib/gpxImport';

/** 한강 근처 두 점(약 0.9km 간격). */
const P1 = {lat: 37.5300, lon: 127.0000};
const P2 = {lat: 37.5380, lon: 127.0000};

const GPX_BASIC = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Morning Run</name></metadata>
  <trk><name>Morning Run</name><trkseg>
    <trkpt lat="${P1.lat}" lon="${P1.lon}"><ele>10.0</ele><time>2026-07-01T00:00:00Z</time></trkpt>
    <trkpt lat="${P2.lat}" lon="${P2.lon}"><ele>25.0</ele><time>2026-07-01T00:05:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

describe('정상 파일', () => {
  const r = parseGpx(GPX_BASIC);

  it('점을 읽는다', () => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.points).toHaveLength(2);
    expect(r.data.points[0]).toMatchObject({lat: P1.lat, lon: P1.lon, eleM: 10});
  });

  it('이름을 읽는다', () => {
    if (!r.ok) return;
    expect(r.data.name).toBe('Morning Run');
  });

  it('거리를 계산한다(약 0.89km)', () => {
    if (!r.ok) return;
    expect(r.data.distanceKm).toBeGreaterThan(0.8);
    expect(r.data.distanceKm).toBeLessThan(1.0);
  });

  it('시간을 계산한다(5분)', () => {
    if (!r.ok) return;
    expect(r.data.durationSec).toBe(300);
    expect(r.data.startMs).toBe(Date.parse('2026-07-01T00:00:00Z'));
  });

  it('상승 고도를 계산한다(15m)', () => {
    if (!r.ok) return;
    expect(r.data.elevGainM).toBe(15);
  });
});

describe('실제 파일에서 마주치는 변형', () => {
  it('속성 순서가 뒤바뀌어도 읽는다(lon 먼저)', () => {
    const xml = `<gpx><trk><trkseg><trkpt lon="127.0" lat="37.5"/></trkseg></trk></gpx>`;
    const r = parseGpx(xml);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.points[0]).toMatchObject({lat: 37.5, lon: 127.0});
  });

  it('작은따옴표 속성도 읽는다', () => {
    const r = parseGpx(`<gpx><trkpt lat='37.5' lon='127.0'/></gpx>`);
    expect(r.ok).toBe(true);
  });

  it('네임스페이스 접두사가 붙어도 읽는다', () => {
    const xml = `<gpx:gpx><gpx:trk><gpx:trkseg>
      <gpx:trkpt lat="37.5" lon="127.0"></gpx:trkpt></gpx:trkseg></gpx:trk></gpx:gpx>`;
    const r = parseGpx(xml);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.points).toHaveLength(1);
  });

  it('구간(trkseg)이 여러 개면 하나로 합친다(일시정지로 끊긴 러닝)', () => {
    const xml = `<gpx><trk>
      <trkseg><trkpt lat="37.530" lon="127.0"/></trkseg>
      <trkseg><trkpt lat="37.531" lon="127.0"/><trkpt lat="37.532" lon="127.0"/></trkseg>
    </trk></gpx>`;
    const r = parseGpx(xml);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.points).toHaveLength(3);
  });

  it('trkpt 가 없으면 rtept 로 폴백한다', () => {
    const r = parseGpx(`<gpx><rte><rtept lat="37.5" lon="127.0"/></rte></gpx>`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.points).toHaveLength(1);
  });

  it('시간·고도가 없어도 거리는 가져온다', () => {
    const xml = `<gpx><trkseg>
      <trkpt lat="${P1.lat}" lon="${P1.lon}"/><trkpt lat="${P2.lat}" lon="${P2.lon}"/>
    </trkseg></gpx>`;
    const r = parseGpx(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.distanceKm).toBeGreaterThan(0.8);
    expect(r.data.durationSec).toBe(0);
    expect(r.data.startMs).toBeNull();
    expect(r.data.elevGainM).toBe(0);
  });
});

describe('망가진 입력 — 절대 throw 하지 않는다', () => {
  it.each([
    ['빈 문자열', ''],
    ['공백만', '   \n  '],
    ['GPX 가 아닌 XML', '<html><body>hi</body></html>'],
    ['텍스트 파일', '그냥 메모입니다'],
    ['잘린 GPX', '<gpx><trk><trkseg><trkpt lat="37.5"'],
    ['좌표 범위 밖', '<gpx><trkpt lat="999" lon="999"/></gpx>'],
    ['숫자가 아닌 좌표', '<gpx><trkpt lat="abc" lon="def"/></gpx>'],
  ])('%s', (_name, xml) => {
    expect(() => parseGpx(xml)).not.toThrow();
    expect(parseGpx(xml).ok).toBe(false);
  });

  it('null·undefined 도 안전하다', () => {
    expect(parseGpx(null).ok).toBe(false);
    expect(parseGpx(undefined).ok).toBe(false);
  });

  it('손상된 좌표 점프는 거리에서 제외한다(점 자체는 남긴다)', () => {
    // 서울 → 부산으로 튀는 점 하나가 섞이면 거리가 400km 가 되면 안 된다.
    const xml = `<gpx><trkseg>
      <trkpt lat="37.5300" lon="127.0"/>
      <trkpt lat="35.1796" lon="129.0756"/>
      <trkpt lat="37.5380" lon="127.0"/>
    </trkseg></gpx>`;
    const r = parseGpx(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.points).toHaveLength(3); // 지도에 보이는 편이 정직하다
    expect(r.data.distanceKm).toBeLessThan(1); // 튄 구간은 거리에 안 넣는다
  });

  it('고도 잡음(3m 미만)은 상승으로 세지 않는다', () => {
    const xml = `<gpx><trkseg>
      <trkpt lat="37.530" lon="127.0"><ele>10</ele></trkpt>
      <trkpt lat="37.531" lon="127.0"><ele>11</ele></trkpt>
      <trkpt lat="37.532" lon="127.0"><ele>12</ele></trkpt>
    </trkseg></gpx>`;
    const r = parseGpx(xml);
    if (r.ok) expect(r.data.elevGainM).toBe(0);
  });
});

describe('gpxToRunInput — 저장 형태로 변환', () => {
  it('경로를 앱의 route 문자열 규약으로 만든다', () => {
    const r = parseGpx(GPX_BASIC);
    if (!r.ok) return;
    const input = gpxToRunInput(r.data);
    const parsed = JSON.parse(input.route);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({lat: P1.lat, lon: P1.lon}); // 시간·고도는 경로에 섞지 않는다
  });

  it('시작 시각에서 날짜(YYYY-MM-DD)를 만든다', () => {
    const r = parseGpx(GPX_BASIC);
    if (!r.ok) return;
    expect(gpxToRunInput(r.data).dateYmd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('시간 정보가 없으면 날짜는 null 이다(호출부가 사용자에게 묻는다)', () => {
    const r = parseGpx('<gpx><trkpt lat="37.5" lon="127.0"/></gpx>');
    if (!r.ok) return;
    expect(gpxToRunInput(r.data).dateYmd).toBeNull();
  });
});
