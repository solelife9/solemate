/**
 * 거리 PB — 캐시 미스를 직렬로 읽지 않는다 (QA 감사 Q-4).
 *
 * 평소엔 캐시가 막아 새 런 한둘만 읽는다. 문제는 **재설치·기기 변경 직후 첫 부팅**이다:
 * 캐시가 비어 전량이 미스라, `for … await` 직렬이면 런 1000건이 한 줄로 늘어서고 그동안
 * 거리 PB 가 비어 있다. 그렇다고 전량 동시도 안 된다 — paceTrack 은 런당 수십 KB 라
 * 1000개를 한꺼번에 메모리에 올리는 쪽이 더 위험하다. 그래서 묶음 단위 병렬이다.
 *
 * (같은 감사에서 고친 노면 태그 일괄 조회는 2026-08-04 노면 모델 폐기와 함께 조회 자체가
 *  사라져 회귀 가드도 함께 제거했다.)
 *
 * @format
 */
import {getDistancePBs, PB_LOAD_CHUNK} from '../../lib/distancePBStore';

const N = 60;

test('캐시 미스를 묶음 단위로 병렬 로드한다 — 직렬도, 무제한 동시도 아니다', async () => {
  const ids = Array.from({length: N}, (_, i) => `r${i}`);
  let inFlight = 0;
  let peak = 0;
  const cache: Record<string, unknown> = {};

  await getDistancePBs(ids, {
    loadTrack: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return null;
    },
    getCache: async () => null,
    setCache: async c => {
      Object.assign(cache, c);
    },
  });

  // 직렬(1)이 아니다 — 그게 재설치 직후 첫 부팅을 느리게 만들던 원인이다.
  expect(peak).toBeGreaterThan(1);
  // 그렇다고 전량 동시도 아니다 — 시계열은 런당 수십 KB 라 상한이 있어야 한다.
  expect(peak).toBeLessThanOrEqual(PB_LOAD_CHUNK);
  // 미스 전량이 '계산됨' 표식으로 채워져 다음 조회는 다시 읽지 않는다.
  expect(Object.keys(cache)).toHaveLength(N);
});
