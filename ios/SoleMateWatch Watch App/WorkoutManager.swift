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

/// 러닝 목표 종류. 자유(기본)·거리·시간·트랙. 값은 종류별로만 의미가 있다.
/// 자유 = 목표 미선택(시작 화면에서 바로 시작). UI 에 '자유' 선택지는 없다.
enum RunGoalKind: String, Equatable { case free, distance, time, track }

/// 러닝 목표 — 시작 시점에 확정, 러닝 내내 불변(표시·달성 판정용).
struct RunGoal: Equatable {
  var kind: RunGoalKind = .free
  var distanceKm: Double = 5.0    // .distance 목표 거리
  var minutes: Double = 30        // .time 목표 시간(분)
  var trackLapM: Double = 400     // .track 한 바퀴 예상 거리(m) — 첫 랩 GPS 보정
  static let free = RunGoal()

  /// 진행 바 분모 — 거리[km] / 시간[초]. 진행 바가 없는 종류(자유·트랙)는 0.
  var progressTarget: Double {
    switch kind {
    case .distance: return distanceKm
    case .time: return minutes * 60
    default: return 0
    }
  }
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
  /// 평균 케이던스(spm) — HK stepCount 합 / 경과분. 0 = 미측정.
  let cadence: Double
  /// 누적 상승 고도(m) — GPS 고도 양의 증분 적산(노이즈 게이트). 0 = 미측정.
  let elevGainM: Double
  /// 구간 스플릿(초/km) — 폰 RunDetail 페이스 그래프·paceTrack 사이드카. 비면 [].
  let splitsS: [Double]
  let startMs: Double
  let endMs: Double
  /// 트랙 자동랩 메타 — 폰 RunDetail 이 track_<id> 로 읽어 '트랙·Nm×N랩' 표시.
  /// 비트랙 런은 lapM 0 · lapTimesS []. (laps 수 = lapTimesS.count)
  let lapM: Double
  let lapTimesS: [Double]

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
  /// 이번 런의 목표(시작 시점 확정, 불변). 자유(.free)면 진행 바 없음.
  @Published private(set) var goal: RunGoal = .free
  /// 목표(거리/시간) 달성 순간 true 로 전환 — 러닝 화면이 축하 배너를 띄운다.
  /// 달성해도 러닝은 계속(강제 종료 안 함). 한 번만 전환한다(goalReachedFired).
  @Published private(set) var goalReached = false
  private var goalReachedFired = false
  /// 이번 런의 신발(시작 화면에서 선택). 러닝은 항상 신발과 함께 시작한다
  /// (2026-07-11 사용자 확정 — '신발 없이 시작' 제거). 옵셔널은 idle 상태 표현용.
  private(set) var currentShoe: WatchShoe?

  /// 목표 진행도 0~1 — 거리/시간 목표만(자유·트랙은 0 → 진행 바 숨김).
  var goalProgress: Double {
    let t = goal.progressTarget
    guard t > 0 else { return 0 }
    let cur = goal.kind == .distance ? distanceKm : elapsedS
    return min(1, max(0, cur / t))
  }
  /// 남은 양 한 줄("1.80km 남음" / "8:30 남음"). 진행 바 없는 종류는 nil.
  var goalRemainingText: String? {
    switch goal.kind {
    case .distance:
      return KeegoFormat.km(max(0, goal.distanceKm - distanceKm)) + "km 남음"
    case .time:
      return KeegoFormat.time(max(0, goal.minutes * 60 - elapsedS)) + " 남음"
    default:
      return nil
    }
  }
  /// 목표 요약 라벨(러닝 화면 상단 — "거리 5.0km" / "시간 30분" / "트랙 400m"). 자유는 nil.
  var goalHeaderText: String? {
    switch goal.kind {
    case .distance: return "거리 " + KeegoFormat.km(goal.distanceKm) + "km"
    case .time: return "시간 " + String(Int(goal.minutes)) + "분"
    case .track: return "트랙 " + String(Int(goal.trackLapM)) + "m"
    case .free: return nil
    }
  }

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

  // ── 트랙 자동랩(goal.kind == .track) — 폰 lib/laps.ts 이식 ────────────────────
  /// 완료된 랩의 소요시간(초/랩) — 트랙 랩 페이지. 거리는 랩수×확정 랩거리로 별도 산출.
  @Published private(set) var lapTimes: [Double] = []
  /// 확정 한 바퀴(m) — 시작 시 목표값, 첫 랩부터 GPS 로 보정(표준 스냅/비표준 채택).
  @Published private(set) var lapM: Double = 400
  /// 자동 보정이 방금 확정된 순간 true(1회) — 러닝 화면이 "약 Nm 감지" 토스트를 띄운다.
  @Published private(set) var lapJustCalibrated = false
  private var lapStart: CLLocation?      // 출발점(첫 채택 fix) — 복귀 감지 기준
  private var lapLeftRadius = false      // 이번 랩에서 출발 반경을 벗어난 적 있나
  private var lapLocked = false          // 랩거리 확정 후 재평가 안 함(거리 안 튐)
  private var trackCumMeters = 0.0       // 트랙 GPS 누적(m) — 보정 분모(표시 거리 아님)

  var isTrack: Bool { goal.kind == .track }
  /// 진행 중 랩 번호(1-based)와 그 경과시간 — 트랙 랩 페이지 '진행' 표시.
  var currentTrackLap: Int { lapTimes.count + 1 }
  var currentTrackLapElapsedS: Double { max(0, elapsedS - lastSplitElapsedS) }

  // ── 내부 상태 ────────────────────────────────────────────────────────────
  private let healthStore = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private let locationManager = CLLocationManager()
  private var lastLocation: CLLocation?
  private var timer: Timer?
  private var runId = ""
  private var startDate: Date?
  // 심박 시계열(경로 A) — 워크아웃 시작 기준 초 오프셋 + bpm. 종료 시 폰에 직송해
  // 폰이 주머니에 있어(실시간 스트림 놓침) hrTrack 이 비는 문제를 근본 해결한다.
  private var hrSamples: [(offsetS: Double, bpm: Double)] = []
  /// 누적 상승 고도(m) — process(locations) 가 GPS 고도 양의 증분으로 적산. 종료 시 요약에 실림.
  private var elevGainM: Double = 0
  // 종료 통계 스냅샷 — finishWorkout 호출 전에 확정한다. finishWorkout 이후엔 빌더의
  // statistics(for:) 가 nil 을 뱉어 심박·칼로리가 0(→ '--')이 되던 버그의 근본 수정.
  private var capturedAvgBpm: Double = 0
  private var capturedKcal: Double = 0
  private var capturedCadence: Double = 0
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
  /// 트랙 자동랩 — 출발점 복귀 판정 반경(m)·표준 랩거리·비표준 채택 랩수(폰 laps.ts 미러).
  private static let lapRadiusM = 12.0
  private static let standardLapM: [Double] = [200, 300, 400]
  private static let nonstdAdoptLaps = 3

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
      if let st = HKObjectType.quantityType(forIdentifier: .stepCount) { read.insert(st) }  // 평균 케이던스용
      let share: Set<HKSampleType> = [HKObjectType.workoutType()]
      healthStore.requestAuthorization(toShare: share, read: read) { _, _ in }
    }
    if locationManager.authorizationStatus == .notDetermined {
      locationManager.requestWhenInUseAuthorization()
    }
  }

  // ── 시작 — 신발 필수(shoe-first, 신발 동기화 후에만 러닝) ────────────────────
  // goal 미지정 = 자유런(신발 화면에서 바로 시작). 목표 패널은 goal 을 실어 호출한다.
  func start(shoe: WatchShoe, goal: RunGoal = .free) {
    guard phase == .idle else { return }
    self.goal = goal
    goalReached = false
    goalReachedFired = false
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
      hrSamples = []
      elevGainM = 0
      capturedAvgBpm = 0
      capturedKcal = 0
      capturedCadence = 0
      splits = []
      lastSplitElapsedS = 0
      summary = nil
      // 트랙 자동랩 초기화 — 랩거리는 목표 선택값에서 시작(첫 랩 GPS 로 보정).
      lapTimes = []
      lapM = goal.kind == .track ? goal.trackLapM : 400
      lapJustCalibrated = false
      lapStart = nil
      lapLeftRadius = false
      lapLocked = false
      trackCumMeters = 0
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
  /// notifyPhone: 워치에서 사용자가 직접 종료한 경우에만 true — 폰 러닝도 함께 종료
  /// (정지 미러링, 2026-07-18). 폰이 시킨 종료·세션 실패 폴백은 false(되울림/오발 금지).
  func end(notifyPhone: Bool = false) {
    guard isActive else { return }
    if notifyPhone { WatchLink.shared.sendStopToPhone() }
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
    elevGainM = 0
    capturedAvgBpm = 0
    capturedKcal = 0
    capturedCadence = 0
    splits = []
    lastSplitElapsedS = 0
    goal = .free
    goalReached = false
    goalReachedFired = false
    lapTimes = []
    lapM = 400
    lapJustCalibrated = false
    lapStart = nil
    lapLeftRadius = false
    lapLocked = false
    trackCumMeters = 0
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
        // 통계 스냅샷은 반드시 finishWorkout '전'에 — 이후엔 statistics(for:) 가 nil 을
        // 반환해 심박·칼로리가 0(→ '--')이 되는 근본 원인이었다. 거리·시간·심박·칼로리·
        // 케이던스를 이 시점에 한 번에 확정한다(단일 진실 시점).
        self.captureFinalStats(endDate: endDate)
        self.builder?.finishWorkout { [weak self] _, _ in
          guard let self else { return }
          Task { @MainActor in self.buildSummary(endDate: endDate) }
        }
      }
    }
  }

  /// finishWorkout 직전, 빌더 통계를 전부 스냅샷한다. 종료 요약의 심박·칼로리·케이던스·
  /// (무픽스 시)거리·시간을 이 한 곳에서 확정 — finishWorkout 이후 statistics 무효화 대비.
  private func captureFinalStats(endDate: Date) {
    guard let b = builder else { return }
    // 시간(일시정지 자동 제외) — 케이던스 분모로도 쓰이므로 먼저 확정.
    let e = b.elapsedTime(at: endDate)
    if e.isFinite, e >= 0 { elapsedS = e }
    // 거리: 표시값(HK 융합)이 비었을 때만(터널·실내 무픽스) 빌더 집계로 폴백 —
    // Truth only: 두 소스를 섞지 않고 유효한 한쪽만 쓴다.
    if distanceKm <= 0,
       let dType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning),
       let sum = b.statistics(for: dType)?.sumQuantity() {
      let km = sum.doubleValue(for: .meter()) / 1000.0
      if km.isFinite, km > 0 { distanceKm = km }
    }
    if let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate),
       let avg = b.statistics(for: hrType)?.averageQuantity() {
      capturedAvgBpm = avg.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
    }
    if let enType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
       let sum = b.statistics(for: enType)?.sumQuantity() {
      capturedKcal = sum.doubleValue(for: .kilocalorie())
    }
    // 평균 케이던스(spm) = 총 걸음수 ÷ 경과분(빌더 시간, 일시정지 제외). 30초 미만·0분은 무시.
    if let stType = HKQuantityType.quantityType(forIdentifier: .stepCount),
       let steps = b.statistics(for: stType)?.sumQuantity()?.doubleValue(for: .count()),
       elapsedS > 30 {
      capturedCadence = steps / (elapsedS / 60.0)
    }
  }

  private func buildSummary(endDate: Date) {
    let start = startDate ?? endDate
    // 심박·칼로리·케이던스·시간·거리는 captureFinalStats(finishWorkout 전)에서 이미 확정됐다.
    // 여기서 빌더 통계를 다시 읽지 않는다 — finishWorkout 이후엔 nil 이라 0(→ '--')이 되기 때문.
    let avgBpm = capturedAvgBpm
    let kcal = capturedKcal
    let cadence = capturedCadence
    let trackRun = goal.kind == .track && !lapTimes.isEmpty
    summary = RunSummary(
      runId: runId,
      shoeId: currentShoe?.id ?? "",
      shoeName: currentShoe?.displayName ?? "",
      km: max(0, distanceKm),
      durationS: max(0, elapsedS),
      avgBpm: max(0, avgBpm),
      kcal: max(0, kcal),
      cadence: max(0, cadence),
      elevGainM: max(0, elevGainM),
      // 비트랙 = km 스플릿(초/km). 트랙은 랩타임을 lapTimesS 로 별도 전송하므로 여기선 [].
      splitsS: trackRun ? [] : splits,
      startMs: start.timeIntervalSince1970 * 1000,
      endMs: endDate.timeIntervalSince1970 * 1000,
      lapM: trackRun ? lapM : 0,
      lapTimesS: trackRun ? lapTimes : []
    )
    // 심박 기록 직송(경로 A) — 수동 '저장'과 무관하게 종료 시 항상 보낸다. 폰이 주머니에
    // 있어(실시간 스트림 놓침) 폰 런의 hrTrack 이 비는 문제를 근본 해결한다(배달 보장 큐).
    if hrSamples.count >= 2 {
      WatchLink.shared.sendHrTrack(
        startMs: start.timeIntervalSince1970 * 1000,
        endMs: endDate.timeIntervalSince1970 * 1000,
        offsetsS: hrSamples.map { $0.offsetS },
        bpms: hrSamples.map { $0.bpm }
      )
    }
    phase = .ended
  }

  /// 심박 시계열 누적(경로 A). 워크아웃 시작 기준 초 오프셋 + bpm. 노이즈·상한(6000)만 컷.
  func recordHrSample(_ bpm: Double) {
    guard bpm > 30, bpm < 240, let start = startDate else { return }
    let offset = Date().timeIntervalSince(start)
    guard offset >= 0, hrSamples.count < 6000 else { return }
    hrSamples.append((offsetS: offset, bpm: bpm))
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
        // 비트랙 거리 = 애플 HealthKit 융합거리(distanceWalkingRunning). raw GPS 점-점 누적보다
        // 정확(GPS+가속도계 센서융합 = 가민급). 러닝 중·단조 증가만 반영, km 경계는 즉시 랩 마감.
        // 트랙 모드는 랩기반(detectTrackLap)이 진실원이라 건드리지 않는다.
        if self.phase == .running, !self.isTrack,
           let dType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning),
           let m = b.statistics(for: dType)?.sumQuantity()?.doubleValue(for: .meter()),
           m.isFinite, m >= 0 {
          let km = m / 1000.0
          if km > self.distanceKm {
            self.distanceKm = km
            self.advanceKmSplits()
          }
        }
        // 목표 달성 판정(1초 granularity — 위 거리 갱신 후라 최신 거리를 흡수).
        self.checkGoalReached()
      }
    }
    RunLoop.main.add(t, forMode: .common)
    timer = t
  }

  /// km 경계 통과분을 랩으로 마감한다(초/km, 빌더 시간 증분이라 일시정지 자동 제외).
  /// HK 융합거리가 갱신된 직후 호출 — 완료 랩 영속(죽어도 복구) + 랩 햅틱(폰 설정 존중).
  private func advanceKmSplits() {
    while distanceKm >= Double(splits.count + 1) {
      splits.append(max(0, elapsedS - lastSplitElapsedS))
      lastSplitElapsedS = elapsedS
      let d = UserDefaults.standard
      d.set(splits, forKey: RecoverKeys.splits)
      d.set(lastSplitElapsedS, forKey: RecoverKeys.lastSplitElapsedS)
      // 랩 햅틱 — '화면 안 보는 러너'까지 닿는 유일한 인터페이스(Garmin/COROS 자동랩 관용).
      if WatchLink.shared.hapticsOn { WKInterfaceDevice.current().play(.notification) }
    }
  }

  private func stopTimer() {
    timer?.invalidate()
    timer = nil
  }

  // ── 목표 달성 — 거리/시간 목표가 처음 도달한 순간 1회 배너+햅틱(강제 종료 안 함) ──
  private func checkGoalReached() {
    guard !goalReachedFired, phase == .running else { return }
    let t = goal.progressTarget
    guard t > 0 else { return }
    let cur = goal.kind == .distance ? distanceKm : elapsedS
    guard cur >= t else { return }
    goalReachedFired = true
    goalReached = true
    // 목표 달성 햅틱 — 폰 햅틱 설정 존중(끈 사용자에겐 조용히).
    if WatchLink.shared.hapticsOn { WKInterfaceDevice.current().play(.success) }
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

  // ── 트랙 자동랩 — 출발점 복귀 감지 + 랩거리 보정(lib/laps.ts 이식) ────────────
  /// 새 GPS 픽스마다 호출(트랙 모드). 출발 반경을 벗어났다가 다시 들어오는 순간 = 1랩.
  private func detectTrackLap(at loc: CLLocation) {
    guard let start = lapStart else { lapStart = loc; return }
    let d = loc.distance(from: start)
    if !lapLeftRadius {
      if d > Self.lapRadiusM { lapLeftRadius = true }   // 반경 밖으로 나감
    } else if d <= Self.lapRadiusM {
      registerTrackLap()                                 // 복귀 = 랩 완료
      lapLeftRadius = false
    }
  }

  /// 랩 완료 — 소요시간 적산 + 랩거리 보정 + 거리(랩수×랩거리) 갱신 + 햅틱.
  private func registerTrackLap() {
    lapTimes.append(max(0, elapsedS - lastSplitElapsedS))
    lastSplitElapsedS = elapsedS
    let n = lapTimes.count
    if !lapLocked {
      let measuredM = trackCumMeters / Double(max(1, n))
      let cal = Self.calibrateTrackLapM(measuredM: measuredM, lapsSoFar: n, currentLapM: lapM)
      if cal.locked { lapLocked = true }
      if cal.changed {
        lapM = cal.lapM
        lapJustCalibrated = true   // 러닝 화면이 소비 후 리셋(consumeLapCalibrated)
      }
    }
    // 트랙 거리 = 랩수 × 확정 랩거리(GPS 누적 아님 — 폰 trackMode 와 동일).
    distanceKm = Double(n) * lapM / 1000.0
    // 랩 햅틱 — 화면 안 보는 러너까지 닿는 유일한 인터페이스(폰 햅틱 설정 존중).
    if WatchLink.shared.hapticsOn { WKInterfaceDevice.current().play(.notification) }
  }

  /// 러닝 화면이 "약 Nm 감지" 토스트를 한 번 띄운 뒤 호출 — 플래그 소등.
  func consumeLapCalibrated() { lapJustCalibrated = false }

  /// 랩거리 보정(폰 lib/laps.ts calibrateLapM 미러). 표준(200/300/400) 6% 내 → 즉시 스냅+lock,
  /// 비표준 → 3랩 평균 후 5m 반올림 채택+lock. 그 전엔 선택 유지·미lock.
  static func calibrateTrackLapM(measuredM: Double, lapsSoFar: Int, currentLapM: Double)
    -> (lapM: Double, changed: Bool, locked: Bool) {
    guard measuredM.isFinite, measuredM > 0 else { return (currentLapM, false, false) }
    var best: (std: Double, diff: Double)?
    for std in standardLapM {
      let diff = abs(measuredM - std) / std
      if diff <= 0.06, best == nil || diff < best!.diff { best = (std, diff) }
    }
    if let b = best {
      return (b.std, Int(b.std) != Int(currentLapM), true)   // 표준 스냅 → 1랩부터 lock
    }
    if lapsSoFar >= nonstdAdoptLaps {
      let adopted = (measuredM / 5).rounded() * 5
      return (adopted, Int(adopted) != Int(currentLapM), true)
    }
    return (currentLapM, false, false)                        // 비표준·표본 부족 → 유지
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
    Task { @MainActor in
      WorkoutManager.shared.heartRate = bpm
      WorkoutManager.shared.recordHrSample(bpm) // 경로 A — 종료 시 폰 직송용 누적
    }
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
            if isTrack {
              // 트랙 모드: GPS 누적은 랩거리 보정용(표시 거리는 랩수×랩거리). 출발점 복귀 = 랩.
              trackCumMeters += meters
              detectTrackLap(at: loc)
            }
            // 비트랙 거리는 애플 HealthKit 융합(distanceWalkingRunning)로 타이머에서 갱신한다
            // (updateDistanceFromHK). raw GPS 점-점 누적은 폐지 — 가민 대비 과소측정의 뿌리였다.
            // GPS 는 오토포즈·상승고도·트랙 랩 감지 용도로만 남긴다(최상급 거리 = 애플 센서융합).
          }
          // 상승 고도(누적) — GPS 고도의 양의 증분만 적산. 수직정확도 게이트 + 0.5m 노이즈
          // 임계(미세 지터 무시) + 30m 스파이크 컷. 거리 소스와 무관(고도는 GPS 유지).
          if phase == .running, loc.verticalAccuracy > 0, loc.altitude.isFinite, last.altitude.isFinite {
            let dAlt = loc.altitude - last.altitude
            if dAlt > 0.5, dAlt < 30 { elevGainM += dAlt }
          }
          feedAutoPause(speedMps: sampleSpeed, dtSec: dt)
        }
      }
      lastLocation = loc
    }
  }
}
