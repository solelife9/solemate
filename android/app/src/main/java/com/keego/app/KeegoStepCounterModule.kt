package com.keego.app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * KeegoStepCounter — 러닝 중 걸음수를 **백그라운드에서도** 센다.
 *
 * 왜 만들었나 (2026-08-12 실기기)
 * ----------------------------------------------------------------------------
 * 민우님이 같은 러닝을 가민·갤럭시로 동시에 쟀는데 케이던스가 **가민 168 spm / keego 1 spm**
 * 이었다. 원인은 `expo-sensors` 다:
 *
 *   · `SensorProxy.onHostPause()` → `stopObserving()` — 앱이 백그라운드로 가면 **구독을 뗀다.**
 *   · `PedometerModule` 은 리스너가 다시 붙을 때마다 기준을 지운다
 *     (`listenerDecorator = { stepsAtTheBeginning = null }`).
 *
 * 즉 폰을 주머니에 넣고 달리면 이벤트가 아예 안 오고, 끝나고 화면을 켜는 순간 기준이
 * 옮겨져 **0 부터 다시** 센다. JS 에서 증분을 누적해도 못 고친다 — 받을 이벤트 자체가 없다.
 * 러닝 앱에서 '주머니에 넣고 달린다'는 예외가 아니라 **기본**이므로 이건 반드시 고쳐야 한다.
 *
 * ── 왜 이 방식인가 ──────────────────────────────────────────────────────────
 * `TYPE_STEP_COUNTER` 는 **부팅 이후 누적**을 돌려주는 하드웨어 카운터다(저전력 보조칩이
 * 센다). 우리가 직접 구독하면 expo 와 달리 **백그라운드에서 떼지 않으므로** 기준이 흔들릴
 * 일이 없고, 화면이 꺼져 있던 동안의 걸음도 누적에 그대로 들어 있다.
 *
 * 안드로이드 9+ 는 백그라운드 앱의 연속 센서를 제한하지만, 러닝 중에는
 * `foregroundServiceType="location"` 서비스가 돌고 있어(AndroidManifest·lib/locationService)
 * 그 제한에서 벗어난다. 러닝이 아닐 때는 애초에 구독하지 않는다.
 *
 * **새 의존성은 0** — `android.hardware.SensorManager` 는 안드로이드 표준이다.
 * 권한 `ACTIVITY_RECOGNITION` 은 이미 매니페스트에 있다(expo-sensors 가 쓰던 것과 같다).
 *
 * ── 설계에서 지킨 선 ────────────────────────────────────────────────────────
 *  · **앱을 죽이지 않는다.** 모든 경로에서 예외를 삼키고 실패는 값으로 답한다
 *    (KeegoActivityRecognitionModule 과 같은 규약).
 *  · **러닝이 끝나면 반드시 stop.** 구독을 켠 채 두면 배터리를 먹는다.
 *  · **모르면 -1.** 센서가 없거나 아직 첫 표본 전이면 0 이 아니라 -1 을 돌려준다 —
 *    0 은 "안 걸었다"는 주장이고, 모르는 것과 다르다(JS 파사드가 그걸 구분해 버린다).
 */
class KeegoStepCounterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = NAME

    private var manager: SensorManager? = null
    private var sensor: Sensor? = null
    private var listener: SensorEventListener? = null

    /** 이 러닝 시작 시점의 하드웨어 누적값. -1 = 아직 첫 표본이 안 왔다. */
    @Volatile private var baseline: Long = -1

    /** 가장 최근 하드웨어 누적값. -1 = 모름. */
    @Volatile private var latest: Long = -1

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(
            try {
                val sm = reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
                sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
            } catch (_: Throwable) {
                false
            },
        )
    }

    /**
     * 구독 시작. 이미 구독 중이면 **기준만 다시 잡는다**(새 러닝이 지난 걸음을 물려받지
     * 않게 — 워치 거리에서 겪은 것과 같은 종류의 사고를 막는다).
     */
    @ReactMethod
    fun start(promise: Promise) {
        try {
            baseline = -1
            latest = -1
            if (listener != null) { promise.resolve(true); return }
            val sm = reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            val s = sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
            if (sm == null || s == null) { promise.resolve(false); return }
            val l = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent?) {
                    val v = event?.values?.firstOrNull() ?: return
                    if (v.isNaN() || v < 0f) return
                    val cur = v.toLong()
                    if (baseline < 0) baseline = cur
                    // 기기 재부팅 등으로 카운터가 되감기면 기준을 다시 잡는다(음수 방지).
                    if (cur < baseline) baseline = cur
                    latest = cur
                }
                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
            }
            // SENSOR_DELAY_NORMAL(~200ms) 이면 충분하다 — 걸음은 초당 3회 남짓이고,
            // 카운터는 이벤트를 놓쳐도 누적값이라 손실이 없다(배터리에 유리).
            sm.registerListener(l, s, SensorManager.SENSOR_DELAY_NORMAL)
            manager = sm
            sensor = s
            listener = l
            promise.resolve(true)
        } catch (_: Throwable) {
            promise.resolve(false)
        }
    }

    /** 구독 종료 — 러닝이 끝나면 반드시 부른다(배터리). */
    @ReactMethod
    fun stop(promise: Promise) {
        try {
            listener?.let { manager?.unregisterListener(it) }
        } catch (_: Throwable) { /* 이미 해제됐을 수 있다 */ }
        listener = null
        manager = null
        sensor = null
        baseline = -1
        latest = -1
        promise.resolve(null)
    }

    /**
     * 이 러닝에서 센 걸음수. 아직 모르면 **-1**(0 이 아니다).
     * 하드웨어 누적이라 화면이 꺼져 있던 구간도 포함된다 — 그게 이 모듈의 존재 이유다.
     */
    @ReactMethod
    fun current(promise: Promise) {
        try {
            val b = baseline
            val l = latest
            promise.resolve(if (b < 0 || l < 0) -1.0 else (l - b).toDouble())
        } catch (_: Throwable) {
            promise.resolve(-1.0)
        }
    }

    companion object {
        const val NAME = "KeegoStepCounter"
    }
}
