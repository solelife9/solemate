# slice-2-share 페이스 단위 오라벨 수정 (retry #1)

## 배경
이전 구현(커밋 22eed4f)이 code_critic에서 **페이스 단위 오라벨 product_bug**로 실패.

`lib/share.ts:51`이 `⚡ 페이스 ${input.pace} /${unit}`로 단위 라벨을 붙였는데,
`input.pace`(=`run.pace`, fmtPace 출력)는 **항상 '초/km' 값**이고 환산되지 않음.
mi 모드에서 `페이스 5'02" /mi`를 출력 →
- (a) 같은 런의 상세 화면(`HistoryScreen.rn.tsx:134`)·ShoesScreen은 `/km`로 표시 → 한 공유 안에서 모순
- (b) per-km 값을 per-mile로 라벨만 바꿔 거짓 통계(약 3:08/km 주장, 비현실적)를 외부 공유

## 수정
구조(`lib/share.ts`·`HistoryScreen`)는 유지. 최소·정합 수정만.

1. **lib/share.ts** — 페이스 라벨을 항상 `/km`로 고정.
   거리는 `displayNum`으로 mi 환산을 유지하지만, 앱이 분/마일 페이스를 따로 계산하지 않으므로
   페이스 값·라벨은 km 기준으로 고정 → 앱 전체(상세·Shoes 화면 모두 `/km`)와 일관.
   (정식 per-mile 페이스를 넣으려면 값도 ×1.60934 해야 하나, 나머지가 전부 /km이므로 이번엔 /km 고정.)

2. **__tests__/lib/share.test.ts** — mi 케이스의 `/mi` 단언을 `/km`로 수정.
   "거리는 mi 환산, 페이스 라벨은 /km 고정"이 동시에 성립함을 식별력 있게 단언(`not.toContain('/mi')` 포함).

3. **__tests__/HistoryScreen.share.test.tsx** — per-km 페이스에 unit='mi'로 붙던 `/mi` 단언을 `/km`로 수정.
   거리는 mi 환산(3.23 mi) 유지를 그대로 단언 → 거리=mi·페이스=/km로 단위가 의도대로 다름을 명확히.
   + 보강: `Share.share`를 `mockRejectedValueOnce`로 모킹해 공유 실패 시 `onShare`가 예외를 던지지 않고
     `.catch`로 조용히 무시함을 검증하는 통합 테스트 1개 추가.

## 검증
- tsc: 0 에러
- eslint(변경 파일): 0 에러 (기존 inline-style warning만)
- jest 전체: 41 suites / 368 tests GREEN
