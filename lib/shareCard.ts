// ─── 런 공유 카드(이미지) — 필드 매핑(순수) + dataURL 캡처 경로 ──────────────────
// 런 상세의 '카드 공유' 버튼이 거리/페이스/시간/신발명/미니 코스맵을 react-native-svg
// 카드로 그린 뒤, Svg ref의 toDataURL()로 PNG dataURL을 만들어 RN Share로 내보낸다.
//
// 새 네이티브 의존(view-shot 등)은 추가하지 않는다 — 이미 설치된 react-native-svg의
// Svg.toDataURL만 사용한다. 이 파일은 다음 두 가지를 네이티브 없이 검증 가능하게 분리한다:
//   1) buildShareCardModel — 런 한 건 → 카드 표시 필드(순수함수, 단위 테스트)
//   2) captureCardDataUrl  — Svg ref → 'data:image/png;base64,…' (콜백→Promise 래핑)
// 캔버스 자체는 jest.setup의 Svg 목이 toDataURL을 흉내 내므로 경로를 그대로 테스트한다.

import {Share} from 'react-native';
import {Unit, displayNum} from './units';
import {buildRunShareText, RunShareInput} from './share';

export interface ShareCardInput {
  /** 거리 — 저장 표준 km. 표시 단위로 환산해 출력한다. */
  distKm: number;
  /** 표시 단위(km|mi). 기본 'km'. */
  unit?: Unit;
  /** 이미 포맷된 평균 페이스(예: `5'02"`). 비었거나 '--'면 칸 생략. */
  pace?: string;
  /** 이미 포맷된 시간(예: `40:41`). 비었거나 '--'면 칸 생략. */
  time?: string;
  /** 신발 브랜드(예: NIKE). 모델과 합쳐 한 줄로 표시. */
  shoeBrand?: string;
  /** 신발 모델(예: Pegasus 41). */
  shoeModel?: string;
  /** 러닝 날짜 라벨(예: `5월 28일 수요일`). 비면 생략. */
  date?: string;
}

export interface ShareCardStat {
  label: string;
  value: string;
}

export interface ShareCardModel {
  /** 거리 숫자 문자열(표시 단위 환산, 소수 2자리). 예: '5.20'. */
  distance: string;
  /** 거리 단위 라벨('km'|'mi'). */
  unit: string;
  /** 페이스·시간 등 부가 지표(의미 없는 '--' 값은 빠진다). */
  stats: ShareCardStat[];
  /** 신발명(브랜드+모델, 둘 다 없으면 ''). */
  shoe: string;
  /** 날짜 라벨('' 가능). */
  date: string;
  /** Keego 워드마크. */
  brand: string;
  /** keep-going 응원 한 줄. */
  tagline: string;
  /** 해시태그 푸터. */
  hashtag: string;
}

const BRAND = 'Keego';
const TAGLINE = '오늘도 한 걸음 더 — keep going';
const HASHTAG = '#Keego #keepgoing';

/**
 * 런 한 건을 공유 카드의 표시 필드로 변환한다(순수함수, 네이티브 의존 0).
 *
 * 거리는 표시 단위(km|mi)로 환산해 소수 2자리. 페이스 라벨은 항상 '/km'로 고정한다
 * (앱 전체와 동일 — lib/share buildRunShareText와 같은 규칙: 페이스 값은 언제나
 * 초/km이므로 mi 모드라도 /mi로 거짓 표기하지 않는다). 페이스·시간이 '--'(의미 없는
 * 값)면 그 칸은 빠지고, 신발/날짜가 비면 ''로 비워져 카드 레이아웃이 깨지지 않는다.
 */
export function buildShareCardModel(input: ShareCardInput): ShareCardModel {
  const unit = input.unit ?? 'km';
  const distance = displayNum(input.distKm, unit, 2).toFixed(2);
  const shoe = [input.shoeBrand, input.shoeModel]
    .map(s => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');

  const stats: ShareCardStat[] = [];
  if (input.pace && input.pace !== '--') {
    stats.push({label: '평균 페이스', value: `${input.pace} /km`});
  }
  if (input.time && input.time !== '--') {
    stats.push({label: '시간', value: input.time});
  }

  return {
    distance,
    unit,
    stats,
    shoe,
    date: (input.date ?? '').trim(),
    brand: BRAND,
    tagline: TAGLINE,
    hashtag: HASHTAG,
  };
}

// react-native-svg의 Svg 인스턴스가 노출하는 최소 인터페이스(우리가 쓰는 건 toDataURL뿐).
export interface SvgCapturable {
  toDataURL(callback: (base64: string) => void, options?: object): void;
}

export type SvgRefLike = {current: SvgCapturable | null} | null | undefined;

/**
 * Svg ref의 toDataURL(callback) 콜백 계약을 Promise로 감싸 'data:image/png;base64,…'
 * 문자열로 해석한다. ref가 아직 마운트 전이거나 toDataURL이 없으면(=캔버스 미준비)
 * reject 하므로 호출자가 텍스트 공유로 폴백할 수 있다. 빈 base64도 실패로 본다.
 */
export function captureCardDataUrl(ref: SvgRefLike): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const node = ref && ref.current;
    if (!node || typeof node.toDataURL !== 'function') {
      reject(new Error('share card not ready'));
      return;
    }
    let settled = false;
    try {
      node.toDataURL((base64: string) => {
        if (settled) return;
        settled = true;
        if (!base64) {
          reject(new Error('empty share card image'));
          return;
        }
        resolve(`data:image/png;base64,${base64}`);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * 카드 이미지를 캡처해 RN Share로 공유한다. 캡처가 실패하면(네이티브 캔버스 미준비
 * 등) 기존 텍스트 공유(buildRunShareText)로 조용히 폴백한다 — 사용자에게는 항상
 * 무언가가 공유되거나, 닫아도 예외가 표면화되지 않는다.
 */
export async function shareRunCard(ref: SvgRefLike, fallback: RunShareInput): Promise<void> {
  try {
    const url = await captureCardDataUrl(ref);
    await Share.share({url});
  } catch {
    await Share.share({message: buildRunShareText(fallback)}).catch(() => {});
  }
}
