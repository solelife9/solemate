// ============================================================================
// scripts/seed-races.mjs — 대회 카탈로그를 Firestore 'races' 컬렉션에 업로드
// ----------------------------------------------------------------------------
// data/races.json 의 대회들을 Firestore 로 올린다(문서 id = race.id, 있으면 덮어씀).
// 앱은 이걸 읽어 번들 시드에 머지한다(lib/raceStore) — 이후 대회 추가/수정은 이 스크립트로만
// (앱 재배포 불필요). Firestore 규칙에서 races 는 클라이언트 쓰기 금지라 admin SDK 로만 쓴다.
//
// 준비(1회):
//   1) npm i -D firebase-admin
//   2) 인증 — 둘 중 하나:
//      a) gcloud auth application-default login   (가장 간단, 브라우저 로그인)
//      b) 서비스계정 키: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 →
//         내려받은 json 경로를  export GOOGLE_APPLICATION_CREDENTIALS=/path/key.json
//
// 실행:  node scripts/seed-races.mjs
//   특정 파일:  node scripts/seed-races.mjs data/races.json
// ============================================================================
import {readFileSync} from 'node:fs';
import {initializeApp, applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT_ID = 'keego-620b8';
const file = process.argv[2] || 'data/races.json';

const raw = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const races = Array.isArray(raw.races) ? raw.races : [];
if (!races.length) {
  console.error(`대회가 없습니다: ${file}`);
  process.exit(1);
}

initializeApp({credential: applicationDefault(), projectId: PROJECT_ID});
const db = getFirestore();

const run = async () => {
  let ok = 0;
  const batch = db.batch();
  for (const r of races) {
    if (!r || typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.date !== 'string') {
      console.warn('건너뜀(id/name/date 없음):', JSON.stringify(r).slice(0, 80));
      continue;
    }
    // 앱 RaceEvent 스키마와 동일 필드만 저장(좌표 있으면 Tier1=자동감지, 없으면 Tier2=검색).
    batch.set(db.collection('races').doc(r.id), {
      name: r.name,
      date: r.date,
      region: r.region ?? '',
      venue: r.venue ?? '',
      ...(typeof r.startLat === 'number' ? {startLat: r.startLat} : {}),
      ...(typeof r.startLon === 'number' ? {startLon: r.startLon} : {}),
      distances: Array.isArray(r.distances) ? r.distances : [],
    });
    ok++;
  }
  await batch.commit();
  console.log(`✅ Firestore 'races' 에 ${ok}개 대회 업로드 완료 (프로젝트 ${PROJECT_ID}).`);
};

run().catch((e) => {
  console.error('업로드 실패:', e.message);
  console.error('인증을 확인하세요: `gcloud auth application-default login` 또는 GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
});
