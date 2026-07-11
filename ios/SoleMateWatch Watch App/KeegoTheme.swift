// KeegoTheme.swift — 디자인 정본(.tenet/DESIGN.md · theme.ts)의 watchOS 미러
// ----------------------------------------------------------------------------
// 워치 UI 도 폰과 같은 토큰만 쓴다(화면 하드코딩 0 원칙의 watchOS 판).
// 정본이 바뀌면 이 파일만 따라 바꾼다 — 값의 단일 진실원은 theme.ts.
//
// 색 규칙(2026-07-09 확정):
//   · 무채 베이스: BG #0A0A0A, 강조 = 흰(ACCENT #FFFFFF), 라벨·보조 = T3 #9C9CA3.
//   · 브랜드색은 러닝 도메인 전용 McLaren 파파야 #FF8000(그라데이션 #FFB458→#E56600).
//     가드레일: 넓은 면(버튼 채움·카드 배경) 금지, 한 시야에 파파야 포인트는 소수만.
//   · 색은 의미에만: 컨디션 GOOD/WARN/DANGER, 심박존 Z1–Z5(theme.ts HR_ZONE_COLORS).
//
// 타이포 규칙: 폰은 Pretendard 단일 패밀리지만 watchOS 번들에는 Pretendard 가 없어
// 시스템 SF 를 쓴다(애플 워치 1급 관용). 문법은 미러링 — 대형 숫자 = 800급(heavy) +
// tabular-nums(monospacedDigit), 라벨 = T3 회색 소형, 본문 = regular.
import SwiftUI

enum KeegoTheme {
  // ── 무채 베이스 (theme.ts BG/T1~T4/SEP) ────────────────────────────────────
  static let bg = Color(keego: 0x0A0A0A)         // BG
  static let accent = Color(keego: 0xFFFFFF)     // ACCENT — 무채 강조 = 흰
  static let t1 = Color(keego: 0xFFFFFF)         // T1 본문/헤딩
  static let t2 = Color(keego: 0xEBEBF5)         // T2 보조 본문
  static let t3 = Color(keego: 0x9C9CA3)         // T3 라벨/보조(회색)
  static let t4 = Color(keego: 0x54545B)         // T4 가장 약한 캡션/단위
  static let glassFill = Color.white.opacity(0.08)   // GLASS.fill — 카드 표면
  static let cardBorder = Color.white.opacity(0.07)  // CARD_BORDER/SEP — 헤어라인
  /// 콰이어트 글라스 카드 림 — 폰 GlassEdge 의 워치 미러(면+1pt 헤어라인만,
  /// watchOS 에선 광택·글린트 같은 과한 효과 금지 — 사용자 확정 2026-07-11).
  static let hairline = Color.white.opacity(0.20)

  // ── 브랜드: 러닝 전용 파파야 (theme.ts RING_ACCENT*) ───────────────────────
  static let brand = Color(keego: 0xFF8000)      // RING_ACCENT — McLaren 파파야
  static let brandHi = Color(keego: 0xFFB458)    // RING_ACCENT_HI (그라데이션 top)
  static let brandLo = Color(keego: 0xE56600)    // RING_ACCENT_LO (그라데이션 bottom)
  /// 파파야 그라데이션(폰 러닝 링과 동일 스톱). 워치에선 러닝 도메인의 최소
  /// 포인트에만 쓴다(넓은 면 금지 가드레일).
  static var brandGradient: LinearGradient {
    LinearGradient(colors: [brandHi, brandLo], startPoint: .top, endPoint: .bottom)
  }

  // ── 의미색: 컨디션 (theme.ts GOOD/WARN/DANGER/BEST) ────────────────────────
  static let good = Color(keego: 0x46C98B)
  static let warn = Color(keego: 0xE6A23C)
  static let danger = Color(keego: 0xFF5A45)
  static let best = Color(keego: 0x4A9FF0)

  /// 신발 컨디션('양호'/'주의'/'교체') → 의미색. 폰 컨디션 도트와 동일 매핑.
  static func conditionColor(_ condition: String) -> Color {
    switch condition {
    case "주의": return warn
    case "교체": return danger
    default: return good
    }
  }

  /// 마모 4단계 색 — 폰 홈 히어로 링과 동일(lib/shoe.wearTier × TONE_COLOR 미러,
  /// 사용자 확정 2026-07-11): 사용률 <50 최상(BEST 파랑) / <80 양호(GOOD 초록) /
  /// <90 교체 고려(WARN 주황) / ≥90 교체 권장(DANGER 빨강). 입력은 남은 수명 %.
  static func wearColor(lifePct: Int) -> Color {
    let used = 100.0 - Double(lifePct)
    if used >= 90 { return danger }
    if used >= 80 { return warn }
    if used >= 50 { return good }
    return best
  }

  // ── 심박존 Z1–Z5 (theme.ts HR_ZONE_COLORS — 회복→유산소→템포→역치→무산소) ──
  static let hrZone: [Int: Color] = [
    1: best,                    // Z1 회복(파랑)
    2: good,                    // Z2 유산소(초록)
    3: Color(keego: 0xE6C34C),  // Z3 템포(노랑)
    4: Color(keego: 0xF0872E),  // Z4 역치(주황)
    5: danger,                  // Z5 무산소(빨강)
  ]
  static let hrZoneLabel: [Int: String] = [1: "회복", 2: "유산소", 3: "템포", 4: "역치", 5: "무산소"]

  /// 심박존 색. 존 0(미분류·심박 없음)은 무채(T3)로 — 색은 의미가 있을 때만.
  static func hrZoneColor(_ zone: Int) -> Color { hrZone[zone] ?? t3 }
}

extension Color {
  /// theme.ts 의 hex 토큰을 그대로 옮겨 적기 위한 이니셜라이저(sRGB, alpha 1).
  init(keego hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255.0,
      green: Double((hex >> 8) & 0xFF) / 255.0,
      blue: Double(hex & 0xFF) / 255.0,
      opacity: 1.0
    )
  }
}

// ── 공용 포맷터 — 폰과 동일 문법(러닝 지표 표기) ────────────────────────────────
enum KeegoFormat {
  /// 거리 km — 소수 2자리(폰 러닝 화면과 동일). 음수/NaN 은 0 처리(유실·음수 금지).
  static func km(_ km: Double) -> String {
    String(format: "%.2f", km.isFinite ? max(0, km) : 0)
  }

  /// 경과 시간 — 1시간 미만 mm:ss, 이상 h:mm:ss.
  static func time(_ seconds: Double) -> String {
    let s = Int(seconds.isFinite ? max(0, seconds) : 0)
    if s >= 3600 { return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60) }
    return String(format: "%02d:%02d", s / 60, s % 60)
  }

  /// 페이스 — 분'초" /km (폰 표기 5'02" 와 동일). 무효(거리 0 등)면 --'--".
  static func pace(secPerKm: Double) -> String {
    guard secPerKm.isFinite, secPerKm > 0, secPerKm < 3600 else { return "--'--\"" }
    let s = Int(secPerKm.rounded())
    return String(format: "%d'%02d\"", s / 60, s % 60)
  }
}
