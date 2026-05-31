import React, {useState, useEffect, useRef} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, StatusBar,
  PermissionsAndroid, Platform,
} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';
import {accelerometer, setUpdateIntervalForType, SensorTypes} from 'react-native-sensors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Tts from 'react-native-tts';

import {
  BG, CARD_HI as SURFACE, ACCENT, WARN, DANGER, T1, T3,
  FONT as FP, DISPLAY as FH, SEP, Shoe, Run,
} from './theme';
import {Ring} from './primitives';
import HomeScreen, {WeekStats} from './HomeScreen.rn';
import HistoryScreen, {PeriodSummary, PeriodChart} from './HistoryScreen.rn';
import ShoesScreen, {ShoeTotals} from './ShoesScreen.rn';
import ProfileScreen, {Profile, Badge} from './ProfileScreen.rn';
import AddShoeScreen from './AddShoeScreen.rn';
import {RunStart} from './RunScreen.rn';

import {KalmanFilter} from './lib/kalman';
import {calcDist, acceptSegment, segmentSpeedMps, simplifyRoute} from './lib/geo';
import {WARMUP_FIXES} from './lib/engineConstants';
import {decideAutoPause, initAutoPauseState} from './lib/autoPause';
import {
  buildForegroundServiceConfig, needsBackgroundLocationPermission,
} from './lib/foregroundService';
import {initCadenceState, feedAccelSample} from './lib/cadence';
import {fmtPace, fmtTime, fmtKDate, getMonday, ymdLocal} from './lib/format';
import {
  sumKm, avgPaceLabel, totalTimeLabel, summaryOf, maxDayStreak,
  weekBuckets, monthBuckets, yearBuckets,
} from './lib/stats';
import {parseShoeName, shoeHealth, isRetired, DEFAULT_MAX_KM} from './lib/shoe';
import {
  saveSnapshot, loadSnapshot, clearSnapshot, isResumable,
  enqueuePendingRun, removePendingRun, flushPendingRuns,
  reconcilePendingWithServer,
  RunSnapshot, PendingRun,
} from './lib/runPersistence';

const API = 'https://solelife-backend.onrender.com';

function nowTimeLabel():string{
  const n=new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

function today():string{return ymdLocal(new Date());}

export default function App(){
  return(
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={BG}/>
      <Main/>
    </SafeAreaProvider>
  );
}

function Main(){
  const [tab,setTab]=useState(0);                 // 0 home · 1 history · 2 shoes · 3 profile
  const [userId,setUserId]=useState<string|null>(null);
  const [shoes,setShoes]=useState<any[]>([]);
  const [runs,setRuns]=useState<any[]>([]);
  const [overlay,setOverlay]=useState<'none'|'add'|'goal'|'run'>('none');
  const [pendingShoe,setPendingShoe]=useState<{id:string;name:string;ui:Shoe}|null>(null);
  const [activeRun,setActiveRun]=useState<{id:string;name:string;goalKm:number}|null>(null);
  // audit#2: 앱 시작 시 감지된 미완료 런 스냅샷. 사용자가 '복구' 선택 시 done
  // 화면으로 시드되어 검토 후 저장/버리기를 결정한다(데이터 유실 금지).
  const [resumeSnap,setResumeSnap]=useState<RunSnapshot|null>(null);
  const insets=useSafeAreaInsets();

  useEffect(()=>{initUser();},[]);

  // audit#2: 미완료 런 감지 → 복구/저장 프롬프트. 한 번만 묻는다.
  useEffect(()=>{
    let asked=false;
    (async()=>{
      const snap=await loadSnapshot();
      if(asked||!isResumable(snap)||!snap) return;
      asked=true;
      Alert.alert(
        '미완료 런 발견',
        `${snap.dist.toFixed(2)}km · ${fmtTime(snap.elapsed)} 기록이 남아 있습니다.\n복구해서 저장하시겠어요?`,
        [
          {text:'버리기',style:'destructive',onPress:()=>{void clearSnapshot();}},
          {text:'복구',onPress:()=>{
            setActiveRun({id:snap.shoe.id,name:snap.shoe.name,goalKm:snap.goalKm});
            setResumeSnap(snap);
            setOverlay('run');
          }},
        ],
      );
    })();
  },[]);

  async function initUser(){
    let did=await AsyncStorage.getItem('device_id');
    if(!did){did='sl_'+Date.now()+'_'+Math.random().toString(36).substr(2,9);await AsyncStorage.setItem('device_id',did);}
    try{
      const r=await fetch(API+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_id:did})});
      const d=await r.json();setUserId(d.user_id);
      const[sr,rr]=await Promise.all([fetch(API+'/api/shoes?user_id='+d.user_id),fetch(API+'/api/runs?user_id='+d.user_id)]);
      const sd=await sr.json();const rd=await rr.json();
      const safeShoes=Array.isArray(sd)?sd:[];
      const safeRuns=Array.isArray(rd)?rd:[];
      const runsWithRoute=await Promise.all(safeRuns.map(async(run:any)=>{
        let merged={...run};
        if(!merged.route&&merged.id){const local=await AsyncStorage.getItem('route_'+merged.id);if(local) merged={...merged,route:local};}
        if(!merged.run_time&&merged.id){const localTime=await AsyncStorage.getItem('time_'+merged.id);if(localTime) merged={...merged,run_time:localTime};}
        return merged;
      }));
      setShoes(safeShoes);setRuns(runsWithRoute);
      checkShoeAlerts(safeShoes,safeRuns);
      // audit#3 재동기: 네트워크 실패로 큐에 남은 완주 런을 재전송. 서버 런 목록과
      // 사용자 id를 갓 받은 값으로 넘겨, 재-POST 전 클라이언트 화해로 중복을 막는다.
      await syncPendingRuns(safeRuns,d.user_id);
    }catch(e){console.log('offline');}
  }

  // audit#3 재동기 진입점(저장/네트워크 분리). 두 단계로 중복 행을 막는다:
  //   1) reconcilePendingWithServer — 서버가 이미 가진 런(시그니처/echo localId
  //      매칭)은 재-POST 없이 큐에서 제거. POST 성공 후 dequeue 영속 전에 프로세스가
  //      죽어 큐에 남은 런이 다음 실행에서 중복 POST되는 윈도우를 닫는다.
  //   2) flushPendingRuns — 남은 런만 postRun으로 재전송. 실패하면 큐에 보존.
  async function syncPendingRuns(serverRuns:any[],uid?:string|null){
    const {dropped}=await reconcilePendingWithServer(serverRuns);
    // dequeue(드롭)된 각 런의 route_/time_<localId> 로컬키 제거. addRun이 기록한
    // 이 키들은 reconcileSynced(POST 경로)가 정리하지만, 서버가 이미 가진 런을
    // 재-POST 없이 큐에서 드롭하는 이 경로에서는 정리되지 않아 영구 누수된다
    // (모든 dedup마다 큰 route blob 적체). reconcileSynced와 동일하게 제거한다.
    for(const d of dropped){
      await AsyncStorage.removeItem('route_'+d.localId);
      await AsyncStorage.removeItem('time_'+d.localId);
    }
    await flushPendingRuns(async(p)=>{
      const server=await postRun(p,uid);
      await reconcileSynced(p,server);
    });
  }

  async function addShoe(name:string,maxKm:number,startKm:number,date:string){
    try{
      const r=await fetch(API+'/api/shoes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,name,max_km:maxKm,start_km:startKm,purchase_date:date})});
      const newShoe=await r.json();
      setShoes(prev=>[newShoe,...prev]);
    }catch(e){Alert.alert('오류','저장 실패');}
  }

  async function updateShoeName(id:string,name:string){
    try{
      await fetch(API+'/api/shoes/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,name})});
      setShoes(prev=>prev.map(s=>s.id===id?{...s,name}:s));
    }catch(e){Alert.alert('오류','수정 실패');}
  }

  // 신발 삭제는 더 이상 런 기록을 동반삭제하지 않는다(iron law: 데이터 파괴 금지).
  // 런은 보존되어 기록/통계에 남고, 신발만 잠금장(locker)에서 제거된다. 신발을
  // 영구히 지우는 대신 보존이 목적이면 retireShoe(보관)를 쓴다.
  async function deleteShoe(id:string){
    try{
      await fetch(API+'/api/shoes/'+id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId})});
      setShoes(prev=>prev.filter(s=>s.id!==id));
    }catch(e){Alert.alert('오류','삭제 실패');}
  }

  // 보관(retire/archive): 신발을 선택목록·홈 picker에서 숨기되 신발과 런 기록은
  // 모두 보존한다. retired 토글이므로 복원도 가능하다.
  async function retireShoe(id:string,retired:boolean){
    try{
      await fetch(API+'/api/shoes/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,retired})});
      setShoes(prev=>prev.map(s=>s.id===id?{...s,retired}:s));
    }catch(e){Alert.alert('오류',retired?'보관 처리 실패':'복원 실패');}
  }

  // 완주 런 저장(audit#3): 로컬 우선 + 미동기 큐. 저장(AsyncStorage)과 네트워크
  // (POST)를 분리해 부분성공 desync를 막는다.
  //   1) enqueuePendingRun + 낙관적 setRuns — 네트워크 try 밖에서 먼저 영속화하므로
  //      여기서 크래시/네트워크 단절이 나도 route/run이 소실되지 않는다(iron law).
  //   2) postRun(네트워크)을 별도로 시도 — 성공 시 서버 id로 화해 + 큐 제거,
  //      실패 시 큐에 남겨 다음 flushPendingRuns가 재전송.
  async function addRun(shoeId:string,km:number,date:string,memo:string,source:string,duration?:number,cadence?:number,route?:string,location?:string,heart_rate?:number){
    const timeStr=nowTimeLabel();
    const localId='run_'+Date.now()+'_'+Math.random().toString(36).slice(2,9);
    const pending:PendingRun={
      localId, shoe_id:shoeId, km, run_date:date, memo:memo||'', source,
      duration:duration||0, cadence:cadence||0, route:route||'', location:location||'',
      heart_rate:heart_rate||0, run_time:timeStr, queuedAt:Date.now(),
    };

    // ── 1) 로컬 우선 영속화(네트워크 try 밖) ──
    await enqueuePendingRun(pending);
    if(route) await AsyncStorage.setItem('route_'+localId, route);
    await AsyncStorage.setItem('time_'+localId, timeStr);
    setRuns(prev=>[{id:localId,shoe_id:shoeId,km,run_date:date,duration:duration||0,
      cadence:cadence||0,memo:memo||'',route:route||'',run_time:timeStr,_pending:true},...prev]);

    // ── 2) 네트워크 동기화(별도 try). 실패해도 위 로컬 기록·큐는 보존된다. ──
    try{
      const server=await postRun(pending);
      await reconcileSynced(pending,server);
    }catch(e){/* 큐에 남아 다음 실행/포그라운드에서 재동기 */}
  }

  // 단일 POST 경로 — addRun과 startup 재동기(syncPendingRuns)가 공유한다. uid는
  // 명시 주입 가능(initUser는 setUserId 직후라 state가 아직 갱신 전이므로 갓 받은
  // user_id를 직접 넘긴다). localId를 멱등 키로 함께 전송 — 현재 백엔드는 무시하나,
  // echo back 시 서버 dedup/클라이언트 화해에 쓰이는 forward-compat 키.
  async function postRun(p:PendingRun,uid?:string|null):Promise<any>{
    const user=uid??userId;
    const r=await fetch(API+'/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:user,localId:p.localId,shoe_id:p.shoe_id,km:p.km,run_date:p.run_date,memo:p.memo,source:p.source,duration:p.duration,cadence:p.cadence,route:p.route,location:p.location,heart_rate:p.heart_rate})});
    if(!r||!r.ok) throw new Error('run POST failed');
    return r.json();
  }

  // 동기 성공 후 화해: 큐 제거를 먼저 영속(POST↔dequeue 윈도우 최소화 → 중복 재-POST
  // 방지), 그다음 서버 id로 route_/time_ 재키잉 + 원본 localId 키 제거(dead-key 누수
  // 방지), 마지막으로 낙관적 항목을 서버 항목으로 교체. localId/serverId 중복은 제거.
  async function reconcileSynced(p:PendingRun,server:any){
    const serverId=server&&server.id!=null?server.id:null;
    // (c) 다른 어떤 작업보다 먼저 dequeue를 영속한다.
    await removePendingRun(p.localId);
    if(serverId){
      if(p.route) await AsyncStorage.setItem('route_'+serverId, p.route);
      if(p.run_time) await AsyncStorage.setItem('time_'+serverId, p.run_time);
      // serverId로 재키잉했으므로 localId 원본 키는 죽은 키 — 제거해 누수를 막는다.
      if(String(serverId)!==p.localId){
        await AsyncStorage.removeItem('route_'+p.localId);
        await AsyncStorage.removeItem('time_'+p.localId);
      }
    }
    const merged={...(server||{}),id:serverId??p.localId,shoe_id:p.shoe_id,km:p.km,run_date:p.run_date,
      duration:p.duration,cadence:p.cadence,memo:p.memo,route:p.route||((server&&server.route)||''),
      run_time:p.run_time,_pending:false};
    setRuns(prev=>[merged,...prev.filter(r=>r.id!==p.localId&&(serverId==null||r.id!==serverId))]);
  }

  async function checkShoeAlerts(shoeList:any[],runList:any[]){
    try{
      if(!Array.isArray(shoeList)||!Array.isArray(runList)) return;
      const lastAlert=await AsyncStorage.getItem('shoe_alert_date');
      if(lastAlert===today()) return;
      // 수명 비례 티어(shoeHealth) 기준 '교체' 신발만 알림. 보관된 신발은 제외.
      const critical=shoeList.filter((s:any)=>!isRetired(s)&&shoeHealth(s,runList).condition==='교체');
      if(critical.length>0){
        await AsyncStorage.setItem('shoe_alert_date',today());
        Alert.alert('신발 교체 알림',critical.map((s:any)=>s.name).join(', ')+'\n\n수명의 90% 이상을 사용했습니다.\n새 신발을 준비하세요!',[{text:'확인'}]);
      }
    }catch(e){console.log('checkShoeAlerts error',e);}
  }

  // ── adapters: backend → presentational shapes ──────────────
  function toUiShoe(s:any):Shoe{
    // 단일 소스(shoeHealth)에서 used/남은수명/condition을 도출 — 하드코딩 100km
    // 임계·중복 used 계산 제거(audit#7).
    const h=shoeHealth(s,runs);
    const {brand,model}=parseShoeName(s.name);
    return {
      id:s.id,
      brand:brand||s.name,
      model:model||(brand?'':s.name),
      used:Math.round(h.usedKm),
      max:s.max_km||DEFAULT_MAX_KM,
      condition:h.condition,
      retired:isRetired(s),
    };
  }

  const uiShoes:Shoe[]=shoes.map(toUiShoe);
  const idxById:Record<string,number>={};
  shoes.forEach((s,i)=>{idxById[s.id]=i;});

  // 홈/러닝 picker용 목록: 보관된 신발은 숨기되 원본 인덱스를 보존해 시작 액션이
  // 올바른 신발을 가리키게 한다(런 기록은 잠금장·통계에 그대로 남는다).
  const homeShoes=shoes.map((s,i)=>({raw:s,ui:uiShoes[i]})).filter(x=>!isRetired(x.raw));
  const homeUiShoes:Shoe[]=homeShoes.map(x=>x.ui);

  const sortedRaw=[...runs].sort((a,b)=>String(b.run_date).localeCompare(String(a.run_date)));
  function toUiRun(run:any):Run{
    const km=parseFloat(run.km)||0;
    const dur=run.duration||0;
    const {date,day,dateNum}=fmtKDate(run.run_date);
    return {
      id:run.id, date, day, dateNum,
      dist:Math.round(km*100)/100,
      pace:dur>0&&km>0.1?fmtPace(km,dur):'--',
      time:dur>0?fmtTime(dur):'--',
      shoe:idxById[run.shoe_id]??-1,
      cal:0, cadence:run.cadence||0, bpm:run.heart_rate||0, elev:0,
    };
  }
  const uiRuns:Run[]=sortedRaw.map(toUiRun);

  // ── home week stats ────────────────────────────────────────
  const now=new Date();
  const mon=getMonday(now); const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  const weekRuns=runs.filter(r=>r.run_date>=ymdLocal(mon)&&r.run_date<=ymdLocal(sun));
  const week:WeekStats={km:sumKm(weekRuns).toFixed(1),runs:weekRuns.length,pace:avgPaceLabel(weekRuns)};
  const dateLabel=`${now.getMonth()+1}월 ${now.getDate()}일 ${['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][now.getDay()]}`;

  // ── history summary + chart per period ─────────────────────
  const monthRuns=runs.filter(r=>String(r.run_date).startsWith(ymdLocal(now).slice(0,7)));
  const yearRuns=runs.filter(r=>String(r.run_date).startsWith(String(now.getFullYear())));
  const summary:Record<string,PeriodSummary>={
    '주':summaryOf(weekRuns),'월':summaryOf(monthRuns),'년':summaryOf(yearRuns),'전체':summaryOf(runs),
  };
  // week chart: daily Mon..Sun
  const weekData=weekBuckets(runs,mon).map(v=>Math.round(v*10)/10);
  // month chart: weekly buckets
  const monthData=monthBuckets(monthRuns,now.getFullYear(),now.getMonth());
  const weekCount=monthData.length;
  // year chart: monthly Jan..Dec
  const yearData=yearBuckets(yearRuns);
  const chart:Record<string,PeriodChart>={
    '주':{title:'일별 거리',data:weekData,labels:['월','화','수','목','금','토','일']},
    '월':{title:'주간 거리',data:monthData.map(v=>Math.round(v*10)/10),labels:Array.from({length:weekCount},(_,i)=>`${i+1}주`)},
    '년':{title:'월별 거리',data:yearData.map(v=>Math.round(v)),labels:['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']},
  };

  // ── per-shoe totals (for shoe detail) ──────────────────────
  const shoeTotals:Record<number,ShoeTotals>={};
  shoes.forEach((s,i)=>{const list=runs.filter(r=>r.shoe_id===s.id);shoeTotals[i]={totalRuns:list.length,totalTime:totalTimeLabel(list)};});

  // ── profile ─────────────────────────────────────────────────
  const totalKm=Math.round(sumKm(runs));
  const totalSec=runs.reduce((a,r)=>a+(r.duration||0),0);
  const firstDate=runs.length?runs.reduce((m:string,r:any)=>r.run_date<m?r.run_date:m,runs[0].run_date):'';
  const since=firstDate?(()=>{const d=new Date(firstDate+'T00:00:00');return `${d.getFullYear()}년 ${d.getMonth()+1}월부터`;})():'';
  const streak=maxDayStreak(runs.map(r=>r.run_date).filter(Boolean));
  const profile:Profile={
    name:'러너', since, totalKm, totalRuns:runs.length,
    totalTime:String(Math.round(totalSec/3600)),
    level:`러닝 레벨 ${Math.floor(totalKm/100)+1}`,
  };
  const badges:Badge[]=[
    {icon:'trophy',label:'100km',on:totalKm>=100},
    {icon:'flame',label:'7일 연속',on:streak>=7},
    {icon:'flash',label:'10회 달성',on:runs.length>=10},
    {icon:'map',label:'하프',on:runs.some(r=>parseFloat(r.km)>=21.1)},
  ];

  // ── actions ─────────────────────────────────────────────────
  // i는 homeUiShoes(보관 신발 제외 목록)의 인덱스 — 원본 신발로 되짚어 시작한다.
  const startFromIdx=(i:number)=>{
    const entry=homeShoes[i]; if(!entry) return;
    setPendingShoe({id:entry.raw.id,name:entry.raw.name,ui:entry.ui});
    setOverlay('goal');
  };
  const onAddSaved=(shoe:Shoe)=>{
    addShoe(`${shoe.brand} ${shoe.model}`.trim(),shoe.max,shoe.used,today());
    setOverlay('none');
  };

  // ── render ──────────────────────────────────────────────────
  if(overlay==='add'){
    return <AddShoeScreen onClose={()=>setOverlay('none')} onSave={onAddSaved}/>;
  }
  if(overlay==='goal'&&pendingShoe){
    return (
      <RunStart
        shoe={pendingShoe.ui}
        onClose={()=>{setOverlay('none');setPendingShoe(null);}}
        onStart={(km)=>{setActiveRun({id:pendingShoe.id,name:pendingShoe.name,goalKm:km});setOverlay('run');}}
      />
    );
  }
  if(overlay==='run'&&activeRun){
    return (
      <RunActiveScreen
        shoe={activeRun}
        insets={insets}
        goalKm={activeRun.goalKm}
        resume={resumeSnap}
        onSave={async(km,dur,cad,memo,route,location)=>{
          await addRun(activeRun.id,km,today(),memo||'','gps',dur,cad,route,location);
          await clearSnapshot();
          setResumeSnap(null);setActiveRun(null);setOverlay('none');setTab(1);
        }}
        onDiscard={()=>{void clearSnapshot();setResumeSnap(null);setActiveRun(null);setOverlay('none');}}
      />
    );
  }

  return(
    <View style={{flex:1,backgroundColor:BG}}>
      <View style={{flex:1}}>
        {tab===0&&(
          <HomeScreen
            shoes={homeUiShoes} week={week} dateLabel={dateLabel}
            onStart={startFromIdx} onAddShoe={()=>setOverlay('add')} onTab={setTab}
          />
        )}
        {tab===1&&(
          <HistoryScreen shoes={uiShoes} runs={uiRuns} summary={summary} chart={chart} onTab={setTab}/>
        )}
        {tab===2&&(
          <ShoesScreen
            shoes={uiShoes} runs={uiRuns} totals={shoeTotals} activeIdx={0}
            onAddShoe={()=>setOverlay('add')} onTab={setTab}
            onRename={updateShoeName} onDelete={deleteShoe} onRetire={retireShoe}
          />
        )}
        {tab===3&&(
          <ProfileScreen profile={profile} badges={badges} onTab={setTab}/>
        )}
      </View>
    </View>
  );
}

// ─── Live run screen (GPS / sensors / TTS engine + handoff Ring UI) ─────────
function RunActiveScreen({shoe,insets,goalKm,onSave,onDiscard,resume}:{shoe:{id:string;name:string};insets:any;goalKm:number;onSave:(km:number,dur:number,cad:number,memo:string,route:string,location:string)=>Promise<void>;onDiscard:()=>void;resume?:RunSnapshot|null}){
  const ui=parseShoeName(shoe.name);
  // 복구 모드: 미완료 런 스냅샷으로 done 화면을 시드해 검토 후 저장/버리기. GPS는
  // 다시 시작하지 않는다(이미 기록된 거리/경로를 그대로 보존).
  const resumeRoute=resume?(()=>{const sr=simplifyRoute(resume.pts as any,200);return sr.length>=2?JSON.stringify(sr):'';})():'';
  const [phase,setPhase]=useState<'running'|'done'>(resume?'done':'running');
  const [km,setKm]=useState(resume?resume.dist:0);
  const [elapsed,setElapsed]=useState(resume?resume.elapsed:0);
  const [gpsStatus,setGpsStatus]=useState('GPS 신호 찾는 중...');
  const [cadence,setCadence]=useState(resume?resume.cadence:0);
  const [paused,setPaused]=useState(false);
  const [autoPaused,setAutoPaused]=useState(false);
  const [stopConfirm,setStopConfirm]=useState(false);
  const [finKm,setFinKm]=useState(resume?resume.dist:0);
  const [finTime,setFinTime]=useState(resume?resume.elapsed:0);
  const [finCad,setFinCad]=useState(resume?resume.cadence:0);
  const [finRoute,setFinRoute]=useState(resumeRoute);
  const [finLocation,setFinLocation]=useState(resume?resume.location:'');
  const [memo,setMemo]=useState('');
  const [saving,setSaving]=useState(false);

  const watchId=useRef<number|null>(null);
  const timer=useRef<any>(null);
  const snapTimer=useRef<any>(null);
  const stepSub=useRef<any>(null);
  // 케이던스(spm) 순수 상태기계 — 가속도 피크검출+윈도우 정규화는 lib/cadence.ts.
  const cadenceState=useRef(initCadenceState());
  const pts=useRef<any[]>([]);
  const dist=useRef(0);
  const fixIndex=useRef(0);
  const lastGoodMs=useRef(0);
  const lastGood=useRef<{lat:number;lon:number}|null>(null);
  const t0=useRef(Date.now());
  const kf=useRef(new KalmanFilter());
  const cadRef=useRef(0);
  const locationRef=useRef('');
  const locationFetched=useRef(false);
  const isPausedRef=useRef(false);
  const autoPausedRef=useRef(false);
  const pausedMs=useRef(0);
  const pauseStartRef=useRef(0);
  const announcedKm=useRef(0);
  // 자동 일시정지 판정용: 매 fix마다 갱신되는 속도측정 앵커 + 순수 상태기계.
  const autoAnchor=useRef<{lat:number;lon:number}|null>(null);
  const autoAnchorMs=useRef(0);
  const autoPauseState=useRef(initAutoPauseState());
  const stopConfirmTimer=useRef<any>(null);

  useEffect(()=>{
    // 복구 모드는 이미 끝난 런을 검토만 한다 — GPS/센서/권한/TTS를 켜지 않는다.
    if(resume) return;
    (async()=>{
      try{
        Tts.setDefaultLanguage('ko-KR');
        Tts.setDefaultRate(0.52);
        const voices:any[]=await Tts.voices();
        const femaleVoice=voices.find((v:any)=>
          (v.language==='ko-KR'||v.language==='ko')&&
          (v.name?.toLowerCase().includes('female')||v.name?.toLowerCase().includes('여성')||(v.quality&&v.quality>=400))
        );
        if(femaleVoice) Tts.setDefaultVoice(femaleVoice.id);
      }catch(e){}
    })();
    setTimeout(()=>{try{Tts.speak(`달리기를 시작합니다! 목표는 ${goalKm}킬로미터입니다.`);}catch(e){}},800);
    (async()=>{
      if(Platform.OS==='android'){
        const granted=await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {title:'위치 권한',message:'러닝 거리 측정을 위해 위치 권한이 필요합니다.',buttonPositive:'허용',buttonNegative:'거부'}
        );
        if(granted!==PermissionsAndroid.RESULTS.GRANTED){
          Alert.alert('권한 필요','위치 권한을 허용해야 GPS 러닝이 가능합니다.');
          return;
        }
        // audit#1: 화면off/백그라운드 지속 기록(포그라운드 서비스)을 위한 백그라운드
        // 위치 권한(선택). Android 10+에서만 별도 런타임 권한이며, 거부돼도
        // 포그라운드 서비스 트래킹은 계속되므로 막지 않는다(graceful). 이 요청은
        // 기존 fine-location 게이트 통과 후 부가적으로만 시도한다(권한 로직 회귀 금지).
        if(needsBackgroundLocationPermission('android',Number(Platform.Version))){
          try{
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
              {title:'백그라운드 위치 권한',message:'화면을 끄거나 다른 앱을 써도 러닝 거리가 끊기지 않도록 백그라운드 위치 권한을 허용해주세요.',buttonPositive:'허용',buttonNegative:'나중에'},
            );
          }catch{/* 백그라운드 권한 실패는 무시 — 포그라운드 트래킹은 계속된다 */}
        }
      }
      beginRun();
    })();
    return()=>{stop();clearTimeout(stopConfirmTimer.current);try{Tts.stop();}catch(e){}};
  },[]);

  useEffect(()=>{
    const fullKm=Math.floor(km);
    if(fullKm>0&&fullKm>announcedKm.current){
      announcedKm.current=fullKm;
      const remaining=Math.max(0,goalKm-fullKm);
      try{Tts.stop();}catch(e){}
      if(remaining>0){try{Tts.speak(`${fullKm}킬로미터 완주! 앞으로 ${Math.round(remaining)}킬로미터 남았습니다.`);}catch(e){}}
      else{try{Tts.speak(`목표 달성! ${goalKm}킬로미터 완주를 축하합니다!`);}catch(e){}}
    }
  },[km]);

  // ── 일시정지 진입/해제 (audit#4) ───────────────────────────────
  // pauseStartRef를 가드로 사용해 pausedMs 폭주를 막는다: 이미 일시정지 중이면
  // 재진입하지 않고(중복 pauseStart 갱신 금지), 해제 시 pauseStart가 유효할 때만
  // 1회 가산한 뒤 0으로 초기화해 같은 일시정지 구간을 두 번 더하지 않는다.
  function enterPause(auto:boolean){
    if(isPausedRef.current)return;
    isPausedRef.current=true;autoPausedRef.current=auto;
    pauseStartRef.current=Date.now();
    setPaused(true);setAutoPaused(auto);
    try{Tts.stop();Tts.speak(auto?'자동으로 일시정지합니다.':'일시정지합니다.');}catch(e){}
  }
  function exitPause(auto:boolean){
    if(!isPausedRef.current)return;
    if(pauseStartRef.current>0){
      const delta=Date.now()-pauseStartRef.current;
      if(delta>0)pausedMs.current+=delta;
      pauseStartRef.current=0; // 가드: 동일 구간 중복 가산 방지
    }
    isPausedRef.current=false;autoPausedRef.current=false;
    // 재개 후 상태기계 초기화 — 직전 slow/fast 잔여로 즉시 재트리거되지 않게.
    autoPauseState.current=initAutoPauseState();
    setPaused(false);setAutoPaused(false);
    try{Tts.speak('달리기를 재개합니다.');}catch(e){}
    void auto;
  }

  // audit#2: 진행중 런 상태를 수 초마다 스냅샷으로 영속. 순수 저장(네트워크와 무관)
  // 이며, sanitize에서 음수/NaN을 0으로 막아 손상된 스냅샷이 음수 데이터를 만들지
  // 않는다(iron law). 일시정지 중에도 현재 경과를 동일 공식으로 계산해 기록한다.
  function writeSnapshot(){
    const curPausedMs=(isPausedRef.current&&pauseStartRef.current>0)?pausedMs.current+(Date.now()-pauseStartRef.current):pausedMs.current;
    const el=Math.max(0,Math.floor((Date.now()-t0.current-curPausedMs)/1000));
    saveSnapshot({
      dist:dist.current, elapsed:el,
      pts:pts.current.map((p:any)=>({lat:p.lat,lon:p.lon})),
      pausedMs:pausedMs.current, t0:t0.current,
      shoe:{id:shoe.id,name:shoe.name}, goalKm, cadence:cadRef.current,
      location:locationRef.current, savedAt:Date.now(),
    }).catch(()=>{});
  }

  function beginRun(){
    dist.current=0;t0.current=Date.now();kf.current.reset();
    fixIndex.current=0;lastGoodMs.current=0;lastGood.current=null;
    cadenceState.current=initCadenceState();cadRef.current=0;pts.current=[];
    locationRef.current='';locationFetched.current=false;
    isPausedRef.current=false;autoPausedRef.current=false;
    pausedMs.current=0;pauseStartRef.current=0;announcedKm.current=0;
    autoAnchor.current=null;autoAnchorMs.current=0;autoPauseState.current=initAutoPauseState();
    setUpdateIntervalForType(SensorTypes.accelerometer,100);
    stepSub.current=accelerometer.subscribe(({x,y,z})=>{
      // 가속도계는 케이던스(걸음수)만 담당한다. 자동 일시정지/재개는 GPS 속도
      // 기반 상태기계(decideAutoPause)가 watchPosition에서 판정한다.
      if(isPausedRef.current)return;
      const mag=Math.sqrt(x*x+y*y+z*z),nowT=Date.now();
      // 순수함수에 가속도 표본 공급 → 피크검출+분당비율 정규화된 spm 산출(audit#14).
      const c=feedAccelSample(cadenceState.current,mag,nowT);
      cadenceState.current=c.state;
      if(c.spm!==cadRef.current){cadRef.current=c.spm;setCadence(c.spm);}
    });
    timer.current=setInterval(()=>{
      // elapsed = now − t0 − pausedMs (음수 방지로 0 하한). 일시정지 중엔 멈춘다.
      if(!isPausedRef.current){setElapsed(Math.max(0,Math.floor((Date.now()-t0.current-pausedMs.current)/1000)));}
    },1000);
    // 진행중 스냅샷: 즉시 1회 + 3초마다(audit#2). 크래시/강제종료 시 복구 지점이 된다.
    writeSnapshot();
    snapTimer.current=setInterval(writeSnapshot,3000);
    watchId.current=Geolocation.watchPosition(
      pos=>{
        const{latitude:lat,longitude:lon,accuracy:acc}=pos.coords;
        const f=kf.current.process(lat,lon,acc,pos.timestamp);
        setGpsStatus(`정확도 ${Math.round(acc)}m`);
        const idx=fixIndex.current;

        // ── 자동 일시정지/재개 판정 ──────────────────────────────────
        // 매 fix의 구간속도를 상태기계에 공급한다. 워밍업 이후에만 평가하고,
        // 수동 일시정지 중에는 평가하지 않는다(자동 일시정지 구간일 때만 재개 판정).
        if(idx>=WARMUP_FIXES&&autoAnchor.current&&(!isPausedRef.current||autoPausedRef.current)){
          const moved=calcDist(autoAnchor.current.lat,autoAnchor.current.lon,f.lat,f.lon);
          const dtA=Math.max((pos.timestamp-autoAnchorMs.current)/1000,0);
          if(dtA>0){
            const decision=decideAutoPause(autoPauseState.current,segmentSpeedMps(moved,dtA),dtA);
            autoPauseState.current=decision.state;
            if(decision.justPaused)enterPause(true);
            else if(decision.justResumed)exitPause(true);
          }
        }
        // 앵커는 일시정지 중에도 매 fix 갱신 — 재개 판정용 속도를 계속 측정.
        autoAnchor.current={lat:f.lat,lon:f.lon};autoAnchorMs.current=pos.timestamp;

        // 일시정지 동안에는 거리/위치/케이던스를 누적하지 않는다.
        if(isPausedRef.current)return;
        fixIndex.current=idx+1; // running일 때만 fix 소비(워밍업 카운트 일관성)
        if(!locationFetched.current){
          locationFetched.current=true;
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${f.lat}&lon=${f.lon}&format=json&accept-language=ko`,{headers:{'User-Agent':'SoleMate/1.0'}})
            .then(r=>r.json()).then(d=>{
              const addr=d.address||{};
              const parts=[addr.suburb||addr.neighbourhood||addr.quarter||addr.city_district||addr.town,addr.city||addr.county||addr.state].filter(Boolean);
              locationRef.current=parts.length>0?parts.join(', '):(d.display_name||'').split(',').slice(0,2).join(',').trim()||'';
            }).catch(()=>{});
        }
        if(lastGood.current){
          const d=calcDist(lastGood.current.lat,lastGood.current.lon,f.lat,f.lon);
          // dtSec는 distKm와 '같은 두 점'(마지막 양호 위치 → 현재 fix)을 span해야 한다.
          // 직전 fix(과거 lastFixMs) 기준으로 재면 비-워밍업 거부 직후 두 기준이 어긋나
          // segmentSpeed가 과대평가되어 정상 구간을 거짓 거부한다(시간기준 desync).
          const dtSec=lastGoodMs.current?Math.max((pos.timestamp-lastGoodMs.current)/1000,0):0;
          if(acceptSegment({distKm:d,dtSec,accuracyM:acc,fixIndex:idx})){
            dist.current+=d;setKm(Math.round(dist.current*100)/100);
            pts.current.push(f);lastGood.current=f;lastGoodMs.current=pos.timestamp;
          }else if(idx<WARMUP_FIXES){
            // 워밍업 구간: 거리에 가산하지 않되 마지막 양호 위치/시각을 갱신해
            // 워밍업 종료 직후 첫 구간이 거대한 점프로 잡히지 않게 한다.
            lastGood.current=f;lastGoodMs.current=pos.timestamp;
          }
          // 그 외 거부(정확도/속도/거리)는 lastGood/lastGoodMs을 보존 → 경로 연속성 유지,
          // 다음 양호 fix가 '마지막 양호 위치/시각'으로부터 다시 측정된다.
        }else{lastGood.current=f;lastGoodMs.current=pos.timestamp;pts.current.push(f);}
      },
      err=>{setGpsStatus(err.code===1?'위치 권한 필요':'GPS 신호 없음');},
      // audit#1: foregroundService 옵션으로 location 타입 포그라운드 서비스를 켜
      // 화면off/백그라운드에서도 OS가 watchPosition fix를 계속 전달하게 한다(거리·
      // 시간 유실 방지). 채널/notification은 AndroidManifest 권한·서비스 선언과 짝.
      {enableHighAccuracy:true,interval:1000,fastestInterval:500,forceRequestLocation:true,distanceFilter:0,maximumAge:0,
        foregroundService:buildForegroundServiceConfig(goalKm)} as any,
    );
  }

  function stop(){
    if(watchId.current!==null){Geolocation.clearWatch(watchId.current);watchId.current=null;}
    if(stepSub.current){stepSub.current.unsubscribe();stepSub.current=null;}
    clearInterval(timer.current);
    clearInterval(snapTimer.current);
  }

  function handlePause(){
    // 수동 토글: enterPause/exitPause가 pauseStartRef 가드로 pausedMs를 1회만 가산.
    if(!isPausedRef.current)enterPause(false);
    else exitPause(false);
  }

  function handleStop(){
    if(!stopConfirm){
      setStopConfirm(true);
      stopConfirmTimer.current=setTimeout(()=>setStopConfirm(false),3000);
      return;
    }
    clearTimeout(stopConfirmTimer.current);
    setStopConfirm(false);
    const curPausedMs=(isPausedRef.current&&pauseStartRef.current>0)?pausedMs.current+(Date.now()-pauseStartRef.current):pausedMs.current;
    const fk=dist.current,ft=Math.max(0,Math.floor((Date.now()-t0.current-curPausedMs)/1000));
    if(fk<0.01){
      stop();
      Alert.alert('거리가 너무 짧아요','계속 달리거나 나가기를 선택하세요',[
        {text:'계속 달리기',onPress:()=>{setKm(0);setElapsed(0);setCadence(0);setGpsStatus('GPS 신호 찾는 중...');setPaused(false);setAutoPaused(false);beginRun();}},
        {text:'나가기',style:'destructive',onPress:onDiscard},
      ]);
      return;
    }
    stop();
    const sampled=simplifyRoute(pts.current,200);
    setFinRoute(sampled.length>=2?JSON.stringify(sampled):'');
    setFinLocation(locationRef.current);
    setFinKm(fk);setFinTime(ft);setFinCad(cadRef.current);
    setPhase('done');
  }

  async function handleSave(){
    setSaving(true);
    try{
      let loc=finLocation||locationRef.current;
      if(!loc&&finRoute){
        try{
          const pts2=JSON.parse(finRoute);
          if(pts2.length>0){
            const {lat,lon}=pts2[0];
            const d=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`,{headers:{'User-Agent':'SoleMate/1.0'}}).then(r=>r.json());
            const addr=d.address||{};
            const parts=[addr.suburb||addr.neighbourhood||addr.quarter||addr.city_district||addr.town,addr.city||addr.county||addr.state].filter(Boolean);
            loc=parts.length>0?parts.join(', '):(d.display_name||'').split(',').slice(0,2).join(',').trim()||'';
          }
        }catch(e){}
      }
      await onSave(Math.round(finKm*100)/100,finTime,finCad,memo,finRoute,loc);
    }finally{setSaving(false);}
  }

  const progress=Math.min(1,km/goalKm);
  const remaining=Math.max(0,goalKm-km);
  const pauseLabel=autoPaused?'자동 일시정지':paused?'일시정지':'러닝 중';
  const pauseColor=paused||autoPaused?WARN:ACCENT;

  if(phase==='done') return(
    <View style={[run.screen,{paddingTop:insets.top+24,paddingBottom:insets.bottom+28}]}>
      <View style={run.top}>
        <View style={run.liveRow}><Text style={[run.liveText,{color:ACCENT}]}>완료</Text></View>
        <View style={run.shoeChip}><Ionicons name="footsteps-outline" size={15} color={T3}/><Text style={run.shoeChipText}>{ui.model||shoe.name}</Text></View>
      </View>
      <View style={run.body}>
        <Ring size={272} stroke={16} progress={1} color={ACCENT}>
          <View style={{alignItems:'center'}}>
            <Text style={run.goalText}>목표 {goalKm}km 완료</Text>
            <Text style={run.bigDist}>{finKm.toFixed(2)}</Text>
            <Text style={run.bigUnit}>킬로미터</Text>
          </View>
        </Ring>
      </View>
      <View style={run.metrics}>
        <View style={run.metric}><Ionicons name="time-outline" size={18} color={T3}/><Text style={run.metricV}>{fmtTime(finTime)}</Text><Text style={run.metricL}>시간</Text></View>
        <View style={run.metric}><Ionicons name="flash-outline" size={18} color={T3}/><Text style={run.metricV}>{fmtPace(finKm,finTime)}</Text><Text style={run.metricL}>평균 페이스</Text></View>
        <View style={run.metric}><Ionicons name="walk-outline" size={18} color={T3}/><Text style={run.metricV}>{finCad>0?finCad:'--'}</Text><Text style={run.metricL}>케이던스</Text></View>
      </View>
      <TextInput style={run.memo} value={memo} onChangeText={setMemo} placeholder="메모 (선택)" placeholderTextColor={T3} autoCorrect={false} autoCapitalize="none"/>
      <View style={run.actionRow}>
        <TouchableOpacity style={run.discardBtn} onPress={onDiscard}><Text style={run.discardTxt}>버리기</Text></TouchableOpacity>
        <TouchableOpacity style={run.saveBtn} onPress={handleSave} disabled={saving}><Text style={run.saveTxt}>{saving?'저장 중...':'저장하기'}</Text></TouchableOpacity>
      </View>
    </View>
  );

  return(
    <View style={[run.screen,{paddingTop:insets.top+16,paddingBottom:insets.bottom+28}]}>
      <View style={run.top}>
        <View style={run.liveRow}>
          <View style={[run.liveDot,{backgroundColor:pauseColor}]}/>
          <Text style={[run.liveText,{color:pauseColor}]}>{pauseLabel}</Text>
        </View>
        <View style={run.shoeChip}><Ionicons name="footsteps-outline" size={15} color={T3}/><Text style={run.shoeChipText}>{ui.model||shoe.name}</Text></View>
      </View>
      <View style={run.gpsRow}>
        <Ionicons name="radio-outline" size={11} color={ACCENT} style={{marginRight:4}}/>
        <Text style={run.gpsText}>{gpsStatus}</Text>
      </View>

      <View style={run.body}>
        <Ring size={272} stroke={16} progress={progress} color={pauseColor}>
          <View style={{alignItems:'center'}}>
            <Text style={run.goalText}>목표 {goalKm}km · {Math.round(progress*100)}%</Text>
            <Text style={run.bigDist}>{km.toFixed(2)}</Text>
            <Text style={run.bigUnit}>{remaining>0.009?`${remaining.toFixed(2)}km 남음`:'목표 달성!'}</Text>
          </View>
        </Ring>
      </View>

      <View style={run.metrics}>
        <View style={run.metric}><Ionicons name="time-outline" size={18} color={T3}/><Text style={run.metricV}>{fmtTime(elapsed)}</Text><Text style={run.metricL}>시간</Text></View>
        <View style={run.metric}><Ionicons name="flash-outline" size={18} color={T3}/><Text style={run.metricV}>{fmtPace(km,elapsed)}</Text><Text style={run.metricL}>평균 페이스</Text></View>
        <View style={run.metric}><Ionicons name="walk-outline" size={18} color={T3}/><Text style={run.metricV}>{cadence>0?cadence:'--'}</Text><Text style={run.metricL}>케이던스</Text></View>
      </View>

      <View style={run.controls}>
        <View style={{alignItems:'center',gap:8}}>
          <TouchableOpacity style={run.ctrlPrimary} onPress={handlePause}>
            <Ionicons name={paused?'play':'pause'} size={34} color="#fff"/>
          </TouchableOpacity>
          <Text style={run.ctrlHint}>{paused?'재개':'일시정지'}</Text>
        </View>
        <View style={{alignItems:'center',gap:8}}>
          <TouchableOpacity style={[run.ctrlStop,stopConfirm&&{backgroundColor:DANGER}]} onPress={handleStop}>
            <Ionicons name="stop" size={26} color={stopConfirm?'#fff':DANGER}/>
          </TouchableOpacity>
          <Text style={[run.ctrlHint,stopConfirm&&{color:WARN,fontWeight:'700'}]}>{stopConfirm?'한번 더 누르면 종료':'종료'}</Text>
        </View>
      </View>
    </View>
  );
}

const run=StyleSheet.create({
  screen:{flex:1,backgroundColor:BG,paddingHorizontal:22},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  liveRow:{flexDirection:'row',alignItems:'center',gap:7},
  liveDot:{width:8,height:8,borderRadius:999},
  liveText:{fontFamily:FP,fontSize:14,fontWeight:'500',letterSpacing:0.3},
  shoeChip:{flexDirection:'row',alignItems:'center',gap:7,height:30,paddingHorizontal:12,borderRadius:999,backgroundColor:SURFACE},
  shoeChipText:{color:T3,fontFamily:FP,fontSize:12.5,fontWeight:'600'},
  gpsRow:{flexDirection:'row',alignItems:'center',marginTop:8},
  gpsText:{color:T3,fontFamily:FP,fontSize:11},
  body:{flex:1,alignItems:'center',justifyContent:'center'},
  goalText:{color:T3,fontFamily:FP,fontSize:12,fontWeight:'500',letterSpacing:1},
  bigDist:{color:T1,fontFamily:FH,fontSize:84,letterSpacing:1,marginTop:6},
  bigUnit:{color:T3,fontFamily:FP,fontSize:14,fontWeight:'600',marginTop:2},
  metrics:{flexDirection:'row',marginHorizontal:-4,paddingVertical:8,paddingBottom:22,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:SEP},
  metric:{flex:1,alignItems:'center',gap:6},
  metricV:{color:T1,fontFamily:FH,fontSize:26,letterSpacing:0.3},
  metricL:{color:T3,fontFamily:FP,fontSize:11.5,fontWeight:'600'},
  controls:{flexDirection:'row',alignItems:'flex-start',justifyContent:'center',gap:40,paddingTop:4,paddingBottom:8},
  ctrlPrimary:{width:92,height:92,borderRadius:999,backgroundColor:ACCENT,alignItems:'center',justifyContent:'center'},
  ctrlStop:{width:72,height:72,borderRadius:999,backgroundColor:'rgba(255,69,58,0.18)',alignItems:'center',justifyContent:'center',marginTop:10},
  ctrlHint:{color:T3,fontFamily:FP,fontSize:11,letterSpacing:0.5,textAlign:'center'},
  memo:{backgroundColor:SURFACE,borderRadius:14,padding:14,color:T1,fontSize:15,fontFamily:FP,marginBottom:16},
  actionRow:{flexDirection:'row',gap:12},
  discardBtn:{flex:1,backgroundColor:SURFACE,borderRadius:16,padding:16,alignItems:'center'},
  discardTxt:{color:T1,fontSize:16,fontFamily:FP,fontWeight:'600'},
  saveBtn:{flex:2,backgroundColor:ACCENT,borderRadius:16,padding:16,alignItems:'center'},
  saveTxt:{color:'#fff',fontSize:16,fontFamily:FP,fontWeight:'600'},
});
