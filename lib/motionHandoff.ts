// ============================================================================
// lib/motionHandoff.ts — 화면 전환 셰어드 엘리먼트 좌표 핸드오프(2026-07-16)
//
// 세리머니 → 리캡 히어로 모프: 완주 세리머니(RunActiveScreen.FinishCeremony)가
// 링 중앙 완주 숫자의 '윈도 좌표'를 남기면, 다음에 마운트되는 RunRecapScreen 이
// 1회 소비해 같은 숫자를 그 자리에서 히어로 슬롯으로 날린다(연속된 한 숫자).
//
// 순수 모듈 싱글턴 — 화면 간 콜백 체인(onStop→finishRun→setPhase)이 데이터를
// 실어 나를 수 없어 좌표만 옆길로 전달한다. take 가 소비 즉시 비우므로 과거
// 좌표가 무관한 리캡(기록 열람·크래시 복구 검토)에 새지 않는다.
// ============================================================================

/** 윈도 좌표 + 글리프 크기. fs(fontSize)는 도착 슬롯과의 스케일 비를 정확히 내기 위한
    것 — 텍스트 박스 높이(lineHeight)는 폰트 크기와 비율이 달라 박스비로 스케일하면
    시작 크기가 세리머니 실물과 어긋난다. */
export type HandoffRect = {x: number; y: number; w: number; h: number; fs: number};

let ceremonyNumRect: HandoffRect | null = null;

/** 세리머니가 완주 숫자의 윈도 좌표를 남긴다(레이아웃 확정 시 1회). */
export function setCeremonyNumRect(r: HandoffRect): void {
  ceremonyNumRect = r;
}

/** 리캡이 좌표를 1회 소비한다 — 읽는 즉시 비워진다(재사용·누수 방지). */
export function takeCeremonyNumRect(): HandoffRect | null {
  const r = ceremonyNumRect;
  ceremonyNumRect = null;
  return r;
}
