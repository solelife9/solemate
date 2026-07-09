// RunView.swift — 러닝 중 화면: km 메인 히어로 + 보조 지표 스택(링 없음)
// ----------------------------------------------------------------------------
// 사용자 확정(2026-07-10): 워치 화면이 작아 진행 링은 제거 — 거리(km)가 대형
// tabular-nums 히어로, 그 아래 시간·페이스·심박(존 색) 세로 스택. 파파야는 km 단위
// 라벨(아래 매달림 — 폰과 동일 문법) 한 점에만. 크라운/세로 스와이프로 심박·페이스·
// 시간 대형 페이지와 컨트롤(일시정지/종료) 페이지 전환.
import SwiftUI

struct RunView: View {
  @EnvironmentObject var workout: WorkoutManager
  @State private var page = 0

  var body: some View {
    TabView(selection: $page) {
      mainPage.tag(0)
      heartPage.tag(1)
      pacePage.tag(2)
      timePage.tag(3)
      controlsPage.tag(4)
    }
    .tabViewStyle(.verticalPage)
  }

  // ── 페이지 0: 핵심이 다 보이는 메인(거리 히어로 + 보조 스택) ─────────────────
  private var mainPage: some View {
    VStack(spacing: 0) {
      if workout.phase == .paused {
        Text(workout.autoPaused ? "자동 일시정지" : "일시정지")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(KeegoTheme.warn)
      }
      // 거리 히어로 — 800급 + tabular-nums(폰 러닝 화면과 동일 문법).
      Text(KeegoFormat.km(workout.distanceKm))
        .font(.system(size: 46, weight: .heavy))
        .monospacedDigit()
        .foregroundStyle(KeegoTheme.t1)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      // km 라벨 아래 매달림 — 파파야 최소 포인트(러닝 도메인 표식).
      Text("km")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(KeegoTheme.brand)
        .padding(.top, -2)

      Spacer(minLength: 6)

      // 보조 지표 스택 — 라벨 T3 / 값 흰 세미볼드 tabular.
      HStack(spacing: 0) {
        miniMetric(label: "시간", value: KeegoFormat.time(workout.elapsedS))
        miniMetric(label: "페이스", value: KeegoFormat.pace(secPerKm: workout.avgPaceSecPerKm))
      }
      HStack(spacing: 4) {
        Image(systemName: "heart.fill")
          .font(.system(size: 11))
          .foregroundStyle(KeegoTheme.hrZoneColor(workout.hrZone))
        Text(workout.heartRate > 0 ? "\(Int(workout.heartRate))" : "--")
          .font(.system(size: 16, weight: .semibold))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.t1)
        Text("BPM")
          .font(.system(size: 10))
          .foregroundStyle(KeegoTheme.t3)
      }
      .padding(.top, 4)
    }
    .padding(.horizontal, 6)
  }

  private func miniMetric(label: String, value: String) -> some View {
    VStack(spacing: 1) {
      Text(label)
        .font(.system(size: 10))
        .foregroundStyle(KeegoTheme.t3)
      Text(value)
        .font(.system(size: 16, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(KeegoTheme.t1)
    }
    .frame(maxWidth: .infinity)
  }

  // ── 페이지 1–3: 대형 단일 지표(흘끗 보기) ──────────────────────────────────
  private var heartPage: some View {
    bigMetric(
      label: workout.hrZone > 0 ? "Z\(workout.hrZone) \(KeegoTheme.hrZoneLabel[workout.hrZone] ?? "")" : "심박",
      value: workout.heartRate > 0 ? "\(Int(workout.heartRate))" : "--",
      unit: "BPM",
      valueColor: KeegoTheme.hrZoneColor(workout.hrZone)
    )
  }

  private var pacePage: some View {
    bigMetric(
      label: "평균 페이스",
      value: KeegoFormat.pace(secPerKm: workout.avgPaceSecPerKm),
      unit: "/km",
      valueColor: KeegoTheme.t1
    )
  }

  private var timePage: some View {
    bigMetric(
      label: "시간",
      value: KeegoFormat.time(workout.elapsedS),
      unit: "",
      valueColor: KeegoTheme.t1
    )
  }

  private func bigMetric(label: String, value: String, unit: String, valueColor: Color) -> some View {
    VStack(spacing: 2) {
      Text(label)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(KeegoTheme.t3)
      Text(value)
        .font(.system(size: 42, weight: .heavy))
        .monospacedDigit()
        .foregroundStyle(valueColor)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
      if !unit.isEmpty {
        Text(unit)
          .font(.system(size: 11))
          .foregroundStyle(KeegoTheme.t3)
      }
    }
    .padding(.horizontal, 6)
  }

  // ── 페이지 4: 컨트롤(일시정지/재개 · 종료) ─────────────────────────────────
  private var controlsPage: some View {
    VStack(spacing: 8) {
      Button {
        if workout.phase == .paused { workout.resume() } else { workout.pause() }
      } label: {
        Label(
          workout.phase == .paused ? "재개" : "일시정지",
          systemImage: workout.phase == .paused ? "play.fill" : "pause.fill"
        )
        .font(.system(size: 14, weight: .semibold))
      }
      .tint(.white)

      Button {
        workout.end()
      } label: {
        Label("종료", systemImage: "stop.fill")
          .font(.system(size: 14, weight: .semibold))
      }
      .tint(KeegoTheme.danger)
    }
    .padding(.horizontal, 4)
  }
}
