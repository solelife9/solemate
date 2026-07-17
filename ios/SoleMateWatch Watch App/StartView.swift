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
        // 스와이프 힌트 — 2켤레+ & 미발견 사용자에게만, 도트 바로 위 한 줄. 첫 스와이프에 영구 소등.
        .overlay(alignment: .bottom) {
          if pages.count > 1 && !didSwipeShoePages {
            HStack(spacing: 3) {
              Image(systemName: "chevron.left")
              Text("밀어서 다른 신발")
              Image(systemName: "chevron.right")
            }
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(KeegoTheme.t3)
            .padding(.bottom, 14)
            .allowsHitTesting(false)
            .transition(.opacity)
          }
        }
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
      // 링 크기 — 폭 0.62 를 기본으로 하되 화면 '높이'로도 상한을 둔다. 작은 워치(짧은
      // 세로)에서 링이 너무 커 링+지표+버튼이 넘쳐 '러닝 시작'이 페이지 도트 라인에 걸리던
      // 문제 해결(실기기 피드백). 세로 여유가 있는 워치는 0.62 그대로.
      let ringSize = min(geo.size.width * 0.62, geo.size.height * 0.44)

      // 풀블리드 히어로 v2(사용자 확정 2026-07-11): 링 안 = 브랜드+러닝화명(메인 —
      // shoe-first, "어떤 신발로 달리나"가 이 화면의 본질), 링 아크 = 수명 %(컨디션색,
      // 0→현재% 스윕), 링 아래 좌우 = 수명 % · 남은 km, 맨 아래 = 러닝 시작.
      // 상자 없음(Apple 워치 주 화면 관용), 색은 링 아크에만.
      VStack(spacing: 0) {
        NameRing(
          brand: shoe.brand,
          model: shoe.model.isEmpty ? shoe.displayName : shoe.model,
          // 폰 홈 히어로와 동일한 4단계 마모색(최상 파랑…교체권장 빨강).
          color: KeegoTheme.wearColor(lifePct: shoe.lifePct),
          progress: sweep ? Double(shoe.lifePct) / 100.0 : 0
        )
        .frame(width: ringSize, height: ringSize)

        // 링 아래 좌우 지표 — 왼쪽 수명 %, 오른쪽 남은 km(같은 위계, tabular).
        HStack {
          Text("\(shoe.lifePct)%")
            .foregroundStyle(KeegoTheme.t1)
          Spacer(minLength: 8)
          if shoe.maxKm > 0 {
            Text(shoe.remainKm > 0 ? "\(shoe.remainKm)km 남음" : "수명 초과")
              .foregroundStyle(shoe.remainKm > 0 ? KeegoTheme.t1 : KeegoTheme.wearColor(lifePct: shoe.lifePct))
          }
        }
        .font(.system(size: 15, weight: .semibold))
        .monospacedDigit()
        .lineLimit(1)
        .padding(.horizontal, 14)
        .padding(.top, 8)

        StartButton(label: "러닝 시작", action: onStart)
          .padding(.top, 9)

        // 남는 공간은 전부 아래로 — 버튼이 페이지 도트와 겹치지 않게 최소 20pt 확보.
        Spacer(minLength: 20)
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

/// 이름 링 — 수명 아크(트랙 컨디션색 16% 틴트 / 아크 컨디션색·라운드 캡·-90° 시작)
/// 안에 브랜드(대문자 트래킹)+러닝화명(굵게, 메인). 폰 히어로 링 문법의 워치판.
private struct NameRing: View {
  let brand: String
  let model: String
  let color: Color
  let progress: Double

  var body: some View {
    ZStack {
      Circle()
        .stroke(color.opacity(0.16), style: StrokeStyle(lineWidth: 5, lineCap: .round))
      Circle()
        .trim(from: 0, to: CGFloat(max(0, min(1, progress))))
        .stroke(color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
        .rotationEffect(.degrees(-90))
      VStack(spacing: 1) {
        if !brand.isEmpty {
          Text(brand.uppercased())
            .font(.system(size: 11, weight: .medium))
            .kerning(1.1)
            .foregroundStyle(KeegoTheme.t3)
            .lineLimit(1)
            .minimumScaleFactor(0.6) // '뉴발란스' 등 긴 브랜드 — 0.8 론 잘렸다(실기기 2026-07-17)
        }
        Text(model)
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(KeegoTheme.t1)
          .multilineTextAlignment(.center)
          .lineLimit(2)
          .minimumScaleFactor(0.45) // 긴 모델명(1080 v13 등) 2줄 축소 한도 완화
      }
      .padding(.horizontal, 11) // 링 안쪽 여백 — 16 은 긴 이름의 가용 폭을 너무 깎았다
    }
    .padding(3) // 라운드 캡 스트로크가 프레임 밖으로 잘리지 않게.
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(brand) \(model)")
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
