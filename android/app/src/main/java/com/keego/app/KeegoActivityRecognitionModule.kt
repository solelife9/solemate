package com.keego.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity

/**
 * KeegoActivityRecognition — OS 활동 인식(차량 감지 1순위).
 *
 * **왜 OS 에게 묻나.** 지금 걷는지·뛰는지·차에 타고 있는지는 구글 Play 서비스가 이미
 * 판정하고 있다 — 가속도·자이로 패턴을 저전력으로 상시 분류한다. 나이키·스트라바가
 * 쓰는 표준이고, 우리가 만든 어떤 속도·걸음 규칙보다 정확하다(CLAUDE.md §구현 원칙).
 * JS 쪽 계약은 `lib/activityRecognition.ts`, 백스톱 휴리스틱은 `lib/vehicleDetect.ts`.
 *
 * **의존성을 새로 추가하지 않았다** — `play-services-location` 은 expo-location 이 이미
 * 끌고 와 있고(21.0.1), 권한 `ACTIVITY_RECOGNITION` 도 매니페스트에 이미 있었다.
 *
 * ── 설계에서 지킨 선 ────────────────────────────────────────────────────────
 *  · **앱을 죽이지 않는다.** 모든 경로에서 예외를 삼키고 실패는 값으로 답한다
 *    (KeegoWidgetModule 과 같은 규약). 활동 인식이 안 되는 것보다 앱이 죽는 게 나쁘다.
 *  · **가장 확률 높은 활동 하나만** 올려보낸다. JS 가 신뢰도로 다시 거른다.
 *  · **러닝이 끝나면 반드시 stop.** 구독을 켠 채 두면 배터리를 계속 먹는다.
 *  · 리시버는 **동적 등록**이다(매니페스트 아님) — 앱이 살아 있을 때만 받으면 되고,
 *    매니페스트에 두면 앱이 죽은 뒤에도 시스템이 깨운다.
 */
class KeegoActivityRecognitionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = NAME

    /** 마지막 분류 1건(동기 조회용). 리시버가 갱신한다. */
    @Volatile private var lastKind: String = "unknown"
    @Volatile private var lastConfidence: Int = 0

    private var receiver: BroadcastReceiver? = null
    private var pending: PendingIntent? = null

    private fun kindOf(type: Int): String = when (type) {
        DetectedActivity.IN_VEHICLE -> "in_vehicle"
        DetectedActivity.ON_BICYCLE -> "on_bicycle"
        DetectedActivity.RUNNING -> "running"
        DetectedActivity.WALKING, DetectedActivity.ON_FOOT -> "walking"
        DetectedActivity.STILL -> "still"
        else -> "unknown"
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        // Play 서비스가 없는 기기(중국 롬 등)에서도 앱은 돌아야 한다 — 없으면 false 를
        // 답하고 JS 가 백스톱으로 넘어간다.
        promise.resolve(
            try {
                com.google.android.gms.common.GoogleApiAvailability.getInstance()
                    .isGooglePlayServicesAvailable(reactApplicationContext) == 0
            } catch (_: Throwable) {
                false
            },
        )
    }

    /**
     * 권한 확인만 한다(요청은 JS 의 PermissionsAndroid 가 이미 러닝 시작 흐름에서 한다 —
     * 여기서 또 물으면 다이얼로그가 두 번 뜬다).
     */
    @ReactMethod
    fun requestPermission(promise: Promise) {
        promise.resolve(
            try {
                Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
                    reactApplicationContext.checkSelfPermission(
                        "android.permission.ACTIVITY_RECOGNITION",
                    ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            } catch (_: Throwable) {
                false
            },
        )
    }

    @ReactMethod
    fun start(promise: Promise) {
        try {
            if (receiver != null) { promise.resolve(true); return } // 중복 구독 방지
            val ctx: Context = reactApplicationContext
            val r = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, intent: Intent?) {
                    try {
                        if (intent == null || !ActivityRecognitionResult.hasResult(intent)) return
                        val best = ActivityRecognitionResult.extractResult(intent)
                            ?.mostProbableActivity ?: return
                        lastKind = kindOf(best.type)
                        lastConfidence = best.confidence
                    } catch (_: Throwable) {
                        /* 한 건 놓치는 게 크래시보다 낫다 */
                    }
                }
            }
            val filter = IntentFilter(ACTION)
            // Android 13+ 는 명시적 export 플래그를 요구한다. 우리 앱만 보내므로 NOT_EXPORTED.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                ctx.registerReceiver(r, filter)
            }
            receiver = r

            val pi = PendingIntent.getBroadcast(
                ctx, 0, Intent(ACTION).setPackage(ctx.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            pending = pi
            ActivityRecognition.getClient(ctx)
                .requestActivityUpdates(DETECT_INTERVAL_MS, pi)
                .addOnFailureListener { promise.resolve(false) }
                .addOnSuccessListener { promise.resolve(true) }
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            pending?.let { ActivityRecognition.getClient(reactApplicationContext).removeActivityUpdates(it) }
        } catch (_: Throwable) { /* 무시 */ }
        try {
            receiver?.let { reactApplicationContext.unregisterReceiver(it) }
        } catch (_: Throwable) { /* 이미 해제됐을 수 있다 */ }
        receiver = null
        pending = null
        lastKind = "unknown"
        lastConfidence = 0
        promise.resolve(null)
    }

    @ReactMethod
    fun current(promise: Promise) {
        try {
            if (receiver == null) { promise.resolve(null); return }
            val m = Arguments.createMap()
            m.putString("kind", lastKind)
            m.putInt("confidence", lastConfidence)
            promise.resolve(m)
        } catch (_: Throwable) {
            promise.resolve(null)
        }
    }

    companion object {
        const val NAME = "KeegoActivityRecognition"
        private const val ACTION = "com.keego.app.ACTIVITY_RECOGNITION"

        /**
         * 분류 요청 간격(ms). 러닝 중에만 켜므로 짧아도 되지만, 짧을수록 배터리를 먹는다.
         * 10초면 "차에 탔다"를 늦어도 수십 초 안에 알아채고(휴리스틱의 20~90초보다 빠르다)
         * 전력 부담도 작다.
         */
        private const val DETECT_INTERVAL_MS = 10_000L
    }
}
