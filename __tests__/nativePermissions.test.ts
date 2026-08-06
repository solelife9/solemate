/**
 * 네이티브 권한·개인정보 매니페스트 계약 테스트.
 *
 * 왜 필요한가(2026-07-26 출시 심사):
 *   · B-10 — 앱이 오디오를 녹음하지 않는데 NSMicrophoneUsageDescription 이 있었다.
 *     러닝 앱의 마이크 요청은 미사용 권한 요청(App Review 5.1.1)이자 신뢰 손상이다.
 *   · B-11 — PrivacyInfo.xcprivacy 의 수집 항목이 빈 배열("수집 없음")이었고, 워치·위젯
 *     타깃에는 매니페스트가 아예 없었다.
 * 둘 다 네이티브 설정 파일이라 기존 2,052개 테스트가 한 줄도 보지 않던 영역이었다.
 *
 * 이 테스트는 파일을 텍스트로 읽어 검증한다(빌드·시뮬레이터 불필요).
 * 권한이 새로 늘어나면 WHITELIST 를 의도적으로 고쳐야 하므로 '권한 증식'도 함께 막는다.
 *
 * ⚠️ ios/SoleMate/PrivacyInfo.xcprivacy 에는 설명 주석을 달아도 남지 않는다 — `pod install`
 *    의 [Privacy Manifest Aggregation] 단계가 파일을 정규화해 다시 쓰면서 주석을 버린다
 *    (내용 자체는 보존된다). 그래서 '왜 이 항목인가'의 근거는 이 테스트에 적어 둔다.
 *
 * @format
 */
import {readFileSync, existsSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');
const IOS_PLIST = join(ROOT, 'ios/SoleMate/Info.plist');
const ANDROID_MANIFEST = join(ROOT, 'android/app/src/main/AndroidManifest.xml');
const APP_PRIVACY = join(ROOT, 'ios/SoleMate/PrivacyInfo.xcprivacy');
const WATCH_PRIVACY = join(ROOT, 'ios/SoleMateWatch Watch App/PrivacyInfo.xcprivacy');
const WIDGET_PRIVACY = join(ROOT, 'ios/RunActivity/PrivacyInfo.xcprivacy');

const read = (p: string) => readFileSync(p, 'utf8');

/** <key>…UsageDescription</key> 를 모두 뽑는다(주석 안의 문자열은 제외). */
function usageKeys(plist: string): string[] {
  const withoutComments = plist.replace(/<!--[\s\S]*?-->/g, '');
  return [...withoutComments.matchAll(/<key>(NS\w*UsageDescription)<\/key>/g)]
    .map(m => m[1])
    .sort();
}

/** 매니페스트에서 선언된 수집 데이터 타입 목록. */
function collectedTypes(manifest: string): string[] {
  const withoutComments = manifest.replace(/<!--[\s\S]*?-->/g, '');
  return [...withoutComments.matchAll(/<string>(NSPrivacyCollectedDataType\w+)<\/string>/g)].map(
    m => m[1],
  );
}

// ── iOS 권한 ────────────────────────────────────────────────────────────────
describe('iOS Info.plist 권한 선언', () => {
  /**
   * 앱이 실제로 쓰는 권한만. 여기에 키를 추가하려면 그 기능이 정말 있는지 먼저 확인할 것
   * — 스토어 심사는 '설명이 있는데 안 쓰는 권한'과 '쓰는데 설명이 없는 권한'을 모두 본다.
   */
  const WHITELIST = [
    'NSCameraUsageDescription',
    'NSHealthShareUsageDescription',
    'NSHealthUpdateUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'NSMotionUsageDescription',
    'NSPhotoLibraryAddUsageDescription',
    'NSPhotoLibraryUsageDescription',
  ].sort();

  it('선언된 권한이 화이트리스트와 정확히 일치한다(권한 증식 차단)', () => {
    expect(usageKeys(read(IOS_PLIST))).toEqual(WHITELIST);
  });

  it('마이크 권한을 요구하지 않는다 (B-10)', () => {
    expect(usageKeys(read(IOS_PLIST))).not.toContain('NSMicrophoneUsageDescription');
  });

  it('모든 권한 설명이 비어 있지 않다', () => {
    const plist = read(IOS_PLIST).replace(/<!--[\s\S]*?-->/g, '');
    for (const key of usageKeys(read(IOS_PLIST))) {
      const m = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
      expect(m).toBeTruthy();
      expect((m as RegExpMatchArray)[1].trim().length).toBeGreaterThan(0);
    }
  });
});

// ── 카메라가 video 모드로 새지 않는지 ───────────────────────────────────────
describe('카메라 사용 모드', () => {
  it('MedalCamera 는 mode="picture" 로 고정한다(video 는 마이크를 요구한다)', () => {
    const src = read(join(ROOT, 'MedalCamera.tsx'));
    expect(src).toContain('mode="picture"');
    expect(src).not.toContain('mode="video"');
  });

  it('사진 선택·촬영은 이미지 전용이다', () => {
    const src = read(join(ROOT, 'lib/photo.ts'));
    expect(src).not.toMatch(/mediaTypes:\s*\[[^\]]*'videos'/);
  });
});

// ── Android 권한 ────────────────────────────────────────────────────────────
describe('AndroidManifest 권한 선언', () => {
  it('오디오 녹음 권한을 선언하지 않는다', () => {
    expect(read(ANDROID_MANIFEST)).not.toContain('android.permission.RECORD_AUDIO');
  });

  it('백그라운드 러닝에 필요한 권한은 유지한다', () => {
    const m = read(ANDROID_MANIFEST);
    for (const p of [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ]) {
      expect(m).toContain(p);
    }
  });

  // 이 가드는 **방향이 반대다**. 예전 판은 ACCESS_BACKGROUND_LOCATION 을 "유지해야
  // 한다"고 못 박고 있었고, 그 바람에 필요 없는 권한이 고착돼 Play 의 가장 무거운
  // 심사 항목(선언 양식 + 시연 영상)을 계속 자초했다.
  //
  // 이 앱은 location 타입 **포그라운드 서비스**로 화면off 기록을 하고, expo-location 은
  // 그 경로에서 백그라운드 위치 권한을 요구하지 않는다(근거는 매니페스트 주석의
  // LocationModule.kt 인용). 그러니 다시 들어오면 안 된다.
  it('배경 위치 권한은 선언하지 않는다 — 포그라운드 서비스로 충분하다', () => {
    expect(read(ANDROID_MANIFEST)).not.toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
  });

  // 매니페스트에서 뺐어도 런타임에서 계속 물으면 OS 가 거부하고 계측만 더럽힌다.
  // 요청 코드까지 함께 사라졌는지 본다.
  it('백그라운드 위치를 런타임에서 요청하지 않는다', () => {
    expect(read(join(ROOT, 'lib', 'locationService.ts')))
      .not.toContain('requestBackgroundPermissionsAsync');
  });
});

// ── 개인정보 매니페스트 ─────────────────────────────────────────────────────
describe('PrivacyInfo.xcprivacy', () => {
  it('앱·워치·위젯 세 타깃 모두 매니페스트를 가진다 (B-11)', () => {
    for (const p of [APP_PRIVACY, WATCH_PRIVACY, WIDGET_PRIVACY]) {
      expect(existsSync(p)).toBe(true);
    }
  });

  it('앱 매니페스트가 클라우드로 전송되는 항목을 선언한다', () => {
    const types = collectedTypes(read(APP_PRIVACY));
    expect(types.length).toBeGreaterThan(0);
    for (const t of [
      'NSPrivacyCollectedDataTypePreciseLocation',
      'NSPrivacyCollectedDataTypeHealth',
      'NSPrivacyCollectedDataTypeFitness',
      'NSPrivacyCollectedDataTypeUserID',
      // 제품 계측(lib/productAnalytics) — 선언 없이 수집하면 App Privacy 표기와 어긋난다.
      'NSPrivacyCollectedDataTypeProductInteraction',
    ]) {
      expect(types).toContain(t);
    }
  });

  it('사진은 수집으로 선언하지 않는다(기기에만 저장 — 과잉 선언도 부정확)', () => {
    expect(collectedTypes(read(APP_PRIVACY))).not.toContain(
      'NSPrivacyCollectedDataTypePhotosorVideos',
    );
  });

  it('워치 매니페스트가 심박·위치·운동 데이터를 선언한다', () => {
    const types = collectedTypes(read(WATCH_PRIVACY));
    for (const t of [
      'NSPrivacyCollectedDataTypePreciseLocation',
      'NSPrivacyCollectedDataTypeHealth',
      'NSPrivacyCollectedDataTypeFitness',
    ]) {
      expect(types).toContain(t);
    }
  });

  it('위젯은 데이터를 내보내지 않으므로 수집 항목이 없다', () => {
    expect(collectedTypes(read(WIDGET_PRIVACY))).toEqual([]);
  });

  it('세 매니페스트 모두 추적(NSPrivacyTracking)을 false 로 선언한다', () => {
    for (const p of [APP_PRIVACY, WATCH_PRIVACY, WIDGET_PRIVACY]) {
      expect(read(p)).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    }
  });

  it('UserDefaults 등 사유 필요 API 를 선언한다', () => {
    for (const p of [APP_PRIVACY, WATCH_PRIVACY, WIDGET_PRIVACY]) {
      expect(read(p)).toContain('NSPrivacyAccessedAPICategoryUserDefaults');
    }
  });
});
