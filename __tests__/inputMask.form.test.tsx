/**
 * 입력 마스킹 & 인라인 검증 메시지 — 순수 함수 + 화면 행동 테스트.
 *
 * 네이티브 date/time 피커 없이(JS-only) 숫자만 받아 자동으로 콜론/하이픈을 끼우는
 * 마스킹과, 제출 시 Alert 대신 필드 아래 빨강 인라인 헬퍼텍스트로 검증 메시지를
 * 띄우는 동작을 관찰 가능한 결과로만 단언한다:
 *
 *   [순수] maskDuration: 숫자→'MM:SS', maskDate: 숫자→'YYYY-MM-DD',
 *          validateRunForm / validateMaxKm: 비정상값 메시지.
 *   [RunForm] 시간/날짜 입력이 마스킹된 값으로 렌더된다. 거리 0/빈값/잘못된 날짜로
 *             제출하면 onAddRun이 호출되지 않고 해당 필드 아래 빨강 메시지가 뜬다.
 *             올바른 값이면 onAddRun이 km과 함께 호출된다.
 *   [AddShoe] maxKm 0으로 등록을 누르면 onSave가 호출되지 않고 인라인 메시지가 뜬다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TextInput} from 'react-native';
import {RunForm} from '../HistoryScreen.rn';
import AddShoeScreen from '../AddShoeScreen.rn';
import {Shoe} from '../theme';
import {
  maskDuration,
  maskDate,
  isValidYmd,
  validateRunForm,
  validateMaxKm,
} from '../lib/inputMask';

// ── pure: masking ───────────────────────────────────────────────────────────
describe('maskDuration — 숫자만 받아 MM:SS', () => {
  test('마지막 두 자리를 초로 보고 콜론을 끼운다', () => {
    expect(maskDuration('5')).toBe('5');
    expect(maskDuration('53')).toBe('53');
    expect(maskDuration('530')).toBe('5:30');
    expect(maskDuration('3000')).toBe('30:00');
  });
  test('숫자 외 문자는 무시하고 4자리로 자른다', () => {
    expect(maskDuration('30:00')).toBe('30:00');
    expect(maskDuration('ab12cd34ef')).toBe('12:34');
    expect(maskDuration('')).toBe('');
  });
});

describe('maskDate — 숫자만 받아 YYYY-MM-DD', () => {
  test('연/월/일 경계마다 하이픈을 끼운다', () => {
    expect(maskDate('2026')).toBe('2026');
    expect(maskDate('202606')).toBe('2026-06');
    expect(maskDate('20260615')).toBe('2026-06-15');
  });
  test('이미 하이픈이 있어도 숫자만 재조립하고 8자리로 자른다', () => {
    expect(maskDate('2026-06-15')).toBe('2026-06-15');
    expect(maskDate('202606159999')).toBe('2026-06-15');
  });
});

describe('isValidYmd / validate*', () => {
  test('isValidYmd는 달력상 실제 날짜만 통과', () => {
    expect(isValidYmd('2026-06-15')).toBe(true);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('2026-02-29')).toBe(false); // 비윤년 2/29
    expect(isValidYmd('2026-6-1')).toBe(false);
  });
  test('validateRunForm은 신발·거리·날짜 필드별 메시지를 준다', () => {
    expect(validateRunForm({shoeId: undefined, dist: '5', date: '2026-06-15'}).shoe).toBeTruthy();
    expect(validateRunForm({shoeId: 's1', dist: '0', date: '2026-06-15'}).dist).toBeTruthy();
    expect(validateRunForm({shoeId: 's1', dist: '', date: '2026-06-15'}).dist).toBeTruthy();
    expect(validateRunForm({shoeId: 's1', dist: '5', date: '2026-13-40'}).date).toBeTruthy();
    expect(validateRunForm({shoeId: 's1', dist: '5', date: '2026-06-15'})).toEqual({});
  });
  test('validateMaxKm은 0/음수/비정상값을 차단한다', () => {
    expect(validateMaxKm(0)).toBeTruthy();
    expect(validateMaxKm(-10)).toBeTruthy();
    expect(validateMaxKm(NaN)).toBeTruthy();
    expect(validateMaxKm(600)).toBeUndefined();
  });
});

// ── helpers (component) ──────────────────────────────────────────────────────
function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}
function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
async function flush() {
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
}
function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  );
  if (!hits.length) throw new Error(`no pressable with label "${label}"`);
  return hits[0];
}
async function tap(root: ReactTestRenderer.ReactTestInstance, label: string) {
  await act(async () => { pressByLabel(root, label).props.onPress(); });
  await flush();
}
async function tapText(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll((n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle));
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  await act(async () => { hits[0].props.onPress(); });
  await flush();
}
function inputByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll((n: any) => n.type === TextInput && n.props.accessibilityLabel === label);
  if (!hits.length) throw new Error(`no TextInput labeled "${label}"`);
  return hits[0];
}
async function setInput(root: ReactTestRenderer.ReactTestInstance, label: string, value: string) {
  await act(async () => { inputByLabel(root, label).props.onChangeText(value); });
  await flush();
}

const SHOES: Shoe[] = [{id: 's1', brand: 'Nike', model: 'Pegasus', used: 100, max: 700, condition: '양호'}];

// 수동 추가 UI 진입점({mode:'add'} setForm)은 제거되었고, 공용 RunForm(초기값 null=추가)이
// 추가 폼의 마스킹·검증·제출 동작을 그대로 보유한다. RunForm을 직접 렌더해 검증한다.
// onAddRun(가변 인자) 콜백은 onSubmit({shoeId,km,date,durationSec,surface}) 객체로 바뀌었다.
function addForm(onSubmit: (v: any) => void) {
  return render(
    <RunForm shoes={SHOES} unit="km" initial={null} onCancel={() => {}} onSubmit={onSubmit} />,
  ).root;
}

// ── RunForm: masking renders ─────────────────────────────────────────────────
describe('RunForm — 입력 마스킹(화면)', () => {
  test('시간 칸에 "3000"을 넣으면 "30:00"으로 마스킹돼 렌더된다', async () => {
    const root = addForm(() => {});
    await setInput(root, '시간', '3000');
    expect(inputByLabel(root, '시간').props.value).toBe('30:00');
  });

  test('날짜 칸에 "20260615"를 넣으면 "2026-06-15"로 하이픈이 끼워진다', async () => {
    const root = addForm(() => {});
    await setInput(root, '날짜', '20260615');
    expect(inputByLabel(root, '날짜').props.value).toBe('2026-06-15');
  });
});

// ── RunForm: inline validation messages (no Alert) ───────────────────────────
describe('RunForm — 인라인 검증 메시지(화면)', () => {
  test('거리 0으로 추가하면 onSubmit 미호출 + 거리 아래 빨강 메시지가 뜬다', async () => {
    const onSubmit = jest.fn();
    const root = addForm(onSubmit);

    await setInput(root, '거리', '0');
    await tapText(root, '추가하기');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textOf(root)).toContain('거리를 0보다 크게 입력하세요');
  });

  test('잘못된 날짜로 추가하면 onSubmit 미호출 + 날짜 아래 빨강 메시지가 뜬다', async () => {
    const onSubmit = jest.fn();
    const root = addForm(onSubmit);

    await setInput(root, '거리', '5');
    // 마스킹상 13월 40일은 형식은 맞아도 달력상 무효 → 인라인 차단.
    await setInput(root, '날짜', '20261340');
    await tapText(root, '추가하기');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textOf(root)).toContain('날짜를 YYYY-MM-DD 형식으로 정확히 입력하세요');
  });

  test('필드를 다시 건드리면 그 필드의 에러가 사라진다', async () => {
    const root = addForm(() => {});

    await setInput(root, '거리', '0');
    await tapText(root, '추가하기');
    expect(textOf(root)).toContain('거리를 0보다 크게 입력하세요');

    await setInput(root, '거리', '5');
    expect(textOf(root)).not.toContain('거리를 0보다 크게 입력하세요');
  });

  test('올바른 값이면 onSubmit이 km과 함께 호출된다', async () => {
    const onSubmit = jest.fn();
    const root = addForm(onSubmit);

    await setInput(root, '거리', '7');
    await setInput(root, '시간', '3000');
    await setInput(root, '날짜', '20260615');
    await tapText(root, '추가하기');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const v = onSubmit.mock.calls[0][0];
    expect(v.shoeId).toBe('s1');          // shoeId
    expect(v.km).toBe(7);                 // km
    expect(v.date).toBe('2026-06-15');    // date
    expect(v.durationSec).toBe(30 * 60);  // durationSec (30:00)
  });
});

// ── AddShoeScreen: maxKm 0 inline block ──────────────────────────────────────
describe('AddShoeScreen — maxKm 0 인라인 차단(화면)', () => {
  async function mount(onSave: (s: Shoe) => void) {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { r = ReactTestRenderer.create(<AddShoeScreen onSave={onSave} />); });
    await flush();
    return r.root;
  }
  // 모델 선택 모달을 열고 첫 추천을 골라 유효 상태로 만든다.
  async function pickFirstModel(root: ReactTestRenderer.ReactTestInstance) {
    await tap(root, '모델 선택');
    const sug = root.findAll(
      (n: any) => n && n.props && typeof n.props.onPress === 'function' &&
        typeof n.props.accessibilityLabel === 'string' && /\dkm$/.test(textOf(n)) &&
        !n.props.accessibilityLabel.startsWith('직접 추가'),
    )[0];
    await act(async () => { sug.props.onPress(); });
    await flush();
  }

  test('모델은 골랐지만 교체 권장 거리를 0으로 두면 등록이 막히고 인라인 메시지가 뜬다', async () => {
    const onSave = jest.fn();
    const root = await mount(onSave);

    await pickFirstModel(root);
    await setInput(root, '교체 권장 거리', '0'); // 비정상값
    await tapText(root, '러닝화 등록');

    expect(onSave).not.toHaveBeenCalled();
    expect(textOf(root)).toContain('교체 권장 거리를 0보다 크게 입력하세요');
  });

  test('권장 거리를 정상값으로 고치면 등록이 통과한다', async () => {
    const onSave = jest.fn();
    const root = await mount(onSave);

    await pickFirstModel(root);
    await setInput(root, '교체 권장 거리', '0');
    await tapText(root, '러닝화 등록');
    expect(onSave).not.toHaveBeenCalled();

    await setInput(root, '교체 권장 거리', '600');
    await tapText(root, '러닝화 등록');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({max: 600});
  });
});
