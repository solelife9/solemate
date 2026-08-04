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

  // 러닝 중 앱이 죽으면 watchOS 가 앱을 되살리며 이 훅을 부른다 — 살아 있는
  // HKWorkoutSession 을 다시 입양해 러닝을 잇는다(새 세션 시작 아님, 유실 금지).
  func handleActiveWorkoutRecovery() {
    Task { @MainActor in WorkoutManager.shared.recoverActiveSession() }
  }

  // 사용자가 직접 재실행한 경우도 복구 — 활성 세션이 없으면 조용히 no-op.
  func applicationDidFinishLaunching() {
    // 크래시 수집을 **가장 먼저** 켠다(2026-08-04 감사 L-02). 뒤에 오는 복구 로직이
    // 죽으면 그것도 잡아야 하기 때문이다. 설정이 없으면 조용히 no-op(WatchCrash 참조).
    WatchCrash.start()
    Task { @MainActor in WorkoutManager.shared.recoverActiveSession() }
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
