// GPX 가져오기 — **파서만 있고 들어오는 길이 없었다.**
//
// 왜 있나 (2026-08-10)
// ----------------------------------------------------------------------------
// `lib/gpxImport.ts`(176줄, 파서)는 2026-07-27 에 완성돼 있었다. 파일 자체가 왜 안
// 붙었는지도 적어 뒀다 — "파일 선택(문서 피커)은 새 네이티브 의존성이라 사전 승인이
// 필요해 아직 붙이지 않았다". 정직한 기록이었지만, 결과적으로 **도달 불가능한 기능**이
// 세 달 가까이 저장소에 있었다.
//
// 왜 중요한가: 내보내기(`lib/gpx`)는 이미 있었다. 나가는 길만 있고 들어오는 길이 없으면
// "내 데이터는 내 것"이 반쪽이다. 그리고 기존 앱을 쓰던 러너에게 keego 의 첫 화면은
// 텅 빈 화면이다 — 몇 년치 기록을 두고 와야 한다는 뜻이라 그 자리에서 이탈한다.
//
// 민우님 승인(2026-08-10)으로 `expo-document-picker` 를 들이고 배선했다. 이 파일은
// **배선**을 고정한다(파싱 로직은 __tests__/lib/gpxImport.test.ts 가 본다).
import {readFileSync} from 'fs';
import {join} from 'path';
import {parseGpx, gpxToRunInput} from '../lib/gpxImport';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('배선', () => {
  it('파사드가 고르기·파싱을 이어 붙인다', () => {
    // App.tsx 가 아니라 lib 에 있다 — 크기 래칫(__tests__/appSize.ratchet.test.ts)이
    // "상한을 올리지 말고 밖으로 빼라"고 못 박고 있어서 그대로 따랐다.
    const src = read('lib/gpxFile.ts');
    expect(src).toMatch(/from '\.\/gpxImport'/);
    expect(src).toMatch(/pickGpxFile\(/);
    expect(src).toMatch(/parseGpx\(/);
    expect(src).toMatch(/gpxToRunInput\(/);
  });

  it('기록 화면까지 진입점이 이어진다 — 여기가 끊기면 다시 도달 불가가 된다', () => {
    const hist = read('HistoryScreen.rn.tsx');
    // 내보내기(exportGpx)와 대칭으로 이 화면이 직접 부른다. App.tsx 는 이 기능을 모른다
    // (크기 래칫 §'새 기능은 App.tsx 가 아니라 lib 에' — 순증 0 으로 넣었다).
    expect(hist).toMatch(/from '\.\/lib\/gpxFile'/);
    expect(hist).toMatch(/onPickGpx = pickAndParseGpx/);
    expect(hist).toMatch(/GPX 파일에서 채우기/);
  });

  it('가져온 값이 저장 경로까지 간다 — 경로·고도·시작시각', () => {
    // 여기가 끊기면 지도 없는 러닝이 저장되고, 사용자는 이유를 알 수 없다.
    expect(read('App.tsx')).toMatch(/addManualRun\([^)]*ImportedRunExtras/);
    expect(read('App.tsx')).toMatch(/x\?\.route\?'gpx':'manual'/);
  });

  it('의존성이 실제로 들어와 있다', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies['expo-document-picker']).toBeTruthy();
  });
});

// ── 저장 계약: 파일에서 온 값이 레코드까지 온전히 간다 ────────────────────────
describe('가져온 러닝이 온전히 저장된다', () => {
  // 실제 내보내기와 같은 간격으로 둔다(점 사이 ~55m). 점이 1km 이상 벌어지면 파서가
  // 손상으로 보고 버린다(MAX_JUMP_KM) — 그건 옳은 방어이고, 테스트 데이터가 그걸
  // 건드리면 배선이 아니라 방어를 시험하게 된다.
  const GPX = `<?xml version="1.0"?>
<gpx version="1.1"><trk><name>아침 러닝</name><trkseg>
<trkpt lat="37.5000" lon="127.0000"><ele>30</ele><time>2026-03-01T07:00:00Z</time></trkpt>
<trkpt lat="37.5005" lon="127.0000"><ele>45</ele><time>2026-03-01T07:05:00Z</time></trkpt>
<trkpt lat="37.5010" lon="127.0000"><ele>60</ele><time>2026-03-01T07:10:00Z</time></trkpt>
</trkseg></trk></gpx>`;

  it('거리·시간·날짜·경로가 다 살아난다', () => {
    const r = parseGpx(GPX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const input = gpxToRunInput(r.data);
    expect(input.km).toBeGreaterThan(0.09); // ~110m
    expect(input.durationSec).toBe(600);
    expect(input.dateYmd).toBe('2026-03-01');
    expect(JSON.parse(input.route)).toHaveLength(3);
  });

  it('경로는 저장 형태({lat,lon})다 — 지도가 그대로 먹는다', () => {
    const r = parseGpx(GPX);
    if (!r.ok) throw new Error('파싱 실패');
    const pts = JSON.parse(gpxToRunInput(r.data).route);
    expect(Object.keys(pts[0]).sort()).toEqual(['lat', 'lon']);
  });

  it('고도가 없는 파일은 고도를 만들지 않는다 — 0 은 "평지"라는 주장이다', () => {
    const noEle = GPX.replace(/<ele>[^<]*<\/ele>/g, '');
    const r = parseGpx(noEle);
    if (!r.ok) throw new Error('파싱 실패');
    expect(r.data.elevGainM).toBe(0);
    // App 은 elevGainM 이 0 이면 undefined 로 넘긴다 — 그래야 레코드에서 필드가 빠진다.
    expect(read('lib/gpxFile.ts')).toMatch(/elevGainM\s*>\s*0\s*\?\s*input\.elevationM\s*:\s*undefined/);
  });
});

describe('망가진 입력에 무너지지 않는다', () => {
  it.each([
    ['빈 문자열', ''],
    ['GPX 아님', '<html><body>hi</body></html>'],
    ['점 없음', '<gpx><trk><trkseg></trkseg></trk></gpx>'],
  ])('%s → ok:false (던지지 않는다)', (_label, xml) => {
    expect(() => parseGpx(xml)).not.toThrow();
    expect(parseGpx(xml).ok).toBe(false);
  });
});

// ── 파사드 규약: 실패가 화면을 깨뜨리지 않는다 ───────────────────────────────
describe('파일 파사드는 던지지 않는다', () => {
  it('취소와 읽기 실패를 값으로 구분한다', () => {
    const src = read('lib/gpxFile.ts');
    expect(src).toMatch(/reason: 'cancelled'/);
    expect(src).toMatch(/reason: 'unreadable'/);
    // throw 가 있으면 러닝 기록 화면이 통째로 죽을 수 있다.
    expect(src).not.toMatch(/^\s*throw /m);
  });

  it('용량 상한이 있다 — 거대 파일이 힙을 먹지 않게', () => {
    expect(read('lib/gpxFile.ts')).toMatch(/MAX_GPX_BYTES/);
  });
});
