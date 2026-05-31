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
import {initCadenceState, feedAccelSample} from './lib/cadence';
import {fmtPace, fmtTime, fmtKDate, getMonday, ymdLocal} from './lib/format';
import {
  sumKm, avgPaceLabel, totalTimeLabel, summaryOf, maxDayStreak,
  weekBuckets, monthBuckets, yearBuckets,
} from './lib/stats';
import {parseShoeName} from './lib/shoe';

const API = 'https://solelife-backend.onrender.com';

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
  const insets=useSafeAreaInsets();

  useEffect(()=>{initUser();},[]);

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
    }catch(e){console.log('offline');}
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

  async function deleteShoe(id:string){
    try{
      await fetch(API+'/api/shoes/'+id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId})});
      setShoes(prev=>prev.filter(s=>s.id!==id));
      setRuns(prev=>prev.filter(r=>r.shoe_id!==id));
    }catch(e){Alert.alert('오류','삭제 실패');}
  }

  async function addRun(shoeId:string,km:number,date:string,memo:string,source:string,duration?:number,cadence?:number,route?:string,location?:string,heart_rate?:number){
    try{
      const r=await fetch(API+'/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,shoe_id:shoeId,km,run_date:date,memo,source,duration:duration||0,cadence:cadence||0,route:route||'',location:location||'',heart_rate:heart_rate||0})});
      const nr=await r.json();
      const now=new Date();
      const timeStr=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const runWithRoute={...nr,shoe_id:shoeId,route:route||nr.route||'',run_time:timeStr};
      setRuns(prev=>[runWithRoute,...prev]);
      if(nr.id){
        if(route) await AsyncStorage.setItem('route_'+nr.id, route);
        await AsyncStorage.setItem('time_'+nr.id, timeStr);
      }
    }catch(e){Alert.alert('오류','저장 실패');}
  }

  async function checkShoeAlerts(shoeList:any[],runList:any[]){
    try{
      if(!Array.isArray(shoeList)||!Array.isArray(runList)) return;
      const lastAlert=await AsyncStorage.getItem('shoe_alert_date');
      if(lastAlert===today()) return;
      const critical=shoeList.filter((s:any)=>{
        const used=runList.filter((r:any)=>r.shoe_id===s.id).reduce((a:number,r:any)=>a+parseFloat(r.km||0),0)+(s.start_km||0);
        return Math.max(0,(s.max_km||600)-used)<=100;
      });
      if(critical.length>0){
        await AsyncStorage.setItem('shoe_alert_date',today());
        Alert.alert('신발 교체 알림',critical.map((s:any)=>s.name).join(', ')+'\n\n잔여 수명이 100km 이하입니다.\n새 신발을 준비하세요!',[{text:'확인'}]);
      }
    }catch(e){console.log('checkShoeAlerts error',e);}
  }

  // ── adapters: backend → presentational shapes ──────────────
  function toUiShoe(s:any):Shoe{
    const usedReal=runs.filter(r=>r.shoe_id===s.id).reduce((a,r)=>a+(parseFloat(r.km)||0),0)+(s.start_km||0);
    const max=s.max_km||600;
    const {brand,model}=parseShoeName(s.name);
    return {
      id:s.id,
      brand:brand||s.name,
      model:model||(brand?'':s.name),
      used:Math.round(usedReal),
      max,
      condition:(max-usedReal)<=100?'점검':'양호',
    };
  }

  const uiShoes:Shoe[]=shoes.map(toUiShoe);
  const idxById:Record<string,number>={};
  shoes.forEach((s,i)=>{idxById[s.id]=i;});

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
  const startFromIdx=(i:number)=>{
    const s=shoes[i]; if(!s) return;
    setPendingShoe({id:s.id,name:s.name,ui:uiShoes[i]});
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
        onSave={async(km,dur,cad,memo,route,location)=>{
          await addRun(activeRun.id,km,today(),memo||'','gps',dur,cad,route,location);
          setActiveRun(null);setOverlay('none');setTab(1);
        }}
        onDiscard={()=>{setActiveRun(null);setOverlay('none');}}
      />
    );
  }

  return(
    <View style={{flex:1,backgroundColor:BG}}>
      <View style={{flex:1}}>
        {tab===0&&(
          <HomeScreen
            shoes={uiShoes} week={week} dateLabel={dateLabel}
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
            onRename={updateShoeName} onDelete={deleteShoe}
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
function RunActiveScreen({shoe,insets,goalKm,onSave,onDiscard}:{shoe:{id:string;name:string};insets:any;goalKm:number;onSave:(km:number,dur:number,cad:number,memo:string,route:string,location:string)=>Promise<void>;onDiscard:()=>void}){
  const ui=parseShoeName(shoe.name);
  const [phase,setPhase]=useState<'running'|'done'>('running');
  const [km,setKm]=useState(0);
  const [elapsed,setElapsed]=useState(0);
  const [gpsStatus,setGpsStatus]=useState('GPS 신호 찾는 중...');
  const [cadence,setCadence]=useState(0);
  const [paused,setPaused]=useState(false);
  const [autoPaused,setAutoPaused]=useState(false);
  const [stopConfirm,setStopConfirm]=useState(false);
  const [finKm,setFinKm]=useState(0);
  const [finTime,setFinTime]=useState(0);
  const [finCad,setFinCad]=useState(0);
  const [finRoute,setFinRoute]=useState('');
  const [finLocation,setFinLocation]=useState('');
  const [memo,setMemo]=useState('');
  const [saving,setSaving]=useState(false);

  const watchId=useRef<number|null>(null);
  const timer=useRef<any>(null);
  const stepSub=useRef<any>(null);
  // 케이던스(spm) 순수 상태기계 — 가속도 피크검출+윈도우 정규화는 lib/cadence.ts.
  const cadenceState=useRef(initCadenceState(Date.now()));
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

  function beginRun(){
    dist.current=0;t0.current=Date.now();kf.current.reset();
    fixIndex.current=0;lastGoodMs.current=0;lastGood.current=null;
    cadenceState.current=initCadenceState(Date.now());cadRef.current=0;pts.current=[];
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
      {enableHighAccuracy:true,interval:1000,fastestInterval:500,forceRequestLocation:true,distanceFilter:0,maximumAge:0} as any,
    );
  }

  function stop(){
    if(watchId.current!==null){Geolocation.clearWatch(watchId.current);watchId.current=null;}
    if(stepSub.current){stepSub.current.unsubscribe();stepSub.current=null;}
    clearInterval(timer.current);
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
