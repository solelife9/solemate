import React, {useState, useEffect, useRef} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, StatusBar,
  PermissionsAndroid, Platform, Linking,
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
import ErrorBoundary from './ErrorBoundary';
// BackendShoe / BackendRun 은 types.d.ts 의 전역 ambient 인터페이스(import 불필요).
import HomeScreen, {WeekStats} from './HomeScreen.rn';
import HistoryScreen, {PeriodSummary, PeriodChart} from './HistoryScreen.rn';
import ShoesScreen, {ShoeTotals} from './ShoesScreen.rn';
import ProfileScreen, {Profile, Badge, PersonalRecord} from './ProfileScreen.rn';
import AddShoeScreen from './AddShoeScreen.rn';
import {RunStart} from './RunScreen.rn';

import {KalmanFilter} from './lib/kalman';
import {calcDist, acceptSegment, segmentSpeedMps, simplifyRoute} from './lib/geo';
import {WARMUP_FIXES} from './lib/engineConstants';
import {decideAutoPause, initAutoPauseState} from './lib/autoPause';
import {buildForegroundServiceConfig} from './lib/foregroundService';
import {gpsStallStatus} from './lib/gpsHealth';
import {initCadenceState, feedAccelSample} from './lib/cadence';
import {fmtPace, fmtTime, fmtKDate, getMonday, ymdLocal} from './lib/format';
import {
  sumKm, avgPaceLabel, totalTimeLabel, summaryOf, maxDayStreak,
  weekBuckets, monthBuckets, yearBuckets,
} from './lib/stats';
import {parseShoeName, shoeHealth, isRetired, DEFAULT_MAX_KM, clampMaxKm, reconcileShoeAlerts, KEEP_GOING_REPLACE} from './lib/shoe';
import {recommendShoeId, lastWornDate} from './lib/shoeRecommend';
import {
  saveSnapshot, loadSnapshot, clearSnapshot, isResumable,
  enqueuePendingRun, removePendingRun, updatePendingRun, flushPendingRuns,
  reconcilePendingWithServer,
  RunSnapshot, PendingRun,
} from './lib/runPersistence';
import {Unit, kmToDisplay, displayNum} from './lib/units';
import {
  AlertSettings, loadSettings, saveUnit, saveGoal, saveAlerts,
  clampGoal, DEFAULT_SETTINGS,
} from './lib/settings';
import {weeklyProgress, currentStreak, personalRecords} from './lib/goals';

const API = 'https://solelife-backend.onrender.com';

function nowTimeLabel():string{
  const n=new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

function today():string{return ymdLocal(new Date());}

// 위치 권한이 없거나 회수됐을 때의 한국어 안내 + 설정 딥링크. 앱은 권한을 직접
// 되돌릴 수 없으므로 OS 설정 화면으로 보내 사용자가 다시 허용하게 한다. openSettings
// 실패(미지원 환경 등)는 삼켜서 크래시를 막는다(트래킹 차단이 목적, 크래시 금지).
function openLocationSettingsAlert(message:string){
  Alert.alert('위치 권한 필요',message,[
    {text:'닫기',style:'cancel'},
    {text:'설정 열기',onPress:()=>{Promise.resolve(Linking.openSettings()).catch(()=>{});}},
  ]);
}

export default function App(){
  return(
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={BG}/>
      <ErrorBoundary>
        <Main/>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function Main(){
  const [tab,setTab]=useState(0);                 // 0 home · 1 history · 2 shoes · 3 profile
  const [userId,setUserId]=useState<string|null>(null);
  const [shoes,setShoes]=useState<BackendShoe[]>([]);
  const [runs,setRuns]=useState<BackendRun[]>([]);
  // 홈/신발 화면이 공유하는 '선택 신발' id. null이면 휴식 로테이션 추천 신발로 폴백한다
  // (activeIdx={0} 하드코딩 제거 — 선택/추천이 홈 히어로와 신발 '사용 중' 표시를 함께 몬다).
  const [selectedShoeId,setSelectedShoeId]=useState<string|null>(null);
  // 신발 id → 구매가(원). cost-per-km 파생용. AsyncStorage('price_<id>')에 영속(백엔드
  // 스키마 무변경 — 데이터 파괴 금지). 신발 로드 후 채워진다.
  const [prices,setPrices]=useState<Record<string,number>>({});
  const [overlay,setOverlay]=useState<'none'|'add'|'goal'|'run'>('none');
  const [pendingShoe,setPendingShoe]=useState<{id:string;name:string;ui:Shoe}|null>(null);
  const [activeRun,setActiveRun]=useState<{id:string;name:string;goalKm:number}|null>(null);
  // audit#2: 앱 시작 시 감지된 미완료 런 스냅샷. 사용자가 '복구' 선택 시 done
  // 화면으로 시드되어 검토 후 저장/버리기를 결정한다(데이터 유실 금지).
  const [resumeSnap,setResumeSnap]=useState<RunSnapshot|null>(null);
  // ── 사용자 설정(ProfileScreen 설정 4행이 구동) ─────────────────────────────
  // 거리 단위(표시 전용 — 저장 표준은 항상 km), 주간 목표(km), 신발 교체 알림.
  // loadSettings로 AsyncStorage(settings_unit/goal_weekly_km/settings_alerts)에서
  // 복원하고, 변경 시 즉시 영속 + 상태 갱신해 전 화면에 반영한다.
  const [unit,setUnit]=useState<Unit>(DEFAULT_SETTINGS.unit);
  const [goalWeeklyKm,setGoalWeeklyKm]=useState(DEFAULT_SETTINGS.goalWeeklyKm);
  const [alerts,setAlerts]=useState<AlertSettings>({...DEFAULT_SETTINGS.alerts});
  const [deviceId,setDeviceId]=useState<string>('');
  const insets=useSafeAreaInsets();

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setDeviceId(did);
    // 설정 복원은 네트워크와 무관하므로 fetch try 밖에서 먼저 읽는다(오프라인에서도
    // 단위/목표/알림이 사용자가 마지막에 정한 값으로 뜬다). 알림 판정에 갓 읽은
    // alerts 설정을 직접 넘긴다(setAlerts state 갱신 전이라 클로저가 옛값일 수 있음).
    const st=await loadSettings();
    setUnit(st.unit);setGoalWeeklyKm(st.goalWeeklyKm);setAlerts(st.alerts);
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
      void loadPrices(safeShoes);
      checkShoeAlerts(safeShoes,safeRuns,st.alerts);
      // audit#3 재동기: 네트워크 실패로 큐에 남은 완주 런을 재전송. 서버 런 목록과
      // 사용자 id를 갓 받은 값으로 넘겨, 재-POST 전 클라이언트 화해로 중복을 막는다.
      await syncPendingRuns(safeRuns,d.user_id);
    }catch{console.log('offline');}
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
    }catch{Alert.alert('오류','저장 실패');}
  }

  async function updateShoeName(id:string,name:string){
    try{
      await fetch(API+'/api/shoes/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,name})});
      setShoes(prev=>prev.map(s=>s.id===id?{...s,name}:s));
    }catch{Alert.alert('오류','수정 실패');}
  }

  // 신발별 수명(max_km) 조정 — 신발별 교체 임계의 분모. clampMaxKm로 범위를 보정한
  // 뒤 낙관적으로 상태를 갱신(즉시 배지/링 반영)하고 백엔드에 PATCH한다. 수명을 올려
  // 임계 아래로 내려간 신발은 다음 checkShoeAlerts에서 추적 집합에서 빠진다.
  async function updateShoeMaxKm(id:string,maxKm:number){
    const v=clampMaxKm(maxKm);
    setShoes(prev=>prev.map(s=>s.id===id?{...s,max_km:v}:s));
    try{
      await fetch(API+'/api/shoes/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,max_km:v})});
    }catch{Alert.alert('오류','수명 수정 실패');}
  }

  // 신발 삭제는 더 이상 런 기록을 동반삭제하지 않는다(iron law: 데이터 파괴 금지).
  // 런은 보존되어 기록/통계에 남고, 신발만 잠금장(locker)에서 제거된다. 신발을
  // 영구히 지우는 대신 보존이 목적이면 retireShoe(보관)를 쓴다.
  async function deleteShoe(id:string){
    try{
      await fetch(API+'/api/shoes/'+id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId})});
      setShoes(prev=>prev.filter(s=>s.id!==id));
    }catch{Alert.alert('오류','삭제 실패');}
  }

  // 보관(retire/archive): 신발을 선택목록·홈 picker에서 숨기되 신발과 런 기록은
  // 모두 보존한다. retired 토글이므로 복원도 가능하다.
  async function retireShoe(id:string,retired:boolean){
    try{
      await fetch(API+'/api/shoes/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,retired})});
      setShoes(prev=>prev.map(s=>s.id===id?{...s,retired}:s));
    }catch{Alert.alert('오류',retired?'보관 처리 실패':'복원 실패');}
  }

  // 구매가 로드: 각 신발의 price_<id> 로컬 키를 읽어 prices 맵을 채운다. 백엔드 스키마를
  // 건드리지 않고 클라이언트에 영속(데이터 파괴 금지). 숫자로 파싱되는 값만 채택한다.
  async function loadPrices(shoeList:BackendShoe[]){
    try{
      const entries=await Promise.all((shoeList||[]).map(async(s)=>{
        if(!s||!s.id) return null;
        const raw=await AsyncStorage.getItem('price_'+s.id);
        const v=raw!=null?Number(raw):NaN;
        return Number.isFinite(v)&&v>0?[s.id,v] as [string,number]:null;
      }));
      const map:Record<string,number>={};
      for(const e of entries){if(e)map[e[0]]=e[1];}
      setPrices(map);
    }catch(e){console.log('loadPrices error',e);}
  }

  // 구매가 저장: 로컬 영속 + 상태 갱신. cost-per-km는 ShoeDetail에서 순수함수로 파생된다.
  async function setShoePrice(id:string,price:number){
    setPrices(prev=>({...prev,[id]:price}));
    try{await AsyncStorage.setItem('price_'+id,String(price));}catch(e){console.log('setShoePrice error',e);}
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
    }catch{/* 큐에 남아 다음 실행/포그라운드에서 재동기 */}
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

  // 수동 런 입력(앱 외 주행·잔존 마일리지 보정): source='manual'로 addRun을 재사용한다.
  // 로컬 우선 큐 + 낙관적 삽입 동선을 그대로 타므로 신발 km(shoeHealth)이 즉시 반영되고
  // 네트워크 실패 시에도 유실되지 않는다(iron law). route/cadence는 비운다(GPS 미동반).
  function addManualRun(shoeId:string,km:number,date:string,durationSec:number){
    void addRun(shoeId,km,date,'','manual',durationSec);
  }

  // 개별 런 편집(백엔드 PATCH). 낙관적으로 runs 상태를 갱신 → toUiShoe가 runs에서
  // shoeHealth를 파생하므로 신발 수명은 자동 재계산된다(별도 신발 PATCH 불필요).
  // fields는 백엔드 컬럼명(shoe_id/km/run_date/duration). 아직 서버에 없는 미동기
  // (_pending) 런이면 PATCH 대신 큐를 수정해 향후 POST가 편집값을 싣게 한다.
  async function editRun(id:string,fields:{shoe_id?:string;km?:number;run_date?:string;duration?:number}){
    const sid=String(id);
    const target=runs.find(r=>String(r.id)===sid);
    setRuns(prev=>prev.map(r=>String(r.id)===sid?{...r,...fields}:r));
    if(target&&target._pending){
      await updatePendingRun(sid,fields as Partial<PendingRun>);
      return;
    }
    try{
      await fetch(API+'/api/runs/'+sid,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId,...fields})});
    }catch{Alert.alert('오류','런 수정 실패');}
  }

  // 개별 런 삭제(백엔드 DELETE). 삭제 확인 Alert는 화면(HistoryScreen)이 띄운다.
  // runs에서 제거하면 shoeHealth가 줄어 신발 사용거리도 자동 감소한다(파생값). 미동기
  // 런은 서버에 없으므로 네트워크 없이 로컬에서만 제거하고, 동기된 런은 서버 삭제 성공
  // 후 제거한다(실패 시 보존). route_/time_ 로컬키도 함께 정리해 누수를 막는다.
  async function deleteRun(id:string){
    const sid=String(id);
    const target=runs.find(r=>String(r.id)===sid);
    const finishLocal=async()=>{
      setRuns(prev=>prev.filter(r=>String(r.id)!==sid));
      await removePendingRun(sid);
      await AsyncStorage.removeItem('route_'+sid);
      await AsyncStorage.removeItem('time_'+sid);
    };
    if(target&&target._pending){await finishLocal();return;}
    try{
      await fetch(API+'/api/runs/'+sid,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:userId})});
      await finishLocal();
    }catch{Alert.alert('오류','삭제 실패');}
  }

  // 신발 교체 알림: 설정(on/off · 임계값)을 따른다. 비활성이면 아예 묻지 않고,
  // 활성이면 사용자가 정한 임계값(수명 사용률 %) 이상인 신발만 알린다.
  // 임계값은 km 절대값(shoeHealth.percentUsed) 기준 — 표시 단위와 무관.
  //
  // 중복 방지는 '하루 1회' 전역 게이트가 아니라 *신발별 추적*으로 한다(reconcileShoeAlerts).
  // 이미 알린 신발 id 집합(shoe_alert_notified)을 들고, 임계 이상이면서 아직 안 알린
  // 신발만 새로 알린다. 같은 신발의 반복 알림을 막으면서도, 같은 날 새로 임계에 도달한
  // 다른 신발은 즉시 알린다. 임계 아래로 내려간 신발(수명 상향/교체)은 집합에서 빠진다.
  async function checkShoeAlerts(shoeList:any[],runList:any[],alertCfg:AlertSettings){
    try{
      if(!alertCfg||!alertCfg.enabled) return;
      if(!Array.isArray(shoeList)||!Array.isArray(runList)) return;
      // 사용자 임계값 이상 사용한 신발만 후보. 보관된 신발은 제외.
      const critical=shoeList.filter((s:any)=>!isRetired(s)&&shoeHealth(s,runList).percentUsed>=alertCfg.thresholdPct);
      const prevRaw=await AsyncStorage.getItem('shoe_alert_notified');
      let prev:any[]=[];
      try{const p=JSON.parse(prevRaw||'[]');if(Array.isArray(p)) prev=p;}catch{prev=[];}
      const {toNotify,notified}=reconcileShoeAlerts(critical.map((s:any)=>s.id),prev);
      // 임계 신발 집합이 바뀌면(새 알림이든, 내려간 신발 정리든) 추적값을 영속.
      await AsyncStorage.setItem('shoe_alert_notified',JSON.stringify(notified));
      if(toNotify.length>0){
        const names=critical.filter((s:any)=>toNotify.some((id:any)=>String(id)===String(s.id))).map((s:any)=>s.name);
        Alert.alert('신발 교체 알림',names.join(', ')+`\n\n수명의 ${alertCfg.thresholdPct}% 이상을 사용했습니다.\n${KEEP_GOING_REPLACE} — 새 신발을 준비하세요!`,[{text:'확인'}]);
      }
    }catch(e){console.log('checkShoeAlerts error',e);}
  }

  // ── 설정 변경(영속 + 상태 갱신) — ProfileScreen 설정 행이 호출 ──────────────
  // 각 setter는 즉시 setState로 화면을 갱신하고 saveX로 AsyncStorage에 영속한다.
  const changeUnit=(u:Unit)=>{setUnit(u);void saveUnit(u);};
  const changeGoal=(km:number)=>{const v=clampGoal(km);setGoalWeeklyKm(v);void saveGoal(v);};
  const changeAlerts=(a:AlertSettings)=>{setAlerts(a);void saveAlerts(a);};

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

  // ── 선택/추천 신발(activeIdx 하드코딩 제거) ──────────────────────────────────
  // 추천: 휴식 로테이션(가장 오래 쉰 활성 신발). 선택: 사용자가 홈에서 고른 신발(없으면
  // 추천으로 폴백). effectiveId 하나가 홈 히어로와 신발화면 '사용 중' 표시를 함께 몬다.
  const recommendedId=recommendShoeId(shoes,runs) as string|null;
  const effectiveId=
    (selectedShoeId&&homeShoes.some(x=>x.raw.id===selectedShoeId))?selectedShoeId
    :(recommendedId&&homeShoes.some(x=>x.raw.id===recommendedId))?recommendedId
    :(homeShoes[0]?.raw.id??null);
  const homeActiveIdx=Math.max(0,homeShoes.findIndex(x=>x.raw.id===effectiveId));
  const homeRecommendedIdx=homeShoes.findIndex(x=>x.raw.id===recommendedId);
  // 신발화면(보관 포함 전체)에서 선택 신발의 인덱스 — '사용 중' 강조용.
  const shoesActiveIdx=Math.max(0,shoes.findIndex(s=>s.id===effectiveId));
  // 홈 picker(보관 제외) 인덱스 → 원본 신발 id로 선택 상태를 갱신한다.
  const selectHomeShoe=(i:number)=>{const e=homeShoes[i];if(e)setSelectedShoeId(e.raw.id);};

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
      // 편집 폼 프리필용 원본값(날짜·시간 초). 거리/신발은 위 dist/shoe로 충분.
      runDate:String(run.run_date??''), durationS:dur,
    };
  }
  const uiRuns:Run[]=sortedRaw.map(toUiRun);

  // ── home week stats ────────────────────────────────────────
  const now=new Date();
  const mon=getMonday(now); const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  const weekRuns=runs.filter(r=>r.run_date>=ymdLocal(mon)&&r.run_date<=ymdLocal(sun));
  // 표시 단위(unit)로 환산한 주간 거리. 저장 표준 km은 sumKm이 유지하고, 화면용
  // 문자열만 kmToDisplay로 변환한다(km이면 항등 — 기존 출력과 동일).
  const week:WeekStats={km:kmToDisplay(sumKm(weekRuns),unit).toFixed(1),runs:weekRuns.length,pace:avgPaceLabel(weekRuns)};
  const dateLabel=`${now.getMonth()+1}월 ${now.getDate()}일 ${['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][now.getDay()]}`;
  // 주간 목표 달성률(목표 설정 행이 구동). 거리 합·목표는 km 기준으로 계산하고
  // 퍼센트만 화면에 쓴다(단위 환산과 무관 — 비율은 단위 불변).
  const goalRuns=runs.map(r=>({run_date:String(r.run_date),km:parseFloat(String(r.km))||0}));
  const goalProgress=weeklyProgress(goalRuns, goalWeeklyKm, ymdLocal(mon));
  // 연속 러닝 스트릭(keep-going 동기): 오늘까지 끊김 없이 이어진 달림 일수. 비율과
  // 무관한 절대 일수이므로 단위 환산 없이 그대로 표시한다(0km/비런 날은 끊김 처리).
  const goalStreak=currentStreak(goalRuns, ymdLocal(now));

  // ── history summary + chart per period ─────────────────────
  const monthRuns=runs.filter(r=>String(r.run_date).startsWith(ymdLocal(now).slice(0,7)));
  const yearRuns=runs.filter(r=>String(r.run_date).startsWith(String(now.getFullYear())));
  // 기간 요약: 거리(km)만 표시 단위로 환산하고 나머지(횟수/페이스/시간)는 그대로.
  const mkSummary=(list:any[]):PeriodSummary=>({...summaryOf(list),km:kmToDisplay(sumKm(list),unit).toFixed(1)});
  const summary:Record<string,PeriodSummary>={
    '주':mkSummary(weekRuns),'월':mkSummary(monthRuns),'년':mkSummary(yearRuns),'전체':mkSummary(runs),
  };
  // 차트 데이터도 표시 단위로 환산(막대 높이·우측 km 눈금 라벨이 함께 단위를 따른다).
  // week chart: daily Mon..Sun
  const weekData=weekBuckets(runs,mon).map(v=>displayNum(v,unit,1));
  // month chart: weekly buckets
  const monthData=monthBuckets(monthRuns,now.getFullYear(),now.getMonth());
  const weekCount=monthData.length;
  // year chart: monthly Jan..Dec
  const yearData=yearBuckets(yearRuns);
  const chart:Record<string,PeriodChart>={
    '주':{title:'일별 거리',data:weekData,labels:['월','화','수','목','금','토','일']},
    '월':{title:'주간 거리',data:monthData.map(v=>displayNum(v,unit,1)),labels:Array.from({length:weekCount},(_,i)=>`${i+1}주`)},
    '년':{title:'월별 거리',data:yearData.map(v=>displayNum(v,unit,0)),labels:['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']},
  };

  // ── per-shoe totals (for shoe detail) ──────────────────────
  const shoeTotals:Record<number,ShoeTotals>={};
  shoes.forEach((s,i)=>{
    const list=runs.filter(r=>r.shoe_id===s.id);
    // 마지막 착용일(런에서 파생) → 한국어 표기. 미착용이면 undefined로 둬 화면에서 생략.
    const worn=lastWornDate(s.id,runs);
    shoeTotals[i]={totalRuns:list.length,totalTime:totalTimeLabel(list),lastWorn:worn?fmtKDate(worn).date:undefined};
  });

  // ── profile ─────────────────────────────────────────────────
  const totalKm=Math.round(sumKm(runs));
  const totalSec=runs.reduce((a,r)=>a+(r.duration||0),0);
  const firstDate=runs.length?runs.reduce((m:string,r:any)=>r.run_date<m?r.run_date:m,runs[0].run_date):'';
  const since=firstDate?(()=>{const d=new Date(firstDate+'T00:00:00');return `${d.getFullYear()}년 ${d.getMonth()+1}월부터`;})():'';
  const streak=maxDayStreak(runs.map(r=>r.run_date).filter(Boolean));
  const profile:Profile={
    name:'러너', since, totalKm:displayNum(sumKm(runs),unit,0), totalRuns:runs.length,
    totalTime:String(Math.round(totalSec/3600)),
    // 레벨/배지는 km 절대값(totalKm) 기준 — 단위를 바꿔도 자격이 흔들리지 않는다.
    level:`러닝 레벨 ${Math.floor(totalKm/100)+1}`,
  };
  const badges:Badge[]=[
    {icon:'trophy',label:'100km',on:totalKm>=100},
    {icon:'flame',label:'7일 연속',on:streak>=7},
    {icon:'flash',label:'10회 달성',on:runs.length>=10},
    {icon:'map',label:'하프',on:runs.some(r=>parseFloat(String(r.km))>=21.1)},
  ];
  // 개인 기록(PR) 프로필 카드: 1km 최고 페이스·5km 최고 기록·최장 거리. 거리·시간이
  // 모두 양수인 런만 페이스 산정에 쓴다(personalRecords 순수함수). 거리는 표시 단위로
  // 환산하고(페이스/시간은 단위 불변), 기록이 없는 항목은 '--'로 둔다.
  const prRuns=runs.map(r=>({run_date:String(r.run_date),km:parseFloat(String(r.km))||0,durationS:r.duration||0}));
  const pr=personalRecords(prRuns);
  const records:PersonalRecord[]=[
    {icon:'flash-outline',label:'1km 최고 페이스',value:pr.fastest1k!=null?fmtPace(1,pr.fastest1k):'--',unit:pr.fastest1k!=null?'/km':''},
    {icon:'timer-outline',label:'5km 최고 기록',value:pr.fastest5k!=null?fmtTime(Math.round(pr.fastest5k)):'--',unit:''},
    {icon:'trending-up-outline',label:'최장 거리',value:pr.longest!=null?String(displayNum(pr.longest,unit,2)):'--',unit:pr.longest!=null?unit:''},
  ];

  // ── actions ─────────────────────────────────────────────────
  // i는 homeUiShoes(보관 신발 제외 목록)의 인덱스 — 원본 신발로 되짚어 시작한다.
  const startFromIdx=(i:number)=>{
    const entry=homeShoes[i]; if(!entry) return;
    setPendingShoe({id:entry.raw.id,name:entry.raw.name,ui:entry.ui});
    setOverlay('goal');
  };
  // shoe-first 동선: 신발 화면(상세 CTA·락커 play)에서 신발 id로 런을 시작한다.
  // 시작 신발을 선택 신발로도 반영해(홈 히어로·'사용 중' 일관) 목표 설정 화면으로 넘어간다.
  const startFromShoeId=(id:string)=>{
    const i=idxById[id]; const raw=shoes[i]; if(!raw) return;
    setSelectedShoeId(id);
    setPendingShoe({id:raw.id,name:raw.name,ui:uiShoes[i]});
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
            shoes={homeUiShoes} week={week} dateLabel={dateLabel} unit={unit}
            goal={{km:goalWeeklyKm,pct:goalProgress.percent,streak:goalStreak}}
            activeIdx={homeActiveIdx} onSelect={selectHomeShoe}
            recommendedIdx={homeRecommendedIdx>=0?homeRecommendedIdx:undefined}
            onStart={startFromIdx} onAddShoe={()=>setOverlay('add')} onTab={setTab}
          />
        )}
        {tab===1&&(
          <HistoryScreen
            shoes={uiShoes} runs={uiRuns} summary={summary} chart={chart} unit={unit} onTab={setTab}
            onAddRun={addManualRun} onEditRun={editRun} onDeleteRun={deleteRun}
          />
        )}
        {tab===2&&(
          <ShoesScreen
            shoes={uiShoes} runs={uiRuns} totals={shoeTotals} activeIdx={shoesActiveIdx}
            prices={prices} onSetPrice={setShoePrice} unit={unit}
            onAddShoe={()=>setOverlay('add')} onTab={setTab}
            onRename={updateShoeName} onDelete={deleteShoe} onRetire={retireShoe}
            onSetMaxKm={updateShoeMaxKm} onStartRun={startFromShoeId}
          />
        )}
        {tab===3&&(
          <ProfileScreen
            profile={profile} badges={badges} records={records} onTab={setTab}
            unit={unit} onChangeUnit={changeUnit}
            goalWeeklyKm={goalWeeklyKm} weeklyPercent={goalProgress.percent} onChangeGoal={changeGoal}
            alerts={alerts} onChangeAlerts={changeAlerts}
            deviceId={deviceId}
          />
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
  // GPS 死구간(audit#9): 마지막 fix 수신 후 무신호가 지속되면 거리는 멈춘 채 시간만
  // 누적된다. 순수 판정(gpsStallStatus)으로 감지해 한국어 배너를 띄운다.
  const [gpsStalled,setGpsStalled]=useState(false);
  // 주행 중 위치 권한 회수: 트래킹을 멈추고(가비지 거리 금지) 영구 배너 + 설정 안내.
  const [permLost,setPermLost]=useState(false);
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
  // 死구간 판정용: '수신'한 마지막 fix의 벽시계 시각(거리 채택 여부와 무관 — 거부된
  // fix도 신호가 살아있음을 뜻하므로 갱신). 0이면 아직 첫 fix 전(워밍업/탐색).
  const lastRecvMs=useRef(0);
  // 주행 중 권한 회수 안내를 한 번만 띄우기 위한 가드(에러 콜백 반복 호출 방지).
  const permRevokedRef=useRef(false);
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
      }catch{}
    })();
    setTimeout(()=>{try{Tts.speak(`달리기를 시작합니다! 목표는 ${goalKm}킬로미터입니다.`);}catch{}},800);
    (async()=>{
      if(Platform.OS==='android'){
        // danger zone: 이 fine-location 게이트가 트래킹 시작의 유일한 관문이다.
        // 거부 시 watchPosition을 절대 시작하지 않는다(가비지 거리 금지). 회귀 금지.
        const granted=await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {title:'위치 권한',message:'러닝 거리 측정을 위해 위치 권한이 필요합니다.',buttonPositive:'허용',buttonNegative:'거부'}
        );
        if(granted!==PermissionsAndroid.RESULTS.GRANTED){
          // 한국어 안내 + 설정 딥링크. 트래킹은 시작하지 않고 그대로 반환한다.
          openLocationSettingsAlert('위치 권한을 허용해야 GPS 러닝이 가능합니다. 설정에서 위치 권한을 허용해 주세요.');
          setPermLost(true);
          return;
        }
        // 재스코프 주의: 예전엔 여기서 ACCESS_BACKGROUND_LOCATION을 추가 요청했으나
        // 제거했다. 설치된 react-native-geolocation-service@5.3.1은 실제 포그라운드
        // 서비스를 제공하지 않아 "화면을 꺼도 끊기지 않는다"는 약속이 거짓이고,
        // 동작하는 백그라운드 서비스 없이 백그라운드 위치 권한을 요청하면 Google Play
        // 심사 거부 위험이 있다. 실제 백그라운드 기록은 라이브러리 교체 또는 네이티브
        // 포그라운드 서비스가 필요한 사용자 결정사항이다(.tenet/knowledge 참고).
      }else if(Platform.OS==='ios'){
        // audit#8: iOS는 그동안 위치 권한을 한 번도 요청하지 않아 첫 fix가 영영 오지
        // 않는 무한 '신호 찾는 중'에 빠질 수 있었다. whenInUse(앱 사용 중) 권한을
        // 명시 요청하고, 허용되지 않으면 한국어 안내 + 설정 딥링크 후 트래킹 차단.
        let status:string;
        try{status=await Geolocation.requestAuthorization('whenInUse');}
        catch{status='denied';}
        if(status!=='granted'){
          openLocationSettingsAlert('위치 권한이 없어 GPS 러닝을 시작할 수 없습니다. 설정에서 위치 접근을 허용해 주세요.');
          setPermLost(true);
          return;
        }
      }
      beginRun();
    })();
    return()=>{stop();clearTimeout(stopConfirmTimer.current);try{Tts.stop();}catch{}};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    const fullKm=Math.floor(km);
    if(fullKm>0&&fullKm>announcedKm.current){
      announcedKm.current=fullKm;
      const remaining=Math.max(0,goalKm-fullKm);
      try{Tts.stop();}catch{}
      if(remaining>0){try{Tts.speak(`${fullKm}킬로미터 완주! 앞으로 ${Math.round(remaining)}킬로미터 남았습니다.`);}catch{}}
      else{try{Tts.speak(`목표 달성! ${goalKm}킬로미터 완주를 축하합니다!`);}catch{}}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try{Tts.stop();Tts.speak(auto?'자동으로 일시정지합니다.':'일시정지합니다.');}catch{}
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
    try{Tts.speak('달리기를 재개합니다.');}catch{}
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
    lastRecvMs.current=0;permRevokedRef.current=false;
    setGpsStalled(false);setPermLost(false);
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
      if(!isPausedRef.current){
        setElapsed(Math.max(0,Math.floor((Date.now()-t0.current-pausedMs.current)/1000)));
        // 死구간 판정(audit#9): 마지막 수신 후 무신호가 임계값을 넘으면 배너 ON.
        // 일시정지 중에는 fix가 정상적으로 끊길 수 있으므로 판정하지 않는다(거짓경보 방지).
        setGpsStalled(gpsStallStatus(lastRecvMs.current,Date.now()).stalled);
      }else{
        setGpsStalled(false);
      }
    },1000);
    // 진행중 스냅샷: 즉시 1회 + 3초마다(audit#2). 크래시/강제종료 시 복구 지점이 된다.
    writeSnapshot();
    snapTimer.current=setInterval(writeSnapshot,3000);
    watchId.current=Geolocation.watchPosition(
      pos=>{
        // fix 수신 시각(벽시계) 갱신 + 死구간 해제. 거리 채택 여부와 무관하게 신호가
        // 살아있다는 신호이므로 거부될 fix에도 갱신한다.
        lastRecvMs.current=Date.now();
        setGpsStalled(false); // 새 fix 도착 → 死구간 해제(값 동일 시 React가 리렌더 생략)
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
      err=>{
        // code 1 = PERMISSION_DENIED: 주행 중 위치 권한이 회수됨. 트래킹을 멈추고
        // (가비지 거리/시간 누적 금지) 한국어 안내 + 설정 딥링크. 그 외는 신호 없음.
        if(err&&err.code===1)handlePermissionRevoked();
        else setGpsStatus('GPS 신호 없음');
      },
      // forward-compat(무해): foregroundService 옵션을 부착해 두지만 현재 설치된
      // react-native-geolocation-service@5.3.1은 이 옵션을 인식하지 않아 no-op이다
      // (미지의 키는 네이티브 LocationOptions 파서가 조용히 무시 → 크래시 없음).
      // 따라서 지금은 화면off/백그라운드에서 fix가 지속되지 '않는다'. 포그라운드
      // 서비스를 제공하는 라이브러리로 교체하거나 네이티브 서비스를 도입하면 이
      // 옵션이 즉시 활성화된다(실제 백그라운드 트래킹은 follow-up, .tenet/knowledge).
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

  // 주행 중 위치 권한 회수 처리. stop()으로 watch/타이머/스냅샷을 모두 멈춰 거리·시간이
  // 더 누적되지 않게 하고(가비지 데이터 금지), 영구 배너 + 설정 딥링크로 안내한다.
  // 이미 기록된 거리/경과는 보존되며 사용자는 '종료'로 저장/버리기를 선택할 수 있다.
  // 가드로 1회만 동작해 에러 콜백 연속 호출 시 알림 폭주를 막는다(크래시/스팸 금지).
  function handlePermissionRevoked(){
    if(permRevokedRef.current)return;
    permRevokedRef.current=true;
    stop();
    setGpsStatus('위치 권한 필요');
    setGpsStalled(false); // 死구간 배너 대신 권한 회수 배너가 우선한다
    setPermLost(true);
    openLocationSettingsAlert('주행 중 위치 권한이 회수되어 거리 기록을 멈췄습니다. 설정에서 위치 권한을 다시 허용해 주세요.');
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
        }catch{}
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

      {/* 권한 회수 배너(우선) / GPS 死구간 배너(audit#9). 둘 다 한국어 안내. */}
      {permLost?(
        <TouchableOpacity style={[run.banner,run.bannerDanger]} onPress={()=>{Promise.resolve(Linking.openSettings()).catch(()=>{});}}>
          <Ionicons name="alert-circle" size={15} color={DANGER}/>
          <Text style={run.bannerText}>위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 설정에서 다시 허용하세요.</Text>
        </TouchableOpacity>
      ):gpsStalled?(
        <View style={[run.banner,run.bannerWarn]}>
          <Ionicons name="warning-outline" size={15} color={WARN}/>
          <Text style={run.bannerText}>GPS 신호가 약해 거리가 기록되지 않고 있어요. 시간만 계속 측정됩니다.</Text>
        </View>
      ):null}

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
  banner:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10,paddingVertical:10,paddingHorizontal:12,borderRadius:12,borderWidth:StyleSheet.hairlineWidth},
  bannerWarn:{backgroundColor:'rgba(255,193,7,0.12)',borderColor:WARN},
  bannerDanger:{backgroundColor:'rgba(255,69,58,0.14)',borderColor:DANGER},
  bannerText:{flex:1,color:T1,fontFamily:FP,fontSize:12.5,fontWeight:'500',lineHeight:17},
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
