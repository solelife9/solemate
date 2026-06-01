# slice-3-run — RunScreen 토큰화 + Metric 히어로

- **date**: 2026-06-02
- **job**: slice-3-run (deps: theme-primitives)
- **scope**: `RunScreen.rn.tsx`(목표-입력 RunStart 화면) 하드코딩 색/인라인 fontFamily → theme 토큰 + primitives 치환

## 한 일
- 하드코딩 색 전부 토큰화(raw hex 0): 화면 배경 `#0E0E10`→`BG`, CTA/아이콘 `#fff`→`Button` primitive 내부 `T1`,
  프리셋 on 배경 `rgba(255,101,0,0.14)`→`withAlpha(ACCENT,0.14)`, 프리셋 off 보더 `rgba(255,255,255,0.12)`→
  `withAlpha(T1,0.12)`, 키 눌림 배경 `rgba(255,255,255,0.07)`→`withAlpha(T1,0.07)`. 모두 토큰에서 파생 →
  단일 진실원(토큰 색 바꾸면 반투명도 따라감).
- **거리 1개 히어로 지표 = `Metric` primitive** 적용(DISPLAY=Pretendard + tabular-nums + km 단위 baseline 정렬).
  기존 bigNum/bigUnit 커스텀 스타일 제거 → 위계 단순화(인지부하↓).
- CTA를 `Button` primitive(오렌지 그라데이션 cta)로 교체 — 라벨 `{val}km 러닝 시작` 유지, play 아이콘 유지,
  goal<=0 disabled. 오렌지 절제: 강조는 선택 프리셋(ACCENT)·시작 CTA에만, 라벨은 T2/T3.
- **심박(bpm/heart_rate)**: 이 화면(goal entry)엔 심박 UI가 애초에 없음 + 라이브 런 화면(App.tsx)에도 심박 표시
  없음 → 숨길 UI 없음. `theme.ts`의 `Run.bpm` 필드/타입과 `App.tsx` addRun `heart_rate` 보존(미변경,
  iron law #17 — 표시만 숨김, 데이터 파괴 금지).
- 자동 일시정지 피드백은 라이브 런 화면(App.tsx `pauseLabel`/`pauseColor=WARN`) 소관 — 본 파일(goal entry)은
  일시정지 상태가 없어 해당 없음. 네이티브(KalmanFilter 등) 미변경.

## 테스트
- `__tests__/RunStart.test.tsx` 신설(행동 4케이스): 기본 5km 히어로+km 단위+신발 텍스트 렌더, 프리셋 10km→히어로/
  CTA 라벨 갱신+onStart(10), 키패드 입력+백스페이스→onStart(5), 소수(3→.5)→onStart(3.5) 반올림.
- `tests/acceptance/slice-3-design.test.ts`의 RunScreen 단언 전부 green(raw hex 0 / inline fontFamily 0 /
  BebasNeue 없음 / SOLEMATE·SOLELIFE 없음). ProfileScreen·HistoryScreen 잔존 hex 실패는 별도 slice-3 잡 소관.
- run 관련 회귀(App.shoefirst/addrun/runedit/runrecover/runsync) 21/21 green. tsc·eslint green.
