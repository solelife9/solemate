# Slice 3 — 횡단 마감 패스 retry 1 (code_critic product_bug + test_critic test_bug)

날짜: 2026-06-02
잡: slice-3-crosscut-finish-pass (retry 1)
기반 커밋: 7f983c3 (a11y/safeArea/카피/死deps — 유지)

## 배경
7f983c3 의 횡단 마감은 대체로 정상. critic 2건만 해소:
- code_critic product_bug: a11y role/label/press 를 부여한 선택 컨트롤 3개가 44pt 미만이고
  hitSlop 보정이 없음 → 다른 아이콘버튼(hitSlop 부여)과 일관성 위반.
- test_critic test_bug 다수: crosscut 행동 테스트가 부족(44pt/press/WCAG/비색상/카피/死deps 미단언).

## A. 44pt 일관성 (product 수정)
- `RunScreen.rn.tsx` preset(height 38): `hitSlop={{top:6,bottom:6}}` → 순 50pt.
- `AddShoeScreen.rn.tsx` chip(height 40): `hitSlop={{top:6,bottom:6}}` → 순 52pt.
- `HistoryScreen.rn.tsx` segItem(paddingVertical:9≈36): `minHeight:44`+`justifyContent:'center'`
  로 높이 상향 → 순 44pt(파생 추정 불필요한 확정 타깃). 가로는 기존 paddingHorizontal 로 충분.
- 좌우 슬롭은 생략(인접 칩/세그 겹침 회피) — 결손은 세로축뿐이라 세로만 보정.

## B. 행동 테스트 — `__tests__/crosscut.polish.test.tsx` (신규, 16 케이스)
1. **44pt**: 세 선택 컨트롤(preset/chip/segment, role=button+selected)·아이콘버튼(닫기)·
   TabBar 탭(hitSlop>0)·CTA Button(paddingVertical*2+labelFont)이 모두 세로 ≥44pt 임을
   `height|minHeight|2×paddingVertical + hitSlop` 으로 계산 단언. 38/40/36 회귀 시 실패.
2. **press 피드백**: TabBar 탭 `style({pressed:true})` 가 `{pressed:false}` 와 달라야(opacity 변화) 함.
3. **WCAG**: T3(#9C9CA3) over CARD/BG 명도비를 sRGB relative-luminance 로 계산 → 각 ≥4.5:1
   (CARD≈6.2, BG≈7.7). T3 를 더 어둡게 회귀시키면 실패.
4. **비색상 단서**: TierBadge(교체/주의)가 실제 Ionicons 'warning' 노드를 렌더 — 아이콘이
   사라지면(색상 단독) 실패.
5. **카피(로딩/에러)**: App 을 각 부팅 상태로 렌더 — LOADING(boot-skeleton)에 keep-going
   캡션('곧 다시 달릴 수 있어요'), ERROR(boot-error)에 '계속 달릴 수 있어요'(KEEP_GOING_RETRY).
   ※ 기존 스켈레톤은 무카피였음 → `KEEP_GOING_LOADING` 캡션을 BootSkeleton 에 추가(로딩도
     keep-going 보이스로). App.coldstart 스켈레톤 테스트('이번 주' 부재)와 무충돌.
6. **死deps**: package.json 에 `@react-navigation/*`·`react-native-screens` 부재 + 소스 전수
   스캔(fs walk)으로 import 0건 단언. 테스트 자체가 자기-매치되지 않게 모듈명은 조각 결합.

## 검증
- `npx tsc --noEmit`: exit 0
- `npm run lint`: 0 errors (신규 파일 0 warning). 기존 warning 수준 유지.
- `npm test`: 56 suites / **510 passed** (494 + 신규 16). slice-3-design @slice-3 인수 전부 유지.
- 스모크: `react-native bundle`(android, dev=false) exit 0, 1.6MB. nav deps 참조 0건.
- 다크(#000)+오렌지(#FF6500) 유지. rxjs 는 react-native-sensors transitive 로 잔존(직접 제거 안 함).
