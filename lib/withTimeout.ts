// ============================================================================
// lib/withTimeout.ts — "언젠가는 끝난다"를 보장하는 최소 유틸
// ----------------------------------------------------------------------------
// 왜 필요한가(2026-08-04 QA 감사 Q-2·Q-3): 이 앱에는 **거부되지 않고 그냥 안 끝나는**
// 프라미스가 둘 있었다.
//   · Firestore 쓰기 — 오프라인 영속이 켜져 있으면 로컬엔 즉시 반영되지만 프라미스는
//     서버 ack 까지 pending 이다. 즉 비행기모드에서 `await deleteDoc(...)` 은 throw 가
//     아니라 **영원한 대기**다. try/catch 로는 절대 잡을 수 없다.
//   · OS 역지오코딩 — 네트워크 상태에 따라 수 초에서 무한정.
// 둘 다 호출부는 `try { await … } catch {}` 로 "실패하면 안내한다"고 적어 뒀지만, 실패가
// 오지 않으므로 안내도 오지 않았다. 사용자에게는 **아무 반응 없는 버튼**으로 보인다.
//
// 설계 원칙:
//   · 원본 프라미스를 취소하지 않는다(취소 가능한 API 가 아니다). 늦게 끝나면 그 결과는
//     그냥 버려진다 — 우리가 보장하는 건 "호출부가 언젠가 진행한다"는 것뿐이다.
//   · 타임아웃은 **일반 실패와 구별 가능해야 한다.** "서버가 거절했다"와 "서버에 닿지도
//     못했다"는 대응이 다르기 때문이다(전자는 넘어가도 되고, 후자는 넘어가면 안 되는
//     경우가 있다 — 탈퇴가 그렇다).
//   · 타이머는 반드시 정리한다(누수 금지). 성공/실패 어느 쪽이든.
// ============================================================================

/** 제한 시간 안에 끝나지 않은 작업. 일반 실패와 구별하려고 별도 타입으로 던진다. */
export class TimeoutError extends Error {
  readonly isTimeout = true;
  constructor(public readonly label: string, public readonly ms: number) {
    super(`시간 초과: ${label} (${ms}ms)`);
    this.name = 'TimeoutError';
  }
}

/** 이 오류가 '시간 초과'인가. instanceof 는 번들 경계에서 깨질 수 있어 표식으로도 본다. */
export function isTimeoutError(e: unknown): boolean {
  return (
    e instanceof TimeoutError ||
    !!(e && typeof e === 'object' && (e as {isTimeout?: unknown}).isTimeout === true)
  );
}

/**
 * `p` 가 `ms` 안에 끝나지 않으면 TimeoutError 로 거절한다.
 *
 * @param label 오류 메시지·계측에 쓰는 사람이 읽는 이름(예: '클라우드 백업 삭제').
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new TimeoutError(label, ms));
    }, ms);
    p.then(
      v => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * `withTimeout` 의 '실패해도 괜찮은' 버전 — 시간이 초과되거나 실패하면 `fallback` 을 준다.
 * 결과가 **장식**인 곳에 쓴다(예: 위치 라벨). 본문이 그것 때문에 늦어져선 안 되는 자리.
 */
export async function withTimeoutOr<T>(
  p: Promise<T>,
  ms: number,
  label: string,
  fallback: T,
): Promise<T> {
  try {
    return await withTimeout(p, ms, label);
  } catch {
    return fallback;
  }
}
