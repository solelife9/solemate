package com.keego.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Keego"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      ReactActivityDelegateWrapper(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled))

  // ── Health Connect 권한 근거 화면 (2026-08-07) ────────────────────────────────
  // 매니페스트가 두 인텐트를 선언하고 있었다(안드로이드 13 이하의
  // ACTION_SHOW_PERMISSIONS_RATIONALE, 14+ 의 VIEW_PERMISSION_USAGE alias).
  // **그런데 받는 쪽이 없었다** — 시스템이 그 인텐트로 앱을 열면 그냥 홈 화면이 떴다.
  //
  // 사용자 입장에서는 헬스 커넥트 설정에서 "이 앱이 왜 내 심박을 읽는지" 보려고 눌렀는데
  // 러닝 앱 홈이 열리는 것이고, Play 의 건강 데이터 정책은 그 자리에서 **근거(처리방침)를
  // 보여줄 것**을 요구한다. 선언만 하고 응답하지 않는 상태는 심사에서 걸린다.
  //
  // 처리는 네이티브에서 끝낸다 — JS 라우팅(App.tsx 렌더 사다리)을 타면 부팅·로그인 게이트
  // 뒤에 도달하게 되고, 로그인하지 않은 사용자는 근거를 영영 못 본다. 근거는 **로그인과
  // 무관하게** 보여야 한다.
  //
  // URL 은 lib/legalLinks.ts 의 PRIVACY_URL 과 같은 값이다(공개 저장소 keego-legal 이 정본).
  // 회귀 가드: __tests__/androidManifestHygiene.test.ts
  private val privacyUrl = "https://solelife9.github.io/keego-legal/privacy.html"

  private fun isHealthRationale(intent: Intent?): Boolean {
    val action = intent?.action ?: return false
    return action == "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" ||
        action == "android.intent.action.VIEW_PERMISSION_USAGE"
  }

  /** 처리방침을 연다. 브라우저가 없는 기기에서도 앱이 죽지 않게 실패를 삼킨다. */
  private fun showPrivacyRationale() {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(privacyUrl)))
    } catch (_: Throwable) {
      // 열 수 없으면 아무것도 하지 않는다 — 앱은 평소대로 뜬다(근거를 못 보는 것이
      // 크래시보다 낫다).
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (isHealthRationale(intent)) showPrivacyRationale()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    // 앱이 이미 떠 있는 상태에서 헬스 커넥트가 부르는 경우.
    if (isHealthRationale(intent)) showPrivacyRationale()
  }
}
