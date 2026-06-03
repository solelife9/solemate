# slice-5-fb-ui done, ProfileScreen cloud UI green

type: journal
source_job: e0a6d31a-9f74-4cee-b4f0-a712a431b7c4
job_name: 로그인/클라우드 동기 UI (ProfileScreen)
created: 2026-06-03T00:58:39.927Z

## Findings

- **job**: slice-5-fb-ui
- **commit**: 66878fcc0e7e9499f84e413a3c12fb80da16ea9f
- **result**: ProfileScreen 계정·클라우드 동기 섹션(Google/Apple 로그인·이메일 표시·지금동기·로그아웃). 지금동기=pull→mergeCloudData→push 무손실, onCloudMerged→App.applyBackupPayload(로컬 import와 동일 비파괴 경로). nextAuthState 상태머신만 경유. cloudPort/firebaseCloudPort apple+email/displayName 추가.
- **eval**: code_critic pass(결함0), test_critic pass(비차단 1: 동기 실패 경로 미테스트), playwright_eval pass(surface none, layer2 N/A). tsc 0·eslint 0·jest 73 suites/650 green(신규 ProfileScreen.cloud 7).
- **verify_note**: 테스트는 목 포트만 주입, 실 cloudSync.mergeCloudData·nextAuthState 언목 실행(L1+R1 병합 단언으로 증명). 실 Google/Apple 로그인은 OAuth 리졸버 미주입(SHA-1 대기) — 리졸버 없으면 포트가 명확한 에러로 거부, 화면은 정직한 에러 안내.
- **next**: slice-5-fb-e2e(report-only) — @slice-1~5 수용·skip 0·마이그레이션 무손실·기존 키 보존 검증. 그 다음 Firebase use-checkpoint(사용자 실기기 실로그인·Firestore + Google용 SHA-1).
