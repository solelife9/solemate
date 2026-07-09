// StartView.swift — 시작 화면(shoe-first): 신발 스와이프 + 파파야 링 '러닝 시작'
// ----------------------------------------------------------------------------
// 홈(폰)처럼 활성 신발 전체를 좌우 스와이프로 넘긴다(가로 페이지 + 도트, 사용자 확정
// 2026-07-10). 현재 페이지의 신발이 러닝 시작 대상이고, 마지막 선택은 WatchLink 가
// 기억해 다음 실행 시 그 페이지에서 시작한다. 목록이 비면(첫 실행·미동기화) '폰에서
// 동기화 대기' 폴백 — 단독 실행 원칙에 따라 신발 없이도 달릴 수 있다.
// 파파야는 시작 링(러닝 도메인 진입점)에만 — 무채 베이스 유지.
import SwiftUI

struct StartView: View {
  @EnvironmentObject var workout: WorkoutManager
  @ObservedObject private var link = WatchLink.shared
  /// 현재 페이지의 신발 id. ""(빈) = 목록 없음 폴백 페이지.
  @State private var selection: String = ""

  var body: some View {
    VStack(spacing: 4) {
      // 브랜드 워드마크 — 폰과 동일(Helvetica Neue Medium 소문자 keego, 흰색).
      Text("keego")
        .font(.custom("HelveticaNeue-Medium", size: 14))
        .foregroundStyle(KeegoTheme.t1)

      if link.shoes.isEmpty {
        emptyShoeCard
      } else {
        TabView(selection: $selection) {
          ForEach(link.shoes) { shoe in
            ShoeCard(shoe: shoe).tag(shoe.id)
          }
        }
        .tabViewStyle(.page)
        .frame(height: 96)
      }

      Spacer(minLength: 2)

      // 러닝 시작 — 파파야 링(폰 러닝 링과 같은 그라데이션 스톱). 채움이 아니라
      // 스트로크 링이라 '넓은 면 금지' 가드레일을 지킨다.
      Button {
        workout.start(shoe: link.selectedShoe)
      } label: {
        ZStack {
          Circle()
            .stroke(KeegoTheme.brandGradient, lineWidth: 5)
          Text("시작")
            .font(.system(size: 17, weight: .heavy))
            .foregroundStyle(KeegoTheme.t1)
        }
        .frame(width: 68, height: 68)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("러닝 시작")
    }
    .padding(.horizontal, 4)
    .onAppear {
      // 권한(HealthKit·위치) 선요청 — 시작 탭에서 다이얼로그로 막히지 않게.
      workout.requestPermissions()
      // 마지막 선택 신발 페이지에서 시작(목록 밖이면 첫 신발).
      selection = link.selectedShoe?.id ?? ""
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

  /// 동기화 전 폴백 — 신발 없이도 달릴 수 있음을 함께 알린다(단독 실행).
  private var emptyShoeCard: some View {
    VStack(spacing: 4) {
      Image(systemName: "shoe.2")
        .font(.system(size: 18))
        .foregroundStyle(KeegoTheme.t3)
      Text("폰에서 동기화 대기")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(KeegoTheme.t2)
      Text("신발 없이 달려도 기록돼요")
        .font(.system(size: 11))
        .foregroundStyle(KeegoTheme.t3)
    }
    .frame(maxWidth: .infinity)
    .frame(height: 88)
    .background(KeegoTheme.glassFill)
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).stroke(KeegoTheme.cardBorder, lineWidth: 1))
  }
}

/// 신발 카드 한 페이지 — 브랜드(T3 캡션) / 모델(흰 세미볼드) / 남은 수명(컨디션 도트).
private struct ShoeCard: View {
  let shoe: WatchShoe

  var body: some View {
    VStack(spacing: 3) {
      if !shoe.brand.isEmpty {
        Text(shoe.brand.uppercased())
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(KeegoTheme.t3)
          .lineLimit(1)
      }
      Text(shoe.model.isEmpty ? shoe.displayName : shoe.model)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(KeegoTheme.t1)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      HStack(spacing: 4) {
        Circle()
          .fill(KeegoTheme.conditionColor(shoe.condition))
          .frame(width: 6, height: 6)
        Text("남은 수명 \(shoe.lifePct)%")
          .font(.system(size: 11, weight: .medium))
          .monospacedDigit()
          .foregroundStyle(KeegoTheme.t2)
      }
      // 수명 게이지 — 무채(흰 채움/헤어라인 트랙). 색은 도트(의미)에만.
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(Color.white.opacity(0.07))
          Capsule()
            .fill(KeegoTheme.t1)
            .frame(width: geo.size.width * CGFloat(shoe.lifePct) / 100.0)
        }
      }
      .frame(height: 3)
      .padding(.horizontal, 10)
      .padding(.top, 2)
    }
    .padding(.vertical, 8)
    .padding(.horizontal, 6)
    .frame(maxWidth: .infinity)
    .background(KeegoTheme.glassFill)
    .clipShape(RoundedRectangle(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).stroke(KeegoTheme.cardBorder, lineWidth: 1))
    // 페이지 도트와 카드가 겹치지 않게 아래 여백.
    .padding(.bottom, 14)
  }
}
