/**
 * 러닝 중 잠금화면 지표 알림 — 문구 빌더 (2026-08-05)
 *
 * 왜 이 기능이 있나: 안드로이드에서 폰을 주머니에 넣고 달리면 잠금을 풀기 전엔 얼마나 왔는지
 * 볼 수가 없다. 아이폰은 워치가 그 자리를 메우지만 안드로이드엔 워치가 없다.
 *
 * 왜 별도 알림인가: 이미 떠 있는 '러닝 기록 중'(expo-location 포그라운드 서비스) 문구를
 * 갱신하려면 startLocationUpdatesAsync 를 다시 불러야 하는데, 안드로이드 구현이
 * setOptions 에서 stopLocationUpdates() + startLocationUpdates() 를 한다 —
 * **문구를 바꿀 때마다 GPS 가 재시작된다.** 그래서 GPS 와 무관한 알림을 따로 띄운다.
 *
 * 여기서 검증하는 건 순수 문구 빌더다(네이티브 없이 전부 검증 가능한 부분).
 *
 * @format
 */
import {buildRunNotificationText} from '../../lib/runNotification';

const base = {km: 3.42, elapsedSec: 18 * 60 + 30, avgPaceSecPerKm: 324, paused: false};

describe('buildRunNotificationText — 잠금화면 두 줄', () => {
  test('제목은 거리·시간, 본문은 평균 페이스·신발', () => {
    const {title, body} = buildRunNotificationText({...base, shoeName: 'Novablast 5'});
    expect(title).toBe('3.42km · 18:30');
    expect(body).toBe("평균 5'24\"/km · Novablast 5");
  });

  test('1시간을 넘으면 시까지 보여 준다', () => {
    const {title} = buildRunNotificationText({...base, elapsedSec: 3600 + 5 * 60 + 7});
    expect(title).toBe('3.42km · 1:05:07');
  });

  test('일시정지 중이면 제목이 먼저 그렇게 말한다', () => {
    // 주머니에서 자동 일시정지가 걸렸는데 모르고 계속 달리는 게 가장 나쁜 경우다 —
    // 그동안 거리가 안 쌓인다. 그래서 거리보다 앞에 놓는다.
    const {title} = buildRunNotificationText({...base, paused: true});
    expect(title.startsWith('일시정지 · ')).toBe(true);
  });

  test('페이스가 없으면(출발 직후) 페이스 칸을 만들지 않는다', () => {
    const {body} = buildRunNotificationText({...base, avgPaceSecPerKm: null, shoeName: 'Clifton 9'});
    expect(body).toBe('Clifton 9');
  });

  test('보여 줄 게 아무것도 없으면 빈 줄 대신 상태를 말한다', () => {
    const {title, body} = buildRunNotificationText({km: 0, elapsedSec: 0, avgPaceSecPerKm: null, paused: false});
    expect(title).toBe('0.00km · 0:00');
    expect(body).toContain('기록 중');
  });

  test('말도 안 되는 페이스(1km에 1시간 초과)는 버린다 — 출발 직후 계산은 쓰레기다', () => {
    const {body} = buildRunNotificationText({...base, avgPaceSecPerKm: 4000, shoeName: 'X'});
    expect(body).toBe('X');
  });

  test("초 반올림이 60이 돼도 5'60\" 같은 건 안 만든다", () => {
    // 359.6초/km → 반올림하면 5분 60초. 6'00" 이 돼야 한다.
    const {body} = buildRunNotificationText({...base, avgPaceSecPerKm: 359.6});
    expect(body).toContain("6'00\"");
  });

  test('마일 단위면 거리와 페이스가 함께 환산된다(둘이 어긋나면 안 된다)', () => {
    const {title, body} = buildRunNotificationText({...base, km: 1.609344, avgPaceSecPerKm: 300}, 'mi');
    expect(title).toBe('1.00mi · 18:30');
    expect(body).toContain("8'03\"/mi"); // 300초/km × 1.609344 = 482.8초/mi → 8분 03초
  });

  test('음수·NaN 거리는 0 으로 본다(잠금화면에 이상한 숫자 금지)', () => {
    expect(buildRunNotificationText({...base, km: -5}).title).toBe('0.00km · 18:30');
    expect(buildRunNotificationText({...base, km: NaN}).title).toBe('0.00km · 18:30');
  });
});
