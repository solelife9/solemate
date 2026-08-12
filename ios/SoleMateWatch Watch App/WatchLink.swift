// WatchLink.swift — 워치 ↔ 폰 WatchConnectivity 단일 창구(워치측)
// ----------------------------------------------------------------------------
// 폰 브리지(ios/SoleMate/WatchSessionModule.swift)와의 계약을 한 곳에서 소유한다:
//   · 폰 → 워치 applicationContext:
//       { "shoes": [{id, brand, model, lifePct, condition, usedKm, maxKm}] — 활성 신발
//         전체(홈과 같은 최근착용순), "hrMax": Double, "hrRest": Double — 심박존 파라미터,
//         "cmd": "stop" + "cmdAt" — 도달 불가 시 원격 종료 폴백 }
//   · 폰 → 워치 message: { "cmd": "start" | "stop" } — 폰 러닝 시작/종료에 워치 연동.
//   · 폰 → 워치 message: { "cmd": "zone_up" | "zone_down" } — 심박존 이탈 햅틱(#8).
//       폰 zoneCoach 가 음성 알림을 낼 때 짝으로 전송 → 손목 방향 햅틱(올려/낮춰).
//       실시간(진동은 지금 아니면 무의미)이라 큐잉 없이 도달 시에만 재생한다.
//   · 워치 → 폰 message/context: { "bpm": Double } — 실시간 심박(기존 계약 유지).
//   · 워치 → 폰 message/userInfo: { "type": "run", runId, shoeId, km, durationS,
//       avgBpm, kcal, startMs, endMs } — 단독 러닝 완주 페이로드. reachable 이면
//       sendMessage(실패 시 transferUserInfo 폴백), 아니면 transferUserInfo(큐잉 —
//       폰 복귀 시 자동 배달). 폰 JS 는 runId 로 중복 수신을 걸러낸다.
//
// 신발 목록·선택·심박존 파라미터는 UserDefaults 에 캐시해 폰이 없어도(단독 실행)
// 마지막 동기화 상태로 동작한다. 'SoleMateWatch Watch App' 타깃 멤버십.
import Foundation
import WidgetKit  // 컴플리케이션 타임라인 갱신
import Combine
import WatchConnectivity
import WatchKit

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
    didSet {
      defaults.set(selectedShoeId, forKey: Keys.selectedShoe)
      // 고른 신발이 바뀌면 워치 페이스도 그 신발을 가리켜야 한다 — 안 그러면 페이스와
      // 앱이 서로 다른 신발을 말한다(같은 데이터를 두 곳이 다르게 보여주는 것이 가장 나쁘다).
      publishComplication()
    }
  }
  /// 심박존 파라미터(폰 설정 미러 — Tanaka 최대심박·안정시심박). 0 = 미설정.
  private(set) var hrMax: Double = 0
  private(set) var hrRest: Double = 0
  /// 햅틱(진동) on/off — 폰 설정 미러. 자동 랩 진동·존 이탈 햅틱이 존중한다.
  /// 폰이 플래그를 안 보낸 구버전·초기 상태면 기본 ON(기존 동작 유지).
  private(set) var hapticsOn: Bool = true

  private let defaults = UserDefaults.standard
  private enum Keys {
    static let shoes = "keego_shoes_v1"
    static let selectedShoe = "keego_selected_shoe_v1"
    /// 폰이 마지막으로 알려 준 선택 신발 id. **워치의 선택과 별개로 보관한다** —
    /// 폰 값이 *바뀌었을 때만* 따라가기 위해서다(아래 apply 참조).
    static let phoneSelectedShoe = "keego_phone_selected_shoe_v1"
    static let hrMax = "keego_hr_max_v1"
    static let hrRest = "keego_hr_rest_v1"
    static let hapticsOn = "keego_haptics_on_v1"
  }

  // ── 컴플리케이션 공유 저장소 (2026-08-08) ──────────────────────────────────
  // 워치 페이스 컴플리케이션은 **다른 프로세스**라 위 `defaults`(UserDefaults.standard)를
  // 읽을 수 없다 — 컨테이너가 다르다. 그래서 App Group 에 한 벌 더 써 준다.
  // 계약(키 이름)은 ios/KeegoComplication/KeegoComplication.swift 와 **정확히** 같아야 한다.
  private enum Complication {
    static let group = "group.com.keego.app"
    static let kName = "wc_shoe_name"
    static let kUsed = "wc_shoe_used_km"
    static let kMax = "wc_shoe_max_km"
  }

  /// 현재 신발을 컴플리케이션이 읽을 수 있는 곳에 써 두고 워치 페이스를 갱신한다.
  ///
  /// 신발이 없거나 수명을 모르면 **지운다** — 남겨 두면 컴플리케이션이 옛 신발을 계속
  /// 주장한다. 아이폰 위젯이 정확히 그 사고를 냈다(샘플 폴백 → 남의 신발이 홈 화면에).
  private func publishComplication() {
    guard let d = UserDefaults(suiteName: Complication.group) else { return }
    if let s = selectedShoe, s.maxKm > 0 {
      let name = s.model.isEmpty ? s.brand : s.model
      d.set(name, forKey: Complication.kName)
      d.set(s.usedKm, forKey: Complication.kUsed)
      d.set(s.maxKm, forKey: Complication.kMax)
    } else {
      d.removeObject(forKey: Complication.kName)
      d.removeObject(forKey: Complication.kUsed)
      d.removeObject(forKey: Complication.kMax)
    }
    WidgetCenter.shared.reloadAllTimelines()
  }

  override init() {
    super.init()
    // 오프라인 캐시 복원 — 폰 없이 켜도 마지막 동기화 상태로 시작한다.
    if let raw = defaults.data(forKey: Keys.shoes),
       let cached = try? JSONDecoder().decode([WatchShoe].self, from: raw) {
      shoes = cached
    }
    selectedShoeId = defaults.string(forKey: Keys.selectedShoe)
    lastPhoneSelectedShoeId = defaults.string(forKey: Keys.phoneSelectedShoe)
    hrMax = defaults.double(forKey: Keys.hrMax)
    hrRest = defaults.double(forKey: Keys.hrRest)
    // 캐시된 햅틱 설정 복원 — 키 부재(최초 실행)면 기본 ON.
    hapticsOn = defaults.object(forKey: Keys.hapticsOn) == nil ? true : defaults.bool(forKey: Keys.hapticsOn)
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
    // 폰이 한 번도 안 붙은 기기에서도 캐시로 페이스를 채운다.
    publishComplication()
  }

  /// 폰이 마지막으로 알려 준 선택 신발 id(따라갈지 판단하는 기준값).
  private var lastPhoneSelectedShoeId: String?

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
      publishComplication() // 워치 페이스도 같이 최신으로
    }
    // ── 폰이 고른 신발 따라가기 ────────────────────────────────────────────
    // 왜: 예전엔 폰이 목록만 보내서, 워치는 **자기 스와이프 기록**으로만 신발을 골랐다.
    // 폰에서 다른 신발을 고르고 워치로 러닝을 시작하면 두 기기가 서로 다른 신발로 세션을
    // 열고, 병합 조건(shoe_id 동일)이 깨져 같은 러닝이 두 건 남는다 → **이중 차감**.
    //
    // 지키는 선 둘:
    //  · **러닝 중에는 절대 바꾸지 않는다.** 달리는 도중 신발이 바뀌면 그 세션의 기록이
    //    엉뚱한 신발에 붙는다. 다음 컨텍스트에서 다시 따라가면 된다.
    //  · **폰 값이 *바뀌었을 때만* 따라간다.** 매번 덮어쓰면 워치에서 손목으로 스와이프해
    //    고른 신발이 다음 동기화에 조용히 되돌아간다(사용자가 한 선택을 지우면 안 된다).
    if let sel = context["selectedShoeId"] as? String, !sel.isEmpty,
       sel != lastPhoneSelectedShoeId {
      lastPhoneSelectedShoeId = sel
      defaults.set(sel, forKey: Keys.phoneSelectedShoe)
      if !WorkoutManager.shared.isActive {
        selectedShoeId = sel
        defaults.set(sel, forKey: Keys.selectedShoe)
      }
    }
    if let v = (context["hrMax"] as? NSNumber)?.doubleValue, v > 0 {
      hrMax = v
      defaults.set(v, forKey: Keys.hrMax)
    }
    if let v = (context["hrRest"] as? NSNumber)?.doubleValue, v >= 0 {
      hrRest = v
      defaults.set(v, forKey: Keys.hrRest)
    }
    if let on = context["hapticsOn"] as? Bool {
      hapticsOn = on
      defaults.set(on, forKey: Keys.hapticsOn)
    }
    // 폰 최근 러닝 동기화 → 워치 기록에 병합(runId 중복 제거는 RecentRuns 가). 폰 런은 source
    // "phone" 으로 표시. 워치 런과 합쳐 HistoryView 가 최신순으로 보여준다.
    if let rawRuns = context["recentRuns"] as? [[String: Any]] {
      let runs: [RecentRun] = rawRuns.compactMap { d in
        guard let id = d["id"] as? String, !id.isEmpty,
              let endMs = (d["endMs"] as? NSNumber)?.doubleValue else { return nil }
        return RecentRun(
          id: id, endMs: endMs,
          km: (d["km"] as? NSNumber)?.doubleValue ?? 0,
          durationS: (d["durationS"] as? NSNumber)?.doubleValue ?? 0,
          avgPaceSecPerKm: (d["avgPaceSecPerKm"] as? NSNumber)?.doubleValue ?? 0,
          avgBpm: (d["avgBpm"] as? NSNumber)?.doubleValue ?? 0,
          cadence: (d["cadence"] as? NSNumber)?.doubleValue ?? 0,
          kcal: (d["kcal"] as? NSNumber)?.doubleValue ?? 0,
          elevGainM: (d["elevGainM"] as? NSNumber)?.doubleValue ?? 0,
          shoeName: d["shoeName"] as? String ?? "", source: "phone"
        )
      }
      RecentRuns.mergePhoneRuns(runs)
    }
    if allowCmd, let cmd = context["cmd"] as? String { handle(cmd: cmd) }
  }

  func handle(cmd: String) {
    switch cmd {
    case "start":
      // 폰에서 러닝 시작 — 보통 startWatchApp(handle:)로 이미 세션이 뜨므로 idempotent.
      // 신발 미동기화면 시작하지 않는다(2026-07-11 확정 — 러닝은 신발과 함께만).
      if !WorkoutManager.shared.isActive, let shoe = selectedShoe {
        WorkoutManager.shared.start(shoe: shoe)
      }
    case "stop":
      // 폰이 보낸 종료 — 폰 러닝은 이미 끝났으므로 되울림(stop 재전송) 금지.
      WorkoutManager.shared.end(notifyPhone: false)
    case "zone_up":
      // 목표존보다 낮음 → '올려라' 방향 햅틱. 러닝 중 + 햅틱 켜짐일 때만.
      if hapticsOn, WorkoutManager.shared.isActive { WKInterfaceDevice.current().play(.directionUp) }
    case "zone_down":
      // 목표존보다 높음 → '낮춰라' 방향 햅틱.
      if hapticsOn, WorkoutManager.shared.isActive { WKInterfaceDevice.current().play(.directionDown) }
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

  /// 실시간 **누적 거리**(km)를 폰으로 보낸다 — 폰+워치 동시 러닝의 '진짜 미러링'.
  ///
  /// 왜: 예전엔 폰으로 시작해도 워치가 자기 워크아웃을 독립적으로 돌려 **두 기기가 각자
  /// 쟀다.** 러닝 중 두 화면이 다른 숫자를 보여줬고(실측 폰 5.14 / 워치 5.358), 종료 시
  /// 병합에서 워치 값이 이겨 **본 것과 남는 것이 달라졌다**. 업계는 기록자를 하나로 정한다
  /// (애플=워치 전용, 가민=시계). 워치가 붙어 있으면 워치가 기록자다.
  ///
  /// 심박과 **같은 채널·같은 정책**이다: 도달하면 message, 아니면 컨텍스트로 최신값만 덮는다.
  /// 놓쳐도 문제없다 — 누적값이라 다음 표본 하나로 따라잡는다(증분이 아니다).
  nonisolated func sendDistance(_ km: Double) {
    guard km.isFinite, km > 0 else { return }
    let s = WCSession.default
    guard s.activationState == .activated else { return }
    if s.isReachable {
      s.sendMessage(["wkm": km], replyHandler: nil, errorHandler: nil)
    } else {
      try? s.updateApplicationContext(["wkm": km])
    }
  }

  /// 심박 기록 전체를 폰으로 직송(경로 A). transferUserInfo = 배달 보장 큐라 폰이 주머니에
  /// 있어(비도달) 실시간 스트림을 놓쳐도 폰이 깨는 순간 배달된다. 폰은 시간창으로 자기 런과
  /// 매칭해 hrTrack 을 채운다 — HealthKit 동기화 타이밍과 무관한 정본 경로.
  func sendHrTrack(startMs: Double, endMs: Double, offsetsS: [Double], bpms: [Double]) {
    guard offsetsS.count == bpms.count, bpms.count >= 2 else { return }
    let payload: [String: Any] = [
      "type": "hrtrack",
      "startMs": startMs,
      "endMs": endMs,
      "hrT": offsetsS,
      "hrBpm": bpms,
    ]
    let s = WCSession.default
    guard s.activationState == .activated else { return }
    s.transferUserInfo(payload)
  }

  /// 워치에서 러닝을 종료했을 때 폰 러닝도 함께 끝나게 stop 을 보낸다(정지 미러링,
  /// 2026-07-18 실기기 갭: 워치 정지 → 폰 무반응). 도달 가능하면 즉시 메시지, 아니면
  /// 배달 보장 큐 — 폰이 주머니/잠금이어도 복귀 시 배달돼 GPS 러닝이 계속 도는 것을 막는다.
  /// cmdAt(초) 동봉 — 폰 JS 가 '지금 러닝 시작 이후에 눌린 정지'만 존중해(스테일 방어)
  /// 늦게 배달된 옛 정지가 다음 러닝을 죽이지 않는다.
  nonisolated func sendStopToPhone() {
    let s = WCSession.default
    guard s.activationState == .activated else { return }
    let payload: [String: Any] = ["cmd": "stop", "cmdAt": Date().timeIntervalSince1970]
    if s.isReachable {
      s.sendMessage(payload, replyHandler: nil, errorHandler: { _ in s.transferUserInfo(payload) })
    } else {
      s.transferUserInfo(payload)
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
      // 케이던스(spm)·누적 상승 고도(m)·구간 스플릿(초/km) — 폰 상세 지표 유실 방지.
      "cadence": summary.cadence,
      "splitsS": summary.splitsS,
      "startMs": summary.startMs,
      "endMs": summary.endMs,
      // 트랙 자동랩 메타(비트랙은 lapM 0·laps 0·빈 배열) — 폰 RunDetail 트랙 표기용.
      "lapM": summary.lapM,
      "laps": Double(summary.lapTimesS.count),
      "lapTimes": summary.lapTimesS,
      // GPS 경로([lat,lon,…] 플랫, ≤200점) — 폰 지도(민우님 2026-07-24 "워치 런도 지도").
      "route": summary.routeFlat,
      // 경로와 1:1 짝인 고도 원자료(m). 폰이 lib/elevation.ts 로 상승고도를 계산한다.
      // 워치는 더 이상 elevGainM 을 보내지 않는다(2026-07-28) — 두 벌 계산이 답을
      // 갈라놨기 때문(워치 274m vs 폰 33m). 측정 불가 지점은 NaN 이라 폰이 건너뛴다.
      "routeAlt": summary.routeAltFlat.map { $0.isFinite ? $0 : Double.nan },
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

  /// 폰이 배달 보장 큐로 보낸 명령(2026-08-12 신설).
  ///
  /// 폰은 러닝 종료 시 `stop` 을 보내는데, 예전엔 `isReachable` 이 아니면
  /// applicationContext 로 흘려보냈다. 그건 '최신 상태 동기화' 채널이라 iOS 가 기회가 될
  /// 때 전달한다 — 손목을 내리고 달리는 실제 러닝에서는 정지가 몇 분 뒤에 오거나 아예
  /// 안 왔다(민우님 실기기: "폰에서 완료해도 워치가 안 끝난다"). 이제 폰이
  /// `transferUserInfo`(배달 보장·순서 유지)로 보내므로 이 수신부가 필요하다.
  nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    guard let cmd = userInfo["cmd"] as? String else { return }
    Task { @MainActor in WatchLink.shared.handle(cmd: cmd) }
  }

  nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard let cmd = message["cmd"] as? String else { return }
    Task { @MainActor in WatchLink.shared.handle(cmd: cmd) }
  }
}
