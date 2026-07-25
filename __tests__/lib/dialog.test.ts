// lib/dialog store 계약 — A안 다이얼로그(2026-07-25)의 순수 로직 테스트.
// UI(DialogHost) 없이 store 단독으로 표시/버튼/취소 시맨틱을 고정한다.
import {
  showDialog,
  getCurrentDialog,
  subscribeDialog,
  pressDialogButton,
  cancelDialog,
  dismissDialog,
} from '../../lib/dialog';

afterEach(() => {
  dismissDialog(); // 테스트 격리 — 잔여 다이얼로그 정리
});

describe('lib/dialog — A안 다이얼로그 store', () => {
  test('showDialog: 기본 버튼은 확인 1개, 구독자에 즉시 통지된다', () => {
    const seen: (string | null)[] = [];
    const unsub = subscribeDialog(d => seen.push(d ? d.title : null));
    const id = showDialog('기록 삭제');
    expect(id).toBeGreaterThan(0);
    const cur = getCurrentDialog();
    expect(cur?.title).toBe('기록 삭제');
    expect(cur?.buttons).toEqual([{text: '확인'}]);
    // 구독 즉시 1회(null) + show 1회
    expect(seen).toEqual([null, '기록 삭제']);
    unsub();
  });

  test('빈 타이틀은 무시(-1)·표시 없음', () => {
    expect(showDialog('  ')).toBe(-1);
    expect(getCurrentDialog()).toBeNull();
  });

  test('pressDialogButton: 닫힌 뒤 onPress 호출, 던져도 삼킨다(graceful)', () => {
    const order: string[] = [];
    showDialog('삭제', '정말요?', [
      {text: '취소', style: 'cancel', onPress: () => order.push('cancel')},
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          order.push('delete');
          expect(getCurrentDialog()).toBeNull(); // 콜백 시점에 이미 닫혀 있다
          throw new Error('boom'); // 삼켜져야 한다
        },
      },
    ]);
    expect(() => pressDialogButton(1)).not.toThrow();
    expect(order).toEqual(['delete']);
    expect(getCurrentDialog()).toBeNull();
  });

  test('cancelDialog: cancel 버튼이 있으면 그것을 실행, 없으면 유지(명시적 선택 강제)', () => {
    let cancelled = 0;
    showDialog('확인만', undefined, [{text: '확인'}]);
    cancelDialog(); // cancel 없음 → 그대로 열려 있음
    expect(getCurrentDialog()?.title).toBe('확인만');
    dismissDialog();

    showDialog('삭제', undefined, [
      {text: '취소', style: 'cancel', onPress: () => { cancelled += 1; }},
      {text: '삭제', style: 'destructive'},
    ]);
    cancelDialog();
    expect(cancelled).toBe(1);
    expect(getCurrentDialog()).toBeNull();
  });

  test('표시 중 새 showDialog 는 대체한다(last-wins)', () => {
    showDialog('첫째');
    showDialog('둘째');
    expect(getCurrentDialog()?.title).toBe('둘째');
  });

  test('dismissDialog: onPress 없이 조용히 닫는다', () => {
    let pressed = 0;
    showDialog('청소', undefined, [{text: '확인', onPress: () => { pressed += 1; }}]);
    dismissDialog();
    expect(pressed).toBe(0);
    expect(getCurrentDialog()).toBeNull();
  });
});
