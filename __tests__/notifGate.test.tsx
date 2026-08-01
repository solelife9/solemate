// notifGate.test.tsx — 로그인 전에는 알림을 띄우지 않는다 (2026-07-30 Android 실측 발견)
//
// 증상: 안드로이드 에뮬레이터 첫 실행에서 **로그인 화면 위로** 인앱 알림이 연달아 떴다.
//   · "오늘 달릴 시간이에요 — 오늘은 아직 안 달렸어요"
//   · "이번 주 목표 — 이번 주 목표의 0%를 달렸어요"
// 아직 가입도 하지 않은 사람에게 진척을 말하는 것이라 **내용부터 틀렸고**(기록이 0이니
// 당연히 0%다), 로그인 버튼 위를 덮어 탭까지 가로챘다.
//
// 원인: AppState 'active' → presentDueRef 경로가 인증/부팅 상태를 보지 않았다.
// 로그인 게이트를 통과하기 전에는 알릴 '내 기록'이라는 것 자체가 존재하지 않는다.
//
// 이 테스트는 그 게이트가 사라지면 알려준다 — 화면을 띄우지 않고 정적으로 검사한다
// (실제 표시 경로는 AppState·네이티브에 얽혀 있어 통합 테스트가 불안정하다).

import fs from 'fs';
import path from 'path';

const app = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

/** presentDueRef.current 대입부 본문(중괄호 균형으로 잘라낸다). */
function presentDueBody(src: string): string {
  const start = src.indexOf('presentDueRef.current=()=>{');
  if (start < 0) return '';
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

describe('로그인 전 알림 차단', () => {
  const body = presentDueBody(app);

  test('presentDue 경로가 App.tsx 에 존재한다(리팩터 시 이 테스트부터 갱신할 것)', () => {
    expect(body).not.toBe('');
    expect(body).toContain('dueNotifications');
  });

  test('인증·부팅 상태를 확인한 뒤에만 알림을 계산한다', () => {
    // 게이트가 dueNotifications 호출보다 **앞에** 있어야 한다 — 뒤에 있으면 계산은 돌고
    // 표시만 막혀 의미가 절반이다.
    const gate = body.indexOf('authUser?.uid');
    const compute = body.indexOf('dueNotifications');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(compute);
    expect(body).toMatch(/bootState\s*!==\s*'ready'/);
    // early-return 형태인지(조건만 두고 계속 진행하면 무의미)
    expect(body).toMatch(/if\s*\(\s*!authUser\?\.uid\s*\|\|\s*bootState\s*!==\s*'ready'\s*\)\s*return/);
  });
});
