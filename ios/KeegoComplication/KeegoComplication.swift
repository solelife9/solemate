// KeegoComplication.swift — 워치 페이스 컴플리케이션(watchOS 9+ = WidgetKit 위젯)
//
// 왜 넣나 (2026-08-08 · 민우님 네이티브 승인)
// ----------------------------------------------------------------------------
// 워치 앱은 이미 단독 러닝까지 완성돼 있었지만 **컴플리케이션이 없었다.** 없어도 앱은
// 완전히 동작한다 — 그런데 워치 페이스는 하루에 수십 번 보는 면이고, 거기 링이 박혀
// 있는 것이 **매일의 브랜드 접점**이다. NRC·Strava·Apple 이 전부 갖고 있다.
// 그리고 실용적으로도: 페이스에서 바로 눌러 러닝을 시작하는 것이 가장 짧은 동선이다.
//
// 데이터가 어디서 오나 — **앱 그룹이 필요한 이유**
// ----------------------------------------------------------------------------
// 컴플리케이션은 워치 앱과 **다른 프로세스**다. 워치 앱이 `UserDefaults.standard` 에
// 캐시해 둔 신발(`keego_shoes_v1`)을 여기서 읽을 수 없다 — 컨테이너가 다르다.
// 그래서 워치 앱이 App Group 공유 저장소에 한 벌 더 써 주고(WatchLink.publishComplication),
// 여기서 그걸 읽는다. 그룹 이름은 아이폰 위젯과 같은 `group.com.keego.app` 이다
// (App Group 은 기기 안에서만 공유된다 — 폰과 워치가 같은 이름을 써도 서로 다른 저장소다.
//  이름을 통일하는 건 사람이 헷갈리지 않기 위해서지 데이터가 오가서가 아니다).
//
// ⚠️ 읽히지 않으면 **지어내지 않는다.** 아이폰 위젯이 정확히 그 사고를 냈다 —
// 데이터를 못 읽자 샘플로 폴백해서 **모든 사용자 홈 화면에 남의 신발이 떴다**
// (2026-08-08 감사, RunActivityBundle.swift 주석). 같은 실수를 반복하지 않는다.
import WidgetKit
import SwiftUI

// ── 공유 저장소 계약 ──────────────────────────────────────────────────────────
// 쓰는 쪽: SoleMateWatch Watch App / WatchLink.publishComplication()
// 읽는 쪽: 이 파일. **키가 한 글자만 달라도 조용히 아무것도 안 보인다.**
enum KeegoWatchShared {
    static let appGroup = "group.com.keego.app"
    static let kName = "wc_shoe_name"
    static let kUsed = "wc_shoe_used_km"
    static let kMax = "wc_shoe_max_km"
}

struct ComplicationShoe {
    var name: String
    var usedKm: Int
    var maxKm: Int

    /// 남은 수명 비율(0~1). 컴플리케이션은 단색이라 **채움 길이가 유일한 신호**다.
    var remaining: Double {
        guard maxKm > 0 else { return 0 }
        return max(0, min(1, Double(maxKm - usedKm) / Double(maxKm)))
    }

    /// 공유 저장소에서 읽는다. **없으면 nil** — 샘플로 메우지 않는다(위 주석 참조).
    static func load() -> ComplicationShoe? {
        guard let d = UserDefaults(suiteName: KeegoWatchShared.appGroup),
              let name = d.string(forKey: KeegoWatchShared.kName), !name.isEmpty
        else { return nil }
        let maxKm = d.integer(forKey: KeegoWatchShared.kMax)
        guard maxKm > 0 else { return nil }
        return ComplicationShoe(name: name, usedKm: d.integer(forKey: KeegoWatchShared.kUsed), maxKm: maxKm)
    }

    /// **갤러리 미리보기 전용.** 시스템이 리댁션해 보여주는 자리다.
    /// 브랜드·모델은 비운다 — 리댁션이 풀려도 없는 신발을 주장하지 않게.
    static let preview = ComplicationShoe(name: "러닝화", usedKm: 120, maxKm: 600)
}

struct ComplicationEntry: TimelineEntry {
    let date: Date
    /// nil = 보여줄 신발이 없다.
    let shoe: ComplicationShoe?
}

struct ComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> ComplicationEntry {
        ComplicationEntry(date: Date(), shoe: .preview)
    }
    func getSnapshot(in context: Context, completion: @escaping (ComplicationEntry) -> Void) {
        completion(ComplicationEntry(date: Date(), shoe: ComplicationShoe.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ComplicationEntry>) -> Void) {
        // 신발 수명은 러닝을 저장할 때만 바뀐다. 워치 앱이 갱신 즉시
        // WidgetCenter.reloadAllTimelines() 로 밀어 주므로 여기선 6시간 폴백만 둔다.
        let entry = ComplicationEntry(date: Date(), shoe: ComplicationShoe.load())
        let next = Calendar.current.date(byAdding: .hour, value: 6, to: Date())
            ?? Date().addingTimeInterval(21600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// ── 뷰 ────────────────────────────────────────────────────────────────────────
// 워치 페이스는 **단색**이다. 색으로 마모 단계를 말할 수 없으므로(시스템이 전부 같은
// 틴트로 칠한다) 형태와 숫자로 말한다 — 채움 길이 + 남은 퍼센트/킬로미터.

struct CircularComplication: View {
    let shoe: ComplicationShoe?
    var body: some View {
        if let shoe {
            Gauge(value: shoe.remaining) {
                Image(systemName: "shoe")
            } currentValueLabel: {
                Text("\(Int(shoe.remaining * 100))")
                    .font(.system(size: 15, weight: .heavy))
                    .monospacedDigit()
            }
            .gaugeStyle(.accessoryCircular)
        } else {
            Gauge(value: 0) {
                Image(systemName: "shoe")
            } currentValueLabel: {
                Image(systemName: "plus")
            }
            .gaugeStyle(.accessoryCircular)
        }
    }
}

struct CornerComplication: View {
    let shoe: ComplicationShoe?
    var body: some View {
        if let shoe {
            Image(systemName: "shoe")
                .font(.system(size: 18, weight: .semibold))
                .widgetLabel {
                    Gauge(value: shoe.remaining) {
                        Text("수명")
                    } currentValueLabel: {
                        Text("\(shoe.maxKm - shoe.usedKm)km")
                            .monospacedDigit()
                    }
                    .gaugeStyle(.accessoryLinearCapacity)
                }
        } else {
            Image(systemName: "shoe")
                .font(.system(size: 18, weight: .semibold))
                .widgetLabel { Text("등록 필요") }
        }
    }
}

struct RectangularComplication: View {
    let shoe: ComplicationShoe?
    var body: some View {
        if let shoe {
            VStack(alignment: .leading, spacing: 2) {
                Text(shoe.name)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
                Gauge(value: shoe.remaining) { EmptyView() }
                    .gaugeStyle(.accessoryLinearCapacity)
                Text("\(shoe.usedKm) / \(shoe.maxKm)km")
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
            }
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text("Keego").font(.system(size: 14, weight: .semibold))
                Text("러닝화를 등록해 주세요")
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
        }
    }
}

struct InlineComplication: View {
    let shoe: ComplicationShoe?
    var body: some View {
        if let shoe {
            // 인라인은 폭이 심하게 줄어든다 — 숫자를 앞에, 이름을 뒤에.
            Text("\(shoe.usedKm)/\(shoe.maxKm)km · \(shoe.name)")
        } else {
            Text("러닝화를 등록해 주세요")
        }
    }
}

struct KeegoComplicationEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: ComplicationEntry
    var body: some View {
        switch family {
        case .accessoryCorner: CornerComplication(shoe: entry.shoe)
        case .accessoryRectangular: RectangularComplication(shoe: entry.shoe)
        case .accessoryInline: InlineComplication(shoe: entry.shoe)
        default: CircularComplication(shoe: entry.shoe)
        }
    }
}

struct KeegoShoeComplication: Widget {
    let kind = "KeegoShoeComplication"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ComplicationProvider()) { entry in
            KeegoComplicationEntryView(entry: entry)
                // 컴플리케이션은 **배경을 깔지 않는다.** 워치 페이스가 그 면을 소유한다.
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("러닝화 수명")
        .description("활성 러닝화의 남은 수명. 눌러서 바로 러닝을 시작해요.")
        .supportedFamilies([
            .accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline,
        ])
    }
}

@main
struct KeegoComplicationBundle: WidgetBundle {
    var body: some Widget {
        KeegoShoeComplication()
    }
}
