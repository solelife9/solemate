/**
 * 안드로이드 매니페스트 위생 — **라이브러리가 끌고 들어온 권한**을 고정한다.
 *
 * 왜 별도 가드인가: 우리가 선언한 권한은 소스를 읽으면 보이지만, 라이브러리가 자기
 * 매니페스트에 넣어 둔 권한은 **머지된 뒤에야 나타난다.** 소스만 보면 없는 것처럼 보이고,
 * 사용자에게는 스토어의 '권한' 목록으로 그대로 노출된다.
 *
 * 2026-08-07 실측(머지된 매니페스트)에서 **47개**가 나왔고 그중 23개가 이 부류였다:
 *   · 광고 식별자 3종 — Firebase Analytics 기본. **이 앱은 광고를 쓰지 않는다.**
 *     남겨두면 Play 데이터 보안 폼에서 "광고 ID 수집"을 답해야 하고, 처리방침에 없는
 *     식별자가 앱에 붙은 상태가 된다. 고지를 늘리는 대신 **수집을 끊는 쪽**을 골랐다.
 *   · 런처 배지 권한 20종 — 알림 라이브러리(ShortcutBadger 계열). 배지 호출부는 **0건**이다.
 *     남겨두면 러닝 앱이 "바로가기 설치·런처 설정 변경"을 요구하는 것처럼 보인다.
 * 제거 후 **26개**. 기능 권한은 하나도 안 줄었다.
 *
 * 이 가드는 `ACCESS_BACKGROUND_LOCATION` 가드와 **같은 방향**이다 — "있어야 한다"가 아니라
 * **"다시 들어오면 안 된다"**. 라이브러리를 올릴 때마다 조용히 되살아나는 종류라 못 박는다.
 * @format
 */
import {readFileSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');
const ANDROID_MANIFEST = join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const manifest = readFileSync(ANDROID_MANIFEST, 'utf8');

/** 그 권한이 **제거 선언**돼 있는가(`tools:node="remove"`). */
function removed(permission: string): boolean {
  const re = new RegExp(
    `<uses-permission[^>]*android:name="${permission.replace(/\./g, '\\.')}"[^>]*tools:node="remove"`,
  );
  return re.test(manifest);
}

describe('안드로이드 매니페스트 — 라이브러리가 끌고 온 권한', () => {
  it('tools 네임스페이스가 선언돼 있다 — 없으면 remove 가 조용히 무시된다', () => {
    expect(manifest).toContain('xmlns:tools="http://schemas.android.com/tools"');
  });

  // 광고를 쓰지 않는 앱이 광고 식별자를 받을 이유가 없다.
  // iOS 도 IDFA 미사용이다(PrivacyInfo.xcprivacy NSPrivacyTracking=false) — 플랫폼을 맞춘다.
  it('광고 식별자 권한 3종을 제거한다 — 이 앱은 광고를 쓰지 않는다', () => {
    for (const p of [
      'com.google.android.gms.permission.AD_ID',
      'android.permission.ACCESS_ADSERVICES_AD_ID',
      'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
    ]) {
      expect(removed(p)).toBe(true);
    }
  });

  // 배지를 쓰게 되면 이 가드를 고치고 처리방침·데이터 보안 폼도 함께 고쳐야 한다.
  // 그 연결을 잊지 않도록 가드가 먼저 빨개지게 둔다.
  it('런처 배지 권한을 제거한다 — 배지 호출부가 0건이다', () => {
    for (const p of [
      'android.permission.READ_APP_BADGE',
      'com.android.launcher.permission.INSTALL_SHORTCUT',
      'com.android.launcher.permission.UNINSTALL_SHORTCUT',
      'com.android.launcher.permission.READ_SETTINGS',
      'com.android.launcher.permission.WRITE_SETTINGS',
      'com.sec.android.provider.badge.permission.READ',
      'com.sec.android.provider.badge.permission.WRITE',
      'com.huawei.android.launcher.permission.CHANGE_BADGE',
      'com.oppo.launcher.permission.READ_SETTINGS',
      'me.everything.badger.permission.BADGE_COUNT_READ',
    ]) {
      expect(removed(p)).toBe(true);
    }
  });

  // 위 제거의 전제 — 앱이 실제로 배지를 안 쓴다. 쓰기 시작하면 이 검사가 먼저 걸린다.
  it('앱이 배지를 설정하지 않는다 — 제거의 전제', () => {
    const sources = [
      join(ROOT, 'lib', 'localReminder.ts'),
      join(ROOT, 'lib', 'notifications.ts'),
      join(ROOT, 'lib', 'pushMessaging.ts'),
    ];
    for (const f of sources) {
      let src = '';
      try { src = readFileSync(f, 'utf8'); } catch { continue; }
      expect(src).not.toContain('setBadgeCount');
    }
  });

  // 기능 권한까지 같이 날아가면 화면off 러닝·심박이 죽는다. 제거가 과했는지 본다.
  it('기능 권한은 그대로 남아 있다 — 제거가 과하지 않았다', () => {
    for (const p of [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.ACTIVITY_RECOGNITION',
      'android.permission.health.READ_HEART_RATE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
    ]) {
      // 제거 선언이 아니라 **일반 선언**으로 존재해야 한다.
      expect(manifest).toContain(`android:name="${p}"`);
      expect(removed(p)).toBe(false);
    }
  });
});
