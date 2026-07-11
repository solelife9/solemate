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
        TabView(selection: $selection) {
          ForEach(pages) { shoe in
            ShoeStartPage(shoe: shoe) { workout.start(shoe: shoe) }
              .tag(shoe.id)
          }
        }
        .tabViewStyle(.page)
      }
    }
    .padding(.horizontal, 2)
    .onAppear {
      // 권한(HealthKit·위치) 선요청 — 시작 탭에서 다이얼로그로 막히지 않게.
      workout.requestPermissions()
    }
    .onChange(of: selection) { _, newValue in
      if !newValue.isEmpty { link.selectedShoeId = newValue }
    }
    .onChange(of: link.shoes) { _, newShoes in
      // 동기화로 목록 갱신 — 재정렬은 이때만(스와이프 중 순서가 바뀌지 않게).
      pages = Self.ordered(newShoes, selectedId: link.selectedShoeId)
      if !pages.contains(where: { $0.id == selection }) {
        selection = pages.first?.id ?? ""
      }
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

      // 풀블리드 히어로(2026-07-11 재설계 — 상자 제거): 작은 화면에 카드 상자를
      // 또 그리지 않는다(Apple 워치 주 화면 관용 — 화면이 곧 카드). 순수 블랙 위
      // 이름 → % 히어로 → 수명 게이지 바(컨디션색, 연료계 은유) → 남은 km → 시작.
      // 색은 게이지 바 한 곳에만 — 스와이프하며 바 색으로 신발 상태를 훑는다.
      VStack(spacing: 0) {
        if !shoe.brand.isEmpty {
          Text(shoe.brand.uppercased())
            .font(.system(size: 10, weight: .medium))
            .kerning(1.1)
            .foregroundStyle(KeegoTheme.t3)
            .lineLimit(1)
        }
        Text(shoe.model.isEmpty ? shoe.displayName : shoe.model)
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(KeegoTheme.t1)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          .padding(.top, 1)

        Spacer(minLength: 6)

        // % 히어로 — 이 화면의 단 하나의 큰 숫자(수명 = keego 의 차별점).
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text("\(shoe.lifePct)")
            .font(.system(size: 54, weight: .heavy))
            .monospacedDigit()
            .foregroundStyle(KeegoTheme.t1)
          Text("%")
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(KeegoTheme.t3)
        }
        // 수명 게이지 — 얇은 바(트랙 흰 10% / 채움 컨디션색). 0 → 현재%로 차오른다.
        LifeBar(
          pct: shoe.lifePct,
          color: KeegoTheme.conditionColor(shoe.condition),
          progress: sweep ? Double(shoe.lifePct) / 100.0 : 0
        )
        .frame(width: geo.size.width * 0.52, height: 3)
        .padding(.top, 7)
        if shoe.maxKm > 0 {
          Text(shoe.remainKm > 0 ? "\(shoe.remainKm)km 남음" : "수명 초과")
            .font(.system(size: 11, weight: .medium))
            .monospacedDigit()
            .foregroundStyle(shoe.remainKm > 0 ? KeegoTheme.t3 : KeegoTheme.conditionColor(shoe.condition))
            .padding(.top, 6)
        }

        Spacer(minLength: 6)

        StartButton(label: "러닝 시작", action: onStart)
      }
      .padding(.horizontal, 10)
      // 페이지 도트와 겹치지 않게 아래 여백.
      .padding(.bottom, 14)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
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

/// '러닝 시작' — 유리 표면 캡슐 + 파파야 포인트(플레이 글리프에만, 넓은 면 금지).
private struct StartButton: View {
  let label: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 5) {
        Image(systemName: "play.fill")
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(KeegoTheme.brand)
        Text(label)
          .font(.system(size: 14, weight: .bold))
          .foregroundStyle(KeegoTheme.t1)
      }
      .frame(maxWidth: .infinity)
      .frame(height: 36)
      // 콰이어트 글라스 — 카드와 같은 재질(폰 runBtn 의 GlassEdge 림 미러).
      .background(KeegoTheme.glassFill)
      .clipShape(Capsule())
      .overlay(Capsule().strokeBorder(KeegoTheme.hairline, lineWidth: 1))
    }
    .buttonStyle(.plain)
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
