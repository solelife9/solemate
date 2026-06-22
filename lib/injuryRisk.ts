// ============================================================================
// lib/injuryRisk.ts — 통합 부상위험 = 신발 마모 × 훈련 부하 (시그니처 #2, 프로토타입)
//
// Keego만 만들 수 있는 기능. 일반 러닝앱은 훈련 부하는 알아도 신발 상태를 모르고,
// 신발 관리앱은 그 반대다. Keego는 둘 다 가지므로 두 신호를 하나의 "부상위험 신호등"
// 으로 융합할 수 있다. 두 모듈(injury·trainingLoad)을 조합만 하는 순수함수다.
//
// 융합 규칙(v1): 종합 등급 = 두 신호 중 더 심한 쪽(max-severity). 어느 신호가
// 위험을 끌어올렸는지(drivers)를 함께 돌려줘 화면이 "왜"를 설명할 수 있게 한다.
// 카피는 두 신호가 동시에 켜질 때 가장 강하게(둘 다 정비) 말한다 — 이게 융합의 가치.
// ============================================================================
import {
  assessShoeInjuryRisk,
  InjuryAssessment,
  InjuryLevel,
} from './injury';
import {
  assessTrainingLoad,
  LoadRun,
  TrainingLoadAssessment,
} from './trainingLoad';

/** 종합 위험은 신발 등급과 동일한 3단계로 정규화한다. */
export type RiskLevel = InjuryLevel; // 'safe' | 'caution' | 'high'
export type RiskDriver = 'shoe' | 'load';

export interface CombinedInjuryRisk {
  level: RiskLevel;
  /** 위험을 끌어올린 신호들(caution 이상인 축). safe면 빈 배열. */
  drivers: RiskDriver[];
  shoe: InjuryAssessment;
  load: TrainingLoadAssessment;
  /** 신호등 표시용 한국어 헤드라인(keep-going 보이스). */
  message: string;
}

export interface CombinedRiskInput {
  runs: LoadRun[];
  todayISO: string;
  /** 오늘 신을(또는 주력) 신발의 used/max. 없으면 부하만으로 판정. */
  shoe?: { used?: number; max?: number };
}

// 등급 → 심각도 순위(융합 max 비교용). load의 'low'는 위험이 아니므로 safe와 동급(0).
const LOAD_SEV: Record<TrainingLoadAssessment['level'], number> = {
  low: 0,
  safe: 0,
  caution: 1,
  high: 2,
};
const SHOE_SEV: Record<InjuryLevel, number> = { safe: 0, caution: 1, high: 2 };
const SEV_LEVEL: RiskLevel[] = ['safe', 'caution', 'high'];

// 두 신호가 동시에 켜졌을 때의 융합 카피(Keego 차별점이 가장 빛나는 지점).
const MSG_BOTH_HIGH =
  '신발도 닳았고 최근 부하도 급해요 — 오늘은 쉬어가면 부상 없이 킵고잉';
const MSG_BOTH_CAUTION =
  '신발과 몸 둘 다 슬슬 신호가 와요 — 무리만 안 하면 부상 없이 킵고잉';
const MSG_ALL_GOOD = '몸도 신발도 좋은 상태예요 — 부상 없이 킵고잉 👟';

/**
 * 신발 마모와 훈련 부하를 융합해 종합 부상위험을 판정한다(순수). shoe가 없으면 부하만
 * 으로, runs가 비어 신발만 위험하면 신발만으로 판정한다. 항상 graceful.
 */
export function assessCombinedRisk(input: CombinedRiskInput): CombinedInjuryRisk {
  const { runs, todayISO, shoe } = input || ({} as CombinedRiskInput);

  const load = assessTrainingLoad(runs || [], todayISO);
  const shoeRisk = shoe
    ? assessShoeInjuryRisk(shoe)
    : assessShoeInjuryRisk({ used: 0, max: 0 }); // safe

  const loadSev = LOAD_SEV[load.level];
  const shoeSev = SHOE_SEV[shoeRisk.level];
  const sev = Math.max(loadSev, shoeSev);
  const level = SEV_LEVEL[sev];

  const drivers: RiskDriver[] = [];
  if (shoeSev >= 1) drivers.push('shoe');
  if (loadSev >= 1) drivers.push('load');

  // ── 융합 카피 ────────────────────────────────────────────────────────────────
  let message: string;
  if (drivers.length === 0) {
    message = MSG_ALL_GOOD;
  } else if (drivers.length === 2) {
    // 두 신호 동시 — 융합의 핵심 메시지(둘 다 정비하면 계속 달릴 수 있다).
    message = sev >= 2 ? MSG_BOTH_HIGH : MSG_BOTH_CAUTION;
  } else if (drivers[0] === 'shoe') {
    message = shoeRisk.message; // 신발 단독 → 기존 신발 카피 재사용
  } else {
    message = load.message; // 부하 단독 → 부하 카피
  }

  return { level, drivers, shoe: shoeRisk, load, message };
}
