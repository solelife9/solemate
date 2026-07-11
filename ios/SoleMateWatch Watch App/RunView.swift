// RunView.swift — 러닝 중 화면: km 메인 히어로 + 보조 지표 스택(링 없음)
// ----------------------------------------------------------------------------
// 사용자 확정(2026-07-10): 워치 화면이 작아 진행 링은 제거 — 거리(km)가 대형
// tabular-nums 히어로, 그 아래 시간·페이스·심박(존 색) 세로 스택. 파파야는 km 단위
// 라벨(아래 매달림 — 폰과 동일 문법) 한 점에만.
//
// 축 분리(2026-07-11 사용자 피드백 — Apple 운동 앱 문법): 세로(크라운) = 지표만,
// 가로 스와이프 = 컨트롤(일시정지/종료 — 어느 지표 페이지에서든 한 동작, 지표 탐색이
// 컨트롤을 지나치지 않아 오터치가 없다). 컨트롤은 큰 원형 버튼 2개, 종료=DANGER 만 색.
// 세로 페이지는 실사용 근거가 있는 것만(MISSION §5 '딱 필요한 정보만'): 메인(핵심
// 전부) → 심박존(존 트레이닝 실수요) → km 랩(첫 랩부터 — 방금 km 페이스 확인, Apple
// 세그먼트/가민 랩 관용) → Now Playing(러닝 중 음악 제어 — Apple 운동 앱이 세로 맨
// 아래에 두는 문법 그대로). 시간/평균페이스 단독 대형 페이지는 근거가 없어 삭제
// (메인에 이미 있음 — 2026-07-11 사용자 확정).
import SwiftUI
import WatchKit

struct RunView: View {
  @EnvironmentObject var workout: WorkoutManager
  /// 가로: 0 = 지표(기본) · 1 = 컨트롤. 첫 페이지로 시작해야 한다 — watchOS .page
  /// TabView 를 비-첫 페이지 selection 으로 생성하면 첫 레이아웃이 깨진다(StartView 실측).
  @State private var hPage = 0
  /// 세로(지표 안): 0 메인 · 1 심박존 · 2 km 랩(첫 랩 완료 후) · 3 Now Playing.
  @State private var vPage = 0

  var body: some View {
    TabView(selection: $hPage) {
      metricsPager.tag(0)
      controlsPage.tag(1)
    }
    .tabViewStyle(.page)
  }

  // ── 지표 페이저(세로) — 컨트롤이 지표 탐색 길을 막지 않는다 ──────────────────
  private var metricsPager: some View {
    TabView(selection: $vPage) {
      mainPage.tag(0)
      heartPage.tag(1)
      // 랩 페이지는 첫 km 완주 후에만 — 빈 표를 보여줄 이유가 없다(§5).
      if !workout.splits.isEmpty {
        splitsPage.tag(2)
      }
      // Now Playing 은 세로 맨 아래(Apple 운동 앱 관용) — 시스템 뷰 그대로.
      NowPlayingView().tag(3)
    }
    .tabViewStyle(.verticalPage)
  }

  // ── 세로 0: 핵심이 다 보이는 메인(거리 히어로 + 보조 스택) ──────────────────
  private var mainPage: some View {
    VStack(spacing: 0) {
      if workout.phase == .paused {
        Text(workout.autoPaused ? "자동 일시정지" : "일시정지")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(KeegoTheme.warn)
      }
      // 거리 히어로 — 800급 + tabular-nums(폰 러닝 화면과 동일 문법).
      Text(KeegoFormat.km(workout.distanceKm))
        .font(.system(size: 46, weight: .heavy))
        .monospacedDigit()
        .foregroundStyle(KeegoTheme.t1)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      // km 라벨 아래 매달림 — 파파야 최소 포인트(러닝 도메인 표식).
      Text("km")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(KeegoTheme.brand)
        .padding(.top, -2)

      Spacer(minLength: 6)

      // 보조 지표 스택 — 라벨 T3 / 값 흰 세미볼드 tabular.
      HStack(spacing: 0) {
        miniMetric(label: "시간", value: KeegoFormat.time(workout.elapsedS))
        miniMetric(label: "페이스", value: KeegoFormat.pace(secPerKm: workout.avgPaceSecPerKm))
      }
      HStack(spacing: 4) {
        Image(systemName: "heart.fill")
          .font(.system(size: 11))
          .foregroundStyle(KeegoTheme.hrZoneColor(workout.hrZone))
        Text(workout.heartRate > 0 ? "\(Int(workout.heartRate))" : "--")
          .font(.system(size: 16, weight: .semibold))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.t1)
        Text("BPM")
          .font(.system(size: 10))
          .foregroundStyle(KeegoTheme.t3)
      }
      .padding(.top, 4)
    }
    .padding(.horizontal, 6)
  }

  private func miniMetric(label: String, value: String) -> some View {
    VStack(spacing: 1) {
      Text(label)
        .font(.system(size: 10))
        .foregroundStyle(KeegoTheme.t3)
      Text(value)
        .font(.system(size: 16, weight: .semibold))
        .monospacedDigit()
        .foregroundStyle(KeegoTheme.t1)
    }
    .frame(maxWidth: .infinity)
  }

  // ── 세로 1: 심박존(존 트레이닝용 대형 — 존 색이 곧 판단) ─────────────────────
  private var heartPage: some View {
    VStack(spacing: 2) {
      Text(workout.hrZone > 0 ? "Z\(workout.hrZone) \(KeegoTheme.hrZoneLabel[workout.hrZone] ?? "")" : "심박")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(KeegoTheme.t3)
      Text(workout.heartRate > 0 ? "\(Int(workout.heartRate))" : "--")
        .font(.system(size: 42, weight: .heavy))
        .monospacedDigit()
        .foregroundStyle(KeegoTheme.hrZoneColor(workout.hrZone))
        .lineLimit(1)
        .minimumScaleFactor(0.5)
      Text("BPM")
        .font(.system(size: 11))
        .foregroundStyle(KeegoTheme.t3)
    }
    .padding(.horizontal, 6)
  }

  // ── 세로 2: km 랩 — 방금 지난 km 페이스(최신 위, 최근 4개) ───────────────────
  private var splitsPage: some View {
    VStack(spacing: 3) {
      Text("km 랩")
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(KeegoTheme.t3)
      ForEach(Array(workout.splits.enumerated().suffix(4).reversed()), id: \.offset) { idx, lap in
        HStack {
          Text("\(idx + 1) km")
            .foregroundStyle(idx == workout.splits.count - 1 ? KeegoTheme.t1 : KeegoTheme.t3)
          Spacer()
          Text(KeegoFormat.pace(secPerKm: lap))
            .foregroundStyle(idx == workout.splits.count - 1 ? KeegoTheme.t1 : KeegoTheme.t3)
        }
        .font(.system(size: idx == workout.splits.count - 1 ? 18 : 14, weight: idx == workout.splits.count - 1 ? .bold : .medium))
        .monospacedDigit()
      }
    }
    .padding(.horizontal, 14)
  }

  // ── 가로 1: 컨트롤 — 큰 원형 버튼 2개(Apple 운동 앱 문법) ───────────────────
  private var controlsPage: some View {
    HStack(spacing: 14) {
      RoundControl(
        icon: "stop.fill",
        label: "종료",
        iconColor: KeegoTheme.danger
      ) { workout.end() }

      RoundControl(
        icon: workout.phase == .paused ? "play.fill" : "pause.fill",
        label: workout.phase == .paused ? "재개" : "일시정지",
        iconColor: KeegoTheme.t1
      ) {
        if workout.phase == .paused { workout.resume() } else { workout.pause() }
        // 일시정지/재개 후엔 지표로 복귀 — 다음 흘끗이 숫자를 바로 보게.
        hPage = 0
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// 원형 컨트롤 — 콰이어트 글라스 원(면 + 1pt 헤어라인) 안 글리프, 라벨은 아래 T3.
/// 색은 의미에만: 종료 글리프만 DANGER, 나머지는 무채(넓은 면 금지 가드레일).
private struct RoundControl: View {
  let icon: String
  let label: String
  let iconColor: Color
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(spacing: 5) {
        ZStack {
          Circle().fill(KeegoTheme.glassFill)
          Circle().strokeBorder(KeegoTheme.hairline, lineWidth: 1)
          Image(systemName: icon)
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(iconColor)
        }
        .frame(width: 64, height: 64)
        Text(label)
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(KeegoTheme.t2)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }
}
