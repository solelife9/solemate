// ============================================================================
// lib/distanceRef.ts — 폰↔워치 거리 대조 기록 (사이드카)
// ============================================================================
// **왜 있는가(2026-08-09, 민우님 지적).** 폰+워치 동시 러닝에서 워치가 기록자가 되면
// 화면·저장 거리는 워치 값이다. 그런데 폰도 자기 거리를 계속 재고 있다
// (`runTracker.getPhoneDistanceKm`) — 그 값을 러닝이 끝나며 버리면
// **폰 GPS 가 얼마나 정확한지 영영 못 잰다.**
//
// 워치는 폰 정확도를 가리는 뚜껑이 아니라 **대조할 기준선**이어야 한다. 몇 번만 같이 뛰면
// "폰이 워치보다 N% 짧다"가 실측으로 나오고, 그게 GPS 계수를 고칠 유일한 근거다
// (2026-07-11 의 +9% 교정도 같은 방식으로 나왔다).
//
// ── 왜 런 레코드가 아니라 사이드카인가 ──────────────────────────────────────
// 이건 **진단 데이터**지 사용자 기록이 아니다. 동기 스키마(BackupPayload)에 필드를 더하면
// 머지·묘비·백업 크기까지 전부 딸려 온다. 트랙 랩 정보(`track_<id>`)가 이미 같은 이유로
// 사이드카다 — 같은 관례를 따른다.
// 대가: 기기에만 남는다(재설치·기기변경 시 사라진다). 진단용이라 그걸로 충분하다.
//
// 저장 실패는 삼킨다 — 진단 기록 때문에 러닝 저장이 막히면 안 된다.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

/** 한 러닝의 거리 대조 기록. */
export interface DistanceRef {
  /** 저장된 정본 거리(km) — 워치가 기록자였으면 워치 값. */
  savedKm: number;
  /** 폰이 스스로 잰 거리(km). */
  phoneKm: number;
  /** 그 러닝의 기록자. */
  source: 'watch' | 'phone';
}

const key = (runId: string) => `distref_${runId}`;

/**
 * 대조 기록을 남긴다. **워치가 기록자였을 때만** 의미가 있다 —
 * 폰 단독이면 두 값이 같아서 비교할 게 없다(저장하지 않는다).
 *
 * @returns 실제로 저장했으면 true.
 */
export async function saveDistanceRef(
  runId: string,
  ref: DistanceRef,
): Promise<boolean> {
  if (!runId) return false;
  if (ref.source !== 'watch') return false;          // 폰 단독 — 비교 대상 없음
  const saved = Number(ref.savedKm);
  const phone = Number(ref.phoneKm);
  // 둘 중 하나라도 못 믿을 값이면 남기지 않는다 — 틀린 기준선은 없는 것보다 나쁘다.
  if (!Number.isFinite(saved) || saved <= 0) return false;
  if (!Number.isFinite(phone) || phone <= 0) return false;
  try {
    await AsyncStorage.setItem(
      key(runId),
      JSON.stringify({savedKm: saved, phoneKm: phone, source: 'watch'}),
    );
    return true;
  } catch {
    return false; // 진단 기록 실패는 러닝 저장을 막지 않는다
  }
}

/** 대조 기록을 읽는다. 없거나 깨졌으면 null. */
export async function loadDistanceRef(runId: string): Promise<DistanceRef | null> {
  if (!runId) return null;
  try {
    const raw = await AsyncStorage.getItem(key(runId));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<DistanceRef>;
    const saved = Number(o?.savedKm);
    const phone = Number(o?.phoneKm);
    if (!Number.isFinite(saved) || saved <= 0) return null;
    if (!Number.isFinite(phone) || phone <= 0) return null;
    return {savedKm: saved, phoneKm: phone, source: 'watch'};
  } catch {
    return null;
  }
}

/**
 * 폰이 워치 대비 몇 % 어긋났는가. 음수 = 폰이 짧게 쟀다.
 * 기준은 **워치(저장된 정본)** 다 — 우리가 더 믿는 쪽을 100 으로 놓는다.
 */
export function phoneDeltaPct(ref: DistanceRef): number {
  if (!(ref.savedKm > 0)) return 0;
  return ((ref.phoneKm - ref.savedKm) / ref.savedKm) * 100;
}

/**
 * 화면에 쓸 한 줄. 예: `워치 5.36km · 폰 GPS 5.14km (−4.1%)`
 *
 * 사용자에게도 **정직한 정보**다 — 무엇이 쟀는지 알려주는 것은 나이키·가민도 한다
 * ("Recorded with"). 다만 차이가 무시할 수준이면 굳이 띄우지 않는다(절제).
 */
export function distanceRefLine(ref: DistanceRef | null): string | null {
  if (!ref) return null;
  const d = phoneDeltaPct(ref);
  if (Math.abs(d) < 1) return null; // 1% 미만은 잡음 — 보여줄 값어치가 없다
  const sign = d > 0 ? '+' : '−';
  return `워치 ${ref.savedKm.toFixed(2)}km · 폰 GPS ${ref.phoneKm.toFixed(2)}km (${sign}${Math.abs(d).toFixed(1)}%)`;
}
