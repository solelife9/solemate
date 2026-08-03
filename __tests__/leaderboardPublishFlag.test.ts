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
  test('기본값은 꺼짐 — 동의·진입점 없이 공개 컬렉션에 쓰지 않는다', () => {
    expect(LEADERBOARD_PUBLISH_ENABLED).toBe(false);
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
