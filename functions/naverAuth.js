// ============================================================================
// functions/naverAuth.js — 네이버 액세스 토큰의 audience 바인딩 검증
// ============================================================================
// 문제: 네이버 공개 API 에는 "이 액세스 토큰이 어느 앱(client_id)에서 발급됐는가"를
// 되묻는 introspection 이 없다(공개 로그인 API 는 authorize / token / nid.me 셋뿐).
// 그래서 액세스 토큰만 받아 /nid/me 로 신원을 조회하면, *다른 앱*에서 발급된 유효한
// 네이버 토큰으로도 그 사용자의 Keego 계정을 열 수 있다(임의 계정 탈취).
//
// 해법: 액세스 토큰 대신 **리프레시 토큰**을 받아 우리 client_id/secret 으로 교환한다.
// 교환(grant_type=refresh_token)은 그 토큰이 *우리 앱*에 발급된 것일 때만 성공하므로,
// 성공 자체가 audience 증명이다.
//
// ⚠️ 그리고 신원은 **교환으로 새로 받은 액세스 토큰**으로만 조회한다. 클라이언트가 보낸
// 액세스 토큰을 쓰면 검증이 무의미해진다 — 공격자가 (자기 리프레시 토큰 = audience 통과)
// + (피해자의 남의 앱 액세스 토큰 = 신원 조회)를 짝지어 보내면 그대로 탈취되기 때문이다.
// 두 값은 반드시 같은 출처여야 하고, 그걸 보장하는 유일한 방법이 '우리가 받아낸 토큰만
// 쓰는 것'이다.
//
// 이 모듈은 firebase 의존이 없는 순수 함수다(fetch 를 주입받아 테스트 가능).
// ============================================================================

const TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const ME_URL = 'https://openapi.naver.com/v1/nid/me';

// 사용자에게 보여줄 문구는 실패 원인을 흘리지 않는다(토큰 탐색 힌트가 되지 않게).
const MSG_UNAVAILABLE = '네이버 로그인이 일시적으로 불가능해요. 다른 방법으로 로그인해 주세요.';
const MSG_REJECTED = '허용되지 않은 네이버 앱 토큰입니다.';
const MSG_NO_PROFILE = '네이버 사용자 정보 없음';
const MSG_UPSTREAM = '네이버 인증 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';

function fail(status, error) {
  return {ok: false, status, error};
}

async function readJson(res) {
  try {
    return await res.json();
  } catch (_e) {
    return null;
  }
}

/**
 * 리프레시 토큰을 우리 앱 자격으로 교환해 audience 를 검증하고, 그 결과 토큰으로 신원을 읽는다.
 *
 * @param {object} p
 * @param {string} p.clientId       NAVER_CLIENT_ID (앱의 네이버 client_id)
 * @param {string} p.clientSecret   NAVER_CLIENT_SECRET
 * @param {string} p.refreshToken   네이티브 SDK 로그인이 돌려준 refreshToken
 * @param {Function} [p.fetchImpl]  테스트용 fetch 주입(기본 전역 fetch)
 * @returns {Promise<{ok:true,id:string,email:?string,name:?string}|{ok:false,status:number,error:string}>}
 */
async function verifyNaverIdentity({clientId, clientSecret, refreshToken, fetchImpl}) {
  const doFetch = fetchImpl || fetch;

  // fail-closed: 자격이 주입되지 않은 배포에서는 검증을 건너뛰지 않고 로그인 자체를 거부한다.
  // 설정 누락이 조용히 '검증 없음'으로 퇴화하면 그 순간부터 누구의 토큰으로든 계정이 열린다.
  if (!clientId || !clientSecret) {
    console.error('[auth/naver] NAVER_CLIENT_ID/SECRET 미설정 — audience 검증 불가로 로그인 거부');
    return fail(503, MSG_UNAVAILABLE);
  }
  if (!refreshToken || typeof refreshToken !== 'string') {
    return fail(400, 'refreshToken 필요');
  }

  // (1) audience 검증 = 리프레시 토큰 교환. 우리 client_id/secret 으로만 성공한다.
  const url =
    `${TOKEN_URL}?grant_type=refresh_token` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&refresh_token=${encodeURIComponent(refreshToken)}`;

  let tokenRes;
  try {
    tokenRes = await doFetch(url);
  } catch (_e) {
    return fail(502, MSG_UPSTREAM);
  }
  if (!tokenRes) return fail(502, MSG_UPSTREAM);
  // 네이버는 실패를 HTTP 4xx 로도, 200 + {error, error_description} 본문으로도 돌려준다.
  // 어느 쪽이든 '토큰이 우리 앱 것이 아니다'로 취급한다(둘 다 본다 — 한쪽만 보면 뚫린다).
  if (!tokenRes.ok) return fail(401, MSG_REJECTED);
  const tokenBody = await readJson(tokenRes);
  if (!tokenBody || tokenBody.error) return fail(401, MSG_REJECTED);
  const freshToken = tokenBody.access_token;
  if (typeof freshToken !== 'string' || !freshToken) return fail(401, MSG_REJECTED);

  // (2) 신원 조회 — 반드시 (1)에서 받은 토큰으로. 클라이언트가 보낸 토큰은 쓰지 않는다.
  let meRes;
  try {
    meRes = await doFetch(ME_URL, {headers: {Authorization: `Bearer ${freshToken}`}});
  } catch (_e) {
    return fail(502, MSG_UPSTREAM);
  }
  if (!meRes || !meRes.ok) return fail(401, '네이버 토큰 검증 실패');
  const body = await readJson(meRes);
  if (!body || body.resultcode !== '00' || !body.response || body.response.id == null) {
    return fail(401, MSG_NO_PROFILE);
  }

  return {
    ok: true,
    id: String(body.response.id),
    email: body.response.email || null,
    name: body.response.nickname || body.response.name || null,
  };
}

module.exports = {verifyNaverIdentity, TOKEN_URL, ME_URL};
