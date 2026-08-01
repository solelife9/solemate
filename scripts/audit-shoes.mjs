// 카탈로그 값 교차 검증. 검증기(validate-shoes)가 잡는 '내부 모순'과 달리,
// 여기서는 **다른 신발과 견줘서** 이상한 값을 찾는다.
//
// 잡으려는 것:
//  1) 카테고리 대비 무게 이상치 (레이싱인데 무겁다 / 회복화인데 너무 가볍다)
//  2) 스택 대비 무게 이상치 (46mm 쌓아 올렸는데 200g 일 수는 없다)
//  3) 변형이 본모델보다 가볍다 (GTX·방수는 반드시 더 무겁다)
//  4) 같은 라인 인접 세대의 급격한 점프 (오매칭 신호)
//  5) 서로 다른 신발이 값이 완전히 같다 (한 페이지를 여럿에 붙였다는 신호)
//  6) 물리적으로 불가능한 값
import fs from 'node:fs';

const CAT = process.argv[2] ?? new URL('../data/shoeCatalog.json', import.meta.url).pathname;
const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'));
const name = (d) => `${d.brand} ${d.model}${d.version ? ' ' + d.version : ''}${d.variant ? ' [' + d.variant + ']' : ''}`;
const out = [];
const flag = (sev, d, msg) => out.push({sev, id: d.id, name: name(d), msg});

// ── 1) 카테고리 대비 무게 ───────────────────────────────────────────────
const byCat = {};
for (const d of cat) if (d.weight != null && d.category) (byCat[d.category] ??= []).push(d);
const med = (a) => {const s = [...a].sort((x, y) => x - y); return s[s.length >> 1];};
console.log('── 카테고리별 무게 분포 ──');
for (const [c, arr] of Object.entries(byCat).sort()) {
  const w = arr.map((d) => d.weight).sort((a, b) => a - b);
  const m = med(w);
  console.log(`${c.padEnd(10)} n=${String(arr.length).padStart(3)}  중앙 ${String(m).padStart(3)}g  ` +
    `범위 ${w[0]}~${w[w.length - 1]}g`);
  // 중앙값에서 ±35% 벗어나면 표시. 절대 임계보다 분포 기반이 낫다.
  for (const d of arr) {
    const r = d.weight / m;
    if (r > 1.35 || r < 0.65) flag(r > 1.6 || r < 0.5 ? 'HIGH' : 'MED', d,
      `${d.weight}g — ${c} 중앙값 ${m}g 대비 ${Math.round((r - 1) * 100)}%`);
  }
}

// ── 2) 스택 대비 무게 ──────────────────────────────────────────────────
// 폼이 두꺼울수록 무겁다. 힐스택 1mm 당 대략 5~8g 이 정상 범위다.
const pairs = cat.filter((d) => d.weight != null && d.stackHeight?.heel != null);
// 카테고리마다 정상 범위가 다르다. 카본 레이서는 초경량 폼이라 두께 대비 가벼운 게
// 정상이고(그게 존재 이유다), 트레일화는 아웃솔·보호재 때문에 무겁다.
// 그래서 **같은 카테고리 안에서** 사분위 밖으로 벗어난 것만 본다.
const ratios = {};
for (const d of pairs) (ratios[d.category ?? '?'] ??= []).push(d.weight / d.stackHeight.heel);
const q = (a, p) => {const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))];};
for (const d of pairs) {
  const arr = ratios[d.category ?? '?'];
  if (arr.length < 6) continue;                      // 표본이 적으면 판단하지 않는다
  const lo = q(arr, 0.05), hi = q(arr, 0.95);
  const r = d.weight / d.stackHeight.heel;
  if (r < lo * 0.82 || r > hi * 1.22)
    flag('MED', d, `${d.weight}g / 힐 ${d.stackHeight.heel}mm = ${r.toFixed(1)}g·mm⁻¹ — `
      + `${d.category} 정상대 ${lo.toFixed(1)}~${hi.toFixed(1)} 밖`);
}

// ── 3) 변형이 본모델보다 가볍다 ────────────────────────────────────────
const HEAVIER = /gtx|gore|tex|wp|waterproof|shield|mid|wide/i;
const baseOf = new Map();
for (const d of cat) if (!d.variant && !d.collabWith) baseOf.set(`${d.brand}|${d.model}|${d.version ?? ''}`, d);
for (const d of cat) {
  if (!d.variant || d.weight == null) continue;
  const b = baseOf.get(`${d.brand}|${d.model}|${d.version ?? ''}`);
  if (!b || b.weight == null) continue;
  if (HEAVIER.test(d.variant) && d.weight <= b.weight)
    flag('HIGH', d, `변형 ${d.weight}g ≤ 본모델 ${b.weight}g — 방수·미드 변형은 반드시 더 무겁다`);
  if (d.weight === b.weight)
    flag('HIGH', d, `본모델과 무게가 완전히 같다(${d.weight}g) — 같은 페이지를 물었을 수 있다`);
}

// ── 4) 같은 라인 인접 세대의 급격한 점프 ───────────────────────────────
const lines = {};
for (const d of cat) {
  if (!d.version || d.variant || d.collabWith || d.weight == null) continue;
  (lines[`${d.brand}|${d.model}`] ??= []).push(d);
}
for (const arr of Object.values(lines)) {
  arr.sort((a, b) => parseFloat(a.version) - parseFloat(b.version));
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1], b = arr[i];
    const gap = Math.abs(parseFloat(b.version) - parseFloat(a.version));
    if (gap > 1.01) continue;                    // 인접 세대만 본다
    const diff = b.weight - a.weight;
    if (Math.abs(diff) >= 55)
      flag('MED', b, `직전 세대 대비 ${diff > 0 ? '+' : ''}${diff}g (${a.version}: ${a.weight}g → ${b.version}: ${b.weight}g)`);
  }
}

// ── 5) 서로 다른 신발이 값이 완전히 같다 ───────────────────────────────
const sig = {};
for (const d of cat) {
  if (d.weight == null || d.drop == null || !d.stackHeight) continue;
  const k = `${d.weight}|${d.drop}|${d.stackHeight.heel}|${d.stackHeight.forefoot}`;
  (sig[k] ??= []).push(d);
}
for (const [k, arr] of Object.entries(sig)) {
  if (arr.length < 2) continue;
  // 같은 라인의 변형끼리는 같을 수 있다(색상만 다른 경우). 브랜드·모델이 다르면 수상하다.
  const models = new Set(arr.map((d) => `${d.brand}|${d.model}`));
  if (models.size > 1) flag('HIGH', arr[0], `무게·드롭·스택이 완전히 같은 다른 신발: ${arr.map(name).join(' / ')} (${k})`);
}

// ── 6) 물리적으로 불가능한 값 ──────────────────────────────────────────
for (const d of cat) {
  if (d.weight != null && (d.weight < 110 || d.weight > 450)) flag('HIGH', d, `무게 ${d.weight}g — 러닝화 범위 밖`);
  if (d.drop != null && (d.drop < 0 || d.drop > 14)) flag('HIGH', d, `드롭 ${d.drop}mm — 범위 밖`);
  if (d.stackHeight?.heel != null && (d.stackHeight.heel < 12 || d.stackHeight.heel > 62))
    flag('HIGH', d, `힐 스택 ${d.stackHeight.heel}mm — 범위 밖`);
}

console.log('\n── 이상치 ──');
const order = {HIGH: 0, MED: 1};
out.sort((a, b) => order[a.sev] - order[b.sev] || a.name.localeCompare(b.name));
for (const o of out) console.log(`[${o.sev}] ${o.name.padEnd(38)} ${o.msg}`);
console.log(`\nHIGH ${out.filter((o) => o.sev === 'HIGH').length} · MED ${out.filter((o) => o.sev === 'MED').length}`);
