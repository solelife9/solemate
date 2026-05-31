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

// ─── 케이던스(spm) 검출 상수 ──────────────────────────────────────
// 가속도 합벡터(magnitude) 피크 1개 = 한 발의 착지(스텝 1회, 단발 기준).
// 케이던스는 양발의 스텝을 모두 합산한 분당 스텝수(spm)이며 러닝 표준은
// 약 160~180spm이다(= 한 발 기준 80~90 보폭/분).

/** 스텝(착지) 피크로 인정할 가속도 합벡터 임계값(m/s²). 상향 교차 시 1스텝. */
export const STEP_PEAK_THRESHOLD = 12;

/** 연속 스텝 최소 간격(ms). 한 번의 착지를 중복 카운트하지 않게 하는 디바운스.
 *  250ms는 최대 240spm까지 허용(현실적 러닝 상한 ~200spm 위). */
export const STEP_MIN_INTERVAL_MS = 250;

/** 케이던스 측정 롤링 윈도우(ms). 최근 60초의 스텝으로 spm을 산출한다. */
export const CADENCE_WINDOW_MS = 60000;

/** spm 산출 최소 경과시간(ms). 시작 직후 표본이 너무 적으면(<3s) 외삽이
 *  불안정하므로 0(미표시)으로 둔다. 이후에는 분당 비율로 정규화(audit#14). */
export const CADENCE_MIN_WINDOW_MS = 3000;
