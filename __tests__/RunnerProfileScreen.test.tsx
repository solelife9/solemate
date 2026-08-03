/**
 * 남의 공개 프로필 — 계약.
 *
 * 랭킹에서 "1위는 뭘 신나"를 눌러 들어오는 화면이다. 지키는 것 셋:
 *
 *  · **읽기는 누를 때 한 건.** 목록을 그리며 미리 당겨오면 100명이면 100읽기다
 *    (AUDIT 2 에서 43배 줄여 놓은 걸 여기서 되돌리지 않는다).
 *  · **"비공개"와 "지금 안 됨"을 구분해 말한다.** 전자는 그 사람의 선택이라 정상이고,
 *    후자는 우리 쪽 문제다. 뭉개면 사용자가 남을 오해한다.
 *  · **서버가 뭘 주든 우리가 아는 모양만 그린다.** 남의 데이터다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunnerProfileScreen from '../RunnerProfileScreen.rn';
import {fetchPublicProfile, type PublicProfile} from '../lib/publicProfile';

const PROFILE: PublicProfile = {
  nickname: '민우',
  visibility: 'public',
  activeShoes: [{brand: 'Nike', model: 'Pegasus 41', name: 'Nike Pegasus 41',
    usedKm: 402, maxKm: 700}],
  hallOfFame: [],
  stats: {totalKm: 1200, runCount: 140, monthKm: 82},
  spec: {vo2max: 48, paceSec: 330, longestKm: 21.1,
    pb: [{key: '10k', label: '10K', sec: 2820}]},
};

const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n: any) => n.props?.testID === id);

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') { out += String(n) + ' '; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

async function mount(getPublicProfile: any, fallbackName = '러너') {
  const onClose = jest.fn();
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <RunnerProfileScreen uid="u1" fallbackName={fallbackName}
        port={{getPublicProfile}} onClose={onClose} />,
    );
  });
  await act(async () => { await Promise.resolve(); });
  return {r, onClose};
}

describe('읽기는 누를 때 한 건', () => {
  test('화면이 열릴 때 정확히 한 번 읽는다', async () => {
    const get = jest.fn(async () => PROFILE);
    await mount(get);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('u1');
  });

  test('다시 그려져도 같은 사람을 또 읽지 않는다', async () => {
    const get = jest.fn(async () => PROFILE);
    const {r} = await mount(get);
    await act(async () => { r.update(
      <RunnerProfileScreen uid="u1" fallbackName="러너"
        port={{getPublicProfile: get}} onClose={jest.fn()} />,
    ); });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('세 가지 상태를 다르게 말한다', () => {
  test('공개 프로필은 카드로 그린다', async () => {
    const {r} = await mount(async () => PROFILE);
    const t = textOf(r.toJSON());
    expect(t).toContain('민우');
    expect(t).toContain('Pegasus 41');
    expect(byId(r, 'runner-profile-private')).toHaveLength(0);
  });

  test('비공개는 사과하지 않는다 — 그 사람의 선택이다', async () => {
    const {r} = await mount(async () => null, '지나');
    expect(byId(r, 'runner-profile-private').length).toBeGreaterThan(0);
    const t = textOf(r.toJSON());
    expect(t).toContain('공개하지 않았어요');
    expect(t).toContain('지나');              // 목록이 알던 이름으로 부른다
    expect(t).toContain('순위는 그대로');       // 없는 사람 취급하지 않는다
    expect(byId(r, 'runner-profile-error')).toHaveLength(0);
  });

  test('못 읽었을 땐 다시 시도를 권한다 — 우리 쪽 문제다', async () => {
    const {r} = await mount(async () => { throw new Error('network'); });
    expect(byId(r, 'runner-profile-error').length).toBeGreaterThan(0);
    expect(textOf(r.toJSON())).toContain('다시 열어보세요');
    expect(byId(r, 'runner-profile-private')).toHaveLength(0);
  });

  test('읽는 동안에는 목록이 알던 이름을 쓴다 — 빈 제목을 보여주지 않는다', async () => {
    let resolve!: (v: any) => void;
    const get = jest.fn(() => new Promise(r => { resolve = r; }));
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(
        <RunnerProfileScreen uid="u1" fallbackName="지나"
          port={{getPublicProfile: get as any}} onClose={jest.fn()} />,
      );
    });
    expect(byId(r, 'runner-profile-loading').length).toBeGreaterThan(0);
    expect(textOf(r.toJSON())).toContain('지나');
    await act(async () => { resolve(PROFILE); await Promise.resolve(); });
    expect(byId(r, 'runner-profile-loading')).toHaveLength(0);
  });
});

describe('서버가 뭘 주든 아는 모양만 그린다', () => {
  test.each([
    ['visibility 가 public 이 아니면', {...PROFILE, visibility: 'private'}],
    ['nickname 이 문자열이 아니면', {...PROFILE, nickname: 42}],
  ])('%s 비공개로 다룬다', async (_label, bad) => {
    const {r} = await mount(async () => bad as any);
    expect(byId(r, 'runner-profile-private').length).toBeGreaterThan(0);
  });

  test('포트가 조회를 지원하지 않으면 오류로 다룬다(조용히 빈 화면 금지)', async () => {
    expect(await fetchPublicProfile({}, 'u1')).toEqual({state: 'error'});
  });

  test('uid 가 비면 읽지 않는다', async () => {
    const get = jest.fn(async () => PROFILE);
    expect(await fetchPublicProfile({getPublicProfile: get}, '')).toEqual({state: 'error'});
    expect(get).not.toHaveBeenCalled();
  });
});

describe('닫기', () => {
  test('뒤로가면 호출부가 닫는다', async () => {
    const {r, onClose} = await mount(async () => PROFILE);
    await act(async () => { byId(r, 'runner-profile-close')[0].props.onPress(); });
    expect(onClose).toHaveBeenCalled();
  });
});
