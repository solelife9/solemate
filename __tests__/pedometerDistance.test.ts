// pedometerDistance.test.ts — CMPedometer 누적거리 JS 포트(lib/pedometerDistance) 계약.
// ----------------------------------------------------------------------------
// 네이티브 PedometerDistanceModule 을 모킹해 계약을 고정한다:
//   · onDistance: 유효(유한·비음수) 미터만 콜백에 전달, 음수/NaN 은 거른다.
//   · start/stop: 네이티브 메서드를 호출하되 예외는 삼킨다(러닝 비차단).
//   · 모듈 부재(안드로이드 등): available=false, 전부 no-op — 구독은 해제 함수만 돌려준다.

type Listener = (e: any) => void;
const listeners: Record<string, Listener[]> = {};

const mockModule = {
  startPedometerUpdates: jest.fn(),
  stopPedometerUpdates: jest.fn(),
};

function emit(event: string, payload: any) {
  (listeners[event] || []).forEach(cb => cb(payload));
}

function load(withModule = true) {
  jest.resetModules();
  Object.keys(listeners).forEach(k => delete listeners[k]);
  jest.doMock('react-native', () => ({
    Platform: {OS: 'ios'},
    NativeModules: withModule ? {PedometerDistanceModule: mockModule} : {},
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
  return require('../lib/pedometerDistance').pedometerDistance as typeof import('../lib/pedometerDistance').pedometerDistance;
}

beforeEach(() => jest.clearAllMocks());

describe('onDistance — 누적거리(m) 구독', () => {
  it('유효한 미터만 콜백에 전달한다(음수·NaN 은 거른다)', () => {
    const pd = load();
    const got: number[] = [];
    pd.onDistance(m => got.push(m));
    emit('onPedometerDistance', {meters: 123.4});
    emit('onPedometerDistance', {meters: 0}); // 0 은 유효(비음수)
    emit('onPedometerDistance', {meters: -5}); // 음수 무시
    emit('onPedometerDistance', {meters: NaN}); // NaN 무시
    emit('onPedometerDistance', {}); // 결측 무시
    expect(got).toEqual([123.4, 0]);
  });

  it('해제 함수 호출 후에는 더 이상 전달하지 않는다', () => {
    const pd = load();
    const got: number[] = [];
    const off = pd.onDistance(m => got.push(m));
    off();
    emit('onPedometerDistance', {meters: 50});
    expect(got).toHaveLength(0);
  });
});

describe('start/stop — 네이티브 스트림 on/off', () => {
  it('네이티브 메서드를 호출한다', () => {
    const pd = load();
    pd.start();
    pd.stop();
    expect(mockModule.startPedometerUpdates).toHaveBeenCalledTimes(1);
    expect(mockModule.stopPedometerUpdates).toHaveBeenCalledTimes(1);
  });

  it('네이티브가 던져도 앱으로 전파하지 않는다(graceful)', () => {
    const pd = load();
    mockModule.startPedometerUpdates.mockImplementationOnce(() => {
      throw new Error('bridge down');
    });
    expect(() => pd.start()).not.toThrow();
  });
});

describe('모듈 부재(안드로이드/미링크) — 전부 no-op', () => {
  it('available=false, 구독은 해제 함수만, start/stop 은 조용히 무시', () => {
    const pd = load(false);
    expect(pd.available).toBe(false);
    const off = pd.onDistance(() => {});
    expect(typeof off).toBe('function');
    off();
    expect(() => pd.start()).not.toThrow();
    expect(() => pd.stop()).not.toThrow();
    expect(mockModule.startPedometerUpdates).not.toHaveBeenCalled();
  });
});

export {};
