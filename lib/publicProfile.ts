// ============================================================================
// lib/publicProfile.ts — 공개 프로필 미러 (설계: docs/design/2026-08-01-cloud-data-model.md §3.35)
// ----------------------------------------------------------------------------
// keego 소셜의 첫 조각 — 「이 사람은 무슨 러닝화 신나」.
// 스트라바 피드를 복제하는 게 아니라 **신발 중심**이다. 남들이 뭘 신고 얼마나 달렸는지가
// 보이는 것, 그건 경쟁 앱에 없고 MISSION.md 의 shoe-first 정체성 그대로다.
//
// ── 이 파일이 존재하는 진짜 이유: 개인정보를 새지 않게 하는 것 ────────────────
// keego 는 이 실수를 이미 한 번 했다 — 동의도, 화면도 없는데 닉네임과 월간 운동량이
// 전원 읽기 가능한 컬렉션에 쌓이고 있었다(`767032e`, AUDIT 1). 그래서 이번엔 **구조로**
// 막는다:
//
//   1) **화이트리스트로만 만든다.** 스프레드(`...`)를 절대 쓰지 않는다. 담을 필드를
//      한 줄씩 손으로 적는다. 그래야 개인 저장소에 새 필드가 생겨도 **저절로 새지 않는다.**
//   2) **동의가 없으면 아무것도 만들지 않는다.** 미결정('unset')은 비공개와 같다 —
//      "아직 안 물어봤다"가 "공개해도 된다"가 되면 안 된다.
//   3) **경로·체중·나이·성별·안정시심박·메모는 절대 담지 않는다.** 러닝 경로는 집 주소다.
//
// 순수 함수만 둔다 — I/O 없음, 입력 불변, throw 없음.
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import {shoeHealth} from './shoe';
import {retirementRecordsFromShoes} from './shoeRetirement';

/** 공개 범위. `unset` = 아직 안 물어봤다(= 공개하지 않는다). */
export type ProfileVisibility = 'unset' | 'public' | 'private';

/** 공개 컬렉션 이름. */
export const PROFILES_COLLECTION = 'profiles';

/** 프로필에 싣는 현역 신발 최대 수 — 미러를 작게 유지한다(로테이션이 그보다 많을 일은 드물다). */
export const MAX_ACTIVE_SHOES = 6;
/** 명예의 전당 최대 수 — 최근 은퇴 순. */
export const MAX_HALL_OF_FAME = 12;

/** 공개 프로필에 실리는 신발 한 켤레(스펙은 담지 않는다 — 아래 주석 참조). */
export interface PublicShoe {
  /** 카탈로그 조회 키. 보는 사람 앱이 이걸로 스펙·이미지를 붙인다. */
  brand: string;
  model: string;
  /** 표시용 전체 이름(카탈로그에 없는 신발도 이름은 보여야 한다). */
  name: string;
  usedKm: number;
  maxKm: number;
}

/** 명예의 전당 한 켤레. */
export interface PublicRetiredShoe {
  name: string;
  km: number;
  year: number;
  grade: string;
}

/** 남들이 읽는 공개 프로필. **이 타입에 없는 것은 절대 올라가지 않는다.** */
export interface PublicProfile {
  nickname: string;
  visibility: 'public';
  activeShoes: PublicShoe[];
  hallOfFame: PublicRetiredShoe[];
  stats: {totalKm: number; runCount: number; monthKm: number};
}

/** 안전한 숫자(소수 1자리) — NaN·Infinity·음수를 화면에 내보내지 않는다. */
function num1(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 10;
}

/** 'Nike Pegasus 41' → {brand:'Nike', model:'Pegasus 41'}. 공백이 없으면 전부 브랜드로. */
function splitName(name: string): {brand: string; model: string} {
  const s = String(name ?? '').trim();
  const i = s.indexOf(' ');
  return i > 0 ? {brand: s.slice(0, i), model: s.slice(i + 1)} : {brand: s, model: ''};
}

export interface ProfileInputShoe {
  id?: string | number;
  name?: string;
  max_km?: number;
  start_km?: number;
  retired?: boolean;
  deleted?: boolean;
  retirement?: unknown;
  [k: string]: unknown;
}

export interface ProfileInputRun {
  id?: string | number;
  shoe_id?: string | number;
  km?: number | string;
  run_date?: string;
  deleted?: boolean;
  [k: string]: unknown;
}

/** 살아 있는(삭제 안 된) 레코드만. */
const live = <T extends {deleted?: unknown}>(list: readonly T[]): T[] =>
  (Array.isArray(list) ? list : []).filter(r => r && r.deleted !== true);

/**
 * 공개 프로필을 만든다 — **화이트리스트로만**.
 *
 * `visibility` 가 'public' 이 아니면 **null** 을 돌려준다. 호출부는 null 이면 아무것도
 * 쓰지 않는다(미결정은 비공개와 같다).
 *
 * ⚠️ **여기에 스프레드를 쓰지 말 것.** 개인 저장소에 새 필드가 생겼을 때 저절로 새어
 * 나가는 사고를 구조로 막는 것이 이 함수의 존재 이유다.
 *
 * `monthKm` 은 `nowMs` 기준 그달 합계다(시계를 주입받아 결정적).
 */
export function buildPublicProfile(input: {
  visibility: ProfileVisibility;
  nickname: string;
  shoes: readonly ProfileInputShoe[];
  runs: readonly ProfileInputRun[];
  nowMs: number;
}): PublicProfile | null {
  if (input?.visibility !== 'public') return null;

  const shoes = live(input.shoes ?? []);
  const runs = live(input.runs ?? []);

  // 현역 신발 — 은퇴/보관 제외, 많이 신은 순.
  const activeShoes: PublicShoe[] = shoes
    .filter(s => !s.retired && !s.retirement)
    .map(s => {
      const {usedKm} = shoeHealth(s as never, runs as never);
      const name = String(s.name ?? '');
      const {brand, model} = splitName(name);
      return {
        brand,
        model,
        name,
        usedKm: num1(usedKm),
        maxKm: num1(s.max_km),
      };
    })
    .filter(s => !!s.name)
    .sort((a, b) => b.usedKm - a.usedKm)
    .slice(0, MAX_ACTIVE_SHOES);

  // 명예의 전당 — 은퇴 스냅샷이 있는 신발(신발 문서가 유일한 출처).
  const hallOfFame: PublicRetiredShoe[] = retirementRecordsFromShoes(shoes as never)
    .map(r => ({
      name: String(r.name ?? ''),
      km: num1(r.km),
      year: Number(r.retireYear) || 0,
      grade: String(r.grade ?? ''),
    }))
    .sort((a, b) => b.year - a.year || b.km - a.km)
    .slice(0, MAX_HALL_OF_FAME);

  // 통계 — 합계만. 개별 러닝은 담지 않는다(날짜·경로·메모가 새지 않게).
  const d = new Date(input.nowMs);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  let totalKm = 0;
  let monthKm = 0;
  for (const r of runs) {
    const km = typeof r.km === 'number' ? r.km : Number(r.km);
    if (!Number.isFinite(km) || km <= 0) continue;
    totalKm += km;
    if (String(r.run_date ?? '').startsWith(ym)) monthKm += km;
  }

  return {
    nickname: String(input.nickname ?? '').trim() || '러너',
    visibility: 'public',
    activeShoes,
    hallOfFame,
    stats: {totalKm: num1(totalKm), runCount: runs.length, monthKm: num1(monthKm)},
  };
}

/** 미러 내용이 바뀌었는가 — 안 바뀌었으면 쓰지 않는다(쓰기 비용 절감). */
export function profileSignature(p: PublicProfile | null): string {
  if (!p) return '';
  try {
    return JSON.stringify(p);
  } catch {
    return String(Math.random()); // 비교 불가 — 항상 쓴다(안전한 쪽)
  }
}

// ─── I/O (얇게) ───────────────────────────────────────────────────────────────

/** 공개 범위 설정 저장 키. 없으면 'unset' — 아직 안 물어봤다는 뜻이다. */
export const VISIBILITY_KEY = 'social_visibility_v1';
/** 마지막으로 올린 미러의 시그니처(안 바뀌었으면 안 쓴다). */
const PUBLISHED_SIG_KEY = 'social_published_sig_v1';

/** 저장된 공개 범위. 손상·부재는 'unset'(= 공개하지 않는다). */
export async function loadVisibility(): Promise<ProfileVisibility> {
  try {
    const v = await AsyncStorage.getItem(VISIBILITY_KEY);
    return v === 'public' || v === 'private' ? v : 'unset';
  } catch {
    return 'unset';
  }
}

/** 공개 범위를 저장한다. 실패는 삼킨다(다음에 다시 묻는다 — 안전한 쪽). */
export async function saveVisibility(v: ProfileVisibility): Promise<void> {
  try {
    await AsyncStorage.setItem(VISIBILITY_KEY, v);
  } catch {
    /* noop */
  }
}

/** 공개 프로필을 쓰고 지우는 최소 포트 계약. */
export interface ProfilePort {
  putPublicProfile?(profile: PublicProfile): Promise<void>;
  deletePublicProfile?(): Promise<void>;
}

/**
 * 공개 프로필을 발행한다(또는 공개 중단 시 내린다).
 *
 * · `visibility !== 'public'` → **문서를 지운다.** 비공개는 "안 쓰는 것"이 아니라
 *   "올라가 있던 것을 내리는 것"이어야 한다 — 안 그러면 껐는데도 남들에게 계속 보인다.
 * · 내용이 안 바뀌었으면 쓰지 않는다(동기마다 쓰면 낭비다).
 * 전 과정 no-throw — 소셜 발행이 실패해도 러닝 기록 동기는 멀쩡해야 한다.
 */
export async function publishProfile(
  port: ProfilePort,
  profile: PublicProfile | null,
): Promise<'published' | 'removed' | 'unchanged' | 'skipped'> {
  try {
    if (!profile) {
      if (!port?.deletePublicProfile) return 'skipped';
      const prev = await AsyncStorage.getItem(PUBLISHED_SIG_KEY);
      if (!prev) return 'unchanged'; // 올린 적이 없다 — 내릴 것도 없다
      await port.deletePublicProfile();
      await AsyncStorage.removeItem(PUBLISHED_SIG_KEY);
      return 'removed';
    }
    if (!port?.putPublicProfile) return 'skipped';
    const sig = profileSignature(profile);
    if ((await AsyncStorage.getItem(PUBLISHED_SIG_KEY)) === sig) return 'unchanged';
    await port.putPublicProfile(profile);
    await AsyncStorage.setItem(PUBLISHED_SIG_KEY, sig);
    return 'published';
  } catch {
    return 'skipped'; // 다음 동기에 다시 시도
  }
}

/** 테스트 전용 — 발행 시그니처 초기화. */
export async function __resetPublishForTests(): Promise<void> {
  try {
    await AsyncStorage.removeMany([PUBLISHED_SIG_KEY, VISIBILITY_KEY]);
  } catch {
    /* noop */
  }
}
