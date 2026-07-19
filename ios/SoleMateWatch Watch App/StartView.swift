// StartView.swift — 시작 화면(shoe-first): 풀블리드 히어로(2026-07-11 최종 재설계)
// ----------------------------------------------------------------------------
// 페이지 하나 = 신발 하나, 상자 없음 — 작은 화면에 카드 상자를 또 그리지 않는다
// (Apple 워치 주 화면 관용: 화면이 곧 카드. '조잡' 피드백의 뿌리였던 프레임 중첩
// 제거). 블랙 위: 브랜드(대문자 트래킹)+모델명 중앙 → % 히어로(초대형 타이포) →
// 수명 게이지 바(컨디션색 — 이 화면에서 색이 있는 유일한 상시 요소, 연료계 은유)
// → '남은 km' 캡션 → '러닝 시작' 유리 캡슐(파파야 플레이 글리프에만).
// 좌우 스와이프(가로 페이지+도트) 유지, 마지막 선택은 WatchLink 가 기억한다.
// 목록이 비면 안내 두 줄뿐 — 러닝 시작은 신발 페이지에서만 한다(2026-07-11 사용자
// 확정: '신발 없이 시작' 폴백 제거. 폰 앱을 먼저 설치하는 흐름이라 shoe-first 를
// 워치에서도 그대로 지킨다). 파파야는 시작 요소에만 — 무채 베이스 유지.
import SwiftUI

struct StartView: View {
  @EnvironmentObject var workout: WorkoutManager
  @ObservedObject private var link = WatchLink.shared
  /// 스와이프 발견성(2026-07-17 사용자 지적 "좌우로 넘기는 걸 어떻게 알지"):
  /// 신발이 2켤레 이상인데 아직 한 번도 스와이프한 적 없으면 하단에 힌트 한 줄.
  /// 처음 페이지를 넘기는 순간 영구 소등(클러터 0) — 도트는 시스템 것 그대로.
  @AppStorage("didSwipeShoePages") private var didSwipeShoePages = false
  /// 세로 페이지: 0 = 신발 히어로(기본) · 1 = 목표 패널(아래로 스와이프).
  @State private var vPage = 0
  /// 목표 패널 발견 힌트 — 한 번도 아래로 안 내렸으면 "↓ 목표" 한 줄. 첫 스와이프에 소등.
  @AppStorage("didSwipeGoalPanel") private var didSwipeGoalPanel = false
  /// 표시 페이지 배열 — 마지막 선택 신발을 맨 앞으로 회전(나머지는 폰 순서 유지).
  /// watchOS .page TabView 는 비-첫 selection 생성도, 마운트 후 프로그램 이동
  /// (단순 대입·withAnimation 모두)도 무시한다(시뮬 실측 2026-07-11) — 페이지를
  /// 옮기는 대신 순서를 바꿔 '첫 페이지 = 마지막 선택'으로 만든다. 실행 직후
  /// 슬라이드 모션도 없어 체감이 더 즉각적이다. 스와이프 중 재정렬을 막기 위해
  /// selection 변화로는 재계산하지 않는다(@State 고정, 목록 갱신 시에만 갱신).
  @State private var pages: [WatchShoe] = StartView.ordered(
    WatchLink.shared.shoes, selectedId: WatchLink.shared.selectedShoeId)
  /// 현재 페이지의 신발 id — 첫 페이지(= 마지막 선택)로 초기화.
  @State private var selection: String = StartView.ordered(
    WatchLink.shared.shoes, selectedId: WatchLink.shared.selectedShoeId).first?.id ?? ""

  private static func ordered(_ shoes: [WatchShoe], selectedId: String?) -> [WatchShoe] {
    guard let id = selectedId, let idx = shoes.firstIndex(where: { $0.id == id }), idx > 0
    else { return shoes }
    var arr = shoes
    let sel = arr.remove(at: idx)
    arr.insert(sel, at: 0)
    return arr
  }

  var body: some View {
    // 워드마크 없음 — 작은 화면은 전부 콘텐츠에(2026-07-11 요소 다이어트로 keego
    // 각인도 제거, 브랜딩은 대기 화면 카피와 앱 자체로).
    Group {
      if pages.isEmpty {
        WaitingPage()
      } else {
        // 세로 축(RunView 축 분리 문법): 위=신발 히어로(가로=신발 스와이프), 아래=목표 패널.
        // 신발 화면에서 바로 시작 = 자유런. 목표는 아래로 스와이프해야만 나온다(시작 화면 불변).
        TabView(selection: $vPage) {
          shoeCarousel.tag(0)
          GoalPanel { goal in
            if let shoe = selectedShoe { workout.start(shoe: shoe, goal: goal) }
          }
          .tag(1)
        }
        .tabViewStyle(.verticalPage)
      }
    }
    .padding(.horizontal, 2)
    .onAppear {
      // 권한(HealthKit·위치) 선요청 — 시작 탭에서 다이얼로그로 막히지 않게.
      workout.requestPermissions()
    }
    .onChange(of: selection) { _, newValue in
      if !newValue.isEmpty { link.selectedShoeId = newValue }
      // 페이지를 실제로 넘겼다 = 스와이프 발견 완료 → 힌트 영구 소등.
      if !didSwipeShoePages { withAnimation { didSwipeShoePages = true } }
    }
    .onChange(of: vPage) { _, p in
      // 아래로 내려 목표 패널을 봤다 = 발견 완료 → 힌트 영구 소등.
      if p == 1 && !didSwipeGoalPanel { withAnimation { didSwipeGoalPanel = true } }
    }
    .onChange(of: link.shoes) { _, newShoes in
      // 동기화로 목록 갱신 — 재정렬은 이때만(스와이프 중 순서가 바뀌지 않게).
      pages = Self.ordered(newShoes, selectedId: link.selectedShoeId)
      if !pages.contains(where: { $0.id == selection }) {
        selection = pages.first?.id ?? ""
      }
    }
  }

  /// 현재 선택된 신발(목표 패널 시작 시 귀속). selection 매칭 실패면 첫 신발 폴백.
  private var selectedShoe: WatchShoe? {
    pages.first { $0.id == selection } ?? pages.first
  }

  /// 신발 히어로 캐러셀(가로 스와이프) — 세로 위 페이지. 하단 힌트 두 줄(신발/목표).
  private var shoeCarousel: some View {
    TabView(selection: $selection) {
      ForEach(pages) { shoe in
        ShoeStartPage(shoe: shoe) { workout.start(shoe: shoe) }
          .tag(shoe.id)
      }
    }
    .tabViewStyle(.page)
    // 발견 힌트 — 도트 위 한두 줄. 각자 첫 스와이프에 영구 소등(클러터 0).
    .overlay(alignment: .bottom) {
      VStack(spacing: 3) {
        if pages.count > 1 && !didSwipeShoePages {
          HStack(spacing: 3) {
            Image(systemName: "chevron.left")
            Text("밀어서 다른 신발")
            Image(systemName: "chevron.right")
          }
        }
        if !didSwipeGoalPanel {
          HStack(spacing: 2) {
            Image(systemName: "chevron.down")
            Text("밀어서 목표")
          }
        }
      }
      .font(.system(size: 10, weight: .medium))
      .foregroundStyle(KeegoTheme.t3)
      .padding(.bottom, 12)
      .allowsHitTesting(false)
      .transition(.opacity)
    }
  }
}

/// 신발 한 켤레 = 페이지 전체가 그 신발의 풀블리드 히어로 + 시작(폰 홈 위계의 워치판).
/// 스와이프 = 페이지 오프셋 기반 스케일·딤(이웃 ~0.93 + 흐림)으로 폰 캐러셀의
/// 중앙 강조 감각을 미러한다(사용자 확정 2026-07-11).
private struct ShoeStartPage: View {
  let shoe: WatchShoe
  let onStart: () -> Void
  /// 링 스윕 — 폰 히어로처럼 0 → 현재%로 차오른다(정적 게이지에 물리감).
  @State private var sweep = false

  var body: some View {
    GeometryReader { geo in
      // 페이지 오프셋(중앙=0, 이웃=±폭) → 진행도 0~1. 중앙 강조 스케일/딤의 입력.
      let minX = geo.frame(in: .global).minX
      let progress = min(1, abs(minX) / max(1, geo.size.width))
      // 히어로 v3(2026-07-17, 실기기 왕복 확정 방향): **이름은 링 밖 상단 풀폭**,
      // 링 안은 수명 % 히어로(폰 홈 링 문법). v2(링 안 이름)는 구조적 한계였다 —
      // 이름이 원의 내접 폭에 갇혀 긴 모델명(브룩스 칼데라 8 등)이 늘 잘리거나 뭉갰고,
      // 버튼 안 잘리게 링을 줄이면 이름이 더 못 읽혔다. 이름을 빼면 링은 %만 담아
      // 작아져도 또렷하다.
      // v3.1(2026-07-18 목업 확정): 남은 km 를 링 안 캡션으로 승격(폰 홈 링의 값+캡션
      // 문법 완성). 빠진 한 줄만큼 링이 자연 확대되되, 버튼과 붙지 않게 폭 0.55 캡 유지
      // + 버튼 상단 여백을 예산에 포함. 링 크기 = 높이 − (이름 34 + 버튼 47 + 도트 14 + 여백 10).
      let belowAndAbove: CGFloat = 34 + 47 + 14 + 10
      let ringSize = max(56, min(geo.size.width * 0.55, geo.size.height - belowAndAbove))

      VStack(spacing: 0) {
        // 이름 — 풀폭 두 줄(브랜드 캡스 + 모델명). 원 밖이라 잘림 걱정 없이 1줄 자동축소.
        VStack(spacing: 0) {
          if !shoe.brand.isEmpty {
            Text(shoe.brand.uppercased())
              .font(.system(size: 11, weight: .medium))
              .kerning(1.1)
              .foregroundStyle(KeegoTheme.t3)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
          Text(shoe.model.isEmpty ? shoe.displayName : shoe.model)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(KeegoTheme.t1)
            .lineLimit(1)
            .minimumScaleFactor(0.55)
        }
        .padding(.horizontal, 8)
        .frame(height: 34)

        PctRing(
          pct: shoe.lifePct,
          // 폰 홈 히어로와 동일한 4단계 마모색(최상 파랑…교체권장 빨강).
          color: KeegoTheme.wearColor(lifePct: shoe.lifePct),
          progress: sweep ? Double(shoe.lifePct) / 100.0 : 0,
          // 남은 km — 링 안 캡션(v3.1). maxKm 미수신(구버전 폰 캐시)이면 % 단독.
          remainText: shoe.maxKm > 0 ? (shoe.remainKm > 0 ? "\(shoe.remainKm)km 남음" : "수명 초과") : nil,
          remainColor: shoe.remainKm > 0 ? KeegoTheme.t3 : KeegoTheme.wearColor(lifePct: shoe.lifePct)
        )
        .frame(width: ringSize, height: ringSize)
        .padding(.top, 2)

        StartButton(label: "러닝 시작", action: onStart)
          .padding(.top, 10)

        // 버튼이 페이지 도트와 겹치지 않게 최소 여백.
        Spacer(minLength: 12)
      }
      .padding(.horizontal, 10)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      // 중앙 강조: 이웃 페이지는 살짝 축소 + 딤(폰 캐러셀 0.93/0.5 감각의 워치판).
      .scaleEffect(1 - 0.07 * progress)
      .opacity(1 - 0.45 * progress)
    }
    .onAppear {
      sweep = false
      withAnimation(.easeOut(duration: 0.9)) { sweep = true }
    }
  }
}

/// 목표 패널 — 아래로 스와이프하면 나온다(세로 페이지 1). 거리·시간·트랙 세그 + 값 + 시작.
/// '자유'는 없다: 시작 화면에서 바로 시작 = 자유런. 여기서 목표 정하고 시작하면 그 목표로
/// 바로 러닝(신발 화면 복귀·라벨 없음).
/// 값 조절은 ±버튼(크라운 아님) — 세로 페이징 TabView 가 크라운을 페이지 이동에 쓰므로
/// 충돌을 피한다. 세그·버튼은 고정 높이, 값 숫자가 유연 요소 → 작은 워치에서도 '시작' 안 잘림.
private struct GoalPanel: View {
  /// 확정한 목표를 실어 부모(StartView)가 workout.start(shoe:goal:) 를 부른다.
  let onStart: (RunGoal) -> Void

  @State private var kind: RunGoalKind = .distance   // 거리 기본(가장 흔한 러닝)
  @State private var distanceKm: Double = 5.0
  @State private var minutes: Double = 30
  @State private var trackLapM: Double = 400
  private static let trackPresets: [Double] = [200, 300, 400]

  var body: some View {
    VStack(spacing: 5) {
      // 세그먼트 — 거리·시간·트랙(거리 기본). 고정 높이.
      HStack(spacing: 4) {
        seg("거리", .distance)
        seg("시간", .time)
        seg("트랙", .track)
      }
      Spacer(minLength: 2)
      valueArea            // 유연 — 작은 워치에서 먼저 축소
      Spacer(minLength: 2)
      StartButton(label: "시작") {
        onStart(RunGoal(kind: kind, distanceKm: distanceKm, minutes: minutes, trackLapM: trackLapM))
      }
    }
    .padding(.horizontal, 6)
    .padding(.vertical, 4)
  }

  @ViewBuilder private var valueArea: some View {
    switch kind {
    case .distance:
      stepper(value: String(format: "%.1f", distanceKm), unit: "km",
              dec: { distanceKm = max(0.5, distanceKm - 0.5) },
              inc: { distanceKm = min(60, distanceKm + 0.5) })
    case .time:
      stepper(value: String(Int(minutes)), unit: "분",
              dec: { minutes = max(5, minutes - 5) },
              inc: { minutes = min(300, minutes + 5) })
    case .track:
      trackChooser
    case .free:
      EmptyView()
    }
  }

  // ± 스테퍼 — 값(대형 유연) 양옆 원형 버튼.
  private func stepper(value: String, unit: String,
                       dec: @escaping () -> Void, inc: @escaping () -> Void) -> some View {
    HStack(spacing: 6) {
      roundStep("minus", dec)
      VStack(spacing: 0) {
        Text(value)
          .font(.system(size: 34, weight: .heavy))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.t1)
          .lineLimit(1)
          .minimumScaleFactor(0.5)
        Text(unit)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(KeegoTheme.t3)
      }
      .frame(maxWidth: .infinity)
      roundStep("plus", inc)
    }
  }

  private func roundStep(_ icon: String, _ action: @escaping () -> Void) -> some View {
    Button(action: action) {
      ZStack {
        Circle().fill(KeegoTheme.glassFill)
        Circle().strokeBorder(KeegoTheme.hairline, lineWidth: 1)
        Image(systemName: icon)
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(KeegoTheme.t1)
      }
      .frame(width: 34, height: 34)
    }
    .buttonStyle(.plain)
  }

  // 트랙 랩거리 — 200·300·400 프리셋(첫 바퀴 GPS 보정).
  private var trackChooser: some View {
    VStack(spacing: 6) {
      HStack(spacing: 5) {
        ForEach(Self.trackPresets, id: \.self) { m in
          let on = Int(trackLapM) == Int(m)
          Button { trackLapM = m } label: {
            Text(String(Int(m)))
              .font(.system(size: 13, weight: on ? .heavy : .semibold))
              .foregroundStyle(on ? Color.black : KeegoTheme.t2)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 6)
              .background(on ? KeegoTheme.brand : KeegoTheme.glassFill)
              .clipShape(RoundedRectangle(cornerRadius: 8))
          }
          .buttonStyle(.plain)
        }
      }
      Text("m · 첫 바퀴 GPS 자동 보정")
        .font(.system(size: 9, weight: .medium))
        .foregroundStyle(KeegoTheme.t4)
    }
  }

  private func seg(_ label: String, _ k: RunGoalKind) -> some View {
    let on = kind == k
    return Button { kind = k } label: {
      Text(label)
        .font(.system(size: 12, weight: on ? .heavy : .medium))
        .foregroundStyle(on ? Color.black : KeegoTheme.t3)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .background(on ? KeegoTheme.brand : KeegoTheme.glassFill)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
  }
}

/// % 링 — 수명 아크(트랙 컨디션색 16% 틴트 / 아크 컨디션색·라운드 캡·-90° 시작) 안에
/// 수명 % 히어로 + 남은 km 캡션(v3.1 — 폰 홈 링의 값+캡션 문법). 이름은 링 밖 상단
/// (v3, 2026-07-17 — 링 안 이름은 원 내접 폭 한계로 긴 모델명이 항상 잘리거나 뭉갰다).
private struct PctRing: View {
  let pct: Int
  let color: Color
  let progress: Double
  /// 링 안 보조 캡션(남은 km/수명 초과). nil 이면 % 단독(구버전 폰 캐시).
  let remainText: String?
  let remainColor: Color

  var body: some View {
    // 링 안 글씨를 지름에 비례시킨다(2026-07-19): 폰트 고정이면 작은 워치(40mm)에서 링이
    // 줄 때 캡션이 minimumScaleFactor 로만 눌려 빡빡했다. 지름 비례 → 어느 워치든 같은 비율.
    GeometryReader { g in
      let d = min(g.size.width, g.size.height)
      ZStack {
        Circle()
          .stroke(color.opacity(0.16), style: StrokeStyle(lineWidth: 5, lineCap: .round))
        Circle()
          .trim(from: 0, to: CGFloat(max(0, min(1, progress))))
          .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
          .rotationEffect(.degrees(-90))
        VStack(spacing: 0) {
          HStack(alignment: .firstTextBaseline, spacing: 1) {
            Text("\(pct)")
              .font(.system(size: d * 0.27, weight: .bold))
              .foregroundStyle(KeegoTheme.t1)
              .monospacedDigit()
            Text("%")
              .font(.system(size: d * 0.15, weight: .semibold))
              .foregroundStyle(KeegoTheme.t3)
          }
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          if let remainText {
            Text(remainText)
              .font(.system(size: d * 0.115, weight: .semibold))
              .foregroundStyle(remainColor)
              .monospacedDigit()
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
        }
        .padding(.horizontal, d * 0.1)
        .frame(width: g.size.width, height: g.size.height)
      }
    }
    .padding(3) // 라운드 캡 스트로크가 프레임 밖으로 잘리지 않게.
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(remainText == nil ? "남은 수명 \(pct)퍼센트" : "남은 수명 \(pct)퍼센트, \(remainText!)")
  }
}

/// 수명 게이지 바 — 연료계 은유의 얇은 캡슐(트랙 흰 10% / 채움 컨디션색·라운드 캡).
/// 색은 의미(컨디션)에만 — 이 화면에서 색이 있는 유일한 상시 요소.
private struct LifeBar: View {
  let pct: Int
  let color: Color
  let progress: Double

  var body: some View {
    GeometryReader { g in
      ZStack(alignment: .leading) {
        Capsule().fill(Color.white.opacity(0.10))
        Capsule()
          .fill(color)
          .frame(width: max(3, g.size.width * CGFloat(max(0, min(1, progress)))))
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("남은 수명 \(pct)퍼센트")
  }
}

/// '러닝 시작' — 유리 캡슐, 텍스트만(2026-07-11 사용자 확정: 플레이 글리프 제거,
/// 전폭 대신 살짝 줄인 너비 — 히어로 아래 조용한 마침표).
private struct StartButton: View {
  let label: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(label)
        .font(.system(size: 16, weight: .bold))
        .foregroundStyle(KeegoTheme.t1)
        .frame(maxWidth: .infinity)
        .frame(height: 38)
        // 콰이어트 글라스 — 카드와 같은 재질(폰 runBtn 의 GlassEdge 림 미러).
        .background(KeegoTheme.glassFill)
        .clipShape(Capsule())
        .overlay(Capsule().strokeBorder(KeegoTheme.hairline, lineWidth: 1))
    }
    .buttonStyle(.plain)
    // 전폭에서 좌우를 조금 들여 히어로보다 좁게 — 시각 위계(숫자 > 버튼).
    .padding(.horizontal, 16)
    .accessibilityLabel(label)
  }
}

/// 동기화 대기 — 신발 글리프(여기가 신발 자리라는 시각 신호) + 행동 한 줄 + 결과
/// 한 줄(2026-07-11 카피 개선: '처음 한 번이면 돼요'(안심) → '신발을 가져와 바로
/// 달릴 수 있어요'(보상) — 이 화면의 질문은 "열면 뭐가 되는데?"다). 시작 버튼 없음
/// (사용자 확정: 워치 러닝은 신발 동기화 후 신발 페이지에서만).
private struct WaitingPage: View {
  var body: some View {
    VStack(spacing: 4) {
      Image(systemName: "shoe.2")
        .font(.system(size: 17, weight: .medium))
        .foregroundStyle(KeegoTheme.t3)
        .padding(.bottom, 2)
      Text("아이폰에서 Keego를 열어주세요")
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(KeegoTheme.t2)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
      // 행동(위) + 이유·안심(아래): 처음 한 번의 동기화만 필요함을 명시(사용자 확정).
      Text("처음 한 번이면 러닝화가 동기화돼요")
        .font(.system(size: 10))
        .foregroundStyle(KeegoTheme.t3)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 10)
    // 풀블리드 — 신발 페이지와 동일하게 상자 없이 블랙 위 콘텐츠만(2026-07-11 재설계).
    .frame(maxHeight: .infinity)
  }
}
