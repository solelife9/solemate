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
  override func supportedEvents() -> [String]! { return ["onHeartRate", "onWatchRun"] }
  override func startObserving() {
    hasListeners = true
    // 구독 전에 도착해 버퍼된 런 재생(JS 가 runId 로 중복 방어하므로 재생은 안전).
    DispatchQueue.main.async {
      guard self.hasListeners, !self.pendingRuns.isEmpty else { return }
      let queued = self.pendingRuns
      self.pendingRuns = []
      queued.forEach { self.sendEvent(withName: "onWatchRun", body: $0) }
    }
  }
  override func stopObserving() { hasListeners = false }

  // 워치 → 폰 수신 공통 처리. { "bpm" } = 실시간 심박, { "type": "run" } = 완주 런.
  private func handleInbound(_ payload: [String: Any]) {
    if let bpm = payload["bpm"] as? Double {
      DispatchQueue.main.async {
        if self.hasListeners { self.sendEvent(withName: "onHeartRate", body: ["bpm": bpm]) }
      }
      return
    }
    if (payload["type"] as? String) == "run" {
      // 숫자 필드를 Double 로 정규화해 그대로 JS 에 넘긴다(중복 방어는 JS 가 runId 로).
      var body: [String: Any] = [
        "runId": payload["runId"] as? String ?? "",
        "shoeId": payload["shoeId"] as? String ?? "",
      ]
      for key in ["km", "durationS", "avgBpm", "kcal", "startMs", "endMs"] {
        body[key] = (payload[key] as? NSNumber)?.doubleValue ?? 0
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
    if let hrMax = payload["hrMax"] as? NSNumber { patch["hrMax"] = hrMax.doubleValue }
    if let hrRest = payload["hrRest"] as? NSNumber { patch["hrRest"] = hrRest.doubleValue }
    guard !patch.isEmpty else { return }
    pushContext(patch)
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
