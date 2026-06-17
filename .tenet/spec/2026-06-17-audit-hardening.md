---
delivery_mode: autonomous
---

# Spec: Audit Hardening (탑티어 격상 배치)

## Purpose
시니어 감사에서 도출된 출시 리스크(멀티기기 데이터 손실)와 "아마추어 느낌" 격차(런플로우 분리·햅틱 부재·폼 미완성·코드품질·디자인 일관성)를 5개 묶음으로 순차 제거해 Keego를 탑티어(NRC/Strava/Apple Fitness) 완성도로 끌어올린다. 자율 연속 실행, 묶음 사이 integration 체크포인트.

## Tech Stack (confirmed)
- React Native 0.85.3, React 19.2.3, TypeScript 5.8, jest(@react-native/jest-preset), eslint(@react-native/eslint-config), prettier.
- 저장: AsyncStorage. 백엔드: REST `https://solelife-backend.onrender.com`(별도 repo) + Firestore(`@react-native-firebase`).
- **새 네이티브 의존성 추가 금지**(자율 검증 불가). 햅틱=RN 내장 `Vibration`, 토스트=커스텀 `Animated`, 새로고침=내장 `RefreshControl`.

## 핵심 아키텍처 결정 (authoritative)
- **단일 진실원천 = REST 백엔드.** 신발/런의 정본은 REST(solelife-backend). Firestore는 **암호화 백업/복원 전용**으로 강등한다.
  - 클라우드 머지에서 REST에 없는 레코드는 `apiAddShoe`/`apiAddRun`으로 **역등록**해 REST 정본에 합류시킨다(앱 측만; 백엔드 repo 변경 없음).
- **`updatedAt`(epoch ms) 스탬프**를 모든 신발/런 mutation(add/edit/updateMaxKm/retire/delete)에 부여해 `cloudSync.mergeRecords`의 "최신 우선" 로직을 실효화한다(현재 무력).
- **Tombstone(soft-delete)**: 삭제는 `deleted:true + updatedAt` 묘비로 표현, 머지가 존중 → 삭제가 기기 간 전파되고 부활하지 않는다.

## Components (DAG 묶음)
- **A. P0 데이터 정합성(REST 정본)** — updatedAt 스탬프 + mergeRecords 실효화 + Firestore 백업강등 + 클라우드→REST 역등록 + tombstone 삭제전파 + 부팅캐시 쓰기후 갱신/오프라인 pending 오버레이 + FCM 토큰 앱측 배선.
- **B. 런플로우/온보딩 통합 + 햅틱 + 접근성** — Run*/Onboarding 사설 팔레트(`C`/`KG`)를 `theme.ts`로 흡수(red/green/bg 단일화, BebasNeue→DISPLAY), `lib/haptics`(Vibration 래퍼) 신설 후 카운트다운/GO/시작·정지/목표달성/길게눌러종료에 배선, 런플로우 전 화면 a11y 라벨/role/live-region, 온보딩 "로그인" 링크 동작버그 수정.
- **C. 폼 + 피드백** — `lib/toast`(커스텀 Animated 스낵바, undo 지원) + ToastHost, RunForm/AddShoe `KeyboardAvoidingView`+입력 마스킹(`MM:SS`/`YYYY-MM-DD`)+인라인 검증, 런/신발 삭제에 undo 스낵바, Home/History `RefreshControl`+마지막 동기화 칩.
- **D. 코드 품질** — `lib/api.ts`/`lib/stats.ts` `any` 제거(BackendShoe/BackendRun/RunRow), `TIER_LABEL`·`MM:SS` 포맷터·`YYYY-MM(-DD)` 빌더 중복 제거(theme/lib/format로 단일화), HistoryScreen 런 리스트 `FlatList`화, ProfileScreen 렌더마다 `JSON.stringify` 제거, sanitizer `any→unknown`.
- **E. 디자인 시스템 통합** — 단일 `Button`/CTA(MockupButton·인라인 그라데이션 제거, 버튼 radius 단일), `Card` 채택 + 단일 보더 토큰, `SegmentedControl`·`StatGrid` 프리미티브, `TYPE` 프리셋 앱 전역 적용 + 명명된 hero 사이즈, 스크린 패딩 토큰, 반px 사이즈 제거, scrim 토큰.

## API (앱 측, 기존 REST 재사용 — 백엔드 repo 변경 없음)
| Method | Path | Auth | 용도 |
|---|---|---|---|
| (기존) POST | /api/runs, /api/shoes | uid | 클라우드→REST 역등록에 재사용 |
| (기존) PATCH/DELETE | /api/runs/:id, /api/shoes/:id | uid | tombstone 동기화 시 재사용 |

## 데이터 형태 변경(비파괴·마이그레이션 동반)
- 신발/런 레코드에 선택적 `updatedAt:number`, `deleted?:boolean` 필드 추가. 부재 시 기존 동작 유지(하위호환). 부팅 1회 마이그레이션으로 기존 레코드에 `updatedAt = Date.now()` 시드(스토리지 스키마 버전 키 도입).

## Auth Flow
변경 없음(기존 Firebase 익명/소셜 로그인 유지). FCM은 앱 측 토큰 취득·포그라운드 핸들러만 배선; 백엔드 토큰 등록 엔드포인트는 없으므로 토큰을 큐잉하고 엔드포인트 존재 시 POST(없으면 graceful no-op).

## Success Criteria (측정가능)
1. 모든 신발/런 mutation이 `updatedAt`을 기록하고, 같은 id 충돌 머지에서 최신 `updatedAt`이 승리한다(단위테스트).
2. 한 기기에서 삭제한 레코드가 머지 후 부활하지 않는다(tombstone 단위테스트).
3. 백엔드 다운 중 추가한 런이 강제종료·재실행 후에도 UI에 보인다(오프라인 부팅이 pending 오버레이).
4. `lib/haptics`가 존재하고 런 시작/정지/카운트다운/목표달성 경로에서 호출된다(스파이 테스트).
5. Run*/Onboarding 화면에서 사설 색상객체(`C`/`KG`) 및 `BebasNeue` 참조가 0이고 `theme.ts` 토큰을 사용한다(정적 스캔 테스트).
6. 삭제 액션이 undo 가능한 토스트를 띄우고, undo가 레코드를 복원한다(행동 테스트).
7. `lib/api.ts`·`lib/stats.ts`에 `any`가 0이다(정적 스캔/타입 테스트). `TIER_LABEL` 정의가 `theme.ts` 1곳뿐이다.
8. HistoryScreen 런 리스트가 `FlatList`(keyExtractor 포함)로 렌더된다.
9. 단일 `Button` 프리미티브가 모든 주요 CTA에 쓰이고 `MockupButton` 및 인라인 CTA 그라데이션 정의가 제거된다.
10. 전 구간 `npx tsc --noEmit` 0 · `npm run lint` 0 errors · `npm test` green 유지.

## Out of Scope (후속/사용자 액션)
- 새 네이티브 의존성(react-native-haptic-feedback 진짜 impact 햅틱, @react-native-community/datetimepicker 네이티브 날짜피커, gesture-handler/reanimated) — Mac/실기기 빌드 시 후속.
- solelife-backend repo 변경(updatedAt 컬럼 영속, FCM 토큰 등록 엔드포인트) + Render 배포 — danger zone, 사용자 액션.
- 음성 코칭(TTS 스플릿 안내), 위젯/워치, 지도 상세, 스플릿/랩 그래프 — 별도 기능 슬라이스(이번 배치는 하드닝·일관성에 집중).
- iOS 빌드/스토어 등록.

## Design Direction
기존 다크(#0A0A0C)+오렌지(#FF6500) 유지. 이번 배치는 **새 비주얼이 아니라 기존 토큰으로의 수렴**(런플로우/온보딩을 theme로 흡수, CTA/Card/Type 통일)이므로 신규 목업 불필요 — 정본 레퍼런스는 토큰 디스플린이 좋은 ProgressionScreen/HallOfFame/RetirementFlow.
