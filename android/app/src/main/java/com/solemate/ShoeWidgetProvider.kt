package com.solemate

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.widget.RemoteViews
import kotlin.math.max
import kotlin.math.min

/**
 * ShoeWidgetProvider — 홈 화면 위젯. 활성 신발의 **수명 링 + 이름 + 사용/총 km** 를 보여준다.
 *
 * iOS 대응물은 ios/RunActivity/RunActivityBundle.swift 의 KeegoShoeWidget 이고,
 * **표시 규칙(잔여율·색 구간·문구)을 그대로 옮겼다** — 두 플랫폼이 다른 색을 쓰면 같은
 * 신발이 폰마다 다른 상태로 보인다.
 *
 * 링을 RemoteViews 로 직접 그릴 수는 없어서(ProgressBar 는 각진 끝·그라데이션 불가)
 * Canvas 로 비트맵을 그려 ImageView 에 넣는다. iOS 의 둥근 끝(lineCap: .round)과
 * 대각선 그라데이션까지 맞춘다.
 *
 * 데이터는 KeegoWidgetModule 이 SharedPreferences 에 써둔다. 값이 없으면 **아무것도 그리지
 * 않고 안내 문구만** 둔다 — 샘플 신발을 보여주면 사용자가 등록한 줄 안다(Truth only).
 */
class ShoeWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        renderAll(context, manager, ids)
    }

    companion object {
        fun renderAll(context: Context, manager: AppWidgetManager, ids: IntArray) {
            for (id in ids) {
                try {
                    manager.updateAppWidget(id, buildViews(context))
                } catch (_: Throwable) {
                    // 개별 위젯 실패는 나머지를 막지 않는다.
                }
            }
        }

        private fun buildViews(context: Context): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_shoe)
            val prefs = context.getSharedPreferences(KeegoWidgetModule.PREFS, Context.MODE_PRIVATE)
            val name = prefs.getString(KeegoWidgetModule.K_NAME, "") ?: ""
            val used = prefs.getInt(KeegoWidgetModule.K_USED, 0)
            val max = prefs.getInt(KeegoWidgetModule.K_MAX, 0)

            // 탭하면 앱을 연다(iOS 위젯과 같은 동작).
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launch != null) {
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                views.setOnClickPendingIntent(
                    R.id.widget_root,
                    PendingIntent.getActivity(context, 0, launch, flags),
                )
            }

            if (name.isBlank() || max <= 0) {
                // 아직 신발이 없거나 앱을 한 번도 안 열었다 — 지어내지 않는다.
                views.setTextViewText(R.id.widget_name, "러닝화를 등록해 주세요")
                views.setTextViewText(R.id.widget_km, "")
                views.setImageViewBitmap(R.id.widget_ring, ringBitmap(context, 1.0, 0))
                return views
            }

            val usedPct = if (max > 0) (used.toDouble() / max.toDouble()) * 100.0 else 0.0
            val remaining = max(0.0, min(1.0, 1.0 - usedPct / 100.0))
            views.setTextViewText(R.id.widget_name, name)
            views.setTextViewText(R.id.widget_km, "$used / ${max}km")
            views.setImageViewBitmap(R.id.widget_ring, ringBitmap(context, remaining, usedPct.toInt()))
            return views
        }

        /**
         * 마모 단계 그라데이션 — iOS KeegoShoe.gradient 와 **같은 구간·같은 색**.
         * 90%+ 빨강(교체 권장) · 80%+ 노랑(교체 고려) · 50%+ 초록(양호) · 그 미만 파랑(최상).
         */
        private fun gradientFor(usedPct: Int): Pair<Int, Int> = when {
            usedPct >= 90 -> Pair(Color.parseColor("#FF836F"), Color.parseColor("#DF3A26"))
            usedPct >= 80 -> Pair(Color.parseColor("#F3C866"), Color.parseColor("#CD8416"))
            usedPct >= 50 -> Pair(Color.parseColor("#6BD7A2"), Color.parseColor("#33A468"))
            else -> Pair(Color.parseColor("#79B7F6"), Color.parseColor("#3A86D8"))
        }

        /** 잔여율 링을 비트맵으로 그린다(12시 방향에서 시계방향, 둥근 끝 — iOS 와 동일). */
        private fun ringBitmap(context: Context, remaining: Double, usedPct: Int): Bitmap {
            val density = context.resources.displayMetrics.density
            val size = (100 * density).toInt().coerceAtLeast(1)
            val stroke = 9f * density
            val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)
            val inset = stroke / 2f
            val rect = RectF(inset, inset, size - inset, size - inset)

            // 트랙(흰색 10%) — iOS: Color.white.opacity(0.10)
            val track = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                color = Color.argb(26, 255, 255, 255)
            }
            canvas.drawArc(rect, 0f, 360f, false, track)

            // 진행 아크 — 대각선(좌상→우하) 그라데이션, 둥근 끝
            val (c0, c1) = gradientFor(usedPct)
            val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                strokeCap = Paint.Cap.ROUND
                shader = LinearGradient(0f, 0f, size.toFloat(), size.toFloat(), c0, c1, Shader.TileMode.CLAMP)
            }
            // iOS 는 trim(0..remaining) 후 -90° 회전 = 12시에서 시작. 최소 0.001 로 점이라도 남긴다.
            val sweep = (max(0.001, remaining) * 360.0).toFloat()
            canvas.drawArc(rect, -90f, sweep, false, arc)
            return bmp
        }
    }
}
