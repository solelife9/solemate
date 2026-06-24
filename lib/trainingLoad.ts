// ============================================================================
// lib/trainingLoad.ts — 훈련 부하 / ACWR 부상위험 (시그니처 #1, 프로토타입)
//
// Keego 미션("부상 없이 킵고잉")의 빠진 절반: 지금까지 부상위험은 신발 마모(장비)만
// 봤지만, 러닝 부상의 큰 축은 "몸에 가해진 훈련 부하의 급증"이다. 스포츠과학에서 가장
// 검증된 지표가 ACWR(Acute:Chronic Workload Ratio) — 최근 7일 부하 ÷ 최근 28일 주간
// 평균 부하. 0.8~1.3이 '스윗스팟', 1.5↑면 부상위험이 급증한다는 연구가 정설.
//
// 이 모듈은 기존 런 데이터(run_date + km)에서만 파생하는 순수함수다. 새 상태/필드를
// 만들지 않고(iron law), 기준시각(todayISO)을 주입받아 전역 Date 모킹이 필요 없다
// (goals.ts와 동일 규약). 부하 지표 v1 = 일일 주행거리(km). (향후 강도/시간 가중 여지)
//
// keep-going 보이스: 위험을 '하지 마라'가 아니라 '이렇게 하면 부상 없이 계속 달릴 수
// 있다'로 프레이밍한다(injury.ts와 동일 철학).
// ============================================================================

/** 부하 계산 입력. 백엔드 행(BackendRun)·UI 런 어디서 와도 되도록 최소 필드만. */
export interface LoadRun {
  run_date: string;            // 'YYYY-MM-DD' (시각이 붙어도 날짜부만 사용)
  km: number | string;         // 거리(백엔드가 문자열로도 보내므로 string 허용 → 내부 coerce)
  // 소요 시간(초) — 강도(페이스) 가중에 쓴다. 없으면 그 런은 가중 1.0(거리 그대로).
  // BackendRun 은 `duration`, goals.ts 계열은 `durationS` 를 쓰므로 둘 다 받아 폴백한다.
  durationS?: number | string;
  duration?: number | string;
}

export type LoadLevel = 'low' | 'safe' | 'caution' | 'high';

export interface TrainingLoadAssessment {
  /** ACWR(급성/만성). 강도(페이스) 가중 부하 기준. 만성 부하 0이면 null. */
  acwr: number | null;
  /** 최근 7일 누적 '실제 거리'(km). '다음 주 안전 거리'·증가율 계산용(가중 아님). */
  acuteKm: number;
  /** 최근 28일 주간 평균 '실제 거리'(km). */
  chronicKm: number;
  /** 최근 7일 강도가중 부하(km·강도). ACWR 분자. 페이스 없으면 acuteKm과 같다. */
  acuteLoad: number;
  /** 최근 28일 주간 평균 강도가중 부하. ACWR 분모. */
  chronicLoad: number;
  /** 이번 주 대비 지난 주 거리 증가율(0.3 = +30%). 지난 주 거리 0이면 null. */
  rampPct: number | null;
  /** 부상위험 등급(부하 기준). */
  level: LoadLevel;
  /**
   * 신뢰도. 급성 창(최근 7일) 밖(8~27일 전)에 런이 하나도 없으면 ACWR은 의미가 없으므로
   * (만성=급성/4가 되어 ACWR이 항상 4로 튄다) false. 이 경우 등급은 '갓 시작/복귀'로 본다.
   */
  confident: boolean;
  /** keep-going 한국어 안내(safe/low는 격려, caution/high는 완화 행동 제안). */
  message: string;
  /**
   * 가장 최근까지 이어진 연속 러닝일수(달력일). 마지막 런이 오늘/어제가 아니면(이미
   * 쉬었으면) 0. 휴식 권고("N일 연속 달렸어요")에 쓴다.
   */
  recentConsecutiveDays: number;
}

// ── ACWR 임계 (스윗스팟 모델) ────────────────────────────────────────────────
export const ACWR_LOW_AT = 0.8;       // < 0.8: 부하 가벼움(detraining 영역)
export const ACWR_CAUTION_AT = 1.3;   // 0.8~1.3: 스윗스팟(안전)
export const ACWR_HIGH_AT = 1.5;      // > 1.5: 부상위험 급증

// ── 주간 증가율(10% 룰 변형) 임계 ────────────────────────────────────────────
// 고전 '10% 룰'은 보수적이라 v1에서는 체감 급증 구간만 경고로 띄운다(과경고 방지).
export const RAMP_CAUTION_AT = 0.3;   // +30% 이상: 주의
export const RAMP_HIGH_AT = 0.6;      // +60% 이상: 위험

export const LOAD_MSG: Record<LoadLevel, string> = {
  low: '부하가 가벼워요 — 천천히 늘려도 부상 없이 킵고잉',
  safe: '훈련 부하가 안정적이에요 — 이대로 킵고잉',
  caution: '최근 부하가 늘고 있어요 — 무리만 안 하면 부상 없이 킵고잉',
  high: '갑자기 많이 뛰었어요 — 오늘은 쉬어가면 부상 없이 킵고잉',
};
export const LOAD_MSG_NEW = '이제 막 페이스를 쌓는 중이에요 — 천천히 늘리면 부상 없이 킵고잉';

const DAY_MS = 86400000;

// ── 강도(페이스) 가중 한계 ────────────────────────────────────────────────────
// 본인 기준(최근 4주 중앙값 페이스) 대비 빠른 런은 부하↑, 느린 회복런은 부하↓.
// 한 런이 부하를 과도하게 왜곡하지 않도록 [0.7, 1.5]로 클램프(스프린트 1개가 한 주를
// 통째로 'high'로 만들지 않게). 페이스가 없으면 1.0(거리 그대로).
export const INTENSITY_MIN = 0.7;
export const INTENSITY_MAX = 1.5;

/** 'YYYY-MM-DD[...]'의 날짜부만 떼어 로컬 자정 Date(타임존/DST 안전, goals.ts 규약). */
function localMidnight(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** iso 날짜가 기준일(todayMid)로부터 며칠 전인지(0=오늘, 6=엿새 전). 음수=미래. */
function daysAgo(iso: string, todayMid: Date): number {
  const day = localMidnight(iso).getTime();
  return Math.round((todayMid.getTime() - day) / DAY_MS);
}

function num(v: number | string | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 런의 소요 시간(초). durationS 우선, 없으면 duration 폴백(둘 다 string 허용). */
function durSec(r: LoadRun): number {
  return num(r.durationS) || num(r.duration);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** 중앙값(오름차순 정렬된 배열). 빈 배열이면 null. */
function median(sorted: number[]): number | null {
  if (!sorted.length) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * 런 목록에서 훈련 부하 / ACWR 부상위험을 판정한다(순수). 모든 엣지(빈 배열·결측·
 * 문자열 km·미래 날짜)에서 NaN/Infinity 없이 graceful 한 값을 보장한다.
 */
export function assessTrainingLoad(
  runs: LoadRun[],
  todayISO: string,
): TrainingLoadAssessment {
  const list = Array.isArray(runs) ? runs : [];
  const todayMid = localMidnight(todayISO);

  // 1차: 28일 창 안의 런을 모으고(거리·페이스), 연속일용 runDays(캡 없음)를 만든다.
  const runDays = new Set<number>(); // 런이 있는 '며칠 전' 집합(연속일 계산용)
  const entries: { ago: number; km: number; pace: number | null }[] = [];
  for (const r of list) {
    if (!r || !r.run_date) continue;
    const km = num(r.km);
    if (km <= 0) continue;
    const ago = daysAgo(r.run_date, todayMid);
    if (ago < 0) continue; // 미래 무시
    runDays.add(ago);
    if (ago > 27) continue; // 28일 밖은 부하 합산 제외(연속일엔 이미 반영)
    const dur = durSec(r);
    const pace = dur > 0 ? dur / km : null; // sec/km
    entries.push({ ago, km, pace });
  }

  // 기준 페이스 = 28일 창 유효 페이스의 중앙값(본인 '평소' 강도). 페이스 데이터가 전혀
  // 없으면 null → 모든 런 가중 1.0(= 거리 기반과 동일, graceful).
  const refPace = median(
    entries
      .map((e) => e.pace)
      .filter((p): p is number => p != null && Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b),
  );
  const intensity = (pace: number | null): number => {
    if (refPace == null || pace == null || pace <= 0) return 1;
    return clamp(refPace / pace, INTENSITY_MIN, INTENSITY_MAX); // 빠를수록(작은 pace) ↑
  };

  // 2차: 실제 거리 합(km)과 강도가중 부하(load)를 창별로 누적.
  let acuteKm = 0, sum28 = 0, lastWeekKm = 0;       // 실제 거리
  let acuteLoadSum = 0, sumLoad28 = 0;              // 강도가중 부하
  for (const e of entries) {
    const w = e.km * intensity(e.pace);
    sum28 += e.km;
    sumLoad28 += w;
    if (e.ago <= 6) {
      acuteKm += e.km;
      acuteLoadSum += w;
    }
    if (e.ago >= 7 && e.ago <= 13) lastWeekKm += e.km;
  }
  const thisWeekKm = acuteKm;

  // 최근 연속 러닝일 — 마지막 런이 오늘(0)/어제(1)일 때만 '연속 중'. 거기서 과거로 끊길
  // 때까지 센다(이미 하루라도 쉬었으면 0 → 휴식 권고 불필요).
  let recentConsecutiveDays = 0;
  const start = runDays.has(0) ? 0 : runDays.has(1) ? 1 : -1;
  if (start >= 0) {
    let k = start;
    while (runDays.has(k)) {
      recentConsecutiveDays++;
      k++;
    }
  }

  // 보유 이력 주수(가장 오래된 런 기준, 1..4). 만성을 항상 4로 나누면 가입 직후
  // (이력 2~3주)엔 만성이 과소평가돼 ACWR이 거짓으로 치솟는다 → 실제 주수로 나눈다.
  const oldestAgo = entries.reduce((m, e) => (e.ago > m ? e.ago : m), 0);
  const weeksSpan = entries.length ? Math.min(4, Math.ceil((oldestAgo + 1) / 7)) : 0;
  const div = Math.max(1, weeksSpan);

  const chronicKm = sum28 / div;        // 만성 = 보유 주수 평균 '거리'(표시/코칭)
  const acuteLoad = acuteLoadSum;       // 급성 가중 부하
  const chronicLoad = sumLoad28 / div;  // 만성 가중 부하(보유 주수 평균)

  const rampPct =
    lastWeekKm > 0 ? (thisWeekKm - lastWeekKm) / lastWeekKm : null;

  // ACWR은 만성 베이스라인이 안정될 만큼(≥3주) 이력이 있을 때만 신뢰한다. 그 전에는
  // 더 적은 이력으로 되는 '주간 거리 증가율'(지난주 대비, 10% 룰)을 주 신호로 쓴다.
  const canACWR = weeksSpan >= 3 && chronicLoad > 0;
  const acwr = canACWR ? acuteLoad / chronicLoad : null;
  const confident = canACWR;

  // ── 등급 판정 ──────────────────────────────────────────────────────────────
  let level: LoadLevel;
  let message: string;

  if (canACWR) {
    // 1차: ACWR. 2차: 주간 거리 급증(ramp)이 더 위험하면 한 단계 끌어올린다.
    if (acwr == null || acwr < ACWR_LOW_AT) level = 'low';
    else if (acwr < ACWR_CAUTION_AT) level = 'safe';
    else if (acwr < ACWR_HIGH_AT) level = 'caution';
    else level = 'high';
    if (rampPct != null) {
      if (rampPct >= RAMP_HIGH_AT) level = 'high';
      else if (rampPct >= RAMP_CAUTION_AT && level !== 'high') level = 'caution';
    }
    message = LOAD_MSG[level];
  } else if (rampPct != null) {
    // 콜드스타트(이력 2주): 지난주 대비 거리 증가율만으로 판정(10% 룰).
    if (rampPct >= RAMP_HIGH_AT) level = 'high';
    else if (rampPct >= RAMP_CAUTION_AT) level = 'caution';
    else level = 'safe';
    message = LOAD_MSG[level];
  } else {
    // 진짜 첫 주(비교할 지난주 없음) — 격려만, 과경고 금지.
    level = 'safe';
    message = LOAD_MSG_NEW;
  }

  return {
    acwr, acuteKm, chronicKm, acuteLoad, chronicLoad, rampPct, level,
    confident, message, recentConsecutiveDays,
  };
}

/**
 * 다음 주 '안전 상한' 거리(km). 고전 10% 룰: 주간 거리는 한 번에 직전 주의 110%까지만
 * 늘리는 게 부상 예방에 안전하다. 이번 주 거리 기준 110%를 정수로 반환한다(이번 주
 * 거리가 0이면 0 — '천천히 다시 시작' 안내로 분기). 코칭 카드의 구체 목표 숫자에 쓴다.
 */
export function nextWeekSafeKm(a: TrainingLoadAssessment): number {
  const base = a.acuteKm > 0 ? a.acuteKm : 0;
  return base > 0 ? Math.round(base * 1.1) : 0;
}

// ── 평어 변환(사용자는 'ACWR'을 모른다 — 화면엔 약자/원시 비율 대신 평어를 쓴다) ──────

// 부하 등급 → 한 단어 상태(칩 메인 값).
export const LOAD_WORD: Record<LoadLevel, string> = {
  low: '가벼움',
  safe: '안정적',
  caution: '늘어남',
  high: '급증',
};

/**
 * 운동량 변화를 약자/원시 숫자 없이 평어로 옮긴다(가용한 신호 우선순위로). 단일 소스.
 *   · ACWR 신뢰(≥3주) → '평소와 비슷' / '평소의 N.N배'  (평소=보유주수 평균)
 *   · 콜드스타트(2주)  → '지난주와 비슷' / '지난주보다 +N%'
 *   · 첫 주           → '기록 쌓는 중'
 */
export function loadRatioPhraseKo(a: TrainingLoadAssessment): string {
  if (a.confident && a.acwr != null) {
    if (a.acwr >= 0.9 && a.acwr <= 1.1) return '평소와 비슷';
    return `평소의 ${a.acwr.toFixed(1)}배`;
  }
  if (a.rampPct != null) {
    const pct = Math.round(a.rampPct * 100);
    if (Math.abs(pct) <= 5) return '지난주와 비슷';
    return pct > 0 ? `지난주보다 +${pct}%` : `지난주보다 ${pct}%`;
  }
  return '기록 쌓는 중';
}
