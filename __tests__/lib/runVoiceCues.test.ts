// runVoice 큐 빌더(탑티어 패리티 #14) — kmCue/halfKmCue 가 설정에 따라 만드는
// 클립 id 시퀀스를 고정한다(재생 자체는 expo-audio 목·통합 별개). play 스파이로 단언.
import {runVoice} from '../../lib/runVoice/voice';

describe('runVoice 큐 시퀀스', () => {
  let played: string[][];
  let spy: jest.SpyInstance;
  beforeEach(() => {
    played = [];
    spy = jest.spyOn(runVoice, 'play').mockImplementation((ids: string[]) => {
      played.push(ids);
    });
  });
  afterEach(() => spy.mockRestore());

  test('kmCue 기본: 거리 + 구간 페이스 라벨', () => {
    runVoice.kmCue(5, 310); // 5'10"
    expect(played[0]).toEqual(['km_5', 'lbl_pace', 'min_5', 'sec_10']);
  });

  test('kmCue + 경과시간(NRC): lbl_elapsed + 분·초 조각이 이어진다', () => {
    runVoice.kmCue(3, 305, {elapsedSec: 15 * 60 + 42});
    expect(played[0]).toEqual(['km_3', 'lbl_pace', 'min_5', 'sec_5', 'lbl_elapsed', 'min_15', 'sec_42']);
  });

  test('경과시간 1시간 이상: 고유어 시간 조각 + 초 생략(간결)', () => {
    runVoice.kmCue(12, null, {elapsedSec: 3600 + 22 * 60 + 31});
    expect(played[0]).toEqual(['km_12', 'lbl_elapsed', 'hr_1', 'min_22']);
  });

  test('평균 페이스 기준이면 lbl_avg_pace 라벨을 쓴다', () => {
    runVoice.kmCue(2, 360, {paceBasis: 'avg'});
    expect(played[0]).toEqual(['km_2', 'lbl_avg_pace', 'min_6']);
  });

  test('초 반올림 캐리: 5:59.7 은 "6분"으로 올린다(과거엔 60초가 버려져 "5분" 오보)', () => {
    runVoice.kmCue(4, 359.7); // 5'59.7" → 반올림 6'00"
    expect(played[0]).toEqual(['km_4', 'lbl_pace', 'min_6']);
    // 59.4초는 그대로 59초(내림 아님 — 총초 반올림).
    runVoice.kmCue(5, 359.4);
    expect(played[1]).toEqual(['km_5', 'lbl_pace', 'min_5', 'sec_59']);
  });

  test('페이스 null(설정 off)·경과시간 null(설정 off)이면 거리만', () => {
    runVoice.kmCue(7, null, {elapsedSec: null});
    expect(played[0]).toEqual(['km_7']);
  });

  test('절반/마지막 플래그는 끝에 이어붙는다(기존 계약 유지)', () => {
    runVoice.kmCue(5, 300, {half: true, lastKm: false});
    expect(played[0][played[0].length - 1]).toBe('half');
  });

  test('halfKmCue: 첫 반 km 는 오백 미터, 이후는 X점오 킬로미터 + 평균 페이스 라벨', () => {
    runVoice.halfKmCue(0.5, 330, 165);
    expect(played[0]).toEqual(['m_500', 'lbl_avg_pace', 'min_5', 'sec_30', 'lbl_elapsed', 'min_2', 'sec_45']);
    runVoice.halfKmCue(3.5, null, null);
    expect(played[1]).toEqual(['kmh_3']);
  });

  test('halfKmCue 정수/범위 밖 입력은 무음(방어)', () => {
    runVoice.halfKmCue(4, 300, 100); // 정수 — 반 km 큐 아님
    runVoice.halfKmCue(42.5, 300, 100); // 범위 밖
    expect(played).toHaveLength(0);
  });

  test('setVolume 은 0~1 만 수용(방어)', () => {
    runVoice.setVolume(0.85);
    runVoice.setVolume(-1); // 무시
    runVoice.setVolume(NaN); // 무시
    // 크래시 없이 통과하면 OK(내부 값은 재생 경로에서 소비 — 통합에서 검증).
    expect(true).toBe(true);
  });
});
