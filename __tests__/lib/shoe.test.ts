import {
  parseShoeName,
  BRANDS,
  shoeHealth,
  isRetired,
  conditionForPercent,
  clampMaxKm,
  tierBadge,
  wearTier,
  reconcileShoeAlerts,
  DEFAULT_MAX_KM,
  MIN_SHOE_MAX_KM,
  MAX_SHOE_MAX_KM,
  SHOE_CAUTION_PCT,
  SHOE_REPLACE_PCT,
} from '../../lib/shoe';
import type {BackupPayload} from '../../lib/backup';
import {
  markDeleted,
  liveRecords,
  partitionTombstones,
  mergeCloudData,
} from '../../lib/cloudSync';

const payload = (over: Partial<BackupPayload> = {}): BackupPayload => ({
  shoes: [],
  runs: [],
  settings: {},
  ...over,
});

describe('parseShoeName', () => {
  test('empty name → empty brand & model', () => {
    expect(parseShoeName('')).toEqual({brand: '', model: ''});
  });

  test('known single-word brand (case-insensitive prefix)', () => {
    expect(parseShoeName('nike Pegasus 41')).toEqual({brand: 'NIKE', model: 'Pegasus 41'});
  });

  test('known multi-word brand wins over first-space split', () => {
    expect(parseShoeName('New Balance 1080v13')).toEqual({
      brand: 'NEW BALANCE',
      model: '1080v13',
    });
  });

  test('unknown brand → first token is the brand, uppercased', () => {
    expect(parseShoeName('Topo Phantom')).toEqual({brand: 'TOPO', model: 'Phantom'});
  });

  test('single token with no space → brand only', () => {
    expect(parseShoeName('Cloudmonster')).toEqual({brand: 'CLOUDMONSTER', model: ''});
  });

  test('BRANDS catalog is exported and non-empty', () => {
    expect(BRANDS.length).toBeGreaterThan(0);
    expect(BRANDS).toContain('New Balance');
  });
});

describe('shoeHealth — used = start_km + Σ(this shoe runs)', () => {
  const shoe = {id: 's1', max_km: 700, start_km: 0};

  test('새 신발: usedKm 0, remaining 전체, percentUsed 0, 양호', () => {
    const h = shoeHealth(shoe, []);
    expect(h.usedKm).toBe(0);
    expect(h.remainingKm).toBe(700);
    expect(h.percentUsed).toBe(0);
    expect(h.condition).toBe('양호');
  });

  test('해당 shoe_id 런만 누적하고 다른 신발은 무시한다', () => {
    const runs = [
      {shoe_id: 's1', km: 5},
      {shoe_id: 's1', km: 5},
      {shoe_id: 's2', km: 99},
    ];
    const h = shoeHealth(shoe, runs);
    expect(h.usedKm).toBeCloseTo(10, 5);
    expect(h.remainingKm).toBeCloseTo(690, 5);
  });

  test('start_km(기등록 거리)가 used에 더해진다', () => {
    const h = shoeHealth({id: 's1', max_km: 700, start_km: 120}, [{shoe_id: 's1', km: 30}]);
    expect(h.usedKm).toBeCloseTo(150, 5);
    expect(h.remainingKm).toBeCloseTo(550, 5);
  });

  test('문자열 km도 합산된다(백엔드 직렬화 대응)', () => {
    const h = shoeHealth(shoe, [{shoe_id: 's1', km: '12.5'}]);
    expect(h.usedKm).toBeCloseTo(12.5, 5);
  });

  test('수명을 넘기면 remainingKm은 0으로 클램프되지만 percentUsed는 100을 넘는다', () => {
    const h = shoeHealth(shoe, [{shoe_id: 's1', km: 800}]);
    expect(h.remainingKm).toBe(0);
    expect(h.percentUsed).toBeGreaterThan(100);
    expect(h.condition).toBe('교체');
  });

  test('max_km가 없으면 기본 카테고리 수명을 쓴다', () => {
    const h = shoeHealth({id: 's1'}, []);
    expect(h.remainingKm).toBe(DEFAULT_MAX_KM);
  });

  test('UI 별칭 max도 받아들인다', () => {
    const h = shoeHealth({id: 1, max: 400, start_km: 0}, [{shoe_id: 1, km: 200}]);
    expect(h.percentUsed).toBeCloseTo(50, 5);
  });
});

describe('shoeHealth — 서버 truth(total_km) 우선(audit#9/#10)', () => {
  test('서버 total_km이 있으면 클라이언트 런 합산 대신 그것을 usedKm으로 쓴다', () => {
    // 로컬엔 런이 0개여도 서버가 540km를 영속했다면 그 값이 truth다(다른 기기 런 반영).
    const h = shoeHealth({id: 's1', max_km: 700, total_km: 540}, []);
    expect(h.usedKm).toBe(540);
    expect(h.remainingKm).toBeCloseTo(160, 5);
    expect(h.percentUsed).toBeCloseTo(77.14, 1);
    expect(h.condition).toBe('주의');
  });

  test('서버 total_km은 로컬 런 합산을 덮어쓴다(이중 계산 방지)', () => {
    // 서버 truth가 단일 소스 — 로컬 런까지 더해 부풀리지 않는다.
    const h = shoeHealth({id: 's1', max_km: 700, start_km: 100, total_km: 300}, [
      {shoe_id: 's1', km: 50},
    ]);
    expect(h.usedKm).toBe(300);
  });

  test('total_km이 없으면 기존 클라이언트 파생(start_km + Σ runs)으로 폴백한다', () => {
    const h = shoeHealth({id: 's1', max_km: 700, start_km: 20}, [{shoe_id: 's1', km: 30}]);
    expect(h.usedKm).toBeCloseTo(50, 5);
  });

  test('total_km이 NaN/음수면 truth로 인정하지 않고 폴백한다', () => {
    const bad = shoeHealth({id: 's1', max_km: 700, total_km: NaN, start_km: 10}, [
      {shoe_id: 's1', km: 5},
    ]);
    expect(bad.usedKm).toBeCloseTo(15, 5);
    const neg = shoeHealth({id: 's1', max_km: 700, total_km: -1, start_km: 10}, []);
    expect(neg.usedKm).toBeCloseTo(10, 5);
  });

  test('서버 total_km 0은 유효한 truth다(아직 안 달린 신발)', () => {
    const h = shoeHealth({id: 's1', max_km: 700, start_km: 0, total_km: 0}, [
      {shoe_id: 's1', km: 99}, // 미동기 로컬 런은 서버 truth로 무시
    ]);
    expect(h.usedKm).toBe(0);
    expect(h.condition).toBe('양호');
  });
});

describe('shoeHealth — 카테고리 수명 비례 condition 티어', () => {
  const shoe = {id: 1, max_km: 700, start_km: 0};
  const tierAt = (km: number) => shoeHealth(shoe, [{shoe_id: 1, km}]).condition;

  test('75% 미만은 양호', () => {
    expect(tierAt(0)).toBe('양호');
    expect(tierAt(520)).toBe('양호'); // ~74.3%
  });
  test('75% 이상 90% 미만은 주의', () => {
    expect(tierAt(540)).toBe('주의'); // ~77.1%
    expect(tierAt(626)).toBe('주의'); // ~89.4%
  });
  test('90% 이상은 교체', () => {
    expect(tierAt(640)).toBe('교체'); // ~91.4%
    expect(tierAt(700)).toBe('교체'); // 100%
  });
  test('티어 경계는 임계값 이상에서 즉시 전환된다', () => {
    expect(conditionForPercent(SHOE_CAUTION_PCT - 0.01)).toBe('양호');
    expect(conditionForPercent(SHOE_CAUTION_PCT)).toBe('주의');
    expect(conditionForPercent(SHOE_REPLACE_PCT - 0.01)).toBe('주의');
    expect(conditionForPercent(SHOE_REPLACE_PCT)).toBe('교체');
  });
});

// ── audit a2: 거리/수명 집계가 삭제(tombstone) 런을 제외한다는 *행동* 계약 ──────────
// 회귀의 핵심: shoeHealth 는 deleted 를 직접 필터하지 않는다(lib/shoe.ts). 제외 보장은
// '집계 입력을 liveRecords 로 거른다'는 호출부 계약에 달려 있다. 아래 테스트는 그 계약을
// 관측 가능한 usedKm(거리/수명의 단일 출처)로 고정한다 — 묘비가 런 배열에 새면 거리/수명이
// 부풀어 오르는 brittleness 를 대조로 함께 드러낸다.
describe('shoeHealth — 삭제(tombstone) 런 제외 계약 (a2 집계-제외)', () => {
  const shoe = {id: 's1', max_km: 600, start_km: 0};

  test('liveRecords 로 거른 런만 먹이면 삭제 런 km 가 usedKm 에서 빠진다(raw 리스트엔 포함 — brittleness 노출)', () => {
    const liveRun = {id: 'r1', shoe_id: 's1', km: 30};
    const deletedRun = markDeleted({id: 'r2', shoe_id: 's1', km: 100}, 5000);
    const raw = [liveRun, deletedRun];

    // 대조: raw(필터 안 한) 리스트를 그대로 먹이면 삭제 런 100km 까지 합산돼 거리/수명이
    // 부풀어 오른다 → shoeHealth 가 deleted 를 직접 거르지 않음을 드러낸다(plumbing 의존).
    expect(shoeHealth(shoe, raw).usedKm).toBeCloseTo(130, 5);

    // 계약: 집계 입력은 liveRecords 로 걸러야 한다 — 그러면 usedKm 는 live 런(30)만 센다.
    const h = shoeHealth(shoe, liveRecords(raw));
    expect(h.usedKm).toBeCloseTo(30, 5); // 삭제 런 100km 제외
    expect(h.remainingKm).toBeCloseTo(570, 5);
    expect(h.condition).toBe('양호'); // 100km 가 새면 안 됐고, 수명 비례 티어도 그대로
  });

  test('한 신발의 모든 런이 삭제되면 거리/수명이 삭제분만큼 0으로 복귀', () => {
    const runs = [
      markDeleted({id: 'r1', shoe_id: 's1', km: 250}, 1),
      markDeleted({id: 'r2', shoe_id: 's1', km: 90}, 2),
    ];
    expect(shoeHealth(shoe, liveRecords(runs)).usedKm).toBe(0);
    expect(shoeHealth(shoe, liveRecords(runs)).remainingKm).toBe(600);
  });
});

// partition→aggregate 링크: 머지 결과를 partitionTombstones 로 가른 뒤 *live* 만 집계에
// 먹였을 때 삭제 런이 실제로 거리/수명에서 빠지는지를 한 흐름으로 잇는다(고립 순수함수
// 테스트의 갭 메움).
describe('partition→aggregate 링크 — tombstone 머지 결과가 거리/수명에서 빠진다', () => {
  test('merge(런 X 묘비 포함) → partitionTombstones 가 X 를 tombstones 로 보내 live 입력에서 제외 → usedKm 가 X 만큼 감소', () => {
    const shoe = {id: 's1', max_km: 600, start_km: 0};
    // 폰A: 런 X 삭제(묘비, 최신). 폰B(원격): X 를 아직 live 로 보유 + 살아있는 런 Y 보유.
    const phoneA = payload({
      runs: [
        markDeleted({id: 'X', shoe_id: 's1', km: 120}, 2000),
        {id: 'Y', shoe_id: 's1', km: 40, updatedAt: 100},
      ],
    });
    const phoneB = payload({
      runs: [
        {id: 'X', shoe_id: 's1', km: 120, updatedAt: 1000},
        {id: 'Y', shoe_id: 's1', km: 40, updatedAt: 100},
      ],
    });
    const merged = mergeCloudData(phoneA, phoneB);

    const {live, tombstones} = partitionTombstones(merged.runs);
    expect(tombstones.map((r: any) => r.id)).toEqual(['X']); // X 는 묘비로 분리(live 아님)
    expect(live.map((r: any) => r.id)).toEqual(['Y']);

    // live 배열을 집계에 먹이면 X(120km)가 빠지고 Y(40km)만 센다.
    expect(shoeHealth(shoe, live as any[]).usedKm).toBeCloseTo(40, 5);
    // 대조: 머지 결과 전체(묘비 포함)를 먹이면 X 가 거리/수명을 부풀린다(160km).
    expect(shoeHealth(shoe, merged.runs as any[]).usedKm).toBeCloseTo(160, 5);
  });
});

describe('isRetired — 보관 플래그', () => {
  test('retired:true → true', () => {
    expect(isRetired({id: 1, retired: true})).toBe(true);
  });
  test('플래그 없으면 false (기본 활성)', () => {
    expect(isRetired({id: 1})).toBe(false);
    expect(isRetired({})).toBe(false);
  });
  test('null/undefined 입력도 안전하게 false', () => {
    expect(isRetired(null)).toBe(false);
    expect(isRetired(undefined)).toBe(false);
  });
});

describe('clampMaxKm — 신발 수명 범위 보정', () => {
  test('범위 내 값은 정수 반올림만', () => {
    expect(clampMaxKm(600)).toBe(600);
    expect(clampMaxKm(623.7)).toBe(624);
  });
  test('하한/상한으로 클램프', () => {
    expect(clampMaxKm(10)).toBe(MIN_SHOE_MAX_KM);
    expect(clampMaxKm(99999)).toBe(MAX_SHOE_MAX_KM);
  });
  test('비정상값(NaN/Infinity)은 기본 수명', () => {
    expect(clampMaxKm(NaN)).toBe(DEFAULT_MAX_KM);
    expect(clampMaxKm(Infinity)).toBe(DEFAULT_MAX_KM); // 비유한값은 기본값으로 정규화
  });
});

describe('tierBadge — 앱내 배지 매핑', () => {
  test('양호는 배지 없음(null)', () => {
    expect(tierBadge('양호')).toBeNull();
  });
  test('주의 → warn 톤', () => {
    expect(tierBadge('주의')).toEqual({label: '주의', tone: 'warn'});
  });
  test('교체 → danger 톤', () => {
    expect(tierBadge('교체')).toEqual({label: '교체', tone: 'danger'});
  });
});

describe('wearTier — 마모 4단계(사용률%)', () => {
  test('0~50% → 최상(🟢/good)', () => {
    expect(wearTier(0)).toMatchObject({key: 'best', label: '최상', emoji: '🟢', tone: 'good'});
    expect(wearTier(49.9).key).toBe('best');
  });
  test('50~80% → 양호(🟡/mid)', () => {
    expect(wearTier(50)).toMatchObject({key: 'good', label: '양호', tone: 'mid'});
    expect(wearTier(79.9).key).toBe('good');
  });
  test('80~100% → 교체 고려(🟠/warn)', () => {
    expect(wearTier(80)).toMatchObject({key: 'consider', label: '교체 고려', tone: 'warn'});
    expect(wearTier(99.9).key).toBe('consider');
  });
  test('100%+ → 교체 권장(🔴/danger)', () => {
    expect(wearTier(100)).toMatchObject({key: 'replace', label: '교체 권장', emoji: '🔴', tone: 'danger'});
    expect(wearTier(150).key).toBe('replace');
  });
  test('비정상 입력 → 최상(0%)', () => {
    expect(wearTier(NaN).key).toBe('best');
    expect(wearTier(-10).key).toBe('best');
  });
});

describe('reconcileShoeAlerts — 신발별 중복 알림 방지', () => {
  test('처음 임계 도달한 신발은 새 알림 대상', () => {
    const {toNotify, notified} = reconcileShoeAlerts(['s1'], []);
    expect(toNotify).toEqual(['s1']);
    expect(notified).toEqual(['s1']);
  });
  test('이미 알린 신발은 다시 알리지 않는다(중복 방지)', () => {
    const {toNotify, notified} = reconcileShoeAlerts(['s1'], ['s1']);
    expect(toNotify).toEqual([]); // 중복 알림 없음
    expect(notified).toEqual(['s1']); // 추적은 유지
  });
  test('같은 날 새로 임계 도달한 다른 신발만 알린다(전역 게이트 아님)', () => {
    const {toNotify} = reconcileShoeAlerts(['s1', 's2'], ['s1']);
    expect(toNotify).toEqual(['s2']); // s1은 이미 알림, s2만 신규
  });
  test('임계 아래로 내려간 신발은 추적에서 제외(수명 상향/교체 후 재알림 가능)', () => {
    const {toNotify, notified} = reconcileShoeAlerts([], ['s1']);
    expect(toNotify).toEqual([]);
    expect(notified).toEqual([]); // s1이 더는 임계 아님 → 집합에서 빠짐
  });
  test('숫자/문자 id 혼용 + 중복 id 방어', () => {
    const {toNotify, notified} = reconcileShoeAlerts([1, 1, 2], ['1']);
    expect(notified.map(String)).toEqual(['1', '2']); // 중복 1 제거
    expect(toNotify.map(String)).toEqual(['2']); // 1은 이미 알림(문자 매칭)
  });
});
