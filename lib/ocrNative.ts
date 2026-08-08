// ============================================================================
// lib/ocrNative.ts — 온디바이스 텍스트 인식 → OCR 파서용 recognizer
// ============================================================================
// 기록증 사진에서 글자를 읽는다. 읽은 텍스트는 `lib/ocr.extractCertFields` 가 파싱한다
// (파서는 인식기와 무관하게 순수 — 여기서 무엇을 쓰든 파서는 한 줄도 안 바뀐다).
//
// ── 플랫폼마다 다른 엔진을 쓴다 (2026-08-09) ─────────────────────────────────
//   iOS      → **Apple Vision**(VNRecognizeTextRequest). OS 기본 프레임워크.
//   Android  → **ML Kit**(@react-native-ml-kit/text-recognition).
//
// 왜 갈랐나. CLAUDE.md §구현 원칙 = "먼저 OS/플랫폼이 제공하는 것을 찾는다".
// 아이폰은 Vision 으로 글자 인식을 이미 준다(사진 앱의 '텍스트 인식'과 같은 엔진,
// iOS 16+ 한국어 지원). 반면 **안드로이드에는 OS 가 주는 글자 인식 API 가 없어서**
// ML Kit 이 그쪽의 표준이다. 그래서 이건 라이브러리 제거가 아니라 한쪽만 갈아타는 것이다.
//
// 아이폰에서 ML Kit 을 걷어내는 실익이 크다:
//   · **arm64 시뮬레이터 슬라이스가 없다** → 애플 실리콘 맥에서 앱이 iOS 시뮬레이터에
//     아예 안 올라간다(Xcode 26 은 Rosetta 시뮬레이터를 제거했다). 시뮬레이터 개발과
//     아이폰 E2E 가 통째로 막혀 있었다(docs/e2e.md).
//   · 한/중/일/데바나가리 모델을 동봉해 약 20MB.
//
// ── 폴백 사슬 ────────────────────────────────────────────────────────────────
// 어느 단계가 없거나 실패해도 앱은 죽지 않는다. 마지막은 화면의 **직접 입력**이다
// (RaceMedalScreen 이 recognizer 없음/throw 를 모두 그렇게 처리한다 — 기존 동작 그대로).
//   iOS:      Vision → (미지원·실패) → ML Kit → (없음) → 직접 입력
//   Android:  ML Kit → (없음) → 직접 입력
// iOS 에서 ML Kit 을 2차로 남겨 둔 이유: **정확도를 실제 기록증으로 확인하기 전까지**
// 안전망을 없애지 않는다. 확인이 끝나면 iOS 포드에서 ML Kit 을 빼 용량을 줄인다.
// ============================================================================
import {NativeModules, Platform} from 'react-native';
import type {TextRecognizer} from './ocr';

/** 어떤 엔진이 읽었는지 — 진단·정확도 비교용(사용자에게 보이지 않는다). */
export type OcrEngine = 'vision' | 'mlkit' | 'none';

type VisionNative = {
  isAvailable?: () => Promise<boolean>;
  recognize?: (uri: string) => Promise<string>;
};

function visionModule(): VisionNative | null {
  if (Platform.OS !== 'ios') return null;
  const m = (NativeModules as Record<string, unknown>).KeegoVisionText;
  return m ? (m as VisionNative) : null;
}

/** ML Kit 래퍼(있으면). 안드로이드 정본, iOS 에서는 2차 폴백. */
function mlkitRecognizer(): TextRecognizer | null {
  try {
    const mod = require('@react-native-ml-kit/text-recognition');
    const TextRecognition = mod.default ?? mod;
    const KOREAN = mod.TextRecognitionScript?.KOREAN;
    if (TextRecognition && typeof TextRecognition.recognize === 'function') {
      return {
        recognize: async (uri: string) => {
          const r = await TextRecognition.recognize(uri, KOREAN);
          return (r && typeof r.text === 'string' ? r.text : '') || '';
        },
      };
    }
  } catch {
    /* 네이티브 미링크 */
  }
  return null;
}

/**
 * 엔진을 지정해 인식한다. **정확도 비교용** — 같은 사진을 두 엔진에 넣어 결과를 나란히
 * 볼 수 있게 열어 둔다(교체 판정의 근거를 추측이 아니라 실물로 만든다).
 *
 * @returns 인식 텍스트. 그 엔진을 쓸 수 없으면 null(예외가 아니라 값으로 답한다).
 */
export async function recognizeWith(engine: OcrEngine, uri: string): Promise<string | null> {
  if (engine === 'vision') {
    const m = visionModule();
    if (!m?.recognize) return null;
    try {
      if (m.isAvailable && !(await m.isAvailable())) return null;
      return await m.recognize(uri);
    } catch {
      return null;
    }
  }
  if (engine === 'mlkit') {
    const r = mlkitRecognizer();
    if (!r) return null;
    try {
      return await r.recognize(uri);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 화면이 쓰는 인식기. 위 폴백 사슬을 순서대로 시도한다.
 *
 * 빈 문자열도 **실패로 본다** — 인식은 됐는데 글자가 하나도 없다는 것은 사실상 실패이고,
 * 그때 2차 엔진에 한 번 더 기회를 주는 편이 사용자에게 낫다(직접 입력으로 떨어뜨리기 전에).
 */
async function recognizeChain(uri: string): Promise<string> {
  if (Platform.OS === 'ios') {
    const v = await recognizeWith('vision', uri);
    if (v && v.trim()) return v;
  }
  const m = await recognizeWith('mlkit', uri);
  if (m && m.trim()) return m;
  // 여기까지 왔으면 읽을 게 없다. throw 해서 화면이 직접 입력으로 넘어가게 한다
  // (기존 계약 — RaceMedalScreen 이 catch 한다).
  throw new Error('OCR: 인식된 텍스트가 없습니다.');
}

/** 지금 기기에서 쓸 수 있는 엔진이 하나라도 있는가. */
function hasAnyEngine(): boolean {
  return visionModule() != null || mlkitRecognizer() != null;
}

/**
 * 네이티브 OCR 인식기(있으면). 없으면 null — 화면은 직접 입력으로 폴백한다.
 *
 * ⚠️ 여기서 `null` 이 되는 조건은 "**어떤 엔진도 링크돼 있지 않다**" 뿐이다.
 * 엔진이 있는데 인식에 실패하는 것은 recognize() 가 throw 로 알린다 — 그래야 화면이
 * "OCR 이 없다"와 "이 사진을 못 읽었다"를 구분해 안내할 수 있다.
 */
export const nativeRecognizer: TextRecognizer | null = hasAnyEngine()
  ? {recognize: recognizeChain}
  : null;
