# GPS 백그라운드 추적 — "항상 허용" 강제 제거, 포그라운드 권한만으로 동작 (2026-06-24)

실사용자(개발자 본인) 런 1건이 **31분 5.12km(나이키런 기준)인데 Keego는 0.39km/2:37**
으로 기록됨. 기기 컨테이너를 devicectl 로 추출(`run_1782303333085_8pkmqfk`)해 경로 25점·
거대 공백(184m·133m) 확인 → "주머니에 넣으면(화면 off) 거리·시간 둘 다 동결" 증언과 일치.

## 근본 원인 (우리 코드 버그)
`beginRun → startTracking(goalKm, {background: perm.background})`. 백그라운드 updates
task(`startLocationUpdatesAsync`)를 **"항상 허용"(background/Always) 권한이 있을 때만** 시작
했다. 포그라운드 watch 는 `allowsBackgroundLocationUpdates=false`(expo BaseLocationProvider)
라 화면 off 시 죽는다 → "앱 사용 중에만 허용" 사용자는 주머니에 넣는 순간 추적 정지.

그러나 expo-location 56 네이티브(`LocationModule.swift` startLocationUpdatesAsync)는
명시적으로 **foreground 권한만 검사**한다("As a user-initiated foreground service, this does
NOT require the background location permission … only check foreground"). task consumer 는
`allowsBackgroundLocationUpdates=YES`. 즉 `UIBackgroundModes:'location'`(Info.plist 설정됨)
+ "앱 사용 중 허용" + 파란 인디케이터만으로 백그라운드 위치가 계속 들어온다(Nike/Strava 방식).
**"항상 허용"은 불필요했고, 우리가 잘못 게이트했다.**

## 변경
- `lib/locationService.ts startTracking`: `opts.background` 게이트 제거 → 포그라운드 watch +
  background updates task 를 **항상** 시작(호출자가 이미 foreground 권한을 확인한 뒤 호출).
  background 불가(서비스 off/시뮬레이터/버전)는 try/catch graceful(포그라운드 기록은 유지).
  의도/iOS 근거를 docstring 에 명문화.
- `App.tsx`: 호출부에서 `background:perm.background` 제거. `beginRun(perm)` 의 `perm` 인자가
  더는 안 쓰여 시그니처에서 제거(+ 호출부 2곳).
- 테스트(회귀): `__tests__/lib/locationService.test.ts` — "background 권한 부재 시 bg task
  미시작"(옛 버그 인코딩)을 "**foreground 권한만으로 bg task 시작 + showsBackgroundLocationIndicator
  =true**"로 교체. `__tests__/App.foreground.test.tsx` — 동일 취지로 앱 통합 레벨 교정.

## 검증
- tsc clean. 변경 파일 신규 eslint 에러 0(잔존 2 에러는 createChallenge/deleteChallenge,
  pre-existing). 변경 스위트 전부 통과. 전체 run 신규 결정적 실패 0(잔존 red 4스위트 =
  옛 락커 복원 동선 obsolete, HEAD 동일).
- **기기 검증 남음**: iOS 재빌드 후 "앱 사용 중 허용"으로 화면 끄고/주머니 러닝 시 파란
  인디케이터 + 거리·시간 연속 누적 확인 필요(사용자 액션). 정확도는 "정밀한 위치" 권장.

## 메모
- 이번 손실 런 자체는 원본 fix 미저장으로 거리 복원 불가(로컬 레코드는 안전).
- "항상 허용"은 앱 *종료 후* 재기동(메모리 압박 등) 회복에만 이점 — 일반 런엔 불필요. 추가
  resilience 가 필요하면 별도 후속(권한 요청 UX/배너)으로 다룬다.
