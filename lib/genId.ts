// ============================================================================
// lib/genId.ts — 클라이언트 레코드 id 생성 seam (Phase 5b · Stage 1)
// ============================================================================
// 신발/런 레코드의 id 를 클라이언트가 결정하기 위한 단일 출처. Firestore 정본(Stage 2~)
// 에선 서버가 id 를 발급하지 않으므로 클라이언트가 안정적인 id 를 만들어야 한다.
//
// 형식: `${prefix}_${now}_${rand}` — now(epoch ms)로 대략 시간순 정렬 가능하고, base36
// 랜덤 접미사로 충돌을 막는다. 기존 런 localId(`'run_'+Date.now()+'_'+Math.random()
// .toString(36).slice(2,9)`)와 **바이트 동일** 형식이라, 런에 채택해도 동작·머지 키가 불변.
//
// now/rand 주입으로 결정적 단위테스트가 가능하다(순수 — I/O 없음).
// ============================================================================

/** 레코드 종류별 id 접두사(머지·키잉에서 종류 구분 + 가독성). */
export type IdPrefix = 'run' | 'shoe';

/**
 * 클라이언트 레코드 id 를 만든다. 기본은 현재 시각/Math.random — 테스트는 주입한다.
 * 랜덤 접미사는 기존 런 localId 와 동일하게 base36 소수부 7자(slice(2,9)).
 */
export function genClientId(
  prefix: IdPrefix,
  now: number = Date.now(),
  rand: () => number = Math.random,
): string {
  return `${prefix}_${now}_${rand().toString(36).slice(2, 9)}`;
}

/** 새 런 id(= 기존 localId 형식). */
export function genRunId(now?: number, rand?: () => number): string {
  return genClientId('run', now, rand);
}

/** 새 신발 id(Stage 2 에서 신발 생성이 Firestore 정본이 될 때 사용). */
export function genShoeId(now?: number, rand?: () => number): string {
  return genClientId('shoe', now, rand);
}
