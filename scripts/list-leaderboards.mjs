// ============================================================================
// scripts/list-leaderboards.mjs — 리더보드에 **누가 올라가 있는지만** 본다(읽기 전용)
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-04):
//   랭킹을 열어 보니 모르는 엔트리가 보인다는 제보. 앱 코드에는 가짜 경쟁자를 만드는
//   경로가 없다(lib/progression/ranking.ts 는 `entries: []` 로 못 박혀 있고, 화면은
//   Firestore provider 를 쓴다). 그렇다면 보이는 건 **실제 문서**이므로, 무엇이
//   들어 있는지 눈으로 확인해야 판단할 수 있다.
//
// **이 스크립트는 아무것도 쓰거나 지우지 않는다.** 삭제가 필요하면 그건 따로
// scripts/purge-leaderboards.mjs 다(그쪽은 --yes 를 요구한다).
//
// 준비(1회): 인증 — 둘 중 하나
//   a) gcloud auth application-default login
//   b) export GOOGLE_APPLICATION_CREDENTIALS=/path/key.json
//
// 실행:
//   node scripts/list-leaderboards.mjs                # 이번 달
//   node scripts/list-leaderboards.mjs --ym=2026-07   # 특정 달
//   node scripts/list-leaderboards.mjs --all          # 모든 달
// ============================================================================
import {initializeApp, applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const DEFAULT_PROJECT_ID = 'keego-620b8';
const ROOT = 'leaderboards';

const args = process.argv.slice(2);
const arg = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const projectId = arg('project') ?? DEFAULT_PROJECT_ID;
const all = args.includes('--all');

/** 'YYYY-MM' (로컬 기준 — 앱의 ymLocal 과 같은 규약). */
function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

initializeApp({credential: applicationDefault(), projectId});
const db = getFirestore();

/** 한 달의 엔트리를 표로 찍는다. */
async function dumpMonth(ym) {
  const snap = await db.collection(`${ROOT}/${ym}/entries`).get();
  console.log(`\n■ ${ym} — 엔트리 ${snap.size}개`);
  if (snap.empty) {
    console.log('  (비어 있음)');
    return 0;
  }
  const rows = snap.docs.map(d => {
    const v = d.data() ?? {};
    return {
      uid: d.id,
      nickname: String(v.nickname ?? ''),
      tier: String(v.rankTier ?? ''),
      distance: Number(v.distance ?? 0),
      consistency: Number(v.consistency ?? 0),
      progressPoints: Number(v.progressPoints ?? 0),
      updatedAt: Number(v.updatedAt ?? 0),
    };
  });
  rows.sort((a, b) => b.distance - a.distance);
  for (const r of rows) {
    const when = r.updatedAt ? new Date(r.updatedAt).toISOString().slice(0, 16).replace('T', ' ') : '-';
    console.log(
      `  ${r.nickname.padEnd(12)} ${r.tier.padEnd(9)}` +
        ` 거리 ${String(r.distance).padStart(7)}km  활동 ${String(r.consistency).padStart(2)}일` +
        `  XP ${String(r.progressPoints).padStart(6)}  갱신 ${when}  uid=${r.uid}`,
    );
  }
  return snap.size;
}

const months = all
  ? (await db.collection(ROOT).listDocuments()).map(d => d.id).sort()
  : [arg('ym') ?? thisMonth()];

let total = 0;
for (const ym of months) total += await dumpMonth(ym);

console.log(`\n합계 ${total}개 (프로젝트 ${projectId})`);
console.log('※ 읽기 전용입니다 — 아무것도 지우지 않았습니다.');
console.log('  지우려면: node scripts/purge-leaderboards.mjs        (드라이런)');
console.log('            node scripts/purge-leaderboards.mjs --yes  (실제 삭제)');
