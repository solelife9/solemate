// RecentRuns.swift — 워치 로컬 최근 기록(히스토리) 저장소
// ----------------------------------------------------------------------------
// 워치 완주 런 + 폰에서 동기화된 런을 합쳐 최근 ~10개를 UserDefaults 에 JSON 으로 보관해
// 워치 단독으로도 최근 러닝을 훑고(HistoryView) 상세(심박·케이던스·칼로리·고도)까지 본다.
//   · 정본은 폰/Firestore. 이건 워치 전용 캐시 — 실패해도 러닝 데이터 영향 0.
//   · 워치 런: WorkoutManager.buildSummary 가 save(_:). 폰 런: WatchLink 가 폰 동기화분을
//     merge(_:). runId 로 중복 제거, endMs 최신순 정렬, 최대 maxCount.
import Foundation

/// 워치에 남기는 최근 러닝 한 건(상세 표시용 스냅샷). 확장 필드는 구버전 저장분·폰 폴백을
/// 위해 decodeIfPresent(0/"") 처리한다.
struct RecentRun: Codable, Identifiable {
  let id: String              // RunSummary.runId — 중복 방지 키
  let endMs: Double           // 종료 시각(ms, epoch)
  let km: Double
  let durationS: Double
  let avgPaceSecPerKm: Double // 평균 페이스(초/km, 0 → "--")
  var avgBpm: Double = 0      // 평균 심박(0 = 미측정)
  var cadence: Double = 0     // 평균 케이던스(spm)
  var kcal: Double = 0        // 칼로리
  var elevGainM: Double = 0   // 상승 고도(m)
  var shoeName: String = ""   // 신발 이름
  var source: String = "watch" // "watch" | "phone" — 상세 배지

  var date: Date { Date(timeIntervalSince1970: endMs / 1000) }

  init(id: String, endMs: Double, km: Double, durationS: Double, avgPaceSecPerKm: Double,
       avgBpm: Double = 0, cadence: Double = 0, kcal: Double = 0, elevGainM: Double = 0,
       shoeName: String = "", source: String = "watch") {
    self.id = id; self.endMs = endMs; self.km = km; self.durationS = durationS
    self.avgPaceSecPerKm = avgPaceSecPerKm; self.avgBpm = avgBpm; self.cadence = cadence
    self.kcal = kcal; self.elevGainM = elevGainM; self.shoeName = shoeName; self.source = source
  }

  // 구버전 저장분(확장 필드 없음)도 안전 복호화.
  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    endMs = try c.decode(Double.self, forKey: .endMs)
    km = try c.decode(Double.self, forKey: .km)
    durationS = try c.decode(Double.self, forKey: .durationS)
    avgPaceSecPerKm = try c.decode(Double.self, forKey: .avgPaceSecPerKm)
    avgBpm = try c.decodeIfPresent(Double.self, forKey: .avgBpm) ?? 0
    cadence = try c.decodeIfPresent(Double.self, forKey: .cadence) ?? 0
    kcal = try c.decodeIfPresent(Double.self, forKey: .kcal) ?? 0
    elevGainM = try c.decodeIfPresent(Double.self, forKey: .elevGainM) ?? 0
    shoeName = try c.decodeIfPresent(String.self, forKey: .shoeName) ?? ""
    source = try c.decodeIfPresent(String.self, forKey: .source) ?? "watch"
  }
}

/// 워치 최근 기록 저장/조회/병합 — 자립형 정적 헬퍼.
enum RecentRuns {
  private static let key = "keego.watch.recentRuns.v1"
  static let maxCount = 10

  /// 워치 완주 요약을 저장(맨 앞). WorkoutManager.buildSummary 에서 호출.
  static func save(_ summary: RunSummary) {
    let run = RecentRun(
      id: summary.runId, endMs: summary.endMs, km: summary.km, durationS: summary.durationS,
      avgPaceSecPerKm: summary.avgPaceSecPerKm, avgBpm: summary.avgBpm, cadence: summary.cadence,
      kcal: summary.kcal, elevGainM: summary.elevGainM, shoeName: summary.shoeName, source: "watch"
    )
    write(merge([run], into: load()))
  }

  /// 폰에서 동기화된 런들을 기존 목록에 병합(runId 중복 제거·최신순·상한). WatchLink 에서 호출.
  static func mergePhoneRuns(_ runs: [RecentRun]) {
    guard !runs.isEmpty else { return }
    write(merge(runs, into: load()))
  }

  static func load() -> [RecentRun] {
    guard let data = UserDefaults.standard.data(forKey: key),
          let list = try? JSONDecoder().decode([RecentRun].self, from: data) else { return [] }
    return list
  }

  // 새 런들을 기존에 얹어 runId 중복 제거 → endMs 최신순 → 상한. 같은 id 면 새 값 우선.
  private static func merge(_ incoming: [RecentRun], into existing: [RecentRun]) -> [RecentRun] {
    var byId: [String: RecentRun] = [:]
    for r in existing { byId[r.id] = r }
    for r in incoming { byId[r.id] = r }
    let sorted = byId.values.sorted { $0.endMs > $1.endMs }
    return Array(sorted.prefix(maxCount))
  }

  private static func write(_ list: [RecentRun]) {
    if let data = try? JSONEncoder().encode(list) {
      UserDefaults.standard.set(data, forKey: key)
    }
  }
}
