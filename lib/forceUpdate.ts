// ============================================================================
// lib/forceUpdate.ts — 원격 최소 지원 버전 게이트 (AUDIT 2 I-3, B안)
// ----------------------------------------------------------------------------
// 왜 필요한가: 스토어에 나간 앱에 데이터 유실급 버그가 있다는 걸 발견해도, 지금까지
// 할 수 있는 일은 "수정 빌드를 올리고 심사(1~3일)를 기다린다 + 사용자가 스스로
// 업데이트하기를 기다린다"뿐이었다. 그 사이 버그 있는 앱이 계속 돌면서 계속 쓴다.
// 러닝 기록과 신발 데이터를 다루는 앱에서 이건 실질적 위험이다.
//
// **왜 Remote Config 가 아니라 Firestore 문서 한 개인가(B안):**
// 지금 필요한 건 "최소 버전 하나"뿐이고 그건 문서 한 줄로 충분하다. 네이티브 의존성을
// 늘리지 않고(사전 승인제 — CLAUDE.md Danger Zone) 출시 전에 넣을 수 있다. 나중에
// 기능 단위 토글까지 필요해지면 그때 Remote Config(A안)로 옮긴다.
//
// ── 설계에서 지킨 선: **fail-open(모르면 막지 않는다)** ─────────────────────
//
// 이 게이트가 잘못 켜지면 앱이 통째로 잠긴다 — 사용자가 할 수 있는 게 아무것도 없어진다.
// 그래서 판정이 흔들릴 수 있는 모든 지점에서 '막지 않는' 쪽을 고른다:
//
//   · 문서를 못 읽으면(오프라인·권한·미링크) → 막지 않는다
//   · minSupportedVersion 이 없거나 형식이 아니면 → 막지 않는다
//   · 버전 비교가 불가하면 → 막지 않는다
//   · **결과를 캐시하지 않는다** → 서버에서 값을 되돌리면 다음 실행에 바로 풀린다.
//     차단을 캐시하면 잘못된 값 하나로 오프라인 사용자가 영구히 잠기고, 그걸 푸는
//     방법이 '앱 삭제 후 재설치'밖에 없다. 그건 이 장치가 막으려던 사고보다 나쁘다.
//
// 오프라인 사용자를 못 막는 건 한계가 아니라 **의도**다. 어차피 그들은 데이터를 서버에
// 올리지도 못한다.
// ============================================================================

import {APP_VERSION, isBelowVersion} from './appVersion';

/** 원격 설정 문서 경로 — 컬렉션 `config`, 문서 `app`. */
export const CONFIG_COLLECTION = 'config';
export const CONFIG_DOC_ID = 'app';

/** 원격 설정(필요한 필드만). 없는 값은 전부 null 로 정규화한다. */
export interface RemoteAppConfig {
  /** 이 버전 **미만**이면 차단. 없으면 차단하지 않는다. */
  minSupportedVersion: string | null;
  /** 스토어 링크(플랫폼별). 없으면 화면이 버튼 대신 안내 문구만 보여준다. */
  storeUrlIos: string | null;
  storeUrlAndroid: string | null;
  /** 사용자에게 보여줄 한 줄(선택). 없으면 화면 기본 문구. */
  message: string | null;
}

const EMPTY: RemoteAppConfig = {
  minSupportedVersion: null,
  storeUrlIos: null,
  storeUrlAndroid: null,
  message: null,
};

/** 문자열이면 다듬어 반환, 아니면 null(빈 문자열도 null). */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** 임의 문서를 RemoteAppConfig 로 방어적으로 정규화. 절대 throw 하지 않는다. */
export function normalizeAppConfig(data: unknown): RemoteAppConfig {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return EMPTY;
  const o = data as Record<string, unknown>;
  return {
    minSupportedVersion: str(o.minSupportedVersion),
    storeUrlIos: str(o.storeUrlIos),
    storeUrlAndroid: str(o.storeUrlAndroid),
    message: str(o.message),
  };
}

/**
 * 이 버전을 막아야 하는가. **순수 함수** — 판정 근거를 전부 인자로 받는다.
 * 위 fail-open 원칙이 여기 한 줄로 모인다: 최소 버전이 없으면 false, 비교 불가도 false.
 */
export function shouldBlock(config: RemoteAppConfig | null, currentVersion: string): boolean {
  if (!config?.minSupportedVersion) return false;
  return isBelowVersion(currentVersion, config.minSupportedVersion);
}

/**
 * 원격 설정을 읽는다. **못 읽으면 null**(막지 않는다는 뜻).
 *
 * 동적 require 는 lib/raceStore·crashlytics 와 같은 규약이다 — 네이티브 모듈이 없는
 * 환경(테스트·구버전 빌드)에서 모듈 로드 자체가 throw 하는 것을 방어한다.
 */
export async function fetchAppConfig(): Promise<RemoteAppConfig | null> {
  try {
    const fs = require('@react-native-firebase/firestore');
    const {getFirestore, doc, getDoc} = fs;
    if (!getFirestore || !doc || !getDoc) return null;
    const snap = await getDoc(doc(getFirestore(), CONFIG_COLLECTION, CONFIG_DOC_ID));
    if (!snap?.exists?.()) return null;
    return normalizeAppConfig(snap.data());
  } catch {
    return null; // 오프라인·권한·미링크 — 막지 않는다
  }
}

/**
 * 지금 앱을 막아야 하면 그 설정을, 아니면 null 을 돌려준다.
 * 화면(App.tsx)은 이 반환값이 truthy 일 때만 업데이트 게이트를 띄운다.
 */
export async function checkForceUpdate(
  currentVersion: string = APP_VERSION,
): Promise<RemoteAppConfig | null> {
  const config = await fetchAppConfig();
  return shouldBlock(config, currentVersion) ? config : null;
}
