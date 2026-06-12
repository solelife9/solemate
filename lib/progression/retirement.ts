// ============================================================================
// lib/progression/retirement.ts — 은퇴 요약 + 하이라이트 (Slice B, signature)
// ============================================================================
// 신발 한 켤레의 "일대기"를 그 신발의 **실제 런만으로** 집계한다(날조 금지). 누적 거리·
// 런 수·총 시간·평균/최고 페이스·최장 런·첫/마지막 런 일자·사용 기간을 파생하고, 실제로
// 달성한 하이라이트(레이스 거리·누적 마일스톤·그 신발로 세운 올타임 PB)만 표면화한다.
//
// 재사용(중복 정의 금지):
//   · lib/records.personalRecords — 최장 런/최고 페이스/최장 시간(이 신발 런 부분집합).
//   · lib/wearModel.targetKmFor   — 권장 수명(max_km 우선, 없으면 모델명 파싱) → 등급.
//   · ./retirementGrade.gradeRetirement — Smart Retirement Grade.
//
// Most Memorable Moment = 하이라이트 우선순위 1위(highlights[0]) — 결정적 단일 선택.
//
// 영속(ADDITIVE): RetiredShoeRecord 를 progression_v1.retiredShoes 에만 덧붙인다
//   (addRetiredShoeRecord 순수 헬퍼 + ./retirementStore.persistRetiredShoe IO).
//   run/shoe/기타 키는 절대 건드리지 않는다(iron law). shoeId 기준 멱등.
//
// PURE(iron law): 입력 불변, NaN/음수/누락 → 안전값(0/null), 어떤 입력에서도 throw 금지.
// ============================================================================
import {Run} from '../../theme';
import {personalRecords} from '../records';
import {targetKmFor, type WearShoe} from '../wearModel';
import {gradeRetirement} from './retirementGrade';
import {defaultProgressionState} from './storage';
import {
  ProgressionContext,
  ProgressionState,
  RetiredShoeRecord,
  RetirementSummary,
} from './types';

// ── 거리/페이스 임계(achievements.ts 와 동일 규약) ─────────────────────────────
const HALF_MARATHON_KM = 21.0975;
const MARATHON_KM = 42.195;
const TEN_K_KM = 10;
/** 한 켤레와 함께 달린 거리 마일스톤(Trusted Partner). */
const TRUSTED_PARTNER_KM = 500;
/** 한 켤레 1000km(보기 드문 장수 신발 — Long Haul). */
const LONG_HAUL_KM = 1000;
/** PB 동률 판정 허용 오차(부동소수). */
const PB_EPS = 1e-6;
const DAY_MS = 86400000;

// ── 하이라이트 키(단일 출처 — 날조 금지) ───────────────────────────────────────
/**
 * 은퇴 하이라이트 키. 그 신발의 **실제 런**에서만 도출된다(자격 런 없으면 절대 없음).
 * 우선순위(강→약)는 HIGHLIGHT_PRIORITY 가 권위.
 */
export const RETIREMENT_HIGHLIGHT_KEYS = {
  /** ≥42.195km 단일 런(풀코스). */
  marathon: 'hl_marathon',
  /** 그 신발이 보유한 올타임 최장 런 PB. */
  pbLongestRun: 'hl_pb_longest_run',
  /** ≥21.0975km 단일 런(하프). */
  halfMarathon: 'hl_half_marathon',
  /** 한 켤레 누적 1000km. */
  longHaul1000: 'hl_long_haul_1000',
  /** 그 신발이 보유한 올타임 최고 페이스 PB. */
  pbFastestPace: 'hl_pb_fastest_pace',
  /** 한 켤레 누적 500km. */
  trustedPartner500: 'hl_trusted_partner_500',
  /** ≥10km 단일 런. */
  tenK: 'hl_ten_k',
  /** 그 신발의 최장 단일 런(레이스 거리 미달 시의 기본 하이라이트). */
  longestRun: 'hl_longest_run',
} as const;

const H = RETIREMENT_HIGHLIGHT_KEYS;

/**
 * 하이라이트 우선순위(강→약). Most Memorable Moment = 이 순서로 정렬된 highlights[0].
 * 풀코스 완주가 가장 강렬, 그다음 올타임 PB, 하프, 누적 마일스톤 … 기본 최장 런 순.
 */
export const HIGHLIGHT_PRIORITY: readonly string[] = [
  H.marathon,
  H.pbLongestRun,
  H.halfMarathon,
  H.longHaul1000,
  H.pbFastestPace,
  H.trustedPartner500,
  H.tenK,
  H.longestRun,
];

/** retirementGrade 가 'real PB' 판정에 쓰는 PB 하이라이트 키(단일 출처). */
export const PB_HIGHLIGHT_KEYS: readonly string[] = [H.pbFastestPace, H.pbLongestRun];

// ── 수치/날짜 방어 헬퍼(context.ts 와 동일 규약) ───────────────────────────────
/** km(string|number) → 유한 비음수. 비정상은 0. */
function parseKm(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 초 단위 → 유한 비음수. 비정상은 0. */
function parseSeconds(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 'YYYY-MM-DD' 앞 10자만(정규화). 비문자/형식불일치 → null. */
function ymd(v: unknown): string | null {
  if (typeof v !== 'string' || v.length < 10) return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 'YYYY-MM-DD' → 로컬 자정 epoch ms. */
function ymdToMs(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).getTime();
}

/** BackendRun → 최소 UI Run(personalRecords 가 읽는 dist/durationS/runDate 만 의미). */
function toRun(r: BackendRun): Run {
  return {
    id: r.id,
    date: '',
    day: '',
    dateNum: '',
    dist: parseKm(r.km),
    pace: '',
    time: '',
    shoe: 0,
    cal: 0,
    cadence: 0,
    bpm: 0,
    elev: 0,
    durationS: parseSeconds(r.duration),
    runDate: ymd(r.run_date) ?? undefined,
  };
}

// ── 하이라이트 / 사용기간 ──────────────────────────────────────────────────────
interface ShoeStats {
  totalKm: number;
  longestRunKm: number;
  bestPaceSec: number | null;
}

/** 그 신발이 올타임 최고 페이스 PB 를 보유하는가(전역 ctx 와 동률 비교). */
function holdsPacePB(stats: ShoeStats, ctx: ProgressionContext): boolean {
  const shoeBest = stats.bestPaceSec;
  const globalBest = ctx?.bestPaceSec;
  if (shoeBest == null || globalBest == null) return false;
  // 페이스는 낮을수록 빠름 — 전역 최고(최소) 이하면 그 신발이 PB 보유.
  return shoeBest <= globalBest + PB_EPS;
}

/** 그 신발이 올타임 최장 런 PB 를 보유하는가. */
function holdsDistancePB(stats: ShoeStats, ctx: ProgressionContext): boolean {
  const shoeLongest = stats.longestRunKm;
  if (!(shoeLongest > 0)) return false;
  const globalLongest = Number(ctx?.longestRunKm);
  if (!Number.isFinite(globalLongest) || globalLongest <= 0) return false;
  return shoeLongest >= globalLongest - PB_EPS;
}

/**
 * 실제 달성한 하이라이트만 우선순위(강→약)로. 날조 금지: 자격 런/기록 없으면 비노출.
 * 레이스거리·기본 최장런은 상호배타(최고 1개), 누적 마일스톤도 최고 1개, PB 는 독립.
 */
function computeHighlights(stats: ShoeStats, ctx: ProgressionContext): string[] {
  const present = new Set<string>();

  // 레이스 거리 / 기본 최장 런(상호배타 — 가장 높은 것 하나).
  const longest = stats.longestRunKm;
  if (longest >= MARATHON_KM) present.add(H.marathon);
  else if (longest >= HALF_MARATHON_KM) present.add(H.halfMarathon);
  else if (longest >= TEN_K_KM) present.add(H.tenK);
  else if (longest > 0) present.add(H.longestRun);

  // 누적 마일스톤(상호배타 — 가장 높은 것 하나).
  if (stats.totalKm >= LONG_HAUL_KM) present.add(H.longHaul1000);
  else if (stats.totalKm >= TRUSTED_PARTNER_KM) present.add(H.trustedPartner500);

  // 그 신발로 세운 올타임 PB(독립).
  if (holdsPacePB(stats, ctx)) present.add(H.pbFastestPace);
  if (holdsDistancePB(stats, ctx)) present.add(H.pbLongestRun);

  // 우선순위 순서로 방출(결정적).
  return HIGHLIGHT_PRIORITY.filter(k => present.has(k));
}

/** 사용 기간(일) — 첫 런부터 은퇴일(now, 없으면 마지막 런)까지. 항상 0 이상. */
function computeUsageDays(
  firstRunDate: string | null,
  lastRunDate: string | null,
  now?: number,
): number {
  if (!firstRunDate) return 0;
  const startMs = ymdToMs(firstRunDate);
  const endMs =
    Number.isFinite(now) && (now as number) > 0
      ? (now as number)
      : lastRunDate
        ? ymdToMs(lastRunDate)
        : startMs;
  const days = Math.round((endMs - startMs) / DAY_MS);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/** 권장 수명(km) — max_km 우선, 없으면 모델명 파싱(wearModel.targetKmFor 재사용). */
function recommendedKmFor(shoe: BackendShoe | null | undefined): number {
  const explicit = Number(shoe?.max_km);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const name = typeof shoe?.name === 'string' ? shoe.name : '';
  return targetKmFor({name} as WearShoe);
}

/**
 * Most Memorable Moment — 우선순위 1위 하이라이트 키(없으면 null). 결정적.
 */
export function mostMemorableMoment(
  highlights: readonly string[] | null | undefined,
): string | null {
  if (!Array.isArray(highlights) || highlights.length === 0) return null;
  const first = highlights[0];
  return typeof first === 'string' && first ? first : null;
}

// ── 은퇴 요약 ──────────────────────────────────────────────────────────────────
/**
 * 그 신발의 **실제 런만으로** 은퇴 요약을 만든다(날조 금지). PURE: 입력 불변, 안전값.
 *
 * @param shoe  은퇴 신발(BackendShoe). id 로 런을 필터링한다.
 * @param runs  전체 런(BackendRun[]). shoe_id 가 일치하는 런만 집계.
 * @param ctx   전역 진척 컨텍스트 — 올타임 PB 보유 판정 + 등급(shoeManagement)에 사용.
 * @param now   은퇴 기준 시각(epoch ms, 선택) — 사용 기간 끝점.
 */
export function buildRetirementSummary(
  shoe: BackendShoe | null | undefined,
  runs: readonly BackendRun[] | null | undefined,
  ctx: ProgressionContext,
  now?: number,
): RetirementSummary {
  const shoeId = shoe && typeof shoe.id === 'string' ? shoe.id : '';
  const name = shoe && typeof shoe.name === 'string' ? shoe.name : '';
  const list = Array.isArray(runs) ? runs.filter(Boolean) : [];
  const mine = shoeId ? list.filter(r => r && String(r.shoe_id) === shoeId) : [];

  let totalKm = 0;
  let totalDurationS = 0;
  let firstRunDate: string | null = null;
  let lastRunDate: string | null = null;
  for (const r of mine) {
    totalKm += parseKm(r.km);
    totalDurationS += parseSeconds(r.duration);
    const d = ymd(r.run_date);
    if (d) {
      if (!firstRunDate || d < firstRunDate) firstRunDate = d;
      if (!lastRunDate || d > lastRunDate) lastRunDate = d;
    }
  }

  // 최장 런/최고 페이스/최장 시간 — lib/records 재사용(이 신발 런 부분집합).
  const pr = personalRecords(mine.map(toRun));
  const runCount = mine.length;
  const longestRunKm = pr.longestKm;
  const bestPaceSec = pr.fastestPaceSec;
  const avgPaceSec =
    totalKm > 0 && totalDurationS > 0 ? totalDurationS / totalKm : null;
  const usageDays = computeUsageDays(firstRunDate, lastRunDate, now);

  const stats: ShoeStats = {totalKm, longestRunKm, bestPaceSec};
  const highlights = computeHighlights(stats, ctx ?? ({} as ProgressionContext));
  const mostMemorable = mostMemorableMoment(highlights);

  // 등급: closeness = usedKm / recommendedKm. usedKm 은 서버 truth(perShoe.km) 우선.
  const recommendedKm = recommendedKmFor(shoe);
  const stat = ctx && ctx.perShoe ? ctx.perShoe[shoeId] : undefined;
  const usedKm = stat && stat.km > 0 ? stat.km : totalKm;

  const core: RetirementSummary = {
    shoeId,
    name,
    totalKm,
    runCount,
    totalDurationS,
    avgPaceSec,
    bestPaceSec,
    longestRunKm,
    firstRunDate,
    lastRunDate,
    usageDays,
    grade: 'standard',
    highlights,
    mostMemorable,
  };
  // grade 는 core(하이라이트 PB) + ctx(shoeManagement) 를 읽으므로 코어 산출 후 부여.
  const grade = gradeRetirement(usedKm, recommendedKm, core, ctx);
  return {...core, grade};
}

// ── Hall of Shoes 레코드(영속) ─────────────────────────────────────────────────
/**
 * 은퇴 요약 → 영속 레코드(RetiredShoeRecord). 절대 사라지지 않는 Hall of Shoes 항목.
 * (기존 타입 규약: name + retiredAt[ISO] + retireYear — storage 정규화와 일치.)
 *
 * @param summary 은퇴 요약(카드 재생성을 위해 통째로 보존).
 * @param km      은퇴 시점 누적 거리(km). 비정상이면 summary.totalKm 로 폴백.
 * @param nowMs   은퇴 시각(epoch ms). 연도/ISO 라벨 산출.
 */
export function buildRetiredShoeRecord(
  summary: RetirementSummary,
  km: number,
  nowMs: number,
): RetiredShoeRecord {
  const safeKm =
    Number.isFinite(km) && km > 0
      ? km
      : Number.isFinite(summary?.totalKm) && summary.totalKm > 0
        ? summary.totalKm
        : 0;
  const ms = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : 0;
  const date = ms > 0 ? new Date(ms) : null;
  return {
    shoeId: typeof summary?.shoeId === 'string' ? summary.shoeId : '',
    name: typeof summary?.name === 'string' ? summary.name : '',
    km: safeKm,
    retiredAt: date ? date.toISOString() : '',
    retireYear: date ? date.getFullYear() : 0,
    grade: summary?.grade ?? 'standard',
    summary,
  };
}

/** state 가 ProgressionState 모양(객체 + retiredShoes 배열)인가. */
function isUsableState(state: unknown): state is ProgressionState {
  return !!state && typeof state === 'object';
}

/** 두 레코드가 영속상 동일한가(km/등급/시각/연도/이름/요약 동일) — 불필요한 재저장 회피용. */
function sameRetiredRecord(
  a: RetiredShoeRecord,
  b: RetiredShoeRecord,
): boolean {
  return (
    a.name === b.name &&
    a.km === b.km &&
    a.retiredAt === b.retiredAt &&
    a.retireYear === b.retireYear &&
    a.grade === b.grade &&
    a.summary === b.summary
  );
}

/**
 * 은퇴 레코드를 신발당 **한 항목**으로 UPSERT 한 새 상태를 돌려준다(입력 불변).
 *   · 신규 신발 → retiredShoes 끝에 덧붙인다(절대 사라지지 않음).
 *   · 같은 shoeId 가 이미 있고 내용이 다르면 → 그 자리(원래 위치)를 최신 레코드로 **교체**
 *     한다(보관 복원 후 추가 런 → 재은퇴 시 km/등급/연도가 최신으로 갱신). 여전히 1개만.
 *   · 같은 shoeId 가 있고 내용이 동일하면 → 입력 상태를 **그대로**(동일 참조) 돌려준다
 *     (재저장 IO 회피 — persistRetiredShoe 가 참조 비교로 스킵).
 * 무효 레코드(null/빈 shoeId)는 변경 없이 입력 그대로. run/shoe/기타 키는 손대지 않는다.
 */
export function addRetiredShoeRecord(
  state: ProgressionState | null | undefined,
  record: RetiredShoeRecord | null | undefined,
): ProgressionState {
  const base = isUsableState(state) ? state : defaultProgressionState();
  if (!record || typeof record.shoeId !== 'string' || !record.shoeId) {
    return base; // 무효 레코드 → 변경 없음.
  }
  const existing = Array.isArray(base.retiredShoes) ? base.retiredShoes : [];
  const idx = existing.findIndex(r => r && r.shoeId === record.shoeId);
  if (idx >= 0) {
    if (sameRetiredRecord(existing[idx], record)) {
      return base; // 동일 내용 → 변경 없음(동일 참조).
    }
    const nextList = existing.slice();
    nextList[idx] = record; // UPSERT — 원래 위치를 최신 레코드로 교체(신발당 1개 유지).
    return {...base, retiredShoes: nextList};
  }
  return {...base, retiredShoes: [...existing, record]};
}
