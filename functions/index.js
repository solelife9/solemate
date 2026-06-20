// ============================================================================
// functions/index.js — Keego 소셜 로그인 Cloud Functions (Render 백엔드 대체)
// ============================================================================
// 카카오·네이버는 Firebase 기본 제공 제공자가 아니므로, 앱이 네이티브 SDK로 받은
// access token 을 서버에서 검증하고 firebase-admin 으로 Firebase 커스텀 토큰을 발급해야
// 한다(서명 키는 클라이언트에 둘 수 없다). 앱은 그 토큰으로 signInWithCustomToken 하여
// Firestore 동기를 그대로 쓴다.
//
// Cloud Functions 안에서는 admin.initializeApp() 이 프로젝트의 서비스계정 자격을 자동
// 사용하므로 FIREBASE_SERVICE_ACCOUNT 환경변수가 필요 없다(기존 Render 와의 차이).
//
// 함수 이름이 `api` 라 URL 은 https://<region>-<project>.cloudfunctions.net/api 이고,
// express 가 그 뒤 경로(/auth/kakao, /auth/naver)를 처리한다 — 클라이언트의
// `${SOCIAL_BACKEND}/api/auth/kakao` 호출과 정확히 맞물린다.
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

function mintCustomToken(uid, claims) {
  return admin.auth().createCustomToken(uid, claims);
}

// 카카오: access token 으로 사용자 조회 → 커스텀 토큰 발급. uid 는 'kakao:<회원번호>'.
app.post('/auth/kakao', async (req, res) => {
  try {
    const {accessToken} = req.body || {};
    if (!accessToken) return res.status(400).json({error: 'accessToken 필요'});
    const r = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    if (!r.ok) return res.status(401).json({error: '카카오 토큰 검증 실패'});
    const me = await r.json();
    if (!me || me.id == null) return res.status(401).json({error: '카카오 사용자 정보 없음'});
    const uid = `kakao:${me.id}`;
    const email = (me.kakao_account && me.kakao_account.email) || null;
    const name = (me.kakao_account && me.kakao_account.profile && me.kakao_account.profile.nickname) || null;
    const firebaseToken = await mintCustomToken(uid, {provider: 'kakao', email, name});
    res.json({firebaseToken, uid, email, name});
  } catch (e) {
    res.status(500).json({error: String((e && e.message) || e)});
  }
});

// 네이버: access token 으로 사용자 조회 → 커스텀 토큰 발급. uid 는 'naver:<고유 id>'.
app.post('/auth/naver', async (req, res) => {
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

// 헬스체크(배포 확인용).
app.get('/health', (_req, res) => res.json({ok: true}));

exports.api = functions.region('asia-northeast3').https.onRequest(app);
