/**
 * SocialProfileCard — 공개 프로필 카드(표시 전용).
 *
 * 관찰 가능한 것만 본다: **무엇이 화면에 뜨는가**. 특히
 *   · 없는 값을 지어내지 않는가(Truth only — 못 뛴 거리는 '—', 0인 스펙은 아예 숨김)
 *   · 신발이 없어도 안 깨지는가(신규 사용자)
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import SocialProfileCard from '../SocialProfileCard';
import type {PublicProfile} from '../lib/publicProfile';

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

const base = (over: Partial<PublicProfile> = {}): PublicProfile => ({
  nickname: '민우',
  visibility: 'public',
  activeShoes: [
    {brand: 'Nike', model: 'Pegasus 41', name: 'Nike Pegasus 41', usedKm: 412, maxKm: 700},
  ],
  hallOfFame: [],
  stats: {totalKm: 1240, runCount: 148, monthKm: 62.4},
  spec: {
    vo2max: 52,
    paceSec: 312,
    longestKm: 21.1,
    pb: [
      {key: '5k', label: '5K', sec: 1300},
      {key: '10k', label: '10K', sec: 2712},
      {key: 'half', label: '하프', sec: 5900},
      {key: 'full', label: '풀', sec: 0},
    ],
  },
  ...over,
});

async function render(profile: PublicProfile, footnote?: string) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<SocialProfileCard profile={profile} footnote={footnote} />);
  });
  return r;
}

describe('SocialProfileCard', () => {
  test('정체성 — 닉네임과 누적 거리(천단위)', async () => {
    const t = textOf((await render(base())).toJSON());
    expect(t).toContain('민우');
    expect(t).toContain('1,240');
    expect(t).toContain('148런');
  });

  test('이번 달 거리는 있을 때만 나온다', async () => {
    expect(textOf((await render(base())).toJSON())).toContain('이번 달 62.4km');
    const zero = base({stats: {totalKm: 10, runCount: 1, monthKm: 0}});
    expect(textOf((await render(zero)).toJSON())).not.toContain('이번 달');
  });

  test('거리 PB — 뛴 것은 시간, 못 뛴 것은 —(가짜 값을 만들지 않는다)', async () => {
    const t = textOf((await render(base())).toJSON());
    expect(t).toContain('21:40');    // 5K 1300초
    expect(t).toContain('45:12');    // 10K 2712초
    expect(t).toContain('1:38:20');  // 하프 5900초 → 시간 표기
    expect(t).toContain('—');        // 풀 미완주
    expect(t).not.toContain('0:00');
  });

  test('스펙 줄 — 값이 있는 것만 뜬다', async () => {
    const t = textOf((await render(base())).toJSON());
    expect(t).toContain('52');
    expect(t).toContain("5'12\"");
    expect(t).toContain('21.1km');
  });

  test('스펙이 전부 0이면 그 줄이 통째로 빠진다(신규 사용자)', async () => {
    const p = base({spec: {vo2max: 0, paceSec: 0, longestKm: 0, pb: base().spec.pb}});
    const t = textOf((await render(p)).toJSON());
    expect(t).not.toContain('VO2MAX');
    expect(t).not.toContain('평균');
    expect(t).not.toContain('최장');
  });

  test('신발 — 브랜드/모델/누적·수명', async () => {
    const t = textOf((await render(base())).toJSON());
    expect(t).toContain('Nike');
    expect(t).toContain('Pegasus 41');
    expect(t).toContain('412');
    expect(t).toContain('/ 700');
  });

  test('신발이 없으면 그 구역이 통째로 빠진다 — 빈 제목만 남지 않게', async () => {
    const t = textOf((await render(base({activeShoes: []}))).toJSON());
    expect(t).not.toContain('신는 러닝화');
  });

  test('수명이 없는 신발은 분모를 안 보여준다', async () => {
    const p = base({activeShoes: [{brand: '', model: '직접입력화', name: '직접입력화', usedKm: 50, maxKm: 0}]});
    const t = textOf((await render(p)).toJSON());
    expect(t).toContain('50');
    expect(t).not.toContain('/ 0');
  });

  test('모델명이 비면 전체 이름으로 대체한다(카탈로그에 없는 신발)', async () => {
    const p = base({activeShoes: [{brand: '', model: '', name: '내 신발', usedKm: 10, maxKm: 600}]});
    expect(textOf((await render(p)).toJSON())).toContain('내 신발');
  });

  test('안심 문구는 넘겼을 때만 뜬다(동의 화면 전용)', async () => {
    expect(textOf((await render(base())).toJSON())).not.toContain('여기 보이는 것이 전부');
    const t = textOf((await render(base(), '여기 보이는 것이 전부입니다.')).toJSON());
    expect(t).toContain('여기 보이는 것이 전부입니다.');
  });

  test('러닝 0건이어도 깨지지 않는다', async () => {
    const p = base({
      activeShoes: [], stats: {totalKm: 0, runCount: 0, monthKm: 0},
      spec: {vo2max: 0, paceSec: 0, longestKm: 0, pb: base().spec.pb.map(x => ({...x, sec: 0}))},
    });
    const t = textOf((await render(p)).toJSON());
    expect(t).toContain('민우');
    expect(t).toContain('0런');
  });
});
