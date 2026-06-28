// RunActivityLiveActivity.swift — 잠금화면/다이내믹 아일랜드 러닝 위젯 UI
// Xcode 가 타깃 생성 시 만든 템플릿 파일을 이 내용으로 '교체'한다. 이 파일은 'RunActivity'
// (위젯 익스텐션) 타깃에만 멤버십. RunActivityAttributes 는 공유 파일에서 가져온다.
import ActivityKit
import WidgetKit
import SwiftUI

// SoleMate 브랜드 액센트(주황). theme.ts 의 ACCENT 와 맞춘다.
private let kAccent = Color(red: 1.0, green: 0.40, blue: 0.0)

private func fmtDist(_ km: Double) -> String { String(format: "%.2f", max(0, km)) }
private func fmtTime(_ sec: Int) -> String {
  let s = max(0, sec); let h = s / 3600; let m = (s % 3600) / 60; let ss = s % 60
  return h > 0 ? String(format: "%d:%02d:%02d", h, m, ss) : String(format: "%d:%02d", m, ss)
}

// 잠금화면(배너) 레이아웃
struct RunLockScreenView: View {
  let context: ActivityViewContext<RunActivityAttributes>
  var body: some View {
    let st = context.state
    let goal = context.attributes.goalKm
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Image(systemName: "figure.run").font(.caption).foregroundColor(kAccent)
        Text("러닝 중").font(.caption).fontWeight(.bold).foregroundColor(kAccent)
        Spacer()
        if !context.attributes.shoeName.isEmpty {
          Text(context.attributes.shoeName).font(.caption2).foregroundColor(.secondary).lineLimit(1)
        }
      }
      // 거리(히어로) — 자체 행
      HStack(alignment: .firstTextBaseline, spacing: 3) {
        Text(fmtDist(st.distanceKm)).font(.system(size: 32, weight: .heavy, design: .rounded))
          .foregroundColor(.white).monospacedDigit()
        Text("km").font(.headline).foregroundColor(.secondary)
      }
      // 시간 · 페이스 · 케이던스 — 거리 아래 한 줄, 균등 분배
      HStack(alignment: .top, spacing: 0) {
        metric(value: fmtTime(st.elapsedSec), label: "시간")
        metric(value: st.paceLabel, label: "페이스")
        metric(value: st.cadenceSpm > 0 ? "\(st.cadenceSpm)" : "--", label: "케이던스")
      }
      if goal > 0 {
        let pct = min(1.0, max(0.0, st.distanceKm / goal))
        // overlay 로 고정 높이(5pt) Capsule 위에 채움 — GeometryReader 가 VStack 세로
        // 공간을 잡아먹지 않도록 바운드(독립 GeometryReader 의 세로 확장 회피).
        Capsule().fill(Color.white.opacity(0.15)).frame(height: 5)
          .overlay(alignment: .leading) {
            GeometryReader { geo in
              Capsule().fill(kAccent).frame(width: geo.size.width * pct)
            }
          }
        Text("목표 \(fmtDist(goal))km · \(Int(pct * 100))%").font(.caption2).foregroundColor(.secondary)
      }
    }
  }
  private func metric(value: String, label: String) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(value).font(.system(size: 16, weight: .bold, design: .rounded)).foregroundColor(.white).monospacedDigit()
      Text(label).font(.caption2).foregroundColor(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct RunActivityLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RunActivityAttributes.self) { context in
      RunLockScreenView(context: context)
        .padding(.horizontal, 20).padding(.vertical, 16)
        .activityBackgroundTint(Color.black.opacity(0.9))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      let st = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 4) {
            Image(systemName: "figure.run").foregroundColor(kAccent)
            Text("\(fmtDist(st.distanceKm)) km").font(.system(.title3, design: .rounded)).fontWeight(.bold)
              .foregroundColor(.white).monospacedDigit()
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(fmtTime(st.elapsedSec)).font(.system(.title3, design: .rounded)).fontWeight(.semibold)
            .foregroundColor(.white).monospacedDigit()
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Label(st.paceLabel, systemImage: "speedometer").font(.caption).foregroundColor(.secondary)
            Spacer()
            Text("SoleMate").font(.caption2).foregroundColor(kAccent)
          }
        }
      } compactLeading: {
        Image(systemName: "figure.run").foregroundColor(kAccent)
      } compactTrailing: {
        Text("\(fmtDist(st.distanceKm))").font(.system(.body, design: .rounded)).fontWeight(.semibold)
          .foregroundColor(.white).monospacedDigit()
      } minimal: {
        Image(systemName: "figure.run").foregroundColor(kAccent)
      }
      .keylineTint(kAccent)
    }
  }
}
