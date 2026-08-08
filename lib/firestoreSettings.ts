// ============================================================================
// lib/firestoreSettings.ts — Firestore 오프라인 영속을 **명시적으로** 켠다
// ============================================================================
// **왜 있는가(감사 D-6).** 이 앱은 로컬-퍼스트다 — 러닝을 저장하면 먼저 기기에 쓰고,
// 클라우드로는 나중에 올라간다. 그 '나중에'를 버텨 주는 것이 Firestore 네이티브 SDK 의
// **오프라인 영속**이다(끊긴 동안의 쓰기를 디스크 큐에 담아 두었다가 연결이 돌아오면 보낸다).
//
// 그런데 앱은 그걸 **한 번도 켠 적이 없다.** 켜져 있는 이유는 네이티브 SDK 의 기본값이
// ON 이기 때문이다. 지금 동작하니 문제가 없어 보이지만, 기대고 있는 것이 **우리 코드가
// 아니라 남의 기본값**이라 SDK 버전이 오르면 조용히 달라질 수 있다.
// 그때 증상은 "가끔 러닝이 클라우드에 없다" — 재현이 거의 불가능하고, 원인을 여기서
// 찾기까지 아주 오래 걸린다. 한 줄로 못 박을 수 있는 것을 운에 맡길 이유가 없다.
//
// ── 지키는 선 ────────────────────────────────────────────────────────────────
//  · **앱을 죽이지 않는다.** Firestore 가 이미 시작된 뒤에 settings() 를 부르면 네이티브가
//    던진다. 모든 경로에서 예외를 삼키고 결과를 값으로 답한다 — 영속 설정에 실패하는 것보다
//    앱이 부팅에 실패하는 게 훨씬 나쁘다(그리고 실패해도 기본값 ON 이라 동작은 같다).
//  · **첫 Firestore 사용보다 먼저 돌아야 한다.** 그래서 모듈 로드 시점에 한 번 실행하고,
//    App.tsx 가 **가장 먼저** import 한다(아래 '배선' 참조). 나중에 부르면 늦는다.
//  · 동작을 바꾸지 않는다 — 기본값과 **같은 값**을 명시할 뿐이다. 캐시 크기 같은 다른
//    설정은 건드리지 않는다(바꾸려면 근거가 따로 필요하다).
// ============================================================================
import {getFirestore} from '@react-native-firebase/firestore';

/** 이미 시도했는가(모듈 스코프 1회). 두 번 부르면 네이티브가 던진다. */
let attempted = false;

/** 마지막 시도 결과 — 진단·테스트용. null = 아직 시도 안 함. */
let applied: boolean | null = null;

/**
 * 오프라인 영속을 명시적으로 켠다. **여러 번 불러도 한 번만 실제로 적용한다.**
 *
 * @returns settings() 호출까지 도달했으면 true. 모듈 부재·예외면 false
 *          (그래도 네이티브 기본값이 ON 이라 앱은 그대로 동작한다).
 */
export function ensureFirestorePersistence(): boolean {
  if (attempted) return applied === true;
  attempted = true;
  try {
    const db = getFirestore() as unknown as {
      settings?: (s: Record<string, unknown>) => Promise<void>;
    };
    if (typeof db?.settings !== 'function') {
      applied = false;
      return false;
    }
    // 비동기지만 기다리지 않는다 — 부팅을 막지 않기 위해서다. 네이티브는 이 호출을
    // 첫 작업보다 먼저 접수하므로 await 하지 않아도 순서가 보장된다.
    void db.settings({persistence: true}).catch(() => {
      /* 이미 시작된 뒤였거나 미지원 — 기본값(ON)으로 계속 간다 */
    });
    applied = true;
    return true;
  } catch {
    applied = false;
    return false;
  }
}

/** 테스트 격리용. 프로덕션 코드에서는 부르지 않는다. */
export function __resetFirestoreSettingsForTest(): void {
  attempted = false;
  applied = null;
}

// 모듈 로드 = 실행. App.tsx 가 이 모듈을 가장 먼저 import 하므로, 다른 어떤 모듈이
// Firestore 를 건드리기 전에 설정이 접수된다.
ensureFirestorePersistence();
