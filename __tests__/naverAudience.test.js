// functions/naverAuth.js — 네이버 audience 바인딩 검증(감사 H2).
// 핵심 계약 두 가지를 못 박는다:
//   ① 리프레시 토큰 교환이 실패하면(=우리 앱 토큰이 아니면) 로그인 거부.
//   ② 신원 조회는 **교환으로 새로 받은 토큰**으로만 — 클라가 보낸 토큰은 절대 안 쓴다.
// ②가 깨지면 "내 리프레시 토큰 + 남의 액세스 토큰"으로 계정 탈취가 가능하다.
const {verifyNaverIdentity, TOKEN_URL, ME_URL} = require('../functions/naverAuth');

const CREDS = {clientId: 'our-client', clientSecret: 'our-secret'};

/** fetch 목: 토큰 교환 응답과 프로필 응답을 각각 지정한다. 호출 기록도 남긴다. */
function makeFetch({token, me}) {
  const calls = [];
  const fetchImpl = jest.fn(async (url, opts) => {
    calls.push({url, opts});
    if (String(url).startsWith(TOKEN_URL)) {
      if (typeof token === 'function') return token();
      return token;
    }
    if (String(url).startsWith(ME_URL)) {
      if (typeof me === 'function') return me();
      return me;
    }
    throw new Error(`예상치 못한 URL: ${url}`);
  });
  return {fetchImpl, calls};
}

const okToken = (accessToken = 'fresh-token') => ({
  ok: true,
  json: async () => ({access_token: accessToken, token_type: 'bearer', expires_in: '3600'}),
});
const okMe = (id = '12345') => ({
  ok: true,
  json: async () => ({
    resultcode: '00',
    message: 'success',
    response: {id, email: 'runner@example.com', nickname: '민우', name: '김민우'},
  }),
});

describe('verifyNaverIdentity — fail-closed', () => {
  it('client_id 가 없으면 검증 불가이므로 503 으로 거부한다(검증 생략 아님)', async () => {
    const {fetchImpl} = makeFetch({token: okToken(), me: okMe()});
    const r = await verifyNaverIdentity({
      clientId: '', clientSecret: 'x', refreshToken: 'rt', fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    // 네이버를 부르지도 않는다 — 오설정 배포가 계정을 열어주는 창을 아예 만들지 않는다.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('client_secret 이 없어도 503', async () => {
    const {fetchImpl} = makeFetch({token: okToken(), me: okMe()});
    const r = await verifyNaverIdentity({
      clientId: 'x', clientSecret: '', refreshToken: 'rt', fetchImpl,
    });
    expect(r.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshToken 이 없으면 400 — 액세스 토큰만으로는 로그인시키지 않는다', async () => {
    const {fetchImpl} = makeFetch({token: okToken(), me: okMe()});
    const r = await verifyNaverIdentity({...CREDS, refreshToken: undefined, fetchImpl});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('verifyNaverIdentity — audience 거부', () => {
  it('교환이 HTTP 401 이면 다른 앱 토큰으로 보고 거부한다', async () => {
    const {fetchImpl} = makeFetch({token: {ok: false, json: async () => ({})}, me: okMe()});
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'foreign', fetchImpl});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    // 프로필 조회까지 가지 않는다.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('네이버가 200 + {error} 로 실패를 알려도 거부한다(상태코드만 보면 뚫린다)', async () => {
    const {fetchImpl} = makeFetch({
      token: {ok: true, json: async () => ({error: 'invalid_request', error_description: 'no such token'})},
      me: okMe(),
    });
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'foreign', fetchImpl});
    expect(r.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('교환 응답에 access_token 이 없으면 거부한다', async () => {
    const {fetchImpl} = makeFetch({token: {ok: true, json: async () => ({token_type: 'bearer'})}, me: okMe()});
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'rt', fetchImpl});
    expect(r.status).toBe(401);
  });

  it('교환 응답이 JSON 이 아니어도 통과시키지 않는다', async () => {
    const {fetchImpl} = makeFetch({
      token: {ok: true, json: async () => { throw new Error('not json'); }},
      me: okMe(),
    });
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'rt', fetchImpl});
    expect(r.status).toBe(401);
  });
});

describe('verifyNaverIdentity — 신원의 출처', () => {
  it('프로필은 교환으로 받은 토큰으로 조회한다(클라가 보낸 토큰 아님)', async () => {
    const {fetchImpl, calls} = makeFetch({token: okToken('MINTED-BY-US'), me: okMe()});
    const r = await verifyNaverIdentity({
      ...CREDS,
      refreshToken: 'rt',
      // 공격자가 피해자의 '다른 앱' 액세스 토큰을 끼워 넣어도 참조되면 안 된다.
      accessToken: 'VICTIM-TOKEN-FROM-ANOTHER-APP',
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    const meCall = calls.find((c) => String(c.url).startsWith(ME_URL));
    expect(meCall.opts.headers.Authorization).toBe('Bearer MINTED-BY-US');
    // 어떤 요청에도 피해자 토큰이 실려 나가지 않는다.
    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain('VICTIM-TOKEN-FROM-ANOTHER-APP');
  });

  it('교환 요청에 우리 자격과 리프레시 토큰이 실린다', async () => {
    const {fetchImpl, calls} = makeFetch({token: okToken(), me: okMe()});
    await verifyNaverIdentity({...CREDS, refreshToken: 'rt-abc', fetchImpl});
    const url = String(calls[0].url);
    expect(url).toContain('grant_type=refresh_token');
    expect(url).toContain('client_id=our-client');
    expect(url).toContain('client_secret=our-secret');
    expect(url).toContain('refresh_token=rt-abc');
  });

  it('토큰에 URL 특수문자가 있어도 그대로 인코딩해 보낸다', async () => {
    const {fetchImpl, calls} = makeFetch({token: okToken(), me: okMe()});
    await verifyNaverIdentity({...CREDS, refreshToken: 'a b&c=d', fetchImpl});
    expect(String(calls[0].url)).toContain(`refresh_token=${encodeURIComponent('a b&c=d')}`);
  });

  it('성공하면 id·email·name 을 돌려준다', async () => {
    const {fetchImpl} = makeFetch({token: okToken(), me: okMe('98765')});
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'rt', fetchImpl});
    expect(r).toEqual({ok: true, id: '98765', email: 'runner@example.com', name: '민우'});
  });

  it('프로필 resultcode 가 00 이 아니면 거부한다', async () => {
    const {fetchImpl} = makeFetch({
      token: okToken(),
      me: {ok: true, json: async () => ({resultcode: '024', message: 'Authentication failed'})},
    });
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'rt', fetchImpl});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it('프로필에 id 가 없으면 거부한다', async () => {
    const {fetchImpl} = makeFetch({
      token: okToken(),
      me: {ok: true, json: async () => ({resultcode: '00', response: {email: 'x@y.z'}})},
    });
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'rt', fetchImpl});
    expect(r.status).toBe(401);
  });

  it('nickname 이 없으면 name 으로 대체한다', async () => {
    const {fetchImpl} = makeFetch({
      token: okToken(),
      me: {ok: true, json: async () => ({resultcode: '00', response: {id: '1', name: '김민우'}})},
    });
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'rt', fetchImpl});
    expect(r.name).toBe('김민우');
    expect(r.email).toBeNull();
  });
});

describe('verifyNaverIdentity — 네트워크 장애', () => {
  it('교환 요청이 throw 하면 502(인증 실패로 오인하지 않는다)', async () => {
    const fetchImpl = jest.fn(async () => { throw new Error('ECONNRESET'); });
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'rt', fetchImpl});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
  });

  it('프로필 요청이 throw 해도 502', async () => {
    const {fetchImpl} = makeFetch({
      token: okToken(),
      me: () => { throw new Error('ETIMEDOUT'); },
    });
    const r = await verifyNaverIdentity({...CREDS, refreshToken: 'rt', fetchImpl});
    expect(r.status).toBe(502);
  });
});
