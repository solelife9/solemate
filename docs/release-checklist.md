# Keego 출시 체크리스트 (Android & iOS)

> 2026-06-17 기준. 코드 완성도는 높음(1200+ 테스트). 아래는 **출시 게이트**(코드 외 운영/플랫폼/스토어).
> 🚫=블로커, 🟡=권장.

## 0. 공통 (출시 전 필수)
- 🚫 **백엔드 Render 배포** — 미배포 시 신규 사용자가 부팅에서 막힘. → `docs/backend-deploy.md` 참고.
  (완화책으로 로컬-퍼스트 부팅 폴백을 코드에 추가 중 — 그래도 랭킹/동기화엔 백엔드 필요.)
- 🚫 **개인정보 처리방침 공개 URL** — `docs/privacy-policy.md` 를 호스팅(GitHub Pages 등).
- 🚫 **실기기 QA 1회전**: 실제 풀 러닝(GPS 거리/경로/케이던스/저장) + 화면 off 백그라운드 추적 + FCM 푸시 수신 + 신발 등록/은퇴/교체 알림.
- 🟡 버전·빌드번호 정리(Android versionCode/Name, iOS MARKETING_VERSION/CURRENT_PROJECT_VERSION).
- 🟡 앱 아이콘·스플래시 최종본(현재 자산 점검), 다크 일관성.

## 1. Android (Google Play)
- 🚫 릴리스 서명 키 결정: 현재 **debug.keystore**로 서명 중(Firebase OAuth SHA-1 등록됨). Play 업로드용 **업로드 키** 별도 생성 + Play App Signing 등록 권장. (debug 키로 스토어 업로드는 비권장)
- 🚫 Play Console: 앱 생성, 데이터 보안 폼, 콘텐츠 등급, 타겟 SDK 정책 충족.
- 🚫 백그라운드 위치 권한: Play 정책상 선언 양식 + 시연 영상 제출 가능성.
- 🟡 스크린샷(폰), 피처 그래픽, 짧은/긴 설명.
- 🟡 AAB(.aab) 빌드 — 현재 APK 빌드 중. Play는 AAB 요구(`bundleRelease`).

## 2. iOS (App Store) — 맥 셋업 후
- 🚫 `docs/mac-ios-setup.md` 의 iOS 갭 전부: Firebase iOS 앱+`GoogleService-Info.plist`, Maps iOS 키, 서명/프로비저닝.
- 🚫 Apple Developer 계정($99/년), App Store Connect 앱 생성.
- 🚫 권한 사용 설명(Info.plist) — 이미 보강함(위치/모션/사진/백그라운드).
- 🟡 APNs 키(.p8) Firebase 업로드(푸시), Push capability.
- 🟡 스크린샷(6.7"/6.5"), App Privacy 표기.
- 🟡 카카오/네이버 로그인 쓰면 iOS URL scheme.

## 3. QA 시나리오(실기기)
1. 신규 설치 → 온보딩 → 신발 등록 → 러닝 1회(실외) → 저장 → 기록/상세/코스맵 확인
2. 화면 끄고 러닝 지속 → 거리 누적 확인(백그라운드)
3. 신발 수명 80%/100% 도달 → 컨디션 색·교체 알림
4. 은퇴 플로우 → Midnight 카드 저장/공유
5. 오프라인(비행기모드)에서 부팅·러닝·저장 → 복귀 시 동기화
6. 푸시 알림 수신(교체/리캡)

## 4. 출시 순서(권장)
1. 백엔드 배포 → 2. 실기기 QA → 3. 개인정보방침 호스팅 + 스토어 자산 → 4. **Android 먼저(내부테스트→프로덕션)** → 5. 맥에서 iOS 설정 → TestFlight → App Store
