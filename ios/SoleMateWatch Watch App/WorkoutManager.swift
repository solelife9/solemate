// WorkoutManager.swift — watchOS 러닝 세션 + 실시간 심박 수집 + 아이폰 전송
// HKWorkoutSession + HKLiveWorkoutBuilder 로 손목 센서의 심박을 실시간으로 받아
// (didCollectDataOf), WCSession.sendMessage 로 페어링된 아이폰에 { "bpm": Double } 전달.
// 아이폰 미도달(백그라운드) 시 updateApplicationContext 폴백.
// 'SoleMateWatch'(watchOS 앱) 타깃 멤버십. HealthKit capability 필요.
import Foundation
import Combine
import HealthKit
import WatchConnectivity

@MainActor
final class WorkoutManager: NSObject, ObservableObject {
  @Published var heartRate: Double = 0
  @Published var running = false

  private let healthStore = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?

  override init() {
    super.init()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  func requestAuthorization() {
    guard HKHealthStore.isHealthDataAvailable() else { return }
    var read: Set<HKObjectType> = [HKObjectType.workoutType()]
    if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) { read.insert(hr) }
    if let en = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { read.insert(en) }
    if let di = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) { read.insert(di) }
    let share: Set<HKSampleType> = [HKObjectType.workoutType()]
    healthStore.requestAuthorization(toShare: share, read: read) { _, _ in }
  }

  func start() {
    requestAuthorization()
    let config = HKWorkoutConfiguration()
    config.activityType = .running
    config.locationType = .outdoor
    do {
      let s = try HKWorkoutSession(healthStore: healthStore, configuration: config)
      let b = s.associatedWorkoutBuilder()
      b.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
      s.delegate = self
      b.delegate = self
      session = s
      builder = b
      let startDate = Date()
      s.startActivity(with: startDate)
      b.beginCollection(withStart: startDate) { _, _ in }
      running = true
    } catch {
      running = false
    }
  }

  func stop() {
    session?.end()
    running = false
    heartRate = 0
  }

  private func sendHeartRate(_ bpm: Double) {
    let s = WCSession.default
    if s.isReachable {
      s.sendMessage(["bpm": bpm], replyHandler: nil, errorHandler: nil)
    } else {
      // 폰 비도달(백그라운드) — 최신값만 덮어쓰는 컨텍스트로 폴백.
      try? s.updateApplicationContext(["bpm": bpm])
    }
  }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession,
                                  didChangeTo toState: HKWorkoutSessionState,
                                  from fromState: HKWorkoutSessionState, date: Date) {}
  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession,
                                  didFailWithError error: Error) {}
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
  nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                                  didCollectDataOf collectedTypes: Set<HKSampleType>) {
    guard let hrType = HKObjectType.quantityType(forIdentifier: .heartRate),
          collectedTypes.contains(hrType),
          let stats = workoutBuilder.statistics(for: hrType),
          let q = stats.mostRecentQuantity() else { return }
    let bpm = q.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
    Task { @MainActor in
      self.heartRate = bpm
      self.sendHeartRate(bpm)
    }
  }
}

extension WorkoutManager: WCSessionDelegate {
  nonisolated func session(_ session: WCSession,
                           activationDidCompleteWith activationState: WCSessionActivationState,
                           error: Error?) {}
}
