# a2-tombstone 집계-제외 행동 테스트 보강 (retry #1)

type: journal
job_name: tombstone soft-delete 삭제 전파 (a2-tombstone) — test_critic 차단 해소
created: 2026-06-17

## Why (test_critic 차단)

merge 테스트는 강했으나(부활방지·동률 tie-break·정직한 latest-wins) **deliverable '거리/수명
계산이 삭제 레코드를 제외'에 행동 테스트가 없었다**. liveRecords/partitionTombstones 가 고립된
순수함수로만 검증됐고, shoeHealth(lib/shoe.ts:111)는 deleted 를 직접 필터하지 않아 제외 보장이
미테스트 App.tsx plumbing(deleteRun live-filter + applyBackupPayload partition)에만 의존 →
tombstone 이 runs 배열에 새면 거리/수명이 부풀어도 못 잡았다.

## What (테스트만 보강 — 구현/로직 0 변경)

### __tests__/lib/shoe.test.ts (순수 행동 계약 고정)
- **삭제 런 제외 계약**: `shoeHealth(shoe, liveRecords([liveRun, markDeleted(같은shoe런)]))`
  의 usedKm 가 삭제 런 km 를 제외함을 단언. **대조로 raw 리스트(필터 안 함)를 먹이면 삭제분이
  합산돼 부풀어 오름**을 함께 단언 → shoeHealth 가 deleted 를 직접 거르지 않는 brittleness 노출.
- 한 신발 모든 런 삭제 → usedKm 0, remainingKm 전체 복귀.
- **partition→aggregate 링크**: tombstone(런 X 포함) merge 결과 → partitionTombstones 가 X 를
  tombstones(=live 아님)로 보내 → live 배열을 shoeHealth 에 먹이면 X(120km) 빠짐(usedKm=40),
  대조로 머지 결과 전체(묘비 포함) 먹이면 160km 로 부풀음.

### __tests__/App.tombstone.test.tsx (신규 — 통합 배선)
- deleteRun 후: (1) 런이 live 집계 입력에서 사라져 신발 usedKm(uiShoes.used)가 50→0 으로
  삭제분만큼 감소(거리/수명 제외), (2) 동시에 {deleted:true,updatedAt,shoe_id 보존} 묘비가
  영속 store(tombstones_v1)에 남아 다음 동기 전파 유지. 두 관측결과를 한 흐름으로 단언.

## Verify

- `npx tsc --noEmit` 0(처음 unknown[]→RunLike[] 캐스트 2건 보정 후 green).
- `npx eslint`(변경 파일) 0.
- `npx jest` 126 suites / 1244 pass / 20 todo (기존 1240 + 신규 4). cloudSync 28 그대로,
  shoe 스위트 +3, App.tombstone +1. 기존 통과 테스트 전부 유지.

## Iron law 준수

데이터 파괴 0, 새 네이티브 0, 구현/로직 미변경(테스트만), 관측가능 결과만 단언(순수함수 반환값
usedKm·partition 결과 / prop uiShoes.used / AsyncStorage tombstones_v1), 오라클 누출 없음.
