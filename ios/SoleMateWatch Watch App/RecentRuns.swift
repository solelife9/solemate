// RecentRuns.swift — 워치 로컬 최근 기록(히스토리) 저장소
// ----------------------------------------------------------------------------
// 워치는 완주한 런을 폰으로 보내(WatchLink.sendRun) 정본을 넘기지만, 그동안
// 워치에는 훑어볼 기록이 남지 않았다. 여기서 최근 ~10개를 UserDefaults 에 JSON 으로
// 얇게 보관해 워치 단독으로도 최근 러닝을 볼 수 있게 한다(HistoryView).
//
// 원칙: 정본은 여전히 폰/Firestore. 이건 워치 전용 캐시(글랜스용) — 파괴적 변경 없음,
// 저장 실패해도 러닝 데이터엔 영향 0(폰 전송이 진짜 저장). 값은 RunSummary 에서
// 저장 시점에 스냅샷(date/km/durationS/avgPace)만 파생 — 무거운 필드는 안 든다.
import Foundation

/// 워치에 남기는 최근 러닝 한 건(글랜스용 최소 스냅샷).
struct RecentRun: Codable, Identifiable {
  /// 런 고유 id(RunSummary.runId) — 같은 런 재저장 시 중복 방지 키.
  let id: String
  /// 종료 시각(ms, epoch) — 표시용 날짜 파생.
  let endMs: Double
  let km: Double
  let durationS: Double
  /// 평균 페이스(초/km) — 저장 시점에 확정(km 0 이면 0 → '--'--"').
  let avgPaceSecPerKm: Double

  var date: Date { Date(timeIntervalSince1970: endMs / 1000) }
}

/// 워치 최근 기록 저장/조회 — 자립형 정적 헬퍼(WorkoutManager 를 건드리지 않는다).
enum RecentRuns {
  private static let key = "keego.watch.recentRuns.v1"
  /// 워치엔 최근 것만 — 스토리지·스크롤을 가볍게(글랜스용).
  static let maxCount = 10

  /// 완주 요약을 최근 기록 맨 앞에 저장(최대 maxCount, 초과분은 오래된 것부터 버림).
  /// 저장 경로(WorkoutManager.confirmSave)에서 한 줄로 호출한다.
  static func save(_ summary: RunSummary) {
    let run = RecentRun(
      id: summary.runId,
      endMs: summary.endMs,
      km: summary.km,
      durationS: summary.durationS,
      avgPaceSecPerKm: summary.avgPaceSecPerKm
    )
    var list = load()
    list.removeAll { $0.id == run.id }      // 같은 런 재저장 시 중복 제거
    list.insert(run, at: 0)                  // 최신이 맨 앞
    if list.count > maxCount { list = Array(list.prefix(maxCount)) }
    if let data = try? JSONEncoder().encode(list) {
      UserDefaults.standard.set(data, forKey: key)
    }
  }

  /// 최근 기록(최신 순). 없거나 손상 시 빈 배열(throw 금지 — 순수 조회).
  static func load() -> [RecentRun] {
    guard
      let data = UserDefaults.standard.data(forKey: key),
      let list = try? JSONDecoder().decode([RecentRun].self, from: data)
    else { return [] }
    return list
  }
}
