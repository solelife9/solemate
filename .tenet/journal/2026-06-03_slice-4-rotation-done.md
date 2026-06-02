# slice-4-rotation done

type: journal
job_name: 신발 로테이션 추천 (recommendRotation + 홈 추천 카드)
created: 2026-06-03

## Findings

- **outcome**: slice-4-rotation 완료. lib/rotation.ts 실제 구현 + 홈 추천 카드 UI + 행동 테스트 + 수용 describe `.skip` 제거 후 통과.
- **deliverables**:
  - `lib/rotation.ts`: `recommendRotation({shoes,runs,runType?,today?})` 구현. 활성<2 → []; 정렬 ① runType 카테고리 매칭 우선(data/shoeModels brand+model 조회, 커스텀/미매칭은 `dominantCategoryForBrand` 브랜드 폴백) ② 더 오래 쉰(마지막 착용일 이른; 미착용=최우선) ③ 누적 사용(런 수) 적은 신발(마모 분산). 각 pick 한국어 reason('8일 휴식 · 카본화는 쉬게' 류). 순수함수 — 새 상태 없음.
  - `HomeScreen.rn.tsx`: `RotationCard`(testID `home-rotation`, 항목 `rotation-pick-N`). `rotation`/`onPickShoe` props 추가. 비면(1켤레/추천 없음) 숨김, pick-0 '오늘 추천' 칩, 누르면 onPickShoe(shoe.id). 토큰만(CARD_DIM/T1~T3/ACCENT/withAlpha/SPACE/RADIUS/FONT/DISPLAY).
  - `App.tsx`: 보유 신발+런에서 `recommendRotation` 계산해 HomeScreen 에 내려줌(brand/model=parseShoeName, runType 미선택=휴식·분산 기본). onPickShoe=setSelectedShoeId.
  - 테스트: `tests/acceptance/slice-4-features.test.ts` 로테이션 describe `.skip` 제거(3 통과). `__tests__/rotation.test.ts`(정렬/폴백/score 4). `__tests__/HomeScreen.rotation.test.tsx`(렌더·정렬·retired 제외·1켤레 숨김·press 4).
- **note**: 픽 정렬 broad-selector 충돌로 `__tests__/App.recommend.test.tsx` picker-순서 테스트 셀렉터를 '남음' 포함으로 좁혀 의도 보존(로테이션 칩엔 '남음' 없음).
- **iron law**: tsc 0, eslint 0 errors(기존 inline-style 경고만), jest 60 suites/536 passed. 토큰만 · 네이티브 0 · 데이터 보존(순수 파생).
- **smoke**: RN/Expo — 에뮬레이터 부팅 대신 react-test-renderer 로 실제 HomeScreen/App 마운트 렌더가 스모크(추천 카드 렌더·정렬·숨김 관찰 검증).
- **next**: slice-4 잔여 — 백업/복원, 공유카드, 챌린지(각 describe 아직 `.skip`).
