// PedometerDistanceModule.swift — CoreMotion CMPedometer 누적 이동거리 스트림(폰).
// ----------------------------------------------------------------------------
// 러닝 거리 융합(#16)용 보조 신호. GPS 가 정본이고, 이 모듈이 주는 가속도계 기반
// 누적거리(m)는 runTracker.feedPedometerDistance 로 흘러가 **GPS 死구간(터널·도심
// 협곡)에서만** 유실분을 메운다(lib/runTracker — 死구간 한정·순수 가산).
//   · CMPedometer.startUpdates(from:) → CMPedometerData.distance(누적 m, 시작 이후).
//   · RN 이벤트 'onPedometerDistance' { meters } 로 방출(lib/pedometerDistance 가 구독).
//   · 거리 미지원 기기·모션 권한 거부는 조용히 no-op(러닝은 GPS 로 그대로 진행).
//
// 권한: NSMotionUsageDescription(이미 존재 — expo-sensors Pedometer 걸음수와 공유).
// ⚠️ 이 파일은 'SoleMate'(앱) 타깃 멤버십 필요(Xcode File Inspector / project.pbxproj).
import Foundation
import CoreMotion
import React

@objc(PedometerDistanceModule)
class PedometerDistanceModule: RCTEventEmitter {
  private let pedometer = CMPedometer()
  private var running = false
  private var hasListeners = false

  @objc override static func requiresMainQueueSetup() -> Bool { false }
  override func supportedEvents() -> [String]! { ["onPedometerDistance"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  /// 러닝 시작 — CMPedometer 누적거리 스트림을 켠다. 거리 미지원/권한 거부는 조용히 no-op.
  @objc(startPedometerUpdates)
  func startPedometerUpdates() {
    guard CMPedometer.isDistanceAvailable() else { return }
    if running { return }
    running = true
    pedometer.startUpdates(from: Date()) { [weak self] data, error in
      guard let self, self.running, error == nil,
            let meters = data?.distance?.doubleValue,
            meters.isFinite, meters >= 0 else { return }
      DispatchQueue.main.async {
        guard self.hasListeners else { return }
        self.sendEvent(withName: "onPedometerDistance", body: ["meters": meters])
      }
    }
  }

  /// 러닝 종료 — 스트림을 끈다(배터리·프라이버시). 유실 없음 — 거리 정본은 GPS.
  @objc(stopPedometerUpdates)
  func stopPedometerUpdates() {
    running = false
    pedometer.stopUpdates()
  }

  override func invalidate() {
    running = false
    pedometer.stopUpdates()
    super.invalidate()
  }
}
