# Keego Cloud Functions

카카오·네이버 소셜 로그인용 Firebase 커스텀 토큰 발급 (Render 백엔드 대체).

구글·애플 로그인은 Firebase 가 직접 처리하므로 여기 코드가 필요 없다. 카카오·네이버만
서버에서 access token 검증 → 커스텀 토큰 발급이 필요하다.

## 함수
- `api` (HTTP, region `asia-northeast3`)
  - `POST /auth/kakao` — body `{accessToken}` → `{firebaseToken, uid, email, name}`
  - `POST /auth/naver` — body `{accessToken}` → `{firebaseToken, uid, email, name}`
  - `GET /health` — 배포 확인

배포 후 URL: `https://asia-northeast3-keego-620b8.cloudfunctions.net/api`
앱(`lib/socialConfig.ts` `SOCIAL_BACKEND`)이 이 베이스로 `/api/auth/kakao` 를 호출한다.

## 배포 (사용자가 1회 수행)
1. Firebase **Blaze 요금제** 활성화 (Cloud Functions 필수). 예산 알림 $1 권장.
2. Firebase CLI 로그인: `npx firebase login`
3. 의존성 설치: `cd functions && npm install`
4. 배포: `npx firebase deploy --only functions` (저장소 루트에서)
5. 배포 로그에 출력된 `api` URL 이 위와 같은지 확인.

## 자격 증명
Cloud Functions 안에서는 `admin.initializeApp()` 이 프로젝트 서비스계정을 자동 사용한다
— `FIREBASE_SERVICE_ACCOUNT` 환경변수 불필요(기존 Render 와의 차이).
