// ============================================================================
// scripts/purge-leaderboards.mjs — 이미 쌓인 leaderboards 문서를 전부 삭제(일회성)
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-07-29 감사):
//   랭킹(리더보드) 화면은 진입점이 없어 사용자가 존재조차 모르는데, 클라우드 동기가
//   돌 때마다 `leaderboards/{YYYY-MM}/entries/{uid}` 에 **닉네임 + 월간 운동량**이
//   발행되고 있었다. 규칙은 그걸 로그인한 누구나 읽게 열어뒀다.
//   → 발행은 앱에서 껐고(lib/featureFlags.LEADERBOARD_PUBLISH_ENABLED=false),
//     읽기는 규칙에서 막았다(firestore.rules). **이미 쌓인 데이터는 이 스크립트로 지운다.**
//
// 규칙상 클라이언트는 이 컬렉션을 삭제할 수 없다(`allow delete` 는 본인 엔트리만).
// 전량 삭제는 규칙을 우회하는 admin SDK 로만 한다 — 그래서 스크립트다.
//
// ⚠️ 되돌릴 수 없다. 기본은 **드라이런**이고, 실제 삭제는 `--yes` 를 붙여야 한다.
//
// 준비(1회):
//   인증 — 둘 중 하나:
//     a) gcloud auth application-default login          (가장 간단)
//     b) 서비스계정 키:  export GOOGLE_APPLICATION_CREDENTIALS=/path/key.json
//
// 실행:
//   node scripts/purge-leaderboards.mjs             # 드라이런 — 무엇이 지워질지만 출력
//   node scripts/purge-leaderboards.mjs --yes       # 실제 삭제
//   node scripts/purge-leaderboards.mjs --yes --project=keego-620b8
// ============================================================================
import {initializeApp, applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const DEFAULT_PROJECT_ID = 'keego-620b8';
const ROOT = 'leaderboards';
/** Firestore 배치 쓰기 상한은 500 — 그 아래로 잘라 넣는다. */
const BATCH_LIMIT = 400;

const args = process.argv.slice(2);
const apply = args.includes('--yes');
const projectId =
  args.find(a => a.startsWith('--project='))?.slice('--project='.length) || DEFAULT_PROJECT_ID;

initializeApp({credential: applicationDefault(), projectId});
const db = getFirestore();

/**
 * `leaderboards` 아래의 월(月) 문서를 전부 찾는다.
 *
 * 주의: `leaderboards/{ym}` 은 **문서가 실재하지 않을 수 있다.** 앱은 하위 컬렉션
 * (`entries/{uid}`)에만 썼으므로 부모는 이른바 '유령 문서'다. 그래서 `.get()` 이 아니라
 * `listDocuments()` 를 쓴다 — 이쪽은 하위 컬렉션만 가진 유령 문서까지 돌려준다.
 * (`.get()` 으로 훑으면 0건이 나오고, 데이터가 남아 있는데 지웠다고 착각하게 된다.)
 */
async function listMonthRefs() {
  return db.collection(ROOT).listDocuments();
}

/** 문서 참조 배열을 배치로 나눠 삭제한다. */
async function deleteRefs(refs) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
    await batch.commit();
  }
}

const run = async () => {
  console.log(`프로젝트: ${projectId}`);
  console.log(apply ? '모드: 실제 삭제(--yes)' : '모드: 드라이런 (실제 삭제는 --yes)');
  console.log('');

  const monthRefs = await listMonthRefs();
  if (!monthRefs.length) {
    console.log(`'${ROOT}' 아래에 아무것도 없습니다. 지울 게 없습니다.`);
    return;
  }

  let totalEntries = 0;
  let totalGhostParents = 0;
  const plan = [];

  for (const monthRef of monthRefs) {
    // 하위 컬렉션은 보통 'entries' 하나지만, 이름을 가정하지 않고 실제로 있는 것을 전부 훑는다.
    const subs = await monthRef.listCollections();
    const entryRefs = [];
    for (const sub of subs) {
      const docs = await sub.listDocuments();
      entryRefs.push(...docs);
    }
    // 부모 문서가 실재하는지(유령인지) 구분해 보고한다 — 유령이면 지울 필드가 없다.
    const parentSnap = await monthRef.get();
    if (!parentSnap.exists) totalGhostParents += 1;

    totalEntries += entryRefs.length;
    plan.push({monthRef, entryRefs, parentExists: parentSnap.exists});
    console.log(
      `  ${ROOT}/${monthRef.id}  엔트리 ${entryRefs.length}건` +
        (parentSnap.exists ? '  (+ 부모 문서 1건)' : '  (부모는 유령 문서)'),
    );
  }

  console.log('');
  console.log(
    `합계: 월 ${monthRefs.length}개 · 엔트리 ${totalEntries}건 · 유령 부모 ${totalGhostParents}개`,
  );

  if (!apply) {
    console.log('');
    console.log('드라이런이라 아무것도 지우지 않았습니다. 실제로 지우려면 --yes 를 붙이세요.');
    return;
  }

  console.log('');
  let deletedEntries = 0;
  let deletedParents = 0;
  for (const {monthRef, entryRefs, parentExists} of plan) {
    await deleteRefs(entryRefs);
    deletedEntries += entryRefs.length;
    // 엔트리를 먼저 지우고 부모를 지운다(반대로 하면 하위가 고아로 남는다 — Firestore 는
    // 부모 삭제가 하위 컬렉션을 지우지 않는다).
    if (parentExists) {
      await monthRef.delete();
      deletedParents += 1;
    }
    console.log(`  ✓ ${ROOT}/${monthRef.id} — 엔트리 ${entryRefs.length}건 삭제`);
  }

  console.log('');
  console.log(`삭제 완료: 엔트리 ${deletedEntries}건 · 부모 문서 ${deletedParents}건`);

  // 검증: 다시 훑어 남은 게 없는지 확인한다(삭제했다고 믿지 말고 확인한다).
  let remaining = 0;
  for (const monthRef of await listMonthRefs()) {
    for (const sub of await monthRef.listCollections()) {
      remaining += (await sub.listDocuments()).length;
    }
  }
  if (remaining === 0) {
    console.log('검증: 남은 엔트리 0건 ✅');
  } else {
    console.error(`검증 실패: 엔트리 ${remaining}건이 아직 남아 있습니다. 다시 실행하세요.`);
    process.exitCode = 1;
  }
};

run().catch(e => {
  console.error('실패:', e?.message || e);
  process.exit(1);
});
