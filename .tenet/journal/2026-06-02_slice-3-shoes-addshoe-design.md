# Slice 3 — ShoesScreen / AddShoeScreen 디자인 토큰화 (2026-06-02)

## 목표
ShoesScreen.rn.tsx / AddShoeScreen.rn.tsx 의 하드코딩 색·인라인 폰트를 theme 토큰 +
primitives 로 전부 치환. 교체 배지 → Badge(Pill) primitive, 신발 상세 → 내구도 링 +
keep-going 교체 내러티브로 마감. 데이터(retired·photoUri 등) 보존, 네이티브 무변경.

## 한 일
- **ShoesScreen.rn.tsx**
  - raw hex 제거: `#fff`(저장 버튼·런 CTA·카드/상세 play 아이콘·runCtaText) → `T1`.
  - rgba 리터럴 → `withAlpha(...)` 파생: 카드 테두리 `withAlpha(T1,0.05)`, addCard·iconBtn
    `withAlpha(T1,0.12)`.
  - 칩 → Pill primitive: '보관됨'(`tone="dim"`), '사용 중'(`tone="accent"`).
    `usingChip/retiredChip(+Text)` 커스텀 스타일 4종 삭제.
  - 신발 상세 **교체 내러티브**(keep-going): 교체 tier 일 때 내구도 히어로 직후
    '지금 교체하면 부상 없이 계속 달릴 수 있어요' 배너(accent 톤, KEEP_GOING_REPLACE 파생).
    수명 카드 maxHint 카피도 동일 문장으로 통일.
  - 카드 play 버튼에 `testID="shoe-play-<id>"` 부여(shoe-first 회귀 가드용).
- **AddShoeScreen.rn.tsx**
  - raw hex 제거: photo 플레이스홀더 `#1f1f22` → `CARD_HI`, ctaText `#fff` → `T1`.
  - rgba → `withAlpha`: chipOn/badge `withAlpha(ACCENT,0.14)`, chipOff/dropdown/iconBtn
    `withAlpha(T1,0.12)`.
  - '권장' 배지 → Pill primitive(`tone="accent"`, sparkles icon). `badge/badgeText` 삭제.

## 검증
- `tsc --noEmit` green.
- `eslint` 0 errors(잔존 경고는 전 화면 공통의 inline-style 경고, 신규 추가 없음).
- slice-3-design.test.ts: ShoesScreen·AddShoeScreen 단언 전부 통과(raw hex 0 / 인라인
  fontFamily 0 / BebasNeue 0 / SOLEMATE·SOLELIFE 0). 잔존 실패는 범위 밖 화면
  (Run/Profile/History — 별도 잡).
- 신규 행동테스트 `__tests__/ShoesScreen.test.tsx`(6 pass): 카드→상세 진입, 교체 내러티브
  +교체 배지 노출/양호 미노출, 카드 play·상세 CTA → onStartRun(id), 보관 신발 보관됨
  배지+CTA 미노출.
- 기존 App.recommend/App.shoe/App.shoefirst/App.shoebadge/AddShoeScreen 회귀 통과
  (Pill 전환이 '사용 중'/'보관됨'/'권장' 텍스트·tier-badge testID 보존).
- 전체: 460 pass / 3 fail(범위 밖 화면) / 463.

## 데이터·네이티브
- Shoe.retired / photoUri 등 필드 보존(저장 onSave 동일, 보관 동선 그대로).
- 네이티브 변경 없음. 다크 방향 유지(토큰값 불변, 색은 동일 hex 토큰으로 매핑).
