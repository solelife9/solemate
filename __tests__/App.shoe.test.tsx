/**
 * App.tsx shoe-health / retire integration tests.
 *
 * Drives the real App home screen with a mocked backend and asserts observable
 * behavior, not internal state:
 *
 *   1) shoeHealth is the single source of the condition the UI shows — a shoe
 *      worn past 90% of its category lifespan (max_km) renders the '교체' tier on
 *      the home hero (proves the hard-coded 100km rule / duplicated `used` math
 *      of audit#7 is gone and the proportional tier is wired through).
 *   2) A retired (archived) shoe is hidden from the home run-selection list while
 *      an active shoe still shows — without destroying any data (iron law): the
 *      retired shoe's run is still counted in the active picture nowhere, but the
 *      shoe itself simply does not appear as a startable option.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import App from '../App';

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
  return out;
}

type Shoe = {id: string; name: string; max_km: number; start_km: number; retired?: boolean};
type Run = {id: string; shoe_id: string; km: number; run_date: string; duration: number};

function mockBackend(shoes: Shoe[], runs: Run[]) {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) body = shoes;
    else if (u.includes('/api/runs')) body = runs;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

async function mountHome(shoes: Shoe[], runs: Run[]) {
  mockBackend(shoes, runs);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // let the auth → shoes/runs fetch chain settle
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer.root;
}

test('worn shoe (>90% of max_km) shows the 교체 tier on the home hero (audit#7 proportional life)', async () => {
  const root = await mountHome(
    [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}],
    [{id: 'r1', shoe_id: 's1', km: 560, run_date: '2026-05-01', duration: 3600}], // ~93%
  );
  const txt = textOf(root);
  expect(txt).toContain('Pegasus');
  expect(txt).toContain('교체'); // proportional tier, not the old "잔여 100km → 점검"
  expect(txt).not.toContain('점검');
});

test('a healthy shoe shows 양호 (no false replacement warning)', async () => {
  const root = await mountHome(
    [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}],
    [{id: 'r1', shoe_id: 's1', km: 100, run_date: '2026-05-01', duration: 3600}], // ~17%
  );
  const txt = textOf(root);
  expect(txt).toContain('양호');
  expect(txt).not.toContain('교체');
});

test('retired shoe is hidden from the home run-selection list; active shoe stays', async () => {
  const root = await mountHome(
    [
      {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
      {id: 's2', name: 'Hoka Clifton', max_km: 600, start_km: 0, retired: true},
    ],
    [],
  );
  const txt = textOf(root);
  // active shoe is offered as a startable option
  expect(txt).toContain('Pegasus');
  // the archived shoe is not shown on the home picker/hero (records still exist)
  expect(txt).not.toContain('Clifton');
});
