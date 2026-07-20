// SummaryView.swift — 종료 요약: 거리·시간·평균 페이스·평균 심박 → 저장
// ----------------------------------------------------------------------------
// HealthKit 워크아웃 저장(keego 신발 id 메타데이터)은 종료 시점에 이미 끝났고,
// '저장'은 폰으로 런 페이로드를 보내(WatchLink.sendRun — 비도달 시 큐잉) 신발
// 거리 차감/기록 동기화를 잇는다. Truth only — 모든 숫자는 세션 실측 집계.
import SwiftUI

struct SummaryView: View {
  @EnvironmentObject var workout: WorkoutManager

  var body: some View {
    ScrollView {
      VStack(spacing: 6) {
        Text("러닝 완료")
          .font(.system(size: 15, weight: .heavy))
          .foregroundStyle(KeegoTheme.t1)
        // keep-going 보이스 — 유치/과장 없이 절제.
        Text("오늘도 계속 나아갔어요")
          .font(.system(size: 11))
          .foregroundStyle(KeegoTheme.t3)
          .padding(.bottom, 2)

        if let s = workout.summary {
          // 거리 히어로(러닝 화면과 동일 위계) — km 라벨만 파파야.
          VStack(spacing: 0) {
            Text(KeegoFormat.km(s.km))
              .font(.system(size: 34, weight: .heavy))
              .monospacedDigit()
              .foregroundStyle(KeegoTheme.t1)
            Text("km")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(KeegoTheme.brand)
          }
          .padding(.bottom, 4)

          VStack(spacing: 4) {
            row(label: "시간", value: KeegoFormat.time(s.durationS))
            row(label: "평균 페이스", value: KeegoFormat.pace(secPerKm: s.avgPaceSecPerKm))
            row(label: "평균 심박", value: s.avgBpm > 0 ? "\(Int(s.avgBpm.rounded())) BPM" : "--")
            if !s.shoeName.isEmpty {
              row(label: "신발", value: s.shoeName)
            }
          }
          .padding(8)
          .background(KeegoTheme.glassFill)
          .clipShape(RoundedRectangle(cornerRadius: 12))
          .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(KeegoTheme.hairline, lineWidth: 1))
        }

        // 완료 — 런은 정지 순간 이미 자동 저장됐다(buildSummary). 이 버튼은 요약을 닫고
        // 홈으로 돌아가는 확인용(안 눌러도 유실 없음). 시작 버튼과 같은 콰이어트 글라스 캡슐.
        Button {
          workout.confirmSave()
        } label: {
          Text("완료")
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(KeegoTheme.t1)
            .frame(maxWidth: .infinity)
            .frame(height: 36)
            .background(KeegoTheme.glassFill)
            .clipShape(Capsule())
            .overlay(Capsule().strokeBorder(KeegoTheme.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .padding(.top, 4)

        Text("폰과 자동으로 동기화돼요")
          .font(.system(size: 10))
          .foregroundStyle(KeegoTheme.t4)
      }
      .padding(.horizontal, 4)
    }
  }

  private func row(label: String, value: String) -> some View {
    HStack {
      Text(label)
        .font(.system(size: 12))
        .foregroundStyle(KeegoTheme.t3)
      Spacer(minLength: 4)
      Text(value)
        .font(.system(size: 13, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(KeegoTheme.t1)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
  }
}
