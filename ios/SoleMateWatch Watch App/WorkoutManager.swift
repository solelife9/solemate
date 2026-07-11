// WorkoutManager.swift — watchOS 단독 러닝 세션 엔진
// ----------------------------------------------------------------------------
// HKWorkoutSession + HKLiveWorkoutBuilder(심박·에너지) + CLLocation(거리)로 손목 단독
// 러닝을 기록한다. 흐름: idle → start() → running ⇄ paused(수동/자동) → end() →
// ended(요약) → confirmSave()(폰 전송) → idle.
//
//   · 거리: CLLocation 증분 합산 — 정확도 필터(수평오차 ≤30m) + 속도 스파이크 컷
//     (>12.5 m/s 폐기, 폰 엔진과 동일 상한). ⚠️ 워치 GPS 는 폰보다 정확도가 낮아
//     칼만 파라미터 별도 튜닝이 스펙 리스크로 명시돼 있다 — 실기기(M1) 검증 대기.
//   · 자동 일시정지: lib/autoPause.ts 상태기계 미러 — 지속 0.6 m/s 미만 3초 → pause,
//     정지 중 1.0 m/s 초과 1초 → resume(히스테리시스 밴드 유지). 수동 일시정지는
//     자동 재개하지 않는다(사용자 의도 우선 — 애플 운동 앱 관용).
//   · 심박: HKLiveWorkoutBuilder didCollectDataOf → 화면 + 폰 실시간 스트림(기존 계약).
//   · 종료: builder 메타데이터에 keego 신발 id 태깅 → HealthKit 워크아웃 저장(폰
//     healthkit.ts 백필 경로가 흡수 가능) → 요약 → 저장 시 WatchLink 로 폰 전송.
//
// Iron Law: 러닝 중 거리/시간 유실·음수 금지 — 모든 누적은 단조 증가, 실패는 조용히
// 해당 표본만 버린다(throw 금지). 'SoleMateWatch Watch App' 타깃 멤버십.
import Foundation
import Combine
import CoreLocation
import HealthKit
import WatchKit

/// 러닝 화면 상태. ended 는 요약 화면(저장 대기)이다.
enum RunPhase: Equatable {
  case idle
  case running
  case paused
  case ended
}

/// 완주 요약 — 요약 화면 표시 + 폰 전송 페이로드의 원본.
struct RunSummary: Equatable {
  let runId: String
  let shoeId: String
  let shoeName: String
  let km: Double
  let durationS: Double
  let avgBpm: Double
  let kcal: Double
  let startMs: Double
  let endMs: Double

  var avgPaceSecPerKm: Double { km > 0.01 ? durationS / km : 0 }
}

@MainActor
final class WorkoutManager: NSObject, ObservableObject {
  // 폰 원격 명령(WatchLink)·startWatchApp(handle:)·UI 가 같은 세션을 제어하도록 공유.
  static let shared = WorkoutManager()

  // ── 라이브 지표(러닝 화면 구독) ─────────────────────────────────────────────
  @Published private(set) var phase: RunPhase = .idle
  @Published private(set) var heartRate: Double = 0
  @Published private(set) var distanceKm: Double = 0
  @Published private(set) var elapsedS: Double = 0
  /// 자동 일시정지로 멈춘 상태인가(수동과 구분 — 자동만 자동 재개한다).
  @Published private(set) var autoPaused = false
  /// 완료된 km 랩의 소요시간(초/km) — 러닝 화면 스플릿 페이지. 일시정지 제외
  /// (elapsedS = 빌더 시간 기준 증분).
  @Published private(set) var splits: [Double] = []
  @Published private(set) var summary: RunSummary?
  /// 이번 런의 신발(시작 화면에서 선택). 러닝은 항상 신발과 함께 시작한다
  /// (2026-07-11 사용자 확정 — '신발 없이 시작' 제거). 옵셔널은 idle 상태 표현용.
  private(set) var currentShoe: WatchShoe?

  var isActive: Bool { phase == .running || phase == .paused }
  /// 평균 페이스(초/km). 200m 미만은 통계 잡음이라 0(--'--") 처리.
  var avgPaceSecPerKm: Double { distanceKm > 0.2 ? elapsedS / distanceKm : 0 }
  /// 현재 랩(진행 중인 km 구간) 거리 — '현재 랩' 뷰(Apple Split 뷰 문법).
  var currentLapKm: Double { max(0, distanceKm - Double(splits.count)) }
  /// 현재 랩 페이스(초/km). 100m 미만은 잡음이라 0(--'--") 처리.
  var currentLapPaceSecPerKm: Double {
    let d = currentLapKm
    guard d > 0.1 else { return 0 }
    return max(0, elapsedS - lastSplitElapsedS) / d
  }
  /// 현재 심박존(1–5). 폰 lib/analytics/hrZones.zoneOf 미러 — hrMax 미설정이면 0(무채).
  var hrZone: Int { Self.zone(bpm: heartRate, maxHR: WatchLink.shared.hrMax, restHR: WatchLink.shared.hrRest) }

  // ── 내부 상태 ────────────────────────────────────────────────────────────
  private let healthStore = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private let locationManager = CLLocationManager()
  private var lastLocation: CLLocation?
  private var timer: Timer?
  private var runId = ""
  private var startDate: Date?
  private var manualPause = false
  // km 스플릿 적산 — 직전 랩 마감 시점의 경과시간(빌더 시간, 일시정지 제외).
  private var lastSplitElapsedS: Double = 0
  // 자동 일시정지 상태기계(lib/autoPause.ts 미러) — 지속시간 적산기.
  private var slowSec: Double = 0
  private var fastSec: Double = 0

  /// 활성 런 컨텍스트 영속 키 — 러닝 중 앱 사망 → 세션 복구 시 runId(폰 중복 방어
  /// 일관)·신발 귀속·완료 랩을 되살린다. reset() 에서 제거.
  private enum RecoverKeys {
    static let runId = "keego_active_run_id"
    static let shoeId = "keego_active_shoe_id"
    static let splits = "keego_active_splits"
    static let lastSplitElapsedS = "keego_active_last_split_elapsed"
  }

  // lib/engineConstants.ts 미러(단일 진실원은 폰 — 값 변경 시 함께 갱신).
  private static let autoPauseSpeedMps = 0.6
  private static let autoPauseHoldS = 3.0
  private static let autoResumeSpeedMps = 1.0
  private static let autoResumeHoldS = 1.0
  /// GPS 표본 수용 한계 — 수평오차(m)·속도(m/s). 폰 엔진과 동일 상한(실기기 튜닝 대기).
  private static let maxAccuracyM = 30.0
  private static let maxSpeedMps = 12.5

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBest
    locationManager.activityType = .fitness
  }

  // ── 권한(HealthKit + 위치) — 시작 화면 진입 시 선요청해 시작 탭 지연을 줄인다 ──
  func requestPermissions() {
    if HKHealthStore.isHealthDataAvailable() {
      var read: Set<HKObjectType> = [HKObjectType.workoutType()]
      if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) { read.insert(hr) }
      if let en = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { read.insert(en) }
      if let di = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) { read.insert(di) }
      let share: Set<HKSampleType> = [HKObjectType.workoutType()]
      healthStore.requestAuthorization(toShare: share, read: read) { _, _ in }
    }
    if locationManager.authorizationStatus == .notDetermined {
      locationManager.requestWhenInUseAuthorization()
    }
  }

  // ── 시작 — 신발 필수(shoe-first, 신발 동기화 후에만 러닝) ────────────────────
  func start(shoe: WatchShoe) {
    guard phase == .idle else { return }
    requestPermissions()
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
      currentShoe = shoe
      runId = "watch-" + UUID().uuidString.lowercased()
      // 복구 컨텍스트 영속 — 러닝 중 앱이 죽어도 신발 귀속·runId 를 잃지 않는다.
      let d = UserDefaults.standard
      d.set(runId, forKey: RecoverKeys.runId)
      d.set(shoe.id, forKey: RecoverKeys.shoeId)
      d.removeObject(forKey: RecoverKeys.splits)
      d.set(0.0, forKey: RecoverKeys.lastSplitElapsedS)
      let now = Date()
      startDate = now
      heartRate = 0
      distanceKm = 0
      elapsedS = 0
      autoPaused = false
      manualPause = false
      slowSec = 0
      fastSec = 0
      lastLocation = nil
      splits = []
      lastSplitElapsedS = 0
      summary = nil
      s.startActivity(with: now)
      b.beginCollection(withStart: now) { _, _ in }
      // 워크아웃 세션 중 손목 다운/백그라운드에서도 위치가 계속 흐르게(SpeedySloth 관용).
      locationManager.allowsBackgroundLocationUpdates = true
      locationManager.startUpdatingLocation()
      phase = .running
      startTimer()
    } catch {
      phase = .idle
    }
  }

  // ── 수동 일시정지/재개 ─────────────────────────────────────────────────────
  func pause() {
    guard phase == .running else { return }
    manualPause = true
    autoPaused = false
    session?.pause()
  }

  func resume() {
    guard phase == .paused else { return }
    manualPause = false
    autoPaused = false
    fastSec = 0
    session?.resume()
  }

  // ── 종료 → 요약 ───────────────────────────────────────────────────────────
  func end() {
    guard isActive else { return }
    locationManager.stopUpdatingLocation()
    locationManager.allowsBackgroundLocationUpdates = false
    stopTimer()
    // 실제 저장/요약은 세션 상태가 .ended 로 바뀐 델리게이트에서 이어진다.
    session?.end()
  }

  /// 요약 화면 '저장' — 폰으로 런 페이로드 전송(HealthKit 저장은 이미 완료) 후 초기화.
  func confirmSave() {
    if let s = summary { WatchLink.shared.sendRun(s) }
    reset()
  }

  private func reset() {
    session = nil
    builder = nil
    summary = nil
    currentShoe = nil
    heartRate = 0
    distanceKm = 0
    elapsedS = 0
    autoPaused = false
    manualPause = false
    lastLocation = nil
    splits = []
    lastSplitElapsedS = 0
    let d = UserDefaults.standard
    d.removeObject(forKey: RecoverKeys.runId)
    d.removeObject(forKey: RecoverKeys.shoeId)
    d.removeObject(forKey: RecoverKeys.splits)
    d.removeObject(forKey: RecoverKeys.lastSplitElapsedS)
    phase = .idle
  }

  // ── 세션 복구 — 러닝 중 앱 사망 → watchOS 재실행(새 세션 아님, 유실 금지) ────
  /// 살아 있는 HKWorkoutSession 을 되찾아 입양한다. 활성 세션이 없으면 no-op.
  func recoverActiveSession() {
    guard phase == .idle, session == nil else { return }
    healthStore.recoverActiveWorkoutSession { [weak self] recovered, _ in
      guard let recovered else { return }
      Task { @MainActor in self?.adopt(recovered) }
    }
  }

  private func adopt(_ s: HKWorkoutSession) {
    guard phase == .idle, session == nil else { return }
    // 죽어 있던 구간에도 세션·빌더는 시스템이 유지한다 — 재연결만 하면 이어진다.
    let b = s.associatedWorkoutBuilder()
    b.dataSource = HKLiveWorkoutDataSource(
      healthStore: healthStore, workoutConfiguration: s.workoutConfiguration)
    s.delegate = self
    b.delegate = self
    session = s
    builder = b
    // 죽기 전 컨텍스트 복원 — runId(폰 중복 방어 일관)·신발 귀속·완료 랩.
    let d = UserDefaults.standard
    let savedRunId = d.string(forKey: RecoverKeys.runId) ?? ""
    runId = savedRunId.isEmpty ? "watch-" + UUID().uuidString.lowercased() : savedRunId
    let shoeId = d.string(forKey: RecoverKeys.shoeId) ?? ""
    currentShoe = WatchLink.shared.shoes.first { $0.id == shoeId } ?? WatchLink.shared.selectedShoe
    splits = (d.array(forKey: RecoverKeys.splits) as? [Double]) ?? []
    lastSplitElapsedS = d.double(forKey: RecoverKeys.lastSplitElapsedS)
    startDate = s.startDate
    // 표시 지표는 빌더 집계로 시드 — 죽어 있던 구간까지 포함된 진실원(유실 최소화).
    let now = Date()
    let e = b.elapsedTime(at: now)
    if e.isFinite, e >= 0 { elapsedS = e }
    if let dType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning),
       let sum = b.statistics(for: dType)?.sumQuantity() {
      let km = sum.doubleValue(for: .meter()) / 1000.0
      if km.isFinite, km > distanceKm { distanceKm = km }
    }
    autoPaused = false
    manualPause = s.state == .paused
    slowSec = 0
    fastSec = 0
    lastLocation = nil
    summary = nil
    if s.state == .ended {
      // 복구 시점에 이미 끝난 세션 — 요약 파이프라인으로 마감만 잇는다.
      finish(at: now)
      return
    }
    locationManager.allowsBackgroundLocationUpdates = true
    locationManager.startUpdatingLocation()
    phase = s.state == .paused ? .paused : .running
    startTimer()
  }

  // ── 종료 파이프라인: 수집 종료 → keego 메타데이터 → HealthKit 저장 → 요약 ────
  private func finish(at endDate: Date) {
    guard let b = builder else {
      buildSummary(endDate: endDate)
      return
    }
    // 메타데이터: 폰 동기화가 끊겨도 HealthKit 워크아웃만으로 신발 귀속이 가능하도록
    // keego 신발/런 id 를 태깅한다(스펙 §2 데이터 계약).
    let meta: [String: Any] = [
      "keego_shoe_id": currentShoe?.id ?? "",
      "keego_run_id": runId,
    ]
    b.addMetadata(meta) { _, _ in }
    b.endCollection(withEnd: endDate) { [weak self] _, _ in
      guard let self else { return }
      Task { @MainActor in
        // 표시 거리(GPS)가 비었으면(터널·실내 등 무픽스) 빌더 집계 거리로 폴백 —
        // Truth only: 두 소스를 섞지 않고 유효한 한쪽만 쓴다.
        if self.distanceKm <= 0, let b = self.builder,
           let dType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning),
           let sum = b.statistics(for: dType)?.sumQuantity() {
          let km = sum.doubleValue(for: .meter()) / 1000.0
          if km.isFinite, km > 0 { self.distanceKm = km }
        }
        self.builder?.finishWorkout { [weak self] _, _ in
          guard let self else { return }
          Task { @MainActor in self.buildSummary(endDate: endDate) }
        }
      }
    }
  }

  private func buildSummary(endDate: Date) {
    let start = startDate ?? endDate
    var avgBpm: Double = 0
    var kcal: Double = 0
    if let b = builder {
      if let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate),
         let avg = b.statistics(for: hrType)?.averageQuantity() {
        avgBpm = avg.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
      }
      if let enType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
         let sum = b.statistics(for: enType)?.sumQuantity() {
        kcal = sum.doubleValue(for: .kilocalorie())
      }
      // 시간의 진실원은 빌더(일시정지 자동 제외). 실패 시 표시값 유지(유실 금지).
      let e = b.elapsedTime(at: endDate)
      if e.isFinite, e >= 0 { elapsedS = e }
    }
    summary = RunSummary(
      runId: runId,
      shoeId: currentShoe?.id ?? "",
      shoeName: currentShoe?.displayName ?? "",
      km: max(0, distanceKm),
      durationS: max(0, elapsedS),
      avgBpm: max(0, avgBpm),
      kcal: max(0, kcal),
      startMs: start.timeIntervalSince1970 * 1000,
      endMs: endDate.timeIntervalSince1970 * 1000
    )
    phase = .ended
  }

  // ── 1초 시계 — 빌더 경과시간(일시정지 제외)을 화면에 흘린다 ─────────────────
  private func startTimer() {
    stopTimer()
    let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
      Task { @MainActor in
        guard let self, self.isActive, let b = self.builder else { return }
        let e = b.elapsedTime(at: Date())
        // 단조 증가 보장 — 시계가 뒤로 가는 순간을 화면에 노출하지 않는다.
        if e.isFinite, e >= self.elapsedS { self.elapsedS = e }
      }
    }
    RunLoop.main.add(t, forMode: .common)
    timer = t
  }

  private func stopTimer() {
    timer?.invalidate()
    timer = nil
  }

  // ── 자동 일시정지 상태기계(lib/autoPause.ts 미러 — 히스테리시스) ─────────────
  private func feedAutoPause(speedMps: Double, dtSec: Double) {
    guard dtSec > 0 else { return }
    if phase == .running {
      if speedMps < Self.autoPauseSpeedMps {
        slowSec += dtSec
        if slowSec >= Self.autoPauseHoldS {
          slowSec = 0
          fastSec = 0
          autoPaused = true
          session?.pause()
        }
      } else {
        slowSec = 0
      }
    } else if phase == .paused, autoPaused, !manualPause {
      if speedMps > Self.autoResumeSpeedMps {
        fastSec += dtSec
        if fastSec >= Self.autoResumeHoldS {
          fastSec = 0
          autoPaused = false
          session?.resume()
        }
      } else {
        fastSec = 0
      }
    }
  }

  // ── 심박존 분류(lib/analytics/hrZones.zoneOf 미러) ──────────────────────────
  // restHR 유효 시 여유심박(Karvonen), 아니면 %HRmax. 경계 Z1 50 … Z5 90%.
  static func zone(bpm: Double, maxHR: Double, restHR: Double) -> Int {
    guard bpm > 0, maxHR > 0 else { return 0 }
    let useHRR = restHR > 0 && restHR < maxHR
    let frac = useHRR ? (bpm - restHR) / (maxHR - restHR) : bpm / maxHR
    if frac >= 0.9 { return 5 }
    if frac >= 0.8 { return 4 }
    if frac >= 0.7 { return 3 }
    if frac >= 0.6 { return 2 }
    return 1
  }
}

// ── HKWorkoutSessionDelegate — 세션 상태가 phase 의 진실원 ─────────────────────
extension WorkoutManager: HKWorkoutSessionDelegate {
  nonisolated func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {
    Task { @MainActor in
      switch toState {
      case .running:
        if WorkoutManager.shared.phase != .ended { WorkoutManager.shared.phase = .running }
      case .paused:
        WorkoutManager.shared.phase = .paused
      case .ended:
        WorkoutManager.shared.finish(at: date)
      default:
        break
      }
    }
  }

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    // 세션 실패 — 지금까지의 데이터로 요약을 시도한다(유실 최소화).
    Task { @MainActor in
      guard WorkoutManager.shared.isActive else { return }
      WorkoutManager.shared.end()
    }
  }
}

// ── HKLiveWorkoutBuilderDelegate — 실시간 심박 → 화면 + 폰 스트림(기존 계약) ────
extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  nonisolated func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder,
    didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    guard let hrType = HKObjectType.quantityType(forIdentifier: .heartRate),
          collectedTypes.contains(hrType),
          let stats = workoutBuilder.statistics(for: hrType),
          let q = stats.mostRecentQuantity() else { return }
    let bpm = q.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
    WatchLink.shared.sendHeartRate(bpm)
    Task { @MainActor in WorkoutManager.shared.heartRate = bpm }
  }
}

// ── CLLocationManagerDelegate — GPS 증분 거리 + 자동 일시정지 피드 ─────────────
extension WorkoutManager: CLLocationManagerDelegate {
  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    Task { @MainActor in WorkoutManager.shared.process(locations: locations) }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // 일시적 GPS 실패는 조용히 무시 — 다음 픽스에서 이어간다(거리 유실 없음, 증분 방식).
  }

  private func process(locations: [CLLocation]) {
    for loc in locations {
      // 정확도 게이트: 무효(<0)·오차 과대 표본 폐기.
      guard loc.horizontalAccuracy >= 0, loc.horizontalAccuracy <= Self.maxAccuracyM else { continue }
      var sampleSpeed = max(0, loc.speed) // speed<0 = 무효 → 아래 증분으로 대체
      if let last = lastLocation {
        let dt = loc.timestamp.timeIntervalSince(last.timestamp)
        if dt > 0 {
          let meters = loc.distance(from: last)
          let derived = meters / dt
          if loc.speed < 0 { sampleSpeed = derived }
          // 스파이크 컷: 순간이동 표본은 거리에 넣지 않는다(팬텀 거리 방지).
          if phase == .running, derived <= Self.maxSpeedMps, meters.isFinite, meters >= 0 {
            distanceKm += meters / 1000.0
            // km 경계 통과 → 랩 마감(초/km, 빌더 시간 증분이라 일시정지 자동 제외).
            while distanceKm >= Double(splits.count + 1) {
              splits.append(max(0, elapsedS - lastSplitElapsedS))
              lastSplitElapsedS = elapsedS
              // 랩 영속 — 러닝 중 앱이 죽어도 완료 랩은 복구된다.
              let d = UserDefaults.standard
              d.set(splits, forKey: RecoverKeys.splits)
              d.set(lastSplitElapsedS, forKey: RecoverKeys.lastSplitElapsedS)
              // 랩 햅틱 — '화면 안 보는 러너'까지 닿는 유일한 인터페이스
              // (Garmin/COROS 자동 랩 관용, 리서치 2026-07-11 최강 근거 기능).
              WKInterfaceDevice.current().play(.notification)
            }
          }
          feedAutoPause(speedMps: sampleSpeed, dtSec: dt)
        }
      }
      lastLocation = loc
    }
  }
}
