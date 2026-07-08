// WatchSessionModule.m — Swift RCTEventEmitter 를 RN 브리지에 노출.
// 'SoleMate'(앱) 타깃 멤버십 필요. 시그니처는 WatchSessionModule.swift 와 일치.
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(WatchSessionModule, RCTEventEmitter)

// 폰 → 워치 워크아웃 자동 시작/종료(러닝 시작/종료에 배선). start 는 워치앱을 띄워
// 워크아웃을 시작하고 성공 여부를 Promise 로 돌려준다.
RCT_EXTERN_METHOD(startWatchWorkout:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopWatchWorkout)

@end
