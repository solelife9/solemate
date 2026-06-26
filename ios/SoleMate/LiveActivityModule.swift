// LiveActivityModule.swift — RN 브리지: 잠금화면 Live Activity 시작/갱신/종료
// 'SoleMate'(앱) 타깃에 멤버십. RunActivityAttributes(공유 파일)를 함께 앱 타깃에 넣어야 한다.
// JS(lib/liveActivity.ts)가 NativeModules.LiveActivityModule 로 호출한다.
import Foundation
import ActivityKit

@objc(LiveActivityModule)
class LiveActivityModule: NSObject {
  // Activity<RunActivityAttributes> 는 iOS 16.1+ 타입이라 Any? 로 보관하고 가용 블록에서 캐스팅.
  private var activityAny: Any?

  @objc static func requiresMainQueueSetup() -> Bool { return true }

  @objc(start:goalKm:distanceKm:elapsedSec:paceLabel:avgPaceLabel:)
  func start(_ shoeName: String, goalKm: Double, distanceKm: Double,
             elapsedSec: Double, paceLabel: String, avgPaceLabel: String) {
    if #available(iOS 16.1, *) {
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      endInternal() // 혹시 남아있는 이전 활동 정리
      let attrs = RunActivityAttributes(shoeName: shoeName, goalKm: goalKm)
      let state = RunActivityAttributes.ContentState(
        distanceKm: distanceKm, elapsedSec: Int(elapsedSec),
        paceLabel: paceLabel, avgPaceLabel: avgPaceLabel)
      do {
        let act = try Activity<RunActivityAttributes>.request(
          attributes: attrs, contentState: state, pushType: nil)
        self.activityAny = act
      } catch {
        NSLog("[LiveActivity] start error: \(error.localizedDescription)")
      }
    }
  }

  @objc(update:elapsedSec:paceLabel:avgPaceLabel:)
  func update(_ distanceKm: Double, elapsedSec: Double, paceLabel: String, avgPaceLabel: String) {
    if #available(iOS 16.1, *) {
      guard let act = activityAny as? Activity<RunActivityAttributes> else { return }
      let state = RunActivityAttributes.ContentState(
        distanceKm: distanceKm, elapsedSec: Int(elapsedSec),
        paceLabel: paceLabel, avgPaceLabel: avgPaceLabel)
      Task { await act.update(using: state) }
    }
  }

  @objc func end() {
    endInternal()
  }

  private func endInternal() {
    if #available(iOS 16.1, *) {
      guard let act = activityAny as? Activity<RunActivityAttributes> else { return }
      activityAny = nil
      Task { await act.end(dismissalPolicy: .immediate) }
    }
  }
}
