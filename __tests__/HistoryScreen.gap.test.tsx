/**
 * 런 상세 GAP(경사 보정 페이스) — 제거 계약 테스트(2026-07-04).
 *
 * GAP 카드는 초보에게 노이즈라는 제품 결정으로 상세 화면에서 제거됐다(곡선과 함께 —
 * 스플릿 표가 정보를 담당). 이 테스트는 오르막 gapTrack 이 있어도 GAP 행이 다시
 * 노출되지 않음을 고정한다. 산식(lib/analytics/gap)은 Pro 후보로 보존.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HistoryScreen from '../HistoryScreen.rn';

const SHOE = {id: 's1', brand: 'NIKE', model: 'Pegasus 41', km: 0, max_km: 800, start_km: 0} as any;
const THIS_MONTH = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-10`; })();

// 1km/300s(5:00/km) 런.
const RUN = (id: string) =>
  ({id, date: '5월 28일', day: '수', dateNum: '28', run_date: THIS_MONTH,
    dist: 1, durationS: 300, pace: "5'00\"", time: '5:00', shoe: 0, cal: 0, cadence: 0, bpm: 0, elev: 0} as any);

// 1km 동안 60m 선형 상승(6% 오르막) — GAP 가 실제(300)보다 확연히 빠르다.
const UPHILL = Array.from({length: 41}, (_, i) => ({d: i * 0.025, t: i * 7.5, e: i * 1.5}));
// 고도 일정(평지) — GAP == 실제 페이스 → 숨김.
const FLAT = Array.from({length: 41}, (_, i) => ({d: i * 0.025, t: i * 7.5, e: 50}));

async function flush() {
  await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
}
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
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  await act(async () => { hits[0].props.onPress(); });
  await flush();
}
async function renderDetail(gapKey?: string, gapVal?: unknown) {
  if (gapKey) await AsyncStorage.setItem(gapKey, JSON.stringify(gapVal));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={[RUN('r1')]} unit="km" />);
  });
  await flush();
  await openDetail(renderer.root, 'Pegasus 41');
  return renderer.root;
}

describe('HistoryScreen RunDetail — GAP 제거 계약', () => {
  afterEach(async () => { await AsyncStorage.clear(); });

  test('오르막 gapTrack 이 있어도 GAP 행은 더 이상 노출되지 않는다(제거 확정)', async () => {
    const root = await renderDetail('gapTrack_r1', UPHILL);
    expect(textOf(root)).not.toContain('경사 보정 페이스');
  });

  test('평지·시계열 없음도 동일 — 상세 어디에도 GAP 표기가 없다', async () => {
    const root = await renderDetail();
    expect(textOf(root)).not.toContain('GAP');
  });
});
