// SoleMateWatchApp.swift — Keego Watch(단독 실행 watchOS 앱) 진입점
// ----------------------------------------------------------------------------
// 손목만으로 러닝을 시작/기록(HKWorkoutSession + GPS)하고, 완주 페이로드·실시간
// 심박을 WatchConnectivity 로 폰에 잇는다(폰측 수신 = WatchSessionModule).
// WatchLink 를 앱 시작에 터치해 WCSession 활성화 + 신발 캐시 복원을 보장한다.
// 'SoleMateWatch Watch App' 타깃 멤버십.
import SwiftUI
import WatchKit
import HealthKit

// 폰이 HKHealthStore.startWatchApp(with:)으로 이 워치앱을 띄우면 watchOS 가
// handle(_ workoutConfiguration:)로 설정을 넘긴다 → 공유 WorkoutManager 로 세션 시작
// (마지막 선택 신발로 — 폰 러닝과 신발 선택은 폰 기록이 정본이라 여기 신발은 표시용).
// 이 경로가 '폰에서 러닝 시작 → 워치 워크아웃 자동 시작 + 심박 스트리밍'의 핵심이다.
final class WatchAppDelegate: NSObject, WKApplicationDelegate {
  func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
    Task { @MainActor in
      // 신발 미동기화면 시작하지 않는다(2026-07-11 확정 — 러닝은 신발과 함께만.
      // 폰이 이 경로를 태울 땐 신발 컨텍스트도 이미 푸시된 상태가 정상).
      if !WorkoutManager.shared.isActive, let shoe = WatchLink.shared.selectedShoe {
        WorkoutManager.shared.start(shoe: shoe)
      }
    }
  }
}

@main
struct SoleMateWatchApp: App {
  @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
  // handle(workoutConfiguration:)·폰 원격 명령과 동일 인스턴스를 UI 도 관찰하도록 shared 참조.
  @StateObject private var workout = WorkoutManager.shared
  @StateObject private var link = WatchLink.shared

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(workout)
        .environmentObject(link)
    }
  }
}
