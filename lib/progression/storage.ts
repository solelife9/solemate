// ============================================================================
// lib/progression/storage.ts — progression_v1 영속 (Slice A foundation)
// ============================================================================
// 진척 생태계의 **유일한** 신규 AsyncStorage 키 'progression_v1' 만 읽고 쓴다.
// 기존 run/shoe/challenge/settings/profile 키는 절대 건드리지 않는다(iron law).
//
// 계약:
//   · loadProgression() — 누락/손상 JSON → 안전 기본값. **절대 throw 하지 않는다.**
//     각 필드를 개별 정규화해 부분 손상(한 필드만 깨짐)도 기본값으로 복구한다.
//   · saveProgression(state) — 직렬화 후 1회 setItem. 실패해도 throw 하지 않는다.
// 파생 가능한 값(랭크/업적/타이틀)은 저장하지 않는다 — 사용자 선택·은퇴 기록·이미
// 알린 언락·포인트만 영속(spec). 클라우드 동기는 다른 모듈이 best-effort 로 처리.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EarnedTitle,
  ProgressionState,
  RetiredShoeRecord,
} from './types';

/** 진척 영속 키 — 이 한 키만 추가한다. */
export const PROGRESSION_KEY = 'progression_v1';

/** 비어 있는 안전 기본 상태(누락/손상 시 반환). */
export function defaultProgressionState(): ProgressionState {
  return {
    earnedTitles: [],
    equippedTitleKey: null,
    seenUnlocks: [],
    retiredShoes: [],
    points: 0,
  };
}

// ── 필드별 정규화(부분 손상 방어) ──────────────────────────────────────────────

/** 문자열만 통과시키는 필터(빈 값/비문자 제거). */
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

/** EarnedTitle 형태만 통과(키 필수). 중복/잘못된 항목은 버린다. */
function asEarnedTitles(v: unknown): EarnedTitle[] {
  if (!Array.isArray(v)) return [];
  const out: EarnedTitle[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.key !== 'string' || !o.key) continue;
    out.push({
      key: o.key,
      unlockedAt: typeof o.unlockedAt === 'string' ? o.unlockedAt : '',
      isEquipped: o.isEquipped === true,
    });
  }
  return out;
}

/** RetiredShoeRecord 형태만 통과(shoeId 필수). summary 는 그대로 보존(있으면). */
function asRetiredShoes(v: unknown): RetiredShoeRecord[] {
  if (!Array.isArray(v)) return [];
  const out: RetiredShoeRecord[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.shoeId !== 'string' || !o.shoeId) continue;
    const km = Number(o.km);
    const retireYear = Number(o.retireYear);
    out.push({
      shoeId: o.shoeId,
      name: typeof o.name === 'string' ? o.name : '',
      km: Number.isFinite(km) && km > 0 ? km : 0,
      retiredAt: typeof o.retiredAt === 'string' ? o.retiredAt : '',
      retireYear: Number.isFinite(retireYear) ? retireYear : 0,
      grade: (o.grade as RetiredShoeRecord['grade']) ?? 'standard',
      summary: (o.summary as RetiredShoeRecord['summary']) ?? undefined,
    });
  }
  return out;
}

/** 임의 파싱 객체 → 정규화된 ProgressionState. 어떤 입력에서도 안전. */
export function normalizeProgressionState(parsed: unknown): ProgressionState {
  const base = defaultProgressionState();
  if (!parsed || typeof parsed !== 'object') return base;
  const o = parsed as Record<string, unknown>;

  const earnedTitles = asEarnedTitles(o.earnedTitles);
  // equippedTitleKey 는 실제 보유 타이틀이어야 의미가 있다 — 무결성 유지.
  const equippedRaw =
    typeof o.equippedTitleKey === 'string' ? o.equippedTitleKey : null;
  const equippedTitleKey =
    equippedRaw && earnedTitles.some(t => t.key === equippedRaw)
      ? equippedRaw
      : null;

  const points = Number(o.points);

  return {
    earnedTitles,
    equippedTitleKey,
    seenUnlocks: asStringArray(o.seenUnlocks),
    retiredShoes: asRetiredShoes(o.retiredShoes),
    points: Number.isFinite(points) && points > 0 ? points : 0,
  };
}

/**
 * progression_v1 로드. 누락/손상/부분손상 모두 안전 기본값으로 복구한다. 절대 throw 금지.
 */
export async function loadProgression(): Promise<ProgressionState> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESSION_KEY);
    if (!raw) return defaultProgressionState();
    return normalizeProgressionState(JSON.parse(raw));
  } catch {
    // 손상 JSON·스토리지 오류 → 기본값. 화면을 깨지 않는다.
    return defaultProgressionState();
  }
}

/**
 * progression_v1 저장(1회 setItem). 직렬화/스토리지 실패는 삼킨다(throw 금지).
 * 저장 전 정규화해 잘못된 상태가 디스크에 남지 않게 한다.
 */
export async function saveProgression(state: ProgressionState): Promise<void> {
  try {
    const safe = normalizeProgressionState(state);
    await AsyncStorage.setItem(PROGRESSION_KEY, JSON.stringify(safe));
  } catch {
    // best-effort — 실패해도 앱 흐름을 막지 않는다.
  }
}
