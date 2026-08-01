// ============================================================================
// AUDIT 3 D-1 ~ D-4 — 순수 로직 계약
//
// 네 건 모두 "조용한 실패"를 고치는 변경이라, 테스트도 **조용하지 않은지**를 본다.
// D-1 묘비 정리 · D-2 시계 보정 · D-3 삭제 큐 · D-4 마일리지 수위.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  compactTombstones,
  slimTombstone,
  isTombstoneFresh,
  markDeleted,
  isDeleted,
  TOMBSTONE_TTL_MS,
  SHOE_TOMBSTONE_KEEP,
} from '../../lib/cloudSync';
import {
  computeOffset,
  observeServerClock,
  loadClockOffset,
  currentOffsetMs,
  nowMs,
  __resetClockOffsetForTests,
  MAX_CLOCK_OFFSET_MS,
  CLOCK_OFFSET_KEY,
} from '../../lib/clockOffset';
import {
  enqueueDetailDeletion,
  flushDetailDeletions,
  DETAIL_DELETE_QUEUE_KEY,
} from '../../lib/runDetailSync';
import {
  detectMileageDrops,
  raiseHighWater,
  lowerHighWater,
  MILEAGE_DROP_EPSILON_KM,
} from '../../lib/shoe';
import {
  shouldAlertStorage,
  SYNC_FAIL_THRESHOLD,
  SYNC_ALERT_COOLDOWN_MS,
  initialStorageAlertState,
} from '../../lib/storageAlert';

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetClockOffsetForTests();
});

// ─── D-1 묘비 정리 ────────────────────────────────────────────────────────────
describe('D-1 묘비 껍데기화 + 유효기간', () => {
  const run = (id: string) => ({
    id, shoe_id: 's1', km: 10, memo: '아주 긴 메모'.repeat(20),
    route: 'x'.repeat(500), run_date: '2026-01-01', duration: 3600,
  });

  test('묘비는 id·deleted·updatedAt 만 남는다', () => {
    const t = markDeleted(run('r1'), 1000);
    const slim = slimTombstone(t) as Record<string, unknown>;
    expect(Object.keys(slim).sort()).toEqual(['deleted', 'id', 'updatedAt']);
    expect(slim.id).toBe('r1');
    expect(slim.deleted).toBe(true);
    expect(slim.updatedAt).toBe(1000);
  });

  test('살아 있는 레코드는 손대지 않는다(참조까지 동일)', () => {
    const live = run('r2');
    expect(slimTombstone(live)).toBe(live);
  });

  test('신발 묘비는 name 을 남긴다 — 지난 기록의 신발 이름 표시에 쓰인다', () => {
    const t = markDeleted({id: 's1', name: 'Nike Pegasus', max_km: 700, brand: 'Nike'}, 1000);
    const slim = slimTombstone(t, SHOE_TOMBSTONE_KEEP) as Record<string, unknown>;
    expect(slim.name).toBe('Nike Pegasus');
    expect(slim.max_km).toBeUndefined(); // 나머지는 버린다
  });

  test('기한이 지난 묘비는 떨어뜨린다', () => {
    const old = markDeleted(run('r1'), 1000);
    const fresh = markDeleted(run('r2'), 1000);
    const now = 1000 + TOMBSTONE_TTL_MS;
    expect(isTombstoneFresh(old, now)).toBe(false);
    expect(isTombstoneFresh(fresh, now - 1)).toBe(true);
  });

  test('시각을 모르는 묘비는 남긴다 — 떨어뜨리면 삭제가 취소된다', () => {
    expect(isTombstoneFresh({id: 'x', deleted: true}, 9_999_999)).toBe(true);
    expect(isTombstoneFresh({id: 'x', deleted: true, updatedAt: 'NaN'}, 9_999_999)).toBe(true);
  });

  test('미래 시각(기기 시계 어긋남)도 남긴다', () => {
    expect(isTombstoneFresh(markDeleted(run('r'), 9_999_999), 1000)).toBe(true);
  });

  test('compactTombstones — live 는 보존, 묘비는 줄이고, 만료는 제거', () => {
    const now = 1000 + TOMBSTONE_TTL_MS;
    const live = run('live');
    const input = [live, markDeleted(run('old'), 1000), markDeleted(run('new'), now - 100)];
    const out = compactTombstones(input, now);

    expect(out).toHaveLength(2);
    expect(out[0]).toBe(live); // 참조까지 그대로
    expect(isDeleted(out[1])).toBe(true);
    expect((out[1] as any).id).toBe('new');
    expect((out[1] as any).route).toBeUndefined(); // 껍데기화됨
  });

  test('묘비가 실제로 작아진다(크기 회귀 방어)', () => {
    const t = markDeleted(run('r1'), 1000);
    const before = JSON.stringify(t).length;
    const after = JSON.stringify(slimTombstone(t)).length;
    expect(after).toBeLessThan(before / 5); // 한 자릿수 배 이상 축소
  });
});

describe('D-1 동기 실패 알림', () => {
  // 시각은 실제 epoch 를 쓴다 — 0 을 쓰면 쿨다운(now - lastAlertMs)이 퇴화해
  // 첫 알림까지 막힌다(실제 앱에서는 now 가 항상 큰 값이라 생기지 않는 상황).
  const T0 = 1_800_000_000_000;

  test('임계(3회) 전에는 알리지 않는다 — 지하철 오프라인으로 소리치지 않는다', () => {
    let st = initialStorageAlertState();
    for (let i = 0; i < SYNC_FAIL_THRESHOLD - 1; i++) {
      const r = shouldAlertStorage(st, false, T0, SYNC_FAIL_THRESHOLD, SYNC_ALERT_COOLDOWN_MS);
      st = r.state;
      expect(r.alert).toBe(false);
    }
    const last = shouldAlertStorage(st, false, T0, SYNC_FAIL_THRESHOLD, SYNC_ALERT_COOLDOWN_MS);
    expect(last.alert).toBe(true);
  });

  test('쿨다운(1시간) 안에는 다시 알리지 않는다', () => {
    let st = {fails: SYNC_FAIL_THRESHOLD, lastAlertMs: 1000};
    const r = shouldAlertStorage(st, false, 1000 + SYNC_ALERT_COOLDOWN_MS - 1, SYNC_FAIL_THRESHOLD, SYNC_ALERT_COOLDOWN_MS);
    expect(r.alert).toBe(false);
  });

  test('성공하면 조용해진다', () => {
    const r = shouldAlertStorage({fails: 9, lastAlertMs: 0}, true, 0);
    expect(r.state.fails).toBe(0);
    expect(r.alert).toBe(false);
  });
});

// ─── D-2 시계 보정 ────────────────────────────────────────────────────────────
describe('D-2 서버 시계 offset', () => {
  test('offset = 서버 − 기기', () => {
    expect(computeOffset(1_000_600, 1_000_000)).toBe(600);
    expect(computeOffset(1_000_000, 1_000_600)).toBe(-600);
  });

  test('상한(24시간)을 넘는 값은 채택하지 않는다 — 잘못된 보정이 더 위험하다', () => {
    expect(computeOffset(1_000_000 + MAX_CLOCK_OFFSET_MS + 1, 1_000_000)).toBeNull();
    expect(computeOffset(1_000_000, 1_000_000 + MAX_CLOCK_OFFSET_MS + 1)).toBeNull();
  });

  test('형식이 아니면 채택하지 않는다', () => {
    for (const bad of [null, undefined, 'x', 0, -5, NaN]) {
      expect(computeOffset(bad as unknown, 1000)).toBeNull();
      expect(computeOffset(1000, bad as unknown)).toBeNull();
    }
  });

  test('관측하면 nowMs 가 보정된다', async () => {
    expect(currentOffsetMs()).toBe(0);
    const base = Date.now();
    await observeServerClock(base + 5000, base); // 서버가 5초 빠름
    expect(currentOffsetMs()).toBe(5000);
    expect(nowMs()).toBeGreaterThanOrEqual(Date.now() + 4900);
  });

  test('채택 못 한 관측은 기존 offset 을 건드리지 않는다', async () => {
    await observeServerClock(1_000_500, 1_000_000);
    expect(currentOffsetMs()).toBe(500);
    await observeServerClock('쓰레기', 1_000_000);
    expect(currentOffsetMs()).toBe(500);
  });

  test('offset 은 영속되고 부팅 시 복원된다', async () => {
    await observeServerClock(2_000_300, 2_000_000);
    expect(await AsyncStorage.getItem(CLOCK_OFFSET_KEY)).toBe('300');
    __resetClockOffsetForTests();
    expect(currentOffsetMs()).toBe(0);
    await loadClockOffset();
    expect(currentOffsetMs()).toBe(300);
  });

  test('영속된 값이 상한을 넘으면 무시한다(손상 방어)', async () => {
    await AsyncStorage.setItem(CLOCK_OFFSET_KEY, String(MAX_CLOCK_OFFSET_MS * 10));
    await loadClockOffset();
    expect(currentOffsetMs()).toBe(0);
  });
});

// ─── D-3 클라우드 상세 삭제 큐 ────────────────────────────────────────────────
describe('D-3 삭제한 런의 클라우드 상세 제거', () => {
  test('큐는 멱등하다', async () => {
    await enqueueDetailDeletion('r1');
    await enqueueDetailDeletion('r1');
    expect(JSON.parse((await AsyncStorage.getItem(DETAIL_DELETE_QUEUE_KEY))!)).toEqual(['r1']);
  });

  test('flush 는 성공한 것만 큐에서 뺀다 — 실패는 남겨 재시도한다', async () => {
    await enqueueDetailDeletion('ok1');
    await enqueueDetailDeletion('fail1');
    await enqueueDetailDeletion('ok2');

    const deleteRunDetail = jest.fn(async (id: string) => {
      if (id === 'fail1') throw new Error('오프라인');
    });
    const deleted = await flushDetailDeletions({deleteRunDetail});

    expect(deleted).toBe(2);
    expect(JSON.parse((await AsyncStorage.getItem(DETAIL_DELETE_QUEUE_KEY))!)).toEqual(['fail1']);
  });

  test('삭제에 성공하면 동기 마커도 함께 정리한다(D-5)', async () => {
    await AsyncStorage.setMany({
      'detail_pushed_r9': 'route:10',
      'detail_absent_r9': '1000',
    });
    await enqueueDetailDeletion('r9');
    await flushDetailDeletions({deleteRunDetail: jest.fn(async () => {})});

    expect(await AsyncStorage.getItem('detail_pushed_r9')).toBeNull();
    expect(await AsyncStorage.getItem('detail_absent_r9')).toBeNull();
  });

  test('삭제를 지원하지 않는 포트면 아무 일도 하지 않는다(큐 보존)', async () => {
    await enqueueDetailDeletion('r1');
    expect(await flushDetailDeletions({})).toBe(0);
    expect(JSON.parse((await AsyncStorage.getItem(DETAIL_DELETE_QUEUE_KEY))!)).toEqual(['r1']);
  });
});

// ─── D-4 마일리지 최고수위 ────────────────────────────────────────────────────
describe('D-4 신발 마일리지 최고수위', () => {
  const shoe = (over: Record<string, unknown> = {}) => ({
    id: 's1', name: '페가수스', max_km: 700, start_km: 0, ...over,
  });
  const runs = (...kms: number[]) => kms.map((km, i) => ({id: `r${i}`, shoe_id: 's1', km}));

  test('수위는 올라가기만 한다', () => {
    const s0 = shoe();
    const s1 = raiseHighWater(s0, runs(10, 20));
    expect((s1 as any).usedKmHighWater).toBe(30);
    // 런이 줄어도 수위는 그대로 — 새 객체를 만들지도 않는다
    expect(raiseHighWater(s1, runs(10))).toBe(s1);
  });

  test('변화가 없으면 원본 참조를 그대로 돌려준다(불필요한 동기 방지)', () => {
    const s = shoe({usedKmHighWater: 100});
    expect(raiseHighWater(s, runs(10))).toBe(s);
  });

  test('기록이 사라지면 감소를 잡아낸다', () => {
    const s = shoe({usedKmHighWater: 30});
    const drops = detectMileageDrops([s], runs(10)); // 20km 가 사라졌다
    expect(drops).toHaveLength(1);
    expect(drops[0].missingKm).toBeCloseTo(20, 5);
    expect(drops[0].shoeName).toBe('페가수스');
  });

  test('수위가 없으면 판정하지 않는다 — 전원 오탐 방지', () => {
    expect(detectMileageDrops([shoe()], runs(10))).toHaveLength(0);
  });

  test('잡음 수준(<100m)은 감소로 보지 않는다', () => {
    const s = shoe({usedKmHighWater: 30});
    expect(detectMileageDrops([s], runs(30 - MILEAGE_DROP_EPSILON_KM / 2))).toHaveLength(0);
  });

  test('삭제는 정당한 감소 — 수위를 함께 내리면 경고가 안 뜬다', () => {
    let s: any = shoe({usedKmHighWater: 30});
    // 20km 런을 지웠다 → 호출부가 수위도 20 내린다
    s = lowerHighWater(s, 20);
    expect(s.usedKmHighWater).toBe(10);
    expect(detectMileageDrops([s], runs(10))).toHaveLength(0);
  });

  test('수위를 음수로 내리지 않는다', () => {
    expect((lowerHighWater(shoe({usedKmHighWater: 5}), 999) as any).usedKmHighWater).toBe(0);
  });

  test('수위가 없으면 내릴 것도 없다(참조 동일)', () => {
    const s = shoe();
    expect(lowerHighWater(s, 10)).toBe(s);
  });

  test('start_km(등록 시 이월 거리)도 수위에 포함된다', () => {
    const s = raiseHighWater(shoe({start_km: 100}), runs(10));
    expect((s as any).usedKmHighWater).toBe(110);
  });
});
