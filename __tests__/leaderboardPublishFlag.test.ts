// leaderboardPublishFlag.test.ts — 리더보드 발행이 꺼져 있음을 고정한다(2026-07-29 감사).
//
// 왜 이 테스트가 있나: 랭킹 화면 진입점이 없는데도 클라우드 동기마다 닉네임·월간 거리가
// 전원 읽기 가능한 `leaderboards` 컬렉션에 동의 없이 발행되고 있었다. 발행 구현은 1.1
// 재개봉을 위해 남겨뒀으므로, **호출이 실수로 되살아나는 것**을 여기서 막는다.
//
// 검증은 두 겹이다:
//  1) 플래그 기본값이 false 인가(값 자체).
//  2) App 의 발행 함수가 그 플래그로 early-return 하는가(정적 스캔 — 플래그만 만들어두고
//     막상 가드를 안 거는 실수를 잡는다).

import fs from 'fs';
import path from 'path';

import {LEADERBOARD_PUBLISH_ENABLED} from '../lib/featureFlags';

const repoRoot = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('리더보드 발행 플래그', () => {
  // 2026-08-03: 조건 셋(옵트인·진입점·처리방침 고지)을 모두 갖춰 **켰다**.
  // 그래서 여기서 값을 `false` 로 못 박지 않는다 — 그건 켜는 순간 의미를 잃는 단언이고,
  // 실제로 그렇게 됐다. 지켜야 할 진짜 불변식은 "발행이 켜져 있으면 동의·진입점·고지가
  // 갖춰져 있다"이며, 그건 `socialProfilePublishFlag.test.ts` 가 양방향으로 본다.
  // 이 파일은 **코드 게이트**(플래그를 실제로 거는가 · 구현이 남아 있는가)에 집중한다.
  test('발행이 켜져 있다면 동의 가드가 코드에 살아 있어야 한다', () => {
    if (!LEADERBOARD_PUBLISH_ENABLED) return; // 꺼져 있으면 애초에 발행되지 않는다
    // 플래그를 통과해도 **동의하지 않은 사용자는 발행되지 않는다** — AUDIT 1 사고가
    // 정확히 '동의 없이 공개'였다. 플래그와 동의는 별개의 두 겹이다.
    expect(read('App.tsx')).toContain("if(socialVisibility!=='public'){");
  });

  // 2026-08-07 감사: 위 가드는 **멈추기만 하고 내리지는 않았다.**
  // unpublish 함수는 있었지만 유일한 호출부가 publishMyRanking 안(가드 뒤)이라
  // 도달할 수 없는 코드였다. 그래서 동의를 철회해도 닉네임·이번 달 거리·신발·랭크가
  // 로그인한 전원에게 계속 보였고 **앱에서 내릴 방법이 없었다.**
  // 처리방침 "공개 중단 시 또는 회원 탈퇴 시까지"와 정면으로 어긋난 상태였다.
  // 공개 프로필은 null 을 넘겨 제대로 내려간다 — 리더보드만 짝이 빠져 있었다.
  test('동의를 철회하면 발행을 멈추는 게 아니라 내린다', () => {
    if (!LEADERBOARD_PUBLISH_ENABLED) return;
    const app = read('App.tsx');
    // 비공개 분기가 회수를 실제로 부른다.
    const guardIdx = app.indexOf("if(socialVisibility!=='public'){");
    const retractIdx = app.indexOf('await unpublishMyRanking(');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(retractIdx).toBeGreaterThan(guardIdx);
    // 회수 구현이 남아 있고, 소급 삭제(월 순회)를 한다.
    expect(read('lib/progression/firestoreRankingStore.ts')).toMatch(
      /export async function unpublishMyRanking/,
    );
  });

  test('App 의 랭킹 발행이 플래그로 early-return 한다', () => {
    const app = read('App.tsx');
    // 플래그를 가져오고 (같은 구문에서 다른 플래그를 함께 가져올 수 있다 —
    // 2026-08-02 에 SOCIAL_PROFILE_PUBLISH_ENABLED 가 합류했다. 검사할 것은
    // '이 플래그를 featureFlags 에서 가져오는가'이지 import 목록의 길이가 아니다.)
    expect(app).toMatch(
      /import\s*\{[^}]*LEADERBOARD_PUBLISH_ENABLED[^}]*\}\s*from\s*'\.\/lib\/featureFlags'/,
    );
    // 발행 함수 본문 첫 줄에서 가드한다(publishMyRanking 호출보다 앞).
    const guardIdx = app.indexOf('if(!LEADERBOARD_PUBLISH_ENABLED) return;');
    const callIdx = app.indexOf('await publishMyRanking({');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(callIdx);
  });

  test('발행 구현과 화면은 삭제되지 않고 남아 있다(1.1 재개봉 전제)', () => {
    expect(fs.existsSync(path.join(repoRoot, 'HallOfFameScreen.rn.tsx'))).toBe(true);
    expect(read('lib/progression/firestoreRankingStore.ts')).toMatch(
      /export async function publishMyRanking/,
    );
  });
});
