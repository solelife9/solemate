import {
  MAX_FIX_ACCURACY_M,
  WARMUP_FIXES,
  MAX_SEG_SPEED_MPS,
  MIN_SEG_DIST_KM,
  MAX_SEG_DIST_KM,
  AUTO_PAUSE_SPEED_MPS,
  AUTO_PAUSE_HOLD_S,
  AUTO_RESUME_SPEED_MPS,
  AUTO_RESUME_HOLD_S,
} from '../../lib/engineConstants';

describe('engineConstants — Interface Contract values', () => {
  test('GPS fix / segment gate constants match the contract', () => {
    expect(MAX_FIX_ACCURACY_M).toBe(20);
    expect(WARMUP_FIXES).toBe(3);
    expect(MAX_SEG_SPEED_MPS).toBe(12);
    expect(MIN_SEG_DIST_KM).toBe(0.001);
    expect(MAX_SEG_DIST_KM).toBe(0.3);
  });

  test('auto-pause / auto-resume constants match the contract', () => {
    expect(AUTO_PAUSE_SPEED_MPS).toBe(0.6);
    expect(AUTO_PAUSE_HOLD_S).toBe(6);
    expect(AUTO_RESUME_SPEED_MPS).toBe(1.0);
    expect(AUTO_RESUME_HOLD_S).toBe(2);
  });
});
