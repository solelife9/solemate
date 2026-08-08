import Foundation
import React
import Vision
import UIKit

/**
 KeegoVisionText — 기록증 사진에서 글자를 읽는다(온디바이스).

 **왜 애플 기본 프레임워크인가(CLAUDE.md §구현 원칙).** 아이폰은 `Vision` 으로 글자 인식을
 이미 제공한다 — 사진 앱의 '텍스트 인식'과 같은 엔진이고, iOS 16 부터 한국어를 지원한다.
 우리는 그걸 두고 GoogleMLKit(약 20MB, 한/중/일/데바나가리 모델 동봉)을 쓰고 있었다.

 그 대가가 컸다: **ML Kit 은 arm64 시뮬레이터 슬라이스를 제공하지 않는다.** 그래서
 애플 실리콘 맥에서는 앱이 iOS 시뮬레이터에 아예 올라가지 않았고(Xcode 26 은 Rosetta
 시뮬레이터를 제거했다), 그 결과 시뮬레이터 개발과 아이폰 E2E 가 통째로 막혀 있었다
 (docs/e2e.md). 의존성 0 · 용량 0 · 시뮬레이터 동작 — 바꾸지 않을 이유가 없다.

 ⚠️ **안드로이드는 그대로 ML Kit 을 쓴다.** 안드로이드에는 OS 가 주는 글자 인식 API 가
 없어 ML Kit 이 그쪽의 표준이다(android/app/build.gradle). 이건 라이브러리 제거가 아니라
 '아이폰만 OS 것으로 갈아타기'다.

 ── 설계에서 지킨 선 ────────────────────────────────────────────────────────
  · **앱을 죽이지 않는다.** 모든 경로에서 실패를 값(reject)으로 답한다. 인식이 안 되는 것보다
    앱이 죽는 게 나쁘다 — 화면은 실패하면 직접 입력으로 폴백한다(기존 동작 그대로).
  · **정확도 우선.** `.accurate` + 언어 교정 ON. 기록증은 작은 숫자를 읽어야 하고, 사진은
    한 장뿐이라 빠를 이유가 없다(lib/photo.ts 도 같은 이유로 OCR 입력만 축소하지 않는다).
  · 한국어 + 영어를 함께 인식한다. 국내 기록증은 라벨이 한글이고 값이 라틴 숫자다.
  · 반환은 **줄바꿈으로 이은 통짜 텍스트** — ML Kit 래퍼와 같은 모양이라 lib/ocr 파서는
    한 줄도 바뀌지 않는다.
 */
@objc(KeegoVisionText)
class KeegoVisionText: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  /// 이 기기에서 쓸 수 있는가. iOS 13+ 는 Vision 이 있고, 한국어는 16+ 다.
  /// JS 는 이 값을 보고 ML Kit 폴백 여부를 정한다.
  @objc(isAvailable:rejecter:)
  func isAvailable(_ resolve: RCTPromiseResolveBlock, rejecter _: RCTPromiseRejectBlock) {
    if #available(iOS 16.0, *) {
      // 한국어 지원 여부를 **실제로 물어본다** — OS 버전으로 추측하지 않는다.
      // 인스턴스 메서드를 쓴다: 클래스 메서드
      // `supportedRecognitionLanguages(for:revision:)` 는 iOS 15 에서 deprecated 됐고,
      // 지원 언어는 **요청의 recognitionLevel 에 따라 달라지므로** 실제로 쓸 설정과 같은
      // 요청 객체에 물어보는 쪽이 정확하다.
      let probe = VNRecognizeTextRequest()
      probe.recognitionLevel = .accurate
      let langs = (try? probe.supportedRecognitionLanguages()) ?? []
      resolve(langs.contains("ko-KR"))
    } else {
      resolve(false)
    }
  }

  /**
   이미지에서 텍스트를 읽어 줄바꿈으로 이어 돌려준다.

   - Parameter uri: `file://…` 또는 경로. 카메라로 찍은 원본(축소 전)이 들어온다.
   */
  @objc(recognize:resolver:rejecter:)
  func recognize(_ uri: NSString,
                 resolver resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.0, *) else {
      reject("unavailable", "Vision 한국어 인식은 iOS 16 이상입니다.", nil)
      return
    }
    guard let cg = Self.loadCGImage(String(uri)) else {
      reject("bad_image", "이미지를 읽지 못했습니다: \(uri)", nil)
      return
    }

    let request = VNRecognizeTextRequest { req, err in
      if let err = err {
        reject("recognize_failed", err.localizedDescription, err)
        return
      }
      let obs = (req.results as? [VNRecognizedTextObservation]) ?? []
      // 상위 후보 1개만 쓴다. 후보를 여러 개 섞으면 파서가 같은 값을 두 번 보게 되고,
      // '가장 큰 HH:MM:SS 를 완주로' 같은 규칙이 흔들린다(lib/ocr).
      let lines = obs.compactMap { $0.topCandidates(1).first?.string }
      resolve(lines.joined(separator: "\n"))
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    // 한글 라벨 + 라틴 숫자가 섞여 있다. 순서가 우선순위다.
    request.recognitionLanguages = ["ko-KR", "en-US"]

    // 메인 스레드에서 돌리면 인식(수백 ms~수 초) 동안 UI 가 얼어붙는다.
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
      } catch {
        reject("recognize_failed", error.localizedDescription, error)
      }
    }
  }

  /// `file://` URI·평문 경로 어느 쪽이 와도 읽는다(호출부가 둘 다 만든다).
  private static func loadCGImage(_ raw: String) -> CGImage? {
    let url: URL? = raw.hasPrefix("file://") ? URL(string: raw) : URL(fileURLWithPath: raw)
    guard let url = url, let data = try? Data(contentsOf: url) else { return nil }
    // UIImage 를 거치는 이유: EXIF 회전을 반영해야 한다. CGImage 직행은 눕힌 사진을
    // 눕힌 채로 읽어 인식률이 떨어진다.
    guard let img = UIImage(data: data) else { return nil }
    return img.cgImage
  }
}
