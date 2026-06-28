// ContentView.swift — watchOS 러닝 화면(심박 大 + 시작/종료)
// 손목에서 흘끗 봐도 읽히게 심박을 크게. 시작 전엔 브랜드+시작 버튼, 러닝 중엔 실시간
// 심박과 종료 버튼. 'SoleMateWatch'(watchOS 앱) 타깃 멤버십.
import SwiftUI

private let kAccent = Color(red: 1.0, green: 0.40, blue: 0.0)

struct ContentView: View {
  @EnvironmentObject var workout: WorkoutManager

  var body: some View {
    VStack(spacing: 10) {
      if workout.running {
        HStack(spacing: 4) {
          Image(systemName: "heart.fill").foregroundColor(kAccent)
          Text("심박").font(.caption2).foregroundColor(.secondary)
        }
        Text(workout.heartRate > 0 ? "\(Int(workout.heartRate))" : "--")
          .font(.system(size: 52, weight: .heavy, design: .rounded))
          .foregroundColor(.white).monospacedDigit()
        Text("BPM").font(.caption2).foregroundColor(.secondary)
        Button(action: { workout.stop() }) {
          Text("종료").fontWeight(.semibold)
        }
        .tint(.red)
      } else {
        Image(systemName: "figure.run").font(.largeTitle).foregroundColor(kAccent)
        Text("SoleMate").font(.headline).foregroundColor(.white)
        Button(action: { workout.start() }) {
          Text("러닝 시작").fontWeight(.semibold)
        }
        .tint(kAccent)
      }
    }
    .padding()
  }
}
