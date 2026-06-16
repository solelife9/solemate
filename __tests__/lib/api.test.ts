// lib/api fetchWithTimeout — 콜드/다운 백엔드에서 무한 대기(부팅 행·저장 멈춤) 방지.
//
// 검증:
//   · 정상 응답이면 그대로 반환하고, fetch 에 AbortSignal 을 함께 넘긴다.
//   · 응답이 timeoutMs 안에 안 오면 AbortController 로 끊어 reject 한다.
//
// jest.setup 의 global.fetch 목을 테스트별로 교체했다가 복원한다(격리).

import {
  fetchWithTimeout,
  API_TIMEOUT_MS,
  apiPatchShoe,
  apiDeleteShoe,
  apiPatchRun,
  apiDeleteRun,
} from '../../lib/api';

const origFetch = global.fetch;

afterEach(() => {
  global.fetch = origFetch;
  jest.useRealTimers();
});

describe('fetchWithTimeout', () => {
  test('기본 타임아웃은 8초', () => {
    expect(API_TIMEOUT_MS).toBe(8000);
  });

  test('정상 응답이면 반환하고 fetch 에 signal 을 넘긴다', async () => {
    const res = {ok: true, json: () => Promise.resolve({x: 1})};
    const spy = jest.fn(() => Promise.resolve(res));
    global.fetch = spy as any;

    const out = await fetchWithTimeout('https://e/x', {method: 'GET'});
    expect(out).toBe(res);
    // signal 이 init 에 주입되어 전달된다(중단 가능).
    const init: any = (spy.mock.calls as any[])[0][1];
    expect(init.signal).toBeDefined();
    expect(init.method).toBe('GET');
  });

  test('timeout 안에 응답이 없으면 중단(abort)되어 reject 된다', async () => {
    jest.useFakeTimers();
    // 영원히 안 끝나는 fetch — signal 이 abort 되면 그때 reject.
    global.fetch = jest.fn(
      (_url: any, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as any;

    const p = fetchWithTimeout('https://e/hang', {}, 100);
    const assertion = expect(p).rejects.toThrow();
    jest.advanceTimersByTime(100); // 타임아웃 발화 → abort
    await assertion;
  });
});

describe('PATCH/DELETE 실패는 무음이 아니라 throw (호출부 Alert/큐로 분기)', () => {
  const okResp = {ok: true, status: 200, json: () => Promise.resolve({})};
  const failResp = {ok: false, status: 500, json: () => Promise.resolve({})};

  test('ok 응답이면 정상 resolve', async () => {
    global.fetch = jest.fn(() => Promise.resolve(okResp)) as any;
    await expect(apiPatchShoe('u', 's1', {name: 'x'})).resolves.toBeUndefined();
    await expect(apiDeleteShoe('u', 's1')).resolves.toBeUndefined();
    await expect(apiPatchRun('u', 'r1', {km: 5})).resolves.toBeUndefined();
    await expect(apiDeleteRun('u', 'r1')).resolves.toBeUndefined();
  });

  test('!ok 응답이면 throw (조용히 묻히지 않음)', async () => {
    global.fetch = jest.fn(() => Promise.resolve(failResp)) as any;
    await expect(apiPatchShoe('u', 's1', {name: 'x'})).rejects.toThrow();
    await expect(apiDeleteShoe('u', 's1')).rejects.toThrow();
    await expect(apiPatchRun('u', 'r1', {km: 5})).rejects.toThrow();
    await expect(apiDeleteRun('u', 'r1')).rejects.toThrow();
  });
});
