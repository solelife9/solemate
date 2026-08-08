// VisionTextModule.m — Swift 구현(KeegoVisionText)을 RN 브리지에 노출.
// 'SoleMate'(앱) 타깃 멤버십 필요. 시그니처는 VisionTextModule.swift 와 일치해야 한다.
//
// 기록증 OCR 을 GoogleMLKit → Apple Vision 으로 옮기는 작업의 iOS 쪽 입구다
// (안드로이드는 ML Kit 유지 — 그쪽엔 OS 제공 API 가 없다).
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(KeegoVisionText, NSObject)

// 이 기기에서 한국어 인식을 쓸 수 있는가(iOS 16+ 이고 ko-KR 지원). JS 가 폴백 판단에 쓴다.
RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// 이미지 URI → 인식된 텍스트(줄바꿈 결합). 실패는 reject — 화면이 직접 입력으로 폴백한다.
RCT_EXTERN_METHOD(recognize:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
