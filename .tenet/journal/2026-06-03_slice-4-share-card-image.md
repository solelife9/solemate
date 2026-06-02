# Slice 4 — 런 기록 공유 카드(이미지)

날짜: 2026-06-03

## 무엇을

런 상세에서 거리/페이스/시간/신발명/미니 코스맵을 react-native-svg 카드로 그리고,
Svg ref의 `toDataURL()`로 PNG dataURL을 만들어 RN `Share`로 이미지 공유한다.
**새 네이티브 의존(react-native-view-shot 등) 추가 0** — 이미 설치된 react-native-svg만 사용.

## 구현

- `lib/shareCard.ts`
  - `buildShareCardModel(input)` — 런 한 건 → 카드 표시 필드(순수함수). 거리는 표시
    단위(km|mi) 환산·소수 2자리, 페이스 라벨은 `/km` 고정(`buildRunShareText`와 동일
    규칙: 페이스 값은 언제나 초/km). '--' 페이스·시간은 칸에서 빠지고 신발/날짜는 '' 폴백.
  - `captureCardDataUrl(ref)` — Svg ref의 `toDataURL(cb)` 콜백 계약을 Promise로 감싸
    `data:image/png;base64,…` 로 해석. 미마운트/미지원/빈 base64/동기 throw → reject.
  - `shareRunCard(ref, fallback)` — 캡처→`Share.share({url})`, 실패 시 기존 텍스트
    공유(`buildRunShareText`)로 조용히 폴백.
- `ShareCard.tsx` — 1080×1080 정사각 SVG 카드. forwardRef를 내부 `<Svg>`에 연결해
  부모가 캡처. 코스 경로는 기존 `projectRoute()` 재사용하되 `<Path>`로 그린다
  (CourseMap의 `<Polyline>`과 카운트가 섞이지 않게 — 렌더 테스트 격리). 색은 theme
  토큰만(raw hex 0), 다크+오렌지.
- `HistoryScreen.rn.tsx` RunDetail — 화면 밖(off-screen) `<ShareCard>` 마운트 +
  '카드 공유' 버튼(image-outline, ACCENT). 기존 '공유'(텍스트) 버튼은 유지(회귀 가드).
- `jest.setup.js` — Svg 목을 class로 바꿔 ref가 인스턴스로 잡히고 `toDataURL(cb)`가
  고정 base64를 콜백(네이티브 캔버스 없이 dataURL 경로 테스트).

## 검증

- 순수: `__tests__/lib/shareCard.test.ts` — 필드 매핑·dataURL 생성/실패 경로·공유 폴백.
- 렌더: `__tests__/ShareCard.test.tsx` — 필드가 SVG로 렌더, route→단일 `<Path>`,
  빈 route→Path 없음, forwardRef→toDataURL 보유.
- 통합: `__tests__/HistoryScreen.shareCard.test.tsx` — '카드 공유'→`Share.share({url})`,
  텍스트 '공유' 버튼 회귀 가드, reject 무시.

iron law green: tsc 0, eslint 0 error, jest 66 suites / 588 passed (3 skip 유지).

## retry 1 — code_critic 차단 결함(product_bug) 수정

**증상:** 페이스/시간 통계 텍스트(statY=712 라벨·768 값)가 미니맵 Rect 밴드
[MAP_Y=692, 992] 안에 있었고, 불투명 맵 배경 `<Rect fill=CARD_DIM>`(문서 순서상
stats 뒤)이 SVG 페인트 순서로 통계를 덮어 공유 이미지에서 페이스·시간이 안 보였다.

**수정(ShareCard.tsx):**
- 세로 레이아웃을 점검해 통계 행을 미니맵 위로 올렸다. `MAP_H` 300→240(맵을 약간
  줄여 공간 확보), `MAP_Y`는 752로 내려감. `statY` 712→656(값 하단 712 < MAP_Y 752,
  여백 40px). 신발 라인 636→612로 올려 통계 라벨과 간격 확보.
- 해시태그 푸터를 맵 바로 위(MAP_Y-36)에서 헤더 우측 상단(y=228, 태그라인과 같은
  베이스라인·우측 정렬)으로 이동 — 통계가 차지한 자리를 양보, 좌/우 정렬로 비충돌.
- `MAP_Y`/`MAP_H` export(테스트 위치 가드 재사용). 토큰만(raw hex 0), 다크+오렌지 유지.

**위치 가드(ShareCard.test.tsx):** 통계 4개 텍스트(페이스 라벨/값·시간 라벨/값)가
실제 존재하고 각 y좌표가 밴드[MAP_Y, MAP_Y+MAP_H] **밖(위)**임을 단언 — 겹침 회귀 방지.
기존 '필드 존재' 단언은 그대로 유지.

iron law green: tsc 0, eslint 0 error, jest 66 suites / 589 passed(+1 가드, 3 skip 유지).
react-native-svg만 사용(새 네이티브 의존 0), toDataURL 캡처·텍스트 폴백·기존 테스트 그대로.
