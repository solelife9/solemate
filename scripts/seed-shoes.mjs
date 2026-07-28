// ============================================================================
// scripts/seed-shoes.mjs — 신발 카탈로그를 Firestore 'shoes' 컬렉션에 업로드
// ----------------------------------------------------------------------------
// data/shoeCatalog.json 을 Firestore 로 올린다. 규약은 docs/shoes-spec.md §7:
//   · 문서 id = 슬러그 고정(랜덤 id 없음)
//   · setDoc(..., {merge:true}) upsert 만 — addDoc 금지(부르는 순간 중복이 생긴다)
//   · 단종은 삭제가 아니라 discontinued 플래그
//
// Firestore 규칙에서 shoes 는 **클라이언트 쓰기 금지**다(races 와 같은 취급 — 쓰기를
// 열면 누구나 카탈로그를 오염시킨다). 그래서 admin SDK 로만 쓴다.
//
// 준비(1회) — 인증:
//   a) gcloud auth application-default login        (가장 간단, 브라우저 로그인)
//   b) 또는 서비스계정 키:
//      Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
//      export GOOGLE_APPLICATION_CREDENTIALS=/path/key.json
//
// 실행:
//   node scripts/seed-shoes.mjs               # data/shoeCatalog.json
//   node scripts/seed-shoes.mjs --dry-run     # 올리지 않고 무엇이 올라갈지만 출력
// ============================================================================
import {readFileSync} from 'node:fs';
import {initializeApp, applicationDefault} from 'firebase-admin/app';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';

const PROJECT_ID = 'keego-620b8';
const COLLECTION = 'shoes';
const dryRun = process.argv.includes('--dry-run');
const file = process.argv.find((a) => a.endsWith('.json')) || 'data/shoeCatalog.json';

let raw;
try {
  raw = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
} catch (e) {
  console.error(`카탈로그를 읽지 못했습니다: ${file}\n  ${e.message}`);
  process.exit(1);
}
const shoes = Array.isArray(raw) ? raw : (raw.shoes ?? []);
if (!shoes.length) {
  console.error(`신발이 없습니다: ${file}`);
  process.exit(1);
}

// id 중복은 여기서 막는다 — upsert 라 나중 것이 앞 것을 조용히 덮어쓴다(데이터 손실).
const seen = new Set();
const dup = [];
for (const s of shoes) {
  if (!s?.id) {
    console.error('id(슬러그)가 없는 문서가 있습니다. 업로드를 중단합니다.');
    process.exit(1);
  }
  if (seen.has(s.id)) dup.push(s.id);
  seen.add(s.id);
}
if (dup.length) {
  console.error(`id 중복 ${dup.length}건 — 업로드를 중단합니다:\n  ${dup.join('\n  ')}`);
  process.exit(1);
}

console.log(`\n${file} · ${shoes.length}켤레${dryRun ? ' (dry-run)' : ''}`);

if (dryRun) {
  const byBrand = new Map();
  for (const s of shoes) byBrand.set(s.brand, (byBrand.get(s.brand) ?? 0) + 1);
  for (const [b, n] of [...byBrand].sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${b}`);
  }
  console.log('\n올리지 않았습니다(--dry-run).\n');
  process.exit(0);
}

initializeApp({credential: applicationDefault(), projectId: PROJECT_ID});
const db = getFirestore();

let ok = 0;
const failed = [];
// 배치(500 상한)로 나눠 쓴다 — 수백 건을 한 번에 커밋하면 상한에 걸린다.
const CHUNK = 400;
for (let i = 0; i < shoes.length; i += CHUNK) {
  const slice = shoes.slice(i, i + CHUNK);
  const batch = db.batch();
  for (const s of slice) {
    batch.set(
      db.collection(COLLECTION).doc(s.id),
      {...s, updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
  }
  try {
    await batch.commit();
    ok += slice.length;
    console.log(`  ${ok}/${shoes.length} 업로드`);
  } catch (e) {
    failed.push(...slice.map((s) => s.id));
    console.error(`  배치 실패(${slice.length}건): ${e.message}`);
  }
}

console.log(`\n완료 — 성공 ${ok} · 실패 ${failed.length}`);
if (failed.length) {
  console.error('실패한 id:\n  ' + failed.join('\n  '));
  console.error('\n인증을 확인하세요: `gcloud auth application-default login` 또는 GOOGLE_APPLICATION_CREDENTIALS.');
  process.exitCode = 1;
}
