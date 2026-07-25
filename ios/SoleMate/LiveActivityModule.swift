// LiveActivityModule.swift — RN 브리지: 잠금화면 Live Activity 시작/갱신/종료
// 'SoleMate'(앱) 타깃에 멤버십. RunActivityAttributes(공유 파일)를 함께 앱 타깃에 넣어야 한다.
// JS(lib/liveActivity.ts)가 NativeModules.LiveActivityModule 로 호출한다.
import Foundation
import ActivityKit
import React

@objc(LiveActivityModule)
class LiveActivityModule: NSObject {
  // Activity<RunActivityAttributes> 는 iOS 16.1+ 타입이라 Any? 로 보관하고 가용 블록에서 캐스팅.
  private var activityAny: Any?

  @objc static func requiresMainQueueSetup() -> Bool { return true }

  @objc(start:goalKm:distanceKm:elapsedSec:paceLabel:avgPaceLabel:cadenceSpm:bpm:)
  func start(_ shoeName: String, goalKm: Double, distanceKm: Double,
             elapsedSec: Double, paceLabel: String, avgPaceLabel: String, cadenceSpm: Double, bpm: Double) {
    if #available(iOS 16.1, *) {
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      endInternal() // 혹시 남아있는 이전 활동 정리
      let attrs = RunActivityAttributes(shoeName: shoeName, goalKm: goalKm)
      let state = RunActivityAttributes.ContentState(
        distanceKm: distanceKm, elapsedSec: Int(elapsedSec),
        paceLabel: paceLabel, avgPaceLabel: avgPaceLabel, cadenceSpm: Int(cadenceSpm), bpm: Int(bpm))
      do {
        let act = try Activity<RunActivityAttributes>.request(
          attributes: attrs, contentState: state, pushType: nil)
        self.activityAny = act
      } catch {
        NSLog("[LiveActivity] start error: \(error.localizedDescription)")
      }
    }
  }

  @objc(update:elapsedSec:paceLabel:avgPaceLabel:cadenceSpm:bpm:)
  func update(_ distanceKm: Double, elapsedSec: Double, paceLabel: String, avgPaceLabel: String, cadenceSpm: Double, bpm: Double) {
    if #available(iOS 16.1, *) {
      guard let act = activityAny as? Activity<RunActivityAttributes> else { return }
      let state = RunActivityAttributes.ContentState(
        distanceKm: distanceKm, elapsedSec: Int(elapsedSec),
        paceLabel: paceLabel, avgPaceLabel: avgPaceLabel, cadenceSpm: Int(cadenceSpm), bpm: Int(bpm))
      if #available(iOS 16.2, *) {
        // staleDate: 앱이 죽어 갱신이 끊기면 90초 뒤 시스템이 위젯을 '흐림' 처리 —
        // 고아가 살아있는 척 못 하게(부팅 청소와 이중 안전망).
        Task { await act.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(90))) }
      } else {
        Task { await act.update(using: state) }
      }
    }
  }

  @objc func end() {
    endInternal()
  }

  // 시스템 설정에서 Live Activities 가 꺼져 있는지 JS 가 알 수 있게(2026-07-25 진단 —
  // 꺼져 있으면 start 가 소리 없이 포기해 "위젯이 안 뜬다"의 원인을 사용자가 알 수 없었다).
  @objc(areEnabled:rejecter:)
  func areEnabled(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 16.1, *) {
      resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
    } else {
      resolve(false)
    }
  }

  // 고아 정리(2026-07-25 민우님 실기기 버그 — 앱 강제 종료 후 위젯이 계속 떠 있음):
  // 프로세스가 죽으면 activityAny 핸들이 사라져 이전 액티비티를 영영 못 닫는다.
  // 그래서 종료는 항상 '핸들 하나'가 아니라 우리 타입의 *전체 목록*을 순회해 끝낸다.
  // JS 부팅(lib/liveActivity.end)이 이걸 불러 이전 세션의 고아를 청소한다.
  private func endInternal() {
    if #available(iOS 16.1, *) {
      activityAny = nil
      for act in Activity<RunActivityAttributes>.activities {
        Task { await act.end(dismissalPolicy: .immediate) }
      }
    }
  }
}
