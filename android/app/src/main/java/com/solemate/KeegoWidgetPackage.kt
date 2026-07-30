package com.solemate

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
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(KeegoWidgetModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
