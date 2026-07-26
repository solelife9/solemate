/**
 * 부팅 캐시 레코드 형태 계약(F-08 및 2026-07-27 후속).
 *
 * 왜 중요한가: 캐시에서 경로를 빼는 최적화는 '되채우기'와 한 쌍일 때만 안전하다.
 * 사이드키가 없는데 캐시에서도 빼면 경로의 로컬 사본이 0개가 되고, 재부팅 후 빈 route 가
 * 클라우드로 push 되어 **원격의 경로까지 지운다**. 그 분기를 순수 함수로 고정한다.
 *
 * @format
 */
import {cacheableRun, cacheEntryForSave} from '../../lib/runCache';

const RUN = {
  id: 'r1',
  shoe_id: 's1',
  km: 5,
  run_date: '2026-07-27',
  duration: 1800,
  route: '[{"lat":37.5,"lon":127.0}]',
};

describe('cacheableRun — 경로만 뺀 사본', () => {
  it('route 를 제거한다', () => {
    const out = cacheableRun(RUN) as any;
    expect(out.route).toBeUndefined();
  });

  it('나머지 필드는 전부 보존한다', () => {
    const out = cacheableRun(RUN) as any;
    expect(out).toMatchObject({id: 'r1', shoe_id: 's1', km: 5, duration: 1800});
  });

  it('원본을 변형하지 않는다(불변)', () => {
    const copy = {...RUN};
    cacheableRun(RUN);
    expect(RUN).toEqual(copy);
  });

  it('route 가 없으면 같은 참조를 그대로 돌려준다(불필요한 복제 없음)', () => {
    const noRoute = {id: 'r2', km: 3};
    expect(cacheableRun(noRoute)).toBe(noRoute);
  });

  it('빈 문자열 route 는 제거 대상이 아니다(이미 없음)', () => {
    const empty = {id: 'r3', route: ''};
    expect(cacheableRun(empty)).toBe(empty);
  });

  it('null·비객체는 그대로', () => {
    expect(cacheableRun(null)).toBeNull();
    expect(cacheableRun('x' as any)).toBe('x');
  });
});

describe('cacheEntryForSave — 사이드키 실패 시에만 경로를 남긴다', () => {
  it('사이드키가 정상이면 경로를 뺀다(캐시 경량 유지)', () => {
    const out = cacheEntryForSave(RUN, true) as any;
    expect(out.route).toBeUndefined();
  });

  it('사이드키가 실패하면 경로를 캐시에 남긴다 — 로컬 유일 사본', () => {
    const out = cacheEntryForSave(RUN, false) as any;
    expect(out.route).toBe(RUN.route);
  });

  it('경로가 없는 런은 사이드키 실패와 무관하게 경량이다', () => {
    const noRoute = {id: 'r2', km: 3};
    expect(cacheEntryForSave(noRoute, false)).toBe(noRoute);
    expect(cacheEntryForSave(noRoute, true)).toBe(noRoute);
  });

  it('폴백 레코드도 원본을 변형하지 않는다', () => {
    const copy = {...RUN};
    cacheEntryForSave(RUN, false);
    expect(RUN).toEqual(copy);
  });
});
