package com.keego.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * KeegoWidgetPackage — KeegoWidgetModule 을 RN 브리지에 등록한다.
 *
 * 자동 링크(autolinking)는 npm 패키지에만 적용되므로, 앱 내부에 직접 둔 네이티브 모듈은
 * MainApplication 의 패키지 목록에 손으로 넣어야 한다.
 */
class KeegoWidgetPackage : ReactPackage {
    // 앱 내부 네이티브 모듈은 전부 여기 모은다(패키지를 늘리면 MainApplication 도 같이
    // 늘어나고, 하나 빠뜨렸을 때 "모듈이 조용히 없는" 상태가 된다 — JS 파사드가 폴백을
    // 돌려주므로 티도 안 난다).
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(
            KeegoWidgetModule(reactContext),
            KeegoActivityRecognitionModule(reactContext),
            KeegoStepCounterModule(reactContext),
        )

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
