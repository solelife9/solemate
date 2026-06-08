# research-shoe-wear-factors

type: knowledge
source_job: 00000000-0000-0000-0000-000000000000
job_name: unknown
confidence: scanned-not-verified
created: 2026-06-03T14:56:13.508Z

## Findings

- **purpose**: Slice 6 진짜 마모 모델(lib/wearModel)·교체 예측(lib/replacementForecast) 계수 근거. 휴리스틱이며 정밀과학 아님 — UI/지식에 '추정' 명시.
- **body_weight**: 마모 최대 단일 인자. 충격력≈체중 2.5~3배/스텝. 경험식 max_miles≈75000/lbs(=165000/kg 근사, 70kg→약525mi/845km, 85kg→약440mi). 선형 → weightFactor=weight_kg/70(기준러너 70kg) 클램프[0.8,1.6]. 체중 미입력 시 1.0(기준 가정).
- **surface**: 로드=기준(균일 마모), 트레드밀=더 완만(쿠션·균일), 트레일=빠른 마모(바위·진흙·뿌리). → surfaceFactor: treadmill 0.85, track 0.9, road 1.0, trail 1.15. 기본 road.
- **pace**: 빠를수록 수직충격력↑(완만히). paceFactor: recovery/easy 1.0, normal 1.0, tempo 1.05, race/interval 1.1. 페이스에서 자동 도출(사용자 입력 불요).
- **foam_age**: 미착용도 폼 시간열화 — 권장 교체 저주행이어도 1~2년. 480km 후 힐쿠션 -16~33%. → 시간기반 ageWearKm: target_km/24 per month 누적(약 24개월에 미착용도 수명 소진). 휴리스틱.
- **model**: effectiveWearKm = Σ_runs(distance_km × surfaceFactor × paceFactor) × weightFactor + ageWearKm(monthsOwned). remaining = target_km − effectiveWearKm.
- **forecast**: recentRateKmPerWeek=최근28일 실효km/4. weeksRemaining=remaining/(rate+agePerWeek). etaDate=today+weeks. confidence=high(최근4주 런≥3) else low. 엣지: 최근주행0→'최근 기록 없음', remaining≤0→'지금 교체 권장'.
- **sources**: ["https://umit.net/running-shoe-midsole-degradation/","https://runrepeat.com/shoe-lifespan-statistics","https://www.americansportandfitness.com/blogs/fitness-blog/the-lifespan-of-a-running-shoe","https://decentfoot.com/do-treadmills-wear-out-shoes/"]
- **iron_law**: 순수 lib 로직, 네이티브 0, 백엔드 스키마 변경 0(체중·노면은 AsyncStorage 로컬), 데이터 파괴 금지, tsc/lint/test green.
