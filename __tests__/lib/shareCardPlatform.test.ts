/**
 * 공유 카드 — 플랫폼별 이미지 공유 경로 (2026-08-05)
 *
 * 무엇이 문제였나: 카드 공유 4종(런·리캡·러너 스펙·메달)이 모두 `Share.share({url})` 로
 * PNG dataURL 을 넘겼다. 그런데 RN 의 Share 는 **안드로이드 분기에서 url 을 버린다** —
 * `node_modules/react-native/Libraries/Share/Share.js`:
 *
 *     if (Platform.OS === 'android') {
 *       const newContent = {title: content.title,
 *         message: typeof content.message === 'string' ? content.message : undefined};
 *
 * 그래서 안드로이드에선 message 없는 **빈 공유**가 나갔다. 더 나쁜 건 캡처가 성공하므로
 * 텍스트 폴백조차 타지 않았다는 것 — 조용한 실패다. 갤럭시 S10e 에서 확인했다(공유 시트
 * 내용이 비어 있음). iOS 로만 검증해 온 탓에 오래 안 드러났다.
 *
 * 이제 안드로이드는 캡처한 PNG 를 캐시에 쓰고 expo-sharing 으로 **파일을 붙여** 공유한다
 * (content:// URI 는 FileProvider 가 필요해 RN Share 로는 불가능 — 민우님 승인 2026-08-05).
 *
 * 여기서 못 박는 것:
 *   · 안드로이드 → 캐시에 PNG 를 쓰고 Sharing.shareAsync(파일, image/png). 빈 공유 금지.
 *   · iOS       → 종전대로 Share.share({url: dataURL}) (검증된 경로, 회귀 금지).
 *   · 실패 시   → 두 플랫폼 모두 텍스트 공유로 폴백(막다른 길 금지).
 *
 * @format
 */
import {Platform, Share} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {shareRunnerSpecCard, shareMedalCard, canShareCardImage} from '../../lib/shareCard';

// toDataURL 이 **성공**하는 ref — 조용한 실패를 재현하려면 캡처가 되는 상태여야 한다.
const okRef = {current: {toDataURL: (cb: (b: string) => void) => cb('MOCK_PNG_BASE64')}};
// 캡처가 불가능한 ref(미마운트) — 폴백 경로 확인용.
const deadRef = {current: null};

describe('공유 카드 플랫폼 분기', () => {
  const original = Platform.OS;
  let shareSpy: jest.SpyInstance;

  beforeEach(() => {
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as never);
    (Sharing.shareAsync as jest.Mock).mockClear();
    (Sharing.isAvailableAsync as jest.Mock).mockClear().mockResolvedValue(true);
    (FileSystem.writeAsStringAsync as jest.Mock).mockClear();
  });
  afterEach(() => {
    shareSpy.mockRestore();
    Object.defineProperty(Platform, 'OS', {value: original, configurable: true});
  });

  const setOS = (os: string) => Object.defineProperty(Platform, 'OS', {value: os, configurable: true});

  test('두 플랫폼 모두 이미지 공유가 가능하다', () => {
    setOS('android');
    expect(canShareCardImage()).toBe(true);
    setOS('ios');
    expect(canShareCardImage()).toBe(true);
  });

  test('안드로이드: PNG 를 캐시에 쓰고 파일로 공유한다(빈 공유 금지)', async () => {
    setOS('android');
    await shareRunnerSpecCard(okRef, '민우의 러너 스펙 — Keego');

    // 1) base64 만 떼어 캐시에 PNG 로 쓴다(dataURL 접두사가 파일에 섞이면 깨진 이미지가 된다).
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [fileUri, body, opts] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
    expect(fileUri).toBe('file:///cache/keego-spec.png');
    expect(body).toBe('MOCK_PNG_BASE64');
    expect(opts).toEqual({encoding: 'base64'});

    // 2) 그 파일을 image/png 로 공유한다.
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    const [sharedUri, shareOpts] = (Sharing.shareAsync as jest.Mock).mock.calls[0];
    expect(sharedUri).toBe('file:///cache/keego-spec.png');
    expect(shareOpts.mimeType).toBe('image/png');

    // 3) 텍스트 폴백은 타지 않는다 — 이미지가 나갔으므로.
    expect(shareSpy).not.toHaveBeenCalled();
  });

  test('iOS: 캡처한 PNG dataURL 을 url 로 공유한다(기존 동작 유지)', async () => {
    setOS('ios');
    await shareRunnerSpecCard(okRef, '민우의 러너 스펙 — Keego');

    const arg = shareSpy.mock.calls[0][0];
    expect(arg.url).toBe('data:image/png;base64,MOCK_PNG_BASE64');
    expect(arg.message).toBeUndefined();
    // iOS 는 파일을 쓰지 않는다(불필요한 캐시 쓰기 금지).
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  test('안드로이드에서 공유 기능을 못 쓰면 텍스트로 폴백한다(막다른 길 금지)', async () => {
    setOS('android');
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await shareRunnerSpecCard(okRef, '민우의 러너 스펙 — Keego');

    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(shareSpy.mock.calls[0][0].message).toBe('민우의 러너 스펙 — Keego');
  });

  test('캡처 자체가 실패하면 텍스트로 폴백한다', async () => {
    setOS('android');
    await shareRunnerSpecCard(deadRef, '민우의 러너 스펙 — Keego');
    expect(shareSpy.mock.calls[0][0].message).toBe('민우의 러너 스펙 — Keego');
  });

  test('메달 카드도 같은 경로를 쓴다(공유 4종이 한 함수)', async () => {
    setOS('android');
    await shareMedalCard(okRef, '서울마라톤 완주 — Keego');
    expect((Sharing.shareAsync as jest.Mock).mock.calls[0][0]).toBe('file:///cache/keego-medal.png');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 캡처 해상도는 **카드 쪽**에서 정한다 (2026-08-06)
//
// 처음엔 toDataURL(cb, {width, height}) 로 줄이려 했는데, 안드로이드 구현이 축소가 아니라
// **잘라내기**였다(SvgView.java 가 축소 변환 없이 작은 비트맵에 원래 좌표로 그린다).
// 실기기에서 카드 왼쪽 위만 남은 걸 확인하고 폐기했다 — 캡처는 '성공'하고 공유도 나가므로
// 눈으로 보기 전엔 안 드러나는 종류다.
//
// 지금은 각 카드가 Svg width/height 를 설계 px ÷ 화면 배율로 두고 viewBox 로 좌표계를
// 유지한다. 그 계약을 여기서 못 박는다 — 되돌아오기 쉬운 실수다.
// ────────────────────────────────────────────────────────────────────────────
describe('공유 카드는 설계 치수(1080×1350px)로 구워진다', () => {
  test('캡처는 크기 옵션을 넘기지 않는다 — 넘기면 안드로이드에서 카드가 잘린다', async () => {
    const seen: unknown[] = [];
    const ref = {
      current: {
        toDataURL: (cb: (b: string) => void, opts?: object) => { seen.push(opts); cb('PNG'); },
      },
    };
    Object.defineProperty(Platform, 'OS', {value: 'ios', configurable: true});
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as never);
    await shareRunnerSpecCard(ref, 'fallback');
    expect(seen).toEqual([undefined]);
    spy.mockRestore();
  });
});
