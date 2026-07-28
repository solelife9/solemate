// ============================================================================
// functions/index.js — Keego 소셜 로그인 Cloud Functions (Render 백엔드 대체)
// ============================================================================
// 카카오·네이버는 Firebase 기본 제공 제공자가 아니므로, 앱이 네이티브 SDK로 받은
// access token 을 서버에서 검증하고 firebase-admin 으로 Firebase 커스텀 토큰을 발급해야
// 한다(서명 키는 클라이언트에 둘 수 없다). 앱은 그 토큰으로 signInWithCustomToken 하여
// Firestore 동기를 그대로 쓴다.
//
// 보안(audience 검증) — 토큰 위조/탈취 방지:
//   · 카카오: access_token_info 의 app_id 가 우리 앱(KAKAO_APP_ID)과 일치하는지 확인한다.
//     이 검증이 없으면 *다른 앱*에서 발급된 유효한 카카오 토큰으로도 우리 사용자 계정을
//     만들 수 있다(임의 계정 탈취). 불일치 시 401.
//     ⚠️ fail-closed: KAKAO_APP_ID 가 주입되지 않은 배포에서는 검증을 건너뛰지 않고
//     로그인 자체를 거부한다(503). 설정 누락이 조용히 '검증 없음'으로 퇴화하면
//     그 순간부터 누구의 카카오 토큰으로든 계정을 열 수 있기 때문이다.
//   · 네이버: 공개 API 에 토큰→발급앱(client_id) introspection 이 없다. 진짜 audience
//     바인딩은 서버측 OAuth code 교환(NAVER_CLIENT_ID/SECRET)이 필요 — 후속(아래 NOTE).
//     지금은 토큰 유효성 + rate limit 으로 남용을 제한한다.
//   · 두 엔드포인트 모두 per-IP rate limit(무차별 토큰 시도 차단).
//
// 환경변수(배포 시 주입 — 코드에 시크릿 하드코딩 금지):
//   KAKAO_APP_ID            카카오 앱의 *숫자* app_id(access_token_info 가 돌려주는 값).
//   NAVER_CLIENT_ID         (후속 code-교환용) 네이버 앱 client_id.
//   AUTH_RATE_MAX           IP당 윈도 내 최대 요청수(기본 20).
//   AUTH_RATE_WINDOW_MS     윈도 길이 ms(기본 60000).
//
// region: asia-northeast3(서울) — 한국 사용자 지연 최소화.
// ============================================================================
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const express = require('express');

if (!admin.apps.length) {
  admin.initializeApp();
}

const app = express();
app.use(express.json());
app.set('trust proxy', true); // Cloud Functions 앞단 프록시 — req.ip 가 실제 클라 IP 가 되게

// ── per-IP rate limit (인메모리 슬라이딩 윈도) ───────────────────────────────────
// Cloud Functions 는 무상태/다인스턴스라 인메모리 제한은 인스턴스 단위(완벽한 전역 제한은
// 아님)지만, 토큰 무차별 시도를 의미 있게 늦춘다. 외부 스토어(Firestore/Redis) 없이 가볍게.
const RATE_MAX = Number(process.env.AUTH_RATE_MAX) || 20;
const RATE_WINDOW_MS = Number(process.env.AUTH_RATE_WINDOW_MS) || 60_000;
const hits = new Map(); // ip → number[] (요청 타임스탬프)
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  // 메모리 누수 방지: 가끔 오래된 IP 정리.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) hits.delete(k);
    }
  }
  return arr.length > RATE_MAX;
}
function rateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({error: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'});
  }
  next();
}

function mintCustomToken(uid, claims) {
  return admin.auth().createCustomToken(uid, claims);
}

// 카카오: access token → (1) app_id audience 검증 (2) 사용자 조회 → 커스텀 토큰. uid='kakao:<회원번호>'.
app.post('/auth/kakao', rateLimit, async (req, res) => {
  try {
    const {accessToken} = req.body || {};
    if (!accessToken) return res.status(400).json({error: 'accessToken 필요'});

    // (1) audience 검증: 이 토큰이 *우리 앱*에서 발급됐는지 app_id 로 확인.
    // 설정이 없으면 검증 불가 → 통과가 아니라 거부(fail-closed). 카카오 API 를 부르기
    // 전에 끊어 오설정 배포가 조용히 계정을 열어주는 창을 아예 만들지 않는다.
    const expectedAppId = process.env.KAKAO_APP_ID;
    if (!expectedAppId) {
      console.error('[auth/kakao] KAKAO_APP_ID 미설정 — audience 검증 불가로 로그인 거부');
      return res.status(503).json({error: '카카오 로그인이 일시적으로 불가능해요. 다른 방법으로 로그인해 주세요.'});
    }
    const infoRes = await fetch('https://kapi.kakao.com/v1/user/access_token_info', {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    if (!infoRes.ok) return res.status(401).json({error: '카카오 토큰 검증 실패'});
    const info = await infoRes.json();
    if (info == null || info.id == null) return res.status(401).json({error: '카카오 토큰 정보 없음'});
    if (String(info.app_id) !== String(expectedAppId)) {
      // 다른 앱에서 발급된 토큰 — 계정 탈취 시도로 보고 거부.
      return res.status(401).json({error: '허용되지 않은 카카오 앱 토큰입니다.'});
    }

    // (2) 프로필 조회(이메일/닉네임). id 는 access_token_info 의 값을 정본으로 쓴다.
    const r = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    if (!r.ok) return res.status(401).json({error: '카카오 사용자 정보 조회 실패'});
    const me = await r.json();
    const uid = `kakao:${info.id}`;
    const email = (me && me.kakao_account && me.kakao_account.email) || null;
    const name = (me && me.kakao_account && me.kakao_account.profile && me.kakao_account.profile.nickname) || null;
    const firebaseToken = await mintCustomToken(uid, {provider: 'kakao', email, name});
    res.json({firebaseToken, uid, email, name});
  } catch (e) {
    res.status(500).json({error: String((e && e.message) || e)});
  }
});

// 네이버: access token 으로 사용자 조회 → 커스텀 토큰. uid='naver:<고유 id>'.
// NOTE(보안 후속): 네이버 공개 API 에는 토큰→client_id introspection 이 없어 audience 를
// 직접 검증할 수 없다. 진짜 바인딩은 클라이언트가 accessToken 대신 *인가 code* 를 보내고
// 서버가 NAVER_CLIENT_ID/SECRET 으로 code↔token 교환하는 방식이 필요하다(클라+서버 변경).
// 현재는 토큰 유효성 + rate limit 으로 남용을 제한한다.
app.post('/auth/naver', rateLimit, async (req, res) => {
  try {
    const {accessToken} = req.body || {};
    if (!accessToken) return res.status(400).json({error: 'accessToken 필요'});
    const r = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    if (!r.ok) return res.status(401).json({error: '네이버 토큰 검증 실패'});
    const body = await r.json();
    if (!body || body.resultcode !== '00' || !body.response || body.response.id == null) {
      return res.status(401).json({error: '네이버 사용자 정보 없음'});
    }
    const uid = `naver:${body.response.id}`;
    const email = body.response.email || null;
    const name = body.response.nickname || body.response.name || null;
    const firebaseToken = await mintCustomToken(uid, {provider: 'naver', email, name});
    res.json({firebaseToken, uid, email, name});
  } catch (e) {
    res.status(500).json({error: String((e && e.message) || e)});
  }
});

// ── 러닝화 현재가 조회 프록시 ──────────────────────────────────────────────────
// 앱이 네이버 검색 API 를 직접 부르면 클라이언트 번들에 API 시크릿이 실린다(공개 레포).
// 그래서 서버가 대신 부르고 결과만 전달한다. 정가를 DB에 박지 않고 조회 시점 가격을
// 쓰는 설계라(유지보수 부채 0 + 사용자가 실제로 낼 금액), 이 엔드포인트가 그 통로다.
//
// 공식 스토어 필터링은 **클라이언트**(lib/shoePrice.pickOfficialQuote)가 한다 — 판정
// 규칙이 앱의 신뢰 정책(lib/shoeStore)과 한 파일에 있어야 어긋나지 않기 때문이다.
// 서버는 그대로 전달만 한다.
//
// 환경변수: NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET
//   (소셜 로그인용 NAVER_CLIENT_ID 와 별개 — 검색 API 는 개발자센터 애플리케이션 키다.)
app.get('/shop/price', rateLimit, async (req, res) => {
  try {
    const q = String((req.query && req.query.q) || '').trim();
    if (!q) return res.status(400).json({error: '검색어 필요'});
    if (q.length > 100) return res.status(400).json({error: '검색어가 너무 길어요'});

    // 키가 없으면 조용히 '가격 없음'으로 답한다(503). 로그인처럼 계정 위험이 있는
    // 경로가 아니라 표시용 부가 정보라, 앱은 이 응답을 받으면 가격 칸만 비운다.
    const id = process.env.NAVER_SEARCH_CLIENT_ID;
    const secret = process.env.NAVER_SEARCH_CLIENT_SECRET;
    if (!id || !secret) {
      return res.status(503).json({error: '가격 조회가 아직 설정되지 않았어요.', items: []});
    }

    // sort=asc(최저가순)는 **양말·깔창 같은 액세서리를 맨 위로 끌어올린다**(실측:
    // '호카 클리프톤 10' 최저가 20,300원 = 같은 이름의 러닝 삭스). 정확도순(sim)으로
    // 받고 질의에 '러닝화'를 덧붙여 상품군을 좁힌다. 최종 판정은 클라이언트가
    // category4='러닝화' 로 한 번 더 거른다.
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(q + ' 러닝화')}&display=50&sort=sim`;
    const r = await fetch(url, {
      headers: {'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret},
    });
    if (!r.ok) return res.status(502).json({error: '가격 조회 실패', items: []});
    const body = await r.json();
    const items = Array.isArray(body && body.items) ? body.items : [];
    // 앱이 쓰는 필드만 추려 전달한다(응답 크기 + 불필요한 개인화 필드 전파 방지).
    res.json({
      items: items.map((it) => ({
        title: it.title,
        lprice: it.lprice,
        mallName: it.mallName,
        link: it.link,
        brand: it.brand,
        maker: it.maker,
        // 상품군 판정용 — 클라이언트가 '러닝화'가 아닌 건 버린다(액세서리 오염 차단).
        category3: it.category3,
        category4: it.category4,
      })),
    });
  } catch (e) {
    res.status(500).json({error: String((e && e.message) || e), items: []});
  }
});

// 헬스체크(배포 확인용).
app.get('/health', (_req, res) => res.json({ok: true}));

// 테스트에서 express 앱을 직접 구동할 수 있게 노출(슈퍼테스트 등).
exports._app = app;
exports._resetRateLimit = () => hits.clear();
exports.api = functions.region('asia-northeast3').https.onRequest(app);
