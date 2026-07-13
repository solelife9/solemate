// HapticModule.m — Taptic 스위프트 모듈(UIFeedbackGenerator)을 RN 브리지에 노출.
// 'SoleMate'(앱) 타깃 멤버십 필요. 시그니처는 HapticModule.swift 와 일치.
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HapticModule, NSObject)

// 임팩트(단발 톡). style = "light"|"soft"|"medium"|"rigid"|"heavy".
RCT_EXTERN_METHOD(impact:(NSString *)style)

// 알림 햅틱. type = "success"|"warning"|"error".
RCT_EXTERN_METHOD(notify:(NSString *)type)

@end
