# Phase 3 — Firestore 랭킹 배선 완료 (2026-06-21)

WIP 커밋(27a81ea)이 순수·DI provider(`lib/progression/firestoreRanking.ts`)만 넣고
배선/테스트 없이 멈춰 있었다. 이 슬라이스에서 명예의 전당 리더보드를 Render 백엔드에서
Firestore 정본으로 완전히 옮겼다.

## 추가/변경
- `lib/progression/firestoreRankingStore.ts` (신규) — `RankingStore`의 Firestore 구현.
  `leaderboards/{yearMonth}/entries/{uid}` 문서. topByCategory(orderBy desc+limit),
  getEntry(doc), countAbove(where>+getCountFromServer), total(count), publish(setDoc).
  + 합성 `keegoFirestoreRankingProvider` + `publishMyRanking()`(점수 계산→발행, best-effort).
- `lib/firebaseCloudPort.ts` — `getFirebaseUid()` 추가(seam 계약: throw 금지 → null).
- `HallOfFameScreen.rn.tsx` — 기본 provider를 REST(`keegoRankingProvider`)에서
  `keegoFirestoreRankingProvider`로 교체. 마운트 sync는 no-op(발행은 App 동기가 담당).
- `App.tsx` — `runCloudSync` 직후 `publishMyRanking`(merged live 레코드로 점수 계산,
  닉네임/랭크/장착 타이틀은 progression 파생) 논블로킹 호출.
- `jest.setup.js` — firestore 목에 컬렉션 쿼리(collection/query/where/orderBy/limit/
  getDocs/getCountFromServer) 인메모리 에뮬레이션 추가.

## 테스트
- `__tests__/lib/progression/firestoreRanking.test.ts` — 순수 provider(fake store) +
  computeRankingStats + buildStoredEntry. WIP가 남긴 무테스트 코드를 커버.
- `__tests__/lib/progression/firestoreRankingStore.test.ts` — firestore 목 라운드트립
  (publish→정렬/카운트/getEntry), publishMyRanking(로그인/미로그인), 라이브 provider.
- 22개 신규 테스트 통과. tsc clean, eslint 0 errors.

## 비고
- 가짜 경쟁자 금지 계약 유지: 미로그인/쿼리 실패/엔트리 부재 → available:false.
- 점수는 클라이언트가 computeRankingStats로 계산(백엔드 leaderboardService와 동일 의미).
- 후속: Firestore 보안 규칙(자기 uid 문서만 쓰기), category별 인덱스 콘솔 생성, REST
  랭킹 경로(remoteRanking/rankingProvider) 제거는 Phase 5(REST 의존 제거)에서.
- 이 브랜치 기존 레드(design-scan flaky + addShoe onTab 1건)는 본 작업과 무관(HEAD 동일).
