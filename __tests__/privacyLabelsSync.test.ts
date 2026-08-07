// privacyLabelsSync.test.ts — **수집하는 코드와 신고한 문서가 어긋나면 빨개진다.**
//
// ── 왜 이 파일이 있나 ────────────────────────────────────────────────────────
// keego 의 개인정보 신고는 두 번 낡았고, 두 번 다 같은 방식이었다:
//   · 2026-07-19 초안: 검색 기록을 "수집하지 않음"으로 신고 → 그 기능이 나중에 붙었다(07-30 정정)
//   · 같은 초안: "Analytics SDK 0 · Firebase Analytics 미사용" → 계측이 나중에 붙었다(08-02 정정)
// 둘 다 **코드가 바뀌었는데 문서를 안 고쳐서** 생겼고, 둘 다 사람이 나중에 읽다가 발견했다.
// 그대로 제출했으면 "실제 동작과 다른 개인정보 신고"로 리젝된다(App Store 5.1.1).
//
// 사람의 기억에 맡기면 세 번째가 온다. 그래서 여기서 **기계가 대조**한다:
//
//   1) 문서의 정본 목록(store-privacy-labels.md 의 ```privacy-labels 블록)
//      ↔ ios/SoleMate/PrivacyInfo.xcprivacy 의 선언 집합이 **정확히 같은가**
//   2) 코드에 수집 지점이 있으면 그 유형이 **반드시 선언돼 있는가**
//      (SDK 를 새로 붙이거나 컬렉션을 새로 쓰면 여기서 걸린다)
//   3) 수집하지 않는 것을 **과잉 신고하지 않았는가**(사진 — 과잉도 부정확이다)
//
// ⚠️ 이 테스트가 빨개졌다면 고칠 곳은 셋 중 하나다:
//    · 새 수집을 시작했다 → 매니페스트 + 문서 정본 목록 + 위 표에 **행을 추가**한다.
//    · 수집을 멈췄다 → 세 곳에서 **함께 지운다.**
//    · 연결 여부(linked)만 바뀌었다 → 매니페스트와 문서 각주를 고친다(집합은 그대로다).
//    **테스트의 기대값만 고쳐서 통과시키지 말 것** — 그게 정확히 지난 두 번의 실패다.

import fs from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const DOC = 'docs/store-privacy-labels.md';
const MANIFEST = 'ios/SoleMate/PrivacyInfo.xcprivacy';

/** 매니페스트가 선언한 수집 유형 집합. */
function declaredTypes(): Set<string> {
  const xml = read(MANIFEST);
  const out = new Set<string>();
  // <key>NSPrivacyCollectedDataType</key><string>…Type…</string> 쌍만 집는다.
  // (…TypeLinked/…TypePurposes/…TypeTracking 같은 형제 키에 걸리지 않게 값 위치로 판단)
  const re =
    /<key>NSPrivacyCollectedDataType<\/key>\s*<string>(NSPrivacyCollectedDataType\w+)<\/string>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.add(m[1]);
  return out;
}

/** 문서의 정본 목록(기계 대조용 코드블록). */
function documentedTypes(): Set<string> {
  const md = read(DOC);
  const block = /```privacy-labels\n([\s\S]*?)```/.exec(md);
  if (!block) throw new Error(`${DOC} 에 \`\`\`privacy-labels 정본 블록이 없다`);
  return new Set(
    block[1]
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean),
  );
}

const sorted = (s: Set<string>) => [...s].sort();

describe('개인정보 신고 — 문서 ↔ 매니페스트', () => {
  test('정본 목록과 xcprivacy 선언이 정확히 일치한다', () => {
    // 집합 비교다. 한쪽에만 있으면 어느 쪽이 낡았는지 diff 로 바로 보인다.
    expect(sorted(documentedTypes())).toEqual(sorted(declaredTypes()));
  });

  test('정본 목록의 항목이 문서 본문 표에도 실제로 설명돼 있다', () => {
    // 목록에만 추가하고 표에 안 적는 '반쪽 갱신'을 막는다. 표는 사람이 읽고
    // App Store Connect 설문에 옮겨 적는 실물이라, 여기 빠지면 신고가 누락된다.
    const md = read(DOC);
    const humanLabel: Record<string, string> = {
      NSPrivacyCollectedDataTypePreciseLocation: '정확한 위치',
      NSPrivacyCollectedDataTypeHealth: '건강',
      NSPrivacyCollectedDataTypeFitness: '피트니스',
      NSPrivacyCollectedDataTypeUserID: '사용자 ID',
      NSPrivacyCollectedDataTypeEmailAddress: '이메일',
      NSPrivacyCollectedDataTypeName: '이름',
      NSPrivacyCollectedDataTypeDeviceID: '기기 ID',
      NSPrivacyCollectedDataTypeCrashData: '충돌 데이터',
      NSPrivacyCollectedDataTypeProductInteraction: '제품 상호작용',
      NSPrivacyCollectedDataTypeOtherUserContent: '기타 사용자 콘텐츠',
      NSPrivacyCollectedDataTypeSearchHistory: '검색 기록',
      NSPrivacyCollectedDataTypeOtherDataTypes: '기타 데이터 유형',
      NSPrivacyCollectedDataTypePhotosorVideos: '사진 또는 동영상',
    };
    const types = [...documentedTypes()];
    // 새 유형을 추가했으면 이 매핑에도 한국어 표기를 넣어야 한다(그 자체가 문서화 강제).
    const 표기없음 = types.filter(t => !humanLabel[t]);
    expect({표기없음}).toEqual({표기없음: []});
    // 그리고 그 표기가 문서 본문에 실제로 등장해야 한다.
    const 본문에없음 = types.filter(t => !md.includes(humanLabel[t]));
    expect({본문에없음}).toEqual({본문에없음: []});
  });
});

// ── 코드에 수집 지점이 있으면 반드시 선언돼 있어야 한다 ──────────────────────
// "SDK 를 붙였는데 신고를 안 한" 사고(B-2)를 구조로 막는다. 조건은 **코드의 사실**이고
// 기대는 **선언**이다 — 코드가 먼저 바뀌면 여기가 먼저 빨개진다.
describe('개인정보 신고 — 코드 ↔ 선언', () => {
  const rules: {
    what: string;
    /** 이 조건이 참이면 아래 유형들이 선언돼 있어야 한다. */
    present: () => boolean;
    types: string[];
  }[] = [
    {
      what: 'Firebase Analytics 제품 계측',
      present: () =>
        read('package.json').includes('@react-native-firebase/analytics') &&
        read('lib/productAnalytics.ts').includes('logEvent'),
      types: [
        'NSPrivacyCollectedDataTypeProductInteraction',
        'NSPrivacyCollectedDataTypeDeviceID',
      ],
    },
    {
      what: '검색 0건 기록(search_misses)',
      present: () => read('services/shoes.ts').includes('SEARCH_MISSES_COLLECTION'),
      types: ['NSPrivacyCollectedDataTypeSearchHistory'],
    },
    {
      what: '신발 등록 요청(shoe_requests)',
      present: () => read('services/shoes.ts').includes('SHOE_REQUESTS_COLLECTION'),
      types: ['NSPrivacyCollectedDataTypeOtherUserContent'],
    },
    {
      what: '나이·성별 클라우드 동기',
      // App.tsx 의 동기 페이로드에 실리는 설정값. 여기서 빠지면 '기타 데이터 유형'도 뺀다.
      present: () => /settings:\{[^}]*\bage\b[^}]*\bsex\b/.test(read('App.tsx')),
      types: ['NSPrivacyCollectedDataTypeOtherDataTypes'],
    },
    {
      what: 'HealthKit 심박 읽기 · 워크아웃 쓰기',
      present: () => read('lib/healthkit.ts').includes('HKQuantityTypeIdentifierHeartRate'),
      types: ['NSPrivacyCollectedDataTypeHealth', 'NSPrivacyCollectedDataTypeFitness'],
    },
    {
      what: 'Crashlytics',
      present: () => read('package.json').includes('@react-native-firebase/crashlytics'),
      types: ['NSPrivacyCollectedDataTypeCrashData'],
    },
    {
      what: '소셜 로그인(이메일·표시이름)',
      present: () => read('lib/firebaseCloudPort.ts').includes('signInWithCredential'),
      types: [
        'NSPrivacyCollectedDataTypeEmailAddress',
        'NSPrivacyCollectedDataTypeName',
        'NSPrivacyCollectedDataTypeUserID',
      ],
    },
  ];

  for (const rule of rules) {
    test(`${rule.what} — 코드에 있으면 선언돼 있다`, () => {
      if (!rule.present()) return; // 그 수집을 그만뒀다면 이 규칙은 잠든다
      const declared = declaredTypes();
      // 빠진 선언을 값으로 드러낸다 — 실패 메시지에 '무엇을 수집하는데 뭐가 없는지'가 남는다.
      const 선언누락 = rule.types.filter(t => !declared.has(t));
      expect({수집: rule.what, 선언누락}).toEqual({수집: rule.what, 선언누락: []});
    });
  }

  // 2026-08-07 — **이 테스트가 설계대로 발동했다.** 원래 문구는 "언젠가 사진 백업을 만들면
  // 이 테스트가 먼저 빨개져서 '신고부터 고쳐라'라고 알려준다"였고, 메달·기록증 클라우드
  // 백업이 들어오자 정확히 그렇게 됐다. 그래서 규칙을 **뒤집는다**: 이제는 업로드 경로가
  // 있는데 신고가 없는 것이 사고다. 기대값만 고쳐 통과시킨 게 아니라 사실이 바뀐 것이다.
  test('사진 업로드 경로가 있으면 반드시 신고돼 있다', () => {
    const uploads = read('lib/photoCloud.ts').includes('uploadAsync');
    expect(uploads).toBe(true); // 없어졌다면 아래 기대도 함께 뒤집어야 한다
    expect(declaredTypes().has('NSPrivacyCollectedDataTypePhotosorVideos')).toBe(true);
    expect(read(DOC)).toMatch(/사용자 콘텐츠 - 사진 또는 동영상/);
  });

  test('올리는 사진은 메달·기록증뿐이다 — 신고 범위가 코드보다 좁지 않게', () => {
    // 신고서가 "메달·기록증만"이라고 적었다면 코드도 그것만 올려야 한다. 신발·프로필
    // 사진까지 올리기 시작하면 신고가 **좁아서** 틀린 것이 된다(과소 신고).
    const sync = read('lib/medalPhotoSync.ts');
    expect(sync).toMatch(/medalPhotoUri/);
    expect(sync).toMatch(/certPhotoUri/);
    // 다른 사진 종류가 이 경로에 끼어들었는지.
    expect(sync).not.toMatch(/shoePhoto|profilePhoto|avatar/i);
  });

  test('추적(Tracking)은 세 타깃 모두 false 로 유지한다', () => {
    for (const p of [
      MANIFEST,
      'ios/SoleMateWatch Watch App/PrivacyInfo.xcprivacy',
      'ios/RunActivity/PrivacyInfo.xcprivacy',
    ]) {
      expect(read(p)).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    }
  });
});
