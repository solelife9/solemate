// ─── appCheck — @react-native-firebase/app-check 얇은 격리 래퍼 ───────────────
// 왜 필요한가(2026-07-26 출시 심사 B-07): Firebase 설정값은 앱 바이너리에서 추출된다
// (공개 전제). App Check 가 없으면 누구든 무한히 익명 계정을 만들어 Firestore 를 두드릴 수
// 있고, Blaze 요금제에서 그것은 곧 청구서이자 정상 사용자의 쿼터 소진이다. App Check 는
// "이 요청이 진짜 우리 앱에서 왔는가"를 Apple App Attest / Play Integrity 로 증명한다.
// 사용자 수가 0인 지금 켜는 것이 가장 싸다(구버전 앱을 잠글 위험이 없다).
//
// 원칙:
//   · **다른 Firebase 사용보다 먼저** 활성화해야 이후 요청에 토큰이 붙는다(부팅 최상단).
//   · 실패해도 앱을 막지 않는다 — App Check 초기화 실패로 러닝이 안 되면 본말전도다.
//   · 개발 빌드는 debug provider — 시뮬레이터에서는 App Attest 가 불가능하다.
//
// 콘솔 쪽 준비(코드로 못 하는 것):
//   1) Firebase 콘솔 → App Check → iOS 앱에 **App Attest** 등록
//   2) 개발 기기/시뮬레이터 로그의 디버그 토큰을 콘솔에 등록
//   3) 지표에서 미검증 요청이 0 에 수렴한 뒤 Firestore/Auth **적용(enforce)** 토글
//      (먼저 켜면 아직 업데이트하지 않은 사용자가 잠긴다)
//
// jest.setup.js 가 모듈을 목 처리하므로 테스트는 실 네이티브 없이 green 이다.

// 동적 require: 네이티브 모듈이 없는 환경(테스트·구버전 빌드)에서 모듈 로드 자체가
// throw 하는 케이스를 방어한다(lib/crashlytics 와 동일 규약).
let mod: any = null;
try {
  mod = require('@react-native-firebase/app-check');
} catch {
  mod = null;
}

let activated = false;

/** 테스트 전용 — 활성화 1회 가드를 되돌린다. */
export function __resetAppCheckForTests(): void {
  activated = false;
}

/** 이미 활성화됐는지(중복 호출 방지 관측용). */
export function isAppCheckActivated(): boolean {
  return activated;
}

/**
 * App Check 활성화. 부팅 시 **가장 먼저** 한 번 호출한다(중복 호출은 무시).
 * 성공 여부를 돌려주되 절대 throw 하지 않는다 — 관측·보안 코드가 앱을 죽이면 안 된다.
 *
 * @param isDebug 개발 빌드 여부(__DEV__). true 면 debug provider 를 쓴다.
 */
export async function activateAppCheck(isDebug: boolean): Promise<boolean> {
  if (activated) return true;
  try {
    if (!mod || typeof mod.initializeAppCheck !== 'function') return false;
    const Provider = mod.ReactNativeFirebaseAppCheckProvider;
    if (typeof Provider !== 'function') return false;

    const provider = new Provider();
    provider.configure({
      // App Attest(iOS 14+). 미지원 기기는 DeviceCheck 로 자동 폴백한다.
      apple: {provider: isDebug ? 'debug' : 'appAttestWithDeviceCheckFallback'},
      // Android 출시 트랙이 열릴 때 Play Integrity 로 동작한다(코드는 미리 정합).
      android: {provider: isDebug ? 'debug' : 'playIntegrity'},
    });

    await mod.initializeAppCheck(undefined, {
      provider,
      // 토큰 자동 갱신 — 러닝 중 만료로 동기화가 끊기지 않게.
      isTokenAutoRefreshEnabled: true,
    });
    activated = true;
    return true;
  } catch {
    // 초기화 실패는 조용히 넘긴다 — 앱 기능(러닝·저장)은 계속돼야 한다.
    // 콘솔에서 enforce 를 켜기 전이므로 서버도 요청을 계속 받는다.
    return false;
  }
}
