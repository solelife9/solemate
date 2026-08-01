// ─── scripts/migrate-weight-basis.ts — weightBasis 를 mm 로 통일 ────────────────
//
//   npx tsc -p tsconfig.scripts.json && node node_modules/.cache/keego-scripts/scripts/migrate-weight-basis.js
//
// 소스마다 `US9`·`M9`·`사이즈 9`·`유니섹스 사이즈 9` 로 제각각 적혀 있었다. 같은 기준인데
// 문자열이 달라서 비교 표가 "기준이 다르다"고 판단해 차이를 숨기는 문제가 있었다.
// mm 는 성별·지역 표기에 흔들리지 않는 단일 척도라 이걸 정본으로 삼는다.
//
// ⚠ **무게 숫자는 손대지 않는다.** 사이즈 이름만 같은 사이즈의 다른 표기로 바꾼다.
// 판단할 수 없는 표기는 null(모름)로 남긴다 — 270mm 라고 가정하면 없는 사실을 만든다.

import {readFileSync, writeFileSync} from 'fs';
import {resolve} from 'path';
import {normalizeWeightBasis} from '../lib/shoeWeightBasis';
import type {ShoeDoc} from '../types/shoe';

function main(): void {
  const file = resolve(process.cwd(), 'data/shoeCatalog.json');
  const cat = JSON.parse(readFileSync(file, 'utf8')) as ShoeDoc[];
  const changes = new Map<string, number>();
  let known = 0;
  let unknown = 0;

  for (const d of cat) {
    // 무게가 없으면 기준도 의미가 없다.
    if (d.weight == null) {
      d.weightBasis = null;
      continue;
    }
    const before = d.weightBasis;
    const after = normalizeWeightBasis(before);
    d.weightBasis = after;
    const k = `${before ?? '(빈값)'} → ${after ?? 'null(모름)'}`;
    changes.set(k, (changes.get(k) ?? 0) + 1);
    if (after == null) unknown++;
    else known++;
  }

  writeFileSync(file, JSON.stringify(cat, null, 2) + '\n', 'utf8');
  console.log(`무게 있는 켤레 · 기준 확정 ${known} · 모름 ${unknown}\n`);
  [...changes.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
}

main();
