# 카카오 · 네이버 로그인 셋업 가이드 (Keego)

앱 측 아키텍처는 완료됨(`CloudProvider`에 `kakao`/`naver` + `signInWithCustomToken` 경로, 커밋 7877607).
실제 로그인이 되려면 아래 **콘솔 등록(사용자)** + **백엔드 엔드포인트(onrender)** 두 가지를 채우면 됩니다.
그 후 앱에 네이티브 SDK + 버튼을 붙이면 끝(에이전트가 진행).

핵심 흐름:
```
앱: 카카오/네이버 네이티브 SDK 로그인 → accessToken
앱 → 백엔드 POST /api/auth/kakao { accessToken }
백엔드: 카카오 API로 토큰 검증(사용자 id 확인) → firebase-admin.createCustomToken(uid) → { firebaseToken }
앱: signInWithCustomToken(firebaseToken) → 기존 Firestore 동기 그대로 사용
```

---

## 1) 카카오 디벨로퍼스 (developers.kakao.com)
1. 내 애플리케이션 → 애플리케이션 추가하기
2. **앱 키** 확인: `네이티브 앱 키`(앱 SDK용), `REST API 키`(백엔드 검증용)
3. 플랫폼 → Android 등록:
   - 패키지명: `com.solemate`
   - **키 해시**: `Xo8WBi6jzSxKDVR4drqm84yr9iU=`  ← (debug.keystore 기준, release도 동일 키 서명)
4. 카카오 로그인 → 활성화 ON, 동의항목에서 닉네임 등 설정(이메일은 검수 필요)
5. (필요시) Redirect URI는 네이티브 SDK 로그인엔 불필요

## 2) 네이버 개발자센터 (developers.naver.com)
1. 애플리케이션 등록 → **Client ID / Client Secret** 발급
2. 사용 API: 네이버 로그인
3. 환경: Android 추가 → 패키지명 `com.solemate`, 다운로드(앱) 정보 입력
4. 서비스 URL 등 필수 항목 기입

## 3) 백엔드(onrender solelife-backend)에 추가 — Node/Express 가정

### (a) 의존성 + 서비스 계정
```bash
npm i firebase-admin
```
- Firebase 콘솔(keego-620b8) → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → JSON 다운로드
- onrender 환경변수에 `FIREBASE_SERVICE_ACCOUNT`(JSON 문자열 통째로) 저장 (레포에 커밋 금지!)

### (b) firebase-admin 초기화 (한 번만)
```js
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}
```

### (c) 카카오 엔드포인트
```js
// POST /api/auth/kakao  body: { accessToken }
app.post('/api/auth/kakao', async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) return res.status(400).json({ error: 'accessToken required' });
    // 카카오 액세스 토큰으로 사용자 정보 조회 → 검증
    const r = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return res.status(401).json({ error: 'invalid kakao token' });
    const me = await r.json();              // { id, kakao_account, ... }
    const uid = `kakao:${me.id}`;           // Firebase uid (제공자 prefix로 충돌 방지)
    const email = me.kakao_account?.email || null;
    const firebaseToken = await admin.auth().createCustomToken(uid, { provider: 'kakao', email });
    res.json({ firebaseToken });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
```

### (d) 네이버 엔드포인트
```js
// POST /api/auth/naver  body: { accessToken }
app.post('/api/auth/naver', async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) return res.status(400).json({ error: 'accessToken required' });
    const r = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return res.status(401).json({ error: 'invalid naver token' });
    const body = await r.json();            // { resultcode, response: { id, email, ... } }
    if (body.resultcode !== '00') return res.status(401).json({ error: 'naver verify failed' });
    const uid = `naver:${body.response.id}`;
    const email = body.response.email || null;
    const firebaseToken = await admin.auth().createCustomToken(uid, { provider: 'naver', email });
    res.json({ firebaseToken });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
```

> uid에 `kakao:`/`naver:` prefix를 둬 같은 이메일이라도 제공자별로 별도 계정이 된다(데이터 격리).
> 추후 계정 통합이 필요하면 이메일 기준 매핑 테이블로 발전 가능.

## 4) 앱 측 남은 작업 (에이전트, 위 1~3 완료 후)
- `@react-native-seoul/kakao-login`, `@react-native-seoul/naver-login` 네이티브 통합(빌드 동반)
- `lib/kakaoAuth.ts` / `lib/naverAuth.ts`: 네이티브 로그인 → accessToken → 백엔드 → firebaseToken 리졸버
- `App.tsx`: `createFirebaseCloudPort({ resolveKakaoToken, resolveNaverToken, ... })` 주입
- ProfileScreen 계정·클라우드에 **카카오로 계속**(노랑)·**네이버로 계속**(초록) 버튼

## 체크리스트
- [ ] 카카오 콘솔: 앱 생성 + Android(패키지 `com.solemate`, 키해시 `Xo8WBi6jzSxKDVR4drqm84yr9iU=`) + 로그인 활성화
- [ ] 네이버 콘솔: 앱 등록 + Android 패키지 `com.solemate`
- [ ] 백엔드: firebase-admin + 서비스계정 환경변수 + /api/auth/kakao, /api/auth/naver 추가·배포
- [ ] (앱) 네이티브 SDK + 버튼 통합 ← 위 셋 완료되면 에이전트가 진행
