// ============================================================================
// recordSync — 레코드 단위 동기의 순수 판정 (1단계: 이중 쓰기)
//
// 이 모듈이 틀리면 클라우드에 올라가는 내용이 틀린다. 그래서 계약을 촘촘히 박는다:
//   · 무엇을 올릴지(selectDirty) — 덜 올리는 실수가 제일 위험하다
//   · 문서 본문(toRecordDoc) — 경로 중복 금지, 묘비 껍데기화
//   · 마커 관리 — 안 치우면 로컬에 흔적이 영구 누적된다
//   · 대조(diffRecordIds) — 1단계의 안전장치 자체가 옳은지
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  recordId,
  editedAtOf,
  isTombstone,
  toRecordDoc,
  selectDirty,
  nextMarkers,
  pruneMarkers,
  chunk,
  diffRecordIds,
  BATCH_LIMIT,
  RECORD_COLLECTIONS,
  mirrorRecords,
  loadMarkers,
  MARKERS_KEY,
  fromRecordDoc,
  mergePulled,
  pullRecords,
  loadCursors,
  PULL_PAGE,
} from '../../lib/recordSync';

const run = (id: string, updatedAt = 1000, over: Record<string, unknown> = {}) => ({
  id, shoe_id: 's1', km: 10, run_date: '2026-08-01', duration: 3600,
  memo: '', updatedAt, ...over,
});

describe('기본 판정', () => {
  test('id 는 문자열로 정규화한다(숫자 id 하위호환)', () => {
    expect(recordId({id: 'r1'})).toBe('r1');
    expect(recordId({id: 42})).toBe('42');
  });

  test('id 가 없거나 비면 null — 문서를 만들 수 없다', () => {
    for (const bad of [{}, {id: null}, {id: undefined}, {id: '   '}, null]) {
      expect(recordId(bad)).toBeNull();
    }
  });

  test('편집 시각이 없거나 이상하면 0', () => {
    expect(editedAtOf({updatedAt: 1234})).toBe(1234);
    for (const bad of [{}, {updatedAt: 0}, {updatedAt: -5}, {updatedAt: 'x'}, null]) {
      expect(editedAtOf(bad)).toBe(0);
    }
  });

  test('묘비는 deleted===true 일 때만(방어적)', () => {
    expect(isTombstone({deleted: true})).toBe(true);
    expect(isTombstone({deleted: 'true'})).toBe(false);
    expect(isTombstone({})).toBe(false);
  });
});

describe('toRecordDoc — 문서 본문', () => {
  test('경로는 담지 않는다 — runDetails 가 소유한다(1MiB 천장의 원인)', () => {
    const doc = toRecordDoc(run('r1', 1000, {route: 'x'.repeat(5000)}), 'runs');
    expect(doc.route).toBeUndefined();
  });

  test('_pending 같은 내부 표식도 담지 않는다', () => {
    const doc = toRecordDoc(run('r1', 1000, {_pending: true}), 'runs');
    expect(doc._pending).toBeUndefined();
  });

  test('editedAt 을 명시 필드로 승격한다', () => {
    expect(toRecordDoc(run('r1', 7777), 'runs').editedAt).toBe(7777);
  });

  test('undefined 값은 빼고 담는다 — Firestore 가 거부한다', () => {
    const doc = toRecordDoc({id: 'r1', updatedAt: 1, memo: undefined} as any, 'runs');
    expect('memo' in doc).toBe(false);
  });

  test('묘비는 껍데기만 — 본문을 클라우드에 영구 보존하지 않는다', () => {
    const t = run('r1', 2000, {deleted: true, memo: '긴 메모'.repeat(50)});
    const doc = toRecordDoc(t, 'runs');
    expect(Object.keys(doc).sort()).toEqual(['deleted', 'editedAt']);
  });

  test('신발 묘비는 name 을 남긴다 — 지난 기록의 신발 이름 표시에 쓰인다', () => {
    const doc = toRecordDoc({id: 's1', name: 'Nike Pegasus', max_km: 700, deleted: true, updatedAt: 5}, 'shoes');
    expect(doc.name).toBe('Nike Pegasus');
    expect(doc.max_km).toBeUndefined();
  });

  test('서버 시각(updatedAt)은 여기서 안 넣는다 — I/O 계층이 채운다', () => {
    const doc = toRecordDoc(run('r1'), 'runs');
    expect(doc.updatedAt).toBe(1000); // 원본 값이 그대로 실릴 뿐, 서버 센티널이 아니다
  });
});

describe('selectDirty — 무엇을 올릴 것인가', () => {
  test('마커가 없으면 전부 올린다(첫 이행)', () => {
    const recs = [run('a'), run('b'), run('c')];
    expect(selectDirty(recs, {}).map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  test('편집 시각이 같으면 건너뛴다', () => {
    const recs = [run('a', 100), run('b', 200)];
    expect(selectDirty(recs, {a: 100, b: 200})).toHaveLength(0);
  });

  test('편집 시각이 다르면 올린다 — 뒤로 간 경우도 포함(덜 올리는 게 더 위험)', () => {
    const recs = [run('a', 100), run('b', 50)];
    expect(selectDirty(recs, {a: 200, b: 200}).map(r => r.id)).toEqual(['a', 'b']);
  });

  test('id 없는 레코드는 제외한다(문서를 만들 수 없다)', () => {
    expect(selectDirty([{updatedAt: 1} as any, run('a')], {}).map((r: any) => r.id)).toEqual(['a']);
  });

  test('같은 id 가 두 번 오면 앞엣것만(라이브 + 묘비 동시 존재 방어)', () => {
    const recs = [run('a', 100), run('a', 200, {deleted: true})];
    const out = selectDirty(recs, {});
    expect(out).toHaveLength(1);
    expect(editedAtOf(out[0])).toBe(100);
  });

  test('묘비도 올린다 — 삭제가 전파되려면 문서로 가야 한다', () => {
    const recs = [run('a', 300, {deleted: true})];
    expect(selectDirty(recs, {}).map(r => r.id)).toEqual(['a']);
  });
});

describe('마커 관리', () => {
  test('성공한 것만 마커에 반영한다(비파괴)', () => {
    const prev = {a: 1};
    const next = nextMarkers(prev, [run('b', 222)]);
    expect(next).toEqual({a: 1, b: 222});
    expect(prev).toEqual({a: 1}); // 원본 불변
  });

  test('사라진 레코드의 마커는 치운다 — 안 치우면 로컬에 영구 누적된다', () => {
    const markers = {a: 1, b: 2, c: 3};
    expect(pruneMarkers(markers, [run('a'), run('c')])).toEqual({a: 1, c: 3});
  });

  test('현재 레코드가 없으면 마커도 비운다', () => {
    expect(pruneMarkers({a: 1}, [])).toEqual({});
  });
});

describe('chunk — 배치 상한', () => {
  test('기본 상한으로 자른다', () => {
    const arr = Array.from({length: BATCH_LIMIT * 2 + 5}, (_, i) => i);
    const parts = chunk(arr);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(BATCH_LIMIT);
    expect(parts[2]).toHaveLength(5);
  });

  test('빈 배열은 빈 결과', () => {
    expect(chunk([])).toEqual([]);
  });

  test('이상한 크기는 기본값으로', () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
    expect(chunk([1, 2, 3], -1)).toEqual([[1, 2, 3]]);
  });
});

describe('diffRecordIds — 1단계 안전장치', () => {
  test('일치하면 전부 빈 배열', () => {
    const blob = [run('a', 100), run('b', 200)];
    const docs = [{id: 'a', editedAt: 100}, {id: 'b', editedAt: 200}];
    expect(diffRecordIds(blob, docs)).toEqual({missingInDocs: [], extraInDocs: [], staleInDocs: []});
  });

  test('문서에 없는 것을 잡는다 — 이행이 빠뜨린 경우', () => {
    const d = diffRecordIds([run('a'), run('b')], [{id: 'a', editedAt: 1000}]);
    expect(d.missingInDocs).toEqual(['b']);
  });

  test('문서에만 있는 것을 잡는다 — 덩어리에서 지웠는데 문서가 남은 경우', () => {
    const d = diffRecordIds([run('a')], [{id: 'a', editedAt: 1000}, {id: 'z', editedAt: 1}]);
    expect(d.extraInDocs).toEqual(['z']);
  });

  test('편집 시각이 어긋난 것을 잡는다 — 문서가 낡은 경우', () => {
    const d = diffRecordIds([run('a', 500)], [{id: 'a', editedAt: 100}]);
    expect(d.staleInDocs).toEqual(['a']);
  });
});

describe('컬렉션 이름', () => {
  test('경로 오타 방지를 위해 한 곳에 모은다', () => {
    expect(RECORD_COLLECTIONS).toEqual({runs: 'runs', shoes: 'shoes', medals: 'medals'});
  });
});

// ─── I/O 계층 ─────────────────────────────────────────────────────────────────
// 계약의 핵심은 하나다: **덩어리 쓰기는 이미 끝난 뒤에 부른다.** 그래서 여기서 뭐가
// 실패해도 데이터는 안전하고, 실패한 것은 마커를 안 올려 다음에 재시도된다.
describe('mirrorRecords — 이중 쓰기', () => {
  const makePort = () => {
    const calls: {collection: string; ids: string[]}[] = [];
    return {
      calls,
      pushRecords: jest.fn(async (collection: string, docs: any[]) => {
        calls.push({collection, ids: docs.map(d => d.id)});
      }),
    };
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('처음에는 전부 올린다', async () => {
    const port = makePort();
    const res = await mirrorRecords(port, {
      runs: [run('r1'), run('r2')],
      shoes: [{id: 's1', name: '페가수스', updatedAt: 5}],
      medals: [],
    });
    expect(res.pushed.runs).toBe(2);
    expect(res.pushed.shoes).toBe(1);
    expect(port.calls.map(c => c.collection).sort()).toEqual(['runs', 'shoes']);
  });

  test('두 번째부터는 바뀐 것만 올린다', async () => {
    const port = makePort();
    const before = [run('r1', 100), run('r2', 200)];
    await mirrorRecords(port, {runs: before});
    port.pushRecords.mockClear();

    await mirrorRecords(port, {runs: [run('r1', 100), run('r2', 999)]});
    expect(port.pushRecords).toHaveBeenCalledTimes(1);
    expect(port.pushRecords.mock.calls[0][1].map((d: any) => d.id)).toEqual(['r2']);
  });

  test('바뀐 게 없으면 아무것도 안 올린다', async () => {
    const port = makePort();
    const recs = [run('r1', 100)];
    await mirrorRecords(port, {runs: recs});
    port.pushRecords.mockClear();
    const res = await mirrorRecords(port, {runs: recs});
    expect(port.pushRecords).not.toHaveBeenCalled();
    expect(res.skipped).toBe(true);
  });

  test('한 종류가 실패해도 다른 종류는 올라간다 — 그리고 실패분은 재시도된다', async () => {
    const port = makePort();
    port.pushRecords.mockImplementation(async (collection: string) => {
      if (collection === 'runs') throw new Error('네트워크');
    });
    await mirrorRecords(port, {runs: [run('r1')], shoes: [{id: 's1', updatedAt: 1}]});

    // 실패한 runs 는 마커가 안 올라갔으므로 다음에 다시 시도된다.
    port.pushRecords.mockImplementation(async () => {});
    port.pushRecords.mockClear();
    await mirrorRecords(port, {runs: [run('r1')], shoes: [{id: 's1', updatedAt: 1}]});
    const collections = port.pushRecords.mock.calls.map((c: any[]) => c[0]);
    expect(collections).toContain('runs');
    expect(collections).not.toContain('shoes'); // 성공했던 건 다시 안 올린다
  });

  test('포트가 지원하지 않으면 조용히 건너뛴다(구 포트 호환)', async () => {
    const res = await mirrorRecords({}, {runs: [run('r1')]});
    expect(res.skipped).toBe(true);
    expect(res.pushed).toEqual({});
  });

  test('묘비도 문서로 올라간다 — 삭제 전파', async () => {
    const port = makePort();
    await mirrorRecords(port, {runs: [run('r1', 500, {deleted: true})]});
    const doc = port.pushRecords.mock.calls[0][1][0];
    expect(doc.id).toBe('r1');
    expect(doc.data.deleted).toBe(true);
    expect(doc.data.km).toBeUndefined(); // 껍데기
  });

  test('사라진 레코드의 마커는 정리된다', async () => {
    const port = makePort();
    await mirrorRecords(port, {runs: [run('r1'), run('r2')]});
    await mirrorRecords(port, {runs: [run('r1')]}); // r2 가 사라짐
    const markers = await loadMarkers();
    expect(Object.keys(markers.runs ?? {})).toEqual(['r1']);
  });

  test('마커가 손상되면 전부 다시 올린다 — 안전한 쪽', async () => {
    const port = makePort();
    await mirrorRecords(port, {runs: [run('r1')]});
    await AsyncStorage.setItem(MARKERS_KEY, '{망가진');
    port.pushRecords.mockClear();
    await mirrorRecords(port, {runs: [run('r1')]});
    expect(port.pushRecords).toHaveBeenCalled();
  });

  test('배치 상한을 넘으면 나눠 올린다', async () => {
    const port = makePort();
    const many = Array.from({length: BATCH_LIMIT + 10}, (_, i) => run(`r${i}`));
    const res = await mirrorRecords(port, {runs: many});
    expect(port.pushRecords).toHaveBeenCalledTimes(2);
    expect(res.pushed.runs).toBe(BATCH_LIMIT + 10);
  });
});

// ─── 2단계: 읽기 전환 ─────────────────────────────────────────────────────────
// 여기서 제일 무서운 건 두 가지다.
//   1) 조회가 비었을 때 화면의 기록이 사라지는 것 → 합집합이라 절대 안 사라져야 한다
//   2) 원격이 이겼을 때 로컬 경로가 날아가는 것 → 하위 문서엔 route 가 없으므로
//      그대로 덮으면 동기 한 번에 모든 지도가 사라진다
describe('fromRecordDoc — 문서 → 로컬 레코드', () => {
  test('editedAt 을 updatedAt 으로 되돌린다 — 기존 병합 로직이 그대로 동작하게', () => {
    const rec = fromRecordDoc('r1', {km: 10, editedAt: 777, updatedAt: 999999});
    expect(rec.id).toBe('r1');
    expect(rec.updatedAt).toBe(777); // 서버 시각(999999)이 아니라 편집 시각
  });

  test('서버 시각은 레코드에 싣지 않는다(커서 전용)', () => {
    const rec = fromRecordDoc('r1', {editedAt: 5, updatedAt: 12345});
    expect(rec.updatedAt).toBe(5);
  });

  test('편집 시각이 없으면 0', () => {
    expect(fromRecordDoc('r1', {km: 1}).updatedAt).toBe(0);
  });

  test('묘비 표식은 보존한다', () => {
    expect(fromRecordDoc('r1', {deleted: true, editedAt: 9}).deleted).toBe(true);
  });
});

describe('mergePulled — 합집합 병합', () => {
  const L = (id: string, updatedAt: number, over: Record<string, unknown> = {}): Record<string, unknown> =>
    ({id, km: 10, updatedAt, ...over});

  test('조회가 비면 로컬을 그대로 돌려준다(참조 동일) — 화면이 안 비워진다', () => {
    const local = [L('a', 100)];
    expect(mergePulled(local, [])).toBe(local);
  });

  test('원격에만 있는 것은 더한다(다른 기기에서 만든 러닝)', () => {
    const out = mergePulled([L('a', 100)], [L('b', 200)]);
    expect(out.map(r => r.id).sort()).toEqual(['a', 'b']);
  });

  test('로컬에만 있는 것은 지킨다(아직 안 올라간 러닝)', () => {
    const out = mergePulled([L('a', 100)], [L('b', 200)]);
    expect(out.find(r => r.id === 'a')).toBeTruthy();
  });

  test('충돌은 편집 시각이 큰 쪽', () => {
    const out = mergePulled([L('a', 100, {km: 1})], [L('a', 200, {km: 2})]);
    expect(out[0].km).toBe(2);
    const out2 = mergePulled([L('a', 300, {km: 1})], [L('a', 200, {km: 2})]);
    expect(out2[0].km).toBe(1);
  });

  test('동률이면 삭제가 이긴다 — 부활 방지', () => {
    const out = mergePulled([L('a', 100)], [L('a', 100, {deleted: true})]);
    expect(out[0].deleted).toBe(true);
  });

  // ── 경로 유실 방어 ────────────────────────────────────────────────────────
  test('원격이 이겨도 로컬 경로는 지킨다 — 하위 문서엔 route 가 없다', () => {
    const local = [L('a', 100, {route: '[{"lat":37.5,"lon":127}]'})];
    const out = mergePulled(local, [L('a', 200, {km: 99})]);
    expect(out[0].km).toBe(99); // 원격이 이겼고
    expect(out[0].route).toContain('37.5'); // 경로는 살아남았다
  });

  test('원격에 경로가 있으면 그걸 쓴다', () => {
    const out = mergePulled([L('a', 100, {route: 'old'})], [L('a', 200, {route: 'new'})]);
    expect(out[0].route).toBe('new');
  });

  test('묘비로 덮일 땐 경로를 살리지 않는다 — 지운 런의 경로를 되살리면 안 된다', () => {
    const out = mergePulled([L('a', 100, {route: 'x'})], [L('a', 200, {deleted: true})]);
    expect(out[0].deleted).toBe(true);
    expect(out[0].route).toBeUndefined();
  });

  test('로컬 순서를 지키고 새 것은 뒤에 붙인다', () => {
    const out = mergePulled([L('a', 1), L('b', 1)], [L('z', 1)]);
    expect(out.map(r => r.id)).toEqual(['a', 'b', 'z']);
  });

  test('id 없는 로컬 레코드도 버리지 않는다', () => {
    const out = mergePulled([{updatedAt: 1} as any, L('a', 1)], [L('b', 1)]);
    expect(out).toHaveLength(3);
  });
});

describe('pullRecords — 델타 조회', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  const makeReadPort = (pages: Record<string, {docs: any[]; maxUpdatedAtMs: number}[]>) => {
    const idx: Record<string, number> = {};
    return {
      listRecords: jest.fn(async (collection: string) => {
        const i = idx[collection] ?? 0;
        idx[collection] = i + 1;
        return pages[collection]?.[i] ?? {docs: [], maxUpdatedAtMs: 0};
      }),
    };
  };

  test('처음엔 커서 없이 조회한다(전량)', async () => {
    const port = makeReadPort({runs: [{docs: [{id: 'r1', data: {editedAt: 5}}], maxUpdatedAtMs: 100}]});
    await pullRecords(port);
    expect(port.listRecords).toHaveBeenCalledWith('runs', null, PULL_PAGE);
  });

  test('두 번째부터는 커서 이후만 조회한다', async () => {
    const port = makeReadPort({runs: [{docs: [{id: 'r1', data: {editedAt: 5}}], maxUpdatedAtMs: 100}]});
    await pullRecords(port);
    port.listRecords.mockClear();
    port.listRecords.mockResolvedValue({docs: [], maxUpdatedAtMs: 100});
    await pullRecords(port);
    expect(port.listRecords).toHaveBeenCalledWith('runs', 100, PULL_PAGE);
  });

  test('받은 문서를 로컬 레코드 모양으로 돌려준다', async () => {
    const port = makeReadPort({
      runs: [{docs: [{id: 'r1', data: {km: 7, editedAt: 5}}], maxUpdatedAtMs: 100}],
    });
    const res = await pullRecords(port);
    expect(res.records.runs?.[0]).toMatchObject({id: 'r1', km: 7, updatedAt: 5});
  });

  test('한 컬렉션이 실패해도 커서를 안 올려 다음에 다시 받는다', async () => {
    const port = {
      listRecords: jest.fn(async (collection: string) => {
        if (collection === 'runs') throw new Error('오프라인');
        return {docs: [], maxUpdatedAtMs: 50};
      }),
    };
    await pullRecords(port);
    const cursors = await loadCursors();
    expect(cursors.runs).toBeUndefined(); // 실패 — 전진 안 함
  });

  test('포트가 조회를 지원 안 하면 조용히 건너뛴다', async () => {
    const res = await pullRecords({});
    expect(res.skipped).toBe(true);
    expect(res.records).toEqual({});
  });

  test('페이지가 가득 차면 이어서 받는다', async () => {
    const full = Array.from({length: PULL_PAGE}, (_, i) => ({id: `r${i}`, data: {editedAt: i + 1}}));
    const port = makeReadPort({
      runs: [
        {docs: full, maxUpdatedAtMs: 500},
        {docs: [{id: 'last', data: {editedAt: 9}}], maxUpdatedAtMs: 900},
      ],
    });
    const res = await pullRecords(port);
    expect(res.records.runs).toHaveLength(PULL_PAGE + 1);
    expect((await loadCursors()).runs).toBe(900);
  });

  test('커서가 안 움직이면 멈춘다 — 같은 페이지 무한 반복 방지', async () => {
    const full = Array.from({length: PULL_PAGE}, (_, i) => ({id: `r${i}`, data: {editedAt: 1}}));
    const port = {
      listRecords: jest.fn(async () => ({docs: full, maxUpdatedAtMs: 0})),
    };
    await pullRecords(port);
    // runs·shoes·medals 각 1회씩만(무한 루프 없음)
    expect(port.listRecords).toHaveBeenCalledTimes(3);
  });
});
