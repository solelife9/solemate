// socialProfilePublishFlag.test.ts — 공개 프로필 발행이 꺼져 있음을 고정한다
// (2026-08-02 App Store 심사 감사 B-1).
//
// 왜 이 테스트가 있나: 클라우드 동기마다 닉네임·신발·거리 PB·VO₂max 가
// `profiles/{uid}` 에 발행되고 있었고, 그 컬렉션은 **로그인한 전원이 읽을 수 있다**.
// 그런데 공개된 처리방침에는 '다른 이용자에게 공개된다'는 고지가 없고, 스토어 개인정보
// 신고서에도 그 항목이 없었다. AUDIT 1 의 리더보드 사고(767032e)와 패턴이 같다.
//
// 발행 구현과 동의 화면은 1.1 재개봉을 위해 남겨뒀으므로, **호출이 실수로 되살아나는 것**을
// 여기서 막는다. `leaderboardPublishFlag.test.ts` 와 같은 두 겹 구조다:
//  1) 플래그 기본값이 false 인가(값 자체).
//  2) App 이 그 플래그로 실제 가드하는가(정적 스캔 — 플래그만 만들고 안 거는 실수를 잡는다).

import fs from 'fs';
import path from 'path';

import {SOCIAL_PROFILE_PUBLISH_ENABLED} from '../lib/featureFlags';

const repoRoot = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('공개 프로필 발행 플래그', () => {
  test('기본값은 꺼짐 — 고지·뷰어 없이 공개 컬렉션에 쓰지 않는다', () => {
    expect(SOCIAL_PROFILE_PUBLISH_ENABLED).toBe(false);
  });

  test('App 이 플래그를 가져와 발행을 가드한다', () => {
    const app = read('App.tsx');
    expect(app).toMatch(
      /import\s*\{[^}]*SOCIAL_PROFILE_PUBLISH_ENABLED[^}]*\}\s*from\s*'\.\/lib\/featureFlags'/,
    );
    // 프로필 생성 자체가 플래그 뒤에 있어야 한다(만들어 두고 안 보내는 게 아니라, 안 만든다).
    expect(app).toContain('SOCIAL_PROFILE_PUBLISH_ENABLED?buildPublicProfile({');
  });

  test('꺼져 있으면 null 을 넘겨 **이미 올라간 문서까지 내린다**', () => {
    const app = read('App.tsx');
    // `flag ? buildPublicProfile({...}) : null` → publishProfile(port, null) = 삭제 경로.
    // 단순히 호출을 건너뛰면 예전에 발행된 프로필이 서버에 그대로 남는다.
    const guardIdx = app.indexOf('SOCIAL_PROFILE_PUBLISH_ENABLED?buildPublicProfile({');
    const publishIdx = app.indexOf('await publishProfile(cloudPortRef.current as any,profile);');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(publishIdx).toBeGreaterThan(guardIdx);
    // 삼항의 else 가지가 null 인지 — 가드와 발행 사이 구간에서 확인한다.
    expect(app.slice(guardIdx, publishIdx)).toContain('}):null;');
  });

  test('동의 화면도 플래그를 따른다 — 꺼진 기능의 동의를 받지 않는다', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/consentGateOn=[\s\S]{0,240}SOCIAL_PROFILE_PUBLISH_ENABLED/);
  });

  test('발행 구현과 동의 화면은 삭제되지 않고 남아 있다(1.1 재개봉 전제)', () => {
    expect(fs.existsSync(path.join(repoRoot, 'SocialConsentScreen.rn.tsx'))).toBe(true);
    expect(read('lib/publicProfile.ts')).toMatch(/export async function publishProfile/);
    expect(read('lib/publicProfile.ts')).toMatch(/export function buildPublicProfile/);
  });
});

// ─── B-3: 랭킹 진입점은 '데이터를 만드는 플래그'를 따라간다 ────────────────────
// 발행이 꺼져 있으면 어느 달이든 리더보드가 비어 있다. 그때 진입점을 열어 두면 스토어
// 설명에 적힌 기능이 실제로는 "랭킹이 곧 열려요"만 띄우는 빈 화면이 된다
// (App Store 2.1 미완성 · 4.2 'coming soon').
describe('랭킹 진입점 — 발행 플래그와 동기화', () => {
  test('onOpenHallOfFame 주입이 LEADERBOARD_PUBLISH_ENABLED 를 함께 본다', () => {
    const app = read('App.tsx');
    expect(app).toContain(
      "LEADERBOARD_PUBLISH_ENABLED&&socialVisibility==='public'?{onOpenHallOfFame:",
    );
  });

  test('스토어 설명이 없는 기능(월간 랭킹)을 광고하지 않는다', () => {
    expect(read('docs/store-listing.md')).not.toContain('월간 랭킹');
  });
});
