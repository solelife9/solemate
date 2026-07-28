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
  /// 구간 스플릿(초/km) — 폰 RunDetail 페이스 그래프·paceTrack 사이드카. 비면 [].
  let splitsS: [Double]
  let startMs: Double
  let endMs: Double
  /// 트랙 자동랩 메타 — 폰 RunDetail 이 track_<id> 로 읽어 '트랙·Nm×N랩' 표시.
  /// 비트랙 런은 lapM 0 · lapTimesS []. (laps 수 = lapTimesS.count)
  let lapM: Double
  let lapTimesS: [Double]
  /// GPS 경로 — [lat,lon,lat,lon,…] 플랫 배열(WCSession plist 친화, ≤200점 다운샘플).
  /// 폰이 route_<id> 사이드카 + 레코드 route(클라우드 동기)로 저장해 지도를 그린다.
  let routeFlat: [Double]
  /// 경로 점과 1:1 짝인 고도 원자료(m). 측정 불가 지점은 .nan.
  /// ⚠️ 워치는 상승고도를 **계산하지 않는다**(2026-07-28) — 폰 lib/elevation.ts 가
  /// 기준고도 히스테리시스(±3m)로 한 벌만 계산한다. 종전 워치 자체 누적은 0.5m 증분을
  /// 다 더해 평지에서도 부풀었다(실측 274m vs 폰 33m).
  let routeAltFlat: [Double]

  var avgPaceSecPerKm: Double { km > 0.01 ? durationS / km : 0 }
}

@MainActor
final class WorkoutManager: NSObject, ObservableObject {
  // 폰 원격 명령(WatchLink)·startWatchApp(handle:)·UI 가 같은 세션을 제어하도록 공유.
  static let shared = WorkoutManager()

  // ── 라이브 지표(러닝 화면 구독) ─────────────────────────────────────────────
  @Published private(set) var phase: RunPhase = .idle
  /// 러닝 시작 전 3-2-1 카운트다운(3,2,1 → nil). nil 이 아니면 카운트다운 화면(ContentView).
  @Published private(set) var countdownValue: Int?
  @Published private(set) var heartRate: Double = 0
  @Published private(set) var distanceKm: Double = 0
  @Published private(set) var elapsedS: Double = 0
  /// 현재(순간·롤링) 페이스(초/km, 0 = 표본부족/정지 → "--"). 러닝 화면 메인 페이스.
  @Published private(set) var currentPaceSecPerKm: Double = 0
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

  /// 지금 이 순간의 경과시간(초) — 화면이 그릴 때마다 **직접 계산**한다.
  ///
  /// `elapsedS` 는 1초 Timer 가 밀어주는데, Always-On(손목 내림)에서는 그 Timer 가 돌지
  /// 않아 숫자가 멈춘다. 그 상태로 손목을 들면 "시간이 안 간다 = 앱이 죽었다"로 보인다
  /// (2026-07-28 민우님: "손목을 들어도 워치가 잘 안 켜져").
  /// 이 계산 프로퍼티는 벽시계에서 즉시 뽑으므로 언제 그려도 맞는 값이 나온다.
  /// 회계 규칙은 Timer 와 동일 — 시작 후 경과 − 일시정지 누적 − 진행 중 일시정지.
  var liveElapsedS: Double {
    guard let start = startDate, isActive else { return elapsedS }
    if phase == .paused { return elapsedS }  // 일시정지 중엔 동결(Timer 와 같은 계약)
    let ongoing = pauseStartDate.map { max(0, Date().timeIntervalSince($0)) } ?? 0
    let e = Date().timeIntervalSince(start) - pausedAccumS - ongoing
    return e.isFinite && e >= 0 ? max(e, elapsedS) : elapsedS
  }
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
  /// GPS 경로(폰 지도용 — 민우님 2026-07-24 "워치 런도 지도 나오게"): 채택 픽스를 10m
  /// 간격으로 씨닝해 모은다. 메모리 상한 2000점(울트라 대비) — 초과 시 절반 데시메이션,
  /// 전송 시 200점 균등 다운샘플(폰 simplifyRoute 규약과 동일).
  private var routePoints: [CLLocationCoordinate2D] = []
  /// 경로 점과 1:1로 짝지은 고도(m). 측정 불가 지점은 .nan — 폰이 그 점만 건너뛴다.
  /// 워치는 고도를 **계산하지 않고 원자료만 넘긴다**(누적 규칙은 폰 lib/elevation.ts 한 벌).
  private var routeAlts: [Double] = []
  private var lastRoutePoint: CLLocation?
  private var timer: Timer?
  private var countdownTimer: Timer?
  private var pendingStart: (shoe: WatchShoe, goal: RunGoal)?
  private var runId = ""
  private var startDate: Date?
  // 심박 시계열(경로 A) — 워크아웃 시작 기준 초 오프셋 + bpm. 종료 시 폰에 직송해
  // 폰이 주머니에 있어(실시간 스트림 놓침) hrTrack 이 비는 문제를 근본 해결한다.
  private var hrSamples: [(offsetS: Double, bpm: Double)] = []
  /// 누적 상승 고도(m) — process(locations) 가 GPS 고도 양의 증분으로 적산. 종료 시 요약에 실림.
  /// 현재(롤링) 페이스용 (경과초, 거리km) 샘플 — 최근 ~20s 창으로 순간 페이스 산출. 러너가
  /// 가장 자주 보는 실시간 지표(평균 페이스는 보조). 시작/리셋 시 비움.
  private var pacePoints: [(t: Double, d: Double)] = []
  // 종료 통계 스냅샷 — finishWorkout 호출 전에 확정한다. finishWorkout 이후엔 빌더의
  // statistics(for:) 가 nil 을 뱉어 심박·칼로리가 0(→ '--')이 되던 버그의 근본 수정.
  private var capturedAvgBpm: Double = 0
  private var capturedKcal: Double = 0
  private var capturedCadence: Double = 0
  // 거리 소스 — HK 융합거리(distanceWalkingRunning)가 정본(애플 방식, 일관·정확). GPS 누적은
  // HK 가 아직/전혀 값을 안 줄 때만 받치는 안전장치(0 방지). 섞지 않는다: hkAlive 가 된 뒤로는
  // 항상 HK 만 써서 같은 코스가 같은 거리로 나온다(하이브리드 금지 — 사용자 확정 2026-07-21).
  private var hkDistanceKm: Double = 0    // HK 융합 누적 거리(콜백에서 갱신)
  private var gpsDistanceKm: Double = 0   // GPS 증분 누적(HK 죽었을 때만 표시에 사용)
  /// HK 가 한 번이라도 유효 거리를 준 뒤 true — 이후 거리는 HK 정본. 러닝 화면에 소스
  /// 표시(HK/GPS)로도 노출해, 실기기에서 HK 융합거리가 실제로 살아있는지 눈으로 확인한다.
  @Published private(set) var hkAlive = false
  private var manualPause = false
  // km 스플릿 적산 — 직전 랩 마감 시점의 경과시간(빌더 시간, 일시정지 제외).
  private var lastSplitElapsedS: Double = 0
  // 자동 일시정지 상태기계(lib/autoPause.ts 미러) — 지속시간 적산기.
  private var slowSec: Double = 0
  private var fastSec: Double = 0
  // 경과시간 = 시작 후 벽시계 - 일시정지 누적. builder.elapsedTime(at:)이 '진행 중'인
  // 일시정지를 실시간으로 빼주지 않아(자동 일시정지 표시 중에도 시간이 흐르던 버그) 직접
  // 회계한다(폰 runTracker 의 pausedMs 방식). pauseStartDate: 현재 진행 중 일시정지 시작.
  private var pausedAccumS: Double = 0
  private var pauseStartDate: Date?

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

  // ── 3-2-1 카운트다운 → 시작 ────────────────────────────────────────────────
  /// 시작 버튼이 부른다 — 바로 세션을 열지 않고 3초 카운트다운 후 start(). 손목 준비 시간
  /// (애플 운동·나이키 관용). GPS-준비 표시는 없음(사용자 확정) — 순수 3-2-1.
  func beginCountdown(shoe: WatchShoe, goal: RunGoal = .free) {
    guard phase == .idle, countdownValue == nil else { return }
    pendingStart = (shoe, goal)
    countdownValue = 3
    if WatchLink.shared.hapticsOn { WKInterfaceDevice.current().play(.start) }
    countdownTimer?.invalidate()
    let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.tickCountdown() }
    }
    RunLoop.main.add(t, forMode: .common)
    countdownTimer = t
  }

  private func tickCountdown() {
    guard let v = countdownValue else { return }
    if v > 1 {
      countdownValue = v - 1
      if WatchLink.shared.hapticsOn { WKInterfaceDevice.current().play(.click) }
    } else {
      countdownTimer?.invalidate(); countdownTimer = nil
      countdownValue = nil
      if let p = pendingStart { pendingStart = nil; start(shoe: p.shoe, goal: p.goal) }
    }
  }

  /// 카운트다운 취소(화면 탭) — 세션 시작 전이라 그냥 시작 화면으로 되돌린다.
  func cancelCountdown() {
    countdownTimer?.invalidate(); countdownTimer = nil
    countdownValue = nil
    pendingStart = nil
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
      capturedAvgBpm = 0
      capturedKcal = 0
      capturedCadence = 0
      hkDistanceKm = 0
      gpsDistanceKm = 0
      hkAlive = false
      routePoints = []
    routeAlts = []
      routeAlts = []
      lastRoutePoint = nil
      pacePoints = []
      currentPaceSecPerKm = 0
      pausedAccumS = 0
      pauseStartDate = nil
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
      WatchVoice.shared.start() // 러닝 시작 음성(워치 단독+에어팟)
    } catch {
      phase = .idle
    }
  }

  // ── 일시정지 시간 회계 — 진행 중 일시정지 구간을 직접 적산해 경과시간에서 뺀다 ──────
  /// 일시정지 진입(수동·자동 공통) — 진행 중 일시정지 시작 시각을 찍는다(중복 방어).
  private func beginPauseAccounting() {
    if pauseStartDate == nil { pauseStartDate = Date() }
  }
  /// 일시정지 해제(수동·자동 공통) — 진행된 일시정지 구간을 누적에 더하고 진행 상태를 끈다.
  private func endPauseAccounting() {
    if let ps = pauseStartDate {
      pausedAccumS += max(0, Date().timeIntervalSince(ps))
      pauseStartDate = nil
    }
  }

  // ── 수동 일시정지/재개 ─────────────────────────────────────────────────────
  func pause() {
    guard phase == .running else { return }
    manualPause = true
    autoPaused = false
    beginPauseAccounting()
    session?.pause()
    notifyPauseState(paused: true)
  }

  func resume() {
    guard phase == .paused else { return }
    manualPause = false
    autoPaused = false
    fastSec = 0
    endPauseAccounting()
    session?.resume()
    notifyPauseState(paused: false)
  }

  /// 일시정지/재개를 **손목으로 느끼게** 알린다 — 햅틱 + 음성.
  ///
  /// 종전엔 화면만 바뀌어서, 달리다 멈췄을 때 손목을 들어 화면을 봐야만 상태를 알 수
  /// 있었다(2026-07-28 민우님 실기기: "됐는지 안 됐는지 손목을 들어서 터치해서 봐야 돼서
  /// 불편했어"). 러닝 중엔 화면을 못 보는 게 정상이라, 촉각과 소리로 알려야 한다.
  /// 햅틱은 애플 운동 앱과 같은 결로 정지=stop, 재개=start 를 쓴다.
  private func notifyPauseState(paused: Bool) {
    if WatchLink.shared.hapticsOn {
      WKInterfaceDevice.current().play(paused ? .stop : .start)
    }
    if paused { WatchVoice.shared.paused() } else { WatchVoice.shared.resumed() }
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

  /// 세션 실패 폴백 — 델리게이트(.ended)를 못 받을 수 있어(이미 실패한 세션) 요약 파이프라인이
  /// 멈춘 채 phase 가 .running 에 갇히던 회귀(감사) 수정. finish 를 직접 불러 지금까지의
  /// 데이터로 요약을 만든다(유실 최소화). 정상 종료는 end()→.ended 델리게이트 경로 유지.
  func failToSummary(at date: Date) {
    guard isActive else { return }
    locationManager.stopUpdatingLocation()
    locationManager.allowsBackgroundLocationUpdates = false
    stopTimer()
    finish(at: date)
  }

  /// 요약 화면 '완료' — 홈으로 초기화. 런 전송·로컬 저장은 정지 순간(buildSummary)에 이미
  /// 됐고, 여기선 안전을 위해 한 번 더 보낸다(폰 runId·RecentRuns 중복 제거 → 무해).
  func confirmSave() {
    if let s = summary {
      WatchLink.shared.sendRun(s)
      RecentRuns.save(s)
    }
    reset()
  }

  private func reset() {
    countdownTimer?.invalidate(); countdownTimer = nil
    countdownValue = nil
    pendingStart = nil
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
    capturedAvgBpm = 0
    capturedKcal = 0
    capturedCadence = 0
    hkDistanceKm = 0
    gpsDistanceKm = 0
    hkAlive = false
    routePoints = []
    routeAlts = []
    lastRoutePoint = nil
    pacePoints = []
    currentPaceSecPerKm = 0
    pausedAccumS = 0
    pauseStartDate = nil
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
    if e.isFinite, e >= 0 {
      elapsedS = e
      // 라이브 타이머의 직접 회계와 정합되도록 일시정지 누적을 역산해 시드한다
      // (벽시계 − 빌더경과 = 그동안의 일시정지 총합). pauseStartDate 는 복구 후 새로 판정.
      if let sd = s.startDate {
        pausedAccumS = max(0, now.timeIntervalSince(sd) - e)
      }
      pauseStartDate = nil
    }
    if let dType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning),
       let sum = b.statistics(for: dType)?.sumQuantity() {
      let km = sum.doubleValue(for: .meter()) / 1000.0
      // 복구 후에도 HK 정본 유지 — hkDistanceKm/hkAlive 를 시드해 이후 콜백과 정합.
      if km.isFinite, km > 0 { hkDistanceKm = km; hkAlive = true; gpsDistanceKm = km }
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
    // 시간(일시정지 제외) — 타이머와 동일한 직접 회계로 최종 확정. builder.elapsedTime 은
    // 진행 중 일시정지를 안 빼므로 쓰지 않는다(케이던스 분모로도 쓰이므로 먼저 확정).
    if let start = startDate {
      let ongoing = pauseStartDate.map { max(0, endDate.timeIntervalSince($0)) } ?? 0
      let e = endDate.timeIntervalSince(start) - pausedAccumS - ongoing
      if e.isFinite, e >= 0 { elapsedS = e }
    }
    // 트랙 미완주(랩 0) 폴백 — 표시 거리(랩수×랩거리)가 0 이면 GPS 누적(trackCumMeters)으로
    // 라도 기록해 무효 런(거리 0)으로 유실되는 것 방지(감사). 트랙은 여기서만 폴백.
    if isTrack, lapTimes.isEmpty, distanceKm <= 0, trackCumMeters > 0 {
      distanceKm = trackCumMeters / 1000.0
    }
    // 비트랙 거리: 표시값(GPS/HK)이 비었을 때만(터널·실내 무픽스) 빌더 집계로 폴백 —
    // Truth only: 두 소스를 섞지 않고 유효한 한쪽만 쓴다.
    if !isTrack, distanceKm <= 0,
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

  /// 균등 스트라이드 다운샘플 **인덱스**(폰 lib/geo.simplifyRoute 와 동일 규약).
  /// 좌표와 고도를 같은 인덱스로 뽑아야 짝이 어긋나지 않아, 배열이 아니라 인덱스를 돌려준다.
  private func downsampleIndices(count: Int, maxCount: Int) -> [Int] {
    guard count > 0 else { return [] }
    guard count > maxCount, maxCount >= 2 else { return Array(0..<count) }
    return (0..<maxCount).map { Swift.min(($0 * (count - 1)) / (maxCount - 1), count - 1) }
  }

  private func buildSummary(endDate: Date) {
    let start = startDate ?? endDate
    // 심박·칼로리·케이던스·시간·거리는 captureFinalStats(finishWorkout 전)에서 이미 확정됐다.
    // 여기서 빌더 통계를 다시 읽지 않는다 — finishWorkout 이후엔 nil 이라 0(→ '--')이 되기 때문.
    let avgBpm = capturedAvgBpm
    let kcal = capturedKcal
    let cadence = capturedCadence
    let trackRun = goal.kind == .track && !lapTimes.isEmpty
    // 경로 다운샘플(≤200점) → 플랫 배열. 2점 미만(실내·GPS 부재)은 빈 배열 — 폰이 지도 생략.
    let dsIdx = downsampleIndices(count: routePoints.count, maxCount: 200)
    let s = RunSummary(
      runId: runId,
      shoeId: currentShoe?.id ?? "",
      shoeName: currentShoe?.displayName ?? "",
      km: max(0, distanceKm),
      durationS: max(0, elapsedS),
      avgBpm: max(0, avgBpm),
      kcal: max(0, kcal),
      cadence: max(0, cadence),
      // 비트랙 = km 스플릿(초/km). 트랙은 랩타임을 lapTimesS 로 별도 전송하므로 여기선 [].
      splitsS: trackRun ? [] : splits,
      startMs: start.timeIntervalSince1970 * 1000,
      endMs: endDate.timeIntervalSince1970 * 1000,
      lapM: trackRun ? lapM : 0,
      lapTimesS: trackRun ? lapTimes : [],
      routeFlat: dsIdx.count >= 2 ? dsIdx.flatMap { [routePoints[$0].latitude, routePoints[$0].longitude] } : [],
      // 좌표와 **같은 인덱스**로 뽑아 짝을 지킨다(따로 다운샘플하면 어긋난다).
      routeAltFlat: dsIdx.count >= 2 ? dsIdx.map { $0 < routeAlts.count ? routeAlts[$0] : .nan } : []
    )
    summary = s
    // 완주 런 자동 전송(애플 피트니스 방식) — 정지 순간 바로 저장. 수동 '저장' 버튼을 안
    // 눌러도(요약 화면을 그냥 닫거나 워치가 잠겨도) 폰 기록·신발 차감이 유실되지 않는다.
    // 폰은 runId 로, 워치 로컬 기록은 RecentRuns 가 중복 제거하므로 '저장' 재전송도 안전.
    // km 0(무효 런)은 폰이 거른다(onWatchRun 계약) — 여기선 항상 보낸다(유실 금지 우선).
    WatchLink.shared.sendRun(s)
    RecentRuns.save(s)
    // 완주 요약 음성(워치 단독+에어팟) — "운동을 종료합니다…, N킬로미터, 경과 …, 평균 페이스 …".
    WatchVoice.shared.finishSummary(km: s.km, elapsedSec: s.durationS, avgPaceSec: s.avgPaceSecPerKm > 0 ? s.avgPaceSecPerKm : nil)
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

  // ── 1초 시계 — 경과시간(일시정지 제외)을 화면에 흘린다 ────────────────────────
  private func startTimer() {
    stopTimer()
    let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
      Task { @MainActor in
        guard let self, self.isActive, self.builder != nil else { return }
        // 경과시간 = 시작 후 벽시계 − 일시정지 누적 − 진행 중 일시정지. builder.elapsedTime(at:)
        // 은 '진행 중'인 일시정지를 실시간으로 빼주지 않아 자동 일시정지 표시 중에도 시간이
        // 흐르던 버그의 근본수정 — 일시정지 시간을 직접 회계한다(폰 runTracker pausedMs 방식).
        if let start = self.startDate {
          let ongoing = self.pauseStartDate.map { max(0, Date().timeIntervalSince($0)) } ?? 0
          let e = Date().timeIntervalSince(start) - self.pausedAccumS - ongoing
          // 단조 증가 보장 — 시계가 뒤로 가는 순간을 화면에 노출하지 않는다(일시정지 중엔 동결).
          if e.isFinite, e >= self.elapsedS { self.elapsedS = e }
        }
        // 현재(롤링) 페이스 갱신 + 목표 달성 판정(1초 granularity, 최신 거리 흡수).
        self.updateCurrentPace()
        self.checkGoalReached()
      }
    }
    RunLoop.main.add(t, forMode: .common)
    timer = t
  }

  /// km 경계 통과분을 랩으로 마감한다(초/km, 경과시간 증분이라 일시정지 자동 제외).
  /// GPS 거리 누적 직후 호출 — 완료 랩 영속(죽어도 복구) + 랩 햅틱(폰 설정 존중).
  private func advanceKmSplits() {
    while distanceKm >= Double(splits.count + 1) {
      splits.append(max(0, elapsedS - lastSplitElapsedS))
      lastSplitElapsedS = elapsedS
      let d = UserDefaults.standard
      d.set(splits, forKey: RecoverKeys.splits)
      d.set(lastSplitElapsedS, forKey: RecoverKeys.lastSplitElapsedS)
      // 랩 햅틱 — '화면 안 보는 러너'까지 닿는 유일한 인터페이스(Garmin/COROS 자동랩 관용).
      if WatchLink.shared.hapticsOn { WKInterfaceDevice.current().play(.notification) }
      // km 음성 안내(워치 단독+에어팟) — "N킬로미터, 페이스 …, 경과 …". 폰 없이도 안내.
      WatchVoice.shared.kmCue(splits.count, paceSec: splits.last, elapsedSec: elapsedS, lastKm: false)
    }
  }

  /// 표시 거리 재계산 — HK 가 살아있으면(hkAlive) HK 융합거리(정본), 아니면 GPS(폴백).
  /// 단조 증가만 반영하고, 새 km 경계를 넘겼으면 랩을 마감한다. process(GPS)·didCollectDataOf
  /// (HK) 양쪽에서 호출 — 두 소스가 같은 distanceKm 에 안전하게 수렴한다(@MainActor 직렬).
  /// 현재(순간) 페이스 — 최근 ~20s 창의 거리/시간. 창이 짧거나(<5s) 이동이 적으면(<20m)
  /// 0(→"--", 정지·초반 표본부족). 러닝 중에만 갱신, 일시정지엔 마지막 값 유지 후 정지 시 0.
  private func updateCurrentPace() {
    guard phase == .running else { return }
    pacePoints.append((t: elapsedS, d: distanceKm))
    while let first = pacePoints.first, elapsedS - first.t > 20 { pacePoints.removeFirst() }
    if let first = pacePoints.first {
      let dt = elapsedS - first.t
      let dd = distanceKm - first.d
      currentPaceSecPerKm = (dt >= 5 && dd > 0.02) ? dt / dd : 0
    }
  }

  private func recomputeDistance() {
    let d = hkAlive ? hkDistanceKm : gpsDistanceKm
    if d.isFinite, d > distanceKm {
      distanceKm = d
      advanceKmSplits()
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
    WatchVoice.shared.goal() // 목표 달성 음성
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
          beginPauseAccounting()
          session?.pause()
          notifyPauseState(paused: true)
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
          endPauseAccounting()
          session?.resume()
          notifyPauseState(paused: false)
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
    // 세션 실패 — end()(session.end→.ended 델리게이트 의존)가 아니라 finish 를 직접 불러
    // 요약을 만든다. 실패한 세션은 .ended 델리게이트가 안 올 수 있어 요약이 멈추던 회귀 수정.
    Task { @MainActor in WorkoutManager.shared.failToSummary(at: Date()) }
  }
}

// ── HKLiveWorkoutBuilderDelegate — 실시간 심박 → 화면 + 폰 스트림(기존 계약) ────
extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  nonisolated func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder,
    didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    // 심박 — 화면 + 폰 스트림(기존 계약). 거리와 독립 처리(예전엔 HR 없으면 거리도 스킵됐다).
    if let hrType = HKObjectType.quantityType(forIdentifier: .heartRate),
       collectedTypes.contains(hrType),
       let q = workoutBuilder.statistics(for: hrType)?.mostRecentQuantity() {
      let bpm = q.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
      WatchLink.shared.sendHeartRate(bpm)
      Task { @MainActor in
        WorkoutManager.shared.heartRate = bpm
        WorkoutManager.shared.recordHrSample(bpm) // 경로 A — 종료 시 폰 직송용 누적
      }
    }
    // 거리(HK 융합거리) — 애플 표준: 1초 폴링이 아니라 '컬렉션 콜백'에서 읽는다. 실기기에서
    // 거리가 0 에 멈추던 회귀의 근본 수정 시도(폴링 타이밍이 컬렉션과 안 맞아 nil→0 이던 것).
    // 유효 값이 오면 HK 를 정본으로 승격(hkAlive) → 그 뒤로 GPS 는 표시에 안 쓴다(일관성).
    if let dType = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning),
       collectedTypes.contains(dType),
       let sum = workoutBuilder.statistics(for: dType)?.sumQuantity() {
      let km = sum.doubleValue(for: .meter()) / 1000.0
      Task { @MainActor in
        guard km.isFinite, km > 0 else { return }
        WorkoutManager.shared.hkDistanceKm = km
        WorkoutManager.shared.hkAlive = true
        WorkoutManager.shared.recomputeDistance()
      }
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
            } else {
              // 비트랙 GPS 누적은 '폴백' 소스(HK 죽었을 때만 표시). 정본은 HK 융합거리로,
              // 컬렉션 콜백(didCollectDataOf)에서 갱신한다. 표시 거리는 recomputeDistance 가
              // HK 우선으로 고른다 — HK 살아있으면 GPS 는 표시에 안 쓰인다(일관성).
              gpsDistanceKm += meters / 1000.0
              recomputeDistance()
            }
          }
          // 상승 고도는 **여기서 계산하지 않는다**(2026-07-28 구조 변경).
          // 종전엔 0.5m 이상 증분을 전부 더했는데, GPS 고도 노이즈가 ±5~10m 라 평지에서도
          // 부풀었다 — 실측 5km 도심 러닝에서 274m(폰 33m, 8배). 폰은 lib/elevation.ts 가
          // 기준고도 히스테리시스(±3m)로 지터를 걸러내는데, 같은 러닝을 두 벌의 규칙으로
          // 계산하니 답이 갈렸다.
          // 이제 워치는 **고도 원자료만 실어 보내고**(routeAlts) 폰이 검증된 한 벌의 규칙으로
          // 계산한다. 워치로 뛰든 폰으로 뛰든 같은 숫자가 나오게 하는 게 목적이다.
          feedAutoPause(speedMps: sampleSpeed, dtSec: dt)
        }
      }
      // 경로 수집(폰 지도) — 러닝 중 채택 픽스만, 10m 씨닝 + 2000점 상한(초과 시 데시메이션).
      if phase == .running {
        if lastRoutePoint == nil || loc.distance(from: lastRoutePoint!) >= 10 {
          routePoints.append(loc.coordinate)
          // 고도 원자료를 좌표와 **짝지어** 모은다(폰이 lib/elevation.ts 로 계산할 재료).
          // 수직정확도가 없거나 값이 이상하면 .nan 을 넣어 자리를 지킨다 — 배열이 어긋나면
          // 좌표와 고도가 짝이 안 맞아 엉뚱한 고도가 붙는다.
          routeAlts.append(loc.verticalAccuracy > 0 && loc.altitude.isFinite ? loc.altitude : .nan)
          lastRoutePoint = loc
          if routePoints.count > 2000 {
            routePoints = stride(from: 0, to: routePoints.count, by: 2).map { routePoints[$0] }
            routeAlts = stride(from: 0, to: routeAlts.count, by: 2).map { routeAlts[$0] }
          }
        }
      }
      lastLocation = loc
    }
  }
}
