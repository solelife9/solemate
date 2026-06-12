// ============================================================================
// lib/progression/retirementStore.ts — 은퇴 레코드 영속 (Slice B)
// ============================================================================
// Hall of Shoes 레코드를 progression_v1.retiredShoes 에만 ADDITIVE 하게 덧붙인다.
// local-first: loadProgression → addRetiredShoeRecord(순수, shoeId 멱등) → saveProgression.
// 이미 같은 신발이 있으면(멱등) 저장을 건너뛴다. saveProgression 은 progression_v1 한
// 키만 쓰므로 run/shoe/기타 키는 절대 건드리지 않는다(iron law). 실패는 storage 가 삼킨다.
// ============================================================================
import {addRetiredShoeRecord} from './retirement';
import {loadProgression, saveProgression} from './storage';
import {ProgressionState, RetiredShoeRecord} from './types';

/**
 * 은퇴 레코드를 영속한다(ADDITIVE·멱등·키 격리). 갱신된 상태를 돌려준다.
 * 이미 존재(멱등)하거나 무효 레코드면 디스크에 다시 쓰지 않는다(불필요한 IO 회피).
 */
export async function persistRetiredShoe(
  record: RetiredShoeRecord,
): Promise<ProgressionState> {
  const state = await loadProgression();
  const next = addRetiredShoeRecord(state, record);
  if (next !== state) {
    // 실제 변경이 있을 때만 1회 저장(멱등 추가는 동일 참조를 돌려받아 건너뛴다).
    await saveProgression(next);
  }
  return next;
}
