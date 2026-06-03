# Slice 5 — 실 Google 네이티브 로그인 활성화 (2026-06-03)

## 호환성 확인 (착수 즉시)
- `@react-native-google-signin/google-signin@16.1.2` (최신). peerDeps 느슨함
  (`react: *`, `react-native: *`, `expo: >=52`). RN 0.85.3 / React 19.2.3 / Expo SDK 56
  와 충돌 없음. `--legacy-peer-deps` 로 설치(일관).
- autolink 정상: `npx react-native config` → exit 0, android packageImportPath
  `com.reactnativegooglesignin.RNGoogleSigninPackage`. react-native.config.js 무수정
  (이전 forceStaticLinking 교훈 — 무효 키 0). **깨진 네이티브 커밋 아님.**
- 주의: v16 은 `webClientId: 'autoDetect'` 미지원(타입/네이티브 모두). webClientId 는
  네이티브에서 `requestIdToken` 으로 직통. → 아래 generated 소스 방식 채택.

## 구현
1. `lib/googleAuth.ts` — `resolveGoogleCredential()`:
   configure(멱등) → `hasPlayServices()` → `signIn()` → idToken →
   `GoogleAuthProvider.credential(idToken)`. 실패는 정직한 한국어 에러
   (PlayServices 없음 / 취소(`{type:'cancelled'}` 및 SIGN_IN_CANCELLED) / idToken 없음).
2. `lib/googleWebClientId.ts` + `lib/googleWebClientId.generated.ts` +
   `scripts/gen-google-web-client-id.js` — webClientId(=R.string.default_web_client_id)
   를 평문 하드코딩 없이 google-services.json 의 oauth_client(client_type==3) 에서
   취득. **현재 웹 클라이언트 미등록(SHA-1 미등록)** → 빈 값 → Google 로그인 정직히 비활성.
   생성 스크립트는 실제 값이 채워지면 git skip-worktree 로 표시(시크릿 0).
3. `App.tsx` — `createFirebaseCloudPort({resolveGoogleCredential})` 주입. ProfileScreen
   'Google로 계속' 버튼이 실제 네이티브 로그인 경로를 탄다(미주입/실패 시 기존 정직한 에러).
4. `jest.setup.js` — `@react-native-google-signin` 메모리 목 + firebase auth 의
   `GoogleAuthProvider.credential` 목 추가.
5. `__tests__/googleSignin.test.tsx` — 행동 테스트 7개:
   리졸버 성공/멱등/PlayServices없음/취소/토큰없음 + ProfileScreen 통합(press→signIn→
   idToken→signInWithCredential→signedIn, PlayServices 없음 시 에러 안내·버튼 유지).

## 검증 (전부 green)
- `npx tsc --noEmit` → 0
- `npx eslint .` → 0 errors (기존 warning만)
- `npx jest` → 74 suites / 657 tests pass
- `npx react-native config` → exit 0 (Metro 무결성)
- 데이터/시크릿 0: generated id 빈 값, 평문 oauth id/secret 0.

## 후속(사용자 실기기)
실 Google 로그인→Firestore 동기는 SHA-1 등록 + google-services.json 갱신 후
`node scripts/gen-google-web-client-id.js` 실행으로 webClientId 채워야 동작.
Apple 로그인은 iOS 영역으로 범위 밖.
