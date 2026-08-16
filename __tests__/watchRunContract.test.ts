/**
 * 워치 → 폰 러닝 페이로드 **계약** 테스트.
 *
 * 왜 필요한가 (2026-08-17, 실기기에서 드러난 '워치 런 지도 없음'):
 *   워치는 2026-07-24 부터 `route`(플랫 [lat,lon,…])와 `routeAlt`(짝지은 고도)를
 *   실어 보내고 있었다. 그런데 폰의 수신 모듈(`WatchSessionModule.handleInbound`)이
 *   그 두 키를 JS 로 옮기는 코드를 갖지 않았다. 결과:
 *     워치 ✅ 수집·전송  →  폰 ❌ 버림  →  JS `e.route` 는 늘 undefined
 *     → `useWatchSync` 의 `p.route.length >= 2` 가 언제나 거짓
 *     → `route_<id>` 사이드카가 한 번도 안 쓰임 → **워치 런은 지도가 영영 안 떴다.**
 *
 *   양쪽 다 자기 몫은 정확히 했다. **없었던 것은 그 사이의 다리**다.
 *   그래서 단위 테스트 3,877개가 전부 초록이어도 잡히지 않았다 — 어느 파일도
 *   틀리지 않았고, 틀린 것은 **두 파일 사이의 약속**이었기 때문이다.
 *
 * 이 테스트가 막는 것:
 *   워치가 새 필드를 보내기 시작했는데 폰이 그것을 옮기지 않는 것(= 이번에 일어난 일).
 *   Swift 를 텍스트로 읽는다 — 빌드·시뮬레이터가 필요 없다.
 *
 * @format
 */
import {readFileSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');
const WATCH_LINK = join(ROOT, 'ios/SoleMateWatch Watch App/WatchLink.swift');
const PHONE_MODULE = join(ROOT, 'ios/SoleMate/WatchSessionModule.swift');

/** `//` 주석을 걷어낸다 — 주석 속 예시 키가 계약으로 오인되지 않게. */
const codeOnly = (swift: string) =>
  swift
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n');

/**
 * 워치가 완주 러닝에 실어 보내는 키 집합.
 * `"type": "run"` 으로 시작하는 딕셔너리 리터럴에서 `"키":` 만 뽑는다.
 */
function watchRunKeys(): Set<string> {
  const src = codeOnly(readFileSync(WATCH_LINK, 'utf8'));
  const start = src.indexOf('"type": "run"');
  expect(start).toBeGreaterThan(-1); // 페이로드 모양이 바뀌면 이 테스트부터 고쳐야 한다
  // 딕셔너리 리터럴의 끝(들여쓰기 2칸 `]`)까지.
  const rest = src.slice(start);
  const end = rest.search(/\n\s{4}\]/);
  const block = end > 0 ? rest.slice(0, end) : rest;
  const keys = [...block.matchAll(/^\s*"([A-Za-z][A-Za-z0-9]*)"\s*:/gm)].map(m => m[1]);
  return new Set(keys);
}

/** 폰 수신 모듈이 실제로 읽어 JS 로 넘기는 키 집합(직접 접근 + 숫자 일괄 루프). */
function phoneHandledKeys(): Set<string> {
  const src = codeOnly(readFileSync(PHONE_MODULE, 'utf8'));
  const direct = [...src.matchAll(/payload\["([A-Za-z][A-Za-z0-9]*)"\]/g)].map(m => m[1]);
  // `for key in ["km", "durationS", …]` 형태의 일괄 전달.
  const loops = [...src.matchAll(/for key in \[([^\]]*)\]/g)].flatMap(m =>
    [...m[1].matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map(x => x[1]),
  );
  return new Set([...direct, ...loops]);
}

/** 폰이 **일부러** 옮기지 않는 키. 늘리려면 이유를 여기 적는다. */
const INTENTIONALLY_DROPPED = new Set([
  'type', // 라우팅용 판별자 — JS 는 이벤트 이름으로 구분하므로 넘길 필요가 없다
]);

describe('워치 → 폰 러닝 페이로드 계약', () => {
  it('워치가 보내는 모든 키를 폰이 받아 넘긴다', () => {
    const sent = watchRunKeys();
    const handled = phoneHandledKeys();
    const dropped = [...sent].filter(k => !handled.has(k) && !INTENTIONALLY_DROPPED.has(k));

    expect(dropped).toEqual([]); // 비어 있지 않으면: 워치는 보내는데 폰이 버리는 필드다
  });

  it('경로와 고도를 실제로 옮긴다 — 이 둘이 빠져 워치 런 지도가 없었다', () => {
    const handled = phoneHandledKeys();
    expect(handled.has('route')).toBe(true);
    expect(handled.has('routeAlt')).toBe(true);
  });

  it('고도의 결측을 NSNull 로 바꿔 넘긴다 — NaN 이 0 이 되면 가짜 내리막이 생긴다', () => {
    const src = codeOnly(readFileSync(PHONE_MODULE, 'utf8'));
    // routeAlt 를 옮기는 자리에 유한성 검사와 NSNull 대체가 함께 있어야 한다.
    const idx = src.indexOf('body["routeAlt"]');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toContain('isFinite');
    expect(block).toContain('NSNull');
  });

  it('계약 추출이 실제로 동작한다 — 빈 집합을 통과로 오인하지 않는다', () => {
    // 추출이 조용히 0개를 돌려주면 위 검사가 전부 무의미해진다(가짜 초록 방지).
    expect(watchRunKeys().size).toBeGreaterThanOrEqual(10);
    expect(phoneHandledKeys().size).toBeGreaterThanOrEqual(10);
    expect(watchRunKeys().has('route')).toBe(true);
  });
});
