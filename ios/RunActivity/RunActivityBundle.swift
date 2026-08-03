// RunActivityBundle.swift — 위젯 번들. Live Activity + 홈/잠금화면 위젯(신발 수명 링).
// 위젯 코드를 별도 파일로 두면 확장 타깃 멤버십(pbxproj) 배선이 필요하므로, 이미 타깃에
// 속한 이 파일 안에 위젯 전체(데이터·프로바이더·뷰·구성)를 담는다(워치 GoalPanel 동일 전략).
import WidgetKit
import SwiftUI

@main
struct RunActivityBundle: WidgetBundle {
    var body: some Widget {
        RunActivityLiveActivity()
        KeegoShoeWidget()
    }
}

// ── 앱↔위젯 공유 데이터 ────────────────────────────────────────────────────────
// App Group(공유 UserDefaults)로 앱이 활성 신발을 써두고 위젯이 읽는다. 그룹 미등록/미기록
// 이면 샘플로 폴백(빌드·프리뷰·최초 실행 안전). ⚠️ App Group id 는 Apple 개발자 포털+Xcode
// Signing&Capabilities 에 등록 필요(앱·확장 양쪽 동일 그룹).
enum KeegoWidgetShared {
    static let appGroup = "group.com.keego.app"
    // 앱(WidgetDataModule)이 쓰는 키와 동일 계약.
    static let kName = "widget_shoe_name"
    static let kBrand = "widget_shoe_brand"
    static let kCategory = "widget_shoe_category"
    static let kUsed = "widget_shoe_used_km"
    static let kMax = "widget_shoe_max_km"
}

struct KeegoShoe {
    var name: String
    var brand: String
    var category: String
    var usedKm: Int
    var maxKm: Int

    /// 남은 수명 비율(0~1) — 링 채움. maxKm 0 이면 0.
    var remaining: Double {
        guard maxKm > 0 else { return 0 }
        return max(0, min(1, Double(maxKm - usedKm) / Double(maxKm)))
    }
    /// 소진율(%) — 4단계 마모색 판정용(앱 wearTier 미러: <50 최상 …).
    var usedPct: Double { maxKm > 0 ? Double(usedKm) / Double(maxKm) * 100 : 0 }

    /// 브랜드·카테고리 한 줄("NIKE · 데일리"). 빈 값은 접는다.
    var subtitle: String {
        [brand.uppercased(), category].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// 마모 단계 그라데이션(밝은→진한 같은 계열, 앱 링 문법). wearTier(usedPct).
    var gradient: [Color] {
        let p = usedPct
        if p >= 90 { return [Color(hex: 0xFF836F), Color(hex: 0xDF3A26)] } // 교체 권장(빨강)
        if p >= 80 { return [Color(hex: 0xF3C866), Color(hex: 0xCD8416)] } // 교체 고려(노랑)
        if p >= 50 { return [Color(hex: 0x6BD7A2), Color(hex: 0x33A468)] } // 양호(초록)
        return [Color(hex: 0x79B7F6), Color(hex: 0x3A86D8)]                // 최상(파랑)
    }

    static let sample = KeegoShoe(name: "Pegasus 41", brand: "Nike", category: "데일리", usedKm: 118, maxKm: 650)

    static func load() -> KeegoShoe {
        guard let d = UserDefaults(suiteName: KeegoWidgetShared.appGroup),
              let name = d.string(forKey: KeegoWidgetShared.kName), !name.isEmpty
        else { return .sample }
        return KeegoShoe(
            name: name,
            brand: d.string(forKey: KeegoWidgetShared.kBrand) ?? "",
            category: d.string(forKey: KeegoWidgetShared.kCategory) ?? "",
            usedKm: d.integer(forKey: KeegoWidgetShared.kUsed),
            maxKm: d.integer(forKey: KeegoWidgetShared.kMax)
        )
    }
}

// ── 타임라인(정적 — 신발 데이터는 앱이 갱신 시 reloadTimelines 로 밀어준다) ──────────
struct KeegoEntry: TimelineEntry {
    let date: Date
    let shoe: KeegoShoe
}

struct KeegoProvider: TimelineProvider {
    func placeholder(in context: Context) -> KeegoEntry { KeegoEntry(date: Date(), shoe: .sample) }
    func getSnapshot(in context: Context, completion: @escaping (KeegoEntry) -> Void) {
        completion(KeegoEntry(date: Date(), shoe: KeegoShoe.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<KeegoEntry>) -> Void) {
        // 신발 수명은 러닝 저장 시에만 바뀌므로 잦은 갱신 불필요. 앱이 데이터 쓸 때
        // WidgetCenter.reloadAllTimelines() 로 즉시 갱신하고, 여기선 6시간 폴백만 둔다.
        let entry = KeegoEntry(date: Date(), shoe: KeegoShoe.load())
        let next = Calendar.current.date(byAdding: .hour, value: 6, to: Date()) ?? Date().addingTimeInterval(21600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// ── 내구도 링 = 시작 버튼(그라데이션 아크 + 중앙 '시작') ──────────────────────────
struct DurabilityRing: View {
    let remaining: Double
    let gradient: [Color]
    var diameter: CGFloat = 100
    var labelSize: CGFloat = 20

    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.10), lineWidth: 9)
            Circle()
                .trim(from: 0, to: max(0.001, remaining))
                .stroke(
                    LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing),
                    style: StrokeStyle(lineWidth: 9, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            Text("시작")
                .font(.system(size: labelSize, weight: .heavy))
                .foregroundColor(.white)
        }
        .frame(width: diameter, height: diameter)
    }
}

// Small: 링(내구도=시작) + 신발명 + 사용/총 km.
struct KeegoSmallView: View {
    let shoe: KeegoShoe
    var body: some View {
        VStack(spacing: 10) {
            DurabilityRing(remaining: shoe.remaining, gradient: shoe.gradient, diameter: 100, labelSize: 20)
            VStack(spacing: 1) {
                Text(shoe.name)
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text("\(shoe.usedKm) / \(shoe.maxKm)km")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Color(hex: 0x9C9CA3))
                    .monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(14)
    }
}

// Medium: 링 + (브랜드·카테고리 → 모델명 → 사용/총 km).
struct KeegoMediumView: View {
    let shoe: KeegoShoe
    var body: some View {
        HStack(spacing: 16) {
            DurabilityRing(remaining: shoe.remaining, gradient: shoe.gradient, diameter: 114, labelSize: 20)
            VStack(alignment: .leading, spacing: 7) {
                if !shoe.subtitle.isEmpty {
                    Text(shoe.subtitle)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color(hex: 0x9C9CA3))
                        .lineLimit(1)
                }
                Text(shoe.name)
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(1).minimumScaleFactor(0.6)
                Text("\(shoe.usedKm) / \(shoe.maxKm)km")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color(hex: 0xEBEBF5))
                    .monospacedDigit()
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(16)
    }
}

struct KeegoShoeWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: KeegoEntry
    var body: some View {
        Group {
            switch family {
            case .systemMedium: KeegoMediumView(shoe: entry.shoe)
            default: KeegoSmallView(shoe: entry.shoe)
            }
        }
        .containerBackgroundCompat()
        // 위젯 탭 → 앱 열리며 활성 신발로 바로 러닝(딥링크). 앱이 keego://start 를 처리한다.
        .widgetURL(URL(string: "keego://start"))
    }
}

struct KeegoShoeWidget: Widget {
    let kind = "KeegoShoeWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KeegoProvider()) { entry in
            KeegoShoeWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("러닝화 수명")
        .description("활성 러닝화의 남은 수명을 보고, 탭하면 바로 러닝을 시작해요.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────
extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

extension View {
    // iOS 17 은 위젯에 containerBackground 를 요구한다. 16 은 배경을 직접 깐다.
    @ViewBuilder func containerBackgroundCompat() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(Color.black, for: .widget)
        } else {
            ZStack { Color.black; self }
        }
    }
}
