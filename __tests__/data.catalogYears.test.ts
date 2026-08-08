/**
 * 카탈로그 출시연도 — **값이 있으면 말이 되어야 한다.**
 *
 * 2026-08-08 부터 427건의 결손을 브랜드 공식/신뢰 출처로 채우고 있다. 긴 작업이라
 * 여러 세션에 걸치는데, 그 사이 잘못된 값이 섞이는 것을 막는다. 특히:
 *   · 미래로 튄 값·1990년대 값 같은 오타
 *   · **컬래버가 원본보다 먼저 나온 값** — 실제로 발견됐다(norda-001-satisfy)
 *   · 채운 뒤 되돌아가는 것(래칫)
 *
 * ⚠️ 이 스위트는 "결손 0"을 요구하지 않는다. 모르는 값은 **비워 두는 게 규약**이다
 * (CLAUDE.md — 확인한 것만 넣는다, 유추 금지). 대신 **한 번 채운 것은 줄지 않게** 막는다.
 * @format
 */
import * as fs from 'fs';
import * as path from 'path';

type Shoe = {
  id: string; brand: string; model: string;
  version?: string | null; variant?: string | null; collabWith?: string | null;
  releaseYear?: number | null; discontinued?: boolean;
};

const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'shoeCatalog.json'), 'utf8');
const parsed = JSON.parse(raw);
const SHOES: Shoe[] = Array.isArray(parsed)
  ? parsed
  : (Object.values(parsed).find(Array.isArray) as Shoe[]);

const named = (s: Shoe) => [s.model, s.version, s.variant].filter(Boolean).join(' ');
const withYear = SHOES.filter(s => s.releaseYear != null);

/**
 * 채워진 최소 개수(래칫). 채운 값이 사라지면 여기서 걸린다.
 * **올리기만 한다** — 내릴 일이 생겼다면 그건 데이터를 잃은 것이다.
 */
const YEARS_FILLED_FLOOR = 231; // 2026-08-08: 191 → 231 (40건 반영)

describe('출시연도 — 값의 타당성', () => {
  test(`채워진 연도가 최소 ${YEARS_FILLED_FLOOR}건 (래칫 — 줄면 데이터를 잃은 것)`, () => {
    expect(withYear.length).toBeGreaterThanOrEqual(YEARS_FILLED_FLOOR);
  });

  test('연도는 정수이고 러닝화가 존재한 범위 안이다', () => {
    const bad = withYear.filter(s => {
      const y = s.releaseYear as number;
      return !Number.isInteger(y) || y < 2000 || y > 2027;
    });
    expect(bad.map(s => `${s.id}=${s.releaseYear}`)).toEqual([]);
  });

  test('0 을 연도로 쓰지 않는다 — "모름"은 null 이다', () => {
    // 0 은 레거시 변환의 센티널일 뿐, 카탈로그에는 들어오면 안 된다.
    // (0 이 들어오면 lib/shoeYear 가 '모름'으로 읽어 조용히 정렬에서 빠진다.)
    expect(SHOES.filter(s => s.releaseYear === 0).map(s => s.id)).toEqual([]);
  });
});

describe('출시연도 — 관계의 타당성', () => {
  test('컬래버는 원본보다 먼저 나올 수 없다', () => {
    const base = new Map<string, number>();
    for (const s of SHOES) {
      if (s.collabWith || s.variant || s.releaseYear == null) continue;
      base.set(`${s.brand}|${s.model}|${s.version ?? ''}`, s.releaseYear);
    }
    const bad: string[] = [];
    for (const s of SHOES) {
      if (!s.collabWith || s.releaseYear == null) continue;
      const b = base.get(`${s.brand}|${s.model}|${s.version ?? ''}`);
      if (b != null && s.releaseYear < b) bad.push(`${s.id}=${s.releaseYear} < 원본 ${b}`);
    }
    // ⚠️ 알려진 미해결 1건: norda-001-satisfy(2022) < norda-001(2023).
    // 둘 중 하나가 틀렸는데 출처를 못 찾아 추측으로 고치지 않았다. 해결되면 이 배열을 비운다.
    expect(bad).toEqual(['norda-001-satisfy=2022 < 원본 2023']);
  });

  test('같은 시리즈에서 버전이 높을수록 연도가 뒤이거나 같다', () => {
    const series = new Map<string, {v: number; y: number; id: string}[]>();
    for (const s of SHOES) {
      if (s.collabWith || s.variant || s.releaseYear == null) continue;
      const v = Number(s.version);
      if (!Number.isFinite(v)) continue;
      const k = `${s.brand}|${s.model}`;
      (series.get(k) ?? series.set(k, []).get(k)!).push({v, y: s.releaseYear, id: s.id});
    }
    const bad: string[] = [];
    for (const [k, list] of series) {
      list.sort((a, b) => a.v - b.v);
      for (let i = 1; i < list.length; i++) {
        if (list[i].y < list[i - 1].y) {
          bad.push(`${k}: v${list[i - 1].v}=${list[i - 1].y} → v${list[i].v}=${list[i].y}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
