/**
 * 기록증 OCR 인식기 — **아이폰은 OS 것(Apple Vision), 안드로이드는 ML Kit.**
 *
 * 2026-08-09: iOS OCR 을 GoogleMLKit → Apple Vision 으로 옮겼다. 이유는 정확도가 아니라
 * **ML Kit 이 arm64 시뮬레이터 슬라이스를 안 준다**는 것이었다 — 그래서 애플 실리콘 맥에서
 * 앱이 iOS 시뮬레이터에 아예 안 올라갔고, 시뮬레이터 개발과 아이폰 E2E 가 통째로 막혀 있었다
 * (docs/e2e.md). 안드로이드는 그대로 ML Kit 이다(그쪽엔 OS 제공 API 가 없다).
 *
 * ── 이 스위트를 이렇게 쓴 이유 ──────────────────────────────────────────────
 * ① 목을 매 테스트마다 doMock/dontMock 으로 갈아 끼우지 않는다. 그렇게 했더니 단독 실행은
 *    통과하는데 **전체 실행에서 실행 순서에 따라 깨졌다**(3회 중 2회). jest 는 워커를
 *    재사용해 모듈 목 등록이 파일 경계를 넘어 샐 수 있다.
 * ② `resetModules()` 뒤에는 **react-native 인스턴스도 새로 생긴다.** 리셋 전에 심어 둔
 *    NativeModules 는 그 새 인스턴스에 없다 — 리셋 **뒤에** 심어야 한다.
 *    (homeWidget.test.ts 가 쓰는 방식과 같다.)
 * @format
 */

/** ML Kit 목의 상태 — 링크 여부와 동작을 여기서만 바꾼다. */
const mlkit = {
  linked: true,
  impl: null as null | (() => Promise<{text?: string}>),
  calls: 0,
};

jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  // 미링크를 표현하려면 recognize 가 **없어야** 한다(래퍼가 그걸로 판정한다).
  get default() {
    if (!mlkit.linked) return {};
    return {
      recognize: () => {
        mlkit.calls += 1;
        return mlkit.impl ? mlkit.impl() : Promise.resolve({});
      },
    };
  },
  TextRecognitionScript: {KOREAN: 'korean'},
}));   // ⚠️ virtual 옵션을 붙이지 않는다 — 이 패키지는 실재한다. 붙이면 앞선 스위트가
       // 진짜 모듈을 require 한 순간 목이 비껴간다(__tests__/testIsolation.test.ts 가 잡는다).

type Vision = {isAvailable?: () => Promise<boolean>; recognize?: (u: string) => Promise<string>};

/**
 * 모듈을 새로 적재한다. **리셋 뒤에** 플랫폼·네이티브 목을 심고 나서 require 한다 —
 * 순서가 뒤집히면 새 react-native 인스턴스에 아무것도 안 심긴다(위 ② 참조).
 */
function loadOcr(opts: {os?: 'ios' | 'android'; vision?: Vision | null} = {}) {
  jest.resetModules();
  const rn = require('react-native');
  rn.Platform.OS = opts.os ?? 'ios';
  if (opts.vision) rn.NativeModules.KeegoVisionText = opts.vision;
  else delete rn.NativeModules.KeegoVisionText;
  return require('../../lib/ocrNative') as typeof import('../../lib/ocrNative');
}

/** ML Kit 이 이 텍스트를 돌려주게 한다. */
function setMlkit(text: string | null, throws = false) {
  mlkit.linked = true;
  mlkit.impl = async () => {
    if (throws) throw new Error('mlkit boom');
    return text == null ? {} : {text};
  };
}
/** ML Kit 이 아예 링크돼 있지 않은 상태. */
function noMlkit() {
  mlkit.linked = false;
  mlkit.impl = null;
}

beforeEach(() => {
  mlkit.calls = 0;
  setMlkit('MLKIT 기본');
});

// ⚠️ **뒤 스위트를 오염시키지 않는다.** load() 가 Platform.OS 를 바꾸는데, jest 목의
// react-native 객체는 워커 안에서 파일 경계를 넘어 공유될 수 있다. 안드로이드로 바꿔 둔 채
// 끝나면 다음 스위트가 안드로이드로 착각한다 — 이 저장소가 이미 한 번 겪은 사고다
// (f538adc "스위트가 Platform.OS 를 안 되돌려 뒤 스위트를 오염시켰다").
// 목 상태(mlkit.linked)도 함께 되돌린다.
afterEach(() => {
  const rn = require('react-native');
  rn.Platform.OS = 'ios';
  delete rn.NativeModules.KeegoVisionText;
  mlkit.linked = true;
  mlkit.impl = null;
});

describe('아이폰 — Apple Vision 을 먼저 쓴다', () => {
  test('Vision 이 읽으면 ML Kit 은 부르지 않는다', async () => {
    const {nativeRecognizer} = loadOcr({
      vision: {isAvailable: async () => true, recognize: async () => 'TIME 01:20:32'},
    });
    await expect(nativeRecognizer!.recognize('file:///cert.jpg')).resolves.toBe('TIME 01:20:32');
    expect(mlkit.calls).toBe(0);
  });

  test('한국어 미지원 기기(iOS 16 미만)면 ML Kit 으로 넘어간다', async () => {
    setMlkit('기록 01:20:32');
    const {nativeRecognizer} = loadOcr({
      vision: {isAvailable: async () => false, recognize: async () => '쓰이면 안 된다'},
    });
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).resolves.toBe('기록 01:20:32');
  });

  test('Vision 이 던져도 앱이 죽지 않고 ML Kit 이 받는다', async () => {
    setMlkit('기록 01:20:32');
    const {nativeRecognizer} = loadOcr({
      vision: {
        isAvailable: async () => true,
        recognize: async () => {
          throw new Error('vision boom');
        },
      },
    });
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).resolves.toBe('기록 01:20:32');
  });

  test('빈 문자열은 실패로 본다 — 2차 엔진에 한 번 더 기회를 준다', async () => {
    setMlkit('기록 01:20:32');
    const {nativeRecognizer} = loadOcr({
      vision: {isAvailable: async () => true, recognize: async () => '   '},
    });
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).resolves.toBe('기록 01:20:32');
  });
});

describe('안드로이드 — ML Kit 이 정본이다', () => {
  test('Vision 모듈이 있어도 안드로이드에서는 쓰지 않는다', async () => {
    const visionSpy = jest.fn(async () => 'vision');
    setMlkit('안드로이드 결과');
    const {nativeRecognizer} = loadOcr({
      os: 'android',
      vision: {isAvailable: async () => true, recognize: visionSpy},
    });
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).resolves.toBe('안드로이드 결과');
    expect(visionSpy).not.toHaveBeenCalled();
  });
});

describe('둘 다 실패해도 앱은 죽지 않는다 — 화면이 직접 입력으로 폴백한다', () => {
  test('엔진이 하나도 없으면 recognizer 자체가 null', () => {
    noMlkit();
    const {nativeRecognizer} = loadOcr({vision: null});
    expect(nativeRecognizer).toBeNull();
  });

  test('엔진은 있는데 못 읽으면 throw — "없다"와 "못 읽었다"를 구분한다', async () => {
    setMlkit(null, true);
    const {nativeRecognizer} = loadOcr({
      vision: {isAvailable: async () => true, recognize: async () => ''},
    });
    expect(nativeRecognizer).not.toBeNull();
    await expect(nativeRecognizer!.recognize('file:///c.jpg')).rejects.toThrow();
  });
});

describe('정확도 비교용 직접 호출', () => {
  test('엔진을 지정해 부를 수 있다(같은 사진을 두 엔진에 넣어 대조)', async () => {
    setMlkit('MLKIT 텍스트');
    const {recognizeWith} = loadOcr({
      vision: {isAvailable: async () => true, recognize: async () => 'VISION 텍스트'},
    });
    await expect(recognizeWith('vision', 'file:///c.jpg')).resolves.toBe('VISION 텍스트');
    await expect(recognizeWith('mlkit', 'file:///c.jpg')).resolves.toBe('MLKIT 텍스트');
  });

  test('못 쓰는 엔진은 예외가 아니라 null 로 답한다', async () => {
    const {recognizeWith} = loadOcr({os: 'android'});
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
