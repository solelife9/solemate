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

/** 구간 최소 이동거리(km). 절대 하한(~1m) — 실제 하한은 정확도 비례(아래 factor)와 max. */
export const MIN_SEG_DIST_KM = 0.001;

/** 팬텀 드리프트 억제(C1): 구간 최소 이동거리를 GPS 정확도에 비례시키는 계수.
 *  노이즈 하한 = max(MIN_SEG_DIST_KM, 정확도(m) × factor). 정지 중 도심 멀티패스 표류는
 *  겉보기 속도 0.6~2 m/s 로 와 자동일시정지(0.6 임계)를 피해 거리를 슬금슬금 쌓는데,
 *  '정확도 반경 대비 유의미하지 않은 변위 = 통계적 노이즈'로 걸러낸다(가민/스트라바 동급).
 *  앵커(last-good)는 거부 시 보존되므로 저속 러닝/걷기 거리는 유실되지 않고 다음 fix 에
 *  합산돼 채택된다(무손실 — 증분만 굵어짐).
 *  2026-07-11 재튜닝 0.35→0.8: 실측 +9% 과대(NRC 비교런) 교정의 일부 — 합성 하네스
 *  스윕에서 0.8 이 정지 팬텀 억제와 저속(8'30"/km)·걷기 무손실을 양립하는 최적점.
 *  1.0 이상은 나쁜 정확도(10m+)에서 곡선 코스를 과소측정(-5~-12%)해 기각.
 *  정확도 상한 20m × 0.8 = 최대 16m 하한(6'00" 페이스 기준 fix ~6개 청킹). */
export const PHANTOM_ACC_FLOOR_FACTOR = 0.8;

/** 구간 최대 이동거리(km). 단일 fix 점프 상한(300m). */
export const MAX_SEG_DIST_KM = 0.3;

/** 자동 일시정지 진입 속도 임계값(m/s). */
export const AUTO_PAUSE_SPEED_MPS = 0.6;

/** 자동 일시정지 진입까지 정지 지속 시간(s). 나이키 수준 반응성 위해 3s(기존 6s). */
export const AUTO_PAUSE_HOLD_S = 3;

/** 자동 재개 속도 임계값(m/s). */
export const AUTO_RESUME_SPEED_MPS = 1.0;

/** 자동 재개까지 이동 지속 시간(s). 출발/재개 반응을 빠르게 1s(기존 2s). */
export const AUTO_RESUME_HOLD_S = 1;

/** 현재(롤링) 페이스 산출 윈도우(ms). 최근 이 시간 동안의 거리/시간으로 순간 페이스를 낸다.
 *  평균 페이스(전체 누적)는 30분 런에서 거의 안 움직여 실시간 코칭 신호로 무용 — 그래서
 *  나이키/스트라바처럼 '지금 페이스'를 별도로 보여준다. 30s 는 노이즈와 반응성의 절충. */
export const CURRENT_PACE_WINDOW_MS = 30000;

/** 현재 페이스를 신뢰할 최소 윈도우 이동거리(km). 이보다 짧으면(시작 직후/정지 근처) 표본이
 *  부족해 페이스가 출렁이므로 null 로 두고 화면은 '--' 를 보인다(거짓 수치 방지). */
export const CURRENT_PACE_MIN_DIST_KM = 0.02; // 20m

/** 현재 페이스 보강에 OS doppler 속도를 신뢰할 최소 속도(m/s). 이보다 느리면(정지/걷기 시작
 *  전·doppler 무효 -1) 표시 전용 보강에서 제외해 비현실적 페이스(수십 분/km)를 막는다.
 *  0.5 m/s ≈ 33분/km. 거리 누적과 무관 — 현재-페이스 표시 보강에만 쓰인다(P0-6 안전 서브셋). */
export const CURRENT_PACE_MIN_SPEED_MPS = 0.5;

/** 곡선 전용 (거리,경과시간) 시계열의 최소 적립 간격(km). ~25m 마다 한 점이면 10km 런에
 *  ~400점으로 충분히 곱고 가벼운 페이스 곡선이 된다. 경로 단순화와 무관(별도 채널). */
export const PACE_TRACK_MIN_STEP_KM = 0.025;

/** GPS 死구간(dead-zone) 판정 임계값(ms). 마지막 fix 수신 후 이 시간 동안 새 fix가
 *  들어오지 않으면 거리는 멈춘 채 시간만 누적되어 페이스가 왜곡된다(audit#9). 이때
 *  사용자에게 배너로 경고한다. watchPosition interval(1s)의 8배 — 일시적 누락이
 *  아니라 지속적 신호 두절일 때만 트리거되도록 여유를 둔다. */
export const GPS_STALL_THRESHOLD_MS = 8000;

// ─── 걸음 정지 게이트(도심 신호대기 팬텀 억제, 2026-07-11) ─────────────────
// GPS 만으로는 '서 있는데 신호가 떠다니는 것'과 '아주 느리게 걷는 것'을 구분할 수
// 없다(도심 300s 정지에서 +7~8% 잔여 — 합성 하네스 실측). OS 걸음 센서는 이 둘을
// 하드웨어로 구분한다: 걸음수가 늘지 않으면 확실히 서 있는 것. 걸음수 증가가 일정
// 시간 없으면 거리 적산만 동결한다(앵커 보존 = 재출발 시 이동분 합산, 무손실 유예).

/** 걸음 표본 신선도(ms): 마지막 표본이 이 시간 안에 왔을 때만 게이트를 판단한다.
 *  센서 미지원/권한 거부/일시 중단이면 표본이 끊겨 게이트가 저절로 꺼진다(안전 기본값
 *  = 현행 동작). 폴링 주기 5s 의 3배 — 한두 번 놓쳐도 스테일로 오판하지 않는다. */
export const STEP_SIGNAL_FRESH_MS = 15000;

/** 이 시간(ms) 이상 걸음수 증가가 없으면 '서 있음'으로 보고 거리 적산을 동결한다.
 *  달리기(≥140spm)/걷기(≥90spm)는 5s 폴링마다 반드시 증가하므로, 12s(폴링 2주기+여유)
 *  무증가는 정지 확정이다. 짧은 정지(<12s)는 기존 노이즈 플로어가 담당. */
export const STEP_STILL_GATE_MS = 12000;

/** 걸음 게이트 해제 속도(m/s): 칼만 추정 속도가 이 이상이면 걸음이 없어도 게이트를
 *  풀어 거리를 계상한다 — 걸음 없이 실제 이동하는 예외(자전거 휴대, 센서 고장·동결)
 *  에서 거리 유실을 막는 최후 안전선. 정지 팬텀의 겉보기 속도(0.6~2m/s)보다 높고
 *  실제 이동(러닝 2.5m/s+)보다 낮은 경계. */
export const STEP_GATE_MAX_SPEED_MPS = 2.5;

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
