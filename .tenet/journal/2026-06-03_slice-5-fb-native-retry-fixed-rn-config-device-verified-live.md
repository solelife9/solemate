# slice-5-fb-native retry fixed RN config, device-verified live

type: journal
source_job: 3730c981-1462-44a2-a7ad-d5fab150b98d
job_name: @react-native-firebase 네이티브 통합 + google-services 배선
created: 2026-06-03T05:14:18.901Z

## Findings

- **blocking_defect**: react-native.config.js 가 dependencies['@react-native-firebase/*'].platforms.ios.forceStaticLinking 키를 써서 @react-native-community/cli 20.1.0 parseUserConfig 가 거부 → Metro(npx react-native start)와 run-android 가 즉시 실패. eval(tsc/lint/jest)은 이 파일 미로드, gradlew assembleDebug 는 autolinking gradle 직접 사용해 CLI 검증 우회 → gradle green이어도 JS CLI 경로 깨짐. 오케스트레이터가 use-checkpoint 실기기 테스트 중 Metro 기동으로 발견.
- **fix**: retry1(commit f7724e7): react-native.config.js 의 무효 forceStaticLinking dependencies 블록 제거, assets:['./assets/fonts'] 보존. iOS 정적프레임워크는 Podfile $RNFirebaseAsStaticFramework=true 로만 유지(추측 키 금지).
- **eval_retry**: code_critic pass(0), test_critic pass(비차단 harness_bug: react-native.config.js 가 eval에 안 보임 — 회귀 가드 권장), playwright_eval pass(Metro 클린 부팅 재확인). npx react-native config EXIT 0, tsc 0·lint 0·jest 73/650, assembleDebug BUILD SUCCESSFUL.
- **device_verification**: 오케스트레이터 직접 검증: Metro 재기동(Dev server ready, config 에러 없음) → app-debug.apk emulator-5554 실행 → ReactNativeJS 'Running SoleMate' fabric, FATAL/firebase init 크래시 없음. 프로필 → '계정·클라우드' 섹션(Google로 계속·Apple로 계속) 다크+오렌지 렌더 시각 확인. 스크린샷 .tenet/visuals/slice5-firebase-*.png.
- **lesson**: [implemented-and-tested] 네이티브 통합은 eval(tsc/lint/jest)만으로 불충분 — react-native.config.js/metro 가 eval 사각지대. 오케스트레이터의 npx react-native config + Metro 부팅 + run-android 검증이 필수. 향후 네이티브 잡은 항상 이 게이트를 거칠 것.
- **followup_nonblocking**: test_critic 권장: react-native.config.js 스키마 회귀 가드(npx react-native config exit 0 스모크 테스트 또는 resolved config shape 단언) — 동일 버그 재발 방지. BLE 단계나 추후 추가 고려.
