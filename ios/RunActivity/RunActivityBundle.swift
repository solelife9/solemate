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

    /// **위젯 갤러리 전용** 미리보기. 시스템이 리댁션(회색 처리)해 보여주는 자리이며,
    /// Apple 이 대표 샘플을 쓰라고 안내하는 곳이다. `placeholder(in:)` 에서만 쓴다.
    ///
    /// ⚠️ **실제 타임라인에는 절대 쓰지 않는다.** 예전엔 `load()` 가 데이터를 못 읽으면
    /// 이 값을 돌려줬고, 그 결과 **모든 사용자의 홈 화면에 "Nike Pegasus 41 · 118/650km"
    /// 라는 남의 신발이 진짜인 것처럼 떴다**(2026-08-08 감사). App Group 이 위젯 타깃에
    /// 등록돼 있지 않아 suite 가 늘 nil 이었기 때문에 100% 재현됐다.
    /// MISSION.md 의 Truth only 정면 위반이고, 안드로이드 위젯은 같은 상황에서
    /// "러닝화를 등록해 주세요"를 띄운다(ShoeWidgetProvider.kt — "지어내지 않는다").
    /// 브랜드·모델은 **비운다.** 리댁션이 풀린 채 보이더라도 없는 신발을 주장하지 않게.
    static let sample = KeegoShoe(name: "러닝화", brand: "", category: "", usedKm: 120, maxKm: 600)

    /// 공유 저장소에서 활성 신발을 읽는다. **없으면 nil** — 지어내지 않는다.
    ///
    /// nil 이 되는 경우가 셋이고 전부 "보여줄 진실이 없다"로 같다:
    ///   · App Group 이 안 열린다(위젯 타깃 미등록)
    ///   · 앱을 한 번도 안 열어 아직 아무것도 안 썼다
    ///   · 등록된 러닝화가 없다
    /// 수명(maxKm)이 0 이면 링을 그릴 수 없으므로 그것도 데이터 없음으로 본다.
    static func load() -> KeegoShoe? {
        guard let d = UserDefaults(suiteName: KeegoWidgetShared.appGroup),
              let name = d.string(forKey: KeegoWidgetShared.kName), !name.isEmpty
        else { return nil }
        let maxKm = d.integer(forKey: KeegoWidgetShared.kMax)
        guard maxKm > 0 else { return nil }
        return KeegoShoe(
            name: name,
            brand: d.string(forKey: KeegoWidgetShared.kBrand) ?? "",
            category: d.string(forKey: KeegoWidgetShared.kCategory) ?? "",
            usedKm: d.integer(forKey: KeegoWidgetShared.kUsed),
            maxKm: maxKm
        )
    }
}

// ── 타임라인(정적 — 신발 데이터는 앱이 갱신 시 reloadTimelines 로 밀어준다) ──────────
struct KeegoEntry: TimelineEntry {
    let date: Date
    /// nil = 보여줄 신발이 없다(빈 상태를 그린다). 샘플로 메우지 않는다.
    let shoe: KeegoShoe?
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

// ── 잠금화면 위젯 (iOS 16+ accessory 패밀리) ──────────────────────────────────
//
// 왜 넣나 (2026-08-08)
// ----------------------------------------------------------------------------
// 홈 위젯만 있었는데 **문서와 주석은 "홈/잠금"이라고 적고 있었다** — 문서가 코드보다
// 앞서 있던 자리다(감사 L-2). 잠금화면은 러닝 직전에 가장 많이 보는 면이고, 여기서
// 신발 수명이 보이면 "오늘 뭘 신지"가 앱을 열기 전에 끝난다(shoe-first).
//
// 잠금화면은 **단색으로 렌더된다**(widgetRenderingMode = .accessory). 홈 위젯의 마모
// 그라데이션은 여기서 의미가 없다 — 시스템이 전부 같은 틴트로 칠한다. 그래서 색으로
// 말하지 않고 **형태와 숫자로** 말한다: 링의 채움 정도와 남은 km.
// (색을 우겨 넣으면 시스템이 뭉개서 오히려 판독성만 떨어진다.)
struct KeegoCircularView: View {
    let shoe: KeegoShoe?
    var body: some View {
        if let shoe {
            // Gauge — 잠금화면 원형에서 애플이 주는 표준 표현. 링 채움이 곧 남은 수명이다.
            Gauge(value: shoe.remaining) {
                Image(systemName: "shoe")
            } currentValueLabel: {
                Text("\(Int(shoe.remaining * 100))")
                    .font(.system(size: 15, weight: .heavy))
                    .monospacedDigit()
            }
            .gaugeStyle(.accessoryCircular)
        } else {
            // 지어내지 않는다 — 홈 위젯과 같은 태도. 눌러서 앱을 열면 등록할 수 있다.
            Gauge(value: 0) {
                Image(systemName: "shoe")
            } currentValueLabel: {
                Image(systemName: "plus")
            }
            .gaugeStyle(.accessoryCircular)
        }
    }
}

struct KeegoRectangularView: View {
    let shoe: KeegoShoe?
    var body: some View {
        if let shoe {
            VStack(alignment: .leading, spacing: 2) {
                Text(shoe.name)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
                // 남은 수명 막대 — 단색이라 '얼마나 남았나'는 길이로만 읽힌다.
                Gauge(value: shoe.remaining) { EmptyView() }
                    .gaugeStyle(.accessoryLinearCapacity)
                Text("\(shoe.usedKm) / \(shoe.maxKm)km")
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .widgetAccentable(false)
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

struct KeegoInlineView: View {
    let shoe: KeegoShoe?
    var body: some View {
        if let shoe {
            // 한 줄 — 시스템이 폭을 심하게 줄이므로 이름은 뒤로, 숫자를 앞에 둔다.
            Text("\(shoe.usedKm)/\(shoe.maxKm)km · \(shoe.name)")
        } else {
            Text("러닝화를 등록해 주세요")
        }
    }
}

/// 보여줄 신발이 없을 때. **안드로이드 위젯과 같은 문구·같은 태도**
/// (ShoeWidgetProvider.kt: "아직 신발이 없거나 앱을 한 번도 안 열었다 — 지어내지 않는다").
/// 링은 비어 있는 상태로 그려 위젯의 형태는 유지한다 — 탭하면 앱이 열려 등록할 수 있다.
struct KeegoEmptyView: View {
    var compact: Bool = false
    var body: some View {
        VStack(spacing: compact ? 10 : 12) {
            ZStack {
                Circle().stroke(Color.white.opacity(0.10), lineWidth: 9)
                Image(systemName: "plus")
                    .font(.system(size: compact ? 22 : 26, weight: .heavy))
                    .foregroundColor(Color(hex: 0x9C9CA3))
            }
            .frame(width: compact ? 100 : 114, height: compact ? 100 : 114)
            Text("러닝화를 등록해 주세요")
                .font(.system(size: compact ? 12 : 14, weight: .semibold))
                .foregroundColor(Color(hex: 0x9C9CA3))
                .lineLimit(2).multilineTextAlignment(.center).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(14)
    }
}

struct KeegoShoeWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: KeegoEntry
    /// 잠금화면 패밀리인가 — 배경 처리와 링크 방식이 홈 위젯과 다르다.
    private var isAccessory: Bool {
        family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline
    }
    var body: some View {
        Group {
            switch family {
            // 잠금화면(액세서리) — 단색 렌더라 전용 뷰를 쓴다. 빈 상태 처리는 각 뷰 안에서.
            case .accessoryCircular: KeegoCircularView(shoe: entry.shoe)
            case .accessoryRectangular: KeegoRectangularView(shoe: entry.shoe)
            case .accessoryInline: KeegoInlineView(shoe: entry.shoe)
            // 홈 화면 — 신발이 없으면 **빈 상태**다. 샘플로 메우면 남의 신발이 내 홈에 뜬다.
            default:
                if let shoe = entry.shoe {
                    if family == .systemMedium { KeegoMediumView(shoe: shoe) } else { KeegoSmallView(shoe: shoe) }
                } else {
                    KeegoEmptyView(compact: family != .systemMedium)
                }
            }
        }
        .containerBackgroundCompat(accessory: isAccessory)
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
        // 잠금화면 3종 추가(2026-08-08) — 러닝 직전에 가장 많이 보는 면이다.
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
        ])
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
    /// 홈 위젯은 검은 판을 직접 깐다. **잠금화면(액세서리)은 깔면 안 된다** — 그 면은
    /// 시스템이 소유하고 반투명 재질 위에 얹히므로, 검은 사각형을 그리면 잠금화면에
    /// 시커먼 판이 박힌다(2026-08-08 액세서리 패밀리 추가 시 함께 처리).
    @ViewBuilder func containerBackgroundCompat(accessory: Bool) -> some View {
        if accessory {
            self
        } else if #available(iOS 17.0, *) {
            self.containerBackground(Color.black, for: .widget)
        } else {
            ZStack { Color.black; self }
        }
    }
}
