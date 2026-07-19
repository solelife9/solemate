internal import Expo
import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore
import kakao_login
import NaverThirdPartyLogin

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // @react-native-firebase: 네이티브 Firebase 기본 앱 초기화. 이 호출이 없으면
    // JS 에서 "No Firebase App '[DEFAULT]' has been created" 런타임 에러가 난다.
    FirebaseApp.configure()

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "Keego",
      in: window,
      launchOptions: launchOptions
    )

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // 카카오 로그인 콜백(카카오톡 → 앱 복귀 kakao<앱키>://) 처리. 이게 없으면 실기기에서
  // 카카오톡으로 로그인 후 앱으로 못 돌아온다(SdkError). 그 외 URL(google 등)은 super 로
  // 위임해 기존 딥링크 동작을 보존한다. (kakao-login Expo 플러그인이 넣어야 할 핸들러를 수동 추가)
  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    if RNKakaoLogins.isKakaoTalkLoginUrl(url) {
      // handleOpenUrl 은 Swift ObjC 임포터가 handleOpen(_:) 으로 개명함(URL 인자와 겹치는
      // 'Url' 접미사 제거 규칙) — 같은 셀렉터(handleOpenUrl:)라 동작 동일.
      return RNKakaoLogins.handleOpen(url)
    }
    // 홈/잠금화면 위젯 딥링크(keego://start) — RN Linking 으로 라우팅해 JS(App.tsx)가
    // 활성 신발로 러닝 시작. 네이버 콜백보다 먼저 가로채야 한다(네이버가 keego:// 전부를
    // 삼키므로). host=start 만 위젯 링크, 그 외 keego:// 는 아래 네이버 SDK 로.
    if url.scheme == "keego" && url.host == "start" {
      return RCTLinkingManager.application(app, open: url, options: options)
    }
    // 네이버 로그인 콜백(keego://) — 네이버 앱/웹 로그인 후 복귀를 SDK 로 처리.
    if url.scheme == "keego" {
      return NaverThirdPartyLoginConnection.getSharedInstance().application(app, open: url, options: options)
    }
    return super.application(app, open: url, options: options)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
