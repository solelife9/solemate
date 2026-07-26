// ============================================================================
// lib/ocrNative.ts — 온디바이스 텍스트 인식(ML Kit) → OCR 파서용 recognizer
//
// 네이티브 모듈(@react-native-ml-kit/text-recognition)을 옵셔널로 감싼다. 모듈이
// 미링크(개발 빌드/포드 미통합)면 recognize 가 throw → 상위 화면이 catch 해 직접 입력으로
// 폴백한다(앱은 절대 안 죽음, CourseMap 지도 폴백과 동일 문법). 한글 기록증이라 KOREAN
// 스크립트로 인식(한글+라틴 숫자·라벨 동시 인식).
// ============================================================================
import type {TextRecognizer} from './ocr';

let recognizer: TextRecognizer | null = null;
try {

  const mod = require('@react-native-ml-kit/text-recognition');
  const TextRecognition = mod.default ?? mod;
  const KOREAN = mod.TextRecognitionScript?.KOREAN;
  if (TextRecognition && typeof TextRecognition.recognize === 'function') {
    recognizer = {
      recognize: async (uri: string) => {
        const r = await TextRecognition.recognize(uri, KOREAN);
        return (r && typeof r.text === 'string' ? r.text : '') || '';
      },
    };
  }
} catch {
  // 네이티브 미링크 — recognizer 없음(직접 입력).
  recognizer = null;
}

/** 네이티브 OCR 인식기(있으면). 없거나 인식 실패 시 화면은 직접 입력으로 폴백. */
export const nativeRecognizer: TextRecognizer | null = recognizer;
