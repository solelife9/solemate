// WatchLink.swift — 워치 ↔ 폰 WatchConnectivity 단일 창구(워치측)
// ----------------------------------------------------------------------------
// 폰 브리지(ios/SoleMate/WatchSessionModule.swift)와의 계약을 한 곳에서 소유한다:
//   · 폰 → 워치 applicationContext:
//       { "shoes": [{id, brand, model, lifePct, condition, usedKm, maxKm}] — 활성 신발
//         전체(홈과 같은 최근착용순), "hrMax": Double, "hrRest": Double — 심박존 파라미터,
//         "cmd": "stop" + "cmdAt" — 도달 불가 시 원격 종료 폴백 }
//   · 폰 → 워치 message: { "cmd": "start" | "stop" } — 폰 러닝 시작/종료에 워치 연동.
//   · 워치 → 폰 message/context: { "bpm": Double } — 실시간 심박(기존 계약 유지).
//   · 워치 → 폰 message/userInfo: { "type": "run", runId, shoeId, km, durationS,
//       avgBpm, kcal, startMs, endMs } — 단독 러닝 완주 페이로드. reachable 이면
//       sendMessage(실패 시 transferUserInfo 폴백), 아니면 transferUserInfo(큐잉 —
//       폰 복귀 시 자동 배달). 폰 JS 는 runId 로 중복 수신을 걸러낸다.
//
// 신발 목록·선택·심박존 파라미터는 UserDefaults 에 캐시해 폰이 없어도(단독 실행)
// 마지막 동기화 상태로 동작한다. 'SoleMateWatch Watch App' 타깃 멤버십.
import Foundation
import Combine
import WatchConnectivity

/// 폰이 푸시하는 활성 신발(표시용 캐시). 폰 Shoe(brand/model/수명%)의 워치 미러.
struct WatchShoe: Codable, Identifiable, Equatable {
  let id: String
  let brand: String
  let model: String
  /// 남은 수명 % (0–100).
  let lifePct: Int
  /// 컨디션 '양호'/'주의'/'교체' — 의미색(GOOD/WARN/DANGER) 매핑용.
  let condition: String
  /// 사용 거리 km(폰이 반올림 정수로 푸시).
  let usedKm: Int
  /// 수명 한도 km. 0 = 미수신(구버전 폰 캐시) — 시작 화면이 사용/남음 줄을 생략한다.
  let maxKm: Int

  /// 남은 거리 km(음수 금지 — 수명 초과는 0).
  var remainKm: Int { max(0, maxKm - usedKm) }

  var displayName: String {
    let name = [brand, model].filter { !$0.isEmpty }.joined(separator: " ")
    return name.isEmpty ? "신발" : name
  }
}

extension WatchShoe {
  /// 구버전 캐시(usedKm/maxKm 가 없던 JSON)도 그대로 열리도록 결측은 0 으로 채운다.
  /// (본체가 아닌 extension 구현 — 멤버와이즈 이니셜라이저를 보존하기 위해.)
  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    brand = try c.decodeIfPresent(String.self, forKey: .brand) ?? ""
    model = try c.decodeIfPresent(String.self, forKey: .model) ?? ""
    lifePct = try c.decodeIfPresent(Int.self, forKey: .lifePct) ?? 0
    condition = try c.decodeIfPresent(String.self, forKey: .condition) ?? "양호"
    usedKm = try c.decodeIfPresent(Int.self, forKey: .usedKm) ?? 0
    maxKm = try c.decodeIfPresent(Int.self, forKey: .maxKm) ?? 0
  }
}

@MainActor
final class WatchLink: NSObject, ObservableObject {
  static let shared = WatchLink()

  /// 폰에서 마지막으로 동기화된 활성 신발 목록(최근착용순). 비어 있으면 '동기화 대기'.
  @Published private(set) var shoes: [WatchShoe] = []
  /// 시작 화면에서 마지막으로 고른 신발 id — 다음 실행 시 그 페이지에서 시작한다.
  @Published var selectedShoeId: String? {
    didSet { defaults.set(selectedShoeId, forKey: Keys.selectedShoe) }
  }
  /// 심박존 파라미터(폰 설정 미러 — Tanaka 최대심박·안정시심박). 0 = 미설정.
  private(set) var hrMax: Double = 0
  private(set) var hrRest: Double = 0

  private let defaults = UserDefaults.standard
  private enum Keys {
    static let shoes = "keego_shoes_v1"
    static let selectedShoe = "keego_selected_shoe_v1"
    static let hrMax = "keego_hr_max_v1"
    static let hrRest = "keego_hr_rest_v1"
  }

  override init() {
    super.init()
    // 오프라인 캐시 복원 — 폰 없이 켜도 마지막 동기화 상태로 시작한다.
    if let raw = defaults.data(forKey: Keys.shoes),
       let cached = try? JSONDecoder().decode([WatchShoe].self, from: raw) {
      shoes = cached
    }
    selectedShoeId = defaults.string(forKey: Keys.selectedShoe)
    hrMax = defaults.double(forKey: Keys.hrMax)
    hrRest = defaults.double(forKey: Keys.hrRest)
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  /// 현재 선택된 신발(마지막 선택 → 목록 밖이면 첫 신발 폴백). 목록이 비면 nil.
  var selectedShoe: WatchShoe? {
    if let id = selectedShoeId, let s = shoes.first(where: { $0.id == id }) { return s }
    return shoes.first
  }

  // ── 수신: 폰 → 워치 ───────────────────────────────────────────────────────
  /// applicationContext 적용. allowCmd=false 는 활성화 시점의 저장분 재생 —
  /// 지난 "stop" 명령이 새 세션을 죽이지 않게 cmd 는 '막 도착한' 컨텍스트만 따른다.
  private func apply(context: [String: Any], allowCmd: Bool) {
    if let rawShoes = context["shoes"] as? [[String: Any]] {
      let parsed = rawShoes.compactMap { d -> WatchShoe? in
        guard let id = d["id"] as? String, !id.isEmpty else { return nil }
        return WatchShoe(
          id: id,
          brand: d["brand"] as? String ?? "",
          model: d["model"] as? String ?? "",
          lifePct: max(0, min(100, (d["lifePct"] as? NSNumber)?.intValue ?? 0)),
          condition: d["condition"] as? String ?? "양호",
          usedKm: max(0, (d["usedKm"] as? NSNumber)?.intValue ?? 0),
          maxKm: max(0, (d["maxKm"] as? NSNumber)?.intValue ?? 0)
        )
      }
      shoes = parsed
      if let raw = try? JSONEncoder().encode(parsed) { defaults.set(raw, forKey: Keys.shoes) }
    }
    if let v = (context["hrMax"] as? NSNumber)?.doubleValue, v > 0 {
      hrMax = v
      defaults.set(v, forKey: Keys.hrMax)
    }
    if let v = (context["hrRest"] as? NSNumber)?.doubleValue, v >= 0 {
      hrRest = v
      defaults.set(v, forKey: Keys.hrRest)
    }
    if allowCmd, let cmd = context["cmd"] as? String { handle(cmd: cmd) }
  }

  private func handle(cmd: String) {
    switch cmd {
    case "start":
      // 폰에서 러닝 시작 — 보통 startWatchApp(handle:)로 이미 세션이 뜨므로 idempotent.
      // 신발 미동기화면 시작하지 않는다(2026-07-11 확정 — 러닝은 신발과 함께만).
      if !WorkoutManager.shared.isActive, let shoe = selectedShoe {
        WorkoutManager.shared.start(shoe: shoe)
      }
    case "stop":
      WorkoutManager.shared.end()
    default:
      break
    }
  }

  // ── 송신: 워치 → 폰 ───────────────────────────────────────────────────────
  /// 실시간 심박 스트림(기존 계약 그대로 { "bpm": Double }).
  nonisolated func sendHeartRate(_ bpm: Double) {
    let s = WCSession.default
    guard s.activationState == .activated else { return }
    if s.isReachable {
      s.sendMessage(["bpm": bpm], replyHandler: nil, errorHandler: nil)
    } else {
      // 폰 비도달 — 최신값만 덮어쓰는 컨텍스트 폴백(기존 동작 유지).
      try? s.updateApplicationContext(["bpm": bpm])
    }
  }

  /// 완주 런 페이로드 전송. 즉시(메시지) → 실패/비도달 시 큐(transferUserInfo).
  /// transferUserInfo 는 배달이 보장되므로 폰이 멀어도 복귀 시 신발 차감이 이뤄진다.
  func sendRun(_ summary: RunSummary) {
    let payload: [String: Any] = [
      "type": "run",
      "runId": summary.runId,
      "shoeId": summary.shoeId,
      "km": summary.km,
      "durationS": summary.durationS,
      "avgBpm": summary.avgBpm,
      "kcal": summary.kcal,
      "startMs": summary.startMs,
      "endMs": summary.endMs,
    ]
    let s = WCSession.default
    guard s.activationState == .activated else { return }
    if s.isReachable {
      s.sendMessage(payload, replyHandler: nil, errorHandler: { _ in
        // 도달 실패 — 배달 보장 큐로 폴백(폰 JS 가 runId 로 중복 방어).
        s.transferUserInfo(payload)
      })
    } else {
      s.transferUserInfo(payload)
    }
  }
}

extension WatchLink: WCSessionDelegate {
  nonisolated func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    // 앱이 꺼져 있는 동안 도착해 저장된 컨텍스트 재생(신발/심박존만 — cmd 는 무시).
    let stored = session.receivedApplicationContext
    guard !stored.isEmpty else { return }
    Task { @MainActor in WatchLink.shared.apply(context: stored, allowCmd: false) }
  }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    Task { @MainActor in WatchLink.shared.apply(context: applicationContext, allowCmd: true) }
  }

  nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard let cmd = message["cmd"] as? String else { return }
    Task { @MainActor in WatchLink.shared.handle(cmd: cmd) }
  }
}
