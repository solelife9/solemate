package com.solemate

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

/**
 * KeegoWidgetModule — 홈 화면 위젯(활성 신발 수명 링)에 표시할 데이터를 저장하고 갱신을 건다.
 *
 * iOS 대응물은 WatchSessionModule.updateWidgetShoe 다(App Group UserDefaults + WidgetCenter).
 * 안드로이드는 App Group 개념이 없으므로 **같은 앱의 SharedPreferences** 를 쓴다 — 위젯
 * 프로바이더가 같은 프로세스/패키지라 별도 공유 설정이 필요 없다.
 *
 * 키 이름은 iOS 계약(widget_shoe_*)을 그대로 따른다. 두 플랫폼이 다른 이름을 쓰면 나중에
 * 한쪽만 고치는 표류가 생긴다.
 *
 * 원칙: **위젯 갱신 실패가 앱을 깨면 안 된다.** 모든 경로에서 예외를 삼킨다(JS 쪽
 * lib/homeWidget 과 같은 규약).
 */
class KeegoWidgetModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "KeegoWidgetModule"

    @ReactMethod
    fun updateShoe(shoe: ReadableMap) {
        try {
            val ctx = reactApplicationContext ?: return
            val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(K_NAME, shoe.optString("name"))
                .putString(K_BRAND, shoe.optString("brand"))
                .putString(K_CATEGORY, shoe.optString("category"))
                .putInt(K_USED, shoe.optInt("usedKm"))
                .putInt(K_MAX, shoe.optInt("maxKm"))
                .apply()
            notifyWidgets(ctx)
        } catch (_: Throwable) {
            // 부가 표시 기능 — 실패해도 앱 흐름을 막지 않는다.
        }
    }

    private fun notifyWidgets(ctx: Context) {
        try {
            val mgr = AppWidgetManager.getInstance(ctx) ?: return
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, ShoeWidgetProvider::class.java))
            if (ids == null || ids.isEmpty()) return // 위젯을 안 놓았으면 할 일 없음
            ShoeWidgetProvider.renderAll(ctx, mgr, ids)
        } catch (_: Throwable) {
            // 위젯 미배치·매니저 부재 — 무시
        }
    }

    companion object {
        const val PREFS = "keego_widget"
        // ⚠️ iOS(RunActivityBundle.KeegoWidgetShared)와 **같은 키 이름**을 쓴다.
        const val K_NAME = "widget_shoe_name"
        const val K_BRAND = "widget_shoe_brand"
        const val K_CATEGORY = "widget_shoe_category"
        const val K_USED = "widget_shoe_used_km"
        const val K_MAX = "widget_shoe_max_km"
    }
}

/** ReadableMap 안전 접근 — 키 부재/타입 불일치에서 던지지 않는다. */
private fun ReadableMap.optString(key: String): String =
    try {
        if (hasKey(key)) getString(key) ?: "" else ""
    } catch (_: Throwable) {
        ""
    }

private fun ReadableMap.optInt(key: String): Int =
    try {
        if (hasKey(key)) getInt(key).coerceAtLeast(0) else 0
    } catch (_: Throwable) {
        0
    }
