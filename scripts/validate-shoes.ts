// ─── scripts/validate-shoes.ts — 신발 카탈로그 검증 ────────────────────────────
//
//   npm run validate-shoes
//
// 카탈로그가 낡는 걸 **사람이 눈치채기 전에** 잡는 게 목적이다. 두 번 무너진 이력이 있다
// (docs/shoes-spec.md §0): 갱신이 끊겨 인기 모델이 빠졌고, 모델만 넣고 스펙을 빠뜨렸다.
// 둘 다 자동으로 보이게 만든다.
//
// 검사:
//   1) 필수 필드 누락 — 값이 아니라 **키**가 있는지(모르면 null 을 넣는 게 규칙이다)
//   2) id 중복
//   3) 같은 라인 version 갭 (39·40·42 → 41 누락). version:null 라인은 제외(norda 005 등)
//   4) searchAliases 빈 문서
//   5) 브랜드별 등록 수 / 미검증 수 요약
//
// 종료 코드: 오류가 있으면 1, 경고만 있으면 0(CI 를 세우진 않되 눈에는 띄게).

import {ShoeDoc, SHOE_CATEGORIES} from '../types/shoe';

// ── 결과 타입 ────────────────────────────────────────────────────────────────
export interface Issue {
  level: 'error' | 'warn';
  id: string;
  message: string;
}

export interface BrandSummary {
  brand: string;
  total: number;
  unverified: number;
  discontinued: number;
  noSpec: number;
}

export interface ValidateResult {
  issues: Issue[];
  summary: BrandSummary[];
  errorCount: number;
  warnCount: number;
}

/** ShoeDoc 의 필수 키 목록 — 값이 아니라 키의 존재를 본다. */
const REQUIRED_KEYS: readonly (keyof ShoeDoc)[] = [
  'id', 'brand', 'model', 'version', 'variant', 'collabWith', 'category',
  'weight', 'drop', 'stackHeight', 'releaseYear', 'defaultLifespanKm',
  'discontinued', 'searchAliases', 'verified',
];

/**
 * 버전 문자열에서 비교 가능한 정수를 뽑는다.
 * `4` → 4, `v14` → 14, `4.5` → 4(정수부만), 숫자가 없으면 null.
 */
function versionNumber(v: string | null): number | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** 같은 라인인가 — 브랜드+모델(+variant)이 같으면 한 라인으로 본다. */
function lineKey(s: ShoeDoc): string {
  return [s.brand, s.model, s.variant ?? ''].join('|').toLowerCase();
}

/**
 * 카탈로그를 검증한다(순수 — 파일을 읽지 않고 배열을 받는다).
 * 테스트에서 그대로 부를 수 있어야 하므로 I/O 를 섞지 않는다.
 */
export function validateShoes(shoes: readonly ShoeDoc[]): ValidateResult {
  const issues: Issue[] = [];

  // 1) 필수 키 누락
  for (const s of shoes) {
    const id = String((s as Partial<ShoeDoc>).id ?? '(id 없음)');
    for (const k of REQUIRED_KEYS) {
      if (!(k in (s as object))) {
        issues.push({level: 'error', id, message: `필수 키 누락: ${String(k)}`});
      }
    }
    if (s.category && !SHOE_CATEGORIES.includes(s.category)) {
      issues.push({level: 'error', id, message: `알 수 없는 카테고리: ${s.category}`});
    }
  }

  // 2) id 중복 — 문서 id 가 겹치면 upsert 가 서로를 덮어쓴다(조용한 데이터 손실).
  const seen = new Map<string, number>();
  for (const s of shoes) {
    const n = (seen.get(s.id) ?? 0) + 1;
    seen.set(s.id, n);
    if (n === 2) issues.push({level: 'error', id: s.id, message: 'id 중복'});
  }

  // 3) 같은 라인 version 갭 — 39·40·42 가 있으면 41 이 빠진 것이다.
  //    version:null 인 라인(norda 005 처럼 모델명이 곧 숫자)은 이 검사에서 뺀다.
  const lines = new Map<string, {nums: number[]; sample: ShoeDoc}>();
  for (const s of shoes) {
    const n = versionNumber(s.version);
    if (n === null) continue; // null 라인 제외(규칙)
    const k = lineKey(s);
    const cur = lines.get(k) ?? {nums: [], sample: s};
    cur.nums.push(n);
    lines.set(k, cur);
  }
  for (const [, {nums, sample}] of lines) {
    if (nums.length < 2) continue;
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    const missing: number[] = [];
    for (let v = sorted[0]; v < sorted[sorted.length - 1]; v++) {
      if (!sorted.includes(v)) missing.push(v);
    }
    if (missing.length) {
      const line = [sample.brand, sample.model, sample.variant].filter(Boolean).join(' ');
      issues.push({
        level: 'warn',
        id: sample.id,
        message: `버전 갭: ${line} — 있는 것 ${sorted.join('·')} / 빠진 것 ${missing.join('·')}`,
      });
    }
  }

  // 4) searchAliases 빈 문서 — 한글로 검색하는 사용자가 못 찾는다.
  for (const s of shoes) {
    if (Array.isArray(s.searchAliases) && s.searchAliases.length === 0) {
      issues.push({level: 'warn', id: s.id, message: 'searchAliases 비어 있음(한글 검색 불가)'});
    }
  }

  // 5) 브랜드별 요약
  const byBrand = new Map<string, BrandSummary>();
  for (const s of shoes) {
    const b = s.brand || '(브랜드 없음)';
    const cur = byBrand.get(b) ?? {brand: b, total: 0, unverified: 0, discontinued: 0, noSpec: 0};
    cur.total++;
    if (!s.verified) cur.unverified++;
    if (s.discontinued) cur.discontinued++;
    // 스펙이 하나도 없으면 '다음 신발' 비교에서 이 신발은 침묵한다.
    if (s.weight == null && s.drop == null && s.stackHeight == null) cur.noSpec++;
    byBrand.set(b, cur);
  }
  const summary = [...byBrand.values()].sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand));

  return {
    issues,
    summary,
    errorCount: issues.filter((i) => i.level === 'error').length,
    warnCount: issues.filter((i) => i.level === 'warn').length,
  };
}

/** 요약 표를 사람이 읽는 문자열로. */
export function formatSummary(summary: readonly BrandSummary[]): string {
  const pad = (v: string | number, n: number) => String(v).padEnd(n);
  const padL = (v: string | number, n: number) => String(v).padStart(n);
  const lines = [
    `${pad('브랜드', 18)} ${padL('등록', 5)} ${padL('미검증', 7)} ${padL('스펙없음', 9)} ${padL('단종', 5)}`,
    '─'.repeat(50),
  ];
  for (const s of summary) {
    lines.push(`${pad(s.brand, 18)} ${padL(s.total, 5)} ${padL(s.unverified, 7)} ${padL(s.noSpec, 9)} ${padL(s.discontinued, 5)}`);
  }
  const tot = summary.reduce(
    (a, s) => ({t: a.t + s.total, u: a.u + s.unverified, n: a.n + s.noSpec, d: a.d + s.discontinued}),
    {t: 0, u: 0, n: 0, d: 0},
  );
  lines.push('─'.repeat(50));
  lines.push(`${pad('합계', 18)} ${padL(tot.t, 5)} ${padL(tot.u, 7)} ${padL(tot.n, 9)} ${padL(tot.d, 5)}`);
  return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// 데이터 소스는 아직 비어 있다(이번 작업은 뼈대만). 파일이 생기면 여기서 읽는다.
// 없으면 "아직 비었다"를 명확히 말하고 정상 종료한다 — 빈 것과 고장 난 것은 다르다.

async function main(): Promise<void> {
  let shoes: ShoeDoc[] = [];
  let source = '(없음)';
  try {
    // 정본 데이터 파일이 생기면 여기에 놓인다. 아직은 없어도 정상이다.
    const mod = require('../data/shoeCatalog.json');
    shoes = Array.isArray(mod) ? mod : (mod?.shoes ?? []);
    source = 'data/shoeCatalog.json';
  } catch {
    shoes = [];
  }

  console.log(`\n신발 카탈로그 검증 — 소스: ${source}`);
  if (!shoes.length) {
    console.log('\n  아직 데이터가 없습니다(뼈대만 만든 상태).');
    console.log('  data/shoeCatalog.json 이 생기면 이 스크립트가 그대로 검증합니다.\n');
    return;
  }

  const r = validateShoes(shoes);

  if (r.issues.length) {
    console.log('');
    for (const i of r.issues) {
      const tag = i.level === 'error' ? '오류' : '경고';
      console.log(`  [${tag}] ${i.id} — ${i.message}`);
    }
  } else {
    console.log('\n  문제 없음.');
  }

  console.log('\n' + formatSummary(r.summary));
  console.log(`\n오류 ${r.errorCount} · 경고 ${r.warnCount}\n`);

  if (r.errorCount > 0) process.exitCode = 1;
}

// 직접 실행일 때만 CLI 를 돈다(테스트에서 import 해도 실행되지 않게).
if (require.main === module) {
  main().catch((e) => {
    console.error('검증 실패:', e);
    process.exitCode = 1;
  });
}
