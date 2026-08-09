// ============================================================================
// hooks/useWatchSync.ts — 폰 바깥 표면(워치·홈 위젯)과의 연동
// ----------------------------------------------------------------------------
// App.tsx 에서 분리(2026-08-09 분해 4단계). **동작 변경 0 — 순수 이동이다.**
//
// 왜 이 경계인가: 여기 모인 넷은 방향이 다를 뿐 같은 일이다 — **폰이 정본인 상태를
// 폰 밖 화면에 밀어 넣고, 밖에서 만들어진 러닝을 받아 정본에 합친다.**
//   ① 활성 신발 목록 + 심박존 → 워치 시작 화면
//   ①'' 최근 러닝 10건 → 워치 기록 화면
//   ①' 활성 신발 한 켤레 → 홈/잠금화면 위젯(App Group)
//   ② 워치 단독 러닝 완주 수신 → addRun (신발 거리 자동 차감)
//
// 위젯(①')은 워치와 무관한 폰 기능이지만 여기 함께 둔다: 입력(homeShoes·effectiveId)이
// 같고, 셋 다 '내용이 실제 바뀔 때만 보낸다'는 같은 규약(직렬화 문자열을 dep 으로)을
// 쓰기 때문이다. 떼어 놓으면 그 규약이 두 곳에서 따로 관리된다.
//
// ⚠️ 이 파일에서 가장 조심할 것 — **신발 이중 차감.** 폰과 워치를 둘 다 켜고 뛰면 같은
// 러닝이 두 건으로 저장돼 신발에서 거리가 두 번 깎인다(2026-07-28 실측: 5.4km 러닝이
// 신발에 10.50km). 그래서 ② 는 runId 중복 방어 **위에** 시간창 병합(findMergeTarget)을
// 한 겹 더 둔다. 이 두 겹을 건드릴 땐 반드시 폰+워치 동시 러닝으로 실측 확인한다.
// ============================================================================

import {useEffect, useRef} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {watchSession} from '../lib/watchSession';
import {buildWatchShoes, buildWatchRecentRuns, buildWidgetShoe} from '../lib/watchPayload';
import {updateHomeWidgetShoe} from '../lib/homeWidget';
import {findMergeTarget, mergeRuns} from '../lib/runMerge';
import {elevationGainFrom} from '../lib/elevation';
import {registerRunForHr, retryPendingHr} from '../lib/hrBackfill';
import {MERGE_PHONE_WATCH_RUNS} from '../lib/featureFlags';
import {trackRunSave} from '../lib/productAnalytics';
import {showToast} from '../lib/toast';
import {reportIssue, recordError} from '../lib/crashlytics';

/** App.tsx 의 addRun 시그니처(그대로 받는다 — 이 훅은 저장 규약을 정하지 않는다). */
type AddRun = (
  shoeId: string, km: number, date: string, memo: string, source: string,
  duration?: number, cadence?: number, route?: string, location?: string,
  heart_rate?: number, elevationM?: number, calories?: number,
  opts?: {startMs?: number; id?: string; heartRateMax?: number},
) => Promise<string | null | undefined>;

export function useWatchSync({
  homeShoes, homeActiveIdx, age, restHR, effectiveId, runs, shoes,
  addRun, setRuns, hkBackfillAndRepair,
}: {
  homeShoes: any[];
  homeActiveIdx: number;
  age: number;
  restHR: number;
  effectiveId: string | null | undefined;
  runs: BackendRun[];
  shoes: BackendShoe[];
  addRun: AddRun;
  setRuns: React.Dispatch<React.SetStateAction<BackendRun[]>>;
  hkBackfillAndRepair: (id: string, s: number, e: number) => Promise<number>;
}) {
  // ── Keego Watch 동기화(2026-07-10) ────────────────────────────────────────
  // ① 활성 신발 목록(홈과 같은 최근착용순) + 심박존 파라미터(Tanaka 최대심박·안정시심박)
  //    를 워치에 푸시한다. 워치 시작 화면이 이 목록을 좌우 스와이프로 넘기고, 남은 수명
  //    %·컨디션 도트를 그린다. applicationContext 라 워치가 꺼져 있어도 다음 실행 때
  //    도착·캐시된다. 직렬화 문자열을 dep 으로 써 내용이 실제로 바뀔 때만 전송한다.
  //    ⚠️ **선택된 신발 id 도 함께 보낸다**(2026-08-08). 예전엔 목록만 보내서, 워치는
  //    자기 스와이프 기록으로만 신발을 골랐다. 폰에서 다른 신발을 고르면 두 기기가 서로
  //    다른 신발로 세션을 열고, 병합 조건(shoe_id 동일)이 깨져 같은 러닝이 두 건 남는다
  //    — 그러면 신발이 이중 차감된다.
  const watchShoesJson=JSON.stringify({...buildWatchShoes(homeShoes,age,restHR),selectedShoeId:effectiveId??''});
  useEffect(()=>{
    const p=JSON.parse(watchShoesJson);
    watchSession.updateShoes(p.shoes,p.hr,p.selectedShoeId);
  },[watchShoesJson]);
  // ①'' 폰 최근 러닝 → 워치 기록(HistoryView) 동기화. 워치가 폰 런 + 워치 런을 합쳐 최신순으로
  //    보여준다(runId 중복 제거는 워치 RecentRuns). 최근 10개만, 내용이 실제 바뀔 때만 전송.
  const watchRecentRunsJson=JSON.stringify(buildWatchRecentRuns(runs,shoes));
  useEffect(()=>{
    watchSession.updateRecentRuns(JSON.parse(watchRecentRunsJson));
  },[watchRecentRunsJson]);
  // ①' 홈/잠금화면 위젯(신발 수명 링) — 활성 신발(effectiveId=홈 히어로) 한 켤레를 App Group
  //    공유 저장소에 기록(네이티브가 위젯 리로드). 카테고리는 홈 히어로와 동일 소스로.
  //    워치와 무관한 폰 기능(available=iOS만). 내용이 실제 바뀔 때만 전송(직렬화 dep).
  const widgetShoeJson=(()=>{
    const p=buildWidgetShoe(homeShoes[homeActiveIdx]);
    return p?JSON.stringify(p):'';
  })();
  useEffect(()=>{
    if(!widgetShoeJson||(globalThis as any).__KEEGO_CAPTURE__) return;
    // 플랫폼 중립 통로(lib/homeWidget) 경유 — iOS 는 기존 WatchSessionModule 경로를 그대로
    // 쓰고, 안드로이드는 KeegoWidgetModule 로 간다. 예전엔 watchSession(iOS 전용)을 직접
    // 불러서 **안드로이드에선 위젯이 통째로 no-op** 이었다(2026-07-31 동등성 작업).
    updateHomeWidgetShoe(JSON.parse(widgetShoeJson));
  },[widgetShoeJson]);
  // ② 워치 단독 러닝 완주 수신 → addRun(로컬-퍼스트 저장 → 신발 거리 자동 차감 →
  //    cloudSync 가 Firestore 로 push). 메시지+큐 이중 배달이 가능하므로 runId 를 영속
  //    목록으로 중복 방어한다. 워치가 보낸 신발이 목록에 없으면(그 사이 삭제 등) 현재
  //    선택 신발로 폴백. 구독은 1회, 최신 상태는 ref 로 읽는다(재구독 churn 방지).
  const watchRunCtx=useRef({addRun,shoes,effectiveId,runs});
  watchRunCtx.current={addRun,shoes,effectiveId,runs};
  useEffect(()=>watchSession.onWatchRun(async p=>{
    try{
      const KEY='watch_runs_seen_v1';
      const raw=await AsyncStorage.getItem(KEY);
      const seen:string[]=raw?JSON.parse(raw):[];
      if(seen.includes(p.runId))return;
      await AsyncStorage.setItem(KEY,JSON.stringify([p.runId,...seen].slice(0,100)));
      const ctx=watchRunCtx.current;
      const shoeId=ctx.shoes.some(s=>String(s.id)===p.shoeId)?p.shoeId:(ctx.effectiveId??'');
      // 귀속할 신발이 전혀 없으면(신발 0켤레) 자동 기록을 만들지 않는다 — 러닝 자체는
      // 워치가 HealthKit 워크아웃(keego 메타데이터)으로 이미 남겼다(유실 아님).
      if(!shoeId)return;
      const d=new Date(p.startMs>0?p.startMs:Date.now());
      const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      // 케이던스·상승고도도 워치에서 받아 저장(구 버전은 0 → '--'였다). heart_rate·calories 는 기존.
      // GPS 경로(민우님 2026-07-24 "워치 런도 지도"): 워치가 보낸 경로를 레코드 route(클라우드
      // 동기 — 재설치·기기변경에도 지도 보존) + route_<id> 사이드카(addRun 내부)로 저장한다.
      const routeStr=Array.isArray(p.route)&&p.route.length>=2?JSON.stringify(p.route):'';
      // 상승 고도는 **폰이 계산한다**(2026-07-28). 워치가 보낸 고도 원자료(routeAlt)를
      // lib/elevation 규칙(기준고도 ±3m 히스테리시스)으로 누적한다. 워치 자체 계산값
      // (구버전 elevGainM)은 0.5m 증분을 다 더해 평지에서도 부풀었다 — 실측 274m(폰 33m).
      // 구버전 워치는 routeAlt 가 없으므로 그때만 elevGainM 을 폴백으로 받는다.
      const elevM=Array.isArray(p.routeAlt)&&p.routeAlt.length>0
        // durationS 를 함께 넘겨 상승률 상한이 걸리게 한다(2026-08-07). 워치는 표본
        // 시각을 안 보내지만 균등 다운샘플이라 평균 간격으로 재구성할 수 있다 —
        // 없으면 잡음이 그대로 누적돼 평지에서 1,800m 대가 나온다.
        ? elevationGainFrom(p.routeAlt,p.durationS)
        : Math.round(p.elevGainM);
      // ── 중복 방어: 같은 러닝을 폰이 이미 저장했는가 ──────────────────────────
      // runId 중복 방어(위)는 '같은 워치 런이 두 번 오는 것'만 막는다. 폰과 워치를 둘 다
      // 켜고 뛰면 서로 다른 id 로 **같은 러닝이 두 건** 저장돼 신발에 거리가 두 번 차감된다
      // (2026-07-28 실측: 5.4km 러닝이 신발에 10.50km). 시간창이 겹치면 새 런을 만들지 않고
      // 기존 런에 합친다(lib/runMerge — 스트라바가 중복 업로드를 처리하는 방식과 같다).
      const incoming={id:'incoming',shoe_id:shoeId,km:p.km,duration:Math.round(p.durationS),
        run_date:date,source:'watch',updatedAt:Date.now(),route:routeStr,location:'',
        cadence:Math.round(p.cadence),heart_rate:Math.round(p.avgBpm),
        calories:Math.round(p.kcal),elevation_m:elevM};
      // 측정 모드에선 병합을 건너뛴다 — 폰이 잰 값이 워치 값으로 덮이지 않게(플래그 주석 참조).
      const dup=MERGE_PHONE_WATCH_RUNS?findMergeTarget(incoming,ctx.runs as any,{incomingStartMs:p.startMs}):null;
      if(dup){
        const merged=mergeRuns(dup as any,incoming,'watch');
        setRuns(prev=>prev.map(r=>r.id===dup.id?({...r,...merged} as any):r));
        // 경로가 폰에 없고 워치에만 있으면 사이드카도 채운다(지도 유실 방지).
        if(routeStr&&!String((dup as any).route||'')){
          try{await AsyncStorage.setItem('route_'+dup.id,routeStr);}catch{/* 비치명적 */}
        }
        // ── 숫자가 바뀌었으면 말한다 (2026-08-07 감사) ─────────────────────────
        // 병합은 거리·시간·심박을 워치 값으로 덮는다. 그런데 여기서 조용히 return 해서
        // **사용자는 완주 화면에서 5.14km 를 보고 축하까지 받은 뒤, 기록 탭에 들어가면
        // 5.36km 를 본다.** 아무 설명이 없으니 "앱이 숫자를 조작한다"로 읽힌다.
        // (워치 런 수신 토스트는 새 런을 만들 때만 뜨고 이 분기엔 없었다.)
        //
        // 자동으로 고른 값이면 왜 그런지 한 줄은 말해야 한다. 거리가 실제로 달라진
        // 경우에만 띄운다 — 같은 값이면 알릴 것이 없다.
        const beforeKm=Number((dup as any).km)||0;
        const afterKm=Number((merged as any).km)||0;
        if(beforeKm>0&&Math.abs(afterKm-beforeKm)>=0.01){
          showToast({message:`워치 기록으로 거리를 ${afterKm.toFixed(2)}km 로 맞췄어요`,durationMs:4000});
        }
        return; // 새 런을 만들지 않는다 — 신발 이중 차감의 근본 차단.
      }
      // 측정 모드에선 두 건이 나란히 남으므로 어느 쪽이 워치인지 메모로 구분해 준다
      // (정상 모드에선 병합돼 한 건이라 메모가 필요 없다).
      const watchMemo=MERGE_PHONE_WATCH_RUNS?'':'⌚️ 워치 기록 (측정 모드 — 폰 기록과 비교용)';
      const newId=await ctx.addRun(shoeId,p.km,date,watchMemo,'watch',Math.round(p.durationS),Math.round(p.cadence),routeStr,'',Math.round(p.avgBpm),elevM,Math.round(p.kcal),{startMs:p.startMs});
      // ⚠️ 워치 페이로드에는 최대 심박이 없다(avgBpm 만 온다). **지어내지 않는다** —
      // 워치가 러닝 끝에 따로 보내는 심박 트랙(onWatchHrTrack → saveWatchHrTrack)이
      // 도착하면 repairAvgBpm 이 레코드의 평균·최대를 그 실측에서 채운다.
      // 워치 런 계측(2026-08-04 출시 운영 감사 L-11). 이전엔 이 경로에 계측이 없어
      // **워치 사용량이 통째로 보이지 않았다** — device:'watch' 값이 프로덕션에서 한 번도
      // 전송된 적이 없었다(테스트 파일에만 존재). 워치는 가장 많은 시간을 쏟은 영역 중
      // 하나인데, 얼마나 쓰이는지 모르면 더 투자할지 말지 판단할 근거가 없다.
      //
      // ⚠️ 콘솔에서 읽을 때 주의: **워치 런에는 짝이 되는 kg_run_start 가 없다.** 러닝은
      // 워치에서 시작됐고 폰은 끝난 뒤에 결과만 받기 때문이다. 그래서 '시작→저장' 완주율은
      // 반드시 device='phone' 으로 걸러서 봐야 하고, 워치는 저장 건수만 따로 읽는다.
      // 여기서 가짜 start 를 쏘면 숫자는 예뻐지지만 그 순간 지표가 거짓말이 된다.
      //
      // 중복 수신(dup)일 때는 위에서 이미 return 했으므로 여기 오지 않는다 — 새 런만 센다.
      if(newId){
        trackRunSave({km:p.km,durationSec:Math.round(p.durationS),device:'watch',hadGps:!!routeStr});
      }
      // 트랙 런이면 track_<id> 마커 저장 — 폰 RunDetail 이 '트랙·Nm×N랩' 표시(폰 트랙 런과
      // 동일 계약). 거리(랩수×랩거리)·시간은 이미 레코드에 있으므로 메타만 얹는다.
      if(newId&&p.laps>0&&p.lapM>0){
        try{await AsyncStorage.setItem('track_'+newId,JSON.stringify({lapM:Math.round(p.lapM),laps:Math.round(p.laps),lapTimes:(p.lapTimes||[]).map(t=>Math.round(t))}));}catch{/* 비치명적 */}
      }
      // 구간 스플릿(초/km) → splits_<id> 사이드카(폰 GPS 런과 동일 {km,paceSec,elevM} 포맷).
      // 각 km 이 1km라 paceSec=그 구간 시간. 2구간 미만이면 표시 가치 없어 생략(폰과 동일).
      if(newId&&Array.isArray(p.splitsS)&&p.splitsS.length>=2){
        try{await AsyncStorage.setItem('splits_'+newId,JSON.stringify(p.splitsS.map((sec,i)=>({km:i+1,paceSec:Math.round(sec),elevM:0}))));}catch{/* 비치명적 */}
      }
      // 심박 사이드카 안전망(버그픽스 2026-07-22 — 상세에 심박 존 카드가 영영 안 뜨던 회귀):
      // 워치 런도 폰 런 저장 경로와 동일하게 '실제 러닝 시간창'으로 HR 보강 대기에 등록한다.
      // 등록이 없으면 ① 워치 직송 심박(onWatchHrTrack)이 매칭 상대를 못 찾아 버려지고
      // ② HK 백필 재시도도 대상이 없어, hrTrack_<id> 가 영영 비었다(복구 루프의 updatedAt
      // 역산 창은 늦게 가져온 워치 런에선 실제 러닝 시각과 어긋나 못 채운다).
      if(newId){
        const durMs=Math.max(1,Math.round(p.durationS))*1000;
        const wStart=p.startMs>0?p.startMs:Date.now()-durMs;
        void registerRunForHr(newId,wStart,wStart+durMs,Date.now()).catch(e=>recordError(e,'healthkit: register watch run for HR backfill'));
        // 워치→폰 HK 동기화 지연 대비 — 폰 런 저장과 동일한 15s·60s 재백필.
        setTimeout(()=>{void retryPendingHr(Date.now(),hkBackfillAndRepair).catch(()=>{});},15000);
        setTimeout(()=>{void retryPendingHr(Date.now(),hkBackfillAndRepair).catch(()=>{});},60000);
      }
      showToast({message:'워치 러닝을 가져왔어요'});
    }catch(e){reportIssue('watch run sync',e);}
  // hkBackfillAndRepair 는 ref 기반(runsForHrRef)이라 첫 렌더 인스턴스로 충분 — 재구독 불필요.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }),[]);
}
