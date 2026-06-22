// ============================================================================
// lib/progression/mergeProgression.ts — 진척 상태 무손실 병합 (클라우드 동기)
// ============================================================================
// progression_v1(랭크 캐시·타이틀·업적 seen·은퇴 신발·포인트)을 두 기기/세션 사이에서
// 합칠 때 쓴다. shoes/runs 와 달리 단일 객체라 updatedAt 기반 최신우선이 아니라, 유실을
// 최소화하는 **union/max** 규칙으로 병합한다(iron law: 은퇴 신발·획득 업적을 잃지 않는다).
//
//   · retiredShoes  — shoeId 합집합(어느 기기의 은퇴 신발도 잃지 않음).
//   · earnedTitles  — key 합집합(역호환 보존).
//   · seenUnlocks   — 합집합(셀러브레이션 재폭주 방지 — 한쪽에서 본 건 본 것으로).
//   · points        — max(적립 XP 캐시 후퇴 방지).
//   · equipped/pinned — 현재 기기(local) 우선, 없으면 remote.
// 한쪽이 없으면 다른 쪽을 그대로 돌려준다. 순수 함수(I/O 0) — 단위테스트로 검증.
// ============================================================================
import {ProgressionState, RetiredShoeRecord, EarnedTitle} from './types';

/** key 추출 함수 기준으로 첫 등장만 남긴다(local 우선 — 입력을 local 먼저 넣는다). */
function uniqByKeepFirst<T>(items: T[], keyOf: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = keyOf(it);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * 두 진척 상태를 유실 없이 병합한다. 입력은 local 을 먼저 — 충돌 시 local(현재 기기) 우선.
 */
export function mergeProgression(
  local?: ProgressionState | null,
  remote?: ProgressionState | null,
): ProgressionState | undefined {
  if (!local) return remote ?? undefined;
  if (!remote) return local;

  const retiredShoes = uniqByKeepFirst<RetiredShoeRecord>(
    [...arr<RetiredShoeRecord>(local.retiredShoes), ...arr<RetiredShoeRecord>(remote.retiredShoes)],
    r => String(r?.shoeId ?? ''),
  );
  const earnedTitles = uniqByKeepFirst<EarnedTitle>(
    [...arr<EarnedTitle>(local.earnedTitles), ...arr<EarnedTitle>(remote.earnedTitles)],
    t => String(t?.key ?? ''),
  );
  const seenUnlocks = Array.from(
    new Set([...arr<string>(local.seenUnlocks), ...arr<string>(remote.seenUnlocks)].map(String)),
  );
  const points = Math.max(Number(local.points) || 0, Number(remote.points) || 0);
  const pinned =
    local.pinnedAchievementKeys && local.pinnedAchievementKeys.length
      ? local.pinnedAchievementKeys
      : remote.pinnedAchievementKeys;

  const result: ProgressionState = {
    earnedTitles,
    equippedTitleKey: local.equippedTitleKey ?? remote.equippedTitleKey ?? null,
    seenUnlocks,
    retiredShoes,
    points,
  };
  if (pinned && pinned.length) {
    result.pinnedAchievementKeys = pinned;
  }
  return result;
}
