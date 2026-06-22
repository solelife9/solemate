// ============================================================================
// lib/injuryGuidance.ts — 통합 부상위험 → 구체 코칭 (시그니처 #1+#2 완성 슬라이스)
//
// "위험 높음"만 보여주면 사용자는 뭘 해야 할지 모른다. 이 모듈은 통합 위험
// (injuryRisk.CombinedInjuryRisk)을 받아 "왜 위험한가 + 무엇을 하면 부상 없이 계속
// 달릴 수 있나"를 driver별 구체 행동으로 옮긴다. 전부 한국어 평어(약자/원시 숫자 없음).
//
// 순수함수 — risk 안에 든 load/shoe 파생값만 조합한다(새 상태/네트워크/네이티브 0).
// ============================================================================
import { CombinedInjuryRisk, RiskLevel } from './injuryRisk';
import { loadRatioPhraseKo, nextWeekSafeKm } from './trainingLoad';

export type GuidanceTone = 'good' | 'caution' | 'high';

export interface GuidanceItem {
  tone: GuidanceTone;
  /** Ionicons 이름(상세 화면이 렌더). */
  icon: string;
  title: string;
  body: string;
}

export interface InjuryGuidance {
  /** 신호등 헤드라인(= risk.message). */
  headline: string;
  level: RiskLevel;
  /** 구체 행동 카드들(항상 1개 이상 — 안전하면 격려 1개). */
  items: GuidanceItem[];
}

const REST_AT_DAYS = 4; // 나흘 연속 달리면 휴식 권고

/**
 * 통합 위험에서 코칭 항목을 만든다(순수). 신발·부하·연속일 각각의 신호를 독립 항목으로
 * 풀어내고, 어느 것도 위험하지 않으면 keep-going 격려 1개를 준다(빈 목록 금지).
 */
export function buildInjuryGuidance(risk: CombinedInjuryRisk): InjuryGuidance {
  const { load, shoe } = risk;
  const items: GuidanceItem[] = [];
  const wearPct = Math.round((shoe.percentUsed || 0) * 100);

  // ── 신발 신호 ────────────────────────────────────────────────────────────────
  if (shoe.level === 'high') {
    items.push({
      tone: 'high',
      icon: 'footsteps',
      title: '신발 교체가 필요해요',
      body: `마모 ${wearPct}% — 닳은 밑창은 충격 흡수가 떨어져 무릎·정강이 부담이 커져요. 다음 신발을 준비하세요.`,
    });
  } else if (shoe.level === 'caution') {
    items.push({
      tone: 'caution',
      icon: 'footsteps',
      title: '슬슬 다음 신발을 준비하세요',
      body: `마모 ${wearPct}% — 교체 시점(90%) 전에 새 신발을 미리 길들이면 갑작스런 교체로 인한 부상을 막아요.`,
    });
  }

  // ── 훈련 부하 신호 ───────────────────────────────────────────────────────────
  if (load.level === 'high') {
    items.push({
      tone: 'high',
      icon: 'bed',
      title: '오늘은 회복이 우선',
      body: `이번 주 운동량이 ${loadRatioPhraseKo(load)}예요. 오늘은 쉬거나 가벼운 이지런만 — 이번 주 거리는 더 늘리지 마세요.`,
    });
  } else if (load.level === 'caution') {
    const safe = nextWeekSafeKm(load);
    const tail =
      safe > 0
        ? `다음 주는 ${safe}km 이내로 천천히 올리세요(주당 +10%).`
        : '다음 주도 무리하지 말고 천천히 늘리세요.';
    items.push({
      tone: 'caution',
      icon: 'trending-up',
      title: '이번 주는 유지하세요',
      body: `운동량이 늘고 있어요. ${tail}`,
    });
  }

  // ── 연속 러닝 → 휴식 권고(부하 등급과 별개로, 며칠 내리 달렸으면) ────────────────
  if (load.recentConsecutiveDays >= REST_AT_DAYS) {
    items.push({
      tone: 'caution',
      icon: 'bed',
      title: `${load.recentConsecutiveDays}일 연속 달렸어요`,
      body: '근육·힘줄이 회복할 시간이 필요해요. 내일은 쉬는 날로 — 휴식도 훈련이에요.',
    });
  }

  // ── 모두 양호 → keep-going 격려(빈 목록 방지) ───────────────────────────────────
  if (items.length === 0) {
    items.push({
      tone: 'good',
      icon: 'checkmark-circle',
      title: '지금 페이스 그대로',
      body: '몸도 신발도 좋은 상태예요. 무리 없이 꾸준히 — 그게 부상 없이 오래 달리는 비결이에요.',
    });
  }

  return { headline: risk.message, level: risk.level, items };
}
