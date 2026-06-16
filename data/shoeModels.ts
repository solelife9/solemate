/**
 * Keego 러닝화 권장 내구도 시드 데이터베이스 (single source of truth)
 *
 * 출처: .tenet/spec/shoe-database-2026-05-31.md (web-verified, 2026-05-31)
 *       + 2026-06-16 최신 모델 보강(web-verified): 슈퍼블래스트3 등 30개 추가, Altra·Topo 신규.
 * 7개 카테고리 · 13개 브랜드 · 164개 모델.
 *
 * 이 모듈은 화면(AddShoeScreen 등)의 인라인 MODELS/BRANDS와 App.tsx의
 * parseShoeName 브랜드 목록을 대체하는 데이터·로직 단일 소스다.
 */

// ────────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────────

/** 러닝화 카테고리 (스펙 §카테고리 매핑 표 참조) */
export type ShoeCategory =
  | 'daily_trainer'
  | 'max_cushion'
  | 'stability'
  | 'super_trainer'
  | 'carbon_racing'
  | 'trail';

/** 시드 DB의 단일 신발 모델 레코드 */
export interface ShoeModel {
  brand: string;
  model: string;
  category: ShoeCategory;
  /** 권장 수명(km) — 기본은 카테고리 값, 필요 시 per-model 오버라이드 가능 */
  recommendedKm: number;
  /** 출시연도 */
  year: number;
}

/** getRecommendedLifespanKm 인자 (모든 필드 선택적 — 정보가 적어도 합리적 기본값 반환) */
export interface RecommendInput {
  brand?: string;
  model?: string;
  category?: ShoeCategory;
  /** 선택적 체중(kg) — 권장값 보정용(가이드, 과학적 정밀치 아님) */
  weightKg?: number;
}

// ────────────────────────────────────────────────────────────
// 카테고리 → 권장 수명(km) 매핑
// ────────────────────────────────────────────────────────────

/**
 * 카테고리별 기본 교체 권장 거리(km) = 쿠셔닝(성능)이 유지되는 기준(실착 한계가 아님).
 * 안정화 750·맥스 750: 단단한 지지 폼 / 두꺼운 폼 볼륨으로 가장 오래 간다.
 * 데일리 700·슈퍼트레이너 700: 기준. 카본 450: PEBA 폼의 반발 수명(요즘 1세대보다 내구성↑).
 * 트레일 700: 지형 의존(로드화와 비슷). (경량 업템포화는 별도 카테고리 없이 슈퍼트레이너로 묶는다.)
 */
export const categoryLifespanKm: Record<ShoeCategory, number> = {
  daily_trainer: 700,
  max_cushion: 750,
  stability: 750,
  super_trainer: 700,
  carbon_racing: 450,
  trail: 700,
};

/** category 미지정·미매칭 시 사용하는 최종 기본값 (daily_trainer 기준) */
export const DEFAULT_LIFESPAN_KM = categoryLifespanKm.daily_trainer; // 700

// 용도/태그(추천 러닝)는 사용자 정리 DB(data/shoes.json → data/shoeClass.ts)를 단일 소스로
// 쓴다. 여기서 카테고리→문구를 임의로 만들던 매핑은 제거(사용자 데이터로 대체).

// ────────────────────────────────────────────────────────────
// 시드 데이터 (164 모델)
// ────────────────────────────────────────────────────────────

export const SHOE_MODELS: ShoeModel[] = [
  // NIKE (17)
  { brand: 'Nike', model: 'Pegasus 41', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Nike', model: 'Pegasus 42', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Nike', model: 'Vomero 19', category: 'max_cushion', recommendedKm: 750, year: 2026 },
  { brand: 'Nike', model: 'Vomero Premium', category: 'max_cushion', recommendedKm: 750, year: 2026 },
  { brand: 'Nike', model: 'Pegasus Plus', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Nike', model: 'Pegasus Premium', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Nike', model: 'Vomero 18', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Nike', model: 'Vomero Plus', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Nike', model: 'Invincible 3', category: 'max_cushion', recommendedKm: 750, year: 2023 },
  { brand: 'Nike', model: 'Structure 26', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'Nike', model: 'Zoom Fly 6', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Nike', model: 'Streakfly 2', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Nike', model: 'Vaporfly 4', category: 'carbon_racing', recommendedKm: 450, year: 2025 },
  { brand: 'Nike', model: 'Alphafly 3', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Nike', model: 'Pegasus Trail 5', category: 'trail', recommendedKm: 700, year: 2024 },
  { brand: 'Nike', model: 'Wildhorse 10', category: 'trail', recommendedKm: 700, year: 2025 },
  { brand: 'Nike', model: 'Ultrafly', category: 'trail', recommendedKm: 700, year: 2023 },

  // ADIDAS (14)
  { brand: 'Adidas', model: 'Ultraboost 5', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Adidas', model: 'Adizero Adios Pro Evo 2', category: 'carbon_racing', recommendedKm: 450, year: 2025 },
  { brand: 'Adidas', model: 'Supernova Rise 2', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Adidas', model: 'Supernova Stride', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Adidas', model: 'Adizero SL2', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Adidas', model: 'Adizero Evo SL', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Adidas', model: 'Adizero Boston 13', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Adidas', model: 'Adizero Adios 9', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Adidas', model: 'Adizero Takumi Sen 11', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Adidas', model: 'Adizero Adios Pro 4', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Adidas', model: 'Adizero Adios Pro Evo 1', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Adidas', model: 'Adistar 3', category: 'max_cushion', recommendedKm: 750, year: 2024 },
  { brand: 'Adidas', model: 'Terrex Agravic Speed Ultra', category: 'trail', recommendedKm: 700, year: 2025 },
  { brand: 'Adidas', model: 'Terrex Soulstride Ultra', category: 'trail', recommendedKm: 700, year: 2024 },

  // HOKA (16)
  { brand: 'Hoka', model: 'Clifton 10', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Hoka', model: 'Mach 7', category: 'super_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'Hoka', model: 'Rincon 4', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Hoka', model: 'Skyflow', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Hoka', model: 'Bondi 9', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Hoka', model: 'Skyward X', category: 'max_cushion', recommendedKm: 750, year: 2024 },
  { brand: 'Hoka', model: 'Arahi 7', category: 'stability', recommendedKm: 750, year: 2024 },
  { brand: 'Hoka', model: 'Gaviota 5', category: 'stability', recommendedKm: 750, year: 2024 },
  { brand: 'Hoka', model: 'Mach 6', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Hoka', model: 'Mach X 2', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Hoka', model: 'Rocket X 2', category: 'carbon_racing', recommendedKm: 450, year: 2023 },
  { brand: 'Hoka', model: 'Cielo X1 2.0', category: 'carbon_racing', recommendedKm: 450, year: 2025 },
  { brand: 'Hoka', model: 'Speedgoat 6', category: 'trail', recommendedKm: 700, year: 2024 },
  { brand: 'Hoka', model: 'Mafate Speed 4', category: 'trail', recommendedKm: 700, year: 2023 },
  { brand: 'Hoka', model: 'Challenger 7', category: 'trail', recommendedKm: 700, year: 2024 },
  { brand: 'Hoka', model: 'Torrent 4', category: 'trail', recommendedKm: 700, year: 2025 },

  // ASICS (18)
  { brand: 'Asics', model: 'Gel-Cumulus 27', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Asics', model: 'Gel-Cumulus 28', category: 'daily_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'Asics', model: 'Gel-Nimbus 28', category: 'max_cushion', recommendedKm: 750, year: 2026 },
  { brand: 'Asics', model: 'Gel-Kayano 33', category: 'stability', recommendedKm: 750, year: 2026 },
  { brand: 'Asics', model: 'Superblast 3', category: 'super_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'Asics', model: 'Magic Speed 5', category: 'super_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'Asics', model: 'Gel-Nimbus 27', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Asics', model: 'Gel-Kayano 32', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'Asics', model: 'GT-2000 14', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'Asics', model: 'Novablast 5', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Asics', model: 'Superblast 2', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Asics', model: 'Magic Speed 4', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Asics', model: 'Noosa Tri 16', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Asics', model: 'Metaspeed Sky Paris', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Asics', model: 'Metaspeed Edge Paris', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Asics', model: 'Gel-Trabuco 13', category: 'trail', recommendedKm: 700, year: 2025 },
  { brand: 'Asics', model: 'Fuji Lite 5', category: 'trail', recommendedKm: 700, year: 2024 },
  { brand: 'Asics', model: 'Trabuco Max 4', category: 'trail', recommendedKm: 700, year: 2025 },

  // NEW BALANCE (12)
  { brand: 'New Balance', model: 'FuelCell Rebel v4', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'New Balance', model: 'Fresh Foam X 880v16', category: 'daily_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'New Balance', model: 'FuelCell Rebel v5', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'New Balance', model: 'FuelCell SuperComp Elite v5', category: 'carbon_racing', recommendedKm: 450, year: 2025 },
  { brand: 'New Balance', model: 'FuelCell SuperComp Trainer v3', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'New Balance', model: 'Fresh Foam X 1080v14', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'New Balance', model: 'Fresh Foam X 1080v15', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'New Balance', model: 'Fresh Foam X 880v15', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'New Balance', model: 'Fresh Foam X More v5', category: 'max_cushion', recommendedKm: 750, year: 2024 },
  { brand: 'New Balance', model: 'Fresh Foam X Vongo v6', category: 'stability', recommendedKm: 750, year: 2024 },
  { brand: 'New Balance', model: 'Fresh Foam X Hierro v9', category: 'trail', recommendedKm: 700, year: 2025 },
  { brand: 'New Balance', model: 'FuelCell SuperComp Pacer', category: 'super_trainer', recommendedKm: 700, year: 2023 },

  // SAUCONY (19)
  { brand: 'Saucony', model: 'Endorphin Speed 4', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Saucony', model: 'Ride 19', category: 'daily_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'Saucony', model: 'Triumph 24', category: 'max_cushion', recommendedKm: 750, year: 2026 },
  { brand: 'Saucony', model: 'Guide 19', category: 'stability', recommendedKm: 750, year: 2026 },
  { brand: 'Saucony', model: 'Kinvara 16', category: 'super_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'Saucony', model: 'Peregrine 16', category: 'trail', recommendedKm: 700, year: 2026 },
  { brand: 'Saucony', model: 'Endorphin Speed 5', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Saucony', model: 'Endorphin Pro 4', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Saucony', model: 'Endorphin Elite 2', category: 'carbon_racing', recommendedKm: 450, year: 2025 },
  { brand: 'Saucony', model: 'Ride 17', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Saucony', model: 'Ride 18', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Saucony', model: 'Triumph 22', category: 'max_cushion', recommendedKm: 750, year: 2024 },
  { brand: 'Saucony', model: 'Triumph 23', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Saucony', model: 'Guide 18', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'Saucony', model: 'Hurricane 25', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'Saucony', model: 'Tempus 2', category: 'stability', recommendedKm: 750, year: 2024 },
  { brand: 'Saucony', model: 'Kinvara 15', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Saucony', model: 'Peregrine 15', category: 'trail', recommendedKm: 700, year: 2025 },
  { brand: 'Saucony', model: 'Xodus Ultra 4', category: 'trail', recommendedKm: 700, year: 2025 },

  // BROOKS (16)
  { brand: 'Brooks', model: 'Ghost 16', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Brooks', model: 'Glycerin GTS 23', category: 'stability', recommendedKm: 750, year: 2026 },
  { brand: 'Brooks', model: 'Ghost 17', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Brooks', model: 'Ghost Max 2', category: 'max_cushion', recommendedKm: 750, year: 2024 },
  { brand: 'Brooks', model: 'Glycerin 22', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Brooks', model: 'Glycerin GTS 22', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'Brooks', model: 'Glycerin Max', category: 'max_cushion', recommendedKm: 750, year: 2024 },
  { brand: 'Brooks', model: 'Adrenaline GTS 24', category: 'stability', recommendedKm: 750, year: 2024 },
  { brand: 'Brooks', model: 'Adrenaline GTS 25', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'Brooks', model: 'Hyperion 2', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Brooks', model: 'Hyperion Max 2', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Brooks', model: 'Hyperion Elite 4 PB', category: 'carbon_racing', recommendedKm: 450, year: 2025 },
  { brand: 'Brooks', model: 'Launch 11', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Brooks', model: 'Cascadia 19', category: 'trail', recommendedKm: 700, year: 2025 },
  { brand: 'Brooks', model: 'Caldera 8', category: 'trail', recommendedKm: 700, year: 2025 },
  { brand: 'Brooks', model: 'Catamount 4', category: 'trail', recommendedKm: 700, year: 2025 },

  // PUMA (9)
  { brand: 'Puma', model: 'Velocity Nitro 4', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Puma', model: 'Magnify Nitro 3', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Puma', model: 'MagMax Nitro 2', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Puma', model: 'ForeverRun Nitro 2', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'Puma', model: 'Deviate Nitro 3', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Puma', model: 'Deviate Nitro 4', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Puma', model: 'Deviate Nitro Elite 3', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Puma', model: 'Deviate Nitro Elite 4', category: 'carbon_racing', recommendedKm: 450, year: 2025 },
  { brand: 'Puma', model: 'Fast-R Nitro Elite 3', category: 'carbon_racing', recommendedKm: 450, year: 2025 },

  // ON (12)
  { brand: 'On', model: 'Cloudrunner 3', category: 'daily_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'On', model: 'Cloudsurfer Max', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'On', model: 'Cloudboom Strike LS', category: 'carbon_racing', recommendedKm: 450, year: 2025 },
  { brand: 'On', model: 'Cloudflow 5', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'On', model: 'Cloudmonster 3', category: 'max_cushion', recommendedKm: 750, year: 2026 },
  { brand: 'On', model: 'Cloudeclipse', category: 'max_cushion', recommendedKm: 750, year: 2024 },
  { brand: 'On', model: 'Cloudflyer 5', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'On', model: 'Cloudsurfer 3', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'On', model: 'Cloudboom Strike', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'On', model: 'Cloudboom Echo 3', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'On', model: 'Cloudvista 2', category: 'trail', recommendedKm: 700, year: 2024 },
  { brand: 'On', model: 'Cloudultra 3', category: 'trail', recommendedKm: 700, year: 2025 },

  // MIZUNO (12)
  { brand: 'Mizuno', model: 'Wave Rider 29', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Mizuno', model: 'Wave Rider 30', category: 'daily_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'Mizuno', model: 'Neo Vista', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Mizuno', model: 'Neo Vista 2', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Mizuno', model: 'Wave Inspire 22', category: 'stability', recommendedKm: 750, year: 2025 },
  { brand: 'Mizuno', model: 'Wave Sky 9', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Mizuno', model: 'Wave Neo Ultra', category: 'max_cushion', recommendedKm: 750, year: 2024 },
  { brand: 'Mizuno', model: 'Wave Neo Wind', category: 'super_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Mizuno', model: 'Wave Rebellion Flash 3', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Mizuno', model: 'Wave Rebellion Pro 3', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Mizuno', model: 'Wave Daichi 9', category: 'trail', recommendedKm: 700, year: 2025 },
  { brand: 'Mizuno', model: 'Wave Mujin 10', category: 'trail', recommendedKm: 700, year: 2025 },

  // SALOMON (11)
  { brand: 'Salomon', model: 'Aero Glide 3', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Salomon', model: 'Aero Blaze 2', category: 'daily_trainer', recommendedKm: 700, year: 2024 },
  { brand: 'Salomon', model: 'S/Lab Phantasm 2', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Salomon', model: 'Speedcross 6', category: 'trail', recommendedKm: 700, year: 2023 },
  { brand: 'Salomon', model: 'Sense Ride 5', category: 'trail', recommendedKm: 700, year: 2024 },
  { brand: 'Salomon', model: 'Genesis', category: 'trail', recommendedKm: 700, year: 2024 },
  { brand: 'Salomon', model: 'Thundercross', category: 'trail', recommendedKm: 700, year: 2023 },
  { brand: 'Salomon', model: 'Ultra Glide 3', category: 'trail', recommendedKm: 700, year: 2024 },
  { brand: 'Salomon', model: 'S/Lab Ultra Glide', category: 'trail', recommendedKm: 700, year: 2025 },
  { brand: 'Salomon', model: 'S/Lab Pulsar 3', category: 'trail', recommendedKm: 700, year: 2024 },
  { brand: 'Salomon', model: 'Pulsar Trail 2', category: 'trail', recommendedKm: 700, year: 2024 },

  // ALTRA (4) — 제로드롭 신규 브랜드
  { brand: 'Altra', model: 'Torin 8', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Altra', model: 'Escalante 5', category: 'super_trainer', recommendedKm: 700, year: 2026 },
  { brand: 'Altra', model: 'Vanish Carbon 2', category: 'carbon_racing', recommendedKm: 450, year: 2024 },
  { brand: 'Altra', model: 'Lone Peak 9', category: 'trail', recommendedKm: 700, year: 2025 },

  // TOPO ATHLETIC (4) — 와이드토박스 신규 브랜드
  { brand: 'Topo Athletic', model: 'Phantom 4', category: 'daily_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Topo Athletic', model: 'Atmos', category: 'max_cushion', recommendedKm: 750, year: 2025 },
  { brand: 'Topo Athletic', model: 'Specter 2', category: 'super_trainer', recommendedKm: 700, year: 2025 },
  { brand: 'Topo Athletic', model: 'Cyclone 3', category: 'super_trainer', recommendedKm: 700, year: 2025 },
];

// ────────────────────────────────────────────────────────────
// 파생 데이터
// ────────────────────────────────────────────────────────────

/**
 * 시드 DB에서 파생한 브랜드 목록 (단일 소스).
 * 시드 등장 순서를 보존(중복 제거). App.tsx / AddShoeScreen 등 화면 코드가 import 한다.
 */
export const BRANDS: string[] = SHOE_MODELS.reduce<string[]>((acc, m) => {
  if (!acc.includes(m.brand)) acc.push(m.brand);
  return acc;
}, []);

// ────────────────────────────────────────────────────────────
// 매칭 헬퍼
// ────────────────────────────────────────────────────────────

/** 브랜드/모델 문자열 정규화(대소문자·여백 무시) */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 특정 브랜드의 모델명 목록(시드 순서) — AddShoe 모델 선택 UI용 */
export function modelsForBrand(brand: string): string[] {
  const b = normalize(brand);
  return SHOE_MODELS.filter((m) => normalize(m.brand) === b).map((m) => m.model);
}

/**
 * 주어진 brand(+model) 에 해당하는 시드 모델을 찾는다.
 * brand/model 미지정 시 undefined. 대소문자/여백 차이는 무시.
 */
export function findShoeModel(brand?: string, model?: string): ShoeModel | undefined {
  if (!brand || !model) return undefined;
  const b = normalize(brand);
  const m = normalize(model);
  return SHOE_MODELS.find(
    (s) => normalize(s.brand) === b && normalize(s.model) === m,
  );
}

// ────────────────────────────────────────────────────────────
// 추천 로직 (순수 함수)
// ────────────────────────────────────────────────────────────

/**
 * 체중 보정 계수 (가이드, 과학적 정밀치 아님 — 스펙 §추천 로직).
 * ≥90kg → ×0.85, ≤60kg → ×1.1, 그 외 → ×1.
 */
export function weightAdjustmentFactor(weightKg?: number): number {
  if (weightKg === undefined) return 1;
  if (weightKg >= 90) return 0.85;
  if (weightKg <= 60) return 1.1;
  return 1;
}

/**
 * 권장 수명(km)을 계산하는 순수 함수.
 *
 * 우선순위:
 *  1) brand + model 매칭 → 해당 모델의 recommendedKm (per-model 오버라이드 포함)
 *  2) 미매칭이지만 category 제공 → categoryLifespanKm[category]
 *  3) 둘 다 없으면 → DEFAULT_LIFESPAN_KM (daily_trainer 700)
 *
 * weightKg 가 주어지면 위 결과에 체중 보정 계수를 곱한 뒤 정수(km)로 반올림한다.
 */
export function getRecommendedLifespanKm(input: RecommendInput = {}): number {
  const { brand, model, category, weightKg } = input;

  const matched = findShoeModel(brand, model);
  let baseKm: number;
  if (matched) {
    baseKm = matched.recommendedKm;
  } else if (category && category in categoryLifespanKm) {
    baseKm = categoryLifespanKm[category];
  } else {
    baseKm = DEFAULT_LIFESPAN_KM;
  }

  const factor = weightAdjustmentFactor(weightKg);
  return Math.round(baseKm * factor);
}
