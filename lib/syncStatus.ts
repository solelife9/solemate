// lib/syncStatus — '마지막 동기화 시각' 칩 텍스트를 만드는 순수 함수.
//
// 당겨서 새로고침(RefreshControl)이 서버 재fetch/pending flush 를 성공시키면 App 이
// 그 시각(epoch ms)을 내려주고, Home 의 칩이 이 함수로 사람 친화적 상대시간을 그린다.
// UI 없이 순수 함수라 경계값(방금/분/시간/일)을 결정적으로 테스트할 수 있다.
//
//   null/미동기      → '동기화 안 됨'
//   < 60초           → '방금 동기화'
//   < 60분           → 'N분 전'
//   < 24시간         → 'N시간 전'
//   그 이상          → 'N일 전'

/**
 * 마지막 동기화 시각(epoch ms)을 기준(nowMs) 대비 상대시간 라벨로 만든다.
 * lastSyncAt 이 없거나(미동기) 비정상이면 '동기화 안 됨'. 미래값(시계 역행)은 '방금 동기화'로 본다.
 */
export function syncLabel(lastSyncAt: number | null | undefined, nowMs: number): string {
  if (lastSyncAt == null || !Number.isFinite(lastSyncAt) || lastSyncAt <= 0) {
    return '동기화 안 됨';
  }
  const diffMs = Math.max(0, nowMs - lastSyncAt);
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금 동기화';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}
