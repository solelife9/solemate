# Phase 5b · Stage 0 — REST→Firestore 일회성 이관 (2026-06-21)

Phase 5b 의 데이터 유실 가드(R1). 이후 Stage 3 가 REST 부팅을 제거해도 안전하려면,
그 전에 "REST 에만 있던 데이터가 Firestore 정본에도 반드시 존재"함을 보장해야 한다.

## 추가
- `lib/restToFirestoreMigration.ts` (신규) — 순수 결정(`isEmptyPayload`/`decideRestSeed`)
  + 주입형 오케스트레이션(`migrateRestToFirestore`). 계약:
  - Firestore(pull)가 비었고 REST(loadRest)에 데이터 → 1회 시드(push) + 완료 플래그.
  - Firestore 가 이미 데이터 → 비파괴(시드 안 함) + 완료 표시.
  - REST 도달 불가(null) → 플래그 미set(다음 부팅 재시도). REST 도 빈 신규 → 완료.
  - 어느 분기든 throw 금지(비차단). 전환용 코드(Render 은퇴 시 함께 제거).
- App.tsx — authUser 로그인 후 세션 1회 effect(영속 플래그로 다음 세션도 멱등). 로컬
  상태는 건드리지 않고 Firestore 시드만(initUser 가 이미 REST 로 로컬을 채움). `cloudEnabled`
  게이트 — 테스트 기본 우회(기존 App 스위트 무영향).

## 테스트
- `__tests__/lib/restToFirestoreMigration.test.ts` — 순수 + 6개 분기(already-done/
  firestore-has-data/rest-unreachable/no-rest-data/seeded/push-error). 11건 통과.

## 검증
- tsc clean, eslint 0 errors. cloud/boot 스위트는 baseline(clean HEAD)과 **동일**
  (App.coldstart 3·App.bootcache 4 fail 은 이 브랜치 pre-existing, Stage 0 무관 — alone
  실행으로 baseline 동일 확인). 전체 실패 수 47 은 기존 flaky 밴드(46~50) 내, total 은
  +11(신규 테스트). 신규 결정적 실패 0.

## 다음
- Stage 1 — 클라이언트 id 생성 seam(런 localId 승격 + 신발 신규 id), REST 병행(위험 0).
