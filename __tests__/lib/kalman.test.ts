import {KalmanFilter} from '../../lib/kalman';

describe('KalmanFilter', () => {
  test('first fix passes through unchanged', () => {
    const kf = new KalmanFilter();
    const out = kf.process(37.5, 127.0, 10, 1000);
    expect(out).toEqual({lat: 37.5, lon: 127.0});
  });

  test('subsequent fix is smoothed between previous and new measurement', () => {
    const kf = new KalmanFilter();
    kf.process(37.5, 127.0, 10, 1000);
    const out = kf.process(37.6, 127.1, 10, 2000);
    // smoothed estimate lies strictly between the old and the new point
    expect(out.lat).toBeGreaterThan(37.5);
    expect(out.lat).toBeLessThan(37.6);
    expect(out.lon).toBeGreaterThan(127.0);
    expect(out.lon).toBeLessThan(127.1);
  });

  test('high measurement accuracy (low error) trusts the new point more', () => {
    const noisy = new KalmanFilter();
    noisy.process(0, 0, 50, 1000);
    const noisyOut = noisy.process(1, 0, 50, 2000); // large acc → distrust

    const precise = new KalmanFilter();
    precise.process(0, 0, 1, 1000);
    const preciseOut = precise.process(1, 0, 1, 2000); // small acc → trust

    expect(preciseOut.lat).toBeGreaterThan(noisyOut.lat);
  });

  test('reset() makes the next fix pass through again', () => {
    const kf = new KalmanFilter();
    kf.process(10, 10, 5, 1000);
    kf.process(11, 11, 5, 2000);
    kf.reset();
    const out = kf.process(20, 20, 5, 3000);
    expect(out).toEqual({lat: 20, lon: 20});
  });
});
