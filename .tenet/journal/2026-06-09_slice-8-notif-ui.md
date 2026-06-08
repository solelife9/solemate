# slice-8-notif-ui — ProfileScreen 푸시 알림 설정 + App 포그라운드 배선

날짜: 2026-06-09 · 의존: slice-8-fcm-native(완료)

## 한 일
- **ProfileScreen.rn.tsx**: 설정 섹션에 **푸시 알림** 행 신설(기존 in-app '알림'[배지 임계값]과
  별개·공존). 종류별 토글 3개(교체 임박/주간 목표/러닝 리마인더) + 리마인더 시각 30분 스테퍼.
  `notifSettings`/`onChangeNotifSettings` props 로 실제 `notif_settings` 를 반영·변경한다.
  켜는 순간 `onRequestPushPermission`(기본 `lib/pushMessaging.requestPushPermission`)로 1회
  권한 요청 — 거부(false)·throw 에도 설정은 저장되고 graceful 안내만 띄운다(비차단, S8-3).
- **App.tsx**: `getNotifSettings` 로 복원 + `changeNotifSettings` 로 영속(신규 키만 — 기존
  `settings_alerts` 불변). `AppState` 'active' 전환 시 `dueNotifications`(신발 forecast·
  weekly·lastRun·settings 조합, 기존 lib 재사용)를 계산해 `presentDue` 로 표시. 당일 표시한
  key 를 `notif_presented` 로 추적해 같은 날 반복 표시 방지(A8-4). 최초 마운트(이미 active)에는
  표시하지 않아 기존 온보딩/부트·신발 등록 흐름과 독립·비차단으로 동작(기존 흐름 보존).

## 테스트(행동·props-driven·jest.setup 모킹)
- `__tests__/ProfileScreen.notif.test.tsx`(8): 설정행이 실제 값 반영, 토글 press→
  `onChangeNotifSettings` 올바른 인자, 리마인더 시각 ±30분, 권한 거부/throw 비차단(크래시 0).
- `__tests__/App.notif.test.tsx`(3): 포그라운드 진입→리마인더 Alert 표시, 당일 1회(A8-4),
  전부 off 면 미표시. (AsyncStorage mock clear 누수 회피 위해 `notif_presented` 명시 제거.)

## 게이트
tsc green · lint 0 error · 전체 828 tests green · theme 토큰만(raw hex 0, WARN 토큰 사용) ·
데이터 파괴 0(AlertSettings/`settings_alerts` 보존, 알림은 읽기전용 파생) · 시크릿 0.
