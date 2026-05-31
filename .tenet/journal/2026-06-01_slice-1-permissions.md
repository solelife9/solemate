# slice-1-permissions 완료

type: journal
job_name: 권한 거부/회수 안내·iOS 권한요청·GPS 死구간 배너
created: 2026-06-01

## Findings

- **job**: slice-1-permissions (이전 시도 21분 무진전으로 취소 후 HEAD 30d089c에서 재수행)
- **result**:
  - **iOS 권한요청(audit#8)**: 그동안 iOS는 위치 권한을 한 번도 요청하지 않아 첫 fix가
    영영 오지 않을 수 있었다. `Platform.OS==='ios'` 분기에 `Geolocation.requestAuthorization('whenInUse')`
    추가. 미허용 시 트래킹 차단 + 한국어 안내 + `Linking.openSettings` 딥링크.
  - **권한 거부/주행중 회수 안내**: 거부(Android fine-location · iOS whenInUse)와 주행 중
    회수(watchPosition error code 1) 모두 한국어 안내 Alert + 설정 딥링크. 회수 시 `stop()`으로
    watch/타이머/스냅샷을 멈춰 가비지 거리·시간 누적을 막고(크래시 금지·1회 가드), 영구 배너 표시.
    `Linking.openSettings()` 반환이 mock에선 undefined라 `Promise.resolve(...).catch`로 감쌈.
  - **GPS 死구간 배너(audit#9)**: 마지막 fix 수신 후 N초 무신호면 거리는 멈춘 채 시간만
    누적된다. 순수함수 `lib/gpsHealth.ts:gpsStallStatus(lastFixMs, now, threshold)`로 판정
    (임계값 `GPS_STALL_THRESHOLD_MS=8000` engineConstants). 1초 엔진 틱에서 평가해 배너 ON/OFF,
    새 fix·일시정지 시 해제.
  - **danger zone 회귀 금지**: 기존 Android `PermissionsAndroid` fine-location 게이트 유지 —
    거부 시 watchPosition 미호출(가비지 거리 금지) 보존, 안내만 딥링크로 강화.
- **tests**:
  - 단위: `__tests__/lib/gpsHealth.test.ts` — 순수 死구간 판정(경계·시계역행·커스텀임계·워밍업) 6 케이스, globalThis 사용.
  - 통합: `__tests__/App.permission.test.tsx` — iOS whenInUse 요청·거부 차단·딥링크, Android 거부→watchPosition 미호출·딥링크, 주행중 회수→clearWatch+배너+딥링크, 死구간→배너(fake timers로 시계 진행). 5 케이스.
- **verify**: tsc 통과, lint 신규 0(App.tsx 18 에러 베이스라인 유지·신규 파일 0), jest 25 suites/218 tests 통과.
- **note**: 실제 백그라운드 트래킹은 여전히 라이브러리 한계(geolocation-service@5.3.1 포그라운드 서비스 없음)로 별건 — slice-1-background-track 재스코프와 동일 전제. 死구간 임계 8s는 watchPosition interval(1s)의 8배 여유.
