# Slice 8 순수로직 notif-logic recap-logic eval pass

type: journal
source_job: 45f8a457-46bb-43de-9903-c5e79c5ac39b
job_name: 알림 결정 로직 (lib/notifications) + 설정 IO
created: 2026-06-08T23:23:52.483Z

## Findings

- **slice**: Slice 8 (리텐션) — 순수 lib 2잡 완료·전 critic green
- **slice-8-notif-logic**: lib/notifications.ts (dueNotifications: shoe_replacement/weekly_goal/run_reminder, 토글 게이팅, 안정 key 중복방지) + NotifSettings/get/setNotifSettings(신규 notif_settings 키, 기존 AlertSettings/K_ALERTS 불변). 30테스트 98.59% 커버리지. 커밋 e968045. code/test/playwright 전부 PASS.
- **slice-8-recap-logic**: lib/recap.ts (weeklyRecap/monthlyRecap→Recap, stats/goals/wearModel/format 재사용, now opts 주입, A8-5 graceful round1, A8-1 원본 불변). 15테스트 100% lines. 커밋 dea0233. code/test/playwright 전부 PASS.
- **non_blocking_test_findings**: notif: title 필드 미단언·run_reminder TZ-brittle 경계·weekly 요일 경계(목/토/일) 미핀. recap: avgPaceLabel/fastest5k 값 미고정·기간 상한 경계 미검증. 전부 passed:true(비차단 강화 제안).
- **verification**: 전체 스위트 802/802 pass, tsc/lint green.
- **next**: slice-8-fcm-native (네이티브 — @react-native-firebase/messaging 통합, 가드레일: 빌드 깨지면 되돌려 보고, 오케스트레이터 gradle 검증 + 실기기 푸시는 사용자).
- **push**: 사용자 요청으로 안전 커밋 origin/main 푸시 예정(회사에서 이어서 작업).
