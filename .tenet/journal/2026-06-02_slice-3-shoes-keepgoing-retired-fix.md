# Slice 3 — ShoesScreen keep-going 배너 retired 게이트 + 중복 카피 정리 (2026-06-02, retry 1)

## 배경
커밋 b4e8f6d(토큰화·Pill·테스트)는 유지. code_critic이 찾은 product_bug 2건 +
test_critic advisory 2건만 핀포인트로 수정.

## 고친 것 (ShoesScreen.rn.tsx)
1. **모순 UX 제거** — keep-going 교체 배너(`지금 교체하면 부상 없이 계속 달릴 수 있어요`)가
   `shoe.condition === '교체'`에만 게이트돼, retired(보관됨)이면서 교체 tier인 신발이
   '보관됨' Pill과 '지금 교체하세요' 배너를 동시 표시했다. 같은 뷰의 run CTA·maxHint·
   card TierBadge와 동일하게 배너 조건에 `!retired &&`를 추가 → 보관 신발엔 배너 미노출.
2. **중복 카피 단일화** — 비보관 교체 신발 + onSetMaxKm일 때 같은 문장이 배너와
   확장 maxHint에 두 번 렌더됐다. maxHint 교체 분기를 사실만 알리는
   `교체 시점을 넘겼어요.`로 축약 → keep-going 카피는 배너가 단독 담당(화면당 1회).

## 테스트 (__tests__/ShoesScreen.test.tsx, +4)
- (advisory) 사용 중(미보관·featured) 신발 카드에 '사용 중' 상태 Pill 노출 단언.
- (advisory) 상세 내구도 링이 used 100/max 500 → 잔여율 80% + 남은 수명 400 정확히 렌더 단언.
- (회귀) 보관된 교체 신발 상세: '보관됨' Pill만, keep-going 배너 미노출(모순 방지).
- (회귀) 비보관 교체 신발 상세: keep-going 카피가 정확히 1회만 + maxHint는 사실만.

## 검증
- `tsc --noEmit` exit 0.
- `npm run lint` 0 errors(잔존은 전 화면 공통 inline-style 경고, 신규 없음).
- `npx jest __tests__/ShoesScreen.test.tsx` 10 pass.
- 전체: 464 pass / 3 fail. 3 fail은 Run/Profile/History slice-3-design 토큰화(형제 잡 소관, 무관).
  Shoes/AddShoe 토큰화 단언은 통과.

## 데이터·네이티브
- Shoe.retired/photoUri 등 필드 보존. 네이티브 무변경. 다크(#000)+오렌지(#FF6500) 유지.
