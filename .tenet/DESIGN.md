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

---

# Progression & Retirement Ecosystem (2026-06-12)

> Design notes for the Progression & Retirement feature (slices A–D).
> Source spec: `.tenet/spec/2026-06-12-progression.md`. Mockups: `.tenet/visuals/2026-06-12-*`.
> Tone benchmark: Apple Fitness · WHOOP · PlayStation Trophies · Spotify Wrapped. **Never childish, meme, or RPG.**

## Chosen direction
- **Dark + KEEGO orange, single family.** Continues the shipped Slice-3 system: background `#0A0A0A`, cards `#141414` / recessed `#171717`, one brand accent `#FF6500` used sparingly (CTAs, Legend tier, wordmark).
- **Pretendard single family** (display + body), no secondary display face. Artifacts use the system stack (no web fonts allowed); production uses `PretendardVariable`.
- **Tabular numerals everywhere** so km / paces / progress counts align.
- Clean single hierarchy (800 headings, regular body), generous spacing, rounded corners 14–26. Phone-framed UI (~390px) on black; retirement cards square (~360px scaling a 1080×1080 keepsake).

## TIER_COLORS palette (authoritative → add to `theme.ts`)
Used for rank chips, tier rings, title-tier dots, achievement rarity labels, retirement-grade accents.

| Tier     | Color     | Notes |
|----------|-----------|-------|
| Bronze   | `#CD7F32` | entry |
| Silver   | `#C0C0C0` | |
| Gold     | `#FFD700` | |
| Platinum | `#14B8A6` | teal |
| Diamond  | `#3B82F6` | blue |
| Master   | `#9333EA` | purple |
| Legend   | `#FF6500` | KEEGO orange — top tier only |

Progress points by rarity: Bronze 10 · Silver 25 · Gold 50 · Platinum 100 · Diamond 250 · Master 500 · Legend 1000. A displayed total feeding the engagement pillar — **not an RPG level**.

## Retirement card — default = Format C
Renderer supports all four layouts; **Format C (Apple / Korean, emotional-proud) is the default**, with a small **Smart Retirement Grade badge** (e.g. 💎 Perfect Retirement), minimal, lots of breathing room, emotional closing ("훌륭한 여정이었습니다.").
- **A — Nike campaign:** huge condensed type, high-contrast, orange bar, "MISSION COMPLETE".
- **B — Modern premium:** thin weight, divider rules, "512km Together".
- **D — Hall of Fame:** gold/orange certificate framing, laurel, Shoe Score, "Class of 2026".
All carry the subtle **KEEGO / Keep Going** wordmark + real aggregates (distance, runs, paces, dates, PB count, longest run, grade).

## Component patterns (→ `primitives.tsx`, tokens only from `theme.ts`)
- **Rank chip** — pill, tier color 16% fill / 50% border, tier name + score/percentile; compact variant on Home.
- **Tier ring** — SVG progress ring (tier-color stroke, rounded cap, −90° rotate) with tier emoji centered; Progression hero.
- **Title pill** — small category-tier colored pill + emoji; exactly one equipped; "착용중" marks the equipped gallery card.
- **Title gallery card** — emoji + name + category + bottom-left tier dot; locked ~0.5 opacity + 🔒.
- **Achievement progress bar** — name + rarity label (rarity-colored), `current / target`, 6px track with tier-gradient fill; live, no fabrication.
- **Retirement card** — square keepsake, four layouts (default C), grade badge + wordmark, Save Image / Share.
- **Hall of Shoes grid** — 2-col cards (shoe glyph, model, big km, "은퇴 YYYY", RETIRED tag); persists forever, never disappears.
- **Smart challenge card** — orange-tinted, "FOR YOU" badge, transparent **reason** block (rotation/wear data).
- **Hall of Fame state** — dashed "준비 중 / 개인 기록 모드 · Coming soon"; **no fabricated competitors** (cross-user ranking deferred E/F).

## Premium / non-RPG tone principles
1. **Celebrate, don't gamify** — recognition of real running behavior, not XP grinding. No levels/HP/loot.
2. **Restraint with accent** — one orange; tier colors do the categorical work; whitespace > decoration.
3. **Truth only** — every number is a real aggregate; achievements unlock on real criteria; no fake leaderboards.
4. **Never forced** — retirement always offers Continue; bittersweet-proud tone, not punitive.
5. **Shoe-first stays shoe-first** — Home keeps the shoe hero; progression surfaced as compact chips/modules.
6. **Keepsake quality** — retirement cards read like a framed memento (Apple/WHOOP), shareable and resonant.
