// ============================================================================
// lib/progression/retirementCard.ts — 은퇴 카드 뷰모델 (Slice B, signature)
// ============================================================================
// RetirementSummary + RetirementGrade(+ 선택 장착 타이틀) → 은퇴 카드가 그릴 표시 필드
// 묶음(순수함수, 네이티브 의존 0). 4개 레이아웃(A Nike / B Modern / C Apple[기본] / D
// Hall of Fame)이 **하나의 요약**에서 같은 모델을 읽어 서로 다른 구도로 렌더한다.
//
// 재사용(중복 정의 금지):
//   · lib/format fmtPace/fmtTime — 페이스/시간 포맷(앱 전역과 동일 규칙).
//   · lib/units displayNum       — km↔표시단위 환산(저장 표준은 km).
//   · theme TIER_COLORS          — 등급 배지/강조색(하드코딩 금지).
//   · ./retirement PB_HIGHLIGHT_KEYS / RETIREMENT_HIGHLIGHT_KEYS — 하이라이트 단일 출처.
//
// TRUTH ONLY(iron law): 모든 수치는 그 신발의 실제 집계(요약)에서 파생한다. 누락/0/null
// 은 안전하게 비우거나 폴백 카피로 대체하고, 어떤 입력에서도 throw 하지 않는다(빈/결손
// 요약도 카드가 깨지지 않게). Shoe Score 는 경쟁/순위가 아니라 **실제 등급 + PB 수**에서
// 결정론적으로 환산한 keepsake 점수다(가짜 비교 수치 아님).
// ============================================================================
import {fmtPace, fmtTime} from '../format';
import {Unit, displayNum} from '../units';
import {TIER_COLORS} from '../../theme';
import {PB_HIGHLIGHT_KEYS, RETIREMENT_HIGHLIGHT_KEYS as H} from './retirement';
import type {RankTier, RetirementGrade, RetirementSummary} from './types';

// ── 레이아웃 포맷 ──────────────────────────────────────────────────────────────
/** 카드 레이아웃: A Nike / B Modern / C Apple(기본) / D Hall of Fame. */
export type RetirementCardFormat = 'A' | 'B' | 'C' | 'D';

/** 선택 가능한 4개 포맷(렌더러/포맷 스위처가 소비). */
export const RETIREMENT_CARD_FORMATS: readonly RetirementCardFormat[] = ['A', 'B', 'C', 'D'];

/** 기본 포맷 — C(Apple/한국어, 감성-자랑 톤). DESIGN.md 권위. */
export const DEFAULT_RETIREMENT_CARD_FORMAT: RetirementCardFormat = 'C';

// ── 브랜드/카피 상수 ───────────────────────────────────────────────────────────
const BRAND = 'KEEGO';
const WORDMARK = 'Keep Going';
/** 신발명 폴백(이름 없는 요약도 카드가 비지 않게). */
const FALLBACK_SHOE_NAME = '내 러닝화';
/** 기본(C) 감성 클로징 — 강요 아닌, bittersweet-proud 톤(mockup verbatim). */
const CLOSING_TOP = '수명을 다했습니다.';
const CLOSING_BOTTOM = '훌륭한 여정이었습니다.';

// ── 등급 배지(권위) ────────────────────────────────────────────────────────────
/**
 * 은퇴 등급 → 배지 표시(라벨·이모지·티어색). 색은 TIER_COLORS 만(하드코딩 금지).
 * perfect=master(보라) / hallOfFame=gold 는 mockup C·D 와 정합.
 */
interface GradeBadgeDef {
  label: string;
  /** 영문 단문(예: 'Perfect') — D 인증서가 '… 등급'으로 쓴다. */
  name: string;
  emoji: string;
  tier: RankTier;
}
const GRADE_BADGES: Readonly<Record<RetirementGrade, GradeBadgeDef>> = {
  standard: {label: 'Standard Retirement', name: 'Standard', emoji: '👟', tier: 'bronze'},
  good: {label: 'Good Timing', name: 'Good', emoji: '👍', tier: 'silver'},
  smart: {label: 'Smart Retirement', name: 'Smart', emoji: '✨', tier: 'diamond'},
  perfect: {label: 'Perfect Retirement', name: 'Perfect', emoji: '💎', tier: 'master'},
  hallOfFame: {label: 'Hall of Fame', name: 'Hall of Fame', emoji: '🏆', tier: 'gold'},
};

/** keepsake Shoe Score(D 인증서)의 등급별 기준점 — 권장 수명 적절성을 정수로 환산. */
const GRADE_SCORE: Readonly<Record<RetirementGrade, number>> = {
  standard: 72,
  good: 84,
  smart: 91,
  perfect: 97,
  hallOfFame: 99,
};

/** 카드가 노출하는 등급 배지(라벨 + 이모지 + 티어색). */
export interface RetirementGradeBadge {
  grade: RetirementGrade;
  label: string;
  name: string;
  emoji: string;
  tier: RankTier;
  /** TIER_COLORS[tier] — 배지 보더/텍스트 강조색. */
  color: string;
}

/** 등급 → 배지(미상/비정상 등급은 standard 로 안전 폴백). */
export function retirementGradeBadge(grade: RetirementGrade | null | undefined): RetirementGradeBadge {
  const def = (grade && GRADE_BADGES[grade]) || GRADE_BADGES.standard;
  const g: RetirementGrade = (grade && GRADE_BADGES[grade] ? grade : 'standard') as RetirementGrade;
  return {grade: g, label: def.label, name: def.name, emoji: def.emoji, tier: def.tier, color: TIER_COLORS[def.tier]};
}

// ── 하이라이트 라벨(키 → 이모지+한국어, 단일 출처) ──────────────────────────────
const HIGHLIGHT_LABELS: Readonly<Record<string, string>> = {
  [H.marathon]: '🏁 풀코스 완주',
  [H.pbLongestRun]: '📏 최장 거리 PB',
  [H.halfMarathon]: '🏃 하프 완주',
  [H.longHaul1000]: '🛡️ 1000km 롱헐',
  [H.pbFastestPace]: '⚡ 최고 페이스 PB',
  [H.trustedPartner500]: '🤝 500km 신뢰의 파트너',
  [H.tenK]: '🔟 10km 돌파',
  [H.longestRun]: '📏 최장 거리',
};

/** 하이라이트 키 → 표시 라벨(미지정 키는 빈 문자열 — 비노출). */
export function highlightLabel(key: string | null | undefined): string {
  return (key && HIGHLIGHT_LABELS[key]) || '';
}

// ── 수치/날짜 헬퍼 ─────────────────────────────────────────────────────────────
/** 유한 비음수만(NaN/음수/비유한 → 0). */
function nonNeg(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD'(형식 불일치 → ''). */
function dotDate(d: string | null | undefined): string {
  if (typeof d !== 'string') return '';
  const s = d.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '.') : '';
}

/** 'YYYY.MM.DD' → 'YYYY.MM'(B 카드의 짧은 날짜). 비면 ''. */
function shortDate(dot: string): string {
  return dot ? dot.slice(0, 7) : '';
}

/** sec/km 페이스 값을 m'ss" 로(0/null → null). fmtPace(1, sec) 재사용. */
function paceLabel(sec: number | null | undefined): string | null {
  const v = nonNeg(sec);
  if (v <= 0) return null;
  return fmtPace(1, v);
}

// ── 뷰모델 ────────────────────────────────────────────────────────────────────
export interface RetirementCardStat {
  label: string;
  value: string;
}

export interface RetirementCardModel {
  /** 신발명(없으면 폴백). */
  shoeName: string;
  /** 누적 거리(표시 단위, 정수 문자열) 예: '512'. */
  distance: string;
  /** 거리 + 단위 한 덩어리 예: '512km'. */
  distanceLabel: string;
  unit: string;
  /** 'C' 함께한 거리 한 줄: '512km 함께했습니다'. */
  togetherLine: string;
  /** 'B' 영문 한 줄: '512 km Together'. */
  togetherEn: string;
  runCount: number;
  /** 러닝 수 라벨 '42'. */
  runCountLabel: string;
  /** 평균 페이스 m'ss"(없으면 null). */
  avgPace: string | null;
  /** 최고 페이스 m'ss"(없으면 null). */
  bestPace: string | null;
  /** 최장 단일 런(표시 단위, 소수1자리 문자열) — 0이면 null. */
  longestRun: string | null;
  /** 그 신발로 세운 PB 수(하이라이트 기준). */
  pbCount: number;
  /** PB 배지 '×3'(0이면 null). */
  pbLabel: string | null;
  /** 사용 기간(일). */
  usageDays: number;
  /** 총 러닝 시간 'H:MM:SS'(0이면 null). */
  totalTime: string | null;
  /** 첫/마지막 런 일자('YYYY.MM.DD', 없으면 ''). */
  startDate: string;
  endDate: string;
  /** 'YYYY.MM' 짧은 표기(B). */
  startMonth: string;
  endMonth: string;
  /** '2026.03.12 → 2026.08.22'(한쪽만 있으면 그것만). */
  dateRange: string;
  /** 은퇴 연도(Class of YYYY). 없으면 0. */
  retireYear: number;
  /** 실제 달성 하이라이트 라벨(우선순위 순, 빈 키 제거). */
  highlights: string[];
  /** Most Memorable Moment 라벨(없으면 null). */
  mostMemorable: string | null;
  /** Smart Retirement Grade 배지. */
  grade: RetirementGradeBadge;
  /** D 인증서용 keepsake Shoe Score(0..100, 결정론적). */
  shoeScore: number;
  /** 장착 타이틀(워드마크 근처 은은하게). 없으면 null. */
  equippedTitle: string | null;
  /** 브랜드 워드마크. */
  brand: string;
  wordmark: string;
  // 레이아웃별 카피 ───────────────────────────────────────────────
  /** A: 'RETIREMENT · CLASS OF 2026'. */
  tagA: string;
  /** A: 'MISSION COMPLETE'. */
  missionA: string;
  /** B: 'A Journey Completed'. */
  eyebrowB: string;
  /** C: '수명을 다했습니다.' / '훌륭한 여정이었습니다.'. */
  closingTop: string;
  closingBottom: string;
}

export interface RetirementCardOptions {
  /** 표시 단위(km|mi). 기본 km. */
  unit?: Unit;
  /** 장착 타이틀 표시명(없으면 미표시). */
  equippedTitle?: string | null;
  /** 은퇴 시각(epoch ms) — Class of YYYY/종료일. 없으면 lastRunDate 연도로 폴백. */
  retiredAtMs?: number;
}

/**
 * 은퇴 요약 + 등급(+ 옵션)에서 카드 표시 필드를 만든다(순수, 네이티브 의존 0).
 * grade 는 명시값 우선, 없으면 summary.grade. 누락/0/null 은 안전하게 비운다(throw 금지).
 */
export function buildRetirementCardModel(
  summary: RetirementSummary | null | undefined,
  grade?: RetirementGrade | null,
  opts?: RetirementCardOptions,
): RetirementCardModel {
  const s = (summary || {}) as RetirementSummary;
  const unit: Unit = opts?.unit ?? 'km';
  const g = grade ?? s.grade ?? 'standard';
  const badge = retirementGradeBadge(g);

  const totalKm = nonNeg(s.totalKm);
  const distNum = displayNum(totalKm, unit, 0);
  const distance = String(distNum);
  const distanceLabel = `${distance}${unit}`;

  const runCount = Math.round(nonNeg(s.runCount));
  const longestKm = nonNeg(s.longestRunKm);
  const longestRun = longestKm > 0 ? displayNum(longestKm, unit, 1).toFixed(1) : null;

  const hlKeys = Array.isArray(s.highlights) ? s.highlights.filter(Boolean) : [];
  const pbCount = hlKeys.filter(k => PB_HIGHLIGHT_KEYS.includes(k)).length;
  const highlights = hlKeys.map(highlightLabel).filter(Boolean);
  const mostMemorable = highlightLabel(s.mostMemorable) || null;

  const startDate = dotDate(s.firstRunDate);
  const endDate = dotDate(s.lastRunDate);
  const dateRange = startDate && endDate ? `${startDate} → ${endDate}` : startDate || endDate;

  // 은퇴 연도: retiredAtMs > lastRunDate > firstRunDate.
  const retiredYearFromMs =
    opts && Number.isFinite(opts.retiredAtMs) && (opts.retiredAtMs as number) > 0
      ? new Date(opts.retiredAtMs as number).getFullYear()
      : 0;
  const retireYear =
    retiredYearFromMs ||
    Number(endDate.slice(0, 4)) ||
    Number(startDate.slice(0, 4)) ||
    0;

  const totalSec = Math.round(nonNeg(s.totalDurationS));

  return {
    shoeName: (typeof s.name === 'string' && s.name.trim()) || FALLBACK_SHOE_NAME,
    distance,
    distanceLabel,
    unit,
    togetherLine: `${distanceLabel} 함께했습니다`,
    togetherEn: `${distance} ${unit} Together`,
    runCount,
    runCountLabel: String(runCount),
    avgPace: paceLabel(s.avgPaceSec),
    bestPace: paceLabel(s.bestPaceSec),
    longestRun,
    pbCount,
    pbLabel: pbCount > 0 ? `×${pbCount}` : null,
    usageDays: Math.round(nonNeg(s.usageDays)),
    totalTime: totalSec > 0 ? fmtTime(totalSec) : null,
    startDate,
    endDate,
    startMonth: shortDate(startDate),
    endMonth: shortDate(endDate),
    dateRange,
    retireYear,
    highlights,
    mostMemorable,
    grade: badge,
    shoeScore: Math.max(0, Math.min(100, GRADE_SCORE[badge.grade] + Math.min(pbCount, 3))),
    equippedTitle: (opts?.equippedTitle && String(opts.equippedTitle).trim()) || null,
    brand: BRAND,
    wordmark: WORDMARK,
    tagA: retireYear ? `RETIREMENT · CLASS OF ${retireYear}` : 'RETIREMENT',
    missionA: 'MISSION COMPLETE',
    eyebrowB: 'A Journey Completed',
    closingTop: CLOSING_TOP,
    closingBottom: CLOSING_BOTTOM,
  };
}
