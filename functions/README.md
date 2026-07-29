# Keego Cloud Functions

카카오·네이버 소셜 로그인용 Firebase 커스텀 토큰 발급 (Render 백엔드 대체).

구글·애플 로그인은 Firebase 가 직접 처리하므로 여기 코드가 필요 없다. 카카오·네이버만
서버에서 access token 검증 → 커스텀 토큰 발급이 필요하다.

## 함수
- `api` (HTTP, region `asia-northeast3`)
  - `POST /auth/kakao` — body `{accessToken}` → `{firebaseToken, uid, email, name}`
  - `POST /auth/naver` — body `{refreshToken}` → `{firebaseToken, uid, email, name}`
    (앱은 `accessToken` 도 함께 보내지만 **서버는 쓰지 않는다** — 아래 보안 절)
  - `GET /shop/price?q=` — 러닝화 현재가 조회 프록시(네이버 검색 API)
  - `GET /health` — 배포 확인

배포 후 URL: `https://asia-northeast3-keego-620b8.cloudfunctions.net/api`
앱(`lib/socialConfig.ts` `SOCIAL_BACKEND`)이 이 베이스로 `/api/auth/kakao` 를 호출한다.

## ⚠️ 배포한 뒤엔 반드시 확인한다
```bash
./scripts/verify-backend.sh   # 30초
```
로컬 테스트가 전부 그린이어도 **배포된 서버는 죽어 있을 수 있다**. 실제로 2026-07-28
배포 이후 카카오 로그인이 하루 넘게 503이었는데(키 미주입 + fail-closed) 아무도 몰랐다.
테스트는 내 컴퓨터의 코드를 검사할 뿐 서버를 검사하지 않는다.

## 배포 (사용자가 1회 수행)
1. Firebase **Blaze 요금제** 활성화 (Cloud Functions 필수). 예산 알림 $1 권장.
2. Firebase CLI 로그인: `npx firebase login`
3. 의존성 설치: `cd functions && npm install`
4. 배포: `npx firebase deploy --only functions` (저장소 루트에서)
5. 배포 로그에 출력된 `api` URL 이 위와 같은지 확인.

## 자격 증명
Cloud Functions 안에서는 `admin.initializeApp()` 이 프로젝트 서비스계정을 자동 사용한다
— `FIREBASE_SERVICE_ACCOUNT` 환경변수 불필요(기존 Render 와의 차이).

## 보안 — audience 검증 + rate limit (P0)
토큰 위조/탈취 방지. **배포 전 환경변수 주입 필수**(시크릿 하드코딩 금지):

| 변수 | 의미 | 필수 |
|------|------|------|
| `KAKAO_APP_ID` | 카카오 앱의 **숫자 app_id**(access_token_info 가 돌려주는 값) | **필수** (없으면 카카오 로그인 503) |
| `NAVER_CLIENT_ID` | 네이버 앱 client_id (`lib/socialConfig.ts` 와 같은 값) | **필수** (없으면 네이버 로그인 503) |
| `NAVER_CLIENT_SECRET` | 네이버 앱 client_secret | **필수** (동상) |
| `NAVER_SEARCH_CLIENT_ID` / `_SECRET` | 네이버 **검색** API 키(가격 조회용 — 로그인 키와 별개) | 선택(없으면 가격 칸만 빔) |
| `AUTH_RATE_MAX` | IP당 윈도 최대 요청수(기본 20) | 선택 |
| `AUTH_RATE_WINDOW_MS` | 윈도 길이 ms(기본 60000) | 선택 |

설정 예(Firebase Functions v1 — `.env` 또는 `functions:config`):
```bash
# functions/.env (gitignore 됨 — functions/.gitignore 확인)
KAKAO_APP_ID=123456789
NAVER_CLIENT_ID=xxxxxxxxxxxx
NAVER_CLIENT_SECRET=xxxxxxxxxx
```
- **카카오**: `access_token_info.app_id` 가 `KAKAO_APP_ID` 와 일치할 때만 토큰 수락.
  미설정이면 검증을 건너뛰는 게 아니라 **로그인을 거부한다(503, fail-closed)** — 오설정이
  조용히 '검증 없음'으로 퇴화하면 그 순간부터 누구의 토큰으로든 계정이 열리기 때문.
- **네이버**: 공개 API 에 토큰→앱 introspection 이 없다. 대신 앱이 보낸 **리프레시 토큰**을
  `NAVER_CLIENT_ID/SECRET` 으로 교환하고(`grant_type=refresh_token`), 교환 성공 자체를
  audience 증명으로 쓴다. 신원(`/nid/me`)은 **그 교환으로 새로 받은 토큰**으로만 조회한다 —
  앱이 보낸 accessToken 을 쓰면 "내 리프레시 토큰 + 남의 액세스 토큰" 조합으로 계정 탈취가
  그대로 가능하다. 카카오와 같이 fail-closed(503). 구현·테스트: `functions/naverAuth.js`,
  `__tests__/naverAudience.test.js`.
  - ⚠️ **배포 순서**: 이 함수를 먼저 배포해야 한다. 앱은 구·신 서버 모두와 호환되게
    `accessToken` 과 `refreshToken` 을 함께 보내지만, 새 서버는 `refreshToken` 없는
    옛 앱 빌드의 요청을 400 으로 거부한다.
- 두 엔드포인트 모두 **per-IP rate limit**(기본 60초 20회 초과 시 429).
