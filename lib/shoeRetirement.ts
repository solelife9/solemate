// ============================================================================
// lib/shoeRetirement.ts — 은퇴 기록을 신발에 붙인다 (2026-08-01, 결정 A)
// ----------------------------------------------------------------------------
// 무엇이 문제였나: 은퇴한 신발을 **두 곳이 설명**하고 있었다.
//   · `shoes/{id}.retired = true`            — 신발이 은퇴했다는 사실
//   · `progression.retiredShoes[{shoeId,…}]` — 그 신발의 은퇴 당시 스냅샷(km·등급·날짜)
// 같은 대상을 가리키는 진실이 서로 다른 문서에 살았다. 명예의 전당이 어느 쪽을 봐야
// 하는지 늘 헷갈렸고, 한쪽만 지워지는 경로가 생기면 조용히 어긋난다.
//
// 그래서 **은퇴 스냅샷을 신발 문서 안으로 옮긴다.** 명예의 전당 = `retirement` 이 있는 신발.
// 중복이 사라지고, 신발이 문서 단위로 쪼개지는 이번 재설계에 그대로 얹힌다 —
// 나중에 "이것도 분리해야 하네"가 남지 않는다.
//
// ── 결정 A(2026-08-01 민우님): 신발을 삭제하면 명예의 전당에서도 사라진다 ────
// 예전에는 신발을 지워도 progression 에 은퇴 기록이 남아 명예의 전당에 계속 떴다.
// 은퇴시킨 신발을 굳이 또 지우는 건 "완전히 없애고 싶다"는 뜻이고, 그런데도 남아 있으면
// 그게 버그로 보인다. 의미를 일관되게 맞춘다.
//
// 순수 함수만 둔다 — I/O 없음, 입력 불변, throw 없음.
// ============================================================================

import type {RetiredShoeRecord} from './progression/types';

/** 신발 문서에 붙는 은퇴 스냅샷. `shoeId` 는 신발 자신이므로 담지 않는다(중복 제거). */
export type ShoeRetirement = Omit<RetiredShoeRecord, 'shoeId'>;

/** 은퇴 스냅샷을 가진 신발(구조적 타입 — 화면/스토어 어느 모양이든 받는다). */
export interface RetirableShoe {
  id?: string | number;
  name?: string;
  retired?: boolean;
  retirement?: ShoeRetirement | null;
  deleted?: boolean;
  [k: string]: unknown;
}

/** 값이 은퇴 스냅샷으로 쓸 만한가(최소 필드가 있는가). */
export function isValidRetirement(v: unknown): v is ShoeRetirement {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  const km = typeof r.km === 'number' ? r.km : Number(r.km);
  return Number.isFinite(km) && km >= 0 && typeof r.retiredAt === 'string' && !!r.retiredAt;
}

/** 레코드에서 신발에 붙일 부분만 뽑는다(shoeId 제거). */
export function toShoeRetirement(record: RetiredShoeRecord): ShoeRetirement {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'shoeId') continue; // 신발 자신이 id — 담으면 중복이다
    if (v !== undefined) rest[k] = v; // Firestore 는 undefined 를 거부한다
  }
  return rest as ShoeRetirement;
}

/**
 * 한 신발의 은퇴 스냅샷을 설정한다(upsert). 신발당 하나만 유지한다 —
 * 보관 복원 후 재은퇴하면 최신 km·등급으로 **교체**된다(낡은 레코드가 남지 않게).
 * 대상이 없으면 원본 배열을 그대로 돌려준다(참조 동일 = 불필요한 재렌더 없음).
 */
export function setShoeRetirement<T extends RetirableShoe>(
  shoes: readonly T[],
  record: RetiredShoeRecord,
): T[] {
  const id = String(record?.shoeId ?? '');
  if (!id) return shoes as T[];
  let hit = false;
  const next = shoes.map(s => {
    if (String(s?.id ?? '') !== id) return s;
    hit = true;
    return {...s, retired: true, retirement: toShoeRetirement(record)};
  });
  return hit ? next : (shoes as T[]);
}

/**
 * 신발에서 은퇴 기록 목록을 만든다 — **명예의 전당의 유일한 출처**.
 *
 * 묘비(삭제된 신발)는 제외한다: 결정 A 에 따라 삭제하면 명예의 전당에서도 사라진다.
 * 소비 화면(HallOfShoes)의 입력 타입은 그대로라 화면 코드는 바뀌지 않는다.
 */
export function retirementRecordsFromShoes<T extends RetirableShoe>(
  shoes: readonly T[],
): RetiredShoeRecord[] {
  const out: RetiredShoeRecord[] = [];
  if (!Array.isArray(shoes)) return out;
  for (const s of shoes) {
    if (!s || s.deleted === true) continue; // 삭제된 신발은 제외(결정 A)
    const id = String(s.id ?? '');
    if (!id) continue;
    if (!isValidRetirement(s.retirement)) continue;
    const snap = s.retirement as ShoeRetirement;
    // 이름은 **신발의 현재 이름**을 우선한다 — 은퇴 후 이름을 고쳤다면 그게 맞다.
    // 스냅샷에 이름이 있으면(옛 이관 데이터) 폴백으로 쓴다.
    const name = String(s.name ?? snap.name ?? '');
    out.push({...snap, shoeId: id, name});
  }
  return out;
}

/**
 * 옛 저장 위치(`progression.retiredShoes`)의 기록을 신발에 붙인다 — **1회성 이관**.
 *
 * 규약:
 *  · **덮어쓰지 않는다.** 신발에 이미 은퇴 스냅샷이 있으면 그쪽이 최신이므로 건드리지 않는다
 *  · 짝이 없는 기록(신발이 이미 삭제됨)은 **버린다** — 결정 A 와 같은 의미다
 *  · 바뀐 게 없으면 원본 배열을 그대로 돌려준다(참조 동일)
 *
 * 이관이 끝났는지는 `migrated` 로 알 수 있고, 호출부가 그때만 상태를 갱신한다.
 */
export function migrateRetiredShoes<T extends RetirableShoe>(
  shoes: readonly T[],
  legacyRecords: readonly RetiredShoeRecord[] | undefined | null,
): {shoes: T[]; migrated: number; orphaned: number} {
  if (!Array.isArray(shoes) || !Array.isArray(legacyRecords) || legacyRecords.length === 0) {
    return {shoes: shoes as T[], migrated: 0, orphaned: 0};
  }
  const byId = new Map<string, RetiredShoeRecord>();
  for (const r of legacyRecords) {
    const id = String(r?.shoeId ?? '');
    if (id) byId.set(id, r); // 같은 신발이 여러 번이면 뒤엣것(최신)
  }

  let migrated = 0;
  const next = shoes.map(s => {
    const id = String(s?.id ?? '');
    const rec = id ? byId.get(id) : undefined;
    if (!rec) return s;
    byId.delete(id); // 짝을 찾았다
    if (isValidRetirement(s.retirement)) return s; // 이미 있다 — 덮지 않는다
    migrated++;
    return {...s, retired: true, retirement: toShoeRetirement(rec)};
  });

  return {shoes: migrated ? next : (shoes as T[]), migrated, orphaned: byId.size};
}
