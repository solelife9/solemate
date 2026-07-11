// watchSession.test.ts — Apple Watch JS 포트(lib/watchSession)의 계약 테스트
// ----------------------------------------------------------------------------
// 네이티브 WatchSessionModule 을 모킹해 다음 계약을 고정한다:
//   · onWatchRun: 숫자 정규화 + 무효 페이로드(runId 없음·km 0) 필터.
//   · updateShoes: {shoes, hrMax, hrRest} 형태로 네이티브에 전달, 예외는 삼킨다.
//   · onHeartRate: 양수 bpm 만 반올림 전달(기존 계약 회귀 방지).
//   · 모듈 부재(안드로이드 등): 전부 no-op — 구독은 해제 함수만 돌려준다.

type Listener = (e: any) => void;

/** 모킹된 NativeEventEmitter 가 잡아둔 리스너를 테스트에서 직접 발화한다. */
const listeners: Record<string, Listener[]> = {};

const mockModule = {
  addListener: jest.fn(),
  removeListeners: jest.fn(),
  startWatchWorkout: jest.fn(async () => true),
  stopWatchWorkout: jest.fn(),
  updateShoeContext: jest.fn(),
};

function emit(event: string, payload: any) {
  (listeners[event] || []).forEach(cb => cb(payload));
}

function loadWatchSession(withModule = true) {
  jest.resetModules();
  Object.keys(listeners).forEach(k => delete listeners[k]);
  jest.doMock('react-native', () => ({
    Platform: {OS: 'ios'},
    NativeModules: withModule ? {WatchSessionModule: mockModule} : {},
    NativeEventEmitter: class {
      addListener(event: string, cb: Listener) {
        (listeners[event] = listeners[event] || []).push(cb);
        return {
          remove: () => {
            listeners[event] = (listeners[event] || []).filter(f => f !== cb);
          },
        };
      }
    },
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../lib/watchSession').watchSession as typeof import('../lib/watchSession').watchSession;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('onWatchRun — 워치 완주 페이로드 수신', () => {
  it('유효 페이로드를 숫자 정규화해 전달한다', () => {
    const ws = loadWatchSession();
    const got: any[] = [];
    ws.onWatchRun(r => got.push(r));
    emit('onWatchRun', {
      runId: 'watch-abc',
      shoeId: 's1',
      km: '5.2', // 브리지 경유 문자열도 Number 정규화
      durationS: 1800,
      avgBpm: 152.4,
      kcal: 320,
      startMs: 1720000000000,
      endMs: 1720001800000,
    });
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({
      runId: 'watch-abc',
      shoeId: 's1',
      km: 5.2,
      durationS: 1800,
      avgBpm: 152.4,
      kcal: 320,
      startMs: 1720000000000,
      endMs: 1720001800000,
    });
  });

  it('무효 페이로드(runId 없음·km 0·음수)는 콜백을 부르지 않는다', () => {
    const ws = loadWatchSession();
    const got: any[] = [];
    ws.onWatchRun(r => got.push(r));
    emit('onWatchRun', {runId: '', km: 5});
    emit('onWatchRun', {runId: 'watch-x', km: 0});
    emit('onWatchRun', {runId: 'watch-y', km: -3});
    emit('onWatchRun', {runId: 'watch-z', km: NaN});
    expect(got).toHaveLength(0);
  });

  it('음수/결측 보조 필드는 0 으로 바닥 처리한다(음수 금지)', () => {
    const ws = loadWatchSession();
    const got: any[] = [];
    ws.onWatchRun(r => got.push(r));
    emit('onWatchRun', {runId: 'watch-a', km: 3, durationS: -10, avgBpm: undefined});
    expect(got[0].durationS).toBe(0);
    expect(got[0].avgBpm).toBe(0);
    expect(got[0].kcal).toBe(0);
    expect(got[0].shoeId).toBe('');
  });

  it('해제 함수 호출 후에는 더 이상 전달하지 않는다', () => {
    const ws = loadWatchSession();
    const got: any[] = [];
    const off = ws.onWatchRun(r => got.push(r));
    off();
    emit('onWatchRun', {runId: 'watch-b', km: 2});
    expect(got).toHaveLength(0);
  });
});

describe('updateShoes — 활성 신발/심박존 파라미터 푸시', () => {
  it('신발 목록과 hrMax/hrRest 를 네이티브에 넘긴다', () => {
    const ws = loadWatchSession();
    const shoes = [
      {id: 's1', brand: 'Nike', model: 'Pegasus 41', lifePct: 62, condition: '양호', usedKm: 190, maxKm: 500},
    ];
    ws.updateShoes(shoes, {max: 187.4, rest: 52});
    expect(mockModule.updateShoeContext).toHaveBeenCalledWith({
      shoes,
      hrMax: 187,
      hrRest: 52,
    });
  });

  it('심박 파라미터 미설정이면 0 으로 보낸다(워치가 미설정으로 해석)', () => {
    const ws = loadWatchSession();
    ws.updateShoes([]);
    expect(mockModule.updateShoeContext).toHaveBeenCalledWith({shoes: [], hrMax: 0, hrRest: 0});
  });

  it('네이티브가 던져도 앱으로 전파하지 않는다(graceful)', () => {
    const ws = loadWatchSession();
    mockModule.updateShoeContext.mockImplementationOnce(() => {
      throw new Error('bridge down');
    });
    expect(() => ws.updateShoes([])).not.toThrow();
  });
});

describe('onHeartRate — 기존 실시간 심박 계약 회귀 방지', () => {
  it('양수 bpm 만 반올림해 전달한다', () => {
    const ws = loadWatchSession();
    const got: number[] = [];
    ws.onHeartRate(b => got.push(b));
    emit('onHeartRate', {bpm: 151.6});
    emit('onHeartRate', {bpm: 0});
    emit('onHeartRate', {bpm: -5});
    emit('onHeartRate', {});
    expect(got).toEqual([152]);
  });
});

describe('모듈 부재(안드로이드/미링크) — 전부 no-op', () => {
  it('available=false, 구독은 해제 함수만, updateShoes 는 조용히 무시', () => {
    const ws = loadWatchSession(false);
    expect(ws.available).toBe(false);
    const off = ws.onWatchRun(() => {});
    expect(typeof off).toBe('function');
    off();
    expect(() =>
      ws.updateShoes([{id: 'x', brand: '', model: '', lifePct: 50, condition: '양호', usedKm: 0, maxKm: 0}]),
    ).not.toThrow();
    expect(mockModule.updateShoeContext).not.toHaveBeenCalled();
  });
});
