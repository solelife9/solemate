// ============================================================================
// scripts/seed-config.mjs — 앱 원격 설정(config/app) 쓰기 · 필수 업데이트 게이트
// ----------------------------------------------------------------------------
// 이 문서 하나가 "이 버전 미만은 앱을 막는다"를 정한다(AUDIT 2 I-3, B안).
// Firestore 규칙에서 config 는 클라이언트 **읽기 전용**이라 admin SDK 로만 쓴다.
//
// 준비(1회):
//   1) npm i -D firebase-admin   (이미 설치돼 있음)
//   2) 인증 — 둘 중 하나:
//      a) gcloud auth application-default login
//      b) 서비스계정 키: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 →
//         export GOOGLE_APPLICATION_CREDENTIALS=/path/key.json
//
// 사용법:
//   현재 설정 보기      node scripts/seed-config.mjs
//   최소 버전 지정      node scripts/seed-config.mjs --min 1.0.1
//   안내 문구까지       node scripts/seed-config.mjs --min 1.0.1 --message "거리 기록 오류를 고쳤어요."
//   스토어 링크 등록    node scripts/seed-config.mjs --ios https://apps.apple.com/app/id123 --android https://play.google.com/store/apps/details?id=com.solemate
//   게이트 해제         node scripts/seed-config.mjs --off
//
// ⚠️ **--min 은 사용자를 잠그는 스위치다.** 넣기 전에 반드시 확인할 것:
//   · 고친 버전이 **이미 스토어에 올라가 심사를 통과했는가**. 아직이면 사용자는 업데이트할
//     곳이 없는 채로 잠긴다 — 앱이 그냥 죽은 것과 같다.
//   · 스토어 링크(--ios/--android)가 등록돼 있는가. 없으면 화면이 "검색해서 받으세요"로
//     폴백하는데, 그건 최후 수단이지 기본이 아니다.
// 그래서 이 스크립트는 --min 을 넣을 때 확인 절차를 한 번 거친다(--yes 로 생략).
// ============================================================================
import {initializeApp, applicationDefault} from 'firebase-admin/app';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';

const PROJECT_ID = 'keego-620b8';

/** --키 값 / --플래그 형태를 파싱한다. */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

initializeApp({credential: applicationDefault(), projectId: PROJECT_ID});
const db = getFirestore();
const ref = db.collection('config').doc('app');

const show = async (label) => {
  const snap = await ref.get();
  const d = snap.exists ? snap.data() : null;
  console.log(`\n${label}`);
  if (!d) {
    console.log('  (문서 없음 — 게이트 비활성. 앱은 아무도 막지 않는다)');
    return;
  }
  console.log(`  minSupportedVersion : ${d.minSupportedVersion ?? '(없음 — 아무도 안 막음)'}`);
  console.log(`  message             : ${d.message ?? '(없음 — 화면 기본 문구)'}`);
  console.log(`  storeUrlIos         : ${d.storeUrlIos ?? '(없음 — 검색 안내로 폴백)'}`);
  console.log(`  storeUrlAndroid     : ${d.storeUrlAndroid ?? '(없음 — 검색 안내로 폴백)'}`);
};

const run = async () => {
  // 인자가 없으면 현재 상태만 보여준다(실수로 덮어쓰지 않게 하는 기본 동작).
  const writing = ['min', 'message', 'ios', 'android', 'off'].some((k) => k in args);
  if (!writing) {
    await show('현재 config/app:');
    console.log('\n바꾸려면 --min / --message / --ios / --android / --off 를 주세요.\n');
    return;
  }

  await show('바꾸기 전 config/app:');

  const patch = {updatedAt: FieldValue.serverTimestamp()};
  if (args.off) patch.minSupportedVersion = FieldValue.delete();
  if (typeof args.min === 'string') {
    if (!/^\d+(\.\d+){0,3}$/.test(args.min)) {
      console.error(`\n❌ --min 형식이 아닙니다: ${args.min} (예: 1.0.1)`);
      process.exit(1);
    }
    patch.minSupportedVersion = args.min;
  }
  if (typeof args.message === 'string') patch.message = args.message;
  if (typeof args.ios === 'string') patch.storeUrlIos = args.ios;
  if (typeof args.android === 'string') patch.storeUrlAndroid = args.android;

  // 사용자를 잠그는 변경에는 확인을 받는다.
  if (typeof patch.minSupportedVersion === 'string' && !args.yes) {
    console.log(
      `\n⚠️  ${patch.minSupportedVersion} 미만 버전을 쓰는 **모든 사용자**가 즉시 앱을 못 쓰게 됩니다.`,
    );
    console.log('   그 버전이 이미 스토어에 올라가 심사를 통과했는지 먼저 확인하세요.');
    const rl = createInterface({input: stdin, output: stdout});
    const ans = await rl.question('   계속하려면 "잠금" 을 입력하세요: ');
    rl.close();
    if (ans.trim() !== '잠금') {
      console.log('\n취소했습니다. 아무것도 바꾸지 않았습니다.\n');
      return;
    }
  }

  await ref.set(patch, {merge: true});
  await show('✅ 바꾼 뒤 config/app:');
  console.log('');
};

run().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
