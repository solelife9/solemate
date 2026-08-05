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
            // 시작 실패 안내 — 시작 화면에만 얹는다(러닝 화면 불가침).
            // watchOS 는 워크아웃 세션을 하나만 허용해서, 다른 운동 앱이 잡고 있으면
            // 세션 생성이 실패한다. 예전엔 조용히 시작 화면으로 돌아가 사용자가 그대로
            // 달렸고 기록이 통째로 사라졌다(2026-08-05 실측).
            .overlay(alignment: .bottom) {
              if let msg = workout.startError { StartErrorBanner(message: msg) }
            }
        case .running, .paused:
          RunView()
        case .ended:
          SummaryView()
        }
      }
    }
  }
}

/// 러닝을 시작하지 못했을 때 시작 화면 아래에 뜨는 안내. 탭하면 닫힌다.
///
/// 색은 의미에만 — 시작 실패는 조건색 WARN 이다(DESIGN §액센트 절제). 파파야(브랜드색)는
/// 러닝 링·진행 지표 몫이라 여기 쓰지 않는다.
private struct StartErrorBanner: View {
  @EnvironmentObject var workout: WorkoutManager
  let message: String

  // ⚠️ 한 체인으로 이어 쓰지 말 것 — SwiftUI 모디파이어가 길어지면 컴파일러가
  // "unable to type-check this expression in reasonable time" 으로 멈춘다(실제로 걸렸다).
  // 배경과 라벨을 분리해 각 식을 짧게 유지한다.
  private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 10, style: .continuous) }

  private var label: some View {
    Text(message)
      .font(.system(size: 12, weight: .medium))
      .foregroundStyle(KeegoTheme.t1)
      .multilineTextAlignment(.center)
      .fixedSize(horizontal: false, vertical: true)
  }

  private var background: some View {
    shape
      .fill(KeegoTheme.glassFill)
      .overlay(shape.strokeBorder(KeegoTheme.warn.opacity(0.55), lineWidth: 1))
  }

  var body: some View {
    label
      .padding(EdgeInsets(top: 8, leading: 10, bottom: 8, trailing: 10))
      .frame(maxWidth: .infinity)
      .background(background)
      .padding(.horizontal, 6)
      .onTapGesture { workout.clearStartError() }
      .accessibilityLabel("러닝을 시작하지 못했습니다. 탭하면 닫습니다.")
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
