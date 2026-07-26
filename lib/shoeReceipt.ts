// ─── 영수증·박스 라벨에서 러닝화 정보 읽기 (2026-07-27, 앞당김 #17) ──────────────
// 왜: 신발 등록이 온보딩의 최대 마찰점이다. 브랜드를 고르고 모델을 찾고 구매일을 입력하는
// 세 단계를 손으로 하다가 사람이 빠져나간다. 등록은 리텐션의 분기점이라(첫 신발을 넣은
// 사용자와 아닌 사용자의 이후 행동이 갈린다) 여기서 초를 줄이는 값이 가장 크다.
//
// 이미 가진 자산을 그대로 쓴다 — @react-native-ml-kit/text-recognition 은 대회 기록증
// OCR(lib/ocr)로 이미 붙어 있다. 새 네이티브 의존성 없이 인식기(TextRecognizer)만 주입받는다.
//
// 이 파일은 **순수 파싱**만 한다: OCR 텍스트 → {브랜드·모델·구매일·가격} 후보.
// 확신이 없으면 비워서 돌려준다 — 틀린 값을 채워 넣는 것보다 비는 편이 낫다
// (사용자가 잘못된 모델로 등록하면 수명 계산 전체가 조용히 틀린다).

import {SHOE_MODELS, findShoeModel, type ShoeModel} from '../data/shoeModels';
import {type TextRecognizer} from './ocr';

export interface ReceiptFields {
  /** 카탈로그에서 확정된 브랜드. 못 찾으면 ''. */
  brand: string;
  /** 카탈로그에서 확정된 모델. 못 찾으면 ''. */
  model: string;
  /** 카탈로그 매칭 결과(수명 기본값 등에 쓴다). 못 찾으면 null. */
  matched: ShoeModel | null;
  /** 구매일('YYYY-MM-DD'). 못 찾으면 ''. */
  purchaseDate: string;
  /** 결제 금액(원). 못 찾으면 null. */
  priceKrw: number | null;
}

export const EMPTY_RECEIPT: ReceiptFields = {
  brand: '',
  model: '',
  matched: null,
  purchaseDate: '',
  priceKrw: null,
};

/** 비교용 정규화 — 대소문자·공백·하이픈 무시(카탈로그 조회와 같은 결). */
function norm(s: string): string {
  return String(s).toLowerCase().replace(/[\s\-_]+/g, '');
}

/**
 * 텍스트에서 구매일을 찾는다. 영수증에 흔한 세 표기를 받는다:
 *   2026-07-27 · 2026.07.27 · 2026/07/27 · 2026년 7월 27일
 * 여러 개면 **가장 이른 날짜**를 고른다 — 영수증에는 발행일 외에 유효기간·교환기한 같은
 * 미래 날짜가 함께 찍히는 경우가 많고, 구매일은 그중 가장 앞이다.
 */
export function parseReceiptDate(text: string): string {
  const found: string[] = [];
  const push = (y: number, m: number, d: number) => {
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return;
    found.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  };
  const numeric = /(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/g;
  let m: RegExpExecArray | null;
  while ((m = numeric.exec(text)) !== null) push(+m[1], +m[2], +m[3]);
  const korean = /(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g;
  while ((m = korean.exec(text)) !== null) push(+m[1], +m[2], +m[3]);
  if (found.length === 0) return '';
  found.sort();
  return found[0];
}

/**
 * 결제 금액을 찾는다. '합계/결제/총액' 같은 라벨이 있는 줄을 우선하고, 없으면 텍스트에서
 * 가장 큰 금액을 고른다(영수증엔 단가·부가세·거스름돈이 섞여 있고 결제액이 보통 가장 크다).
 * 러닝화 가격대를 벗어난 값(1만원 미만·200만원 초과)은 잡음으로 버린다.
 */
export function parseReceiptPrice(text: string): number | null {
  const MIN = 10000;
  const MAX = 2000000;
  const amounts: {value: number; labeled: boolean}[] = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const labeled = /합\s*계|결\s*제|총\s*액|판매금액|total|amount/i.test(line);
    // 숫자 덩어리의 **양 끝**을 막는다. 앞뒤 가드가 없으면 사업자번호(1234567890) 같은 긴
    // 숫자에서 앞 7자리를 떼어 '1,234,567원'으로 읽는다(이 테스트가 실제로 잡아냈다).
    const re = /(^|[^\d,])(\d{1,3}(?:,\d{3})+|\d{5,7})(?!\d)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const v = Number(m[2].replace(/,/g, ''));
      if (Number.isFinite(v) && v >= MIN && v <= MAX) amounts.push({value: v, labeled});
    }
  }
  if (amounts.length === 0) return null;
  const labeled = amounts.filter(a => a.labeled);
  const pool = labeled.length > 0 ? labeled : amounts;
  return pool.reduce((best, a) => (a.value > best ? a.value : best), 0) || null;
}

/**
 * 텍스트에서 카탈로그의 러닝화를 찾는다.
 *
 * 판정 규칙(오탐을 줄이는 쪽으로 보수적):
 *   · 모델명이 통째로 들어 있어야 한다(부분 일치 금지 — 'Pegasus' 로 'Pegasus Trail' 을
 *     고르면 수명 기본값이 달라진다).
 *   · 후보가 여럿이면 **가장 긴 모델명**을 고른다('Pegasus 41' 이 'Pegasus' 보다 구체적).
 *   · 브랜드까지 같은 줄/텍스트에 있으면 신뢰도가 오르지만, 모델만으로도 확정한다
 *     (박스 라벨엔 브랜드가 로고로만 있고 글자가 없는 경우가 흔하다).
 */
export function findShoeInText(text: string): ShoeModel | null {
  const hay = norm(text);
  if (!hay) return null;
  let best: ShoeModel | null = null;
  for (const m of SHOE_MODELS) {
    const model = norm(m.model);
    // 너무 짧은 모델명은 우연 일치가 잦아 브랜드가 함께 보일 때만 인정한다.
    if (model.length < 4) {
      if (!hay.includes(model) || !hay.includes(norm(m.brand))) continue;
    } else if (!hay.includes(model)) {
      continue;
    }
    if (!best || norm(m.model).length > norm(best.model).length) best = m;
  }
  return best;
}

/** OCR 텍스트 → 등록 폼 프리필 후보(순수). 확신 없는 칸은 비운다. */
export function parseReceiptText(text: string): ReceiptFields {
  const raw = String(text ?? '');
  if (!raw.trim()) return EMPTY_RECEIPT;
  const matched = findShoeInText(raw);
  return {
    brand: matched?.brand ?? '',
    model: matched?.model ?? '',
    matched: matched ?? null,
    purchaseDate: parseReceiptDate(raw),
    priceKrw: parseReceiptPrice(raw),
  };
}

/**
 * 사진에서 등록 정보 추출(인식기 주입 — 네이티브 의존은 호출부가 소유).
 * 인식 실패는 던지지 않고 빈 결과로 폴백한다 — 자동 채우기가 실패해도 손으로 등록하는
 * 길은 항상 열려 있어야 한다.
 */
export async function extractShoeFromImage(
  recognizer: TextRecognizer,
  imageUri: string,
): Promise<ReceiptFields> {
  try {
    const text = await recognizer.recognize(imageUri);
    return parseReceiptText(text);
  } catch {
    return EMPTY_RECEIPT;
  }
}

/** 카탈로그에 이름만 있는 신발도 찾을 수 있게 — 브랜드+모델 문자열로 직접 조회(래퍼). */
export function lookupShoe(brand: string, model: string): ShoeModel | null {
  return findShoeModel(brand, model) ?? null;
}
