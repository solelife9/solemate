# research-running-shoe-durability-database

type: knowledge
source_job: eafe3cdf-c6c4-4d2b-9279-04c942fe4a94
job_name: eval-mptuqw82
confidence: scanned-not-verified
created: 2026-05-31T14:44:39.247Z

## Findings

- **purpose**: Keego 신발 추가 시 모델별 권장 내구도(수명 km) 자동 추천용 검증 데이터. 출처 복수 교차검증(Nike, Runners Need, Marathon Handbook, Strava, Swift Running, RunRepeat 등).
- **category_lifespan_km**: 카테고리별 권장 수명(km) [base / range]: daily_trainer 700 [500-800] (300-500mi 표준) · max_cushion 700 [500-800] (소프트폼 압축 주의) · stability 700 [500-800] · super_trainer(나일론/플레이트 트레이닝, 예 Endorphin Speed/Hoka Mach) 560 [480-640] · tempo_lightweight 560 [480-640] · carbon_racing(슈퍼슈즈 Vaporfly급) 320 [240-400] · trail 850 [800-965].
- **super_shoe_detail**: 카본 레이싱: 폼(PEBA)가 200-400km 고충격에서 에너지리턴 유의미 저하. Vaporfly 250-400km, Alphafly 350-500km(에어유닛이 더 내구적). 카본플레이트 자체는 거의 안 닳으나 폼이 납작해지면 교체. 레이싱/키템포 전용 권장.
- **adjustment_factors**: 보정: 체중 ↑(90kg+/200lbs+) → 15-20% 단축(×0.8~0.85). 경량 러너(<60kg) → 약간 연장(×1.1). 노면: 콘크리트/아스팔트 마모 가속, 트레일화를 포장도로 신으면 수명 단축. 추천은 base 수명 제공 + 체중 보정은 선택적(과학적 정밀섹 아닌 가이드).
- **seed_models**: 인기 모델→카테고리(권장km): Nike Pegasus 41=daily(700), Nike Vomero 18=max_cushion(700), Nike Vaporfly 3=carbon_racing(320), Nike Alphafly 3=carbon_racing(400), Hoka Clifton 10=daily(700), Hoka Mach 6=super_trainer(560), Hoka Bondi=max_cushion(700), Brooks Ghost 17=daily(700), Brooks Glycerin=max_cushion(700), Asics Gel-Nimbus 27=max_cushion(700), Asics Novablast=daily(640), Asics Magic Speed=tempo(480), Asics Metaspeed Sky/Edge=carbon_racing(320), Saucony Endorphin Speed 5=super_trainer(560), Saucony Endorphin Pro/Elite=carbon_racing(320), Saucony Ride=daily(700), Adidas Adizero Boston=tempo(560), Adidas Adios Pro 4=carbon_racing(350), Adidas Supernova=daily(640), New Balance Rebel=tempo(560), NB SC Elite=carbon_racing(320), NB Fresh Foam More=max_cushion(700), Puma Deviate Nitro=super_trainer(640), Puma Fast-R=carbon_racing(350).
- **design**: 구현: ShoeCategory enum(base+range), 모델 시드 DB(brand+model→category, 필요시 per-model override). 순수함수 getRecommendedLifespanKm({brand,model?,category?,weightKg?}) → km. fallback: 모델 미지→category 기본, category 미지→daily 700. 단위 테스트 대상. AddShoe의 고정 chip(400-800)을 추천값 자동선택+수정가능으로 교체. Slice 2 포함.
- **sources**: Nike(how-often-to-replace), Runners Need, Marathon Handbook(300-500mi), Strava(carbon fiber), Swift Running(carbon 150-200mi), Healthhp(supershoes), RunRepeat shoe-lifespan-statistics, Fleet Feet/Running Warehouse 2025-26 모델 리스트.
