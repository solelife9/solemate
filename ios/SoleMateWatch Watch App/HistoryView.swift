// HistoryView.swift — 워치 기록(최근 러닝) 목록
// ----------------------------------------------------------------------------
// StartView 의 작은 '기록' 진입점에서 시트로 뜬다(홈의 본분은 여전히 러닝 시작).
// 최근 ~10개(RecentRuns)를 카드 목록으로 — 각 행: 날짜 + 거리 km + 평균 페이스
// (+ 소요시간 보조). 색·폰트·간격은 KeegoTheme 토큰만, 카드 재질은 요약 화면과 동일한
// 콰이어트 글라스. 비면 keep-going 보이스 한 줄. Truth only — 실제 저장된 값만.
import SwiftUI

struct HistoryView: View {
  // 시트를 여는 순간의 스냅샷(러닝 중이 아니므로 갱신 구독 불필요).
  private let runs = RecentRuns.load()

  var body: some View {
    NavigationStack {
      Group {
        if runs.isEmpty {
          emptyState
        } else {
          ScrollView {
            VStack(spacing: 6) {
              ForEach(runs) { run in
                NavigationLink { RecentRunDetail(run: run) } label: { RecentRunRow(run: run) }
                  .buttonStyle(.plain)
              }
            }
            .padding(.horizontal, 4)
            .padding(.top, 2)
            .padding(.bottom, 6)
          }
        }
      }
      .navigationTitle("기록")
    }
  }

  // 비어 있을 때 — 신발 글리프 대신 러너 글리프로 '첫 러닝' 유도. 절제된 두 줄.
  private var emptyState: some View {
    VStack(spacing: 6) {
      Image(systemName: "figure.run")
        .font(.system(size: 22, weight: .medium))
        .foregroundStyle(KeegoTheme.t3)
        .padding(.bottom, 2)
      Text("아직 기록이 없어요")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(KeegoTheme.t2)
      Text("첫 러닝을 시작해요")
        .font(.system(size: 12))
        .foregroundStyle(KeegoTheme.t3)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(.horizontal, 12)
  }
}

/// 최근 러닝 한 건 — 콰이어트 글라스 카드(요약 화면과 동일 재질).
/// 좌: 날짜(T3) + 거리 히어로(km 라벨만 파파야) · 우: 평균 페이스 + 소요시간.
private struct RecentRunRow: View {
  let run: RecentRun

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(Self.dateText(run.date))
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(KeegoTheme.t3)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        // 거리 히어로 — 목록에서도 거리가 첫 정보(러닝 도메인 위계).
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text(KeegoFormat.km(run.km))
            .font(.system(size: 24, weight: .heavy))
            .monospacedDigit()
            .foregroundStyle(KeegoTheme.t1)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
          Text("km")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(KeegoTheme.brand)
        }
        Spacer(minLength: 4)
        // 평균 페이스(주) + 소요시간(보조) — 우측 정렬.
        VStack(alignment: .trailing, spacing: 1) {
          Text(KeegoFormat.pace(secPerKm: run.avgPaceSecPerKm))
            .font(.system(size: 16, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(KeegoTheme.t2)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
          Text(KeegoFormat.time(run.durationS))
            .font(.system(size: 11, weight: .medium))
            .monospacedDigit()
            .foregroundStyle(KeegoTheme.t3)
        }
      }
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(KeegoTheme.glassFill)
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(KeegoTheme.hairline, lineWidth: 1))
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      "\(Self.dateText(run.date)), \(KeegoFormat.km(run.km))킬로미터, 평균 페이스 \(KeegoFormat.pace(secPerKm: run.avgPaceSecPerKm))")
  }

  /// 날짜 — 오늘/어제는 시각까지, 그 이전은 'M월 d일'(한국어).
  static func dateText(_ date: Date) -> String {
    let cal = Calendar.current
    if cal.isDateInToday(date) { return "오늘 " + Self.time.string(from: date) }
    if cal.isDateInYesterday(date) { return "어제 " + Self.time.string(from: date) }
    return Self.day.string(from: date)
  }

  private static let day: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "ko_KR")
    f.setLocalizedDateFormatFromTemplate("MMMd")
    return f
  }()

  private static let time: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "ko_KR")
    f.setLocalizedDateFormatFromTemplate("jm")
    return f
  }()
}

/// 최근 러닝 상세 — 행 탭 시. 거리 히어로 + 전 지표(시간·페이스·심박·케이던스·칼로리·고도)
/// + 신발 + 소스 배지(워치/폰). 측정 안 된 값은 '--'(Truth only — 숨겨서 마스킹하지 않음).
private struct RecentRunDetail: View {
  let run: RecentRun

  var body: some View {
    ScrollView {
      VStack(spacing: 8) {
        // 날짜 + 소스 배지.
        HStack(spacing: 6) {
          Text(RecentRunRow.dateText(run.date))
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(KeegoTheme.t3)
          Text(run.source == "phone" ? "폰" : "워치")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(KeegoTheme.t3)
            .padding(.horizontal, 5).padding(.vertical, 1)
            .overlay(Capsule().strokeBorder(KeegoTheme.hairline, lineWidth: 1))
        }
        // 거리 히어로.
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text(KeegoFormat.km(run.km))
            .font(.system(size: 34, weight: .heavy)).monospacedDigit()
            .foregroundStyle(KeegoTheme.t1)
          Text("km").font(.system(size: 12, weight: .semibold)).foregroundStyle(KeegoTheme.brand)
        }
        VStack(spacing: 4) {
          row("시간", KeegoFormat.time(run.durationS))
          row("평균 페이스", KeegoFormat.pace(secPerKm: run.avgPaceSecPerKm))
          row("평균 심박", run.avgBpm > 0 ? "\(Int(run.avgBpm.rounded())) BPM" : "--")
          row("케이던스", run.cadence > 0 ? "\(Int(run.cadence.rounded())) spm" : "--")
          row("칼로리", run.kcal > 0 ? "\(Int(run.kcal.rounded())) kcal" : "--")
          // 워치 자체 기록은 상승 고도를 표시하지 않는다(2026-07-28) — 워치는 고도를
          // 계산하지 않고 원자료만 폰에 넘긴다(폰 lib/elevation.ts 가 한 벌로 계산).
          // 폰에서 온 기록(source=="phone")은 이미 계산된 값이라 그대로 보여준다.
          if run.source == "phone", run.elevGainM > 0 {
            row("상승 고도", "\(Int(run.elevGainM.rounded())) m")
          }
          if !run.shoeName.isEmpty { row("신발", run.shoeName) }
        }
        .padding(8)
        .background(KeegoTheme.glassFill)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(KeegoTheme.hairline, lineWidth: 1))
      }
      .padding(.horizontal, 6).padding(.bottom, 8)
    }
    .navigationTitle("러닝 상세")
  }

  private func row(_ label: String, _ value: String) -> some View {
    HStack {
      Text(label).font(.system(size: 12)).foregroundStyle(KeegoTheme.t3)
      Spacer(minLength: 4)
      Text(value).font(.system(size: 13, weight: .semibold)).monospacedDigit()
        .foregroundStyle(KeegoTheme.t1).lineLimit(1).minimumScaleFactor(0.7)
    }
  }
}
