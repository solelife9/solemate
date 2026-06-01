# slice-3-design-primitives (retry 1) — eval 차단 3건 해소

날짜: 2026-06-02
파일: theme.ts · primitives.tsx · __tests__/primitives.test.tsx · tsconfig.json · package.json(+lock)
범위: 토큰/프리미티브/테스트만. 화면 파일·데이터·네이티브 무수정.

## 이전 시도 실패 원인
구현(theme UNIFY_DISPLAY_FONT, primitives 확장, TierBadge Pill 재구성)은 양호했으나 eval에서:
1. product_bug(차단): TONE_BG가 rgba 리터럴 4개로 GOOD/WARN/DANGER/ACCENT hex를 수동 복제 → 2차 진실원.
2. test_bug(차단): 신규 export 프리미티브에 행동 테스트 0건.
3. harness_bug(iron law #16): acceptance 테스트가 fs/path/__dirname 사용 → @types/node 부재로 `tsc --noEmit` 전역 RED(exit 2).

## 해결
1. theme.ts에 `withAlpha(hex, alpha)`(#RRGGBB → rgba) 추가. primitives.tsx TONE_BG를
   `withAlpha(GOOD/WARN/DANGER/ACCENT, 0.15)`로 파생 → 단일 진실원 복원. TONE_BG export(테스트 단언용).
2. `__tests__/primitives.test.tsx` 신설(react-test-renderer, 12 케이스):
   conditionColor/Tone가 DANGER/WARN/GOOD 토큰 추종 · KeegoWordmark가 'Keego' SVG text +
   ACCENT/ACCENT_2 stop · Metric value/unit 별개 Text·baseline·tabular-nums · Button cta(그라데이션)
   vs ghost(CARD_HI) 분기 · TONE_BG RGB 채널이 토큰 hex와 동일.
3. `npm i -D @types/node` + tsconfig `types: ["jest","node"]`(명시 types 배열이라 추가 필요).

## 검증
- `npx tsc --noEmit` → exit 0
- `npm run lint` → 0 errors (warnings only, 기존)
- `npx jest` → primitives.test 12/12 green. 남은 7 실패는 화면 파일 hex 토큰화/SOLEMATE로
  형제 잡(slice-3-home 등) 소관 — 이 잡 무관(primitives.tsx는 acceptance 스캔 통과).
