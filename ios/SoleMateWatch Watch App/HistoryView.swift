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
                RecentRunRow(run: run)
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
