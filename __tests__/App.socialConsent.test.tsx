/**
 * 공개 범위 동의 게이트 — **동의 전에는 아무것도 올라가지 않는가.**
 *
 * keego 는 동의도 화면도 없이 개인정보가 공개 컬렉션에 쌓이던 사고를 이미 냈다
 * (767032e, AUDIT 1). 이 스위트는 그 재발을 앱 배선 수준에서 막는다 —
 * lib/publicProfile 단위 테스트가 "만들지 않는다"를 보고, 여기서는 "화면이 실제로
 * 물어보는가 / 거절이 지켜지는가"를 본다.
 *
 * 이 게이트는 __KEEGO_ENABLE_SOCIAL_CONSENT__ 로만 켠다(기본 우회 — 다른 App 스위트 무영향).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {VISIBILITY_KEY} from '../lib/publicProfile';

function textOf(node: any): string {
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

/** 신발 하나를 가진 기존 사용자(온보딩 완료). */
async function seedUserWithShoe() {
  await AsyncStorage.setMany({
    onboarded: '1',
    cache_shoes_v1: JSON.stringify([
      {id: 's1', name: 'Nike Pegasus 41', max_km: 700, start_km: 0, updatedAt: 1},
    ]),
    cache_runs_v1: JSON.stringify([
      {id: 'r1', shoe_id: 's1', km: 10, run_date: '2026-08-01', duration: 3000, updatedAt: 1},
    ]),
  });
}

async function renderApp() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return r;
}

/** testID 로 노드를 찾아 누른다. 없으면 null. */
function press(renderer: ReactTestRenderer.ReactTestRenderer, testID: string): boolean {
  const found = renderer.root.findAll(n => (n.props as any)?.testID === testID && !!(n.props as any)?.onPress);
  if (!found.length) return false;
  (found[0].props as any).onPress();
  return true;
}

describe('공개 범위 동의 게이트', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (globalThis as any).__KEEGO_ENABLE_SOCIAL_CONSENT__ = true;
    (globalThis as any).__KEEGO_DEV_SEED__ = false;
  });
  afterEach(() => {
    delete (globalThis as any).__KEEGO_ENABLE_SOCIAL_CONSENT__;
    delete (globalThis as any).__KEEGO_DEV_SEED__;
  });

  test('아직 안 물어봤으면 동의 화면이 홈보다 먼저 뜬다', async () => {
    await seedUserWithShoe();
    const r = await renderApp();
    expect(textOf(r.toJSON())).toContain('이렇게 보여요');
    r.unmount();
  });

  test('미리보기에 내 신발이 실제로 뜬다 — 빈 카드를 보여주지 않는다', async () => {
    await seedUserWithShoe();
    const r = await renderApp();
    const t = textOf(r.toJSON());
    expect(t).toContain('Pegasus 41');
    expect(t).toContain('신는 러닝화');
    r.unmount();
  });

  test('안심 문구가 함께 뜬다 — "여기 보이는 것이 전부"', async () => {
    await seedUserWithShoe();
    const r = await renderApp();
    expect(textOf(r.toJSON())).toContain('여기 보이는 것이 전부입니다');
    r.unmount();
  });

  test('경로·몸무게는 미리보기에 없다', async () => {
    await AsyncStorage.setMany({
      onboarded: '1',
      body_weight_kg: '65',
      cache_shoes_v1: JSON.stringify([{id: 's1', name: 'Nike Pegasus 41', max_km: 700, updatedAt: 1}]),
      cache_runs_v1: JSON.stringify([
        {id: 'r1', shoe_id: 's1', km: 10, run_date: '2026-08-01', updatedAt: 1,
         route: '[{"lat":37.5,"lon":127.0}]', memo: '집 앞 공원'},
      ]),
    });
    const r = await renderApp();
    const t = textOf(r.toJSON());
    expect(t).not.toContain('37.5');
    expect(t).not.toContain('집 앞 공원');
    expect(t).not.toContain('65');
    r.unmount();
  });

  // ── 선택이 지켜지는가 ──────────────────────────────────────────────────────
  test('“나만 보기”를 고르면 비공개로 저장되고 화면이 닫힌다', async () => {
    await seedUserWithShoe();
    const r = await renderApp();
    await act(async () => {
      expect(press(r, 'social-consent-decline')).toBe(true);
    });
    expect(await AsyncStorage.getItem(VISIBILITY_KEY)).toBe('private');
    expect(textOf(r.toJSON())).not.toContain('이렇게 보여요');
    r.unmount();
  });

  test('“이대로 공개하기”를 고르면 공개로 저장된다', async () => {
    await seedUserWithShoe();
    const r = await renderApp();
    await act(async () => {
      expect(press(r, 'social-consent-accept')).toBe(true);
    });
    expect(await AsyncStorage.getItem(VISIBILITY_KEY)).toBe('public');
    r.unmount();
  });

  test('한 번 답하면 다시 묻지 않는다', async () => {
    await seedUserWithShoe();
    await AsyncStorage.setItem(VISIBILITY_KEY, 'private');
    const r = await renderApp();
    expect(textOf(r.toJSON())).not.toContain('이렇게 보여요');
    r.unmount();
  });

  test('신발이 없으면 아직 묻지 않는다 — 빈 카드로 물어봐야 설득력이 없다', async () => {
    await AsyncStorage.setMany({onboarded: '1', cache_shoes_v1: '[]', cache_runs_v1: '[]'});
    const r = await renderApp();
    expect(textOf(r.toJSON())).not.toContain('이렇게 보여요');
    r.unmount();
  });
});
