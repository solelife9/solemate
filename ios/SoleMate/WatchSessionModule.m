// WatchSessionModule.m — Swift RCTEventEmitter 를 RN 브리지에 노출.
// 'SoleMate'(앱) 타깃 멤버십 필요. 시그니처는 WatchSessionModule.swift 와 일치.
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(WatchSessionModule, RCTEventEmitter)
@end
