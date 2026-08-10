// ActivityRecognitionModule.m — Swift 모듈을 RN 브리지에 노출.
// ----------------------------------------------------------------------------
// 브리지 이름은 **KeegoActivityRecognition** 이다(클래스명이 아니라 @objc 이름).
// 안드로이드 `KeegoActivityRecognitionModule.kt` 의 getName() 과 같은 문자열이어야
// JS(`lib/activityRecognition.ts` → `NativeModules.KeegoActivityRecognition`)가
// 플랫폼을 모르고 쓴다. 한쪽만 바꾸면 그 플랫폼에서 조용히 백스톱으로 떨어진다.
//
// 'SoleMate'(앱) 타깃 멤버십 필요. 시그니처는 ActivityRecognitionModule.swift 와 일치.
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(KeegoActivityRecognition, NSObject)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                          rejecter:(RCTPromiseRejectBlock)reject)

// 러닝 시작/종료에 배선 — 활동 분류 구독 on/off(screens/RunEngine.tsx).
RCT_EXTERN_METHOD(start:(RCTPromiseResolveBlock)resolve
                rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve
               rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(current:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)

@end
