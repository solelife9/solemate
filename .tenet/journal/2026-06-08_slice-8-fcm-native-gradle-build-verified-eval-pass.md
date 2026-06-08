# Slice 8 fcm-native gradle build verified eval pass

type: journal
source_job: c74d2acb-f1fe-41e6-bd07-426201a8b452
job_name: @react-native-firebase/messaging 네이티브 통합 + 권한 + 래퍼
created: 2026-06-08T23:36:56.348Z

## Findings

- **job**: slice-8-fcm-native (네이티브 FCM) — 완료·게이트 green
- **integration**: @react-native-firebase/messaging ^24.0.0 추가(기존 app/auth/firestore 24.0.0·RN 0.85.3 호환, --legacy-peer-deps). AndroidManifest POST_NOTIFICATIONS, FCM <service>는 autolink 자동머지. lib/pushMessaging.ts 래퍼(requestPushPermission graceful·getPushToken null폴백·registerForegroundMessageHandler·presentDue[주입presenter·기본 Alert]·initPushMessaging). notifee 미추가(네이티브 최소). jest.setup messaging 모킹. 15테스트. 커밋 be125eb.
- **ORCHESTRATOR_GRADLE_VERIFY**: 가드레일 준수 — 오케스트레이터가 emulator-5554에서 JAVA_HOME=Android Studio jbr 로 `gradlew :app:assembleDebug` 실행 → **BUILD SUCCESSFUL in 1m 31s**, app-debug.apk 186MB 생성. messaging 추가 후 네이티브 빌드 무결성 확인(eval 게이트가 못 잡는 부분). 되돌림 불필요.
- **eval**: test_critic PASS, playwright PASS(library, layer2 n/a), code_critic completed(job_wait 확인, DAG 전진으로 통과 확정 — job_result는 id 조회 이상으로 미반환). 전체 817/817 pass, tsc/lint green, 시크릿0.
- **user_checkpoint_scope**: 실기기 FCM 실제 푸시 수신·OS 타이머 정밀 스케줄은 회사에서 사용자 검증(범위 밖).
- **next**: slice-8-notif-ui (ProfileScreen 설정 UI + App 포그라운드 dueNotifications→presentDue 배선).
