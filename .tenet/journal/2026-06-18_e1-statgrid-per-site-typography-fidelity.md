# e1 design-system: StatGrid/Stat unit·label 타이포 사이트별 복원(시각 동등 위반 3건 수정)

type: journal
job_name: StatGrid 시각 동등 위반 수정(code_critic product_bug ×3)
created: 2026-06-18
parent_commit: f97da96

## Problem (code_critic 정당 지적)

f97da96 의 StatGrid/Stat 통합은 **value** 타이포(valueSize/valueWeight/valueLS)만
파라미터화하고 **unit/label** 타이포를 Profile 값으로 하드코딩(statS.unit=12/600,
statS.label=11.5/600/mt4). 이 값은 Profile 에서만 원본과 일치 → 다른 두 사이트가 어긋남:

| 사이트 | 원본 unit | f97da96(잘못) | 원본 label | f97da96(잘못) | 셀 padV |
| Profile | 12/600 | 12/600 ✓ | 11.5/600 mt4 | ✓ | 0 |
| History RunDetail 2×3 | 11.5/**500** | 12/600 ✗ | 11.5/**normal** mt4 | 11.5/**600** ✗ | **6**→누락 |
| Progression stat-row | **11**/**700** | 12/600 ✗ | **11**/600 mt**5** | 11.5/600 mt**4** ✗ | 0 |

원본값은 `git show f97da96^:` 로 마이그레이션 전 StyleSheet(History statUnit/Label/Cell,
Progression statUnit/Label, Profile statUnit/Label) 직접 대조해 확정.

## Fix

- **primitives.tsx**: Stat/StatGrid 에 unit/label 타이포 prop 노출 — `unitSize·unitWeight·
  labelSize·labelWeight·labelMarginTop·verticalPadding(셀 세로패딩)`. 기본값은 현행 Profile
  (12/600 · 11.5/600 mt4 · padV 0)로 두어 prop 미전달 회귀 0. statS.unit/label 정적 스타일은
  색·패밀리만 남기고 크기·굵기·마진은 prop 으로 일원화(이중 소스 제거). value face 는 이미
  파라미터화돼 있어 그대로.
- **HistoryScreen.rn.tsx** (2×3): unitSize 11.5/unitWeight 500, labelSize 11.5/labelWeight
  'normal', labelMarginTop 4, **verticalPadding 6** 복원 → 셀당 12px 좁아지던 행 리듬 회복.
- **ProgressionScreen.rn.tsx** (stat-row): unitSize 11/unitWeight 700, labelSize 11/
  labelWeight 600, labelMarginTop 5 복원.
- **ProfileScreen.rn.tsx**: 변경 없음(기본값이 곧 원본).

## Verification

- `__tests__/primitives.segstat.test.tsx` 에 사이트별 타이포 단언 3개 신설(기존 12 →15).
  각 사이트 호출 형태로 렌더 후 unit/label 의 fontSize·fontWeight·marginTop·셀 paddingVertical
  이 원본과 정확히 일치함을 react-test-renderer 트리에서 단언(이전 12개는 unit/label 타입을
  전혀 검증 안 해 회귀를 놓침).
- 전체 `jest`: 137 suites / 1396 pass(+3, +2 todo). `tsc --noEmit` 0. eslint 변경파일 error 0
  (인라인스타일·no-void 경고는 기존 동일).

## Lessons

- 통합 프리미티브에서 한 면(value)만 파라미터화하고 인접 면(unit/label)을 한 사이트 값으로
  하드코딩하면 "시각 동등"이 그 한 사이트에서만 성립 → 통합 자체가 회귀가 된다.
- 회귀를 못 잡은 근본 원인: 테스트가 value face·구조(분리노드·divider·columns)만 단언하고
  unit/label 의 실제 타입값을 안 봄. 통합 시 **모든** 면을 사이트별로 단언해야 한다.
- 원본 복원은 추측 금지 — `git show <pre-migration>^:파일` 로 옛 StyleSheet 를 픽셀 단위 대조.
