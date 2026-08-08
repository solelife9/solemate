// WatchSessionModule.swift — Apple Watch ↔ iPhone 연결(WatchConnectivity) 수신측
// ----------------------------------------------------------------------------
// 워치(Keego Watch)와의 폰측 계약(워치측 대응 = SoleMateWatch Watch App/WatchLink.swift):
//   · 워치 → 폰 { "bpm": Double } — 실시간 심박. RN 이벤트 'onHeartRate' 로 방출
//     (lib/watchSession.ts 가 구독 → 러닝 화면 심박 표시 + hrTrack 적립).
//   · 워치 → 폰 { "type": "run", runId, shoeId, km, durationS, avgBpm, kcal,
//     startMs, endMs } — 워치 단독 러닝 완주 페이로드(메시지 즉시 or userInfo 큐).
//     RN 이벤트 'onWatchRun' 으로 방출 — JS 가 runId 중복 방어 후 addRun(신발 차감).
//   · 폰 → 워치 applicationContext { "shoes": [...], "hrMax", "hrRest" } —
//     활성 신발 목록·심박존 파라미터(updateShoeContext, JS 가 변경 시마다 push).
//     컨텍스트는 '통째 교체'라 마지막 상태를 outboundContext 에 병합 유지한다 —
//     안 그러면 stop 폴백이 신발 목록을 지워버린다.
//   · 폰 → 워치 { "cmd": "start" | "stop" } — 폰 러닝 시작/종료에 워치 세션 연동.
//
// ⚠️ 이 파일은 'SoleMate'(앱) 타깃에 멤버십을 넣어야 한다(Xcode File Inspector).
import Foundation
import WatchConnectivity
import HealthKit
import React
import WidgetKit

@objc(WatchSessionModule)
class WatchSessionModule: RCTEventEmitter, WCSessionDelegate {
  private var hasListeners = false
  private let healthStore = HKHealthStore()
  // 폰 → 워치 applicationContext 의 마지막 병합 상태(통째-교체 API 보호용).
  private var outboundContext: [String: Any] = [:]
  // JS 구독 전에 도착한 완주 런 버퍼 — 큐 배달(transferUserInfo)은 앱 콜드런치 직후
  // RN 이 아직 구독하기 전에 올 수 있다. 심박(bpm)은 순간값이라 버리지만, 런 페이로드를
  // 떨어뜨리면 신발 차감이 유실되므로 리스너가 붙을 때까지 들고 있다가 재생한다.
  private var pendingRuns: [[String: Any]] = []
  // JS 구독 전에 도착한 워치 심박 기록 버퍼(경로 A). 콜드런치 직후 배달될 수 있어 리스너가
  // 붙을 때까지 들고 있다가 재생한다 — 심박 유실 방지(런 페이로드와 같은 이유).
  private var pendingHrTracks: [[String: Any]] = []
  // JS 구독 전에 도착한 워치의 정지 명령 버퍼(정지 미러링). 스테일 판정은 JS 가 cmdAt 로.
  private var pendingStops: [[String: Any]] = []

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
  override func supportedEvents() -> [String]! { return ["onHeartRate", "onWatchRun", "onWatchHrTrack", "onWatchStop"] }
  override func startObserving() {
    hasListeners = true
    // 구독 전에 도착해 버퍼된 정지·런·심박기록 재생(JS 가 runId·시간창·cmdAt 으로 방어).
    //
    // ⚠️ **순서가 중요하다: stops → runs → hrs.** 예전엔 runs 가 먼저였고, 그게 같은
    // 러닝을 두 건으로 만들었다(2026-08-08).
    //
    //   runs 먼저 → 워치 런이 도착하는 시점에 **폰 런은 아직 저장 전**이다(정지를 아직
    //   안 흘렸으므로 러닝이 살아 있다). 그래서 lib/runMerge 의 시간창 병합이 붙을
    //   대상을 못 찾고 새 레코드를 만든다. 뒤이어 stops 가 폰 런을 저장하면 두 건이 된다
    //   — 폰 저장 경로의 watchDup 검사는 그 사이 React 상태가 전파됐어야 성립하는데,
    //   같은 틱 안에서는 보장되지 않는다.
    //
    //   stops 먼저 → 폰 런이 먼저 확정 저장되고, 이어서 도착한 워치 런을 runMerge 가
    //   시간창으로 찾아 **합친다**. 상태 전파 타이밍에 기대지 않는다.
    //
    // hrs 는 런에 붙는 사이드카라 runs 뒤여야 한다(붙일 런이 있어야 한다).
    DispatchQueue.main.async {
      guard self.hasListeners else { return }
      let stops = self.pendingStops; self.pendingStops = []
      stops.forEach { self.sendEvent(withName: "onWatchStop", body: $0) }
      let runs = self.pendingRuns; self.pendingRuns = []
      runs.forEach { self.sendEvent(withName: "onWatchRun", body: $0) }
      let hrs = self.pendingHrTracks; self.pendingHrTracks = []
      hrs.forEach { self.sendEvent(withName: "onWatchHrTrack", body: $0) }
    }
  }
  override func stopObserving() { hasListeners = false }

  // 워치 → 폰 수신 공통 처리. { "bpm" } = 실시간 심박, { "type": "run" } = 완주 런,
  // { "cmd": "stop" } = 워치에서 러닝 종료(정지 미러링 — 폰 러닝도 함께 끝낸다).
  private func handleInbound(_ payload: [String: Any]) {
    if (payload["cmd"] as? String) == "stop" {
      // cmdAt(초) → ms. JS 가 '현재 러닝 시작 이후의 정지'만 존중한다(늦은 배달 스테일 방어).
      let body: [String: Any] = ["cmdAtMs": ((payload["cmdAt"] as? NSNumber)?.doubleValue ?? 0) * 1000]
      DispatchQueue.main.async {
        if self.hasListeners { self.sendEvent(withName: "onWatchStop", body: body) }
        else { self.pendingStops.append(body) } // 콜드런치 — 구독되면 startObserving 이 재생
      }
      return
    }
    if let bpm = payload["bpm"] as? Double {
      DispatchQueue.main.async {
        if self.hasListeners { self.sendEvent(withName: "onHeartRate", body: ["bpm": bpm]) }
      }
      return
    }
    if (payload["type"] as? String) == "hrtrack" {
      // 워치 직송 심박 기록(경로 A). 오프셋·bpm 배열을 그대로 JS 로 넘긴다(매칭은 JS 가 시간창으로).
      let body: [String: Any] = [
        "startMs": (payload["startMs"] as? NSNumber)?.doubleValue ?? 0,
        "endMs": (payload["endMs"] as? NSNumber)?.doubleValue ?? 0,
        "offsetS": (payload["hrT"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? [],
        "bpm": (payload["hrBpm"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? [],
      ]
      DispatchQueue.main.async {
        if self.hasListeners { self.sendEvent(withName: "onWatchHrTrack", body: body) }
        else { self.pendingHrTracks.append(body) } // 콜드런치 — 구독되면 startObserving 이 재생
      }
      return
    }
    if (payload["type"] as? String) == "run" {
      // 숫자 필드를 Double 로 정규화해 그대로 JS 에 넘긴다(중복 방어는 JS 가 runId 로).
      var body: [String: Any] = [
        "runId": payload["runId"] as? String ?? "",
        "shoeId": payload["shoeId"] as? String ?? "",
      ]
      for key in ["km", "durationS", "avgBpm", "kcal", "cadence", "elevGainM", "startMs", "endMs", "lapM", "laps"] {
        body[key] = (payload[key] as? NSNumber)?.doubleValue ?? 0
      }
      // 트랙 랩 시계열(초/랩) — 있으면 그대로 전달(비트랙 런은 빈 배열/부재).
      if let lapTimes = payload["lapTimes"] as? [Any] {
        body["lapTimes"] = lapTimes.compactMap { ($0 as? NSNumber)?.doubleValue }
      }
      // 구간 스플릿(초/km) — 폰 RunDetail 페이스 그래프·paceTrack 사이드카.
      if let splits = payload["splitsS"] as? [Any] {
        body["splitsS"] = splits.compactMap { ($0 as? NSNumber)?.doubleValue }
      }
      DispatchQueue.main.async {
        if self.hasListeners {
          self.sendEvent(withName: "onWatchRun", body: body)
        } else {
          self.pendingRuns.append(body) // 콜드런치 직후 — 구독되면 startObserving 이 재생
        }
      }
    }
  }

  // 워치 → 폰 실시간 메시지(앱이 reachable 일 때).
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    handleInbound(message)
  }

  // 비실시간 폴백(백그라운드 누적 전달·배달 보장 큐). 같은 페이로드 규약을 공유한다.
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    handleInbound(userInfo)
  }

  // 워치 → 폰 컨텍스트 폴백(비도달 시 최신 심박만 덮어쓰기 — 워치측 sendHeartRate 폴백 짝).
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    handleInbound(applicationContext)
  }

  // 폰 → 워치: 활성 신발 목록 + 심박존 파라미터 푸시(JS: watchSession.updateShoes).
  // payload = { shoes: [{id,brand,model,lifePct,condition}], hrMax?, hrRest? }.
  // applicationContext 는 오프라인 캐시라 워치가 꺼져 있어도 다음 실행 때 도착한다.
  @objc(updateShoeContext:)
  func updateShoeContext(_ payload: NSDictionary) {
    guard WCSession.isSupported() else { return }
    var patch: [String: Any] = [:]
    if let shoes = payload["shoes"] as? [[String: Any]] { patch["shoes"] = shoes }
    // 폰이 **지금 뛰려는 신발**. 워치는 이걸 몰라서 마지막 스와이프 신발로 세션을 열었고,
    // 신발이 다르면 병합 조건(shoe_id 동일)이 깨져 같은 러닝이 두 건 남았다(이중 차감).
    // 빈 문자열은 보내지 않는다 — 컨텍스트는 통째 교체라 빈 값이 유효한 선택을 지운다.
    if let sel = payload["selectedShoeId"] as? String, !sel.isEmpty { patch["selectedShoeId"] = sel }
    if let hrMax = payload["hrMax"] as? NSNumber { patch["hrMax"] = hrMax.doubleValue }
    if let hrRest = payload["hrRest"] as? NSNumber { patch["hrRest"] = hrRest.doubleValue }
    guard !patch.isEmpty else { return }
    pushContext(patch)
  }

  // 폰 → 워치: 최근 러닝 목록(워치 HistoryView 가 폰 런 + 워치 런을 합쳐 보여준다).
  // applicationContext 병합이라 워치가 꺼져 있어도 다음 실행 때 도착(오프라인 캐시).
  @objc(updateRecentRuns:)
  func updateRecentRuns(_ payload: NSDictionary) {
    guard WCSession.isSupported() else { return }
    if let runs = payload["runs"] as? [[String: Any]] {
      pushContext(["recentRuns": runs])
    }
  }

  // 폰 → 홈/잠금화면 위젯(신발 수명 링): 활성 신발 5필드를 App Group 공유 UserDefaults 에
  // 기록하고 위젯 타임라인을 즉시 리로드한다. JS(App.tsx)가 활성 신발이 바뀔 때마다 호출.
  // 위젯측 읽기 계약 = RunActivity/RunActivityBundle.swift(KeegoWidgetShared 키와 동일).
  // ⚠️ App Group(group.com.keego.app)이 앱·확장 양 타깃에 등록돼야 suite 가 열린다.
  // 미등록이면 suite=nil → 조용히 no-op(위젯은 샘플 폴백, 빌드·미설정 안전).
  @objc(updateWidgetShoe:)
  func updateWidgetShoe(_ payload: NSDictionary) {
    guard let d = UserDefaults(suiteName: "group.com.keego.app") else { return }
    d.set(payload["name"] as? String ?? "", forKey: "widget_shoe_name")
    d.set(payload["brand"] as? String ?? "", forKey: "widget_shoe_brand")
    d.set(payload["category"] as? String ?? "", forKey: "widget_shoe_category")
    d.set((payload["usedKm"] as? NSNumber)?.intValue ?? 0, forKey: "widget_shoe_used_km")
    d.set((payload["maxKm"] as? NSNumber)?.intValue ?? 0, forKey: "widget_shoe_max_km")
    WidgetCenter.shared.reloadAllTimelines()
  }

  // 폰 → 워치: 햅틱(진동) on/off 플래그. 워치의 자동 랩 진동·존 이탈 햅틱이 이를 존중한다.
  // applicationContext 병합이라 워치가 꺼져 있어도 다음 실행 때 도착한다(오프라인 캐시).
  @objc(setWatchHaptics:)
  func setWatchHaptics(_ enabled: Bool) {
    guard WCSession.isSupported() else { return }
    pushContext(["hapticsOn": enabled])
  }

  // outboundContext 에 병합 후 전송 — cmd 폴백과 신발 목록이 서로를 지우지 않는다.
  private func pushContext(_ patch: [String: Any]) {
    for (k, v) in patch { outboundContext[k] = v }
    try? WCSession.default.updateApplicationContext(outboundContext)
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

  // 폰 → 워치: 심박존 이탈 햅틱(#8). zoneCoach 가 음성 알림을 낼 때 짝으로 호출된다.
  // dir="up"(목표보다 낮음 → 올려라) / "down"(높음 → 낮춰라)을 워치 방향 햅틱으로 매핑.
  // 진동은 '지금'이 아니면 무의미하므로 도달 가능할 때만 즉시 전송(큐잉/폴백 없음).
  @objc(sendZoneHaptic:)
  func sendZoneHaptic(_ dir: NSString) {
    let cmd = (dir as String) == "up" ? "zone_up" : "zone_down"
    let s = WCSession.default
    guard s.activationState == .activated, s.isReachable else { return }
    s.sendMessage(["cmd": cmd], replyHandler: nil, errorHandler: nil)
  }

  // 폰 → 워치: 러닝 종료 시 워치 워크아웃도 종료(도달 가능하면 즉시, 아니면 컨텍스트 폴백).
  // cmdAt 을 함께 실어 직전 컨텍스트와 값이 달라지게 한다(동일 컨텍스트는 재전송 생략됨).
  @objc(stopWatchWorkout)
  func stopWatchWorkout() {
    let s = WCSession.default
    if s.isReachable {
      s.sendMessage(["cmd": "stop"], replyHandler: nil, errorHandler: nil)
    } else {
      pushContext(["cmd": "stop", "cmdAt": Date().timeIntervalSince1970])
    }
  }

  // 필수 델리게이트 스텁(iOS 측). 비활성 후 재활성으로 멀티-워치 전환을 견딘다.
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}
