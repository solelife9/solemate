// WatchVoice.swift — 워치 온디바이스 음성 안내(폰 lib/runVoice 이식)
// ----------------------------------------------------------------------------
// 워치 단독 러닝(폰 없이 에어팟)에서 km·페이스·시작·완주·목표 음성을 낸다. 폰이 있으면
// 폰이 재생했지만, 손목만 러닝 시 아무 안내가 없던 갭(2026-07-21 사용자 실기기)을 해결.
//   · 클립은 Voice/ 폴더에 번들(폰과 동일 아가사 목소리, mp3). 조각을 이어붙여 한 문장을
//     만든다: km_5 + lbl_pace + min_5 + sec_30 → "5킬로미터, 페이스 5분 30초".
//   · AVAudioSession(.playback, .duckOthers) — 에어팟으로 출력 + 음악을 잠깐 줄인다.
//   · 큐 빌더 로직은 폰 lib/runVoice/voice.ts 를 그대로 이식(단일 진실원 — 값 바뀌면 함께).
// ⚠️ 'SoleMateWatch Watch App' 타깃 + Voice/ 리소스 번들 멤버십 필요.
import Foundation
import AVFoundation

@MainActor
final class WatchVoice {
  static let shared = WatchVoice()

  /// 폰 음성 설정과 동기화(WatchLink)되며, 기본 on — 손목만 러닝 시 안내가 필요.
  var enabled = true
  private var volume: Float = 1.0
  private var player: AVAudioPlayer?
  private var proxy: PlayerDelegate?
  private var token = 0

  private init() {}

  func setEnabled(_ on: Bool) { enabled = on; if !on { stop() } }
  func setVolume(_ v: Float) { volume = max(0, min(1, v)) }

  // ── 공개 큐 API — WorkoutManager 가 러닝 이벤트마다 부른다 ──────────────────
  /// 러닝 시작.
  func start() { play(["start"]) }
  /// 목표(거리/시간) 달성 순간.
  func goal() { play(["goal"]) }
  /// 일시정지 — 수동·자동 공통. 클립(auto_pause.mp3)은 진작 번들에 있었는데 부르는 곳이
  /// 없어 손목만 러닝 시 아무 안내가 없었다(2026-07-28 민우님: "일시정지했는지 모르겠어").
  func paused() { play(["auto_pause"]) }
  /// 재개.
  func resumed() { play(["resume"]) }
  /// km 안내: "N킬로미터, 페이스 M분 S초, (경과 …)". paceSec/elapsed nil 이면 해당 조각 생략.
  func kmCue(_ n: Int, paceSec: Double?, elapsedSec: Double?, lastKm: Bool) {
    guard n >= 1, n <= 42 else { return }
    var ids = ["km_\(n)"] + paceIds(paceSec, avg: false) + timeIds(elapsedSec)
    if lastKm { ids.append("last_km") }
    play(ids)
  }
  /// 완주 요약: "운동을 종료합니다…, N킬로미터, 경과 …, 평균 페이스 …".
  func finishSummary(km: Double, elapsedSec: Double, avgPaceSec: Double?) {
    play(["finish"] + distIds(km) + timeIds(elapsedSec) + paceIds(avgPaceSec, avg: true))
  }
  /// 심박존 이탈 안내(단독 러닝 존 코칭). up=올라감/down=내려감, zone=목표존(2~4).
  func zone(up: Bool, zone: Int) {
    guard zone >= 2, zone <= 4 else { return }
    play([up ? "zone_up_\(zone)" : "zone_down_\(zone)"])
  }

  // ── 시퀀스 재생(조각 이어붙임) ──────────────────────────────────────────────
  func play(_ ids: [String]) {
    guard enabled, !ids.isEmpty else { return }
    let urls = ids.compactMap { clipURL($0) }
    guard !urls.isEmpty else { return }
    activateSession()
    token += 1
    playChain(urls, index: 0, token: token)
  }

  func stop() {
    token += 1
    player?.stop()
    player = nil
    proxy = nil
  }

  private func clipURL(_ id: String) -> URL? {
    // Voice/ 하위(폴더 참조) 우선, 아니면 번들 루트(플랫)로 폴백 — 번들 방식 무관하게 로드.
    Bundle.main.url(forResource: id, withExtension: "mp3", subdirectory: "Voice")
      ?? Bundle.main.url(forResource: id, withExtension: "mp3")
  }

  private func activateSession() {
    let s = AVAudioSession.sharedInstance()
    try? s.setCategory(.playback, mode: .default, options: [.duckOthers])
    try? s.setActive(true)
  }

  private func playChain(_ urls: [URL], index: Int, token mine: Int) {
    guard mine == token, index < urls.count else { return }
    do {
      let p = try AVAudioPlayer(contentsOf: urls[index])
      p.volume = volume
      let d = PlayerDelegate { [weak self] in
        self?.playChain(urls, index: index + 1, token: mine)
      }
      proxy = d
      p.delegate = d
      player = p
      p.prepareToPlay()
      p.play()
    } catch {
      playChain(urls, index: index + 1, token: mine) // 한 조각 실패 → 다음으로(무음 스킵)
    }
  }

  // ── 큐 빌더(폰 lib/runVoice/voice.ts 이식) ─────────────────────────────────
  /// 페이스(초/km) → [lbl_pace|lbl_avg_pace, min_M, (sec_S)]. 1~12분 밖은 생략.
  private func paceIds(_ secPerKm: Double?, avg: Bool) -> [String] {
    guard let s = secPerKm, s > 0 else { return [] }
    let total = Int(s.rounded())
    let m = total / 60, sec = total % 60
    guard m >= 1, m <= 12 else { return [] }
    var out = [avg ? "lbl_avg_pace" : "lbl_pace", "min_\(m)"]
    if sec >= 1, sec <= 59 { out.append("sec_\(sec)") }
    return out
  }
  /// 경과시간(초) → [lbl_elapsed, (hr_H), (min_M), (sec_S)]. 시간 있으면 초 생략, 6시간↑ 생략.
  private func timeIds(_ elapsed: Double?) -> [String] {
    guard let e = elapsed, e.isFinite, e >= 1 else { return [] }
    let total = Int(e.rounded())
    let h = total / 3600, m = (total % 3600) / 60, sec = total % 60
    guard h <= 6 else { return [] }
    var out = ["lbl_elapsed"]
    if h >= 1 { out.append("hr_\(h)") }
    if m >= 1 { out.append("min_\(m)") }
    if h == 0, sec >= 1 { out.append("sec_\(sec)") }
    return out.count > 1 ? out : []
  }
  /// 거리(km) → 완주 요약용 거리 클립(0.5km 격자: m_500 / km_N / kmh_N). 범위 밖 생략.
  private func distIds(_ km: Double) -> [String] {
    guard km.isFinite, km > 0 else { return [] }
    let half = (km * 2).rounded() / 2
    if half < 0.5 { return [] }
    if half == 0.5 { return ["m_500"] }
    let whole = Int(half)
    guard whole >= 1, whole <= 42 else { return [] }
    return [half - Double(whole) == 0.5 ? "kmh_\(whole)" : "km_\(whole)"]
  }
}

/// AVAudioPlayer 완료 콜백 → 다음 조각. delegate 는 weak 라 proxy 를 엔진이 강참조 유지.
private final class PlayerDelegate: NSObject, AVAudioPlayerDelegate {
  let onFinish: () -> Void
  init(onFinish: @escaping () -> Void) { self.onFinish = onFinish; super.init() }
  nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    Task { @MainActor in self.onFinish() }
  }
}
