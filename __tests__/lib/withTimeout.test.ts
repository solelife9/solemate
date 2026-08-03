/**
 * lib/withTimeout — "언젠가는 끝난다" 보장 (QA 감사 Q-2·Q-3의 공용 토대).
 *
 * 이 유틸이 필요했던 이유는 **거부되지 않고 그냥 안 끝나는 프라미스**가 실재하기 때문이다:
 * Firestore 쓰기는 오프라인 영속이 켜져 있으면 서버 ack 까지 pending 이라 try/catch 로
 * 절대 잡히지 않는다. 호출부는 "실패하면 안내한다"고 적어 뒀지만 실패가 오지 않으니
 * 안내도 오지 않았다 — 사용자에게는 아무 반응 없는 버튼이다.
 *
 * @format
 */
import {withTimeout, withTimeoutOr, TimeoutError, isTimeoutError} from '../../lib/withTimeout';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('제한 시간 안에 끝나면 그 값을 그대로 돌려준다', async () => {
  await expect(withTimeout(Promise.resolve(7), 1000, 'ok')).resolves.toBe(7);
});

test('원본이 거절하면 그 오류를 그대로 전파한다(시간 초과로 둔갑시키지 않는다)', async () => {
  const err = new Error('서버가 거절함');
  await expect(withTimeout(Promise.reject(err), 1000, 'nope')).rejects.toBe(err);
  await expect(withTimeout(Promise.reject(err), 1000, 'nope').catch(e => isTimeoutError(e))).resolves.toBe(false);
});

test('끝나지 않는 프라미스는 TimeoutError 로 거절한다 — 일반 실패와 구별된다', async () => {
  const p = withTimeout(new Promise<number>(() => {}), 1000, '클라우드 백업 삭제');
  const caught = p.catch(e => e);
  jest.advanceTimersByTime(1001);
  const e = await caught;
  expect(e).toBeInstanceOf(TimeoutError);
  expect(isTimeoutError(e)).toBe(true);
  expect(String(e.message)).toContain('클라우드 백업 삭제');
});

test('제한 시간 전에는 거절하지 않는다', async () => {
  let settled = false;
  const p = withTimeout(new Promise<number>(() => {}), 1000, 'wait');
  void p.catch(() => {
    settled = true;
  });
  jest.advanceTimersByTime(999);
  await Promise.resolve();
  expect(settled).toBe(false);
  jest.advanceTimersByTime(2);
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(true);
});

test('성공하면 타이머를 정리한다(누수 금지)', async () => {
  const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
  try {
    await withTimeout(Promise.resolve('done'), 1000, 'ok');
    expect(clearSpy).toHaveBeenCalled();
  } finally {
    clearSpy.mockRestore();
  }
});

test('withTimeoutOr — 장식용 결과는 시간 초과·실패 모두 폴백으로 떨어진다', async () => {
  await expect(withTimeoutOr(Promise.resolve('라벨'), 1000, 'label', '')).resolves.toBe('라벨');
  await expect(withTimeoutOr(Promise.reject(new Error('x')), 1000, 'label', '')).resolves.toBe('');

  const p = withTimeoutOr(new Promise<string>(() => {}), 1000, 'label', '');
  jest.advanceTimersByTime(1001);
  await expect(p).resolves.toBe('');
});
