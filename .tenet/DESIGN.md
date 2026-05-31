# Design System — Keego

## Chosen Direction
- Selected mockup: `.tenet/visuals/2026-05-31-01-final-product.html` (+ slice 와이어프레임 02~04, walkthrough 05). 초기 계획 체크포인트 승인(2026-05-31).
- Rationale: 기존 앱의 양호한 뼈대(다크+오렌지, shoe-first, 발자국/배지/링)를 유지하되 **타이포 정제·오렌지 절제·미완성 기능 실동작·Keego 브랜딩**으로 "깔끔하고 완성된" 수준으로 끌어올린다. 경쟁 기준 Nike Run Club / Strava.
- 브랜드: **Keego** = keep going. "러닝화 내구도 관리로 부상 없이 계속 달리기." shoe-first(신발 고르고 바로 러닝→자동 거리 차감)가 시각적 주인공.

## Visual Principles

### Color (theme.ts 토큰 — 화면 하드코딩 금지)
- 배경: `BG #000000` · 카드 `CARD #1C1C1E` / `CARD_HI #2C2C2E` / `CARD_DIM #0D0D0D` / `HERO_BG #161618`
- 액센트(그라데이션): `ACCENT #FF6500` → `ACCENT_2 #FF9F4A` — **CTA·핵심 강조에만**
- 상태색: `WARN #FF9F0A` / `DANGER #FF453A` / `GOOD #30D158`
- 텍스트: `T1 #FFFFFF` / `T2 #EBEBF5` / `T3 #8E8E93` · 구분선 `SEP rgba(255,255,255,0.08)`
- **오렌지 절제 규칙**: 라벨·보조 텍스트는 T3 회색. 오렌지는 CTA, 선택 상태, 핵심 수치 강조에 한정. 신발 수명은 양호=GOOD/차분, 임계 근접=WARN, 초과=DANGER로 단계 표현.

### Typography — **Pretendard 단일 패밀리 (Bebas 제거)**
- 모든 텍스트 `FONT = 'PretendardVariable'`. `theme.ts`의 `DISPLAY = 'BebasNeue-Regular'` 사용처를 Pretendard로 교체.
- 큰 숫자(거리/페이스/시간/목표/통계): Pretendard **Bold(700~800)** + `fontVariant: ['tabular-nums']`(가능 시) + 타이트한 letterSpacing(예: -0.5). 콘덴스드 금지.
- 위계(권장 스케일, 토큰화): Display 56–64 / H1 28 / H2 22 / Title 18 / Body 15 / Caption 12.5 / Micro 11. weight 400/600/800.
- 단위(km, spm 등)는 숫자보다 작게(예: 0.5x), baseline 정렬, 적절한 좌측 간격으로 cramped 방지.

### Spacing & Radius (신규 토큰 — theme.ts에 추가)
- spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 (xxs~xxl). 화면 패딩 16~18, 카드 패딩 16, 섹션 간 20~24.
- radius: 카드 18, 히어로 22, pill 999, 버튼 16.

## Component Patterns (primitives.tsx)
- **Ring**(기존): 신발 수명/목표 달성률. 그라데이션 stroke, 중앙에 숫자+라벨. 수명 상태색 연동.
- **TabBar**(기존): 홈/기록/신발/프로필, 액티브=오렌지. 유지·정제.
- **Button(CTA)**: 오렌지 그라데이션, radius 16, 굵은 텍스트. ghost 변형=CARD_HI.
- **Card**: CARD 배경, SEP 보더, radius 18, 패딩 16.
- **Badge/Chip**: 상태(양호/주의/교체)·"교체 임박" — WARN/DANGER/GOOD 반투명 배경. (신규 추출 권장)
- **StatTile**: 큰 숫자 + T3 라벨 + 단위. 정렬 규칙 준수.
- 빈/로딩/에러/달성 상태: keep-going 보이스의 카피.

## Layout
- 모바일 단일 컬럼, SafeArea 준수, 하단 TabBar 고정.
- 홈 = shoe-first 척추: "어떤 신발로 달릴까?" → 신발 선택(실제 activeIdx 반영) → 히어로 신발 카드(수명 링) → "러닝 시작" CTA.
- 런 화면: 거리 1개 히어로 + 글랜서블 보조(페이스/시간/케이던스) + 자동 일시정지 상태 명확.
- 런 종료: 축하 + 해당 신발 마모 반영 + 주간 목표/스트릭 → 동기 루프.

## Evolution
- 구현 중 새 패턴 발생 시 본 문서 갱신. 프론트엔드 dev 잡은 CSS/컴포넌트 작성 전 본 문서를 읽는다.
- iron law: 화면 내 하드코딩 색/폰트 0, 네이티브 폰트 무단 추가 금지, 데이터 파괴 금지.
