# Slice 5 — ProfileScreen 계정·클라우드 동기 UI (done)

날짜: 2026-06-03

## 한 일
ProfileScreen 에 "계정 · 클라우드" 섹션을 추가하고 CloudPort/cloudSync 와 배선했다.
기존 설정/로컬 백업 행과 같은 위계(card + settingRow)·토큰(#000/#FF6500, Pretendard)으로 구성.

- **로그아웃 상태**: 안내 카피 + `Google로 계속`·`Apple로 계속` 버튼(orange/CARD_HI).
- **로그인 상태**: 이메일/계정 행(person-circle + cloud-done), `지금 동기` 행(마지막 동기 시각 detail),
  `로그아웃` 행(DANGER).
- **지금 동기**: `port.pull()` → `cloudSync.mergeCloudData(local, remote)` → `port.push(merged)` →
  `onCloudMerged(merged)`. 양방향 무손실 병합이라 백업·복원을 한 행으로 끝낸다(수동 버튼 우선).
- 인증 전이는 `cloudSync.nextAuthState` 상태머신으로만(임의 상태 깨짐 방지). error→재시도는 signedOut 경유.

## 배선
- `lib/cloudPort.ts`: `CloudProvider` 에 `'apple'` 추가, `CloudUser` 에 옵셔널 `email`/`displayName`(표시용).
- `lib/firebaseCloudPort.ts`: apple 자격증명 리졸버(`resolveAppleCredential`) 추가, `toCloudUser` 로
  email/displayName 채움. google 과 대칭.
- `App.tsx`: `createFirebaseCloudPort()` 1회 생성(useRef), `applyBackupPayload` 로 병합 결과를 상태/영속
  반영(importBackup 과 공유 — 로컬 가져오기와 동일 경로). ProfileScreen 에 `cloudPort`/`onCloudMerged` 주입.

## 테스트(목 포트/props 주입, 백엔드 0)
`__tests__/ProfileScreen.cloud.test.tsx` — 7 케이스:
로그인 버튼 노출, signIn(google/apple) 호출+signedIn 반영, 로그인 실패 시 버튼 유지+에러,
동기 pull→merge→push 순서·무손실 병합(로컬+원격 id 모두 보존)·onCloudMerged·마지막 동기 갱신,
원격 null 시 로컬 유실 0, 로그아웃 반영.

## 게이트 (iron law)
- `tsc --noEmit` 0
- `eslint --quiet` 0 errors (사전 존재 warning 만)
- `jest` 73 suites / 650 tests green (신규 7 포함)
- 데이터 파괴 0(병합 무손실, 설정은 changeX 정상 경로), 시크릿 0.

## 미결
- 실 Google/Apple 로그인은 OAuth 자격증명 리졸버 미주입 상태(SHA-1/네이티브 대기). 리졸버 없으면
  포트가 명확한 에러로 거부 → 화면은 에러 안내로 정직하게 표시. 리졸버 주입만 하면 즉시 동작.
