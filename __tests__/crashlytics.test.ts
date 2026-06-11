/**
 * lib/crashlytics — Crashlytics 격리 래퍼.
 *
 * jest.setup.js 의 인메모리 목으로 래퍼가 (1) 비치명 에러를 native recordError 로
 * 넘기고, (2) context 를 로그로 함께 남기며, (3) 사용자 식별자를 연결하고, (4) 전역
 * 에러 핸들러를 멱등하게 설치해 기존 핸들러를 체이닝하는지 단언한다. 모든 함수는
 * graceful — 네이티브가 throw 해도 래퍼는 throw 하지 않아야 한다.
 *
 * @format
 */
import {
  getCrashlytics,
  recordError as fbRecordError,
  log as fbLog,
  setUserId as fbSetUserId,
} from '@react-native-firebase/crashlytics';
import {
  recordError,
  logBreadcrumb,
  setCrashUser,
  installCrashHandler,
} from '../lib/crashlytics';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('lib/crashlytics 래퍼', () => {
  test('recordError 는 native recordError 로 Error 를 넘기고 context 는 로그로 남긴다', () => {
    recordError(new Error('boom'), '결제 단계');
    expect(fbLog).toHaveBeenCalledWith(expect.anything(), '결제 단계');
    expect(fbRecordError).toHaveBeenCalledTimes(1);
    const passed = (fbRecordError as jest.Mock).mock.calls[0][1];
    expect(passed).toBeInstanceOf(Error);
    expect(passed.message).toBe('boom');
  });

  test('recordError 는 비-Error 값도 Error 로 감싸 기록한다', () => {
    recordError('문자열 오류');
    const passed = (fbRecordError as jest.Mock).mock.calls[0][1];
    expect(passed).toBeInstanceOf(Error);
    expect(passed.message).toBe('문자열 오류');
  });

  test('logBreadcrumb / setCrashUser 는 native log / setUserId 를 호출한다', () => {
    logBreadcrumb('탭 전환: 기록');
    expect(fbLog).toHaveBeenCalledWith(expect.anything(), '탭 전환: 기록');

    setCrashUser('user-42');
    expect(fbSetUserId).toHaveBeenCalledWith(expect.anything(), 'user-42');
  });

  test('빈 userId 는 setUserId 를 호출하지 않는다(무의미한 연결 방지)', () => {
    setCrashUser('');
    expect(fbSetUserId).not.toHaveBeenCalled();
  });

  test('native 가 throw 해도 래퍼는 throw 하지 않는다(graceful)', () => {
    (getCrashlytics as jest.Mock).mockImplementationOnce(() => {
      throw new Error('native down');
    });
    expect(() => recordError(new Error('x'))).not.toThrow();
  });

  test('installCrashHandler 는 전역 핸들러를 설치하고 기존 핸들러를 체이닝한다(멱등)', () => {
    const prev = jest.fn();
    let installed: any = prev;
    const EU = {
      getGlobalHandler: () => installed,
      setGlobalHandler: (fn: any) => {
        installed = fn;
      },
    };
    (globalThis as any).ErrorUtils = EU;
    delete (globalThis as any).__keegoCrashHandlerInstalled;

    installCrashHandler();
    expect(installed).not.toBe(prev); // 새 핸들러로 교체됨

    // 두 번째 호출은 멱등(중복 설치 안 함) — 현재 핸들러가 그대로 유지된다.
    const afterFirst = installed;
    installCrashHandler();
    expect(installed).toBe(afterFirst);

    // 설치된 핸들러가 에러를 기록하고 기존 핸들러로 체이닝하는지.
    const err = new Error('uncaught');
    installed(err, true);
    expect(fbRecordError).toHaveBeenCalled();
    expect(prev).toHaveBeenCalledWith(err, true);

    delete (globalThis as any).ErrorUtils;
    delete (globalThis as any).__keegoCrashHandlerInstalled;
  });
});
