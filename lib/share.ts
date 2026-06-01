// ─── 런 공유 텍스트 생성 — 순수함수 (네이티브 의존성 0) ─────────────────────────
// 런 상세의 '공유' 버튼이 RN Share API로 내보낼 한국어 텍스트 요약을 만든다.
// I/O·네이티브 모듈을 전혀 쓰지 않으므로 단위테스트로 문자열을 그대로 검증한다.
//
// 거리는 저장 표준 km를 받아 표시 단위(km|mi)로 환산해 소수 2자리로 출력한다
// (런 상세 화면의 displayNum(dist, unit, 2)와 동일한 규칙). 페이스·시간은 이미
// 포맷된 문자열을 그대로 받아 쓰되 '--'(의미 없는 값)는 줄째로 생략한다.
// 톤은 Keego(keep going) 브랜드에 맞춘 응원 한 줄 + 해시태그.

import {Unit, displayNum} from './units';

export interface RunShareInput {
  /** 거리 — 저장 표준 km. 표시 단위로 환산해 출력한다. */
  distKm: number;
  /** 표시 단위(km|mi). 기본 'km'. */
  unit?: Unit;
  /** 이미 포맷된 평균 페이스(예: `5'02"`). 비었거나 '--'면 줄 생략. */
  pace?: string;
  /** 이미 포맷된 시간(예: `40:41`). 비었거나 '--'면 줄 생략. */
  time?: string;
  /** 신발 브랜드(예: NIKE). 모델과 합쳐 한 줄로 표시. */
  shoeBrand?: string;
  /** 신발 모델(예: Pegasus 41). */
  shoeModel?: string;
  /** 선택: 러닝 날짜 라벨(예: `5월 28일 수요일`). 비면 줄 생략. */
  date?: string;
}

const HEADER = '오늘도 한 걸음 더 — keep going! 🏃';
const FOOTER = '#Keego #keepgoing';

/**
 * 런 한 건을 공유용 한국어 텍스트 요약으로 변환한다.
 *
 * 항상 응원 헤더와 거리 줄, 해시태그 푸터를 포함한다. 날짜·시간·페이스·신발은
 * 값이 있을 때만(페이스·시간은 '--'가 아닐 때만) 줄이 추가되므로, 데이터가
 * 비어도 깨지지 않는 깔끔한 요약이 나온다.
 */
export function buildRunShareText(input: RunShareInput): string {
  const unit = input.unit ?? 'km';
  const dist = displayNum(input.distKm, unit, 2).toFixed(2);
  const shoe = [input.shoeBrand, input.shoeModel]
    .map(s => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');

  const lines: string[] = [HEADER, ''];
  if (input.date && input.date.trim()) lines.push(`🗓️ ${input.date.trim()}`);
  lines.push(`📍 거리 ${dist} ${unit}`);
  if (input.time && input.time !== '--') lines.push(`⏱️ 시간 ${input.time}`);
  if (input.pace && input.pace !== '--') lines.push(`⚡ 페이스 ${input.pace} /${unit}`);
  if (shoe) lines.push(`👟 신발 ${shoe}`);
  lines.push('', FOOTER);
  return lines.join('\n');
}
