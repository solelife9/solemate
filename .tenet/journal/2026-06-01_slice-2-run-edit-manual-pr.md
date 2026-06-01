# slice-2-run-edit-manual-pr 완료

type: journal
job_name: 런 편집/삭제 + 수동 입력 + PR 카드
created: 2026-06-01

## Findings

- **outcome**: tsc/lint(0 errors)/jest 374 통과(기존 368 + 통합 4 + 단위 2).
- **deliverables**:
  - App.tsx: `editRun`(PATCH /api/runs/<id>, 미동기 런은 큐 패치) · `deleteRun`(DELETE, 미동기는 로컬 제거, route_/time_ 키 정리) · `addManualRun`(source='manual'로 addRun 재사용). toUiRun에 runDate/durationS 원본 추가(편집 프리필). 개인 기록(PR) records 계산 후 ProfileScreen 주입.
  - HistoryScreen.rn.tsx: RunForm(수동 입력/편집 공용 — 신발칩·거리(표시단위→km)·시간(MM:SS→초)·날짜) + 헤더 '+' 추가 버튼. RunDetail에 편집·삭제 액션, 삭제는 확인 Alert(파괴 방지, destructive).
  - ProfileScreen.rn.tsx: PersonalRecord 타입 + '개인 기록' 카드(1km 페이스/5km 기록/최장 거리).
  - lib/runPersistence.ts: updatePendingRun(미동기 런 편집값 보존).
  - theme.ts: Run에 runDate?/durationS? 추가.
- **설계 근거**: shoeHealth는 runs 파생(toUiShoe)이므로 런 삭제/편집 시 신발 km은 자동 재계산 — 별도 신발 PATCH 불필요. 거리 저장 표준 km 유지(입력은 표시단위 환산). 데이터 파괴 금지 iron law: 삭제는 확인 Alert로 보호.
- **tests**: __tests__/App.runedit.test.tsx 4종(삭제→신발km↓·확인Alert / 수동입력→목록+source=manual POST / 편집→PATCH+km재계산 / PR 카드 렌더). runPersistence 단위 2종(updatePendingRun 매칭/무매칭).
- **smoke**: bare RN(웹 dev 서버 없음) — react-test-renderer로 <App/> 전체 마운트 후 기록/프로필/신발 탭·폼·상세를 throw 없이 렌더(통합 테스트가 곧 스모크).
