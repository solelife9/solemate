# slice-5-fb-native retry — react-native.config.js forceStaticLinking 무효키 제거 (Metro/run-android 복구)

type: journal
job_name: react-native.config.js Metro/run-android 차단 결함 수정
created: 2026-06-03

## 차단 결함

`npx react-native start`(Metro) 와 `npx react-native run-android` 가 즉시 실패:

```
Config Validation Error: "dependencies.@react-native-firebase/app.platforms.ios.forceStaticLinking" is not allowed
```

원인: 이전 시도가 작성한 `dependencies['@react-native-firebase/*'] = {platforms:{ios:{forceStaticLinking:true}}}` 가
@react-native-community/cli 20.1.0 의 config 스키마에 **존재하지 않는 키**. eval(tsc/lint/jest)은 이 파일을
로드하지 않고 `gradlew assembleDebug` 는 autolinking gradle 을 직접 써서 CLI 검증을 우회 → gradle 은 SUCCESS 였지만
JS CLI 경로(Metro·run-android)는 깨진 상태였다.

## 수정

- `react-native.config.js` 에서 무효한 `dependencies` forceStaticLinking 블록 **제거**.
- `assets: ['./assets/fonts']` (벡터 아이콘 폰트 링크) **보존**.
- iOS 정적 프레임워크는 Podfile `$RNFirebaseAsStaticFramework = true` 플래그가 담당 — config 키 없이도 의도 유지.
  (RN0.85/cli20.1.0 에 정적링크를 지정하는 유효한 config 스키마 키는 확인되지 않음 → 추측 금지, Podfile 플래그에만 의존.)

## 재검증 (게이트)

- `npx react-native config` → **EXIT 0, 검증 에러 없음** (핵심 게이트). assets 보존·firebase 3모듈 autolink 유지·forceStaticLinking 부재 확인.
- `npx tsc --noEmit` → 0
- `npm run lint` → 0 errors (기존 119 warnings 불변)
- `npm test` → 73 suites / 650 tests green
- `cd android && ./gradlew :app:assembleDebug` (JAVA_HOME=Android Studio jbr) → **BUILD SUCCESSFUL**

firebase 통합(google-services 플러그인, app/auth/firestore 모듈, CloudPort/firebaseCloudPort, jest 목)은 그대로 유지.
데이터/시크릿 변경 0. 변경 파일: react-native.config.js 한정.
