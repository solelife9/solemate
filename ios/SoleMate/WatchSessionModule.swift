// WatchSessionModule.swift — Apple Watch ↔ iPhone 연결(WatchConnectivity) 수신측
// 워치 컴패니언 앱(SoleMateWatch)이 HKWorkoutSession 으로 잡은 실시간 심박(bpm)을
// WCSession.sendMessage 로 보내면 여기서 받아 RN 이벤트('onHeartRate')로 흘려보낸다.
// JS(lib/watchSession.ts)가 NativeEventEmitter 로 구독해 setHeartRate 로 화면에 반영.
//
// ⚠️ 이 파일은 'SoleMate'(앱) 타깃에 멤버십을 넣어야 한다(Xcode File Inspector).
import Foundation
import WatchConnectivity
import React

@objc(WatchSessionModule)
class WatchSessionModule: RCTEventEmitter, WCSessionDelegate {
  private var hasListeners = false

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

  // 필수 델리게이트 스텁(iOS 측). 비활성 후 재활성으로 멀티-워치 전환을 견딘다.
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}
