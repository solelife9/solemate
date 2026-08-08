/**
 * 기록증 OCR 인식기 — **아이폰은 OS 것(Apple Vision), 안드로이드는 ML Kit.**
 *
 * 2026-08-09: iOS OCR 을 GoogleMLKit → Apple Vision 으로 옮겼다. 이유는 정확도가 아니라
 * **ML Kit 이 arm64 시뮬레이터 슬라이스를 안 준다**는 것이었다 — 그래서 애플 실리콘 맥에서
 * 앱이 iOS 시뮬레이터에 아예 안 올라갔고, 시뮬레이터 개발과 아이폰 E2E 가 통째로 막혀 있었다
 * (docs/e2e.md). 덤으로 앱이 ~20MB 줄어든다.
 *
 * 안드로이드는 **그대로 ML Kit** 이다 — 그쪽엔 OS 가 주는 글자 인식 API 가 없다.
 *
 * 이 스위트가 지키는 것: 플랫폼별 엔진 선택 · 폴백 사슬 · **어떤 경우에도 앱이 죽지 않는 것**.
 * @format
 */
import {Platform, NativeModules} from 'react-native';

const MLKIT_MOD = '@react-native-ml-kit/text-recognition';

/** 모듈 스코프에서 엔진을 고르므로 매번 새로 로드해야 한다. */
function load(): typeof import('../../lib/ocrNative') {
  let mod!: typeof import('../../lib/ocrNative');
  jest.isolateModules(() => {
    mod = require('../../lib/ocrNative');
  });
  return mod;
}

const setVision = (impl: unknown) => {
  (NativeModules as Record<string, unknown>).KeegoVisionText = impl as never;
};

function setMlkit(text: string | null, throws = false) {
  jest.doMock(MLKIT_MOD, () => ({
    __esModule: true,
    default: {
      recognize: jest.fn(async () => {
        if (throws) throw new Error('mlkit boom');
        return text == null ? {} : {text};
      }),
    },
    TextRecognitionScript: {KOREAN: 'korean'},
  }), {virtual: true});
}

beforeEach(() => {
  jest.resetModules();
  setVision(undefined);
  Platform.OS = 'ios';
});
afterEach(() => {
  jest.dontMock(MLKIT_MOD);
  Platform.OS = 'ios';
});

describe('아이폰 — Apple Vision 을 먼저 쓴다', () => {
  test('Vision 이 읽으면 ML Kit 은 부르지 않는다', async () => {
    const mlSpy = jest.fn();
    jest.doMock(MLKIT_MOD, () => ({
      __esModule: true,
      default: {recognize: mlSpy},
      TextRecognitionScript: {KOREAN: 'korean'},
    }), {virtual: true});
    setVision({
      isAvailable: jest.fn(async () => true),
      recognize: jest.fn(async () => 'TIME 01:20:32'),
    });

    const {nativeRecognizer} = load();
    await expect(nativeRecognizer!.recognize('file:///cert.jpg')).resolves.toBe('TIME 01:20:32');
    expect(mlSpy).not.toHaveBeenCalled();
  });

  test('한국어 미지원 기기(iOS 16 미만)면 ML Kit 으로 넘어간다', async () => {
    setMlkit('기록 01:20:32');
    setVision({
      isAvailable: jest.fn(async () => false),   // ko-KR 없음
      recognize: jest.fn(async () => 'should not be used'),
    });

    const {nativeRecognizer} = load();
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).resolves.toBe('기록 01:20:32');
  });

  test('Vision 이 던져도 앱이 죽지 않고 ML Kit 이 받는다', async () => {
    setMlkit('기록 01:20:32');
    setVision({
      isAvailable: jest.fn(async () => true),
      recognize: jest.fn(async () => {
        throw new Error('vision boom');
      }),
    });

    const {nativeRecognizer} = load();
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).resolves.toBe('기록 01:20:32');
  });

  test('빈 문자열은 실패로 본다 — 2차 엔진에 한 번 더 기회를 준다', async () => {
    setMlkit('기록 01:20:32');
    setVision({isAvailable: jest.fn(async () => true), recognize: jest.fn(async () => '   ')});

    const {nativeRecognizer} = load();
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).resolves.toBe('기록 01:20:32');
  });
});

describe('안드로이드 — ML Kit 이 정본이다', () => {
  test('Vision 모듈이 있어도 안드로이드에서는 쓰지 않는다', async () => {
    Platform.OS = 'android';
    const visionSpy = jest.fn(async () => 'vision');
    setVision({isAvailable: jest.fn(async () => true), recognize: visionSpy});
    setMlkit('안드로이드 결과');

    const {nativeRecognizer} = load();
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).resolves.toBe('안드로이드 결과');
    expect(visionSpy).not.toHaveBeenCalled();
  });
});

describe('둘 다 실패해도 앱은 죽지 않는다 — 화면이 직접 입력으로 폴백한다', () => {
  test('엔진이 하나도 없으면 recognizer 자체가 null', () => {
    jest.doMock(MLKIT_MOD, () => {
      throw new Error('미링크');
    }, {virtual: true});
    const {nativeRecognizer} = load();
    expect(nativeRecognizer).toBeNull();
  });

  test('엔진은 있는데 못 읽으면 throw — "없다"와 "못 읽었다"를 구분한다', async () => {
    setMlkit(null, true);
    setVision({isAvailable: jest.fn(async () => true), recognize: jest.fn(async () => '')});

    const {nativeRecognizer} = load();
    expect(nativeRecognizer).not.toBeNull();
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).rejects.toThrow();
  });
});

describe('정확도 비교용 직접 호출', () => {
  test('엔진을 지정해 부를 수 있다(같은 사진을 두 엔진에 넣어 대조)', async () => {
    setMlkit('MLKIT 텍스트');
    setVision({isAvailable: jest.fn(async () => true), recognize: jest.fn(async () => 'VISION 텍스트')});

    const {recognizeWith} = load();
    await expect(recognizeWith('vision', 'file:///c.jpg')).resolves.toBe('VISION 텍스트');
    await expect(recognizeWith('mlkit', 'file:///c.jpg')).resolves.toBe('MLKIT 텍스트');
  });

  test('못 쓰는 엔진은 예외가 아니라 null 로 답한다', async () => {
    Platform.OS = 'android';
    const {recognizeWith} = load();
    await expect(recognizeWith('vision', 'x')).resolves.toBeNull();
  });
});

// ── 배선 ─────────────────────────────────────────────────────────────────────
describe('배선 — iOS 네이티브 모듈이 실제로 있다', () => {
  const read = (p: string) =>
    require('fs').readFileSync(require('path').join(__dirname, '../..', p), 'utf8');

  test('Swift 구현과 브리지 이름이 JS 가 찾는 것과 같다', () => {
    const swift = read('ios/SoleMate/VisionTextModule.swift');
    const objc = read('ios/SoleMate/VisionTextModule.m');
    expect(swift).toContain('@objc(KeegoVisionText)');
    expect(objc).toContain('RCT_EXTERN_MODULE(KeegoVisionText');
    expect(read('lib/ocrNative.ts')).toContain('KeegoVisionText');
  });

  test('브리지가 두 메서드를 모두 노출한다 — 하나만 빠져도 조용히 폴백된다', () => {
    const objc = read('ios/SoleMate/VisionTextModule.m');
    expect(objc).toContain('RCT_EXTERN_METHOD(isAvailable:');
    expect(objc).toContain('RCT_EXTERN_METHOD(recognize:');
  });

  test('한국어를 인식 언어에 넣는다 — 국내 기록증은 라벨이 한글이다', () => {
    expect(read('ios/SoleMate/VisionTextModule.swift')).toContain('"ko-KR"');
  });

  test('안드로이드는 ML Kit 을 유지한다 — OS 제공 API 가 없다', () => {
    // 패키지가 오토링크로 안드로이드 의존성(com.google.mlkit:text-recognition-korean 등)을
    // 끌어온다. 우리 build.gradle 에는 적히지 않는다 — package.json 이 단일 근거다.
    expect(read('package.json')).toContain('@react-native-ml-kit/text-recognition');
  });
});
