/**
 * 런 상세 심박 존 카드 — UI 노출 통합 테스트.
 *
 * hrTrack_<id>(워치 심박 시계열)가 있으면 RunDetail 이 '심박 존' 카드(존별 구간시간 +
 * 평균/최대 + 트레이닝효과)를 보여주고, 없으면 숨긴다. 존 산식은 lib/analytics/hrZones
 * 단위테스트가 담당 — 여기선 '화면에 뜨는가 + 신체지표가 반영되는가'만 본다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HistoryScreen from '../HistoryScreen.rn';

const SHOE = {id: 's1', brand: 'NIKE', model: 'Pegasus 41', km: 0, max_km: 800, start_km: 0} as any;
const THIS_MONTH = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-10`; })();
const RUN = (id: string) =>
  ({id, date: '5월 28일', day: '수', dateNum: '28', run_date: THIS_MONTH,
    dist: 5, durationS: 1800, pace: "6'00\"", time: '30:00', shoe: 0, cal: 0, cadence: 0, bpm: 0, elev: 0} as any);

// 나이 30(최대심박 Tanaka=187), 안정심박 50 → Karvonen. 존을 넘나드는 심박 시계열.
const HR = [
  {t: 0, bpm: 120}, {t: 60, bpm: 140}, {t: 120, bpm: 150}, {t: 180, bpm: 165}, {t: 240, bpm: 165},
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
async function openDetail(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll((n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle));
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  await act(async () => { hits[0].props.onPress(); });
  await flush();
}
async function renderDetail(props: any, hrKey?: string, hrVal?: unknown) {
  if (hrKey) await AsyncStorage.setItem(hrKey, JSON.stringify(hrVal));
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={[RUN('r1')]} unit="km" {...props} />);
  });
  await flush();
  await openDetail(r.root, 'Pegasus 41');
  return r.root;
}

describe('HistoryScreen RunDetail — 심박 존', () => {
  afterEach(async () => { await AsyncStorage.clear(); });

  test('hrTrack 이 있으면 심박 존 카드(존·평균/최대·트레이닝효과)가 뜬다', async () => {
    const root = await renderDetail({age: 30, sex: 'male', restHR: 50}, 'hrTrack_r1', HR);
    const txt = textOf(root);
    expect(txt).toContain('심박 존');
    expect(txt).toContain('평균');           // 평균/최대 심박 행
    expect(txt).toContain('148');            // 평균 (120+140+150+165+165)/5
    expect(txt).toContain('회복');           // Z1 라벨
    expect(txt).toContain('무산소');         // Z5 라벨(항상 렌더)
    // 부하(TRIMP)는 중복 방지로 별도 '트레이닝 부하' 카드가 담당 — 심박 있으면 심박 기반으로.
    expect(txt).toContain('트레이닝 부하');
    expect(txt).toContain('심박 기반');
  });

  test('안정심박 미설정이면 심박 존 정확도 안내 노출', async () => {
    const root = await renderDetail({age: 30, sex: 'male', restHR: 0}, 'hrTrack_r1', HR);
    const txt = textOf(root);
    expect(txt).toContain('심박 존');
    expect(txt).toContain('안정시심박을 설정');
  });

  test('hrTrack 이 없으면 심박 존 카드는 숨긴다(워치 미연동/옛 런)', async () => {
    const root = await renderDetail({age: 30, sex: 'male', restHR: 50});
    expect(textOf(root)).not.toContain('심박 존');
  });
});
