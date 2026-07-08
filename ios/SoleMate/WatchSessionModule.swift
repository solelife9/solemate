// WatchSessionModule.swift — Apple Watch ↔ iPhone 연결(WatchConnectivity) 수신측
// 워치 컴패니언 앱(SoleMateWatch)이 HKWorkoutSession 으로 잡은 실시간 심박(bpm)을
// WCSession.sendMessage 로 보내면 여기서 받아 RN 이벤트('onHeartRate')로 흘려보낸다.
// JS(lib/watchSession.ts)가 NativeEventEmitter 로 구독해 setHeartRate 로 화면에 반영.
//
// ⚠️ 이 파일은 'SoleMate'(앱) 타깃에 멤버십을 넣어야 한다(Xcode File Inspector).
import Foundation
import WatchConnectivity
import HealthKit
import React

@objc(WatchSessionModule)
class WatchSessionModule: RCTEventEmitter, WCSessionDelegate {
  private var hasListeners = false
  private let healthStore = HKHealthStore()

  override init() {
    super.init()
    // 워치 페어링 기기에서만 의미. 미지원(아이패드 등)·미페어링이면 조용히 no-op.
    if WCSession.isSupported() {
      let s = WCSession.default
      s.delegate = self
      s.activate()
    }
  }

  override static func requiresMainQueueSetup() -> Bool { return true }
  override func supportedEvents() -> [String]! { return ["onHeartRate"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  // 워치 → 폰 실시간 메시지(앱이 reachable 일 때). { "bpm": <Double> } 페이로드.
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard let bpm = message["bpm"] as? Double else { return }
    DispatchQueue.main.async {
      if self.hasListeners { self.sendEvent(withName: "onHeartRate", body: ["bpm": bpm]) }
    }
  }

  // 비실시간 폴백(백그라운드 누적 전달). 같은 페이로드 규약을 공유한다.
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    guard let bpm = userInfo["bpm"] as? Double else { return }
    DispatchQueue.main.async {
      if self.hasListeners { self.sendEvent(withName: "onHeartRate", body: ["bpm": bpm]) }
    }
  }

  // 폰 → 워치: 러닝 시작 시 워치 워크아웃을 자동 실행한다. HKHealthStore.startWatchApp 이
  // 페어링된 워치의 컴패니언 앱을 띄우고 handle(workoutConfiguration:)로 세션을 시작시킨다
  // → 사용자가 손목을 만지지 않아도 애플워치 심박이 흐른다. 워치 미페어링/미설치면 실패를
  // 조용히 resolve(false) 로 돌려 앱은 그대로 동작(심박만 '--').
  @objc(startWatchWorkout:rejecter:)
  func startWatchWorkout(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard HKHealthStore.isHealthDataAvailable() else { resolve(false); return }
    let config = HKWorkoutConfiguration()
    config.activityType = .running
    config.locationType = .outdoor
    // startWatchApp 은 워크아웃 공유 권한이 필요하다 — 요청 후(이미 허용됐으면 즉시) 실행.
    let share: Set<HKSampleType> = [HKObjectType.workoutType()]
    healthStore.requestAuthorization(toShare: share, read: []) { [weak self] _, _ in
      guard let self = self else { resolve(false); return }
      self.healthStore.startWatchApp(with: config) { success, _ in
        DispatchQueue.main.async { resolve(success) }
      }
    }
  }

  // 폰 → 워치: 러닝 종료 시 워치 워크아웃도 종료(도달 가능하면 즉시, 아니면 컨텍스트 폴백).
  @objc(stopWatchWorkout)
  func stopWatchWorkout() {
    let s = WCSession.default
    if s.isReachable {
      s.sendMessage(["cmd": "stop"], replyHandler: nil, errorHandler: nil)
    } else {
      try? s.updateApplicationContext(["cmd": "stop"])
    }
  }

  // 필수 델리게이트 스텁(iOS 측). 비활성 후 재활성으로 멀티-워치 전환을 견딘다.
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}
