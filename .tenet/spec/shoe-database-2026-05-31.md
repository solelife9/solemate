# Keego 러닝화 권장 내구도 시드 DB (2026-05-31, web-verified)

이 파일은 **Slice 2**에서 앱 데이터 모듈(예: `shoeDatabase.ts`)로 반영되는 source-of-truth다.
현재 `AddShoeScreen.rn.tsx`(12–21행)의 인라인 `MODELS`(8브랜드 ~40모델, 400/600/800 3단계)를 **이 표로 교체·확충**하고 화면 밖 데이터 모듈로 분리한다.

## 카테고리 → 권장 수명(km) 매핑 (검증: [[research-running-shoe-durability-database]])
| category | 권장 km | 비고 |
| :-- | :-- | :-- |
| daily_trainer | 700 | 로드 데일리, 300–500mi(480–800km) 표준 중상단 |
| max_cushion | 700 | 고스택 플러시(소프트폼 압축 주의) |
| stability | 700 | 지지/안정화 |
| super_trainer | 560 | 플레이트/바운시 올라운드 트레이너 (300–400mi) |
| tempo | 560 | 경량 스피드(논카본) |
| carbon_racing | 320 | 카본 슈퍼슈즈(PEBA폼 200–400km). **에어유닛형(Alphafly)=400** 오버라이드 |
| trail | 850 | 오프로드 500–600mi(800–965km) |

**추천 로직(순수 함수, Slice 2 구현):** `getRecommendedLifespanKm({brand, model?, category?, weightKg?})`
- 모델 매칭 → 해당 category의 km(+per-model override). 모델 미지정/미매칭 → category 기본. category도 없으면 daily 700.
- 선택적 체중 보정: ≥90kg ×0.85, ≤60kg ×1.1 (가이드, 과학적 정밀치 아님 — UI에 "권장값, 직접 수정 가능" 명시).
- AddShoe: 모델 선택 시 권장 km 자동 채움(현 고정 chip 대신), 사용자 수정 허용.

## 시드 데이터 (brand · model · category · 권장km · 출시연도)

### NIKE
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Pegasus 41 | daily_trainer | 700 | 2024 |
| Pegasus Plus | super_trainer | 560 | 2024 |
| Pegasus Premium | max_cushion | 700 | 2025 |
| Vomero 18 | max_cushion | 700 | 2025 |
| Vomero Plus | max_cushion | 700 | 2025 |
| Invincible 3 | max_cushion | 700 | 2023 |
| Structure 26 | stability | 700 | 2025 |
| Zoom Fly 6 | super_trainer | 560 | 2024 |
| Streakfly 2 | tempo | 560 | 2025 |
| Vaporfly 4 | carbon_racing | 320 | 2025 |
| Alphafly 3 | carbon_racing | 400 | 2024 |
| Pegasus Trail 5 | trail | 850 | 2024 |
| Wildhorse 10 | trail | 850 | 2025 |
| Ultrafly | trail | 850 | 2023 |

### ADIDAS
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Ultraboost 5 | max_cushion | 700 | 2025 |
| Supernova Rise 2 | daily_trainer | 700 | 2025 |
| Supernova Stride | daily_trainer | 700 | 2024 |
| Adizero SL2 | daily_trainer | 700 | 2024 |
| Adizero Evo SL | super_trainer | 560 | 2025 |
| Adizero Boston 13 | super_trainer | 560 | 2025 |
| Adizero Adios 9 | tempo | 560 | 2025 |
| Adizero Takumi Sen 11 | tempo | 560 | 2025 |
| Adizero Adios Pro 4 | carbon_racing | 320 | 2024 |
| Adizero Adios Pro Evo 1 | carbon_racing | 320 | 2024 |
| Adistar 3 | max_cushion | 700 | 2024 |
| Terrex Agravic Speed Ultra | trail | 850 | 2025 |
| Terrex Soulstride Ultra | trail | 850 | 2024 |

### HOKA
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Clifton 10 | daily_trainer | 700 | 2025 |
| Rincon 4 | daily_trainer | 700 | 2024 |
| Skyflow | daily_trainer | 700 | 2024 |
| Bondi 9 | max_cushion | 700 | 2025 |
| Skyward X | max_cushion | 700 | 2024 |
| Arahi 7 | stability | 700 | 2024 |
| Gaviota 5 | stability | 700 | 2024 |
| Mach 6 | super_trainer | 560 | 2024 |
| Mach X 2 | super_trainer | 560 | 2024 |
| Rocket X 2 | carbon_racing | 320 | 2023 |
| Cielo X1 2.0 | carbon_racing | 320 | 2025 |
| Speedgoat 6 | trail | 850 | 2024 |
| Mafate Speed 4 | trail | 850 | 2023 |
| Challenger 7 | trail | 850 | 2024 |
| Torrent 4 | trail | 850 | 2025 |

### ASICS
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Gel-Cumulus 27 | daily_trainer | 700 | 2025 |
| Gel-Nimbus 27 | max_cushion | 700 | 2025 |
| Gel-Kayano 32 | stability | 700 | 2025 |
| GT-2000 14 | stability | 700 | 2025 |
| Novablast 5 | super_trainer | 560 | 2025 |
| Superblast 2 | super_trainer | 560 | 2024 |
| Magic Speed 4 | tempo | 560 | 2024 |
| Noosa Tri 16 | tempo | 560 | 2024 |
| Metaspeed Sky Paris | carbon_racing | 320 | 2024 |
| Metaspeed Edge Paris | carbon_racing | 320 | 2024 |
| Gel-Trabuco 13 | trail | 850 | 2025 |
| Fuji Lite 5 | trail | 850 | 2024 |
| Trabuco Max 4 | trail | 850 | 2025 |

### NEW BALANCE
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| FuelCell Rebel v4 | super_trainer | 560 | 2024 |
| FuelCell Rebel v5 | super_trainer | 560 | 2025 |
| FuelCell SuperComp Elite v5 | carbon_racing | 320 | 2025 |
| FuelCell SuperComp Trainer v3 | super_trainer | 560 | 2024 |
| Fresh Foam X 1080v14 | daily_trainer | 700 | 2024 |
| Fresh Foam X 1080v15 | daily_trainer | 700 | 2025 |
| Fresh Foam X 880v15 | daily_trainer | 700 | 2024 |
| Fresh Foam X More v5 | max_cushion | 700 | 2024 |
| Fresh Foam X Vongo v6 | stability | 700 | 2024 |
| Fresh Foam X Hierro v9 | trail | 850 | 2025 |
| FuelCell SuperComp Pacer | tempo | 560 | 2023 |

### SAUCONY
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Endorphin Speed 4 | super_trainer | 560 | 2024 |
| Endorphin Speed 5 | super_trainer | 560 | 2025 |
| Endorphin Pro 4 | carbon_racing | 320 | 2024 |
| Endorphin Elite 2 | carbon_racing | 320 | 2025 |
| Ride 17 | daily_trainer | 700 | 2024 |
| Ride 18 | daily_trainer | 700 | 2025 |
| Triumph 22 | max_cushion | 700 | 2024 |
| Triumph 23 | max_cushion | 700 | 2025 |
| Guide 18 | stability | 700 | 2025 |
| Hurricane 25 | stability | 700 | 2025 |
| Tempus 2 | stability | 700 | 2024 |
| Kinvara 15 | tempo | 560 | 2024 |
| Peregrine 15 | trail | 850 | 2025 |
| Xodus Ultra 4 | trail | 850 | 2025 |

### BROOKS
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Ghost 16 | daily_trainer | 700 | 2024 |
| Ghost 17 | daily_trainer | 700 | 2025 |
| Ghost Max 2 | max_cushion | 700 | 2024 |
| Glycerin 22 | max_cushion | 700 | 2025 |
| Glycerin GTS 22 | stability | 700 | 2025 |
| Glycerin Max | max_cushion | 700 | 2024 |
| Adrenaline GTS 24 | stability | 700 | 2024 |
| Adrenaline GTS 25 | stability | 700 | 2025 |
| Hyperion 2 | tempo | 560 | 2024 |
| Hyperion Max 2 | super_trainer | 560 | 2024 |
| Hyperion Elite 4 PB | carbon_racing | 320 | 2025 |
| Launch 11 | daily_trainer | 700 | 2024 |
| Cascadia 19 | trail | 850 | 2025 |
| Caldera 8 | trail | 850 | 2025 |
| Catamount 4 | trail | 850 | 2025 |

### PUMA
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Velocity Nitro 4 | daily_trainer | 700 | 2025 |
| Magnify Nitro 3 | max_cushion | 700 | 2025 |
| MagMax Nitro 2 | max_cushion | 700 | 2025 |
| ForeverRun Nitro 2 | stability | 700 | 2025 |
| Deviate Nitro 3 | super_trainer | 560 | 2024 |
| Deviate Nitro 4 | super_trainer | 560 | 2025 |
| Deviate Nitro Elite 3 | carbon_racing | 320 | 2024 |
| Deviate Nitro Elite 4 | carbon_racing | 320 | 2025 |
| Fast-R Nitro Elite 3 | carbon_racing | 320 | 2025 |

### ON
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Cloudrunner 3 | daily_trainer | 700 | 2026 |
| Cloudflow 5 | daily_trainer | 700 | 2025 |
| Cloudmonster 3 | max_cushion | 700 | 2026 |
| Cloudeclipse | max_cushion | 700 | 2024 |
| Cloudflyer 5 | stability | 700 | 2025 |
| Cloudsurfer 3 | super_trainer | 560 | 2025 |
| Cloudboom Strike | carbon_racing | 320 | 2024 |
| Cloudboom Echo 3 | carbon_racing | 320 | 2024 |
| Cloudvista 2 | trail | 850 | 2024 |
| Cloudultra 3 | trail | 850 | 2025 |

### MIZUNO
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Wave Rider 29 | daily_trainer | 700 | 2025 |
| Wave Inspire 22 | stability | 700 | 2025 |
| Wave Sky 9 | max_cushion | 700 | 2025 |
| Wave Neo Ultra | max_cushion | 700 | 2024 |
| Wave Neo Wind | super_trainer | 560 | 2024 |
| Wave Rebellion Flash 3 | super_trainer | 560 | 2025 |
| Wave Rebellion Pro 3 | carbon_racing | 320 | 2024 |
| Wave Daichi 9 | trail | 850 | 2025 |
| Wave Mujin 10 | trail | 850 | 2025 |

### SALOMON
| model | category | km | year |
| :-- | :-- | :-- | :-- |
| Aero Glide 3 | max_cushion | 700 | 2025 |
| Aero Blaze 2 | daily_trainer | 700 | 2024 |
| S/Lab Phantasm 2 | carbon_racing | 320 | 2024 |
| Speedcross 6 | trail | 850 | 2023 |
| Sense Ride 5 | trail | 850 | 2024 |
| Genesis | trail | 850 | 2024 |
| Thundercross | trail | 850 | 2023 |
| Ultra Glide 3 | trail | 850 | 2024 |
| S/Lab Ultra Glide | trail | 850 | 2025 |
| S/Lab Pulsar 3 | trail | 850 | 2024 |
| Pulsar Trail 2 | trail | 850 | 2024 |

## 합계 & 비고
- **12개 브랜드 · 약 134개 모델** (Nike14·Adidas13·Hoka15·Asics13·NB11·Saucony14·Brooks15·Puma9·On10·Mizuno9·Salomon11).
- 인기 라인은 최근 2개 버전 동시 수록(예: Ghost 16/17, Rebel v4/v5) — 사용자가 보유한 버전 매칭률↑.
- "사용자 정의" 옵션 유지: 목록에 없는 신발은 브랜드+모델 직접 입력 + 카테고리/수명 수동 선택.
- 모든 권장 km은 가이드값 — AddShoe에서 사용자가 자유롭게 수정 가능(데이터 검증: 양수, 합리적 상한).
- 출처 및 카테고리 근거: [[research-running-shoe-durability-database]], [[research-competitive-running-apps-and-engine-standards]].
