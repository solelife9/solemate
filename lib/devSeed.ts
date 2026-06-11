// ─── devSeed — 개발 전용 데모 데이터 ───────────────────────────────────────────
// 디자인/에뮬레이터 검증용 로컬 목 신발·런. App.tsx 부팅 로직이 __DEV__ + 빈 백엔드일
// 때만 주입한다(운영 안전 게이트는 호출부에 둔다 — 릴리스 빌드에선 __DEV__ 가 false 라
// 이 함수들이 호출되지 않는다). BackendShoe/BackendRun 은 types.d.ts 의 전역 ambient.

/** 데모 신발 3켤레(카본/데일리/맥스쿠션 성격 — 분류·용도 문장 검증용). */
export function devSeedShoes(): BackendShoe[] {
  return [
    {id: 'seed1', name: 'ASICS Novablast 5', max_km: 650, total_km: 412.8, purchase_date: '2026-02-10'},
    {id: 'seed2', name: 'Nike Alphafly 3', max_km: 400, total_km: 287, purchase_date: '2026-03-01'},
    {id: 'seed3', name: 'HOKA Clifton 9', max_km: 600, total_km: 96.2, purchase_date: '2025-11-15'},
  ];
}

/** 데모 런 5건(최근 9일 — 기록 탭/PR/차트 검증용). 날짜는 호출 시점 기준 상대일. */
export function devSeedRuns(): BackendRun[] {
  const today = new Date();
  const iso = (d: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() - d);
    return x.toISOString().slice(0, 10);
  };
  return [
    {id: 'r1', shoe_id: 'seed1', km: 8.2, run_date: iso(1), duration: 2460, cadence: 178},
    {id: 'r2', shoe_id: 'seed1', km: 5.0, run_date: iso(3), duration: 1500, cadence: 176},
    {id: 'r3', shoe_id: 'seed2', km: 12.1, run_date: iso(5), duration: 3100, cadence: 182},
    {id: 'r4', shoe_id: 'seed3', km: 6.4, run_date: iso(7), duration: 2000, cadence: 174},
    {id: 'r5', shoe_id: 'seed1', km: 10.0, run_date: iso(9), duration: 3000, cadence: 177},
  ];
}
