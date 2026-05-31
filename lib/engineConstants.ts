// ─── Running-engine tuning constants ─────────────────────────────
// Pure constants extracted from App.tsx. Consumed by the GPS fix-filter,
// auto-pause, and segment-distance gates. No runtime/data behavior change —
// these are the same thresholds previously inlined in App.tsx.

/** GPS fix 정확도 상한(m). 이보다 부정확한 fix는 거리에 반영하지 않는다. */
export const MAX_FIX_ACCURACY_M = 20;

/** 시작 직후 워밍업으로 제외하는 fix 개수. */
export const WARMUP_FIXES = 3;

/** 구간 순간속도 상한(m/s). 초과 시 GPS 점프로 보고 거부. */
export const MAX_SEG_SPEED_MPS = 12;

/** 구간 최소 이동거리(km). 노이즈 하한(~1m). */
export const MIN_SEG_DIST_KM = 0.001;

/** 구간 최대 이동거리(km). 단일 fix 점프 상한(300m). */
export const MAX_SEG_DIST_KM = 0.3;

/** 자동 일시정지 진입 속도 임계값(m/s). */
export const AUTO_PAUSE_SPEED_MPS = 0.6;

/** 자동 일시정지 진입까지 정지 지속 시간(s). */
export const AUTO_PAUSE_HOLD_S = 6;

/** 자동 재개 속도 임계값(m/s). */
export const AUTO_RESUME_SPEED_MPS = 1.0;

/** 자동 재개까지 이동 지속 시간(s). */
export const AUTO_RESUME_HOLD_S = 2;
