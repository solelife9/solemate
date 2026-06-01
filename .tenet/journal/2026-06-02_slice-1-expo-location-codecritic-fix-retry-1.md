# expo-location 마무리 — code_critic 3 blocking findings 수정 (retry #1)

type: journal
job_name: expo-location 배선/테스트 마무리 (code_critic blocking 수정)
date: 2026-06-02
result: success

## 배경

기능/게이트는 GREEN이었으나 code_critic이 3개 blocking finding으로 fail. 이전
expo-location 배선/테스트는 보존하고 아래 3건만 정정했다(재작성 금지 준수).

## 고친 것

1. **lib/foregroundService.ts 헤더 docstring 정정**: 옛 react-native-geolocation-service
   세계의 "NO-OP / 실제 지속 안 함" 설명을 제거. 이제 이 config는 LIVE —
   lib/locationService.ts의 `Location.startLocationUpdatesAsync({foregroundService})`
   (expo-location + expo-task-manager)로 소비되어 화면off에도 TaskManager task가 fix를
   받아 엔진에 누적한다는 현재 동작으로 갱신.

2. **jest.setup.js 죽은 mock 제거 + package.json dep 제거**: 더 이상 import되지 않는
   react-native-geolocation-service의 jest mock 삭제. 코드/설정 전체 grep으로 실제 import
   0건 확인(주석상 "old ... 대체" 서술만 잔존) 후 package.json의
   `react-native-geolocation-service ^5.3.1` 제거, `npm install`로 package-lock 갱신
   (removed 1 package). tsc/lint/jest 여전히 GREEN.

3. **권한 취소 후 elapsed 타이머 정지 (실제 버그)**: `notifyPermissionRevoked()`가 거리만
   freeze하고 시간은 wall-clock 기반 `getElapsed()`라 1초 틱마다 계속 증가하던 버그.
   엔진에 `frozenElapsed` 도입 — 권한 취소 시 현재 elapsed를 캡처하고 이후 `getElapsed()`가
   그 값을 반환(거리처럼 시간도 정지). App.tsx의 permissionRevoked 핸들러에서 1초 틱/스냅샷
   `clearInterval`도 추가(헛도는 타이머 정리). 검증 테스트 추가
   (`notifyPermissionRevoked freezes elapsed time` — wall clock 80s 더 흘러도 elapsed 불변).

## 게이트

- `npx tsc --noEmit` GREEN
- `npm run lint` GREEN (0 errors)
- `npx jest` GREEN — 45 suites / 404 tests (이전 403 +1 신규 시간freeze 테스트)

JS/설정 정리 위주 — 네이티브 빌드 영향 없음(매니페스트·네이티브 코드 무변경).
오케스트레이터가 `gradlew :app:assembleDebug`로 재검증.
