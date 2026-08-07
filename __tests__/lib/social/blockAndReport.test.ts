/**
 * 신고·차단(App Store 1.2 · UGC) — 순수 계약.
 *
 * 2026-08-03 에 공개 프로필·월간 랭킹을 열면서 이 앱에 **다른 사람이 만든 콘텐츠**가
 * 화면에 뜨기 시작했다. 심사지침 1.2 는 그런 앱에 신고·차단·조치를 함께 요구한다.
 *
 * 이 스위트가 고정하는 것은 기능뿐 아니라 **하면 안 되는 것**이다.
 *  · 차단은 서버에 저장하지 않는다 → 여기 검사는 전부 로컬 목록 조작이다.
 *  · 신고에 자유 입력 텍스트를 넣지 않는다 → 사유는 아는 값만 통과한다.
 *  · 저장이 실패해도 화면은 즉시 반영된다 → 차단을 눌렀는데 안 바뀌면 고장으로 읽힌다.
 * @format
 */
import {
  parseBlocked, withBlocked, withoutBlocked, filterBlocked,
  loadBlocked, blockUid, unblockUid, MAX_BLOCKED, BLOCKED_UIDS_KEY,
} from '../../../lib/social/blockList';
import {
  buildReport, submitReport, isReportReason, REPORT_REASONS, REPORT_REASON_LABEL,
} from '../../../lib/social/report';

function memStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    async getItem(k: string) { return map.get(k) ?? null; },
    async setItem(k: string, v: string) { map.set(k, v); },
  };
}
const failingStorage = {
  async getItem() { throw new Error('io'); },
  async setItem() { throw new Error('io'); },
};

describe('차단 목록', () => {
  test('손상된 저장값에도 죽지 않고 빈 목록으로 떨어진다', () => {
    expect(parseBlocked(null)).toEqual([]);
    expect(parseBlocked('{')).toEqual([]);
    expect(parseBlocked('{"a":1}')).toEqual([]);
    // 타입 오염·중복·공백 제거 + **구버전(문자열) 형식 호환**
    expect(parseBlocked('[1,2,{"x":1},"  ","u1","u1"]')).toEqual([{uid: 'u1'}]);
    expect(parseBlocked('[{"uid":"u2","name":"지나"}]')).toEqual([{uid: 'u2', name: '지나'}]);
  });

  test('차단은 멱등이고 순서를 흔들지 않는다', () => {
    const a = withBlocked([{uid: 'u1'}], 'u2', '지나');
    expect(a).toEqual([{uid: 'u1'}, {uid: 'u2', name: '지나'}]);
    expect(withBlocked(a, 'u1')).toEqual(a);        // 이미 있으면 그대로
    expect(withBlocked(a, '   ')).toEqual(a);       // 빈 uid 는 무시
  });

  test('이미 차단한 사람을 다시 차단하면 이름만 갱신되고 자리는 그대로다', () => {
    const a = [{uid: 'u1', name: '옛이름'}, {uid: 'u2'}];
    const b = withBlocked(a, 'u1', '새이름');
    expect(b).toEqual([{uid: 'u1', name: '새이름'}, {uid: 'u2'}]);
  });

  test('상한을 넘으면 오래된 것부터 밀어낸다 — 백업 문서를 갉아먹지 않는다', () => {
    let list = [] as ReturnType<typeof withBlocked>;
    for (let i = 0; i < MAX_BLOCKED + 10; i++) list = withBlocked(list, `u${i}`);
    const uids = list.map(x => x.uid);
    expect(list.length).toBe(MAX_BLOCKED);
    expect(uids.includes('u0')).toBe(false);       // 가장 오래된 것이 빠졌다
    expect(uids.includes(`u${MAX_BLOCKED + 9}`)).toBe(true); // 최근 것은 남는다
  });

  test('차단 해제', () => {
    expect(withoutBlocked([{uid: 'u1'}, {uid: 'u2'}], 'u1')).toEqual([{uid: 'u2'}]);
    expect(withoutBlocked([{uid: 'u1'}], 'zzz')).toEqual([{uid: 'u1'}]);
  });

  test('걸러내기는 한 함수로 — 한 화면만 거르면 다른 화면에서 튀어나온다', () => {
    const rows = [{uid: 'u1'}, {uid: 'u2'}, {uid: 'u3'}, {nickname: '익명'} as any];
    expect(filterBlocked(rows, [{uid: 'u2'}]).map(r => (r as any).uid)).toEqual(['u1', 'u3', undefined]);
    expect(filterBlocked(rows, []).length).toBe(rows.length); // 차단 0이면 그대로
  });

  test('저장이 실패해도 새 목록을 그대로 돌려준다 — 화면은 즉시 반영돼야 한다', async () => {
    const next = await blockUid(failingStorage as any, [{uid: 'u1'}], 'u2');
    expect(next).toEqual([{uid: 'u1'}, {uid: 'u2'}]);
    const back = await unblockUid(failingStorage as any, next, 'u1');
    expect(back).toEqual([{uid: 'u2'}]);
  });

  test('읽기 실패는 빈 목록으로 — 던지지 않는다', async () => {
    await expect(loadBlocked(failingStorage as any)).resolves.toEqual([]);
  });

  test('저장 왕복', async () => {
    const s = memStorage();
    const next = await blockUid(s, [], 'u9', '지나');
    expect(JSON.parse(s.map.get(BLOCKED_UIDS_KEY)!)).toEqual([{uid: 'u9', name: '지나'}]);
    expect(await loadBlocked(s)).toEqual(next);
  });

  test('키가 계정별 저장소 분류에 등록돼 있다 — 안 하면 계정 전환에 섞인다', () => {
    const {USER_KEYS} = require('../../../lib/accountScope');
    expect(USER_KEYS).toContain(BLOCKED_UIDS_KEY);
  });
});

describe('신고', () => {
  test('사유는 아는 값만 — 자유 입력 텍스트를 받지 않는다', () => {
    for (const r of REPORT_REASONS) {
      expect(isReportReason(r)).toBe(true);
      expect(REPORT_REASON_LABEL[r]).toBeTruthy(); // 화면에 쓸 한국어 라벨이 있다
    }
    expect(isReportReason('아무말')).toBe(false);
    expect(buildReport({targetUid: 'a', reporterUid: 'b', reason: '아무말', nowMs: 1})).toBeNull();
  });

  test('문서 필드는 규칙 화이트리스트와 정확히 같다 — 어긋나면 서버가 조용히 거부한다', () => {
    const p = buildReport({targetUid: 'a', reporterUid: 'b', reason: 'spam', nowMs: 1700000000000});
    expect(p).not.toBeNull();
    expect(Object.keys(p!).sort()).toEqual(['createdAt', 'reason', 'reporterUid', 'targetUid']);
  });

  test('자기 자신·빈 uid·잘못된 시각은 만들지 않는다', () => {
    expect(buildReport({targetUid: 'a', reporterUid: 'a', reason: 'spam', nowMs: 1})).toBeNull();
    expect(buildReport({targetUid: '', reporterUid: 'b', reason: 'spam', nowMs: 1})).toBeNull();
    expect(buildReport({targetUid: 'a', reporterUid: '', reason: 'spam', nowMs: 1})).toBeNull();
    expect(buildReport({targetUid: 'a', reporterUid: 'b', reason: 'spam', nowMs: NaN})).toBeNull();
  });

  test('전송 실패해도 접수로 답한다 — 오프라인 큐가 나중에 올린다', async () => {
    const port = {createReport: async () => { throw new Error('offline'); }};
    await expect(submitReport(port, {targetUid: 'a', reporterUid: 'b', reason: 'spam', nowMs: 1})).resolves.toBe(true);
  });

  test('보낼 수 없는 입력은 false — 화면이 "접수됐다"고 거짓말하지 않는다', async () => {
    const port = {createReport: jest.fn(async () => {})};
    await expect(submitReport(port, {targetUid: 'a', reporterUid: 'a', reason: 'spam', nowMs: 1})).resolves.toBe(false);
    expect(port.createReport).not.toHaveBeenCalled();
  });

  test('정상 입력은 포트로 그대로 나간다', async () => {
    const sent: any[] = [];
    const port = {createReport: async (p: any) => { sent.push(p); }};
    await submitReport(port, {targetUid: 'a', reporterUid: 'b', reason: 'impersonation', nowMs: 1700000000000});
    expect(sent).toEqual([{targetUid: 'a', reporterUid: 'b', reason: 'impersonation', createdAt: 1700000000000}]);
  });

  test('규칙 파일이 같은 사유 목록·같은 필드를 강제한다 — 코드와 서버가 갈라지면 조용히 거부된다', () => {
    const rules = require('fs').readFileSync(require('path').join(__dirname, '../../../firestore.rules'), 'utf8');
    expect(rules).toContain("match /reports/{docId}");
    expect(rules).toContain("hasOnly(['targetUid', 'reporterUid', 'reason', 'createdAt'])");
    for (const r of REPORT_REASONS) expect(rules).toContain(`'${r}'`);
    // 사칭 방지 — 남의 이름으로 신고할 수 없다
    expect(rules).toContain('request.resource.data.reporterUid == request.auth.uid');
  });
});
