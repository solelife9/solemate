# Slice 8 fcm-native — @react-native-firebase/messaging 통합 + pushMessaging 래퍼

type: journal
job_name: slice-8-fcm-native
created: 2026-06-09

## Findings

- **호환 확인(최우선)**: `@react-native-firebase/messaging@24.0.0` 추가 — 기존 app/auth/firestore 24.0.0·RN 0.85.3 와 동일 버전(정확 핀, 캐럿 제거). `--legacy-peer-deps` 설치(RNFB v24 관례). package-lock 자동 갱신(messaging 항목만 +16줄, 순수 additive).
- **gradle 통합 무결성**: google-services 플러그인은 이미 적용됨(app/build.gradle) — messaging 은 autolink 로 흡수. `npx react-native config` 확인: messaging 이 autolink deps 에 잡히고 android 플랫폼 present=true → 오케스트레이터 gradle 빌드가 네이티브 모듈을 링크함. 새 gradle 수동 설정 불필요.
- **AndroidManifest**: `POST_NOTIFICATIONS`(Android 13+ 런타임 알림 권한) 선언 추가. FCM `<service>` 선언은 messaging 모듈 매니페스트가 자동 머지 → 중복 선언 안 함(머지 충돌 방지, location 패턴과 동일).
- **lib/pushMessaging.ts**: 네이티브 호출 격리 래퍼. `requestPushPermission()`(거부 graceful·throw 안 함→false, S8-3), `getPushToken()`(실패→null), `registerForegroundMessageHandler()`(onMessage 래핑·실패 시 no-op unsub), `presentDue(intents)`(dueNotifications 결과를 포그라운드에 표시 — 주입 가능 presenter, 기본 RN 내장 Alert, 새 네이티브 의존 0), `initPushMessaging()` 편의 셋업. `isAuthorizedStatus`(AUTHORIZED/PROVISIONAL 통과).
- **네이티브 최소 준수**: notifee 등 OS 타이머 정밀 스케줄 라이브러리 추가 안 함. 포그라운드 로컬 표시는 Alert 만 사용.
- **jest.setup.js**: `@react-native-firebase/messaging` 메모리 목 추가(requestPermission→AUTHORIZED, getToken→'mock-fcm-token', onMessage→unsubscribe, AuthorizationStatus 수치 enum) — 단위/행동 테스트 네이티브 없이 green.
- **테스트**: `__tests__/lib/pushMessaging.test.ts` 15개 — 권한 거부/reject graceful(throw 없음), 토큰 null 폴백, onMessage 핸들러 라운드트립 전달·해제, presentDue 표시/빈목록/부분실패 graceful, initPushMessaging 허용/거부 분기. 전부 행동 단언(관찰 가능 결과).
- **시크릿 0**: google-services.json 미추적(gitignore) 확인. **데이터 파괴 0**: 기존 코드 무변경, 추가만.
- **검증**: `npx tsc --noEmit` green, `npm run lint` 0 errors, `npm test` 817/817 pass(이전 802 +15).
- **범위 밖(use-checkpoint)**: 실기기 FCM 실제 푸시 수신·OS 타이머 정밀 스케줄은 사용자 검증 사항. 오케스트레이터가 별도 `npx react-native run-android`(emulator-5554) gradle 빌드 검증 예정.
- **next**: slice-8-notif-ui (ProfileScreen 알림 설정 UI + App 포그라운드 배선으로 dueNotifications→presentDue 연결).
