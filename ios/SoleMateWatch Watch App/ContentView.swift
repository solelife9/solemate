// ContentView.swift — 루트 라우터: 세션 단계(phase)에 따라 화면 전환
// idle = 시작(신발 스와이프) → running/paused = 러닝(km 히어로) → ended = 요약(저장).
// 배경은 keego 다크(BG #0A0A0A) 고정 — 워치 기본 검정과 시각 동일하지만 토큰으로 명시.
import SwiftUI

struct ContentView: View {
  @EnvironmentObject var workout: WorkoutManager

  var body: some View {
    ZStack {
      KeegoTheme.bg.ignoresSafeArea()
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
