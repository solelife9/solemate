/**
 * 공유 카드 — 플랫폼별 공유 경로 (2026-08-05 실기기 발견)
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
 * 텍스트 폴백조차 타지 않았다는 것 — 조용한 실패다. 갤럭시 S10e 에서 확인했다(공유 시트에
 * "공유할 추천 사용자가 없음"만 뜸).
 *
 * 여기서 못 박는 것:
 *   · 안드로이드 → 캡처를 아예 시도하지 않고 **텍스트**로 공유한다(빈 공유보다 낫다).
 *   · iOS      → 종전대로 PNG dataURL 을 url 로 공유한다(회귀 금지).
 *
 * ⚠️ 안드로이드 이미지 공유의 정공법은 content:// URI + 네이티브 모듈(expo-sharing)인데
 * 네이티브 의존은 사전 승인제라 보류 중이다. 승인되면 canShareCardImage 를 걷어내고 이
 * 테스트의 안드로이드 기대치를 바꾼다.
 *
 * @format
 */
import {Platform, Share} from 'react-native';
import {shareRunnerSpecCard, shareMedalCard, canShareCardImage} from '../../lib/shareCard';

// toDataURL 이 **성공**하는 ref — 조용한 실패를 재현하려면 캡처가 되는 상태여야 한다.
const okRef = {current: {toDataURL: (cb: (b: string) => void) => cb('MOCK_PNG_BASE64')}};

describe('공유 카드 플랫폼 분기', () => {
  const original = Platform.OS;
  let shareSpy: jest.SpyInstance;

  beforeEach(() => {
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as never);
  });
  afterEach(() => {
    shareSpy.mockRestore();
    Object.defineProperty(Platform, 'OS', {value: original, configurable: true});
  });

  const setOS = (os: string) => Object.defineProperty(Platform, 'OS', {value: os, configurable: true});

  test('안드로이드: 캡처가 성공해도 텍스트로 공유한다(빈 공유 금지)', async () => {
    setOS('android');
    expect(canShareCardImage()).toBe(false);
    await shareRunnerSpecCard(okRef, '민우의 러너 스펙 — Keego');

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0];
    // 핵심: message 가 있어야 한다. url 만 넘기면 안드로이드에선 아무것도 안 나간다.
    expect(arg.message).toBe('민우의 러너 스펙 — Keego');
    expect(arg.url).toBeUndefined();
  });

  test('iOS: 캡처한 PNG dataURL 을 url 로 공유한다(기존 동작 유지)', async () => {
    setOS('ios');
    expect(canShareCardImage()).toBe(true);
    await shareRunnerSpecCard(okRef, '민우의 러너 스펙 — Keego');

    const arg = shareSpy.mock.calls[0][0];
    expect(arg.url).toBe('data:image/png;base64,MOCK_PNG_BASE64');
    expect(arg.message).toBeUndefined();
  });

  test('메달 카드도 같은 규칙을 따른다(공유 4종이 한 경로)', async () => {
    setOS('android');
    await shareMedalCard(okRef, '서울마라톤 완주 — Keego');
    expect(shareSpy.mock.calls[0][0].message).toBe('서울마라톤 완주 — Keego');
  });
});
