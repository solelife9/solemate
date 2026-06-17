# a2-tombstone soft-delete 삭제 전파 (구현 완료)

type: journal
job_name: tombstone soft-delete 삭제 전파 (a2-tombstone)
created: 2026-06-17

## What

삭제를 하드삭제 대신 soft-delete tombstone(`deleted:true + updatedAt` 갱신)으로 표현. a1의
updatedAt 인프라 위에 구축.

### lib/cloudSync.ts (순수 로직 — 테스트 핵심)
- `markDeleted(rec, now)` — stampUpdatedAt 규약(불변·비파괴)으로 `deleted:true + updatedAt`
  묘비 생성. 원본 필드 보존(undo/진단용).
- `isDeleted(rec)` — `deleted===true`만 참(방어적).
- `liveRecords(list)` — 묘비 제외 필터(화면/집계가 삭제 제외).
- `partitionTombstones(list)` — 머지 결과를 live/tombstone 으로 분리.
- `mergeRecords` 충돌 규칙에 tombstone tie-break 추가: updatedAt 동률이면 tombstone 우선
  → 경계(같은 ms)에서도 부활 차단. 묘비는 결과에 **그대로 남겨**(드롭 금지) 다음 동기에도
  삭제가 계속 전파. 그 외엔 기존 '최신 우선' 그대로 — 삭제 후 더 최신 편집은 정직하게 부활.

### App.tsx (최소 배선 — REST 정본 유지)
- 묘비 저장소 `tombstones:{shoes,runs}` 상태 + `K_TOMBSTONES` 영속 + 부팅 1회 복원.
- `deleteShoe`/`deleteRun`: **REST DELETE(정본) 유지** + 라이브 배열에서 제거 + 묘비 추가
  (`markDeleted`). 미동기(_pending) 런도 자동동기가 이미 Firestore 에 올렸을 수 있어 동일 처리.
- `backupData`: 라이브 뒤에 묘비 합류 → 동기(mergeCloudData)가 삭제를 전파.
- `applyBackupPayload`: 머지/백업 결과를 `partitionTombstones` 로 분리 — live→화면 상태,
  묘비→저장소. **불변식**: 라이브 배열은 항상 묘비-free(한 id 가 live·묘비 동시 부재) →
  거리/수명 계산이 자동으로 삭제 제외, 자기충돌 부활 없음.
- 온라인 부팅이 REST 데이터로 라이브를 교체해도 묘비는 별도 영속이라 backupData 가 계속
  싣는다 → 동기 직전 강제종료 후 재부팅에서도 부활하지 않음.

## Anti-scenario (방지 확인)

scenarios #2 "한 기기서 지운 레코드가 다른 기기 동기화로 되살아난다" → 묘비(최신 updatedAt)가
옛 live 를 이기고, 동률에서도 tombstone 우선 → 부활 차단. 단위테스트로 양방향 + 동률 + 정직한
편집-부활까지 검증.

## Verify

- `npx tsc --noEmit` 0.
- `npm run lint` 0 errors(잔여 warning 은 기존 no-void/inline-style, 신규 라인 무관).
- `npx jest` 125 suites / 1240 pass / 20 todo. cloudSync 스위트 28 pass(+10 tombstone:
  markDeleted/isDeleted, liveRecords/partitionTombstones, 삭제 전파, 부활 방지(anti), 동률
  tie-break, 정직한 편집-부활).
- RN 앱이라 서버/웹 스모크 부재(a1 playwright not_applicable) — tsc + 행동 단위테스트가 스모크.

## Scope note / next

- 오프라인 부팅 캐시 쓰기후 갱신은 a3(부팅캐시-offline) 담당 — 묘비 저장소가 라이브와
  분리돼 a3 의 캐시(라이브) 설계와 충돌하지 않는다.
- 삭제 undo(스낵바, 사이드키 복원)는 c2-delete-undo. markDeleted 가 원본 필드를 보존해 둠.
- 묘비는 K_TOMBSTONES 에 누적(작은 {id,deleted,updatedAt} 위주) — GC 는 후속 선택.
- next: a3-bootcache-offline
