// notifCopyHonesty.test.ts — 알림 카피가 실제 동작을 넘어서지 않는지 (2026-07-30)
//
// 이 앱의 알림은 **발화 방식이 두 갈래**인데 카피가 그걸 뭉개고 있었다.
//   · 러닝 리마인더 — expo-notifications OS 스케줄. 앱이 닫혀 있어도 울린다(lib/localReminder,
//     App.tsx 의 syncRunReminder 로 배선됨). 단 이미 달린 날은 건너뛴다(reminderFireDates).
//   · 교체 임박 · 주간 목표 — OS 스케줄이 아니다. 앱을 열었을 때 계산해 보여주는 인앱
//     안내다(lib/notifications.dueNotifications → pushMessaging.presentDue).
//     원격 푸시로 보낼 수단도 없다(FCM_REGISTER_ENDPOINT 가 빈 문자열).
//
// 그런데 권한 프라이밍 다이얼로그는 세 가지를 나란히 "알려드려요"라고 약속했다. 알림
// 권한을 요구하면서 그중 둘은 알림으로 오지 않는다 — 정직 원칙(MISSION/BRAND) 위반이고,
// 사용자에겐 "알림 켰는데 안 온다"로 체감된다.
//
// 여기서 고정하는 것: 그 과장이 되살아나지 않는 것. 문구 자체를 통째로 박지는 않는다
// (다듬을 여지는 남겨야 한다) — '무엇을 약속하면 안 되는가'만 검사한다.

import fs from 'fs';
import path from 'path';

import {DEFAULT_ALERTS} from '../lib/settings';
import {FCM_REGISTER_ENDPOINT} from '../lib/pushMessaging';

const repoRoot = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** 권한 프라이밍 다이얼로그의 본문(제목 '알림을 켤까요?' 바로 다음 문자열). */
function primingBodies(src: string): string[] {
  const out: string[] = [];
  const re = /'알림을 켤까요\?',\s*\n?\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

describe('알림 권한 프라이밍 카피', () => {
  const files = ['App.tsx', 'ProfileScreen.rn.tsx'];

  test('두 곳 모두에 프라이밍이 있고 본문이 서로 같다(한 곳만 고치는 표류 방지)', () => {
    const bodies = files.flatMap(f => primingBodies(read(f)));
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
  });

  test('OS 알림으로 오지 않는 것을 알림처럼 약속하지 않는다', () => {
    for (const body of files.flatMap(f => primingBodies(read(f)))) {
      // 교체·주간 목표를 언급할 수는 있다. 다만 '앱을 열 때'라는 단서가 반드시 붙어야 한다.
      const mentionsInApp = /교체|주간 목표/.test(body);
      if (mentionsInApp) expect(body).toMatch(/앱을 열 때/);
      // 실제로 OS 스케줄되는 건 러닝 리마인더뿐 — 그건 약속해도 된다.
      expect(body).toMatch(/러닝 리마인더/);
    }
  });
});

describe('알림 설정 패널 안내', () => {
  test('두 갈래(정시 발화 vs 앱 열 때)를 구분해 적는다', () => {
    const src = read('ProfileScreen.rn.tsx');
    const hint = /러닝 리마인더는[^<]*교체·주간 목표는 앱을 열 때[^<]*/.exec(src)?.[0] ?? '';
    expect(hint).not.toBe('');
    // '매일'은 사실이 아니다 — 이미 달린 날은 건너뛴다(reminderFireDates 의 ranToday).
    expect(hint).not.toMatch(/매일/);
    expect(hint).toMatch(/달린 날은 건너뛰/);
  });
});

describe('온보딩 교체 알림 소개', () => {
  test('고정 거리로 약속하지 않는다 — 임계는 수명 대비 비율이다', () => {
    const src = read('OnboardingScreen.rn.tsx');
    const row = /title: '교체 알림', desc: '([^']*)'/.exec(src)?.[1] ?? '';
    expect(row).not.toBe('');
    // 'NNkm 전' 같은 고정 거리 약속 금지(신발 수명마다 실제 거리가 다르다).
    expect(row).not.toMatch(/\d+\s*km/);
    // 기본 임계(사용률 90%)와 같은 값을 말해야 한다 = 남은 10%.
    expect(row).toContain(`${100 - DEFAULT_ALERTS.thresholdPct}%`);
  });
});

describe('전제 검증 — 카피가 기대는 사실이 아직 참인가', () => {
  test('원격 푸시 발송 수단이 없다(있으면 위 카피 전제를 다시 봐야 한다)', () => {
    expect(FCM_REGISTER_ENDPOINT).toBe('');
  });

  test('러닝 리마인더는 실제로 OS 스케줄에 배선돼 있다', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/import\s*\{[^}]*syncRunReminder[^}]*\}\s*from\s*'\.\/lib\/localReminder'/);
    expect(app).toMatch(/syncRunReminder\(\{/); // 호출까지 존재
  });
});
