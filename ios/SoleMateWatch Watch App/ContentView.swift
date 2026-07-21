// ContentView.swift — 루트 라우터: 세션 단계(phase)에 따라 화면 전환
// idle = 시작(신발 스와이프) → running/paused = 러닝(km 히어로) → ended = 요약(저장).
// 배경은 keego 다크(BG #0A0A0A) 고정 — 워치 기본 검정과 시각 동일하지만 토큰으로 명시.
import SwiftUI

struct ContentView: View {
  @EnvironmentObject var workout: WorkoutManager

  var body: some View {
    ZStack {
      KeegoTheme.bg.ignoresSafeArea()
      if let cd = workout.countdownValue {
        CountdownView(value: cd)
      } else {
        switch workout.phase {
        case .idle:
          StartView()
        case .running, .paused:
          RunView()
        case .ended:
          SummaryView()
        }
      }
    }
  }
}

/// 러닝 시작 3-2-1 카운트다운 — 큰 파파야 숫자, 화면 탭하면 취소(시작 화면으로).
private struct CountdownView: View {
  @EnvironmentObject var workout: WorkoutManager
  let value: Int

  var body: some View {
    GeometryReader { geo in
      VStack(spacing: geo.size.height * 0.02) {
        Text("\(value)")
          .font(.system(size: geo.size.height * 0.55, weight: .heavy))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.brand)
          .contentTransition(.numericText())
          .animation(.snappy, value: value)
        Text("탭하면 취소")
          .font(.system(size: geo.size.height * 0.06, weight: .medium))
          .foregroundStyle(KeegoTheme.t3)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .contentShape(Rectangle())
    .onTapGesture { workout.cancelCountdown() }
  }
}
