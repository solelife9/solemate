// SoleMateWatchApp.swift — watchOS 컴패니언 앱 진입점
// 손목에서 러닝(HKWorkoutSession)을 시작/종료하고 실시간 심박을 페어링된 아이폰으로
// WatchConnectivity 로 스트리밍한다. 아이폰은 WatchSessionModule 로 받아 화면에 표시.
// 'SoleMateWatch'(watchOS 앱) 타깃 멤버십.
import SwiftUI

@main
struct SoleMateWatchApp: App {
  @StateObject private var workout = WorkoutManager()
  var body: some Scene {
    WindowGroup {
      ContentView().environmentObject(workout)
    }
  }
}
