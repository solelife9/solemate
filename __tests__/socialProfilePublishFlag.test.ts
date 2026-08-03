// socialProfilePublishFlag.test.ts — **발행과 고지는 항상 함께 간다.**
//
// ── 왜 이 파일이 있나 ────────────────────────────────────────────────────────
// keego 는 동의도 화면도 고지도 없이 닉네임·월간 운동량이 전원 읽기 가능한 컬렉션에
// 쌓이던 사고를 냈다(`767032e`, AUDIT 1). 2026-08-02 심사 감사에서 **같은 일이 컬렉션
// 이름만 바꿔 재발한 것**을 발견했다(`profiles/{uid}`, B-1) — 그때 발행을 플래그로 껐고,
// 2026-08-03 에 조건 셋(옵트인·뷰어·처리방침 고지)을 모두 갖춰 다시 켰다.
//
// ── 이 테스트가 고정하는 것: "꺼져 있음"이 아니라 **일관성** ──────────────────
// 처음엔 `flag === false` 를 고정했다. 그런데 그건 켜는 순간 의미를 잃는다(그리고 실제로
// 하루 만에 켰다). 진짜 불변식은 이것이다:
//
//     발행이 켜져 있다  ⟺  동의 화면 · 볼 화면 · 처리방침 고지 · 스토어 신고가 갖춰져 있다
//
// 그래서 **플래그 값에 따라 기대가 갈린다.** 누군가 고지를 지우고 발행만 켜두면 빨개지고,
// 반대로 발행을 껐는데 스토어 설명이 여전히 그 기능을 광고하면 그것도 빨개진다.
// 어느 방향으로 어긋나도 잡힌다는 게 요점이다.
//
// ⚠️ 이 테스트가 빨개졌을 때 **플래그를 그대로 두고 기대값만 고치지 말 것.** 그건 정확히
//    AUDIT 1 사고를 다시 만드는 손놀림이다. 고칠 곳은 '빠진 조건' 쪽이다.

import fs from 'fs';
import path from 'path';

import {
  SOCIAL_PROFILE_PUBLISH_ENABLED,
  LEADERBOARD_PUBLISH_ENABLED,
} from '../lib/featureFlags';

const repoRoot = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** 처리방침에 '다른 이용자 공개' 고지가 실재하는가. */
const hasDisclosureClause = () => {
  const html = read('docs/privacy.html');
  return (
    html.includes('다른 이용자에게 공개되는 정보') &&
    // 공개되는 항목과 공개되지 않는 항목이 **둘 다** 적혀 있어야 고지다.
    html.includes('공개되지 않습니다') &&
    html.includes('러닝 경로')
  );
};

describe('공개 프로필 — 발행과 고지의 일관성', () => {
  test('발행 코드가 플래그로 가드된다 (켜짐/꺼짐 무관)', () => {
    const app = read('App.tsx');
    expect(app).toMatch(
      /import\s*\{[^}]*SOCIAL_PROFILE_PUBLISH_ENABLED[^}]*\}\s*from\s*'\.\/lib\/featureFlags'/,
    );
    // 프로필 생성 자체가 플래그 뒤에 있어야 한다(만들어 두고 안 보내는 게 아니라, 안 만든다).
    expect(app).toContain('SOCIAL_PROFILE_PUBLISH_ENABLED?buildPublicProfile({');
  });

  test('꺼면 **이미 올라간 문서까지 내려간다** — 회수 경로가 살아 있다', () => {
    // 단순히 호출을 건너뛰면 예전에 발행된 프로필이 서버에 그대로 남는다.
    // `flag ? build(...) : null` → publishProfile(port, null) = 삭제 경로.
    const app = read('App.tsx');
    const guardIdx = app.indexOf('SOCIAL_PROFILE_PUBLISH_ENABLED?buildPublicProfile({');
    const publishIdx = app.indexOf('await publishProfile(cloudPortRef.current as any,profile);');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(publishIdx).toBeGreaterThan(guardIdx);
    expect(app.slice(guardIdx, publishIdx)).toContain('}):null;');
  });

  test('발행이 켜져 있으면 처리방침에 공개 고지가 있어야 한다', () => {
    if (!SOCIAL_PROFILE_PUBLISH_ENABLED) return; // 꺼져 있으면 고지 의무도 없다
    expect(hasDisclosureClause()).toBe(true);
    // 스토어 신고서에도 공개 사실이 적혀 있어야 한다(콘솔 설문에 옮겨 적을 실물).
    expect(read('docs/store-privacy-labels.md')).toContain('다른 이용자에게 공개되는 정보');
  });

  test('발행이 켜져 있으면 동의 화면과 볼 화면이 둘 다 있어야 한다', () => {
    if (!SOCIAL_PROFILE_PUBLISH_ENABLED) return;
    // ① 옵트인 — 동의 없이는 발행되지 않는다
    expect(fs.existsSync(path.join(repoRoot, 'SocialConsentScreen.rn.tsx'))).toBe(true);
    expect(read('lib/publicProfile.ts')).toMatch(/if \(input\?\.visibility !== 'public'\) return null;/);
    // ② 볼 화면 — 올려놓고 아무도 못 보는 상태(AUDIT 1 사고의 정의)를 막는다
    expect(fs.existsSync(path.join(repoRoot, 'RunnerProfileScreen.rn.tsx'))).toBe(true);
    expect(read('lib/publicProfile.ts')).toMatch(/export async function fetchPublicProfile/);
  });

  test('공개 프로필에는 경로·신체정보가 들어가지 않는다 — 고지와 코드가 같은 말을 한다', () => {
    // 처리방침 제4조의2 ②가 "공개되지 않는다"고 약속한 항목들. 미러 타입에 이 이름들이
    // 생기면 고지가 거짓이 된다. (상세 계약은 lib/publicProfile 단위 테스트가 본다.)
    const src = read('lib/publicProfile.ts');
    const typeBlock = /export interface PublicProfile \{[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
    expect(typeBlock).toBeTruthy();
    for (const forbidden of ['route', 'weight', 'age', 'sex', 'restingHr', 'memo', 'photo']) {
      expect(typeBlock.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

// ─── 랭킹: 진입점·설명·고지가 발행 플래그를 따라간다 ──────────────────────────
describe('월간 랭킹 — 발행과 노출의 일관성', () => {
  test('진입점 주입이 LEADERBOARD_PUBLISH_ENABLED 를 함께 본다', () => {
    // 발행이 꺼져 있으면 어느 달이든 리더보드가 비어, 화면은 영구히 "랭킹이 곧 열려요"만
    // 띄운다 — App Store 2.1(미완성)·4.2('coming soon'). 진입점은 **데이터를 만드는
    // 플래그를 따라가야 한다**(2026-08-02 심사 감사 B-3).
    expect(read('App.tsx')).toContain(
      "LEADERBOARD_PUBLISH_ENABLED&&socialVisibility==='public'?{onOpenHallOfFame:",
    );
  });

  test('스토어 설명은 실제로 동작하는 기능만 광고한다', () => {
    const listing = read('docs/store-listing.md');
    // 켜져 있으면 광고해도 된다. 꺼져 있으면 **광고하면 안 된다**(없는 기능 = 리젝 사유).
    expect(listing.includes('월간 랭킹')).toBe(LEADERBOARD_PUBLISH_ENABLED);
  });

  test('발행이 켜져 있으면 처리방침에 순위 공개 고지가 있어야 한다', () => {
    if (!LEADERBOARD_PUBLISH_ENABLED) return;
    expect(hasDisclosureClause()).toBe(true);
    expect(read('docs/privacy.html')).toContain('월간 순위');
  });

  test('발행 구현과 화면은 삭제되지 않고 남아 있다(끄고 켤 수 있어야 한다)', () => {
    expect(fs.existsSync(path.join(repoRoot, 'HallOfFameScreen.rn.tsx'))).toBe(true);
    expect(read('lib/progression/firestoreRankingStore.ts')).toMatch(
      /export async function publishMyRanking/,
    );
  });
});
