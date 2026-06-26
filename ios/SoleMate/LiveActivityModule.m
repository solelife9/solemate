// LiveActivityModule.m — Swift 네이티브 모듈을 RN 브리지에 노출(RCT_EXTERN_MODULE)
// 'SoleMate'(앱) 타깃에 멤버십. 메서드 시그니처는 LiveActivityModule.swift 와 일치해야 한다.
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)

RCT_EXTERN_METHOD(start:(NSString *)shoeName
                  goalKm:(double)goalKm
                  distanceKm:(double)distanceKm
                  elapsedSec:(double)elapsedSec
                  paceLabel:(NSString *)paceLabel
                  avgPaceLabel:(NSString *)avgPaceLabel)

RCT_EXTERN_METHOD(update:(double)distanceKm
                  elapsedSec:(double)elapsedSec
                  paceLabel:(NSString *)paceLabel
                  avgPaceLabel:(NSString *)avgPaceLabel)

RCT_EXTERN_METHOD(end)

@end
