/**
 * App.tsx shoe-health / retire(보관) integration tests.
 *
 * Drives the real App with a mocked backend and asserts observable behavior —
 * what renders and what HTTP verb hits the wire — not internal state. The mock
 * fetch records {method, url, body} for every call so the tests can prove the
 * write path: retire must PATCH (retired toggle), delete must DELETE only the
 * shoe, and neither may cascade-delete the run log (iron law: 데이터 파괴 금지).
 *
 *   1) shoeHealth is the single source of the UI condition — a shoe worn past 90%
 *      of its category lifespan (max_km) shows the '교체' tier on the home hero
 *      (proves the hard-coded 100km rule of audit#7 is gone).
 *   2) Iron law: retiring a shoe keeps its run record; deleting a shoe deletes
 *      only the shoe and never the run (no cascade). A wrong verb that wipes the
 *      run is caught because the run must still render and no DELETE may touch
 *      /api/runs.
 *   3) The retire write path uses PATCH retired=true (not DELETE); restore uses
 *      PATCH retired=false and the shoe returns to the home picker as startable.
 *   4) ShoesScreen renders the three proportional wear tiers (양호/주의/교체) with
 *      distinct colors and drives retire/restore from the locker.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert, StyleSheet} from 'react-native';
import App from '../App';
import ShoesScreen from '../ShoesScreen.rn';
import {DANGER, WARN, GOOD, Shoe} from '../theme';

type ApiShoe = {id: string; name: string; max_km: number; start_km: number; retired?: boolean};
type ApiRun = {id: string; shoe_id: string; km: number; run_date: string; duration: number};

type RecordedCall = {method: string; url: string; body: any};

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  if ((out === '' || node.props?.accessibilityRole === 'tab') && typeof node.props?.accessibilityLabel === 'string') return node.props.accessibilityLabel;
  return out;
}

// Record every fetch with its HTTP method + parsed JSON body so write-path tests
// can distinguish PATCH from DELETE (the old mock ignored opts entirely).
function mockBackend(shoes: ApiShoe[], runs: ApiRun[]): RecordedCall[] {
  const calls: RecordedCall[] = [];
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, opts: any) => {
    const u = String(url);
    const method = (opts && opts.method ? String(opts.method) : 'GET').toUpperCase();
    let body: any;
    try {
      body = opts && opts.body ? JSON.parse(opts.body) : undefined;
    } catch {
      body = opts ? opts.body : undefined;
    }
    calls.push({method, url: u, body});
    let res: any = {};
    if (u.includes('/api/auth')) res = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) res = shoes;
    else if (u.includes('/api/runs')) res = runs;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(res),
      text: () => Promise.resolve(JSON.stringify(res)),
    });
  });
  return calls;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(shoes: ApiShoe[], runs: ApiRun[]) {
  const calls = mockBackend(shoes, runs);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush(); // let the auth → shoes/runs fetch chain settle
  return {root: renderer.root, calls, renderer};
}

// Most-specific Pressable whose rendered text contains `needle` (icon buttons
// render their Ionicons name as text via the test mock, so 'archive-outline'
// etc. uniquely identify them; cards match by their model name).
function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string): ReactTestRenderer.ReactTestInstance {
  const hits = root
    .findAll((n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle));
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

async function mountComponent(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer.root;
}

async function tap(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    node.props.onPress();
  });
  await flush();
}

// Auto-confirm RN Alert dialogs by pressing the first non-cancel button (보관/삭제).
function autoConfirmAlerts() {
  jest.spyOn(Alert, 'alert').mockImplementation((_t?: any, _m?: any, buttons?: any) => {
    const btn = (buttons || []).find((b: any) => b && b.style !== 'cancel' && typeof b.onPress === 'function');
    if (btn) btn.onPress();
  });
}

// Colors applied to every Text whose content is exactly `value`.
function colorsOf(root: ReactTestRenderer.ReactTestInstance, value: string): (string | undefined)[] {
  return root
    .findAll((n: any) => n && n.props && n.props.children === value)
    .map((n: any) => (StyleSheet.flatten(n.props.style) || {}).color);
}

// ── 1) single-source condition tier on the home hero ─────────────────────────
test('worn shoe (>90% of max_km) shows the 교체 tier on the home hero (audit#7)', async () => {
  const {root} = await mount(
    [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}],
    [{id: 'r1', shoe_id: 's1', km: 560, run_date: '2026-05-01', duration: 3600}], // ~93%
  );
  const txt = textOf(root);
  expect(txt).toContain('Pegasus');
  expect(txt).toContain('교체');
  expect(txt).not.toContain('점검');
});

test('a healthy shoe shows 양호 (no false replacement warning)', async () => {
  const {root} = await mount(
    [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}],
    [{id: 'r1', shoe_id: 's1', km: 100, run_date: '2026-05-01', duration: 3600}], // ~17%
  );
  const txt = textOf(root);
  expect(txt).toContain('최상의 컨디션'); // 양호 → 히어로 condLabel(리스킨)
  expect(txt).not.toContain('교체 권장'); // 교체 경고 라벨 미노출('교체까지 약 N' 게이지 문구와 구분)
});

test('retired shoe is hidden from the home run-selection list; active shoe stays', async () => {
  const {root} = await mount(
    [
      {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
      {id: 's2', name: 'Hoka Clifton', max_km: 600, start_km: 0, retired: true},
    ],
    [],
  );
  const txt = textOf(root);
  expect(txt).toContain('Pegasus');
  expect(txt).not.toContain('Clifton');
});

// ── 2) iron law: retire preserves the run; PATCH not DELETE ───────────────────
test('retire(보관) PATCHes retired=true, never DELETE, and keeps the shoe\'s run record', async () => {
  autoConfirmAlerts();
  const {root, calls} = await mount(
    [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}],
    [{id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-06-01', duration: 1800}],
  );

  await tap(pressBy(root, '신발')); // → Shoes tab
  await tap(pressBy(root, 'Pegasus')); // open shoe detail
  // sanity: the run is listed in the detail before we retire
  expect(textOf(root)).not.toContain('아직 기록이 없어요');

  await tap(pressBy(root, 'archive-outline')); // 보관 → Alert auto-confirm

  // write path: exactly a PATCH retired=true on this shoe — never a DELETE.
  const shoeWrites = calls.filter(c => c.url.includes('/api/shoes/s1'));
  expect(shoeWrites.map(c => c.method)).toContain('PATCH');
  expect(shoeWrites.map(c => c.method)).not.toContain('DELETE');
  const patch = shoeWrites.find(c => c.method === 'PATCH');
  expect(patch!.body.retired).toBe(true);
  // no cascade: the run endpoint is never written/destroyed.
  expect(calls.filter(c => c.url.includes('/api/runs') && c.method !== 'GET')).toHaveLength(0);

  // observable: shoe now shows 보관됨 and its run record is still present.
  const txt = textOf(root);
  expect(txt).toContain('보관됨');
  expect(txt).not.toContain('아직 기록이 없어요');
});

// ── deleting a shoe deletes only the shoe, never cascades to its runs ─────────
test('delete(삭제) DELETEs only the shoe; the run is preserved (no cascade)', async () => {
  autoConfirmAlerts();
  const {root, calls} = await mount(
    [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}],
    [{id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-06-01', duration: 1800}],
  );

  await tap(pressBy(root, '신발')); // → Shoes tab
  await tap(pressBy(root, 'Pegasus')); // open shoe detail
  await tap(pressBy(root, 'trash-outline')); // 삭제 → Alert auto-confirm

  // the shoe is DELETEd; the run endpoint is never touched with a destructive verb.
  const shoeDeletes = calls.filter(c => c.url.includes('/api/shoes/s1') && c.method === 'DELETE');
  expect(shoeDeletes).toHaveLength(1);
  expect(calls.filter(c => c.url.includes('/api/runs') && c.method === 'DELETE')).toHaveLength(0);

  // observable: the run survives the shoe — History still lists it (now orphaned).
  await tap(pressBy(root, '기록')); // → History tab
  const txt = textOf(root);
  expect(txt).toContain('삭제된 신발');
  expect(txt).toContain('5'); // the run's distance is still on screen
});

// ── 3) restore(복원): clears retired and the shoe returns to the home picker ────
test('restore(복원) PATCHes retired=false and the shoe reappears in the home picker as startable', async () => {
  const {root, calls} = await mount(
    [
      {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
      {id: 's2', name: 'Hoka Clifton', max_km: 600, start_km: 0, retired: true},
    ],
    [],
  );

  // before restore: archived shoe is not on the home picker.
  expect(textOf(root)).not.toContain('Clifton');

  await tap(pressBy(root, '신발')); // → Shoes tab (locker shows all incl. retired)
  await tap(pressBy(root, 'Clifton')); // open archived shoe detail
  await tap(pressBy(root, 'arrow-undo-outline')); // 복원 (no Alert on restore)

  // write path: PATCH retired=false (toggle off), not a DELETE.
  const patch = calls.find(c => c.url.includes('/api/shoes/s2') && c.method === 'PATCH');
  expect(patch).toBeDefined();
  expect(patch!.body.retired).toBe(false);

  // observable: back on home, the restored shoe is offered as a startable option.
  await tap(pressBy(root, 'chevron-back')); // detail → locker (TabBar)
  await tap(pressBy(root, '홈')); // → Home tab
  const home = textOf(root);
  expect(home).toContain('Clifton');
  expect(home).toContain('러닝 시작'); // start CTA present → startable
});

// ── 4) ShoesScreen: three wear tiers + retire/restore from the locker ──────────
test('ShoesScreen renders 양호/주의/교체 in distinct colors', async () => {
  const shoes: Shoe[] = [
    {id: 'w', brand: 'NIKE', model: 'Pegasus', used: 560, max: 600, condition: '교체'},
    {id: 'm', brand: 'HOKA', model: 'Clifton', used: 480, max: 600, condition: '주의'},
    {id: 'n', brand: 'ASICS', model: 'Nimbus', used: 50, max: 600, condition: '양호'},
  ];
  const root = await mountComponent(
    <ShoesScreen shoes={shoes} runs={[]} totals={{}} onTab={() => {}} onAddShoe={() => {}} />,
  );

  // 3-tier color contract: 교체→DANGER, 주의→WARN, 양호→GOOD.
  expect(colorsOf(root, '교체')).toContain(DANGER);
  expect(colorsOf(root, '주의')).toContain(WARN);
  expect(colorsOf(root, '양호')).toContain(GOOD);
});

test('ShoesScreen locker drives retire (archive) and restore (undo) through props', async () => {
  autoConfirmAlerts();
  const onRetire = jest.fn();
  const shoes: Shoe[] = [
    {id: 'w', brand: 'NIKE', model: 'Pegasus', used: 560, max: 600, condition: '교체'},
    {id: 'g', brand: 'BROOKS', model: 'Ghost', used: 50, max: 600, condition: '양호', retired: true},
  ];
  const root = await mountComponent(
    <ShoesScreen shoes={shoes} runs={[]} totals={{}} onTab={() => {}} onAddShoe={() => {}} onRetire={onRetire} />,
  );

  // active shoe → 보관: archive button confirms and retires (id, true).
  await tap(pressBy(root, 'Pegasus'));
  await tap(pressBy(root, 'archive-outline'));
  expect(onRetire).toHaveBeenCalledWith('w', true);

  // back to locker, open the archived shoe → 복원: undo button restores (id, false).
  await tap(pressBy(root, 'chevron-back'));
  await tap(pressBy(root, 'Ghost'));
  await tap(pressBy(root, 'arrow-undo-outline'));
  expect(onRetire).toHaveBeenCalledWith('g', false);
});
