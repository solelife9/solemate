// PedometerDistanceModule.m — Swift RCTEventEmitter 를 RN 브리지에 노출.
// 'SoleMate'(앱) 타깃 멤버십 필요. 시그니처는 PedometerDistanceModule.swift 와 일치.
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(PedometerDistanceModule, RCTEventEmitter)

// 러닝 시작/종료에 배선 — CMPedometer 누적거리(m) 스트림 on/off.
RCT_EXTERN_METHOD(startPedometerUpdates)
RCT_EXTERN_METHOD(stopPedometerUpdates)

@end
