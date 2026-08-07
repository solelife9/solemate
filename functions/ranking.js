// ============================================================================
// functions/ranking.js — 월간 리더보드 엔트리를 **서버가 계산해서** 쓴다
// ============================================================================
// 왜 필요한가
// ------------------------------------------------------------------
// 예전엔 앱이 자기 점수를 계산해 `leaderboards/{ym}/entries/{uid}` 에 직접 썼다.
// 규칙은 형태와 크기만 봤으므로(2026-08-04 상한 추가), 사람이 낼 수 있는 범위 안이면
// **아무 숫자나 써서 1위가 될 수 있었다** — 300km 를 달렸다고 쓰는 데 300km 가 필요 없었다.
//
// 그래서 클라이언트 쓰기를 막고(firestore.rules), 여기서 **사용자 자신의 러닝 기록을
// 서버가 읽어 다시 계산**한다. 이게 스트라바·나이키가 쓰는 구조다: 활동은 업로드되고,
// 순위는 업로드된 활동에서 서버가 만든다.
//
// **이것이 막는 것과 못 막는 것 — 정직하게**
//   막는다 : 기록 없이 점수만 써넣기. 프로필과 순위표의 숫자가 어긋나기.
//            지우고 다시 써서 유리한 달 세탁하기.
//   못 막는다: **가짜 러닝을 기록으로 만들어 넣기.** 러닝 데이터는 기기에서 태어나므로
//            어떤 서버 계산으로도 진짜인지 알 수 없다. 다만 그러려면 자기 앱에 가짜 런이
//            남고 공개 프로필에도 그대로 보인다(스트라바도 여기까지가 한계다).
//
// 왜 3축 중 2축만 다시 계산하나 (progressPoints 는 통과시킨다)
// ------------------------------------------------------------------
// distance·consistency 는 그달 러닝만 있으면 나오는 **객관 집계**라 30줄이면 재현된다.
// progressPoints(랭크 XP)는 업적·타이틀·은퇴·챌린지가 얽힌 약 1,900줄짜리 엔진의
// 산출물이다. 그걸 이 파일에 옮겨 적으면 **두 벌이 되어 반드시 갈라진다** — 같은
// 데이터로 앱과 서버가 다른 점수를 내는 순간, 고칠 수 없는 종류의 버그가 된다.
// 그래서 지금은 클라이언트 값을 **상한을 걸어** 통과시키고, 남은 구멍을 문서에 적어 둔다
// (docs/audit/08-followup-2026-08-07.md L-7). 조용히 안전한 척하지 않는 것이 요점이다.
//
// 읽기 비용
// ------------------------------------------------------------------
// 그달 러닝만 쿼리한다(보통 10~30건) + 신발 목록(보통 20건 미만). 발행 1회당 수십 읽기다.
// 전(全) 기간 러닝은 읽지 않는다 — shoeHealth 는 화면에 없는 축이라 그 비용을 치를
// 이유가 없다(HallOfFameScreen 이 2026-08-04 에 내렸다).
// ============================================================================
const admin = require('firebase-admin');

/** 리더보드에 실을 수 있는 상한(firestore.rules 의 validRankingEntry 와 같은 값). */
const CAPS = {
  distance: 1500,
  consistency: 31,
  shoeHealth: 100,
  collection: 500,
  progressPoints: 10000,
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 0..cap 으로 조인다. 음수는 정렬을 뒤집는 장난이 되므로 반드시 막는다. */
function clamp(v, cap) {
  return Math.max(0, Math.min(cap, num(v)));
}

/** 'YYYY-MM' 형태인가. */
function validYearMonth(ym) {
  return typeof ym === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

/**
 * 그달 러닝에서 거리·활동일수를 낸다. **순수 함수** — 앱의 computeRankingStats 와
 * 같은 규칙이어야 하고, 그 일치를 `__tests__/rankingParity.test.ts` 가 고정한다.
 *
 * 활동 일수는 `run_date` 의 앞 10글자(YYYY-MM-DD) 로 센다. 시간 접미사가 붙은 기록이
 * 섞이면 같은 날 두 런이 이틀로 셈돼 꾸준함이 부풀었던 적이 있다.
 */
function monthStats(runs, yearMonth) {
  let distance = 0;
  const days = new Set();
  for (const r of runs || []) {
    if (!r || r.deleted === true) continue;
    const d = String(r.run_date || '');
    if (d.slice(0, 7) !== yearMonth) continue;
    distance += num(r.km);
    const day = d.slice(0, 10);
    if (day) days.add(day);
  }
  return {
    distance: Math.round(distance * 10) / 10,
    consistency: days.size,
  };
}

/** 살아있는 신발 수. 묘비는 세지 않는다. */
function liveCount(docs) {
  let n = 0;
  for (const d of docs || []) if (d && d.deleted !== true) n += 1;
  return n;
}

/**
 * 발행 본체. Express 라우트에서 인증된 uid 와 본문을 받아 엔트리를 쓴다.
 *
 * @param db     admin firestore
 * @param uid    인증된 사용자
 * @param body   앱이 보낸 표시정보(닉네임·랭크·타이틀·신발요약·progressPoints)
 * @returns      {ok:true, entry} 또는 {ok:false, reason}
 */
async function publishRanking(db, uid, body) {
  const ym = body && body.yearMonth;
  if (!validYearMonth(ym)) return {ok: false, reason: 'bad-yearMonth'};

  const base = db.collection('userBackups').doc(uid);

  // 그달 러닝만 읽는다. run_date 는 'YYYY-MM-DD…' 문자열이라 사전순 범위가 곧 날짜 범위다
  // (시간 접미사가 붙은 값까지 범위 안에 들어오도록 상한을 넉넉히 잡는다).
  // ⚠️ 이 쿼리는 **비용 최적화이지 정확성의 근거가 아니다** — 월 판정은 아래 monthStats 가
  // 다시 한다. 쿼리가 넓게 잡아도 결과는 같고, 좁게 잡히는 일은 없다.
  const runsSnap = await base
    .collection('runs')
    .where('run_date', '>=', ym + '-01')
    .where('run_date', '<=', ym + '-31\uf8ff')
    .get();
  const runs = runsSnap.docs.map((d) => d.data());

  const shoesSnap = await base.collection('shoes').get();
  const collection = clamp(liveCount(shoesSnap.docs.map((d) => d.data())), CAPS.collection);

  const stats = monthStats(runs, ym);

  const entry = {
    uid,
    nickname: String((body && body.nickname) || '러너').slice(0, 40),
    rankTier: String((body && body.rankTier) || 'bronze'),
    rankColor: String((body && body.rankColor) || '#CD7F32'),
    equippedTitle:
      body && typeof body.equippedTitle === 'string' ? body.equippedTitle.slice(0, 40) : null,
    // ── 서버가 다시 계산한 축 ──
    distance: clamp(stats.distance, CAPS.distance),
    consistency: clamp(stats.consistency, CAPS.consistency),
    collection,
    // ── 통과시키되 조이는 축(위 헤더 참조) ──
    shoeHealth: clamp(body && body.shoeHealth, CAPS.shoeHealth),
    progressPoints: clamp(body && body.progressPoints, CAPS.progressPoints),
    updatedAt: Date.now(),
  };

  // 그달 주력 신발(선택) — 랭킹 행에 같이 뜬다. 최대 3켤레, 문자열만.
  const shoes = Array.isArray(body && body.shoes_summary) ? body.shoes_summary : [];
  const cleaned = shoes
    .filter((s) => s && typeof s.brand === 'string' && typeof s.model === 'string')
    .slice(0, 3)
    .map((s) => ({
      brand: s.brand.slice(0, 40),
      model: s.model.slice(0, 60),
      usedKm: clamp(s.usedKm, 100000),
    }));
  if (cleaned.length) entry.shoes = cleaned;

  const ref = db.collection('leaderboards').doc(ym).collection('entries').doc(uid);

  // ── 이번 달에 달리지 않았으면 명단에서 내린다 ────────────────────────────────
  // 2026-08-04 에 리더보드를 열어 보니 **엔트리 5개가 전부 0km · 0일**이었다. 발행이
  // 활동 여부를 안 보고 동기할 때마다 돌았기 때문이다. 화면 라벨이 "…에 달린 러너 중"
  // 이라 거짓이 되고, 첫 사용자는 `러너 0km` 가 늘어선 죽은 표를 본다.
  // 안 올리는 것만으로는 부족하다 — 지난달에 올려둔 줄이 그대로 남기 때문에 **지운다.**
  // 이 판단이 서버로 온 이유: 이제 거리·활동일수를 아는 쪽이 서버뿐이다.
  if (!(entry.distance > 0) && !(entry.consistency > 0)) {
    await ref.delete().catch(() => {});
    return {ok: true, published: false, entry: null};
  }

  await ref.set(entry);
  return {ok: true, published: true, entry};
}

// 발행 **회수**(동의 철회·탈퇴)는 서버를 거치지 않는다 — firestore.rules 가 본인 엔트리
// 삭제를 여전히 허용하기 때문이다(파기 요건이 순위표 무결성보다 우선한다는 2026-07-29
// 판단). 쓰기만 서버가 독점하고 지우기는 본인이 직접 할 수 있어야, 네트워크가 나쁘거나
// 함수가 죽어 있어도 "내리기"가 막히지 않는다.

/**
 * Express 라우트로 묶는다. 인증은 `Authorization: Bearer <Firebase ID 토큰>` —
 * **uid 는 토큰에서만 온다.** 본문의 uid 를 믿으면 남의 이름으로 발행할 수 있다.
 */
function mountRanking(app, opts) {
  const db = (opts && opts.db) || admin.firestore();
  const verify = (opts && opts.verifyIdToken) || ((t) => admin.auth().verifyIdToken(t));

  async function authed(req, res, next) {
    const h = String(req.get('authorization') || '');
    const m = /^Bearer (.+)$/i.exec(h);
    if (!m) return res.status(401).json({error: 'unauthenticated'});
    try {
      const decoded = await verify(m[1]);
      if (!decoded || !decoded.uid) return res.status(401).json({error: 'unauthenticated'});
      req.uid = decoded.uid;
      return next();
    } catch {
      return res.status(401).json({error: 'unauthenticated'});
    }
  }

  app.post('/ranking/publish', authed, async (req, res) => {
    try {
      const r = await publishRanking(db, req.uid, req.body || {});
      if (!r.ok) return res.status(400).json({error: r.reason});
      return res.json(r);
    } catch (e) {
      console.error('ranking/publish', e);
      return res.status(500).json({error: 'internal'});
    }
  });
}

module.exports = {monthStats, publishRanking, mountRanking, validYearMonth, CAPS};
