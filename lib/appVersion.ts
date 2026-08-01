// ============================================================================
// lib/appVersion.ts — 앱 버전 단일 소스 + 버전 비교 (순수)
// ----------------------------------------------------------------------------
// 버전 단일 소스 = package.json (심사 #16, 2026-07-22 확정 — 릴리스 때 package.json 만
// 올리면 된다). ProfileScreen 의 '버전' 표시도 같은 값을 쓴다.
//
// 여기서 파는 건 두 가지뿐이다: 지금 앱의 버전 문자열과, 버전 비교 함수.
// 강제 업데이트 판정(lib/forceUpdate)이 이걸 쓴다.
// ============================================================================

/** 지금 실행 중인 앱의 버전(예: '1.0.0'). package.json 이 단일 소스다. */
export const APP_VERSION: string = require('../package.json').version;

/**
 * 'a.b.c' 형태를 숫자 배열로. 프리릴리스 꼬리표('1.2.0-beta.1')는 잘라낸다 —
 * 강제 업데이트 판정에 프리릴리스 순서까지 따질 이유가 없다.
 * 형식이 아니면 null(호출부가 '비교 불가'로 처리).
 */
function parse(v: unknown): number[] | null {
  if (typeof v !== 'string') return null;
  const core = v.trim().split(/[-+]/)[0];
  if (!core) return null;
  const parts = core.split('.');
  if (parts.length === 0 || parts.length > 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

/**
 * 버전 비교. a<b → -1, a===b → 0, a>b → 1. **하나라도 형식이 아니면 null.**
 *
 * null 을 던지지 않고 돌려주는 이유: 호출부가 '모르겠으면 막지 않는다'를 명시적으로
 * 선택하게 하기 위해서다(lib/forceUpdate 참조). 판정 불가를 조용히 0으로 뭉개면
 * 잘못된 값 하나로 앱이 잠긴다.
 *
 * 자릿수가 다르면 짧은 쪽을 0으로 채운다('1.2' === '1.2.0').
 */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * `current` 가 `min` 보다 낮은가(= 지원되지 않는 구버전인가).
 * 비교 불가면 **false** — 모르면 막지 않는다.
 */
export function isBelowVersion(current: unknown, min: unknown): boolean {
  return compareVersions(current, min) === -1;
}
