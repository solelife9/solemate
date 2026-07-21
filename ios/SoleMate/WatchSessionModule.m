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

// 폰 → 워치 심박존 이탈 햅틱(#8). dir = "up" | "down".
RCT_EXTERN_METHOD(sendZoneHaptic:(NSString *)dir)

// 폰 → 워치 햅틱(진동) on/off — 워치 자동 랩·존 이탈 진동이 존중.
RCT_EXTERN_METHOD(setWatchHaptics:(BOOL)enabled)

// 폰 → 워치 활성 신발 목록·심박존 파라미터 푸시(applicationContext — 오프라인 캐시).
// payload = { shoes: [{id,brand,model,lifePct,condition}], hrMax?, hrRest? }.
RCT_EXTERN_METHOD(updateShoeContext:(NSDictionary *)payload)

// 폰 → 워치 최근 러닝 동기화(워치 기록에 폰 런 합침). payload = { runs: [{id,endMs,km,...}] }.
RCT_EXTERN_METHOD(updateRecentRuns:(NSDictionary *)payload)

// 폰 → 홈/잠금화면 위젯(신발 수명 링) 데이터 공급. App Group 공유 UserDefaults 기록 +
// 위젯 타임라인 리로드. payload = { name, brand, category, usedKm, maxKm }.
RCT_EXTERN_METHOD(updateWidgetShoe:(NSDictionary *)payload)

@end
