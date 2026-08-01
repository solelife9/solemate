// ============================================================================
// lib/clockOffset.ts — 기기 시계와 서버 시계의 차이 보정 (AUDIT 3 D-2)
// ----------------------------------------------------------------------------
// 문제: 병합의 '최신 우선'이 `Date.now()` — 즉 **그 기기의 시계**를 기준으로 판정한다.
// 두 기기의 시계가 어긋나면(자동 설정을 끈 기기, 시간대 이동 직후, 방전 후 부팅)
// **시계가 빠른 기기가 항상 이긴다.** 폰 시계가 10분 빠르면 워치에서 방금 한 편집이
// 10분 전 것으로 보여 더 오래된 값에 밀려 사라진다.
//
// 이 앱은 폰과 애플워치가 같은 기록을 쓴다 — 두 시계가 정확히 같을 이유가 없다.
//
// ── 왜 serverTimestamp() 를 직접 안 쓰나 ────────────────────────────────────
// 레코드가 **문서 본문의 배열 원소**라서다. Firestore 의 serverTimestamp() 센티널은
// 배열 안에서는 동작하지 않는다. 제대로 하려면 레코드를 하위 문서로 쪼개야 하는데
// 그건 저장 구조 변경이다(리더보드 재설계처럼 큰 작업과 함께 가야 한다).
//
// ── 그래서 offset 으로 흡수한다 ─────────────────────────────────────────────
// 동기할 때 백업 문서에 **이 기기가 쓴 시각 두 개**를 남긴다:
//     clock: { <deviceId>: { c: <기기 시각>, s: <serverTimestamp()> } }
// 다음 동기에서 그 둘을 읽어 차(offset = s - c)를 구한다. **자기가 쓴 값끼리** 비교하므로
// 다른 기기의 시계가 섞이지 않는다. 이후 모든 스탬프가 `Date.now() + offset` 을 쓴다.
//
// 안전 장치:
//   · offset 은 상한을 둔다(±1일). 그보다 큰 차이는 계산 오류로 보고 무시한다 —
//     엉뚱한 값이 들어오면 모든 기록의 시각이 망가져 병합이 통째로 뒤집힌다.
//   · 읽기·쓰기 실패는 전부 삼킨다. offset 이 없으면 예전과 똑같이 동작할 뿐이다(0).
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

/** offset 영속 키(ms). */
export const CLOCK_OFFSET_KEY = 'clock_offset_ms_v1';

/**
 * 허용하는 offset 절대값 상한(ms) — 24시간.
 * 이보다 큰 값은 채택하지 않는다. 시계가 하루 넘게 틀린 기기보다, 잘못 계산된 offset 이
 * 모든 스탬프를 오염시키는 쪽이 훨씬 위험하다(모르면 보정하지 않는 게 안전하다).
 */
export const MAX_CLOCK_OFFSET_MS = 24 * 60 * 60 * 1000;

/** 메모리 캐시 — 스탬프는 아주 자주 일어나므로 매번 저장소를 읽을 수 없다. */
let offsetMs = 0;

/** 테스트 전용 — 메모리 offset 초기화. */
export function __resetClockOffsetForTests(): void {
  offsetMs = 0;
}

/** 지금 적용 중인 offset(ms). 관측·테스트용. */
export function currentOffsetMs(): number {
  return offsetMs;
}

/**
 * 관측한 (서버 시각, 그때 기기 시각) 쌍에서 offset 을 계산한다(순수).
 * 채택 불가면 null — 호출부는 기존 offset 을 유지한다.
 */
export function computeOffset(serverMs: unknown, clientMs: unknown): number | null {
  const s = typeof serverMs === 'number' ? serverMs : Number(serverMs);
  const c = typeof clientMs === 'number' ? clientMs : Number(clientMs);
  if (!Number.isFinite(s) || !Number.isFinite(c) || s <= 0 || c <= 0) return null;
  const off = s - c;
  if (!Number.isFinite(off) || Math.abs(off) > MAX_CLOCK_OFFSET_MS) return null;
  return off;
}

/** 부팅 시 저장된 offset 을 메모리로 올린다. 실패는 삼킨다(보정 없음 = 예전 동작). */
export async function loadClockOffset(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CLOCK_OFFSET_KEY);
    const v = Number(raw);
    if (Number.isFinite(v) && Math.abs(v) <= MAX_CLOCK_OFFSET_MS) offsetMs = v;
  } catch {
    /* 보정 없이 간다 */
  }
}

/**
 * 서버/기기 시각 쌍을 관측해 offset 을 갱신·영속한다. 채택 못 하면 아무 일도 하지 않는다.
 * 절대 throw 하지 않는다.
 */
export async function observeServerClock(serverMs: unknown, clientMs: unknown): Promise<void> {
  const off = computeOffset(serverMs, clientMs);
  if (off === null) return;
  offsetMs = off;
  try {
    await AsyncStorage.setItem(CLOCK_OFFSET_KEY, String(off));
  } catch {
    /* 메모리 값은 이미 갱신됐다 — 다음 기회에 영속 */
  }
}

/**
 * **보정된 현재 시각(ms).** 레코드 스탬프·묘비·설정 수정 시각은 전부 이걸 써야 한다.
 * offset 이 없으면 `Date.now()` 와 같다.
 */
export function nowMs(): number {
  return Date.now() + offsetMs;
}
