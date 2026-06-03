# slice-5-fb-native done, gradle build + APK install green

type: journal
source_job: 3730c981-1462-44a2-a7ad-d5fab150b98d
job_name: @react-native-firebase 네이티브 통합 + google-services 배선
created: 2026-06-03T00:45:23.973Z

## Findings

- **job**: slice-5-fb-native
- **commit**: dc4af75d1f93100240d72032975984921b27452d
- **result**: @react-native-firebase v24.0.0(app/auth/firestore) 네이티브 통합 완료. forceStaticLinking(iOS, react-native.config.js + Podfile $RNFirebaseAsStaticFramework), android google-services 4.4.4 classpath+plugin, google-services.json(com.solemate) .gitignore 처리·미커밋. lib/cloudPort.ts(순수 인터페이스) + lib/firebaseCloudPort.ts(userBackups/{uid}, requireUid 데이터보호). jest.setup firebase 인메모리 목.
- **eval**: code_critic pass(결함0), test_critic pass(비차단 1: normalizePayload 방어분기 미테스트), playwright_eval pass(library, layer2 N/A). tsc 0·eslint 0·jest 72 suites/643 green(신규 포트 행동테스트 8).
- **orchestrator_native_gate**: JAVA_HOME=Android Studio jbr(JDK 21.0.10). cd android && ./gradlew :app:assembleDebug → BUILD SUCCESSFUL in 3m13s(firebase 3모듈 컴파일·google-services 적용·autolink). app-debug.apk(165MB) adb install emulator-5554 → Success(manifest 머지 정상). iron law 충족: 빌드 안 깨짐.
- **compat_fact**: @react-native-firebase v24.0.0 ↔ RN0.85.3/React19.2.3/Expo56 호환(--legacy-peer-deps 필요: new-app-screen@0.85.2 무관 peer 충돌). gradle google-services 4.4.4, firebase-bom 34.10.0, play-services-auth 21.5.0, minSdk24.
- **deferred**: Google 네이티브 로그인: google-services.json oauth_client 비어있음 → Firebase Console SHA-1 등록 + @react-native-google-signin 필요. 포트가 resolveGoogleCredential 주입 수용. slice-5-fb-ui 에서 안내.
- **next**: slice-5-fb-ui — ProfileScreen 로그인/동기 UI(목 포트 행동테스트). 그 다음 slice-5-fb-e2e → use-checkpoint(사용자 실기기 실연동).
