// ============================================================================
// 안드로이드 걸음 정지 게이트 — 거짓 신선도 금지 (2026-08-07 감사)
//
// 무슨 일이 있었나
// ----------------------------------------------------------------------------
// 2026-08-05 커밋 1aeebe4 가 안드로이드 케이던스를 되살렸다(getStepCountAsync 가 항상
// 예외를 던지던 것 → watchStepCount 구독으로 교체). 케이던스는 고쳐졌는데, **같은 값이
// 걸음 정지 게이트도 먹인다**는 것이 함께 고려되지 않았다.
//
//   · watchStepCount 는 걸음 '이벤트'로만 발화한다.
//   · 화면이 꺼지면 expo-sensors 가 onHostPause 에서 구독을 멈춘다(SensorProxy).
//   · 그런데 2.5초 폴링은 계속 돌면서 **얼어붙은 누적값에 Date.now() 를 찍어** 먹였다.
//
// 그러면 runTracker 가 보는 신호는 "표본은 신선한데 걸음이 안 는다" = 서 있음이 된다.
// 12초 뒤 거리 적산이 얼어붙고, 2분이 지나면 누적 300m 를 넘겨 re-anchor 로 **그 거리가
// 영구 소실**된다. 게이트 조건이 칼만 속도 2.5m/s 미만이라 대상은
// **6'40"/km 보다 느린 러너 전부** — 즉 대다수다.
//
// 수정 전에는 getStepCountAsync 가 먼저 예외를 던져 feedSteps 까지 도달하지도 못했다.
// 즉 그 게이트는 안드로이드에서 **한 번도 동작한 적이 없었고**, 되살리는 순간 신선도
// 신호가 거짓말이 되면서 이 결함이 태어났다.
//
// 왜 이 파일이 소스 텍스트를 보는가
// ----------------------------------------------------------------------------
// runTracker 쪽 계약("신선한데 안 늘면 서 있음", "스테일이면 게이트 해제")은 이미 옳고
// __tests__/lib/runTracker.test.ts 가 양쪽을 다 고정하고 있다. **잘못은 호출부에 있었다** —
// 추적기에 거짓 신선도를 먹인 것. 그런데 그 호출부는 RunEngine 의 setInterval 안이라,
// 실제 동작으로 재현하려면 컴포넌트 렌더 + 타이머 + AppState + Pedometer 구독 수명주기를
// 전부 세워야 한다. 그 하네스 자체가 목이라 "진짜 그런가"를 증명하지 못한다.
//
// 그래서 이 저장소가 같은 종류의 배선을 지킬 때 쓰는 방식(nativePermissions ·
// leaderboardPublishFlag)을 따른다: **계약을 소스에서 직접 읽어 못 박는다.**
// 실기기 검증 항목이기도 하다 — 안드로이드로 화면 끄고 7'00"/km 10분.
// ============================================================================
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('안드로이드 걸음 게이트 — 백그라운드에서 거짓 신선도를 먹이지 않는다', () => {
  const src = read('screens/RunEngine.tsx');

  test('feedSteps 는 신뢰할 수 있는 표본일 때만 부른다', () => {
    // 무조건 호출(옛 형태)이 되살아나면 빨개진다.
    expect(src).not.toMatch(/^\s*runTracker\.feedSteps\(steps,Date\.now\(\)\);\s*$/m);
    expect(src).toContain('if(stepSignalTrustworthy) runTracker.feedSteps(');
  });

  test('신뢰 판정이 안드로이드 + 앱 활성 여부를 본다', () => {
    // 안드로이드가 아니면(iOS) 항상 신뢰한다 — getStepCountAsync 는 구간 조회라
    // 백그라운드에서도 진짜 최신값을 준다. 안드로이드만 AppState 를 봐야 한다.
    expect(src).toContain(
      "const stepSignalTrustworthy=Platform.OS!=='android'||AppState.currentState==='active'",
    );
  });

  test('케이던스 구독은 그대로 살아 있다 — 이 수정이 1aeebe4 를 되돌리지 않는다', () => {
    // 게이트만 막는 것이지 케이던스를 다시 죽이면 안 된다.
    expect(src).toContain('Pedometer.watchStepCount(');
    expect(src).not.toContain('Pedometer.getStepCountAsync(stepT0,new Date())?.steps');
  });
});

describe('runTracker 쪽 계약은 그대로다 — 잘못은 호출부였다', () => {
  const src = read('lib/runTracker.ts');

  test('게이트는 여전히 표본 신선도 + 걸음 증가 + 속도 상한 세 조건을 본다', () => {
    expect(src).toContain('const stillGated =');
    expect(src).toContain('STEP_SIGNAL_FRESH_MS');
    expect(src).toContain('STEP_STILL_GATE_MS');
    expect(src).toContain('STEP_GATE_MAX_SPEED_MPS');
  });
});
