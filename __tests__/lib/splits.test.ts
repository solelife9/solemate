import {buildSplits, appendFinalSplit, FINAL_SPLIT_MIN_KM} from '../../lib/splits';
import type {Split} from '../../RunSplits';

// lib/splits.buildSplits(run, route): 레코더가 남긴 run.splits 가 2개 이상이면 그대로
// 쓰고(per-km 구간), 없으면 빈 배열을 반환해 <RunSplits/> 가 자동으로 숨는다.
const SPLITS: Split[] = [
  {km: 1, paceSec: 300, elevM: 5},
  {km: 2, paceSec: 290, elevM: -3},
  {km: 3, paceSec: 310, elevM: 0},
];

describe('buildSplits', () => {
  test('run.splits 가 2개 이상이면 그대로 반환', () => {
    expect(buildSplits({splits: SPLITS}, [])).toEqual(SPLITS);
  });

  test('run.splits 없으면 빈 배열(자동 숨김 — 수동 입력 런 안전)', () => {
    expect(buildSplits({}, [])).toEqual([]);
    expect(buildSplits({splits: undefined}, [])).toEqual([]);
  });

  test('run.splits 가 1개뿐이면 빈 배열(<2 → 숨김)', () => {
    expect(buildSplits({splits: [SPLITS[0]]}, [])).toEqual([]);
  });
});

// appendFinalSplit: 완주 시 마지막 정수 km 이후 남은 부분 구간(꼬리)을 한 줄 추가한다.
// recorded 는 1km 스플릿들(각 paceSec = 그 1km 소요초). 마지막 경계의 경과초/누적고도를
// 인자로 받아 꼬리 구간 시간·고도를 per-km 페이스로 환산해 붙인다.
describe('appendFinalSplit', () => {
  // 5km 까지 1km 씩 기록된 상태(각 5분). 마지막 경계 elapsed=1500s, 누적고도=20m.
  const REC: Split[] = [
    {km: 1, paceSec: 300, elevM: 5},
    {km: 2, paceSec: 300, elevM: 4},
    {km: 3, paceSec: 300, elevM: 3},
    {km: 4, paceSec: 300, elevM: 4},
    {km: 5, paceSec: 300, elevM: 4},
  ];

  test('5.6km 런: 마지막 0.6km 꼬리를 per-km 페이스로 환산해 추가', () => {
    // 0.6km 를 198초에 달림 → per-km 페이스 = 198/0.6 = 330s. 고도 20→26 = +6m.
    const out = appendFinalSplit(REC, 5.6, 1698, 1500, 26, 20);
    expect(out).toHaveLength(6);
    expect(out[5]).toEqual({km: 5.6, paceSec: 330, elevM: 6});
    // 원본 5개 구간은 그대로.
    expect(out.slice(0, 5)).toEqual(REC);
  });

  test('비파괴: 입력 배열을 변형하지 않는다', () => {
    const before = REC.length;
    appendFinalSplit(REC, 5.6, 1698, 1500, 26, 20);
    expect(REC).toHaveLength(before);
  });

  test('꼬리가 임계 미만(<0.1km)이면 추가하지 않음 — 노이즈 제거', () => {
    const out = appendFinalSplit(REC, 5.05, 1515, 1500, 21, 20);
    expect(out).toEqual(REC);
    expect(out).not.toBe(REC); // 그래도 복제본 반환
  });

  test('정확히 임계(0.1km)면 추가', () => {
    const out = appendFinalSplit(REC, 5 + FINAL_SPLIT_MIN_KM, 1530, 1500, 20, 20);
    expect(out).toHaveLength(6);
    expect(out[5].km).toBe(5.1);
    expect(out[5].paceSec).toBe(300); // 30s / 0.1km = 300s/km
  });

  test('정수 km 로 끝나면(꼬리 0) 추가하지 않음', () => {
    expect(appendFinalSplit(REC, 5, 1500, 1500, 20, 20)).toEqual(REC);
  });

  test('1km 미만 런: 기록 0개 + 꼬리 1개 = 1개 (RunSplits 가 <2 로 숨김)', () => {
    const out = appendFinalSplit([], 0.6, 198, 0, 6, 0);
    expect(out).toEqual([{km: 0.6, paceSec: 330, elevM: 6}]);
  });

  test('고도 하강(꼬리 누적고도 감소)은 0 으로 클램프', () => {
    const out = appendFinalSplit(REC, 5.6, 1698, 1500, 18, 20);
    expect(out[5].elevM).toBe(0);
  });

  test('방어: finalKm 비유한이면 원본 복제 반환', () => {
    expect(appendFinalSplit(REC, NaN, 1698, 1500, 26, 20)).toEqual(REC);
  });

  test('방어: segTime<=0(시간 역행)이면 추가하지 않음', () => {
    expect(appendFinalSplit(REC, 5.6, 1499, 1500, 26, 20)).toEqual(REC);
  });

  test('방어: finalKm < 기록 수(거리 역행 라운딩)면 원본 그대로', () => {
    expect(appendFinalSplit(REC, 4.9, 1500, 1500, 26, 20)).toEqual(REC);
  });
});
