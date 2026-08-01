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
