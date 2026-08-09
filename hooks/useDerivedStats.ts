// ============================================================================
// hooks/useDerivedStats.ts — 기록·신발·프로필 화면이 읽는 파생 통계
// ----------------------------------------------------------------------------
// App.tsx 에서 분리(2026-08-09 분해 6단계). **동작 변경 0 — 순수 이동이다.**
//
// 왜 이 경계인가: 여기 있는 것은 전부 **읽기 전용 파생값**이다 — 상태를 바꾸지도,
// 저장하지도, 구독하지도 않는다. 입력(runs·shoes·unit·now)이 같으면 결과가 같다.
// 그런 계산이 상태 변경·구독 코드와 같은 파일에 섞여 있으면, 읽는 사람이 매번
// "이건 뭘 바꾸나"를 확인해야 한다. 여기 있는 것은 아무것도 안 바꾼다.
//
// ⚠️ **메모를 걷어내지 말 것.** 2026-08-04 갤럭시 S10e 실측에서, `now` 가 렌더마다
// 새 객체라 아래 파생 체인(주/월/년 필터 → 버킷 → 요약 → 차트 → 배지 → 기록)이
// **전부 매 렌더 재계산**되고 있었다. 그래서 App.tsx 는 `now` 를 날짜 단위로
// 안정화해 넘긴다 — 이 파일은 그 계약 위에 서 있다.
// ============================================================================

import {useMemo, useCallback} from 'react';
import {kmToDisplay, displayNum} from '../lib/units';
import type {Unit} from '../lib/units';
import {
  summaryOf, sumKm, weekBuckets, monthBuckets, yearBuckets,
  totalTimeLabel, avgPaceLabel, maxDayStreak, durationLabel,
} from '../lib/stats';
import {lastWornDate} from '../lib/shoeRecommend';
import {personalRecords} from '../lib/goals';
import {ymdLocal, fmtKDate, fmtTime} from '../lib/format';
import {getProgression} from '../lib/progression';
import type {ProgressionState, ContextChallengeInput} from '../lib/progression/types';
import type {HomeProgression} from '../HomeScreen.rn';
import type {PeriodSummary, PeriodChart} from '../HistoryScreen.rn';
import type {Profile, Badge, PersonalRecord} from '../ProfileScreen.rn';
import type {ShoeTotals} from '../ShoesScreen.rn';

const DEFAULT_PROFILE_NAME = '러너';

export function useDerivedStats({
  runs, shoes, unit, now, mon, weekRuns,
  progState, profileName, homeProgression, contextChallenges,
}: {
  runs: BackendRun[];
  shoes: BackendShoe[];
  unit: Unit;
  now: Date;
  mon: Date;
  weekRuns: BackendRun[];
  progState: ProgressionState | null;
  profileName: string;
  homeProgression: HomeProgression;
  contextChallenges: ContextChallengeInput[];
}) {
  // ── history summary + chart per period ─────────────────────
  const monthRuns=useMemo(()=>runs.filter(r=>String(r.run_date).startsWith(ymdLocal(now).slice(0,7))),[runs,now]);
  const yearRuns=useMemo(()=>runs.filter(r=>String(r.run_date).startsWith(String(now.getFullYear()))),[runs,now]);
  // 기간 요약: 거리(km)만 표시 단위로 환산하고 나머지(횟수/페이스/시간)는 그대로.
  const mkSummary=useCallback((list:any[]):PeriodSummary=>({...summaryOf(list),km:kmToDisplay(sumKm(list),unit).toFixed(1)}),[unit]);
  const summary:Record<string,PeriodSummary>=useMemo(()=>({
    '주':mkSummary(weekRuns),'월':mkSummary(monthRuns),'년':mkSummary(yearRuns),'전체':mkSummary(runs),
  }),[weekRuns,monthRuns,yearRuns,runs,mkSummary]);
  // 차트 데이터도 표시 단위로 환산(막대 높이·우측 km 눈금 라벨이 함께 단위를 따른다).
  // week chart: daily Mon..Sun
  const weekData=useMemo(()=>weekBuckets(runs,mon).map(v=>displayNum(v,unit,1)),[runs,mon,unit]);
  // month chart: weekly buckets
  const monthData=useMemo(()=>monthBuckets(monthRuns,now.getFullYear(),now.getMonth()),[monthRuns,now]);
  const weekCount=monthData.length;
  // year chart: monthly Jan..Dec
  const yearData=useMemo(()=>yearBuckets(yearRuns),[yearRuns]);
  const chart:Record<string,PeriodChart>=useMemo(()=>({
    '주':{title:'일별 거리',data:weekData,labels:['월','화','수','목','금','토','일']},
    '월':{title:'주간 거리',data:monthData.map(v=>displayNum(v,unit,1)),labels:Array.from({length:weekCount},(_,i)=>`${i+1}주`)},
    '년':{title:'월별 거리',data:yearData.map(v=>displayNum(v,unit,0)),labels:['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']},
  }),[weekData,monthData,yearData,weekCount,unit]);

  // ── per-shoe totals (for shoe detail) ──────────────────────
  // 신발마다 런 전량을 훑는 O(신발×런) — homeForecasts 와 같은 이유로 메모한다(Q-12).
  const shoeTotals:Record<number,ShoeTotals>=useMemo(()=>{
  const acc:Record<number,ShoeTotals>={};
  shoes.forEach((s,i)=>{
    const list=runs.filter(r=>r.shoe_id===s.id);
    // 마지막 착용일(런에서 파생) → 한국어 표기. 미착용이면 undefined로 둬 화면에서 생략.
    const worn=lastWornDate(s.id,runs);
    // 누적 러닝 시간은 서버 truth(run_time, 초)를 우선한다 — 다른 기기의 미동기 런까지
    // 반영된 값. 없으면 로컬 런 로그 합산으로 폴백한다(audit#9/#10).
    const serverSec=Number(s.run_time);
    const useServer=Number.isFinite(serverSec)&&serverSec>0;
    const totalSec=useServer?serverSec:list.reduce((a,r)=>a+(Number(r.duration)||0),0);
    const totalTime=useServer?durationLabel(serverSec):totalTimeLabel(list);
    // 신발별 평균 페이스(기록 있는 런만, lib/stats). 신발끼리 페이스 비교용으로 상세·목록에 노출.
    acc[i]={totalRuns:list.length,totalTime,totalSec,avgPace:avgPaceLabel(list),lastWorn:worn?fmtKDate(worn).date:undefined};
  });
  return acc;
  },[shoes,runs]);

  // ── profile ─────────────────────────────────────────────────
  const totalKm=useMemo(()=>Math.round(sumKm(runs)),[runs]);
  const totalSec=runs.reduce((a,r)=>a+(r.duration||0),0);
  const firstDate=runs.length?runs.reduce((m:string,r:any)=>r.run_date<m?r.run_date:m,runs[0].run_date):'';
  const since=firstDate?(()=>{const d=new Date(firstDate+'T00:00:00');return `${d.getFullYear()}년 ${d.getMonth()+1}월부터`;})():'';
  const streak=useMemo(()=>maxDayStreak(runs.map(r=>r.run_date).filter(Boolean)),[runs]);
  // 프로필 신원 블록(스펙): Rank·장착 타이틀 + 업적 수·은퇴 신발 수. getProgression 은
  // homeProgression 과 동일 참조라 메모 히트(재계산 없음). 은퇴 수는 영속 레코드 권위.
  const profView=getProgression(runs,shoes,progState??undefined,undefined,contextChallenges);
  const achievementCount=profView.achievements.filter(a=>a.unlocked).length;
  const profile:Profile={
    name:profileName||DEFAULT_PROFILE_NAME, since, totalKm:displayNum(sumKm(runs),unit,0), totalRuns:runs.length,
    totalTime:String(Math.round(totalSec/3600)),
    // 신원 칩은 진척 시스템의 단일 Rank(티어)로 통일 — 옛 '러닝 레벨 N'(km/100) 폐기.
    rankTier:homeProgression.tier,
    equippedTitle:homeProgression.equippedTitle,
    achievementCount,
    retiredShoes:progState?.retiredShoes?.length??0,
  };
  const badges:Badge[]=useMemo(()=>[
    {icon:'trophy',label:'100km',on:totalKm>=100},
    {icon:'flame',label:'7일 연속',on:streak>=7},
    {icon:'flash',label:'10회 달성',on:runs.length>=10},
    {icon:'map',label:'하프',on:runs.some(r=>parseFloat(String(r.km))>=21.1)},
  ],[totalKm,streak,runs]);
  // 개인 기록(PR) 프로필 카드: 1km/5km 최고 기록·최장 거리. 거리·시간이 모두 양수인
  // 런만 산정에 쓴다(personalRecords 순수함수). 거리 최고는 전부 '완주 시간' 표기로 통일
  // (러닝 관례 — 과거 1km 만 페이스 /km 라 5km 와 섞였다, 사용자 지적 2026-07-16).
  const prRuns=runs.map(r=>({run_date:String(r.run_date),km:parseFloat(String(r.km))||0,durationS:r.duration||0}));
  const pr=useMemo(()=>personalRecords(prRuns),[prRuns]);
  const records:PersonalRecord[]=useMemo(()=>[
    {icon:'flash-outline',label:'1km 최고 기록',value:pr.fastest1k!=null?fmtTime(Math.round(pr.fastest1k)):'--',unit:''},
    {icon:'timer-outline',label:'5km 최고 기록',value:pr.fastest5k!=null?fmtTime(Math.round(pr.fastest5k)):'--',unit:''},
    {icon:'trending-up-outline',label:'최장 거리',value:pr.longest!=null?String(displayNum(pr.longest,unit,2)):'--',unit:pr.longest!=null?unit:''},
  ],[pr,unit]);
  return {summary, chart, shoeTotals, profile, badges, records};
}
