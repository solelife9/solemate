// WatchCrash.swift — 워치 앱 크래시 수집(Firebase Crashlytics) 얇은 격리 래퍼
// ----------------------------------------------------------------------------
// 왜 필요한가(2026-08-04 출시 운영 감사 L-02): 폰은 크래시가 나면 Crashlytics 로 우리에게
// 도착하는데, **워치 앱에는 수집이 한 줄도 없었다.** 워치는 단독 러닝·목표·트랙 자동랩을
// 담당하는 1,600줄대 독립 타깃이고 스토어 스크린샷 6장 중 한 장이다. 여기서 앱이 죽으면
// 사용자는 러닝을 통째로 잃고, 우리는 그런 일이 있었다는 사실조차 모른다 — 사용자가 직접
// 말해주지 않는 한 영원히.
//
// ── 설계에서 지킨 선 ────────────────────────────────────────────────────────
//
// 1) **없으면 없는 대로 돈다.** `#if canImport(FirebaseCrashlytics)` 로 감쌌다. 아직
//    `pod install` 을 돌리지 않았거나 워치 타깃에서 Firebase 를 빼기로 결정하면, 이 파일은
//    통째로 no-op 으로 컴파일된다. 워치 앱이 빌드조차 안 되는 상태를 만들지 않는다.
//
// 2) **설정 파일이 없으면 조용히 포기한다.** FirebaseApp.configure() 는 GoogleService-Info
//    가 없으면 **예외를 던지며 앱을 죽인다.** 워치 앱이 매 실행 죽는 건 관측성이 없는 것보다
//    훨씬 나쁘다 — 그래서 파일 존재를 먼저 확인하고, 없으면 아무 일도 하지 않는다.
//    (lib/crashlytics.ts 의 "관측성 실패는 앱을 막지 않는다"와 같은 규약.)
//
// 3) **폰과 별개의 Firebase 앱이다.** 워치 번들 ID(com.keego.app.watchkitapp)로 Firebase
//    콘솔에 앱을 하나 더 등록하고 그 GoogleService-Info.plist 를 이 타깃에 넣어야 한다.
//    등록 전까지는 2)에 의해 조용히 꺼져 있다.
//
// ⚠️ watchOS Crashlytics 의 한계: 워치는 iOS 만큼 모든 크래시 유형을 잡지 못한다(플랫폼
//    제약). 잡히는 것만으로도 지금(0건)보다 낫다는 판단이지, '전부 잡힌다'는 뜻이 아니다.

import Foundation

#if canImport(FirebaseCore) && canImport(FirebaseCrashlytics)
import FirebaseCore
import FirebaseCrashlytics
#endif

enum WatchCrash {
  /// 앱 시작 시 1회. 중복 호출·설정 부재·초기화 실패 어디서도 던지지 않는다.
  static func start() {
    #if canImport(FirebaseCore) && canImport(FirebaseCrashlytics)
    // 이미 구성됐으면 다시 하지 않는다(중복 configure 는 런타임 경고 + 예외).
    guard FirebaseApp.app() == nil else { return }
    // 설정 파일이 번들에 없으면 **아무 일도 하지 않는다**(위 설계 선 2).
    guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
          let options = FirebaseOptions(contentsOfFile: path) else { return }
    FirebaseApp.configure(options: options)
    #endif
  }

  /// 잡은 예외를 비치명으로 기록. 실패는 삼킨다(폰 lib/crashlytics.recordError 와 같은 규약).
  static func record(_ error: Error, context: String? = nil) {
    #if canImport(FirebaseCore) && canImport(FirebaseCrashlytics)
    guard FirebaseApp.app() != nil else { return }
    if let context { Crashlytics.crashlytics().log(context) }
    Crashlytics.crashlytics().record(error: error)
    #endif
  }

  /// 크래시 직전 맥락을 남기는 빵부스러기(러닝 시작/종료 같은 분기점에만 — 남발 금지).
  static func breadcrumb(_ message: String) {
    #if canImport(FirebaseCore) && canImport(FirebaseCrashlytics)
    guard FirebaseApp.app() != nil else { return }
    Crashlytics.crashlytics().log(message)
    #endif
  }
}
