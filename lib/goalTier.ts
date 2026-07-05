// ============================================================================
// lib/goalTier.ts — 주간 목표 '난이도' → 색/라벨 (순수)
// ----------------------------------------------------------------------------
// 주간 목표 거리(km)가 클수록 야심찬 목표 → 난이도가 입문→정예로 올라간다(사용자 방향
// 2026-07-05). 단색 링(그 티어색 하나) + 난이도 라벨로 표현 — 색을 글자가 설명하니
// 의미가 서고(게임식 색 남발 아님), '어정쩡한 오렌지' 단일색을 대체한다.
// 임계(실제 러너 주간 거리): 입문<15 · 꾸준15~29 · 도전30~49(마라톤 훈련) ·
// 열정50~79(고volume) · 정예80+(준엘리트급). 참고: 프로는 주 160~220km. 색은 theme 토큰.
// ============================================================================
import {GOOD, BEST, DANGER, SPORT_VIOLET, TIER_COLORS} from '../theme';

export interface GoalTier {
  key: 'start' | 'steady' | 'push' | 'fire' | 'elite';
  label: string;
  color: string;
}

/** 주간 목표 거리(km) → 난이도 티어(색/라벨). 비정상 입력은 입문으로. */
export function weeklyGoalTier(km: number): GoalTier {
  const k = Number.isFinite(km) ? km : 0;
  if (k >= 80) return {key: 'elite', label: '정예', color: TIER_COLORS.gold};   // 골드
  if (k >= 50) return {key: 'fire', label: '열정', color: DANGER};              // 빨강
  if (k >= 30) return {key: 'push', label: '도전', color: SPORT_VIOLET};          // 보라(스포티)
  if (k >= 15) return {key: 'steady', label: '꾸준', color: BEST};              // 파랑
  return {key: 'start', label: '입문', color: GOOD};                            // 초록
}
