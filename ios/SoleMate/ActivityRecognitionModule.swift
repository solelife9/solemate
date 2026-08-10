// ActivityRecognitionModule.swift — OS 활동 인식(차량 감지 **1순위**), iOS 쪽 구현.
// ----------------------------------------------------------------------------
// **왜 OS 에게 묻나.** 지금 걷는지·뛰는지·차에 타고 있는지는 iOS 가 이미 판정하고 있다 —
// 모션 보조칩(M-series)이 가속도 패턴을 저전력으로 상시 분류한다. 나이키·스트라바·
// 애플 피트니스가 전부 이걸 쓰고, 우리가 만든 어떤 속도·걸음 규칙보다 정확하다
// (CLAUDE.md §구현 원칙 — '업계 표준 정석으로 만든다').
//
// 계기(2026-08-07): 차를 타고 가며 앱을 켜 둔 것이 2.56km 러닝으로 저장돼 프로필의
// 「1km 최고」를 차지했다. 걸음 정지 게이트는 **차가 빠를 때 일부러 풀리므로**(걸음
// 센서가 동결된 진짜 러너의 거리를 죽이지 않으려는 안전선) 그 구간을 못 막는다.
//
// 이 파일은 안드로이드 `KeegoActivityRecognitionModule.kt` 와 **같은 계약**이다 —
// 이름·메서드·반환 모양이 같아서 JS(`lib/activityRecognition.ts`)는 플랫폼을 모른다.
// 백스톱 휴리스틱은 `lib/vehicleDetect.ts`.
//
// **새 의존성은 0** — Core Motion 은 시스템 프레임워크이고, 권한
// `NSMotionUsageDescription` 은 Info.plist 에 이미 있다(expo-sensors 걸음수와 공유).
//
// ── 설계에서 지킨 선(안드로이드 모듈과 동일) ─────────────────────────────────
//  · **앱을 죽이지 않는다.** 실패는 던지지 않고 값으로 답한다. 활동 인식이 안 되는 것보다
//    앱이 죽는 게 나쁘다.
//  · **가장 최근 분류 하나만** 올려보낸다. 신뢰도로 거르는 건 JS 몫이다.
//  · **러닝이 끝나면 반드시 stop.** 구독을 켠 채 두면 배터리를 계속 먹는다.
//
// ⚠️ 이 파일은 'SoleMate'(앱) 타깃 멤버십 필요(Xcode File Inspector / project.pbxproj).
import Foundation
import CoreMotion
import React

@objc(KeegoActivityRecognition)
class ActivityRecognitionModule: NSObject {
  private let manager = CMMotionActivityManager()

  /// 마지막 분류 1건 — 구독 콜백이 갱신하고 `current` 가 읽는다.
  private var lastKind = "unknown"
  private var lastConfidence = 0
  private var running = false

  @objc static func requiresMainQueueSetup() -> Bool { false }

  /// 콜백은 우리가 준 큐에서 오고 `current` 는 브리지 큐에서 읽는다 — 두 필드를 이 큐로 직렬화한다.
  private let stateQueue = DispatchQueue(label: "com.keego.app.activity.state")

  /// 구독 콜백 전용 큐(메인 스레드를 쓰지 않는다 — 러닝 중 UI 를 방해할 이유가 없다).
  private let updateQueue: OperationQueue = {
    let q = OperationQueue()
    q.maxConcurrentOperationCount = 1
    q.qualityOfService = .utility
    return q
  }()

  /// CMMotionActivity → JS 공통 어휘. `lib/activityRecognition.normalizeActivityKind` 가 받는 값이다.
  private func kindOf(_ a: CMMotionActivity) -> String {
    // 순서가 곧 우선순위다. iOS 는 플래그를 **동시에** 세울 수 있어서(정차 중인 차 안 =
    // automotive + stationary) 먼저 보는 쪽이 이긴다. 차량을 맨 앞에 두는 이유:
    // 이 모듈의 존재 이유가 차량 판정이고, 신호대기로 선 차는 여전히 차다.
    if a.automotive { return "automotive" }
    if a.cycling { return "cycling" }
    if a.running { return "running" }
    if a.walking { return "walking" }
    if a.stationary { return "stationary" }
    return "unknown"
  }

  /// iOS 3단계 신뢰도 → 0~100. `VEHICLE_CONFIDENCE_MIN = 66` 이므로 **medium 이상이 통과**한다
  /// (lib/activityRecognition 의 상수 주석과 같은 약속 — 한쪽만 바꾸면 판정이 조용히 어긋난다).
  private func confidenceOf(_ a: CMMotionActivity) -> Int {
    switch a.confidence {
    case .high: return 100
    case .medium: return 66
    default: return 33
    }
  }

  /// 이 기기가 활동 인식을 지원하는가. 구형/일부 기기는 모션 보조칩이 없다.
  @objc(isAvailable:rejecter:)
  func isAvailable(_ resolve: RCTPromiseResolveBlock, rejecter _: RCTPromiseRejectBlock) {
    resolve(CMMotionActivityManager.isActivityAvailable())
  }

  /**
   * 권한 상태를 답한다. **여기서 새로 묻지 않는다** — 모션 권한 다이얼로그는 러닝 시작
   * 흐름에서 expo-sensors Pedometer 가 이미 띄운다. 여기서 또 물으면 두 번 뜬다
   * (안드로이드 모듈도 같은 이유로 확인만 한다).
   *
   * `.authorized` 만 true. `.notDetermined` 는 아직 모르는 상태라 false 로 답하고,
   * 실제 구독은 `start` 에서 시도한다 — 거부돼 있으면 조용히 실패하고 백스톱이 돈다.
   */
  @objc(requestPermission:rejecter:)
  func requestPermission(_ resolve: RCTPromiseResolveBlock, rejecter _: RCTPromiseRejectBlock) {
    resolve(CMMotionActivityManager.authorizationStatus() == .authorized)
  }

  /// 구독 시작. 지원 안 함·권한 거부는 **던지지 않고** false 로 답한다.
  @objc(start:rejecter:)
  func start(_ resolve: @escaping RCTPromiseResolveBlock, rejecter _: RCTPromiseRejectBlock) {
    guard CMMotionActivityManager.isActivityAvailable() else { resolve(false); return }
    var already = false
    stateQueue.sync {
      if running { already = true } else { running = true }
    }
    if already { resolve(true); return } // 중복 구독 방지

    manager.startActivityUpdates(to: updateQueue) { [weak self] activity in
      guard let self, let a = activity else { return }
      let kind = self.kindOf(a)
      let conf = self.confidenceOf(a)
      self.stateQueue.async {
        guard self.running else { return }
        self.lastKind = kind
        self.lastConfidence = conf
      }
    }
    resolve(true)
  }

  /// 구독 종료 — 러닝이 끝나면 반드시 부른다(배터리·프라이버시).
  /// 마지막 분류도 지운다. 남겨 두면 다음 러닝이 **지난번 판정을 물려받는다.**
  @objc(stop:rejecter:)
  func stop(_ resolve: @escaping RCTPromiseResolveBlock, rejecter _: RCTPromiseRejectBlock) {
    manager.stopActivityUpdates()
    stateQueue.sync {
      running = false
      lastKind = "unknown"
      lastConfidence = 0
    }
    resolve(nil)
  }

  /// 가장 최근 분류. 구독 전이면 nil — JS 가 'unknown'(모름)으로 받아 백스톱에 맡긴다.
  @objc(current:rejecter:)
  func current(_ resolve: @escaping RCTPromiseResolveBlock, rejecter _: RCTPromiseRejectBlock) {
    var out: [String: Any]?
    stateQueue.sync {
      guard running else { return }
      out = ["kind": lastKind, "confidence": lastConfidence]
    }
    resolve(out)
  }
}
