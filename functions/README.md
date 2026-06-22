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

## 보안 — audience 검증 + rate limit (P0)
토큰 위조/탈취 방지. **배포 전 환경변수 주입 필수**(시크릿 하드코딩 금지):

| 변수 | 의미 | 필수 |
|------|------|------|
| `KAKAO_APP_ID` | 카카오 앱의 **숫자 app_id**(access_token_info 가 돌려주는 값). 설정 시, 다른 앱에서 발급된 카카오 토큰을 401 로 거부 | 강력 권장 |
| `NAVER_CLIENT_ID` | (후속) 네이버 code-교환용 client_id | 선택 |
| `AUTH_RATE_MAX` | IP당 윈도 최대 요청수(기본 20) | 선택 |
| `AUTH_RATE_WINDOW_MS` | 윈도 길이 ms(기본 60000) | 선택 |

설정 예(Firebase Functions v1 — `.env` 또는 `functions:config`):
```bash
# functions/.env (gitignore 됨 — functions/.gitignore 확인)
KAKAO_APP_ID=123456789
```
- **카카오**: `access_token_info.app_id` 가 `KAKAO_APP_ID` 와 일치할 때만 토큰 수락(audience 검증).
  `KAKAO_APP_ID` 미설정 시 검증은 건너뛰되(하위호환), 출시 전 반드시 설정할 것.
- **네이버**: 공개 API 에 토큰→앱 introspection 이 없어 audience 직접 검증 불가. 진짜 바인딩은
  클라가 accessToken 대신 *인가 code* 를 보내고 서버가 `NAVER_CLIENT_ID/SECRET` 으로 교환하는
  방식이 필요(후속 작업). 현재는 토큰 유효성 + per-IP rate limit 으로 남용 제한.
- 두 엔드포인트 모두 **per-IP rate limit**(기본 60초 20회 초과 시 429).
