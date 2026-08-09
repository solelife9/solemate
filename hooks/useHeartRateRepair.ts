// ============================================================================
// hooks/useHeartRateRepair.ts — 심박 보강 한 덩어리(도구 + 복구 스윕)
// ----------------------------------------------------------------------------
// App.tsx 에서 분리(2026-08-09 분해 3단계). **동작 변경 0 — 순수 이동이다.**
//
// 왜 이 경계인가: 심박을 뒤늦게 채우는 일은 **경로가 넷**이다 — 워치 직송 트랙 수신,
// 저장 직후 재백필, 앱 복귀 시 최근 48h 복구, 하루 1회 정밀 스윕. 넷은 같은 도구
// (repairAvgBpm)를 공유하는데 App.tsx 안에서는 도구가 파일 한복판에, 경로는 그 아래에,
// 쓰는 쪽은 또 700줄 아래(폰 런 저장)에 흩어져 있었다. "심박이 왜 안 채워지지"를
// 쫓으려면 세 군데를 오가야 했다.
//
// 이 파일이 소유하는 것: 레코드 평균·최대 보정 · HK 백필 묶음 · 네 복구 경로 전부.
// 밖으로 내보내는 것(runsForHrRef · repairAvgBpm · hkBackfillAndRepair)은 폰 런 저장과
// 클라우드 상세 스윕이 같은 도구를 써야 하기 때문이다.
//
// ⚠️ **백필은 richer-wins 다** — 표본이 많은 쪽이 이긴다. 그래서 창(window)을 대충 잡으면
// 정확한 라이브 트랙을 덮어쓴다. 창 계산은 반드시 `runWindow` 한 곳에서만 한다.
// ============================================================================

import {useRef, useCallback, useEffect} from 'react';
import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {avgBpmFromTrack, saveWatchHrTrack, retryPendingHr, hasHrTrack} from '../lib/hrBackfill';
import {hrSummary} from '../lib/analytics/hrZones';
import {hkBackfillHeartRate, hkReadableWithoutPrompt, hkFindRunWorkoutWindow} from '../lib/health';
import {stampUpdatedAt} from '../lib/cloudSync';
import {persistRunToCache} from '../lib/bootCache';
import {runWindow} from '../lib/runMerge';
import {sortRunsByDateDesc} from '../lib/appViewModel';
import {watchSession} from '../lib/watchSession';

export type HeartRateRepair = ReturnType<typeof useHeartRateRepair>;

export function useHeartRateRepair(
  runs: BackendRun[],
  setRuns: React.Dispatch<React.SetStateAction<BackendRun[]>>,
) {
  // 매 렌더 runs 를 그대로 담는 거울 — 구독/타이머가 재구독 없이 최신 목록을 읽는다.
  const runsForHrRef = useRef<BackendRun[]>([]);
  runsForHrRef.current = runs;

  // 평균 심박 지연 보정 — hrTrack(그래프 사이드카)은 백필로 채워졌는데 레코드 heart_rate 가
  // 0 인 런(워치가 타앱 세션에 잡혀 라이브 스트림이 없던 러닝 등)의 평균을 사이드카에서
  // 산출해 레코드에 채운다. 상세 요약·공유 카드가 읽는 정본은 레코드 필드라 여기까지
  // 채워야 '--'가 사라진다(2026-07-18 실기기: 그래프는 있는데 평균만 '--').
  // useCallback 은 최적화가 아니라 **계약**이다: 이 둘은 구독을 1회만 걸고 최신 목록은
  // ref 로 읽는 자리들(onWatchHrTrack · 앱 복귀 스윕)에서 dep 으로 쓰인다. 매 렌더
  // 새 함수가 되면 그 구독이 렌더마다 해지·재등록된다. 읽는 것은 ref 와 setRuns 뿐이라
  // 정체성을 고정해도 값이 낡지 않는다.
  const repairAvgBpm = useCallback(async (runId: string) => {
    const sid = String(runId);
    const target = runsForHrRef.current.find(r => String(r.id) === sid);
    if (!target) return;
    // 평균과 **최대**를 각각 본다(2026-08-07). 예전엔 평균이 있으면 곧장 빠져나갔는데,
    // 최대 심박은 저장하는 곳이 아예 없었으므로 그 조기 반환이 곧 "최대는 영영 안 채움"
    // 이었다. 그 결과 훈련부하(TRIMP)의 필수 입력이 늘 비어 심박 기반 경로가 한 번도
    // 돌지 않았다(늘 페이스 기반 폴백).
    const needAvg = (Number(target.heart_rate) || 0) <= 0;
    const needMax = (Number(target.heart_rate_max) || 0) <= 0;
    if (!needAvg && !needMax) return;
    try {
      const raw = await AsyncStorage.getItem('hrTrack_' + sid);
      if (!raw) return;
      const track = JSON.parse(raw);
      const patch: Partial<BackendRun> = {};
      if (needAvg) {
        const avg = avgBpmFromTrack(track);
        if (avg != null) patch.heart_rate = avg;
      }
      if (needMax) {
        // 측정된 시계열에서 뽑는다 — 나이 공식으로 추정하지 않는다(그건 이 사람의
        // 최대 심박이 아니라 인구 평균이고, 훈련부하를 통째로 왜곡한다).
        const max = hrSummary(Array.isArray(track) ? track : []).max;
        if (max > 0) patch.heart_rate_max = max;
      }
      if (Object.keys(patch).length === 0) return;
      const editedAt = Date.now();
      setRuns(prev => prev.map(r => String(r.id) === sid ? stampUpdatedAt({...r, ...patch}, editedAt) : r));
      await persistRunToCache(stampUpdatedAt({...target, ...patch}, editedAt));
    } catch {/* 비치명적 */}
  }, [setRuns]);

  // 백필 + 평균 보정 묶음 — retryPendingHr/recoverRecentHr 가 트랙을 채우는 모든 경로에서
  // 레코드 평균까지 한 번에 따라온다.
  const hkBackfillAndRepair = useCallback((id: string, s: number, e: number) =>
    hkBackfillHeartRate(id, s, e).then(n => { if (n > 0) void repairAvgBpm(id); return n; }), [repairAvgBpm]);

  // 심박 지연 보강 — 폰이 주머니에 있어(화면 꺼짐) 실시간 심박을 놓쳐도 hrTrack 이 채워지게.
  // (A) 워치가 러닝 끝에 직송하는 심박 기록을 시간창으로 폰 런과 매칭해 저장(정본·HK 무관).
  useEffect(() => watchSession.onWatchHrTrack(async p => {
    try {
      const rid = await saveWatchHrTrack(p.startMs, p.endMs, p.offsetS, p.bpm, Date.now());
      if (rid) void repairAvgBpm(rid);
    } catch {/* 비치명적 */}
  }), [repairAvgBpm]);

  // (B) HealthKit 백필 재시도 + 최근 러닝 심박 복구 — 마운트 시 1회 + 앱 복귀('active')마다.
  //   · retryPendingHr: 새 런의 대기 목록을 정확한 창으로 재백필(저장 직후 동기화 지연 보완).
  //   · recoverRecentHr: 최근 48h 러닝을 창(updatedAt-duration)으로 재백필한다. HealthKit
  //     백필이 richer-wins 라, 워치→폰 동기화가 늦어 저장 때 못 잡았거나 스트레이 1~2점만
  //     잡혀 '평평한 가짜 심박'이 된 런도, 앱 복귀 시 애플 건강의 완전한 실측으로 교정된다.
  useEffect(() => {
    const recoverRecentHr = async () => {
      try {
        const now = Date.now();
        const recent = (runsForHrRef.current || []).filter(r => {
          const end = Number((r as {updatedAt?: number}).updatedAt) || 0;
          return end > 0 && now - end < 48 * 3600 * 1000 && (Number(r.duration) || 0) > 30;
        }).slice(0, 10);
        for (const r of recent) {
          // 창 계산은 runWindow 한 곳에서만 한다(2026-08-07). 예전엔 여기서 직접
          // updatedAt−duration 을 했는데, 그 창이 일시정지만큼 밀린 채로 **정확한
          // 라이브 심박 트랙을 덮어쓰고** 있었다(백필이 richer-wins 라 표본이 많으면 이긴다).
          const win = runWindow(r as any);
          if (!win) continue;
          await hkBackfillHeartRate(String(r.id), win.startMs, win.endMs);
          // 트랙은 있는데 레코드 평균이 빈 런(이전 버전에서 백필된 기록 포함) 소급 보정.
          await repairAvgBpm(String(r.id));
        }
      } catch {/* 비치명적 */}
    };
    const run = () => { void retryPendingHr(Date.now(), hkBackfillAndRepair).catch(() => {}); void recoverRecentHr(); };
    run();
    // 콜드런치 대비 — 마운트 직후엔 runs 가 아직 로드 전이라 복구가 헛돈다. 로드된 뒤 재시도.
    const t1 = setTimeout(run, 3000); const t2 = setTimeout(run, 12000);
    const sub = AppState.addEventListener('change', n => { if (n === 'active') run(); });
    return () => { clearTimeout(t1); clearTimeout(t2); sub.remove(); };
  }, [repairAvgBpm, hkBackfillAndRepair]);

  // (C) 심박 상세 복구 스윕(2026-07-24, 실기기: 재설치로 로컬 사이드카가 초기화돼 예전 기록의
  // 심박 그래프가 실종) — 하루 1회, hrTrack 없는 최근 런(30개)을 'HK 워크아웃의 실제
  // 시간창'으로 정밀 재백필한다. recoverRecentHr(48h·updatedAt 근사)와 달리 저장 당시
  // 워크아웃 시각이 정본이라 오래된 기록도 안전하다(±120s 매치 실패 시 건드리지 않음 —
  // 엉뚱한 창 백필이 '없음'보다 나쁘다). 전 과정 비차단.
  useEffect(() => {
    let alive = true;
    const HR_SWEEP_AT_KEY = 'hr_recover_sweep_at_v2'; // v2: route 픽스와 함께 1회 강제 재스윕(v1 빈 스탬프 무효화)
    const sweep = async () => {
      try {
        // 자가 복구 포함(재설치로 연동 플래그가 지워져도 OS 권한이 있으면 복원 후 진행).
        // **권한 창을 띄우지 않는 판정만 쓴다**(2026-08-07). 예전엔 hkEnsureLinked 였고
        // 그건 안드로이드에서 권한 시트를 띄운다 — 부팅 8초 뒤 아무 맥락 없이.
        if (!(await hkReadableWithoutPrompt())) return;
        const last = Number(await AsyncStorage.getItem(HR_SWEEP_AT_KEY)) || 0;
        if (Date.now() - last < 24 * 3600 * 1000) return;
        // **최신 30건**을 훑는다. 예전엔 정렬 없이 앞 30개라, 재설치 직후처럼 배열이
        // 오래된 순으로 만들어진 상태(클라우드 델타 복원)에서는 최근 러닝을 영영
        // 건드리지 못했다 — 하루 1회 게이트라 다음 날도 같은 30건을 다시 본다.
        const candidates = sortRunsByDateDesc((runsForHrRef.current || []).filter(r => (Number(r.duration) || 0) > 300)).slice(0, 30);
        for (const r of candidates) {
          if (!alive) return;
          const id = String(r.id);
          if (await hasHrTrack(id)) continue;
          const win = await hkFindRunWorkoutWindow(String(r.run_date || ''), Number(r.duration) || 0);
          if (!win) continue;
          await hkBackfillAndRepair(id, win.startMs, win.endMs);
        }
        await AsyncStorage.setItem(HR_SWEEP_AT_KEY, String(Date.now()));
      } catch {/* 비차단 — 다음 기회에 재시도 */}
    };
    const t = setTimeout(() => { void sweep(); }, 8000); // 부팅 러시(캐시 로드·동기화) 지난 뒤 조용히
    return () => { alive = false; clearTimeout(t); };
  }, [hkBackfillAndRepair]);

  return {runsForHrRef, repairAvgBpm, hkBackfillAndRepair};
}
