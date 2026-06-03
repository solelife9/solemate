# slice-5-fb-native done — @react-native-firebase v24 통합 + CloudPort

type: journal
job_name: 네이티브 Firebase 통합 (slice-5-fb-native)
created: 2026-06-03

## 호환성 확인 (착수 즉시)

- **결론: 호환 OK.** @react-native-firebase v24.0.0 (2026-04-01 릴리스) ↔ RN 0.85.3 / React 19.2.3 / Expo SDK 56 동작 확인(rnfirebase releases·사용자 리포트). peerDeps 느슨(expo>=47, react/react-native `*`).
- forceStaticLinking 은 RN 0.84+ "prebuilt(precompiled) React core" 대응 iOS 요구사항. bare+expo-modules 프로젝트라 expo-build-properties(prebuild) 가 아니라 react-native.config.js + Podfile 로 구성.

## 통합 내용

- **설치**: @react-native-firebase/app·auth·firestore 모두 `24.0.0` 고정. (`--legacy-peer-deps` — 기존 프로젝트가 @react-native/new-app-screen@0.85.2↔RN0.85.3 peer 충돌을 이 플래그로 이미 해소 중이라 동일 정책.)
- **forceStaticLinking(iOS)**: `react-native.config.js` 에 app/auth/firestore 세 모듈 `platforms.ios.forceStaticLinking:true` + `ios/Podfile` 에 `$RNFirebaseAsStaticFramework = true`. Android autolinking 에는 무영향.
- **Android google-services**: `android/build.gradle` buildscript classpath `com.google.gms:google-services:4.4.4`(= RNFB app `sdkVersions.android.gmsGoogleServicesGradle`), `android/app/build.gradle` 에 `apply plugin: "com.google.gms.google-services"`.
- **google-services.json**: 사용자 제공분(package_name `com.solemate`, project keego-620b8) android/app/ 에 이미 배치됨. **시크릿 노출 방지로 `.gitignore` 등록 → 커밋하지 않음**(ios/GoogleService-Info.plist 도 함께). 가짜/placeholder 파일 없음.

## CloudPort (firebase 포트)

- `lib/cloudPort.ts` — 순수 인터페이스(firebase import 0): `signIn(provider)/signOut()/pull():BackupPayload|null/push(data)`. cloudSync 는 이 포트를 import 하지 않음(의존성 역전 유지).
- `lib/firebaseCloudPort.ts` — auth(modular: getAuth/signInAnonymously/signInWithCredential/signOut) + firestore(modular: getFirestore/doc/getDoc/setDoc) 로 실제 구현. 문서 경로 `userBackups/{uid}`. pull/push 는 currentUser 없으면 throw(데이터 보호). anonymous 자체완결, google 은 주입된 자격증명 리졸버 필요(google-services.json oauth_client 비어있음 → 실 Google 로그인은 SHA-1+google-signin 추가 셋업이 후속 과제).
- **jest 목**: `jest.setup.js` 에서 두 firebase 모듈을 메모리 가짜로 목 처리(인증 상태 + firestore 인메모리 스토어). 실 네이티브 호출 0.

## 검증 (iron law)

- **tsc**: 0 errors. **eslint .**: 0 errors(기존 경고만). **jest**: 72 suites / 643 tests green(신규 `__tests__/lib/firebaseCloudPort.test.ts` 8개 — anonymous 로그인·push→pull 라운드트립·uid 데이터격리·미로그인 거부·signOut·google 리졸버 경로).
- **gradle 설정 검증(로컬)**: `:app:tasks` BUILD SUCCESSFUL — google-services:4.4.4 적용, `:react-native-firebase_app` autolink(v24.0.0, firebase-bom 34.10.0, play-services-auth 21.5.0, minSdk 24≥23, compileSdk/targetSdk 36) 정상 구성. 전체 assembleDebug/run-android(emulator-5554) 컴파일+설치 게이트는 오케스트레이터가 1차 검증.
- 데이터 변경 0(BackupPayload 형태 재사용), 시크릿 커밋 0.

## next

- slice-5-fb-e2e: 오케스트레이터 emulator gradle 빌드 그린 확인 → 로그인 UI 배선 + 실기기 동기. Google 로그인 활성화 시 Firebase 콘솔 SHA-1 등록 + @react-native-google-signin 추가 필요.
