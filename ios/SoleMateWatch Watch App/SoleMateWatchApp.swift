// SoleMateWatchApp.swift — watchOS 컴패니언 앱 진입점
// 손목에서 러닝(HKWorkoutSession)을 시작/종료하고 실시간 심박을 페어링된 아이폰으로
// WatchConnectivity 로 스트리밍한다. 아이폰은 WatchSessionModule 로 받아 화면에 표시.
// 'SoleMateWatch'(watchOS 앱) 타깃 멤버십.
import SwiftUI
import WatchKit
import HealthKit

// 폰이 HKHealthStore.startWatchApp(with:)으로 이 워치앱을 띄우면 watchOS 가
// handle(_ workoutConfiguration:)로 설정을 넘긴다 → 공유 WorkoutManager 로 세션 시작.
// 이 경로가 '폰에서 러닝 시작 → 워치 워크아웃 자동 시작 + 심박 스트리밍'의 핵심이다.
final class WatchAppDelegate: NSObject, WKApplicationDelegate {
  func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
    Task { @MainActor in
      if !WorkoutManager.shared.running { WorkoutManager.shared.start() }
    }
  }
}

@main
struct SoleMateWatchApp: App {
  @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
  // handle(workoutConfiguration:)·폰 원격 명령과 동일 인스턴스를 UI 도 관찰하도록 shared 참조.
  @StateObject private var workout = WorkoutManager.shared
  var body: some Scene {
    WindowGroup {
      ContentView().environmentObject(workout)
    }
  }
}
