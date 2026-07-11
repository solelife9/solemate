// StartView.swift — 시작 화면(shoe-first): 폰 홈 히어로 문법의 '한 카드' 워치 축소판
// ----------------------------------------------------------------------------
// 페이지 하나 = 신발 하나의 카드 전체(사용자 확정 2026-07-11): 상단 브랜드(대문자
// 트래킹)+모델명(굵게) 중앙 → 얇은 수명 링(트랙=컨디션색 16% 틴트, 아크=컨디션색,
// 라운드 캡 — 폰 링 문법 미러) 중앙에 '남은 수명 %' → '남은 km' 한 줄 → 맨 아래
// '러닝 시작' 버튼(유리 표면 + 파파야 포인트). 요소 다이어트(07-11 '조잡' 피드백):
// keego 각인·사용/남음 삼중 표기 제거 — 카드당 메시지 하나씩만.
// 좌우 스와이프(가로 페이지+도트) 유지,
// 마지막 선택은 WatchLink 가 기억한다. 목록이 비면 안내 두 줄뿐 — 러닝 시작은
// 신발 페이지에서만 한다(2026-07-11 사용자 확정: '신발 없이 시작' 폴백 제거.
// 폰 앱을 먼저 설치하는 흐름이라 shoe-first 를 워치에서도 그대로 지킨다).
// 파파야는 시작 요소(플레이 글리프)에만 — 무채 베이스 유지.
import SwiftUI

struct StartView: View {
  @EnvironmentObject var workout: WorkoutManager
  @ObservedObject private var link = WatchLink.shared
  /// 현재 페이지의 신발 id. 첫 페이지 tag 로 초기화한다 — watchOS .page TabView 를
  /// 비-첫 페이지 selection 으로 '생성'하면 첫 레이아웃이 깨진다(과대 렌더+오프셋,
  /// 시뮬 실측 2026-07-11). 마지막 선택 복원은 마운트 뒤 onAppear 에서 이동시킨다.
  @State private var selection: String = WatchLink.shared.shoes.first?.id ?? ""

  var body: some View {
    // 워드마크 없음 — 작은 화면은 전부 카드에(2026-07-11 요소 다이어트로 keego
    // 각인도 제거, 브랜딩은 대기 화면 카피와 앱 자체로).
    Group {
      if link.shoes.isEmpty {
        WaitingPage()
      } else {
        TabView(selection: $selection) {
          ForEach(link.shoes) { shoe in
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
      // 마지막 선택 페이지 복원 — 마운트가 끝난 뒤 이동(짧은 시스템 슬라이드).
      // 생성 시점 selection 으로 바로 열면 레이아웃이 깨져서(위 주석) 이 경로만 쓴다.
      let restore = link.selectedShoe?.id ?? ""
      if !restore.isEmpty, restore != selection {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { selection = restore }
      }
    }
    .onChange(of: selection) { _, newValue in
      if !newValue.isEmpty { link.selectedShoeId = newValue }
    }
    .onChange(of: link.shoes) { _, newShoes in
      // 동기화로 목록이 갱신됐는데 현재 페이지 신발이 사라졌으면 폴백 페이지로.
      if !newShoes.contains(where: { $0.id == selection }) {
        selection = link.selectedShoe?.id ?? ""
      }
    }
  }
}

/// 신발 한 켤레 = 페이지 전체가 그 신발의 히어로 카드 + 시작(폰 홈 위계 그대로 축소).
/// 카드 재질 = 콰이어트 글라스(면 + 1pt 헤어라인 — 폰 GlassEdge 미러, 과효과 금지).
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
      // 링 지름 = 화면폭 ~56%(사용자 확정 55~60%). 짧은 화면(40mm)은 높이로 클램프.
      let ringD = min(geo.size.width * 0.56, geo.size.height * 0.44)

      VStack(spacing: 0) {
        // 상단: 브랜드(대문자 트래킹) + 모델명(굵게) 중앙 — 요소 다이어트(2026-07-11
        // '조잡' 피드백): keego 각인 제거, 카드가 말하는 건 신발 하나뿐.
        if !shoe.brand.isEmpty {
          Text(shoe.brand.uppercased())
            .font(.system(size: 10, weight: .medium))
            .kerning(1.1)
            .foregroundStyle(KeegoTheme.t3)
            .lineLimit(1)
        }
        Text(shoe.model.isEmpty ? shoe.displayName : shoe.model)
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(KeegoTheme.t1)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          .padding(.top, 1)

        Spacer(minLength: 4)

        LifeRing(
          pct: shoe.lifePct,
          color: KeegoTheme.conditionColor(shoe.condition),
          diameter: ringD,
          progress: sweep ? Double(shoe.lifePct) / 100.0 : 0
        )

        Spacer(minLength: 4)

        // 한 줄 하나만 — '남은 km'(행동에 필요한 숫자). 링 %·사용량과 삼중 중복이던
        // 사용/남음 줄은 다이어트(2026-07-11 — 디테일은 폰에서). 구버전 폰이면 생략.
        if shoe.maxKm > 0 {
          Group {
            if shoe.remainKm > 0 {
              Text("\(shoe.remainKm)km 남음")
                .foregroundStyle(KeegoTheme.t2)
            } else {
              // 수명 초과 — 상태만 컨디션색으로(색은 의미에만).
              Text("수명 초과")
                .foregroundStyle(KeegoTheme.conditionColor(shoe.condition))
            }
          }
          .font(.system(size: 11, weight: .medium))
          .monospacedDigit()
          .lineLimit(1)
          .padding(.bottom, 6)
        }

        StartButton(label: "러닝 시작", action: onStart)
      }
      .padding(.horizontal, 8)
      .padding(.vertical, 9)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      // 콰이어트 글라스 카드 — 면(흰 8%) + 1pt 헤어라인(흰 20%), 라운드 코너만.
      .background(KeegoTheme.glassFill)
      .clipShape(RoundedRectangle(cornerRadius: 14))
      .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(KeegoTheme.hairline, lineWidth: 1))
      // 페이지 도트와 겹치지 않게 카드 아래 여백.
      .padding(.bottom, 12)
      // 중앙 강조: 이웃 카드는 살짝 축소 + 딤(폰 캐러셀 0.93/0.5 감각의 워치판).
      .scaleEffect(1 - 0.07 * progress)
      .opacity(1 - 0.45 * progress)
    }
    .onAppear {
      sweep = false
      withAnimation(.easeOut(duration: 0.9)) { sweep = true }
    }
  }
}

/// 얇은 수명 링 — 폰 히어로 링 문법 미러: 트랙 = 컨디션색 16% 틴트, 아크 = 컨디션색,
/// 라운드 캡, -90° 시작. 중앙 '남은 수명' 라벨 + % 숫자(tabular).
private struct LifeRing: View {
  let pct: Int
  let color: Color
  let diameter: CGFloat
  let progress: Double

  var body: some View {
    ZStack {
      Circle()
        .stroke(color.opacity(0.16), style: StrokeStyle(lineWidth: 4.5, lineCap: .round))
      Circle()
        .trim(from: 0, to: CGFloat(max(0, min(1, progress))))
        .stroke(color, style: StrokeStyle(lineWidth: 4.5, lineCap: .round))
        .rotationEffect(.degrees(-90))
      VStack(spacing: 0) {
        Text("남은 수명")
          .font(.system(size: 9, weight: .medium))
          .foregroundStyle(KeegoTheme.t3)
        HStack(alignment: .firstTextBaseline, spacing: 1) {
          Text("\(pct)")
            .font(.system(size: 26, weight: .heavy))
            .monospacedDigit()
            .foregroundStyle(KeegoTheme.t1)
          Text("%")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(KeegoTheme.t3)
        }
      }
    }
    .padding(2.5) // 라운드 캡 스트로크가 프레임 밖으로 잘리지 않게.
    .frame(width: diameter, height: diameter)
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
      Text("신발을 가져와 바로 달릴 수 있어요")
        .font(.system(size: 10))
        .foregroundStyle(KeegoTheme.t3)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 14)
    .padding(.horizontal, 6)
    // 콰이어트 글라스 — 신발 카드와 같은 재질(면 + 1pt 헤어라인).
    .background(KeegoTheme.glassFill)
    .clipShape(RoundedRectangle(cornerRadius: 14))
    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(KeegoTheme.hairline, lineWidth: 1))
    .padding(.horizontal, 2)
    .frame(maxHeight: .infinity)
  }
}
