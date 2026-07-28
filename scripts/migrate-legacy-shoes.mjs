// ============================================================================
// scripts/migrate-legacy-shoes.mjs — 기존 카탈로그를 새 스키마로 옮긴다
// ----------------------------------------------------------------------------
//   node scripts/migrate-legacy-shoes.mjs
//
// 입력: data/shoes.json (351켤레 — 브랜드·모델·카테고리·연도)
//       data/shoeSpecs.json (71켤레 — 확인된 무게·스택·드롭)
// 출력: data/shoeCatalog.json (ShoeDoc[] — docs/shoes-spec.md 스키마)
//
// **이미 있는 것을 버리지 않는 게 목적이다.** 새 스키마로 갈아엎으면서 기존 351켤레를
// 날리면 커버리지가 0에서 다시 시작한다. 모델명·카테고리·연도는 그대로 옮기고,
// 스펙은 shoeSpecs.json 에 확인된 것만 채운다. 나머지는 null + verified:false —
// "아직 아무도 안 봤다"가 데이터에 남아야 다음 사람이 어디를 채울지 안다.
//
// 이 스크립트는 **덮어쓰지 않는다**. data/shoeCatalog.json 이 이미 있으면 기존 문서를
// 유지하고 없는 것만 더한다(브랜드별로 손으로 채운 스펙이 날아가면 안 된다).
// ============================================================================
import {readFileSync, writeFileSync, existsSync} from 'node:fs';

const OUT = new URL('../data/shoeCatalog.json', import.meta.url);

const legacy = JSON.parse(readFileSync(new URL('../data/shoes.json', import.meta.url), 'utf8'));
const specsFile = JSON.parse(readFileSync(new URL('../data/shoeSpecs.json', import.meta.url), 'utf8'));
const SPECS = specsFile.specs ?? {};

// ── 카테고리 매핑 (types/shoe.ts LEGACY_CATEGORY_MAP 과 같아야 한다) ──────────
const CATEGORY = {
  daily_trainer: 'daily',
  super_trainer: 'tempo',
  carbon_racing: 'racing',
  trail: 'trail',
  stability: 'stability',
  max_cushion: 'recovery',
};
const LIFESPAN = {daily: 650, tempo: 650, racing: 450, trail: 650, stability: 700, recovery: 700};

// ── 브랜드 한글 표기 ─────────────────────────────────────────────────────────
// 검색 별칭은 **스펙이 아니라 검색 힌트**다. 한국 러너가 실제로 치는 말을 넣는다.
const BRAND_KO = {
  Nike: ['나이키'],
  Adidas: ['아디다스'],
  ASICS: ['아식스'],
  Hoka: ['호카'],
  'New Balance': ['뉴발란스', '뉴발'],
  Brooks: ['브룩스'],
  Saucony: ['소코니', '써코니'],
  On: ['온', '온러닝'],
  Mizuno: ['미즈노'],
  Puma: ['푸마'],
  Salomon: ['살로몬'],
  Kiprun: ['킵런', '데카트론'],
  'Under Armour': ['언더아머'],
  Altra: ['알트라'],
  'The North Face': ['노스페이스'],
  norda: ['노다'],
  'Topo Athletic': ['토포'],
  NNormal: ['엔노말'],
  'La Sportiva': ['라스포르티바'],
  Merrell: ['메렐'],
  'Inov-8': ['이노브8'],
  Reebok: ['리복'],
  Lululemon: ['룰루레몬'],
  Karhu: ['카루'],
  Satisfy: ['새티스파이'],
  Tracksmith: ['트랙스미스'],
  Diadora: ['디아도라'],
  'Li-Ning': ['리닝'],
};

// 모델 라인의 한글 표기. 모르는 라인은 비워둔다(억지로 만들지 않는다).
const MODEL_KO = {
  Pegasus: ['페가수스', '페가서스', '페가'],
  Vomero: ['보메로'],
  Structure: ['스트럭처'],
  Vaporfly: ['베이퍼플라이'],
  Alphafly: ['알파플라이'],
  Streakfly: ['스트릭플라이'],
  'Zoom Fly': ['줌플라이'],
  Invincible: ['인빈시블'],
  Infinity: ['인피니티'],
  Zegama: ['제가마'],
  Wildhorse: ['와일드호스'],
  Kiger: ['카이거'],
  Ultrafly: ['울트라플라이'],
  Novablast: ['노바블라스트', '노바'],
  Superblast: ['슈퍼블라스트', '슈블'],
  Megablast: ['메가블라스트', '메가블'],
  'Gel-Nimbus': ['젤님버스', '님버스'],
  'Gel-Kayano': ['젤카야노', '카야노'],
  'Gel-Cumulus': ['젤큐뮬러스', '큐뮬러스'],
  Metaspeed: ['메타스피드'],
  Magic: ['매직스피드'],
  'GT-2000': ['지티2000'],
  'GT-1000': ['지티1000'],
  Adizero: ['아디제로'],
  'Adios Pro': ['아디오스프로', '아디오스'],
  Boston: ['보스턴'],
  Ultraboost: ['울트라부스트', '울부'],
  Supernova: ['수퍼노바', '슈퍼노바'],
  Evo: ['에보'],
  Clifton: ['클리프톤'],
  Bondi: ['본다이'],
  Mach: ['마하'],
  Rincon: ['린콘'],
  Arahi: ['아라히'],
  Speedgoat: ['스피드고트'],
  Mafate: ['마파테'],
  Skyward: ['스카이워드'],
  Cielo: ['시엘로'],
  Rocket: ['로켓엑스', '로켓'],
  Ghost: ['고스트'],
  Glycerin: ['글리세린'],
  Hyperion: ['하이페리온'],
  Adrenaline: ['아드레날린'],
  Launch: ['런치'],
  Caldera: ['칼데라'],
  Catamount: ['카타마운트'],
  Endorphin: ['엔돌핀'],
  Kinvara: ['킨바라'],
  Triumph: ['트라이엄프'],
  Ride: ['라이드'],
  Guide: ['가이드'],
  Peregrine: ['페레그린'],
  Cloudmonster: ['클라우드몬스터', '클몬'],
  Cloudsurfer: ['클라우드서퍼'],
  Cloudboom: ['클라우드붐'],
  Cloudeclipse: ['클라우드이클립스'],
  Cloudultra: ['클라우드울트라'],
  Cloudflow: ['클라우드플로우'],
  Cloudgo: ['클라우드고'],
  Cloudrunner: ['클라우드러너'],
  Cloudvista: ['클라우드비스타'],
  Cloudsurfer: ['클라우드서퍼'],
  'Wave Rider': ['웨이브라이더'],
  'Wave Sky': ['웨이브스카이'],
  'Wave Rebellion': ['웨이브리벨리온'],
  'Wave Inspire': ['웨이브인스파이어'],
  'Wave Neo': ['웨이브네오'],
  Neo: ['네오'],
  'Fresh Foam': ['프레시폼'],
  FuelCell: ['퓨얼셀'],
  Rebel: ['리벨'],
  SuperComp: ['슈퍼컴프'],
  Elite: ['엘리트'],
  'More v': ['모어'],
  Hierro: ['히에로'],
  Deviate: ['디비에이트'],
  Velocity: ['벨로시티'],
  Magnify: ['매그니파이'],
  ForeverRun: ['포에버런'],
  'Fast-R': ['패스트알'],
  Aurora: ['오로라'],
  Genesis: ['제네시스'],
  Sense: ['센스라이드', '센스'],
  Ultra: ['울트라글라이드', '울트라'],
  Speedcross: ['스피드크로스'],
  Thundercross: ['썬더크로스'],
  Pulsar: ['펄사'],
  Torin: ['토린'],
  Lone: ['론피크'],
  Escalante: ['에스칼란테'],
  Olympus: ['올림푸스'],
  Timp: ['팀프'],
  Outpipe: ['아웃파이프'],
  Vectiv: ['벡티브'],
  Summit: ['서밋'],
};

/** 뒤에 붙는 파생 표기 — 이건 variant 다(같은 라인의 다른 갑피·기능). */
const VARIANT_TOKENS = ['GTX', 'GORE-TEX', 'Gore-Tex', 'Wide', 'LITE', 'Lite', 'Waterproof'];

/**
 * 레거시 모델 문자열을 model / version / variant 로 가른다.
 *
 * "Pegasus 41"        → Pegasus / 41 / null
 * "Pegasus Trail 5 GTX" → Pegasus Trail / 5 / GTX
 * "Vomero Plus"       → Vomero Plus / null / null   (Plus 는 별개 제품 라인이다)
 * "Novablast 5"       → Novablast / 5 / null
 *
 * Plus·Premium 을 variant 로 접지 않는 이유: Pegasus Plus 는 Pegasus 42 의 파생이
 * 아니라 다른 신발이다. 접으면 버전 갭 검사가 없는 갭을 만들어낸다.
 */
function splitModel(raw) {
  let s = String(raw).trim();
  let variant = null;
  for (const t of VARIANT_TOKENS) {
    const re = new RegExp(`\\s+${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (re.test(s)) {
      variant = t.toUpperCase() === 'GORE-TEX' ? 'GTX' : t.toUpperCase();
      s = s.replace(re, '').trim();
      break;
    }
  }
  // 끝에 붙은 버전 숫자(3 / 41 / 4.5 / v14 / %3 는 제외)
  const m = s.match(/^(.*?)[\s]v?(\d+(?:\.\d+)?)$/);
  if (m && m[1].trim().length > 0) {
    return {model: m[1].trim(), version: m[2], variant};
  }
  return {model: s, version: null, variant};
}

/** 슬러그 — types/shoe.ts shoeSlug 와 같은 규칙(결정적, 한 번 정하면 안 바뀐다). */
function slug({brand, model, version, variant, collabWith}) {
  return [brand, model, version, variant, collabWith]
    .filter(v => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 검색 별칭 — 브랜드 한글 + 라인 한글 + 라인 한글+버전. 없으면 빈 배열. */
function aliases(brand, model, version) {
  const out = new Set();
  for (const k of BRAND_KO[brand] ?? []) out.add(k);
  for (const [line, kos] of Object.entries(MODEL_KO)) {
    if (model.toLowerCase().includes(line.toLowerCase())) {
      for (const ko of kos) {
        out.add(ko);
        if (version) out.add(`${ko} ${version}`);
      }
    }
  }
  return [...out];
}

// ── 변환 ─────────────────────────────────────────────────────────────────────
const arr = Array.isArray(legacy) ? legacy : (legacy.shoes ?? []);
const docs = [];
const seen = new Set();

for (const s of arr) {
  const category = CATEGORY[s.category];
  if (!category) {
    console.error(`알 수 없는 카테고리 — 건너뜀: ${s.brand} ${s.model} (${s.category})`);
    continue;
  }
  const {model, version, variant} = splitModel(s.model);
  const id = slug({brand: s.brand, model, version, variant, collabWith: null});
  if (seen.has(id)) {
    console.error(`id 중복 — 건너뜀: ${id}`);
    continue;
  }
  seen.add(id);

  // 확인된 스펙이 있으면 채운다. 키는 레거시 표기 그대로여야 맞는다.
  const spec = SPECS[`${s.brand}|${s.model}`];
  let weight = null, weightBasis = null, drop = null, stackHeight = null;
  if (spec) {
    weight = spec.weightG ?? null;
    weightBasis = spec.basis ?? null;
    drop = spec.dropMm ?? null;
    // forefoot 은 heel - drop. 드롭의 정의라 산수지 추측이 아니다.
    if (spec.stackHeelMm != null && spec.dropMm != null) {
      stackHeight = {
        heel: spec.stackHeelMm,
        forefoot: Math.round((spec.stackHeelMm - spec.dropMm) * 10) / 10,
      };
    }
  }

  docs.push({
    id,
    brand: s.brand,
    model,
    version,
    variant,
    collabWith: null,
    category,
    weight,
    weightBasis,
    drop,
    stackHeight,
    releaseYear: s.year ?? null,
    defaultLifespanKm: LIFESPAN[category],
    discontinued: false,
    searchAliases: aliases(s.brand, model, version),
    // 스펙까지 확인된 것만 verified. 모델명만 옮긴 건 "아직 아무도 안 봤다"로 남긴다.
    verified: Boolean(spec),
  });
}

// ── 기존 파일과 병합 — 손으로 채운 것을 덮어쓰지 않는다 ──────────────────────
let merged = docs;
if (existsSync(OUT)) {
  const prevRaw = JSON.parse(readFileSync(OUT, 'utf8'));
  const prev = Array.isArray(prevRaw) ? prevRaw : (prevRaw.shoes ?? []);
  const byId = new Map(prev.map(d => [d.id, d]));
  let added = 0;
  for (const d of docs) {
    if (!byId.has(d.id)) {
      byId.set(d.id, d);
      added++;
    }
  }
  merged = [...byId.values()];
  console.log(`기존 ${prev.length}켤레 유지 · ${added}켤레 추가`);
}

merged.sort((a, b) => a.brand.localeCompare(b.brand) || a.id.localeCompare(b.id));
writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n', 'utf8');

const byBrand = new Map();
for (const d of merged) byBrand.set(d.brand, (byBrand.get(d.brand) ?? 0) + 1);
console.log(`\ndata/shoeCatalog.json — ${merged.length}켤레`);
for (const [b, n] of [...byBrand].sort((x, y) => y[1] - x[1])) {
  console.log(`  ${String(n).padStart(4)}  ${b}`);
}
console.log(`\n스펙 확인됨(verified): ${merged.filter(d => d.verified).length}켤레\n`);
