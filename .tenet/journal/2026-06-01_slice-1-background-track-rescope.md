# slice-1 백그라운드 트래킹 — 재스코프(Play-safe·정직) retry #1

type: journal
job_name: 백그라운드 트래킹(포그라운드 서비스) 재스코프
date: 2026-06-01
result: success

## 배경 — 이전 시도(f652753)가 거짓 약속이었던 이유

audit#1 커밋 f652753은 watchPosition `foregroundService` 옵션 + `ACCESS_BACKGROUND_LOCATION`
런타임 요청 + "화면을 꺼도 끊기지 않는다" dialog/notification + Manifest 권한 3종을 추가했다.
그러나 설치된 **react-native-geolocation-service@5.3.1은 포그라운드 서비스가 전혀 없다**
(`startForeground`/`Notification` 0건, 미지의 옵션 키는 네이티브 파서가 무시 → no-op).
즉 백그라운드 트래킹은 **실제로 동작하지 않는데** 권한을 요청하고 약속을 노출 →
**거짓 약속 + Google Play 심사 거부 위험**. eval이 정확히 이 점을 지적.

## 이번 retry의 재스코프 — "안전·정직한 forward-compat"

진짜 백그라운드 구현(lib 교체 / 네이티브 Kotlin 서비스)은 사용자 결정사항이라 이 job 밖.
대신 해로운 부분만 제거하고 무해한 forward-prep은 유지:

1. **해로운 부분 제거(Play-safe):**
   - `App.tsx`: `ACCESS_BACKGROUND_LOCATION` 런타임 요청 블록 + "화면을 끄거나 다른 앱을
     써도 끊기지 않도록" 거짓 약속 dialog 제거. `needsBackgroundLocationPermission` 호출 제거.
   - `AndroidManifest.xml`: `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_LOCATION`/
     `ACCESS_BACKGROUND_LOCATION` 권한 **모두 제거**(동작 서비스 없이 선언 = 심사 red flag).
2. **무해한 forward-prep 유지:**
   - `lib/foregroundService.ts`(순수·테스트) 유지, 헤더 주석에 "현재 no-op" 명시.
   - watchPosition `foregroundService` 옵션 유지 + "현재 인식 안 됨(no-op), 서비스 제공
     모듈 교체 시 즉시 활성" 주석.
3. **정직한 문서화:** knowledge 문서를 재스코프 결정으로 갱신. 테스트/주석의 "screen-off
   keeps recording" 과장 문구를 "옵션 전달만 검증(forward-prep), 실제 백그라운드는 follow-up"로 정정.
4. **권한 게이트 회귀 테스트:** App 통합 — Android에서 fine-location **거부 시 watchPosition
   호출 안 됨** + 백그라운드 위치 **요청 안 됨**(제거 확인). granted 시 watch 시작 + 백그라운드
   요청 없음(해피패스에서도 재스코프 유지). `jest.spyOn(PermissionsAndroid,'request')`로 구동
   (preset의 request는 jest.fn이 아니라 spyOn 필요).

## 검증

- `npx tsc --noEmit` clean.
- `npx eslint`(변경 4파일) 신규 에러 0 — 기존 18 errors(run 엔진 catch(e)/exhaustive-deps)
  는 baseline과 동일, 증가분 없음.
- `npx jest` 전체 **23 suites / 207 tests 통과**. App.foreground 3건(옵션 전달 + 게이트
  거부/허용) 포함.
- 스모크: App.foreground 테스트가 실제 App을 mount→home→goal→live-run까지 구동하므로
  렌더 무오류 확인(헤드리스 환경상 Metro/에뮬레이터 부팅 대체).

## follow-up(사용자 결정 대기)

실제 화면off/백그라운드 기록 지속은 (1) 포그라운드 서비스 내장 geolocation 모듈로 교체,
또는 (2) 자체 Kotlin 포그라운드 서비스 + ReactPackage 작성 중 하나 필요. 그때 제거한 권한·
`<service>` 선언을 함께 추가하면 부착해 둔 옵션이 즉시 활성화된다.
