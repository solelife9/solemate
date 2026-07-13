// HapticModule.swift — Taptic Engine 기반 정밀 햅틱(폰 전용).
// ----------------------------------------------------------------------------
// RN Vibration 모터의 '길고 강한 부르르'(iOS 는 ~400ms 고정) 대신 Apple 내장
// UIFeedbackGenerator 로 나이키급 '짧고 가벼운 톡'을 낸다. 외부 의존성 0 — UIKit 만
// 사용하므로 공급망·버전 드리프트가 없다(우리가 유지하는 얇은 브리지).
// JS(lib/haptics)가 이 모듈이 있으면 우선 쓰고, 없으면(안드로이드·미탑재) Vibration 폴백.
// ⚠️ 'SoleMate'(앱) 타깃 멤버십 필요. 짝 브리지 = HapticModule.m.
import Foundation
import UIKit

@objc(HapticModule)
class HapticModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { return true }

  // 임팩트(단발 톡). style: light|soft|medium|rigid|heavy. 미상/미지정은 light(가장 가벼움).
  // 세기는 '스타일'로 표현한다 — Taptic 은 길이가 아니라 질감으로 세기를 낸다.
  @objc(impact:)
  func impact(_ style: NSString) {
    let s: UIImpactFeedbackGenerator.FeedbackStyle
    switch style as String {
    case "soft": s = .soft
    case "medium": s = .medium
    case "rigid": s = .rigid
    case "heavy": s = .heavy
    default: s = .light
    }
    DispatchQueue.main.async {
      let g = UIImpactFeedbackGenerator(style: s)
      g.prepare()
      g.impactOccurred()
    }
  }

  // 알림(성공/경고/오류). type: success|warning|error. iOS Taptic 의 또렷한 알림 패턴
  // (구형 진동 모터가 아니라 Taptic — 짧고 정밀).
  @objc(notify:)
  func notify(_ type: NSString) {
    let t: UINotificationFeedbackGenerator.FeedbackType
    switch type as String {
    case "warning": t = .warning
    case "error": t = .error
    default: t = .success
    }
    DispatchQueue.main.async {
      let g = UINotificationFeedbackGenerator()
      g.prepare()
      g.notificationOccurred(t)
    }
  }
}
