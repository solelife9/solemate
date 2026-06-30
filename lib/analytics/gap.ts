// ============================================================================
// lib/analytics/gap.ts — GAP(Grade-Adjusted Pace, 경사 보정 페이스)
// ----------------------------------------------------------------------------
// 오르막/내리막을 '같은 노력의 평지 페이스'로 환산한다. 스트라바·가민의 GAP 과 동일하게
// Minetti et al. (2002) "Energy cost of walking and running at extreme uphill and
// downhill slopes" (J Appl Physiol 93:1039–1046) 의 5차 다항식 — 경사 i(=상승/수평,
// 분수)에 따른 달리기 단위거리 대사비용 C(i) [J·kg⁻¹·m⁻¹] — 을 쓴다:
//
//   C(i) = 155.4·i⁵ − 30.4·i⁴ − 43.3·i³ + 46.3·i² + 19.5·i + 3.6
//
// 평지 비용 C(0)=3.6. 경사 보정 계수 = C(i)/C(0): 오르막은 >1(더 힘듦 → 환산 페이스가
// 실제보다 빠르게), 완만한 내리막(약 −10%)은 <1(가장 효율적), 급한 내리막은 다시 >1.
// 유효 범위는 논문 측정 구간 |i|≤0.45. 그 밖은 클램프해 폭주를 막는다(외삽 신뢰 낮음).
// 모두 순수 함수 — 입력 불변, NaN/누락은 안전 처리(throw 금지).
// ============================================================================

const C_FLAT = 3.6; // C(0), J·kg⁻¹·m⁻¹
const GRADE_CLAMP = 0.45; // Minetti 측정 범위 한계(±45%)

/** Minetti 5차 다항식 — 경사 i(분수)에서의 달리기 대사비용 C(i) [J·kg⁻¹·m⁻¹]. */
export function minettiCost(grade: number): number {
  const i = Math.max(-GRADE_CLAMP, Math.min(GRADE_CLAMP, Number.isFinite(grade) ? grade : 0));
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + C_FLAT;
}

/**
 * 경사 보정 계수 = C(i)/C(0). 실제 구간 시간에 곱하면 '평지 등가 시간'이 된다(비용이
 * 클수록 노력 큼 → 평지로 치면 더 빨리 뛴 셈이라 등가 시간↓ ... 은 아니다: 등가 페이스
 * 계산은 거리 기준이라 cost 비를 거리에 곱해 '등가 평지 거리'로 환산하는 게 정확하다.
 * 본 모듈은 gradeAdjustedPaceSec 에서 거리 가중으로 처리한다). 단독으로도 노출.
 */
export function gradeFactor(grade: number): number {
  return minettiCost(grade) / C_FLAT;
}

/** (누적거리 km, 경과초, 고도 m) 시계열의 한 점. 캡처 단계에서 paceTrack+고도로 남긴다. */
export type GapPoint = { d: number; t: number; e: number };

/**
 * GAP 입력 전처리 — raw GPS 고도의 노이즈(보통 ±5~10m)를 '거리창 이동평균'으로 누른다.
 * 각 점의 e 를 ±windowM/2 m 안의 점들 평균으로 대체(d·t 불변). Minetti 비용은 경사에 민감하고
 * 오르막 비용 증가가 내리막 절감보다 커(비대칭) 스무딩 없이는 노이즈가 GAP 를 한쪽으로
 * 부풀린다. 정렬된 d 를 가정한 O(n) 양방향 포인터. 표본<3 이면 원본 복사 반환. windowM 기본 60m.
 */
export function smoothElevation(track: GapPoint[], windowM = 60): GapPoint[] {
  const pts = (Array.isArray(track) ? track : []).filter(
    p => p && Number.isFinite(p.d) && Number.isFinite(p.t) && Number.isFinite(p.e),
  );
  if (pts.length < 3) return pts.slice();
  const half = Math.max(0, windowM) / 2 / 1000; // km
  const out: GapPoint[] = [];
  let lo = 0, hi = 0;
  for (let i = 0; i < pts.length; i++) {
    if (hi < i) hi = i;
    while (lo < i && pts[i].d - pts[lo].d > half) lo++;
    while (hi + 1 < pts.length && pts[hi + 1].d - pts[i].d <= half) hi++;
    let sum = 0, n = 0;
    for (let k = lo; k <= hi; k++) { sum += pts[k].e; n++; }
    out.push({ d: pts[i].d, t: pts[i].t, e: n > 0 ? sum / n : pts[i].e });
  }
  return out;
}

/**
 * 거리 빈 평균 리샘플 — track 을 binKm 간격 빈으로 나눠 각 빈을 (d,t,e) 평균점 하나로 줄인다.
 * 경사를 'GPS 표본 간격(수십 m)'이 아니라 '지형 스케일(binKm)'에서 계산하게 만들어, 위상에
 * 무관하게 고주파 고도 노이즈를 빈 평균으로 상쇄한다(이동평균 스무딩만으론 못 죽이는 표본주파수
 * 근처 노이즈까지 대응). 정렬된 d 가정. 결과<2점이면 [].
 */
export function resampleByDistance(track: GapPoint[], binKm = 0.1): GapPoint[] {
  const pts = (Array.isArray(track) ? track : []).filter(
    p => p && Number.isFinite(p.d) && Number.isFinite(p.t) && Number.isFinite(p.e),
  );
  if (pts.length < 2 || !(binKm > 0)) return [];
  const bins = new Map<number, { d: number; t: number; e: number; n: number }>();
  for (const p of pts) {
    const key = Math.floor(p.d / binKm);
    const b = bins.get(key) || { d: 0, t: 0, e: 0, n: 0 };
    b.d += p.d; b.t += p.t; b.e += p.e; b.n++;
    bins.set(key, b);
  }
  const out = [...bins.keys()].sort((a, b) => a - b).map(k => {
    const b = bins.get(k)!;
    return { d: b.d / b.n, t: b.t / b.n, e: b.e / b.n };
  });
  return out.length >= 2 ? out : [];
}

/**
 * 고도 포함 시계열 → GAP(초/km). 각 인접 구간의 경사로 Minetti 보정계수를 구해, 그 구간의
 * 실제 수평거리에 곱한 '평지 등가 거리'를 누적한다. GAP = 총시간 / 총등가거리.
 *   등가거리(km) = Σ Δd · C(grade)/C(0)
 *   GAP(초/km)   = 총경과초 / 등가거리(km)
 * 평지(고도변화 0)면 등가거리=실거리 → GAP=실제 평균페이스(항등, 검증됨). 비유효/역행/
 * 0거리 구간은 건너뛴다. 표본<2 또는 등가거리 0 이면 null.
 */
export function gradeAdjustedPaceSec(track: GapPoint[]): number | null {
  const pts = (Array.isArray(track) ? track : []).filter(
    p => p && Number.isFinite(p.d) && Number.isFinite(p.t) && Number.isFinite(p.e),
  );
  if (pts.length < 2) return null;
  let equivKm = 0;
  const t0 = pts[0].t;
  const tEnd = pts[pts.length - 1].t;
  for (let k = 1; k < pts.length; k++) {
    const dd = pts[k].d - pts[k - 1].d; // km
    if (!(dd > 0)) continue; // 정지/역행 구간 무시
    const de = pts[k].e - pts[k - 1].e; // m
    const grade = de / (dd * 1000); // 상승(m)/수평(m)
    equivKm += dd * gradeFactor(grade);
  }
  const totalSec = tEnd - t0;
  if (!(equivKm > 0) || !(totalSec > 0)) return null;
  return totalSec / equivKm;
}

/**
 * 거리축 GAP 곡선 — binKm(기본 0.1km) 간격으로 각 bin 의 GAP(초/km) 시계열을 만든다.
 * RunDetail 의 페이스 곡선에 'GAP' 오버레이로 쓴다. buildPaceSeries 와 같은 선형보간
 * bin 경계 + 각 bin 내 경사 보정. 결과 2점 미만이면 [].
 */
export function buildGapSeries(track: GapPoint[], binKm = 0.1): { km: number; paceSec: number }[] {
  const pts = (Array.isArray(track) ? track : []).filter(
    p => p && Number.isFinite(p.d) && Number.isFinite(p.t) && Number.isFinite(p.e),
  );
  if (pts.length < 2) return [];
  const out: { km: number; paceSec: number }[] = [];
  let lastD = pts[0].d, lastT = pts[0].t, lastE = pts[0].e;
  let mark = (Math.floor(pts[0].d / binKm) + 1) * binKm;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dd = b.d - a.d;
    if (dd <= 0) continue;
    while (b.d >= mark - 1e-9) {
      const f = Math.max(0, Math.min(1, (mark - a.d) / dd));
      const tAt = a.t + f * (b.t - a.t);
      const eAt = a.e + f * (b.e - a.e);
      const binD = mark - lastD, binT = tAt - lastT, binDe = eAt - lastE;
      if (binD > 0 && binT > 0) {
        const grade = binDe / (binD * 1000);
        const equiv = binD * gradeFactor(grade);
        if (equiv > 0) out.push({ km: +mark.toFixed(2), paceSec: Math.round(binT / equiv) });
      }
      lastD = mark; lastT = tAt; lastE = eAt;
      mark += binKm;
    }
  }
  return out.length >= 2 ? out : [];
}
