// ─── lib/runMerge.ts — 한 러닝은 한 기록 (순수 로직) ─────────────────────────────
//
// 폰과 워치를 둘 다 켜고 뛰면 **같은 러닝이 두 건으로 저장된다**. 그러면 신발에 거리가
// 두 번 차감돼, keego 의 존재 이유인 수명 관리가 정면으로 망가진다.
//
// 실측(2026-07-28 민우님 러닝):
//   워치 5.358km / 32:23  ·  폰 5.14km / 32:15  → 신발에 10.50km 차감(실제 5.4km)
//   가민(기준) 5.43km — 워치 -1.3%, 폰 -5.3%
//
// 그래서 겹치는 러닝은 **하나로 합친다**(스트라바가 중복 업로드를 처리하는 방식과 같다).
//
// 병합 규칙 — 측정값과 파생값을 가른다:
//  · **측정값**(거리·시간·심박·걸음수·칼로리)은 재계산하지 않는다. 측정한 기기 값을
//    그대로 쓴다. 특히 거리는 실시간 GPS 스트림 전체를 봐야 정확한데, 저장된 경로는
//    200점으로 다운샘플돼 있어 재계산하면 코너가 잘려 **짧아진다**(실측: 저장 경로의
//    기하 길이 5.135km < 실제 5.43km).
//  · **파생값**(고도 등 규칙이 필요한 것)은 폰의 검증된 순수 함수로 한 벌만 쓴다.
//    워치가 자체 계산한 고도는 노이즈 게이트가 없어 8배로 부푼다(274m vs 33m).
//  · 빈 값(0·'')은 '없음'으로 본다 — 있는 쪽이 이긴다. 둘 다 있으면 아래 우선순위.

/** 병합 판정에 필요한 최소 런 정보(BackendRun 의 부분집합 — 저장 형태에 안 묶인다). */
export interface MergeableRun {
  id: string;
  shoe_id?: string;
  km?: number;
  duration?: number;
  run_date?: string;
  source?: string;
  updatedAt?: number;
  /** 러닝을 실제로 시작한 시각(epoch ms). 2026-08-07 신설 — 있으면 역산보다 우선한다. */
  start_ms?: number;
  route?: string;
  location?: string;
  cadence?: number;
  heart_rate?: number;
  calories?: number;
  elevation_m?: number;
}

/** 시간창(ms). 겹침 판정의 기준. */
export interface RunWindow {
  startMs: number;
  endMs: number;
}

/**
 * 런의 시간창을 구한다. **런의 시작 시각이 필요한 모든 곳이 이 함수를 쓴다.**
 *
 * 우선순위:
 *   1) 호출부가 명시한 시작(워치 페이로드의 startMs) — 가장 확실하다
 *   2) 레코드의 `start_ms` — 2026-08-07 부터 저장한다
 *   3) `updatedAt − duration` 역산 — **구 레코드 전용 폴백**
 *
 * ⚠️ 3번은 원래 정확하지 않다. `updatedAt` 은 **저장 시각**이고 `duration` 은 **이동
 * 시간**이라(일시정지·死구간이 빠져 있다) 둘의 차이가 진짜 시작이 아니다.
 * 10분 쉬어간 40분 러닝이면 창이 통째로 10분 밀리고, 완주 검토 화면에 오래 머물면
 * 그만큼 더 밀린다. 예전 주석은 "80ms 차이였다"는 실측 하나를 근거로 들었는데,
 * 그건 **일시정지가 없던 러닝**이었다 — 오차의 원인이 바로 일시정지라 그 표본으로는
 * 검증되지 않는다.
 *
 * 그 오차가 세 곳을 동시에 오염시켰다: HealthKit 심박 창 · 48시간 심박 스윕(정확한
 * 라이브 트랙을 밀린 트랙으로 덮어썼다) · 폰↔워치 병합 창(겹침이 0 이 돼 이중 차감).
 * 역산을 더 정교하게 만드는 대신 **앱이 이미 아는 값을 레코드에 적는 것**으로 고쳤다.
 */
export function runWindow(run: MergeableRun, explicitStartMs?: number): RunWindow | null {
  const dur = Number(run.duration);
  if (!Number.isFinite(dur) || dur <= 0) return null;
  const durMs = dur * 1000;
  if (typeof explicitStartMs === 'number' && Number.isFinite(explicitStartMs) && explicitStartMs > 0) {
    return {startMs: explicitStartMs, endMs: explicitStartMs + durMs};
  }
  const stored = Number(run.start_ms);
  if (Number.isFinite(stored) && stored > 0) {
    // 저장된 시작 + 이동 시간. 끝은 updatedAt(저장 시각)이 있으면 그쪽이 더 정확하다 —
    // 일시정지가 있으면 실제 종료는 start + duration 보다 뒤다.
    const end = Number(run.updatedAt);
    return {startMs: stored, endMs: Number.isFinite(end) && end > stored ? end : stored + durMs};
  }
  const end = Number(run.updatedAt);
  if (!Number.isFinite(end) || end <= 0) return null;
  return {startMs: end - durMs, endMs: end};
}

/**
 * 두 시간창이 겹친 비율 — **짧은 쪽 기준**(0~1).
 *
 * 짧은 쪽을 분모로 쓰는 게 중요하다. 워치를 먼저 켜고 폰을 나중에 켜는 게 흔한데
 * (실측: 워치가 3분 먼저 시작), 긴 쪽 기준이면 그 3분 때문에 비율이 떨어져 같은 러닝을
 * 놓친다. 짧은 쪽 기준이면 "폰 러닝이 워치 러닝 안에 거의 들어있다"를 제대로 잡는다.
 */
export function overlapRatio(a: RunWindow, b: RunWindow): number {
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(a.endMs, b.endMs);
  const overlap = end - start;
  if (overlap <= 0) return 0;
  const shorter = Math.min(a.endMs - a.startMs, b.endMs - b.startMs);
  if (shorter <= 0) return 0;
  return Math.min(1, overlap / shorter);
}

/** 같은 러닝으로 볼 최소 겹침 비율. 실측 케이스는 90.6% 였다. */
export const SAME_RUN_OVERLAP = 0.5;

export interface FindMergeOptions {
  /** 들어온 런의 명시적 시작 시각(워치 페이로드 startMs). */
  incomingStartMs?: number;
  /** 기존 런 각각의 명시적 시작 시각(있으면 역산보다 우선). */
  startMsById?: Readonly<Record<string, number>>;
}

/**
 * 들어온 런과 **같은 러닝인 기존 런**을 찾는다(없으면 null).
 *
 * 조건: ① 같은 신발 ② 시간창이 절반 이상 겹침. 날짜 문자열은 보지 않는다 — 자정을
 * 걸친 러닝에서 갈리기 때문이다(시간창이 이미 그 일을 한다).
 *
 * 여러 개가 걸리면 가장 많이 겹치는 하나를 고른다(결정적).
 */
export function findMergeTarget(
  incoming: MergeableRun,
  existing: readonly MergeableRun[],
  opts: FindMergeOptions = {},
): MergeableRun | null {
  const inWin = runWindow(incoming, opts.incomingStartMs);
  if (!inWin) return null;
  let best: MergeableRun | null = null;
  let bestRatio = 0;
  for (const r of existing) {
    if (!r || r.id === incoming.id) continue;
    if (String(r.shoe_id ?? '') !== String(incoming.shoe_id ?? '')) continue;
    const win = runWindow(r, opts.startMsById?.[r.id]);
    if (!win) continue;
    const ratio = overlapRatio(inWin, win);
    if (ratio >= SAME_RUN_OVERLAP && ratio > bestRatio) {
      best = r;
      bestRatio = ratio;
    }
  }
  return best;
}

/** 값이 '있는' 값인가 — 0·빈 문자열·NaN 은 '없음'으로 본다. */
function has(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  return false;
}

/** 거리·시간의 정본을 어느 쪽으로 볼지. */
export type DistanceAuthority = 'watch' | 'phone';

/**
 * 실내(트레드밀) 러닝인가 — GPS 가 무의미하므로 거리 정본이 뒤집힌다.
 * 야외는 워치(손목 GPS)가, 실내는 폰(걸음/트레드밀 입력)이 정확하다(업계 관행 동일).
 */
export function distanceAuthority(surface?: string | null): DistanceAuthority {
  return surface === 'treadmill' ? 'phone' : 'watch';
}

/**
 * 두 기록을 하나로 합친 결과를 만든다(입력 불변 — 새 객체를 돌려준다).
 *
 * 규칙:
 *  · 거리·시간: `authority` 쪽 source 의 값을 쓴다. 그쪽이 비어 있으면 반대쪽.
 *  · 심박·칼로리·케이던스·위치·경로: **있는 쪽**이 이긴다. 둘 다 있으면 워치(센서 소유)를
 *    쓰되, 경로·위치는 점이 더 많은/비어있지 않은 쪽을 쓴다.
 *  · 고도: 폰이 계산한 값을 쓴다(워치 자체 계산은 노이즈 게이트가 없어 부푼다).
 *  · id·shoe_id·run_date 는 기존 런 것을 유지한다(참조 무결성 — 사이드카·통계가 id 를 쓴다).
 */
export function mergeRuns(
  existing: MergeableRun,
  incoming: MergeableRun,
  authority: DistanceAuthority = 'watch',
): MergeableRun {
  const watch = existing.source === 'watch' ? existing : incoming.source === 'watch' ? incoming : null;
  const phone = existing.source === 'watch' ? incoming : existing.source === 'gps' ? existing : incoming;
  const authoritative = authority === 'watch' ? watch : phone;
  const other = authoritative === watch ? phone : watch;

  const pickMeasured = (key: 'km' | 'duration') => {
    const a = authoritative?.[key];
    if (has(a)) return a as number;
    const b = other?.[key];
    return has(b) ? (b as number) : (has(existing[key]) ? existing[key] : incoming[key]);
  };

  // 센서값은 있는 쪽이 이긴다. 둘 다 있으면 워치(심박·칼로리는 손목 센서가 정확).
  const pickSensor = (key: 'heart_rate' | 'calories' | 'cadence') => {
    const w = watch?.[key];
    if (has(w)) return w as number;
    const p = phone?.[key];
    if (has(p)) return p as number;
    return has(existing[key]) ? existing[key] : incoming[key];
  };

  // 문자열(경로·위치)은 비어있지 않은 쪽. 둘 다 있으면 더 긴 쪽(정보량이 많다).
  const pickText = (key: 'route' | 'location') => {
    const a = String(existing[key] ?? '');
    const b = String(incoming[key] ?? '');
    if (!has(a)) return b;
    if (!has(b)) return a;
    return b.length > a.length ? b : a;
  };

  // 고도는 폰 계산값만 신뢰한다. 폰 값이 없으면 비운다 — 워치의 부푼 값을 쓰느니
  // 비우는 게 낫다(틀린 숫자보다 빈칸).
  const elevation = has(phone?.elevation_m) ? (phone!.elevation_m as number) : 0;

  return {
    ...existing,
    km: pickMeasured('km'),
    duration: pickMeasured('duration'),
    heart_rate: pickSensor('heart_rate'),
    calories: pickSensor('calories'),
    cadence: pickSensor('cadence'),
    route: pickText('route'),
    location: pickText('location'),
    elevation_m: elevation,
    // 병합 시점을 갱신해 클라우드 머지('최신 우선')가 이 결과를 이기게 한다.
    updatedAt: Math.max(Number(existing.updatedAt) || 0, Number(incoming.updatedAt) || 0, 1),
  };
}
