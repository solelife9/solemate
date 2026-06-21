# Keego Firebase 배포 가이드 (Firestore 정본 전환)

> 프로젝트: `keego-620b8` (`.firebaserc`). Phase 2(클라우드 동기)·Phase 3(랭킹)·
> Phase 4(카카오/네이버 커스텀 토큰 Functions)가 Firebase 정본으로 동작한다.
> ⚠️ **사용자 액션**: 배포는 Firebase 로그인이 필요하므로 사람이 직접 수행한다.

## 0. 사전 준비 (1회)
```bash
npm i -g firebase-tools      # 또는 npx firebase-tools 사용
firebase login               # 콘솔 계정으로 로그인(브라우저)
firebase use keego-620b8     # .firebaserc 기본값과 동일
```

## 1. Firestore 보안 규칙 + 인덱스 배포 (Phase 2/3)
레포의 `firestore.rules` / `firestore.indexes.json` 가 정본. `firebase.json` 에 등록됨.
```bash
firebase deploy --only firestore:rules,firestore:indexes
```
규칙 요지:
- `userBackups/{uid}` — 본인(`request.auth.uid == uid`)만 읽기/쓰기.
- `leaderboards/{ym}/entries/{uid}` — 로그인 사용자 전체 읽기, 쓰기는 자기 엔트리만 +
  점수/표시 필드 형태 검증(타인 사칭·깨진 문서 차단). 삭제 금지.
- 그 외 컬렉션 전부 deny.

> **인덱스**: 랭킹 쿼리는 모두 단일 필드(`orderBy(category)` / `where(category,'>',score)`)라
> Firestore 자동 단일 필드 인덱스로 충분 → 복합 인덱스 없음(`indexes: []`). 콘솔에서 "이
> 쿼리에 인덱스가 필요합니다" 링크가 뜨면 그때 추가하고 `firestore.indexes.json` 에 반영.

## 2. Cloud Functions 배포 (Phase 4 — 카카오/네이버 로그인)
```bash
# 카카오/네이버 토큰 검증에 필요한 시크릿(앱 키)을 함수 환경에 설정 후 배포.
firebase deploy --only functions
```
자세한 시크릿/엔드포인트는 `functions/README.md` 참고.

## 3. 배포 후 검증
- 앱 로그인 → 명예의 전당 진입 → 내 엔트리/리더보드 로드(가짜 경쟁자 없이 available 동작).
- 신발/런 변경 → 잠시 후(디바운스 1.2s) 동기 → 재설치/기기변경 시 데이터 복원.
- 보안: 콘솔 Rules Playground 로 `userBackups/{타인uid}` 쓰기 거부, 자기 엔트리 쓰기 허용 확인.

## 4. 주의
- 규칙만으로 점수 위조를 100% 막지는 못한다(점수는 클라이언트 계산). 엄격 검증이 필요하면
  서버측 재계산 Cloud Function 을 후속으로(현재는 형태 검증 + 본인 문서 제한까지).
- Render 백엔드(REST) 랭킹/동기 경로 제거는 Phase 5(REST 의존 제거)에서 진행.
