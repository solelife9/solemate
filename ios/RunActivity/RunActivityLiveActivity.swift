// RunActivityLiveActivity.swift — 잠금화면/다이내믹 아일랜드 러닝 위젯 UI
// Xcode 가 타깃 생성 시 만든 템플릿 파일을 이 내용으로 '교체'한다. 이 파일은 'RunActivity'
// (위젯 익스텐션) 타깃에만 멤버십. RunActivityAttributes 는 공유 파일에서 가져온다.
import ActivityKit
import WidgetKit
import SwiftUI

// Keego Ember(브랜드) — theme.ts RING_ACCENT #FF8000 정합(구 #FF6600 스테일 교정).
private let kAccent = Color(red: 1.0, green: 0.502, blue: 0.0)

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
          // 신발명 가시성 상향(2026-07-25 민우님) — caption2/secondary 는 틴트 배경에서 묻혔다.
          Text(context.attributes.shoeName).font(.subheadline).fontWeight(.semibold)
            .foregroundColor(.white.opacity(0.85)).lineLimit(1)
        }
      }
      // 거리(히어로) — 자체 행. 32→40: 잠금화면은 팔 뻗어 흘끗 보는 거리라 전체 한 단
      // 상향(2026-07-25 민우님 실기기 피드백 "글씨들이 너무 작다").
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(fmtDist(st.distanceKm)).font(.system(size: 40, weight: .heavy, design: .rounded))
          .foregroundColor(.white).monospacedDigit()
        Text("km").font(.title3).fontWeight(.semibold).foregroundColor(.secondary)
      }
      // 시간 · 페이스 · 심박 — 거리 아래 한 줄, 균등 분배(케이던스 → 심박 교체, 민우님 지시).
      HStack(alignment: .top, spacing: 0) {
        metric(value: fmtTime(st.elapsedSec), label: "시간")
        metric(value: st.paceLabel, label: "페이스")
        metric(value: st.bpm > 0 ? "\(st.bpm)" : "--", label: "심박")
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
        Text("목표 \(fmtDist(goal))km · \(Int(pct * 100))%").font(.caption).foregroundColor(.secondary)
      }
    }
  }
  private func metric(value: String, label: String) -> some View {
    // 지표 3열 가시성 상향(2026-07-25 민우님 2차) — 값 20→24, 라벨 secondary→흰 65%
    // (틴트 배경 위 system secondary 가 너무 어두웠다).
    VStack(alignment: .leading, spacing: 2) {
      Text(value).font(.system(size: 24, weight: .bold, design: .rounded)).foregroundColor(.white).monospacedDigit()
      Text(label).font(.footnote).foregroundColor(.white.opacity(0.65))
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
            // 브랜드 서명 — 소문자 'keego'(BRAND.md 워드마크 정본). Ember 색을 쓰는 것도
            // 그래서 허용된다(DESIGN §1 'B 서명+진행': 브랜드색은 서명·러닝 진행에만).
            // 2026-08-04: 'SoleMate' 스테일 교정 — 앱은 Keego 로 개명됐는데(표시명·번들 ID·
            // 워드마크 전부) **러닝 중 가장 자주 보이는 표면**인 다이내믹 아일랜드만 옛 이름을
            // 말하고 있었다. 화면 안 문자열은 여기 하나뿐이고, 나머지 'SoleMate' 는 전부
            // Xcode 타깃·스킴 이름이라 건드리지 않는다(빌드 설정).
            Text("keego").font(.caption2).foregroundColor(kAccent)
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
