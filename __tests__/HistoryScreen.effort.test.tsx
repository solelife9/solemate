/**
 * 런 상세 트레이닝 부하(Relative Effort) 카드 — UI 노출 통합 테스트.
 *
 * '이 러닝이 얼마나 힘들었나'를 점수+라벨로 노출한다. 심박(안정심박 有)이면 TRIMP,
 * 아니면 체력(VDOT→임계페이스) 대비 페이스 기반 rTSS. 산출 불가(타임·체력 없음)면 숨김.
 * 부하 산식은 lib/analytics/load 단위테스트가 담당 — 여기선 노출 조건만 본다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HistoryScreen from '../HistoryScreen.rn';

const SHOE = {id: 's1', brand: 'NIKE', model: 'Pegasus 41', km: 0, max_km: 800, start_km: 0} as any;
const now = new Date();
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
// 5km 25:00 노력 런(VDOT 산출 → 임계페이스 → 페이스 기반 부하 가능).
const RUN = (id: string, durationS: number) =>
  ({id, date: '수', day: '수', dateNum: '10', run_date: TODAY,
    dist: 5, durationS, pace: "5'00\"", time: '25:00', shoe: 0, cal: 0, cadence: 0, bpm: 0, elev: 0} as any);
const HR = [
  {t: 0, bpm: 120}, {t: 60, bpm: 145}, {t: 120, bpm: 155}, {t: 180, bpm: 160}, {t: 240, bpm: 160},
];

async function flush() { await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); }); }
function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}
async function openDetail(root: ReactTestRenderer.ReactTestInstance) {
  const hits = root.findAll((n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes('Pegasus 41'));
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  await act(async () => { hits[0].props.onPress(); });
  await flush();
}
async function renderDetail(run: any, props: any, hr?: unknown) {
  if (hr) await AsyncStorage.setItem('hrTrack_' + run.id, JSON.stringify(hr));
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={[run]} unit="km" {...props} />);
  });
  await flush();
  await openDetail(r.root);
  return r.root;
}

describe('HistoryScreen RunDetail — 트레이닝 부하', () => {
  afterEach(async () => { await AsyncStorage.clear(); });

  test('타임 있는 노력 런 → 페이스 기반 부하 카드가 뜬다', async () => {
    const txt = textOf(await renderDetail(RUN('r1', 25 * 60), {}));
    expect(txt).toContain('트레이닝 부하');
    expect(txt).toContain('페이스 기반');
  });

  test('심박(안정심박 有) → TRIMP 기반 부하로 노출', async () => {
    const txt = textOf(await renderDetail(RUN('r1', 25 * 60), {age: 30, sex: 'male', restHR: 50}, HR));
    expect(txt).toContain('트레이닝 부하');
    expect(txt).toContain('심박 기반');
  });

  test('타임 없는 런(부하 산출 불가) → 카드 숨김', async () => {
    const txt = textOf(await renderDetail(RUN('r1', 0), {}));
    expect(txt).not.toContain('트레이닝 부하');
  });
});
