// RunView.swift — 러닝 중 화면: km 메인 히어로 + 보조 지표 스택(링 없음)
// ----------------------------------------------------------------------------
// 사용자 확정(2026-07-10): 워치 화면이 작아 진행 링은 제거 — 거리(km)가 대형
// tabular-nums 히어로, 그 아래 시간·페이스·심박(존 색) 세로 스택. 파파야는 km 단위
// 라벨(아래 매달림 — 폰과 동일 문법) 한 점에만.
//
// 축 분리(2026-07-11 사용자 피드백 — Apple 운동 앱 문법): 세로(크라운) = 지표만,
// 가로 스와이프 = 컨트롤·음악(어느 지표 페이지에서든 한 동작, 지표 탐색이 컨트롤을
// 지나치지 않아 오터치가 없다). 컨트롤은 큰 원형 버튼 2개, 종료=DANGER 만 색.
//
// 페이지 구성(2026-07-11 경쟁앱 딥리서치 반영 — Apple 기본 상위 뷰와 동일 골격):
//   세로 = 메인(핵심 전부) → 심박존(Zone2 실수요) → 현재 랩(Apple Split 뷰 문법 —
//          '목록'은 러닝 중 근거 전무라 단일 구간만). 시간/평균페이스 단독 대형과
//          스플릿 목록, 고도·케이던스는 근거 약해 제외(§5 딱 필요한 정보만).
//   가로 = 지표 ↔ 컨트롤 ↔ Now Playing(음악은 세로 스택 금지 — Apple·NRC 관습).
//   랩 이벤트 = km 마다 햅틱 + 직전 km 페이스 배너 3.5s(리서치 최강 근거 —
//          '화면 안 보는 러너'까지 커버, Garmin/COROS 기본 동작).
import SwiftUI
import WatchKit

struct RunView: View {
  @EnvironmentObject var workout: WorkoutManager
  /// Always-On(손목 내림 — 화면이 어두워진 상태)인가.
  ///
  /// 2026-07-28 민우님 실기기: "손목을 들어도 워치가 잘 안 켜져". 실제로는 화면이 꺼진 게
  /// 아니라 **숫자가 멈춰 있어서 꺼진 것처럼 보인** 것이다 — 경과시간을 1초 Timer 로 흘리는데
  /// AOD 상태에서는 그 Timer 가 돌지 않는다(watchOS 는 앱을 얼려 배터리를 아낀다).
  /// TimelineView(.periodic)로 시계를 바꾸면 watchOS 가 AOD 에서도 분당 갱신을 보장한다.
  @Environment(\.isLuminanceReduced) private var dimmed
  /// 가로: 0 = 지표(기본) · 1 = 컨트롤 · 2 = Now Playing. 첫 페이지로 시작해야 한다 —
  /// watchOS .page TabView 를 비-첫 페이지 selection 으로 생성하면 레이아웃이 깨진다(실측).
  @State private var hPage = 0
  /// 세로(지표 안): 0 메인 · 1 심박존 · 2 현재 랩.
  @State private var vPage = 0
  /// km 랩 배너 — 랩 마감 순간 직전 km 페이스(3.5s 뒤 자동 소멸).
  @State private var lapBanner: String?
  /// 목표 달성 배너 — goalReached 전환 시 4s 축하(러닝은 계속, 강제 종료 안 함).
  @State private var showGoalBanner = false
  /// 트랙 랩거리 자동 보정 토스트("약 400m 감지") — 3.5s 자동 소멸.
  @State private var showCalibToast = false
  @State private var calibText = ""

  var body: some View {
    TabView(selection: $hPage) {
      metricsPager.tag(0)
      controlsPage.tag(1)
      // 음악은 가로 맨 끝 — Apple 운동 앱·NRC 모두 가로 별도 페이지 관습.
      // 하단 여백: 시스템 재생 컨트롤이 페이지 도트와 겹치지 않게(실기기 피드백).
      NowPlayingView()
        .padding(.bottom, 10)
        .tag(2)
    }
    .tabViewStyle(.page)
    // km 랩 배너 — 어느 페이지에 있든 위에 얹힌다(햅틱은 WorkoutManager 가 울림).
    .overlay(alignment: .top) {
      if let banner = lapBanner {
        Text(banner)
          .font(.system(size: 13, weight: .bold))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.t1)
          .padding(.horizontal, 10)
          .padding(.vertical, 4)
          // 불투명 카드색 — 반투명이면 밑 히어로 숫자와 겹쳐 읽힌다(시뮬 실측).
          .background(Color(keego: 0x2C2C2E))
          .clipShape(Capsule())
          .overlay(Capsule().strokeBorder(KeegoTheme.hairline, lineWidth: 1))
          .transition(.move(edge: .top).combined(with: .opacity))
      }
    }
    .onChange(of: workout.splits.count) { _, n in
      guard n > 0, let last = workout.splits.last else { return }
      withAnimation(.easeOut(duration: 0.25)) {
        lapBanner = "\(n) km · \(KeegoFormat.pace(secPerKm: last))"
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
        withAnimation(.easeIn(duration: 0.3)) { lapBanner = nil }
      }
    }
    // 트랙 랩 배너 — 자동랩 완료 순간 직전 랩 시간(km 배너와 같은 자리).
    .onChange(of: workout.lapTimes.count) { _, n in
      guard n > 0, let last = workout.lapTimes.last else { return }
      withAnimation(.easeOut(duration: 0.25)) {
        lapBanner = "\(n)랩 · \(KeegoFormat.time(last))"
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
        withAnimation(.easeIn(duration: 0.3)) { lapBanner = nil }
      }
    }
    // 트랙 랩거리 자동 보정 토스트 — "이 트랙, 약 Nm 감지".
    .onChange(of: workout.lapJustCalibrated) { _, calibrated in
      guard calibrated else { return }
      calibText = "이 트랙, 약 \(Int(workout.lapM))m 감지"
      withAnimation(.easeOut(duration: 0.3)) { showCalibToast = true }
      workout.consumeLapCalibrated()
      DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
        withAnimation(.easeIn(duration: 0.3)) { showCalibToast = false }
      }
    }
    // 목표 달성 축하 — 4s 후 자동 소멸. 러닝은 계속(기록 이어짐).
    .onChange(of: workout.goalReached) { _, reached in
      guard reached else { return }
      withAnimation(.easeOut(duration: 0.3)) { showGoalBanner = true }
      DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) {
        withAnimation(.easeIn(duration: 0.3)) { showGoalBanner = false }
      }
    }
    .overlay {
      if showGoalBanner {
        VStack(spacing: 4) {
          Text("🎯").font(.system(size: 30))
          Text("목표 달성")
            .font(.system(size: 16, weight: .heavy))
            .foregroundStyle(KeegoTheme.t1)
          Text("계속 달려도 기록은 이어져요")
            .font(.system(size: 10))
            .foregroundStyle(KeegoTheme.t3)
            .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(Color(keego: 0x1C1C1E))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(KeegoTheme.hairline, lineWidth: 1))
        .transition(.scale.combined(with: .opacity))
      }
    }
    // 트랙 보정 토스트 — 중앙(상단의 km/트랙 랩 배너와 자리 분리).
    .overlay(alignment: .center) {
      if showCalibToast {
        Text(calibText)
          .font(.system(size: 12, weight: .bold))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.brand)
          .multilineTextAlignment(.center)
          .padding(.horizontal, 12).padding(.vertical, 8)
          .background(Color(keego: 0x1C1C1E))
          .clipShape(Capsule())
          .overlay(Capsule().strokeBorder(KeegoTheme.hairline, lineWidth: 1))
          .transition(.scale.combined(with: .opacity))
      }
    }
  }

  // ── 지표 페이저(세로) — 컨트롤이 지표 탐색 길을 막지 않는다 ──────────────────
  private var metricsPager: some View {
    TabView(selection: $vPage) {
      mainPage.tag(0)
      heartPage.tag(1)
      lapPage.tag(2)
    }
    .tabViewStyle(.verticalPage)
  }

  // ── 세로 0: 핵심이 다 보이는 메인(거리 히어로 + 보조 스택) ──────────────────
  private var mainPage: some View {
    // ── AOD 에서도 **모든 지표**가 갱신된다 (2026-08-08) ────────────────────────
    // 예전엔 TimelineView 가 경과시간 한 줄만 감쌌다. 그래서 손목을 내리면(AOD) 시계만
    // 흐르고 **거리·페이스·심박은 손목을 내린 순간의 숫자로 얼어붙었다.** 달리다 흘끗
    // 봤을 때 가장 믿게 되는 화면인데 거기 멈춘 값이 떠 있는 것이라, "안 늘어난다"는
    // 오해를 넘어 **잘못된 판단(페이스 조절)** 으로 이어진다.
    //
    // 스택 전체를 감싸 한 번에 갱신한다. AOD 에서는 1초가 아니라 60초 간격이므로
    // (watchOS 가 그보다 잦은 갱신을 허용하지 않는다) 전력 비용은 사실상 그대로다.
    TimelineView(.periodic(from: .now, by: dimmed ? 60 : 1)) { _ in
      mainPageBody
    }
  }

  private var mainPageBody: some View {
    VStack(spacing: 0) {
      // 경과시간 — 화면 맨 위에 계속 흐른다(2026-07-28 민우님: "시간 제일 위에 흐르게").
      Group {
        Text(KeegoFormat.time(workout.liveElapsedS))
          .font(.system(size: 22, weight: .semibold))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.t2)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      if workout.phase == .paused {
        Text(workout.autoPaused ? "자동 일시정지" : "일시정지")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(KeegoTheme.warn)
      }
      // 거리 히어로 — 800급 + tabular-nums(폰 러닝 화면과 동일 문법).
      // 46 → 48(2026-07-28 민우님: "km 는 얼추 보였으니까 조금만").
      // 크게 못 올리는 이유가 있다 — 41mm 워치에서 세로가 넘치면 **아래 지표가 잘려
      // 사라진다**. 민우님이 "3개만 뜬다"고 한 게 그 증상이었다(심박·평균이 화면 밖).
      // 넷이 다 보이는 게 우선이라 히어로는 절제한다.
      Text(KeegoFormat.km(workout.distanceKm))
        .font(.system(size: 48, weight: .heavy))
        .monospacedDigit()
        .foregroundStyle(KeegoTheme.t1)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      // km 라벨. 거리 소스 진단 태그(HK/GPS)는 제거했다 — 원인 확정용 개발 잔여물이었고
      // (2026-07-28) 러닝 중 화면에서 9pt 글자는 읽히지도 않으면서 공간만 먹었다.
      Text("km")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(KeegoTheme.brand)
        .padding(.top, -2)

      // 목표 진행 — 거리/시간 목표면 얇은 바 + 남은 양(링 제거 결정과 정합).
      // 자유·트랙은 progressTarget 0 → 숨김.
      if workout.goal.progressTarget > 0 {
        goalProgressBar
          .padding(.horizontal, 12)
          .padding(.top, 6)
      }
      // 트랙 모드 — 거리 아래 랩수·확정 랩거리 한 줄(진행 바 대신).
      if workout.isTrack {
        Text("\(workout.lapTimes.count)랩 · 트랙 \(Int(workout.lapM))m")
          .font(.system(size: 11, weight: .semibold))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.brand)
          .padding(.top, 5)
      }

      Spacer(minLength: 4)

      // 심박 · 페이스 — 거리 히어로 바로 아래 한 줄(2026-07-28 민우님 배치 확정).
      // 시간은 맨 위로 올렸다(아래 참조) — 러닝 중 계속 흐르는 값이라 시선이 자주 가고,
      // 히어로 아래는 '지금 어떻게 뛰고 있나'(심박·페이스)가 차지하는 게 맞다.
      HStack(spacing: 0) {
        miniMetric(
          label: "심박",
          value: workout.heartRate > 0 ? "\(Int(workout.heartRate))" : "--",
          color: KeegoTheme.hrZoneColor(workout.hrZone)
        )
        // 메인 페이스 = 현재(순간·롤링) — 러너가 가장 자주 보는 실시간 지표(#3).
        miniMetric(label: "페이스", value: KeegoFormat.pace(secPerKm: workout.currentPaceSecPerKm))
      }
      .padding(.top, 4)
    }
    .padding(.horizontal, 6)
  }

  // 목표 진행 바 — 얇은 캡슐(파파야 채움) + 남은 양 캡션. 거리/시간 목표 전용.
  private var goalProgressBar: some View {
    VStack(spacing: 3) {
      GeometryReader { g in
        ZStack(alignment: .leading) {
          Capsule().fill(Color.white.opacity(0.12))
          Capsule()
            .fill(KeegoTheme.brand)
            .frame(width: max(3, g.size.width * CGFloat(min(1, max(0, workout.goalProgress)))))
        }
      }
      .frame(height: 5)
      if let rem = workout.goalRemainingText {
        Text(rem)
          .font(.system(size: 10, weight: .semibold))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.t3)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
    }
  }

  /// 보조 지표 한 칸. `color` 는 심박 존 색 전용(그 외는 흰색).
  private func miniMetric(label: String, value: String, color: Color = KeegoTheme.t1) -> some View {
    VStack(spacing: 1) {
      Text(label)
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(KeegoTheme.t3)
      Text(value)
        // 2026-07-28 실기기 3차 피드백("밑에 글씨들이 안 보여") — 16 → 25 → 28.
        // 조금씩 키우는 걸로는 안 됐던 이유는 세로로 쌓느라 자리가 없었기 때문이라,
        // 2×2 배치로 바꿔 가로 여유를 만들고 그만큼 키웠다.
        .font(.system(size: 30, weight: .bold))
        .monospacedDigit()
        .foregroundStyle(color)
        .lineLimit(1)
        // 0.6 → 0.8: 반폭이라 긴 값(1:02:33)은 줄여야 하지만, 0.6 은 17pt 까지 쪼그라들어
        // "안 보인다"의 진짜 원인이었다. 하한을 올려 최악에도 22pt 를 지킨다.
        .minimumScaleFactor(0.8)
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

  // ── 세로 2: 현재 랩 ── 트랙 모드면 트랙 랩 목록, 아니면 km 현재 랩(Apple Split) ──
  @ViewBuilder private var lapPage: some View {
    if workout.isTrack {
      trackLapPage
    } else {
      kmLapPage
    }
  }

  // km 현재 랩(Apple Split 뷰 문법 — 진행 중인 구간 하나만).
  private var kmLapPage: some View {
    VStack(spacing: 2) {
      Text("랩 \(workout.splits.count + 1)")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(KeegoTheme.t3)
      Text(KeegoFormat.pace(secPerKm: workout.currentLapPaceSecPerKm))
        .font(.system(size: 42, weight: .heavy))
        .monospacedDigit()
        .foregroundStyle(KeegoTheme.t1)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
      HStack(spacing: 3) {
        Text(String(format: "%.2f", workout.currentLapKm))
          .font(.system(size: 13, weight: .semibold))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.t2)
        Text("km")
          .font(.system(size: 11))
          .foregroundStyle(KeegoTheme.t3)
        if let last = workout.splits.last {
          Text("· 직전 \(KeegoFormat.pace(secPerKm: last))")
            .font(.system(size: 11))
            .monospacedDigit()
            .foregroundStyle(KeegoTheme.t3)
        }
      }
    }
    .padding(.horizontal, 6)
  }

  // 트랙 랩 목록 — 진행 중 랩(대형·파파야) + 최근 완료 랩 2개(시간). 랩=시간(초/랩).
  private var trackLapPage: some View {
    VStack(spacing: 4) {
      // 진행 중 랩
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text("랩 \(workout.currentTrackLap)")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(KeegoTheme.t3)
        Text(KeegoFormat.time(workout.currentTrackLapElapsedS))
          .font(.system(size: 30, weight: .heavy))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.brand)
      }
      // 최근 완료 랩 2개(가장 최근이 위).
      let recent = Array(workout.lapTimes.enumerated().suffix(2).reversed())
      ForEach(recent, id: \.offset) { idx, t in
        HStack {
          Text("랩 \(idx + 1)")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(KeegoTheme.t3)
          Spacer(minLength: 4)
          Text(KeegoFormat.time(t))
            .font(.system(size: 14, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(KeegoTheme.t2)
        }
      }
      if workout.lapTimes.isEmpty {
        Text("출발점으로 돌아오면 1랩")
          .font(.system(size: 10))
          .foregroundStyle(KeegoTheme.t4)
      }
    }
    .padding(.horizontal, 8)
  }

  // ── 가로 1: 컨트롤 — 큰 원형 버튼 2개(Apple 운동 앱 문법) ───────────────────
  // 종료는 길게 누르기(0.6s) — 러닝을 되돌릴 수 없이 끝내는 유일한 행동이라
  // 오터치 방지(Strava 인접 오터치 공개 사고 사례, 리서치 2026-07-11). 짧은 탭엔
  // '길게 눌러 종료' 힌트. Garmin/COROS 홀드 관용이라 러너에게 익숙하다.
  private var controlsPage: some View {
    HStack(spacing: 14) {
      RoundControl(
        icon: "stop.fill",
        label: "종료",
        iconColor: KeegoTheme.danger,
        holdToActivate: true
      ) { workout.end(notifyPhone: true) } // 워치에서 직접 종료 — 폰 러닝도 미러 종료

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
/// holdToActivate = 길게 누르기(0.6s)로만 실행 — 짧은 탭엔 힌트 라벨.
private struct RoundControl: View {
  let icon: String
  let label: String
  let iconColor: Color
  var holdToActivate = false
  let action: () -> Void
  /// 짧은 탭 힌트('길게 눌러 종료') 표시 중인가.
  @State private var showHint = false

  var body: some View {
    let content = VStack(spacing: 5) {
      ZStack {
        Circle().fill(KeegoTheme.glassFill)
        Circle().strokeBorder(KeegoTheme.hairline, lineWidth: 1)
        Image(systemName: icon)
          .font(.system(size: 22, weight: .bold))
          .foregroundStyle(iconColor)
      }
      .frame(width: 64, height: 64)
      Text(showHint ? "길게 눌러 \(label)" : label)
        .font(.system(size: showHint ? 11 : 12, weight: .medium))
        .foregroundStyle(showHint ? KeegoTheme.t1 : KeegoTheme.t2)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }

    if holdToActivate {
      content
        .onTapGesture {
          withAnimation(.easeOut(duration: 0.15)) { showHint = true }
          DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation(.easeIn(duration: 0.2)) { showHint = false }
          }
        }
        .onLongPressGesture(minimumDuration: 0.6) { action() }
        .accessibilityLabel("길게 눌러 \(label)")
    } else {
      Button(action: action) { content }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
  }
}
