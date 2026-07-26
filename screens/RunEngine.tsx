// ============================================================================
// screens/RunEngine.tsx — 라이브 러닝 엔진(GPS/센서/TTS + 저장 흐름)
// ----------------------------------------------------------------------------
// App.tsx 에서 분리(2026-07-26 감사 F-03 1단계). **동작 변경 0 — 순수 이동이다.**
//
// 왜 분리했나: App.tsx 가 3,300줄 · useState 79 · useEffect 44 로 부팅·인증·동기화·
// 신발/런 CRUD·업적·알림·워치·오버레이 라우팅·러닝 엔진을 모두 안고 있었다. 작은 UI 수정
// 하나에도 이 파일을 열어야 했고, 44개의 useEffect 는 서로의 실행 순서를 보장하지 않아
// 변경마다 회귀 위험이 붙었다.
// 이 블록은 자체 state 로 닫혀 있어(부모와는 props 로만 대화) 가장 안전하게 떼어낼 수
// 있는 경계였다. 함께 옮긴 KEEP_AWAKE_TAG·openLocationSettingsAlert 도 러닝 전용이다.
//
// 이 파일이 소유하는 것: GPS 구독·센서·자동 일시정지·음성 코칭·랩/트랙·스냅샷 저장·
// 완주 저장 흐름. 화면 표현은 RunActiveScreen(.rn) 이, 거리 계산은 lib/runTracker 가 한다.
// ============================================================================

import {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import {rf, rs, ri, rv} from '../lib/responsive';
import {View, StyleSheet, Pressable, Linking, AppState} from 'react-native';
import {showDialog} from '../lib/dialog';
import {Text, FONT_SCALE_CAP_HERO} from '../lib/text';
import {Pedometer, Barometer} from 'expo-sensors';
import {initElevState, feedAltitude, ElevState} from '../lib/elevation';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Tts from 'react-native-tts';
import {runVoice} from '../lib/runVoice/voice';
import {BG, CARD_HI as SURFACE, ACCENT, WARN, DANGER, T1, T2, T3, FONT as FP, DISPLAY as FH, NUM, SEP, RADIUS, GUTTER, MOTION, withAlpha, ICON} from '../theme';
import {Ring, Button, Input} from '../primitives';
import {reverseGeoLabelKo} from '../lib/geocode';
import RunActiveScreenView from '../RunActiveScreen.rn';
import {success as hapticSuccess, warning as hapticWarning, isHapticsEnabled} from '../lib/haptics';
import {PAUSE_MOVE_NUDGE_STEPS, PAUSE_MOVE_NUDGE_POLL_MS, NO_FIX_WARN_SEC} from '../lib/engineConstants';
import {simplifyRoute} from '../lib/geo';
import {appendFinalSplit} from '../lib/splits';
import {runTracker} from '../lib/runTracker';
import {haversineM, calibrateLapM, lapsToTrack} from '../lib/laps';
import {requestRunPermissions, startTracking, stopTracking, isPermissionError, hasForegroundPermission, RunPermissions} from '../lib/locationService';
import {activateKeepAwakeAsync, deactivateKeepAwake} from 'expo-keep-awake';
import {initStepCadence, feedStepCount, averageSpm} from '../lib/stepCadence';
import {fmtPace, fmtTime} from '../lib/format';
import {parseShoeName} from '../lib/shoe';
import {clearSnapshot, RunSnapshot} from '../lib/runPersistence';
import {VoiceSettings, loadVoiceSettings, DEFAULT_VOICE, loadAutoPause} from '../lib/settings';
import {estimateCaloriesTotal} from '../lib/calories';
import {currentTargetPace} from '../lib/pacePlan';
import {liveActivity} from '../lib/liveActivity';
import {watchSession} from '../lib/watchSession';
import {reportIssue} from '../lib/crashlytics';
import {pedometerDistance} from '../lib/pedometerDistance';
import {estimateMaxHR, zoneOf} from '../lib/analytics/hrZones';
import {decideZoneCoach, initZoneCoachState} from '../lib/zoneCoach';
import {showToast} from '../lib/toast';
import {trackRunStart, trackRunSave} from '../lib/productAnalytics';

const KEEP_AWAKE_TAG = 'keego-run';

function openLocationSettingsAlert(message:string){
  showDialog('위치 권한 필요',message,[
    {text:'닫기',style:'cancel'},
    {text:'설정 열기',onPress:()=>{Promise.resolve(Linking.openSettings()).catch(()=>{});}},
  ]);
}

export default function RunEngine({shoe,insets,goalKm,goalMin=0,pacePlan=[],targetZone=0,track=null,weightKg,age=0,restHR=0,onSave,onDiscard,resume,resumeMode}:{shoe:{id:string;name:string};insets:any;goalKm:number;goalMin?:number;pacePlan?:number[];targetZone?:number;track?:{lapM:number}|null;weightKg:number;age?:number;restHR?:number;onSave:(km:number,dur:number,cad:number,memo:string,route:string,location:string,splits:{km:number;paceSec:number;elevM:number}[],elevM:number,cal:number,paceTrack:{d:number;t:number}[],hrTrack:{t:number;bpm:number}[],gapTrack:{d:number;t:number;e:number}[],trackMeta?:{lapM:number;laps:number;lapTimes:number[]}|null)=>Promise<void>;onDiscard:()=>void;resume?:RunSnapshot|null;resumeMode?:'review'|'continue'}){
  // 'continue' = 스냅샷에서 GPS 를 재가동해 이어 달린다(엔진 seed*). 'review'(기본) =
  // done 화면에서 검토·저장만. resume 가 없으면(일반 시작) 두 분기 모두 타지 않는다.
  const isContinue=!!resume&&resumeMode==='continue';
  const ui=parseShoeName(shoe.name);
  // 복구 모드: 'review' 는 스냅샷을 done 화면에 띄워 검토 후 저장/버리기(GPS 재시작 안 함).
  // 'continue' 는 GPS/센서를 다시 켜고 누적 거리·경과를 시드해 running 으로 이어 달린다.
  const resumeRoute=resume?(()=>{const sr=simplifyRoute(resume.pts as any,200);return sr.length>=2?JSON.stringify(sr):'';})():'';
  const [phase,setPhase]=useState<'running'|'done'>(resume&&!isContinue?'done':'running');
  const [km,setKm]=useState(resume?resume.dist:0);
  const [elapsed,setElapsed]=useState(resume?resume.elapsed:0);
  // 현재(롤링) 페이스(초/km, null=표본부족/정지). 라이브 화면 히어로 페이스 — 평균은 보조.
  const [currentPaceSec,setCurrentPaceSec]=useState<number|null>(null);
  // GPS 신호 상태값 — 권한/정확도/무신호 판정에만 쓰이고 러닝 화면엔 '찾는 중' 문구를
  // 띄우지 않는다(나이키 등 관용 — 시작 시 거리 0.00 은 정상, 문구는 오히려 노이즈).
  const [,setGpsStatus]=useState('GPS 신호 찾는 중...');
  // GPS 死구간(audit#9): 마지막 fix 수신 후 무신호가 지속되면 거리는 멈춘 채 시간만
  // 누적된다. 순수 판정(gpsStallStatus)으로 감지해 한국어 배너를 띄운다.
  const [gpsStalled,setGpsStalled]=useState(false);
  // 스냅샷 저장 연속 실패 — 화면이 '백업 안 됨' 한 줄로 알린다(생명주기 감사 2026-07-26).
  const [snapshotFailing,setSnapshotFailing]=useState(false);
  // 주행 중 위치 권한 회수: 트래킹을 멈추고(가비지 거리 금지) 영구 배너 + 설정 안내.
  const [permLost,setPermLost]=useState(false);
  const [cadence,setCadence]=useState(resume?resume.cadence:0);
  // 마지막 fix 정확도(m, null=fix 이전). 실제 GPS 신호 강도(gpsLevel) 산출에 쓴다.
  const [accuracyM,setAccuracyM]=useState<number|null>(null);
  // 누적 고도 상승(m) — 엔진 state(elevGainM)에서 흘러온다. 복구 런은 스냅샷에 고도가
  // 없어 0에서 시작(엔진 미작동). finElev는 정지 시 최종값을 고정한다.
  const [elevGain,setElevGain]=useState(0);
  const [finElev,setFinElev]=useState(0);
  // 심박(bpm). 아이폰 단독은 미측정 → 0('--'). Apple Watch 컴패니언(watchSession)이
  // WatchConnectivity로 보내는 실시간 심박을 구독해 채운다(워치 없으면 0 유지).
  const [heartRate,setHeartRate]=useState(0);
  // 잠금화면 위젯용 심박 미러(ref) — 레코더 인터벌 클로저가 stale state 를 읽지 않게.
  const hrLiveRef=useRef(0);
  const [paused,setPaused]=useState(false);
  const [autoPaused,setAutoPaused]=useState(false);
  // 일시정지 이동 감지 넛지(심사 #11 잔여, 민우님 승인 2026-07-24 — Apple '재개 미리 알림'
  // 문법): '수동' 일시정지 중 걸음이 계속 쌓이면(재개 버튼을 깜빡한 채 달리기 재개) 진동
  // 1회 + 배너로 알려만 준다. 자동 재개는 하지 않는다 — 스트레칭·신호 대기 도보 이동일 수
  // 있어서(오판 시 자동 재개는 시간 오염, 배너는 무해). 자동 일시정지는 대상 아님(엔진의
  // 자동 재개가 담당). 신호는 Pedometer 걸음수만 — GPS 엔진(칼만/거리)은 불가침.
  const [pauseMoveNudge,setPauseMoveNudge]=useState(false);
  useEffect(()=>{
    const manualPause=paused&&!autoPaused;
    if(!manualPause){setPauseMoveNudge(false);return;}
    const t0=new Date();
    let fired=false;
    let alive=true;
    const iv=setInterval(()=>{
      void (async()=>{
        try{
          const r=await Pedometer.getStepCountAsync(t0,new Date());
          if(alive&&!fired&&(r?.steps??0)>=PAUSE_MOVE_NUDGE_STEPS){
            fired=true;
            hapticWarning(); // 주의 환기 1회 — 이후엔 배너가 상태를 계속 말한다(반복 진동 금지)
            setPauseMoveNudge(true);
          }
        }catch{/* 걸음 조회 불가(권한·시뮬) — 넛지 조용히 생략(비차단) */}
      })();
    },PAUSE_MOVE_NUDGE_POLL_MS);
    return()=>{alive=false;clearInterval(iv);};
  },[paused,autoPaused]);
  const [finKm,setFinKm]=useState(resume?resume.dist:0);
  const [finTime,setFinTime]=useState(resume?resume.elapsed:0);
  const [finCad,setFinCad]=useState(resume?resume.cadence:0);
  const [finRoute,setFinRoute]=useState(resumeRoute);
  // 완주 시 저장할 per-km 구간 스플릿(레코딩 결과 스냅샷).
  const [finSplits,setFinSplits]=useState<{km:number;paceSec:number;elevM:number}[]>([]);
  // 곡선 전용 (거리,경과시간) 시계열 — 완주 시 엔진에서 캡처해 paceTrack_<id>로 영속(고운 곡선).
  const [finPaceTrack,setFinPaceTrack]=useState<{d:number;t:number}[]>([]);
  // 심박 시계열 — 완주 시 엔진에서 캡처해 hrTrack_<id>로 영속(HR존·트레이닝효과 분석).
  const [finHrTrack,setFinHrTrack]=useState<{t:number;bpm:number}[]>([]);
  // GAP(경사보정페이스)용 (거리,경과초,고도) 시계열 — 완주 시 캡처해 gapTrack_<id>로 영속.
  const [finGapTrack,setFinGapTrack]=useState<{d:number;t:number;e:number}[]>([]);
  // 라이브 지도용 좌표 목록 — GPS fix마다 runTracker.getPoints()로 갱신한다.
  const [liveCoords,setLiveCoords]=useState<{lat:number;lon:number}[]>([]);
  const [finLocation,setFinLocation]=useState(resume?resume.location:'');
  const [memo,setMemo]=useState('');
  const [saving,setSaving]=useState(false);

  // ── 트랙 모드(운동장 랩) ────────────────────────────────────────────────────
  // GPS 누적거리는 트랙에서 못 믿는다(뱅뱅 돌며 드리프트) → 거리 = 랩수 × 확정 랩거리.
  // 랩 경계는 자동(출발점 복귀 감지, laps.ts) + 수동 보정. 첫 자동랩은 GPS 누적을 표준에
  // 스냅(snapLapDistance)해 실제 랩거리를 확정한다(사용자 선택 400 → 실측 300 자동 교정).
  const trackMode=!!track;
  const [lapCount,setLapCount]=useState(0);
  const [lapM,setLapM]=useState(track?.lapM??0); // 확정 랩거리(m) — 첫 자동랩 GPS 보정 후 갱신
  const lapMRef=useRef(track?.lapM??0);           // 클로저 지연 없는 최신 랩거리(m)
  const lapTimesRef=useRef<number[]>([]);          // 각 랩 완료 경과초(누적)
  const lapLeftRef=useRef(false);                  // 이번 랩에서 출발반경을 벗어난 적 있는가
  const lapStartRef=useRef<{lat:number;lon:number}|null>(null); // 출발점(첫 채택 fix)
  const lapPtCountRef=useRef(0);                   // 마지막으로 본 경로점 수(신규 점만 판정)
  const lapLockedRef=useRef(false);                // 랩거리 보정 확정(lock) 여부 — 후엔 재평가 X
  const LAP_RADIUS_M=12;                           // 출발점 복귀 판정 반경(자동랩)

  // 랩 확정(자동=viaAuto, 수동=false). 첫 '자동'랩에서만 GPS 누적을 표준에 스냅해 실제
  // 랩거리를 확정한다(수동은 GPS 미검증이라 보정 트리거 안 함 — 실내/GPS✗ 폴백은 선택값 유지).
  // refs 만 읽고 stable setter 만 써 mount effect 클로저에서 안전하게 호출된다.
  const registerLap=useCallback((atElapsed:number,viaAuto:boolean)=>{
    lapTimesRef.current.push(Math.max(0,Math.round(atElapsed)));
    const n=lapTimesRef.current.length;
    if(viaAuto&&!lapLockedRef.current){
      // 매 자동랩마다 GPS 누적÷랩수로 실측 한 바퀴를 재평가한다(순수 로직=calibrateLapM, 테스트로
      // 못박음). 표준 스냅=1랩에 확정, 비표준(350 등)=3랩 평균 안정 시 채택. lock 되면 이후 고정.
      const cal=calibrateLapM(runTracker.getDistanceKm(),n,lapMRef.current,lapLockedRef.current);
      lapLockedRef.current=cal.locked;
      if(cal.changed){
        lapMRef.current=cal.lapM;setLapM(cal.lapM);
        showToast({message:`이 트랙, 약 ${cal.lapM}m로 감지 — 반영했어요`});
      }
    }
    lapLeftRef.current=false;
    setLapCount(n);
    // 랩 상태를 엔진에 실어 다음 스냅샷에 영속(크래시 복구용).
    runTracker.setTrackMeta({lapM:lapMRef.current,lapTimes:lapTimesRef.current,locked:lapLockedRef.current});
  },[]);
  // 수동 랩 -1(오검지·중복 되돌리기). 마지막 랩 시각을 버리고 복귀상태를 리셋한다.
  const undoLap=useCallback(()=>{
    if(lapTimesRef.current.length===0)return;
    lapTimesRef.current.pop();lapLeftRef.current=false;
    setLapCount(lapTimesRef.current.length);
    runTracker.setTrackMeta({lapM:lapMRef.current,lapTimes:lapTimesRef.current,locked:lapLockedRef.current});
  },[]);

  // 크래시 복구 — 트랙 런 랩 상태 시드(마운트 1회). 복구 스냅샷에 track 이 있으면 랩수·확정
  // 랩거리·lock 을 되살린다(트랙 런이 GPS 런으로 잘못 복구돼 거리가 틀리는 것 방지). 'review'
  // (검토·저장)는 finishRun 을 안 거치므로 저장용 최종값(finKm·랩 시계열)도 여기서 채운다.
  useEffect(()=>{
    if(!trackMode||!resume?.track)return;
    const tk=resume.track;
    lapTimesRef.current=tk.lapTimes.slice();
    lapMRef.current=tk.lapM;lapLockedRef.current=tk.locked;
    lapStartRef.current=resume.pts?.[0]??null;lapPtCountRef.current=resume.pts?.length??0;
    setLapM(tk.lapM);setLapCount(tk.lapTimes.length);
    runTracker.setTrackMeta({lapM:tk.lapM,lapTimes:tk.lapTimes,locked:tk.locked});
    if(!isContinue){ // review: 저장용 최종값을 랩 데이터로 채운다(finishRun 미경유)
      const fk=(tk.lapTimes.length*tk.lapM)/1000;
      setFinKm(fk);setFinPaceTrack(lapsToTrack(tk.lapTimes,tk.lapM/1000));setFinSplits([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // elapsed 최신값을 km 안내 effect에서 정확히 읽기 위한 ref (state는 클로저 지연 있음).
  const elapsedRef=useRef(resume?resume.elapsed:0);

  const timer=useRef<any>(null);
  const snapTimer=useRef<any>(null);
  const stepSub=useRef<any>(null);
  // 폴링 시작 시각 — 종료 시 총 걸음수(러닝 전체)를 조회해 평균 케이던스를 산출하는 기준점.
  const stepT0Ref=useRef<Date|null>(null);
  // 기압 고도계(iOS Barometer.relativeAltitude) — GPS 고도(노이즈 큼)보다 정확한 고도 상승.
  // 사용 가능하면 baroAvail=true 가 되고, 이때부턴 화면/저장 고도를 기압계 누적으로 쓴다.
  const baroSub=useRef<any>(null);
  const baroElev=useRef<ElevState>(initElevState());
  const baroAvail=useRef(false);
  // CMPedometer 누적거리 구독 해제 함수(#16 거리 융합) — GPS 死구간 보정. 종료 시 정리.
  const pedDistUnsub=useRef<null|(()=>void)>(null);
  // 케이던스(spm) 순수 상태기계 — 가속도 피크검출+윈도우 정규화는 lib/cadence.ts.
  // 케이던스만 화면이 소유한다(가속도계 기반). 거리/시간/일시정지/死구간/권한 회수는
  // 모두 공유 GPS 엔진(runTracker)이 소유하고 subscribe로 화면에 흘려보낸다.
  const cadenceState=useRef(initStepCadence());
  const cadRef=useRef(0);
  const locationRef=useRef('');
  const locationFetched=useRef(false);
  const announcedKm=useRef(0);
  // 반 km 안내(주기 0.5km 설정 전용) — 0.5 단위 인덱스(floor(km*2)). 정수 km 는 announcedKm 담당.
  const announcedHalf=useRef(0);
  // 거리 목표 달성 음성 1회 가드 — 정수 km 경계가 아니라 km>=goalKm 순간에 울린다.
  // (과거엔 정수 경계에서 remaining<=0 판정이라 하프 21.1km 같은 소수 목표가 영영 침묵.)
  const announcedGoal=useRef(false);
  // 음성 코칭 설정 — 런 시작 시 1회 로드(설정 변경은 다음 런부터 적용, 러닝 중 재로드 없음).
  const voiceCfg=useRef<VoiceSettings>({...DEFAULT_VOICE});
  // 러닝 중 음성 온/오프(심사 #10) — 이 런에만 적용되는 오버라이드(설정 미변경). 초기값은
  // beginRun 에서 설정 로드 후 동기화. 끄면 진행 중 TTS 도 즉시 멈춘다.
  const [voiceMuted,setVoiceMuted]=useState(false);
  const toggleVoice=()=>{
    setVoiceMuted(m=>{
      const next=!m;
      runVoice.enabled=!next;
      if(next){try{Tts.stop();}catch{/* no-op */}}
      return next;
    });
  };
  // 요청한 위치 권한 결과(포그라운드/백그라운드). '계속 달리기'(거리 짧음 재시작) 시
  // 동일 권한으로 다시 트래킹을 시작하기 위해 보관한다.
  const permRef=useRef<RunPermissions>({foreground:true,background:false});
  // 이어 달리기 시드를 마운트당 1회만 적용하기 위한 가드(짧은 런 '계속 달리기' 재시작과 분리).
  const seededRef=useRef(false);
  // per-km 스플릿 누적(런 동안)과 마지막 km 경계의 시각/고도(구간 페이스·고도상승 계산용).
  const splitsRef=useRef<{km:number;paceSec:number;elevM:number}[]>([]);
  const lastSplitRef=useRef({elapsed:0,elevM:0});
  // 스피드 음성 코칭 throttle: 마지막 코칭 시각(런 경과초)과 직전 상태. 런 시계(elapsed)를
  // 기준으로 해 일시정지 중엔 자동으로 멈춘다. 최소 간격(COACH_MIN_S)마다만 멘트.
  const coachRef=useRef({lastS:0,lastState:''});
  // Live Activity 갱신 throttle(마지막 갱신 런 경과초) — ActivityKit 업데이트 예산 보호(~2s마다).
  const liveActRef=useRef(0);

  // Apple Watch 컴패니언이 보내는 실시간 심박(bpm) 구독. 워치 없으면 콜백이 안 와 0 유지.
  // 화면 표시(setHeartRate)와 함께 엔진(runTracker.feedHeartRate)에 먹여 HR 시계열을 적립한다
  // — 완주 시 hrTrack_<id>로 영속해 HR존·트레이닝효과 분석에 쓴다(워치 등록 시 자동 작동).
  useEffect(()=>watchSession.onHeartRate(bpm=>{setHeartRate(bpm);hrLiveRef.current=bpm;runTracker.feedHeartRate(bpm);}),[]);

  useEffect(()=>{
    // 'review' 복구는 이미 끝난 런을 검토만 한다 — GPS/센서/권한/TTS를 켜지 않는다.
    // 'continue'(이어 달리기)는 아래로 진행해 엔진을 시드 재가동한다. 일반 시작도 진행.
    if(resume&&!isContinue) return;
    // 언마운트 가드(2026-07-05): 권한 다이얼로그가 떠 있는 동안(await requestRunPermissions)
    // 화면을 벗어나면 cleanup 이 먼저 돌고, 그 뒤 늦게 resolve 된 beginRun 이 좀비 타이머·
    // GPS watch·keep-awake 를 다시 켜고 3초마다 스냅샷을 덮어써 가짜 '미완료 런'을 남겼다.
    // cancelled 로 그 뒤늦은 beginRun 을 막는다.
    let cancelled=false;
    // 공유 GPS 엔진(runTracker) 구독: 거리/시간/일시정지/死구간/권한 회수 상태가
    // 여기로 흘러와 화면 상태를 갱신한다. 포그라운드(watchPositionAsync)와
    // 백그라운드(task) fix가 모두 같은 엔진에 먹이므로, 화면off에서 누적된 거리도
    // 화면 복귀 시 이 구독으로 그대로 반영된다.
    const unsub=runTracker.subscribe(ev=>{
      if(ev.type==='state'){
        const s=ev.state;
        setKm(s.dist);setElapsed(s.elapsed);setCurrentPaceSec(s.currentPaceSecPerKm);
        elapsedRef.current=s.elapsed;
        setPaused(s.paused);setAutoPaused(s.autoPaused);
        setGpsStalled(s.stalled);setPermLost(s.permissionRevoked);setSnapshotFailing(s.snapshotFailing);
        if(!baroAvail.current)setElevGain(s.elevGainM); // 기압계 가용 시 GPS 고도 양보(baro 권위)
        setAccuracyM(s.accuracyM);
        // 지도는 일시정지에서만 렌더된다(mapShown = uiPaused && …) — 그때만 경로 스냅샷을
        // 만든다. 매 fix 마다 부르면 경로 전체를 1Hz 로 복사하게 된다(러닝이 길수록 커짐).
        // 일시정지 중엔 엔진이 pts 를 늘리지 않으므로(ingestFix 의 pause 가드) 한 번이면 충분하다.
        if(s.paused)setLiveCoords(runTracker.getPoints());
        // 트랙 모드 자동랩(출발점 복귀 감지) — 신규 경로점이 생겼을 때만 판정한다. 출발반경을
        // 벗어났다가(left) 다시 반경 안으로 들어오는 순간을 1랩으로. GPS 는 '복귀 판정'에만 쓰고
        // 거리는 registerLap 이 확정 랩거리로 낸다(누적 GPS 미사용). 실내(GPS✗)선 점이 안 생겨
        // 자동랩이 안 울리고 수동 랩 버튼이 주력이 된다.
        if(trackMode&&!s.paused){
          // 개수·첫점·끝점만 필요하다 — 경로 배열을 통째로 복사하지 않는다(1Hz 경로).
          const nPts=runTracker.getPointCount();
          if(nPts>lapPtCountRef.current){
            lapPtCountRef.current=nPts;
            if(!lapStartRef.current&&nPts>0)lapStartRef.current=runTracker.getFirstPoint();
            const st=lapStartRef.current;
            const latest=runTracker.getLastPoint();
            if(st&&latest){
              const dFromStart=haversineM(st.lat,st.lon,latest.lat,latest.lon);
              if(!lapLeftRef.current){if(dFromStart>LAP_RADIUS_M)lapLeftRef.current=true;}
              else if(dFromStart<=LAP_RADIUS_M)registerLap(s.elapsed,true);
            }
          }
        }
        // 잠금화면 위젯 갱신 — ~2s 마다(throttle, ActivityKit 예산 보호). 미정 페이스는 '--'.
        // 트랙 모드는 위젯에도 랩거리(랩수×확정랩거리)를 보낸다(GPS 누적 아님).
        if(!s.paused&&s.elapsed-liveActRef.current>=2){
          liveActRef.current=s.elapsed;
          const showDist=trackMode?(lapTimesRef.current.length*lapMRef.current)/1000:s.dist;
          liveActivity.update(showDist,Math.round(s.elapsed),
            s.currentPaceSecPerKm!=null?fmtPace(1,s.currentPaceSecPerKm):'--',
            fmtPace(showDist,s.elapsed),cadRef.current,hrLiveRef.current);
        }
        // per-km 스플릿: dist가 정수 km 경계를 새로 넘으면 그 1km의 소요시간(초)·고도상승(m)을
        // 기록한다. 경로에 타임스탬프가 없어 못 했던 '실제' 구간 페이스를 레코더가 직접 남긴다.
        // 고도 소스는 총 상승(finElevTotal)과 동일하게 기압계 우선 — GPS 고도만 쓰면 평지
        // 러닝에서 노이즈 누적으로 스플릿 고도가 부풀어(실측 3km 평지에서 64/53m) 총합과
        // 모순된다(2026-07-03 검증 러닝 데이터). 트랙 모드는 GPS 거리를 안 쓰므로 스킵 —
        // 구간(랩) 페이스는 완주 시 랩 시계열(lapsToTrack)로 낸다.
        if(!trackMode&&Math.floor(s.dist)>splitsRef.current.length){
          const splitKm=splitsRef.current.length+1;
          const gainNow=baroAvail.current?baroElev.current.gain:s.elevGainM;
          splitsRef.current.push({km:splitKm,
            paceSec:Math.max(0,Math.round(s.elapsed-lastSplitRef.current.elapsed)),
            elevM:Math.max(0,Math.round(gainNow-lastSplitRef.current.elevM))});
          lastSplitRef.current={elapsed:s.elapsed,elevM:gainNow};
        }
        if(s.permissionRevoked)setGpsStatus('위치 권한 필요');
        else if(s.accuracyM!=null)setGpsStatus(`정확도 ${s.accuracyM}m`);
        // 스피드 음성 코칭 — 현재 km 목표 페이스 대비 빠름/적정/느림. 시작 직후·표본부족·
        // 일시정지는 건너뛰고, off-target(±8초)일 때 최소 COACH_MIN_S 간격으로 멘트한다.
        // 'on'(적정)은 off에서 막 복귀했을 때만 1회 알린다(잡담 방지).
        if(pacePlan&&pacePlan.length&&!s.paused){
          const tgt=currentTargetPace(pacePlan,s.dist);
          const cur=s.currentPaceSecPerKm;
          const COACH_MIN_S=25, BUF=8;
          if(tgt!=null&&cur!=null&&s.elapsed>=20&&s.elapsed-coachRef.current.lastS>=COACH_MIN_S){
            const st=cur<=tgt-BUF?'fast':cur>=tgt+BUF?'slow':'on';
            if(st==='slow'){runVoice.paceSlow();coachRef.current={lastS:s.elapsed,lastState:'slow'};}
            else if(st==='fast'){runVoice.paceFast();coachRef.current={lastS:s.elapsed,lastState:'fast'};}
            else if(st==='on'&&(coachRef.current.lastState==='slow'||coachRef.current.lastState==='fast')){runVoice.paceOn();coachRef.current={lastS:s.elapsed,lastState:'on'};}
          }
        }
      }else if(ev.type==='paused'){
        try{Tts.stop();}catch{/* 무해: 이미 멈춘 TTS */}runVoice.autoPause();
      }else if(ev.type==='resumed'){
        runVoice.resume();
      }else if(ev.type==='firstFix'){
        setGpsStatus(''); // 첫 GPS fix 도달 → 상태값 클리어(무신호 판정 리셋).
        // 첫 fix 좌표로 1회 역지오코딩 → 위치 라벨. 엔진 메타에도 실어 스냅샷/저장에 반영.
        // OS 내장 지오코더(lib/geocode — Nominatim 은퇴 2026-07-17, 외부 서버 의존 0).
        if(!locationFetched.current){
          locationFetched.current=true;
          void reverseGeoLabelKo(ev.lat,ev.lon).then(label=>{
            if(!label) return;
            locationRef.current=label;
            runTracker.setMeta({location:label});
          });
        }
      }else if(ev.type==='permissionRevoked'){
        // 주행 중 권한 회수: 엔진이 트래킹(거리·시간)을 멈췄다. delivery 경로와
        // 1초 틱/스냅샷 타이머도 정리한다 — 틱이 계속 돌면 헛돌 뿐이고, 시간은
        // 엔진이 freeze하므로 더 증가하지 않는다(거리와 동일하게 정지).
        clearInterval(timer.current);clearInterval(snapTimer.current);
        void stopTracking();
        setGpsStatus('위치 권한이 필요해요');setGpsStalled(false);
        openLocationSettingsAlert('달리는 중에 위치 권한이 꺼져서 거리 기록을 멈췄어요. 설정에서 위치 권한을 다시 허용해 주세요.');
      }
    });

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
      }catch{/* 무해: 한국어 여성 보이스 부재 → 기본 보이스로 폴백 */}
    })();
    const voiceTimer=setTimeout(()=>{if(!cancelled)runVoice.start();},800);
    (async()=>{
      // expo-location 통합 권한 게이트(android/ios 공통). 포그라운드 권한이 트래킹
      // 시작의 유일한 관문이다 — 거부 시 절대 시작하지 않는다(가비지 거리 금지).
      // 백그라운드(화면off) 권한은 추가 요청하되 거부돼도 비치명적: 포그라운드
      // 트래킹은 그대로 동작한다(graceful). 회귀 금지.
      const perm=await requestRunPermissions();
      if(cancelled) return; // 권한 대기 중 언마운트 — 좀비 beginRun 방지.
      permRef.current=perm;
      if(!perm.foreground){
        openLocationSettingsAlert('위치 권한을 허용해야 GPS 러닝이 가능합니다. 설정에서 위치 권한을 허용해 주세요.');
        setPermLost(true);
        return;
      }
      if(cancelled) return;
      await beginRun();
    })();
    return()=>{cancelled=true;clearTimeout(voiceTimer);stop();unsub();try{Tts.stop();}catch{/* 무해: 이미 멈춘 TTS */}runVoice.stop();};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // 권한 회수 배너 탈출(#6): 설정에서 위치를 다시 허용하고 앱으로 복귀(AppState 'active')하면
  // 트래킹을 재개한다. 이게 없으면 회수 배너의 '설정 열기'가 실효 없이, 재허용해도 거리계가
  // 0/정지로 멈춘 채였다. 회수 후 재개(resumed=true)는 엔진 un-revoke + delivery/타이머 재무장
  // (거리 보존), '처음부터 거부'(엔진 미시작)는 풀 beginRun. permLost 일 때만 리스너를 단다.
  useEffect(()=>{
    if(resume&&!isContinue) return;
    if(!permLost) return;
    const sub=AppState.addEventListener('change',(next)=>{
      if(next!=='active') return;
      (async()=>{
        if(!(await hasForegroundPermission())) return; // 아직 미허용 → 배너 유지
        const resumed=runTracker.resumeFromPermissionRevoked();
        setPermLost(false);setGpsStatus('GPS 신호 찾는 중...');
        if(resumed){
          // 회수 후 재개 — 거리 보존, delivery/타이머만 재무장.
          clearInterval(timer.current);clearInterval(snapTimer.current);
          timer.current=setInterval(()=>runTracker.tick(),1000);
          snapTimer.current=setInterval(()=>runTracker.persist(),3000);
          await startTracking(goalKm,{onError:reason=>{
            if(isPermissionError(reason))runTracker.notifyPermissionRevoked();
            else setGpsStatus('GPS 신호 없음');
          }});
        }else{
          // 처음부터 거부됐던 경우(엔진 미시작) — 풀 시작.
          await beginRun();
        }
      })();
    });
    return()=>sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[permLost]);

  useEffect(()=>{
    if(trackMode)return; // 트랙: km 는 GPS 누적(트랙에선 무의미) — km 음성 코칭 억제(랩은 별도)
    const vc=voiceCfg.current;
    // 목표 달성 — km 가 goalKm 를 넘는 '순간'(정수 경계 아님)에 1회. 소수 목표(하프 21.1,
    // 슬라이더 0.1 스텝)도 정확히 울린다. 과거 정수 경계 remaining<=0 판정은 비정수 목표에서
    // 영영 침묵이었다(2026-07-16 근본수정).
    if(goalKm>0&&!announcedGoal.current&&km>=goalKm){
      announcedGoal.current=true;
      runVoice.goal();
    }
    const fullKm=Math.floor(km);
    if(fullKm>0&&fullKm>announcedKm.current){
      announcedKm.current=fullKm;
      const remaining=Math.max(0,goalKm-fullKm);
      // 특별 구간(절반/마지막/목표)은 주기 설정과 무관하게 유지 — 목표런 UX 의 핵심 신호.
      const isHalf=goalKm>0&&fullKm===Math.floor(goalKm/2)&&goalKm>=2;
      // '마지막 1km' — 남은 거리가 1km 대에 들어선 정수 경계(반올림 1). 정수 목표(5→4km 지점)는
      // 기존과 동일, 소수 목표(21.1→20km 지점, 남은 1.1km)도 울린다.
      const isLastKm=remaining>0&&Math.round(remaining)===1;
      if(goalKm>0&&km>=goalKm){/* 목표 달성 직후 정수 경계 — 위에서 목표 음성이 담당, km 큐는 침묵 */}
      else{
        // 거리 안내(탑티어 패리티 #14): 주기(intervalKm)의 배수 km 에서만. 페이스는 설정
        // 기준(구간=직전 1km 스플릿 / 평균=elapsed/km), 경과시간은 timeCue 설정 시 이어붙임.
        const intervalHit=vc.intervalKm>0&&fullKm%Math.max(1,Math.round(vc.intervalKm))===0;
        if(intervalHit){
          const paceSec=!vc.paceCue?null
            :vc.paceBasis==='avg'?(km>0.05&&elapsed>0?elapsed/km:null)
            :(splitsRef.current[fullKm-1]?.paceSec ?? null);
          runVoice.kmCue(fullKm,paceSec,{half:isHalf,lastKm:isLastKm,elapsedSec:vc.timeCue?elapsed:null,paceBasis:vc.paceBasis});
        }else if(isHalf||isLastKm){
          // 주기에 걸리지 않아도 절반/마지막은 단독으로 안내한다.
          runVoice.play([...(isHalf?['half']:[]),...(isLastKm?['last_km']:[])]);
        }
      }
    }
    // 반 km 안내(주기 0.5km 전용) — X.5 지점(정수 km 는 위에서 처리). 목표 도달 후엔 침묵.
    if(vc.intervalKm===0.5){
      const halfIdx=Math.floor(km*2);
      if(halfIdx>announcedHalf.current){
        announcedHalf.current=halfIdx;
        if(halfIdx%2===1&&!(goalKm>0&&km>=goalKm)){
          const avgPace=vc.paceCue&&km>0.05&&elapsed>0?elapsed/km:null;
          runVoice.halfKmCue(halfIdx/2,avgPace,vc.timeCue?elapsed:null);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[km]);

  // ── 시간 목표(분) 절반/달성 음성(#15) — 시간 목표는 km 가 아니라 경과시간이 기준이다.
  // 이전엔 goalMin 이 어디에서도 소비되지 않아 시간 목표 러닝이 자유런처럼 침묵했다.
  // 절반은 10분 이상 목표에서만(짧은 런 소음 방지 — 거리 절반의 goalKm>=2 와 같은 정신).
  // 달성 축하(토스트·햅틱·링)는 프레젠테이션(met)이 담당, 여기선 음성만.
  const announcedTimeHalf=useRef(false);
  const announcedTimeGoal=useRef(false);
  useEffect(()=>{
    if(!(goalMin>0)||goalKm>0)return; // 시간 목표 모드에서만(목표 유형은 상호배타)
    if(!announcedTimeHalf.current&&goalMin>=10&&elapsed>=goalMin*30){
      announcedTimeHalf.current=true;
      runVoice.half();
    }
    if(!announcedTimeGoal.current&&elapsed>=goalMin*60){
      announcedTimeGoal.current=true;
      runVoice.goal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[elapsed]);

  // ── 심박존 코칭(#7): 목표 존(targetZone) 이탈 시 색·화살표·음성. 1초 틱(elapsed)마다
  // 현재 심박존 vs 목표를 판정한다. 순수 히스테리시스(zoneCoach)가 첫 15s·재알림 60s·복귀
  // 침묵을 담당 — 과알림 방지. 심박 미측정(bpm 0)·가이드 꺼짐(0)·일시정지 시 비활성.
  const zoneCoachRef=useRef(initZoneCoachState());
  const [zoneDeviation,setZoneDeviation]=useState<'up'|'down'|null>(null);
  const prevZoneTickRef=useRef(0);
  useEffect(()=>{
    if(!(targetZone>=2&&targetZone<=4)||paused){
      if(zoneDeviation!==null)setZoneDeviation(null);
      zoneCoachRef.current=initZoneCoachState();
      return;
    }
    const cur=heartRate>0?zoneOf(heartRate,estimateMaxHR(age),restHR||undefined):0;
    const dt=Math.max(0,elapsed-prevZoneTickRef.current); prevZoneTickRef.current=elapsed;
    const d=decideZoneCoach(zoneCoachRef.current,cur,targetZone,dt||1);
    zoneCoachRef.current=d.state;
    if(d.deviation!==zoneDeviation)setZoneDeviation(d.deviation);
    if(d.announce==='down'){runVoice.zoneDown(targetZone);if(isHapticsEnabled())watchSession.zoneHaptic('down');}
    else if(d.announce==='up'){runVoice.zoneUp(targetZone);if(isHapticsEnabled())watchSession.zoneHaptic('up');}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[elapsed]);

  // 런 시작: 공유 엔진을 초기화하고, 케이던스 가속도계 + 1초 틱(경과/死구간) +
  // 3초 스냅샷 타이머를 띄운 뒤 expo-location 트래킹(포그라운드 watch + 가능 시
  // 백그라운드 task)을 시작한다. 거리/시간/일시정지/死구간 판정은 모두 엔진이
  // 소유하고 subscribe로 화면에 반영된다(이 함수는 delivery/타이머만 띄운다).
  async function beginRun(){
    runBeganMsRef.current=Date.now(); // 워치 정지 미러링의 스테일 판정 기준(이 시각 이전 정지는 무시)
    // 코어 루프 계측(심사 B-12) — 어떤 목표로 시작하는지. 신발 유무는 활성화 지표와 잇는다.
    trackRunStart({
      goalType:trackMode?'track':goalKm>0?'distance':goalMin>0?'time':pacePlan.length>0?'speed':'free',
      device:'phone',
      hasShoe:!!shoe?.id,
    });
    // 음성 코칭 설정 로드(런당 1회) — 마스터 on/off·볼륨을 엔진에 주입(탑티어 패리티 #14).
    let autoPauseOn=true;
    try{
      voiceCfg.current=await loadVoiceSettings();
      runVoice.enabled=voiceCfg.current.enabled;
      runVoice.setVolume(voiceCfg.current.volume);
      setVoiceMuted(!voiceCfg.current.enabled); // 일시정지 화면 토글(심사 #10) 초기 동기화
      autoPauseOn=await loadAutoPause(); // 자동 일시정지 설정(#16) — 런당 1회 로드
    }catch{/* 설정 로드 실패 → 기본값(전부 on) 유지 */}
    // 러닝 시작 — 화면 자동잠금 방지(글랜서빌리티). 실패해도 러닝엔 무관(best-effort).
    // 화면 잠금 방지 실패는 무해하다(화면이 꺼져도 백그라운드 추적은 계속된다) — 다만
    // '러닝 중 화면이 꺼진다'는 CS 의 유일한 단서라 흔적은 남긴다.
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(e=>reportIssue('run: keep-awake activate',e));
    // 페어링된 애플워치가 있으면 워크아웃을 자동 실행해 심박이 손목 조작 없이 흐르게 한다
    // (startWatchApp). 워치 없으면 조용히 no-op — 심박만 '--'. best-effort.
    // 워치 워크아웃 시작 실패 = 그 런의 심박·워치 미러링이 통째로 없다는 뜻이다. 앱을 깨서는
    // 안 되지만(워치는 선택 기능) 무음이어서도 안 된다 — 과거 '워치 런 심박 실종' 계열의
    // CS 는 이 지점의 흔적이 없어 원인 추적이 불가능했다.
    void watchSession.startWorkout().catch(e=>reportIssue('watch: startWorkout',e));
    // 기압 고도계 누적 상태 리셋(이어 달리기/재시작 대비) — 구독은 아래에서 새로 건다.
    baroElev.current=initElevState();baroAvail.current=false;
    // 잠금화면 Live Activity 시작(iOS 위젯 타깃 있을 때만 동작 — 없으면 no-op).
    liveActivity.start(ui.model||shoe.name,goalKm,0,0,'--','--');
    // 위젯 미표시 자기 진단(2026-07-25): 시스템 설정에서 실시간 현황이 꺼져 있으면 start 가
    // 소리 없이 포기한다 — 왜 안 뜨는지 사용자가 알 수 있게 한 줄로 알린다(러닝당 1회).
    void liveActivity.areEnabled().then(ok=>{
      if(!ok&&liveActivity.available)showToast({message:'잠금화면 위젯이 꺼져 있어요 — 설정 > Keego > 실시간 현황'});
    });
    liveActRef.current=0;
    // 이어 달리기(첫 진입에 한함): 스냅샷의 누적 거리·경로·경과시간을 엔진/화면에 시드한다.
    // t0=now−elapsed 로 경과를 잇고, 死구간을 가로지르는 허위 거리를 막기 위해 거리는
    // seedDist 로만 잇는다(엔진이 첫 fix 를 새 앵커로 삼음). '계속 달리기'(짧은 런 재시작)로
    // 다시 호출될 땐 seed 하지 않는다 — 그 경로는 0 부터 새로 시작이 의도다.
    const seed=isContinue&&resume&&!seededRef.current?resume:null;
    seededRef.current=true; // 시드는 마운트당 첫 beginRun 1회만 — '계속 달리기' 재시작은 0부터.
    if(seed){
      runTracker.start({goalKm,goalMin,pacePlan,autoPause:autoPauseOn,shoe:{id:shoe.id,name:shoe.name},
        t0:Date.now()-seed.elapsed*1000,seedDist:seed.dist,
        seedPts:seed.pts as any,seedLocation:seed.location});
      // 크래시 전 통과한 km 만큼 스플릿 슬롯을 채워, 재개 후의 km 경계부터 실측이 기록되게
      // 한다(이전 구간 페이스는 스냅샷에 없어 복원 불가 — 0 으로 둠). 안내 km 도 시드한다.
      splitsRef.current=Array.from({length:Math.floor(seed.dist)},(_,i)=>({km:i+1,paceSec:0,elevM:0}));
      lastSplitRef.current={elapsed:seed.elapsed,elevM:0};
      setKm(seed.dist);setElapsed(seed.elapsed);setCadence(seed.cadence);setAccuracyM(null);
      setGpsStalled(false);setPermLost(false);setGpsStatus('GPS 신호 찾는 중...');
      cadenceState.current=initStepCadence();cadRef.current=0;
      locationRef.current=seed.location;locationFetched.current=!!seed.location;
      announcedKm.current=Math.floor(seed.dist);
      announcedHalf.current=Math.floor(seed.dist*2);
    }else{
    runTracker.start({goalKm,goalMin,pacePlan,autoPause:autoPauseOn,shoe:{id:shoe.id,name:shoe.name}});
    splitsRef.current=[];lastSplitRef.current={elapsed:0,elevM:0};
    setKm(0);setElapsed(0);setCadence(0);setAccuracyM(null);
    setGpsStalled(false);setPermLost(false);setGpsStatus('GPS 신호 찾는 중...');
    cadenceState.current=initStepCadence();cadRef.current=0;
    locationRef.current='';locationFetched.current=false;announcedKm.current=0;announcedHalf.current=0;
    // 목표 음성 1회 가드 리셋 — 거리·시간 모두. (시간 목표 refs 는 리셋이 빠져 있어
    // 같은 세션 두 번째 시간 목표 런부터 절반/달성 음성이 영영 침묵했다 — 2026-07-16 수정.)
    announcedGoal.current=false;announcedTimeHalf.current=false;announcedTimeGoal.current=false;
    // 트랙 fresh 시작: 랩 상태 초기화 + 초기 lapM 을 엔진에 실어 첫 랩 전 크래시도 트랙으로 복구.
    if(trackMode){
      lapTimesRef.current=[];lapLeftRef.current=false;lapStartRef.current=null;lapPtCountRef.current=0;lapLockedRef.current=false;
      lapMRef.current=track!.lapM;setLapM(track!.lapM);setLapCount(0);
      runTracker.setTrackMeta({lapM:track!.lapM,lapTimes:[],locked:false});
    }
    }
    // 케이던스(걸음수): OS 걸음 센서(CMPedometer)의 누적 걸음수를 **주기 조회(폴링)**로
    // 받아 분당 비율 spm 을 산출한다. watchStepCount 스트림은 expo-sensors 네이티브가
    // OnAppEntersBackground 에서 stopUpdates() 해 화면을 잠그면(주머니 러닝) 끊긴다 —
    // 2026-07-03 실전 검증에서 케이던스 0 의 원인. 모션 보조칩은 앱과 무관하게 걸음을
    // 하드웨어에 기록하므로 getStepCountAsync(러닝시작, 지금) 조회는 잠금 구간까지 소급해
    // 정확하다(나이키 방식). 폴링은 위치 백그라운드 모드로 JS 가 살아 있어 잠금 중에도 돈다.
    // 거부/미지원 기기에선 케이던스만 0(러닝은 계속).
    try{
      const perm=await Pedometer.requestPermissionsAsync();
      const available=perm.granted?await Pedometer.isAvailableAsync():false;
      if(available){
        const stepT0=new Date();
        stepT0Ref.current=stepT0;
        let polling=false;
        stepSub.current=setInterval(async()=>{
          if(polling)return;
          polling=true;
          try{
            const r=await Pedometer.getStepCountAsync(stepT0,new Date());
            // 걸음 정지 게이트 공급 — 일시정지 중에도 계속 먹인다. 끊으면 오토포즈가
            // 노이즈로 잠깐 풀리는 창에서 표본이 스테일해져 게이트가 꺼진 채 팬텀 거리가
            // 새던 바로 그 구간을 놓친다(도심 신호대기 팬텀 차단, 2026-07-11).
            runTracker.feedSteps(r?.steps??0,Date.now());
            if(runTracker.pausedFlag())return; // 케이던스 표시 계산만 일시정지 중 생략(기존 동작)
            const c=feedStepCount(cadenceState.current,r?.steps??0,Date.now());
            cadenceState.current=c.state;
            if(c.spm!==cadRef.current){cadRef.current=c.spm;setCadence(c.spm);runTracker.setMeta({cadence:c.spm});}
          }catch{/* 일시 조회 실패 — 다음 폴에서 재시도 */}
          finally{polling=false;}
        },2500); // 5000→2500(2026-07-18): 오토포즈 걸음 보조의 반응성 — 정지 감지가 폴 주기에 묶인다.
      }
    }catch{/* 걸음 센서 미지원/권한 거부 — 케이던스만 비활성, 러닝은 계속 */}
    // 기압 고도계(iOS): relativeAltitude(구독 시작 이후 누적 고도변화, m)를 feedAltitude 로
    // 누적해 고도 상승을 잡는다. GPS 고도보다 훨씬 매끄러워(±0.5m) 평지 부풀림이 거의 없다.
    // 사용 가능 기기에서만 baroAvail=true → 화면/저장 고도를 기압계 값으로 대체(없으면 GPS 폴백).
    try{
      if(await Barometer.isAvailableAsync()){
        Barometer.setUpdateInterval(1000);
        baroSub.current=Barometer.addListener((ev:any)=>{
          if(runTracker.pausedFlag())return;
          const rel=ev?.relativeAltitude;
          if(typeof rel!=='number'||!Number.isFinite(rel))return; // Android 등 미제공
          baroElev.current=feedAltitude(baroElev.current,rel);
          baroAvail.current=true;
          setElevGain(Math.round(baroElev.current.gain));
        });
      }
    }catch{/* 기압계 미지원/실패 — GPS 고도로 폴백 */}
    // CMPedometer 누적거리 융합(#16): GPS 가 정본이고, 이 누적거리는 runTracker 가
    // **GPS 死구간에서만** 유실분 보정에 쓴다(死구간 한정·순수 가산 — 정상 구간 무해).
    // 미지원/거부는 네이티브·래퍼가 조용히 no-op(available=false). 종료 시 정리.
    try{
      pedometerDistance.start();
      pedDistUnsub.current=pedometerDistance.onDistance(m=>runTracker.feedPedometerDistance(m,Date.now()));
    }catch{/* 네이티브 부재/예외 — 거리 정본은 GPS, 융합만 비활성 */}
    // 1초 틱: fix가 없어도 경과/死구간을 다시 계산해 화면을 갱신한다(엔진이 판정).
    timer.current=setInterval(()=>runTracker.tick(),1000);
    // 진행중 스냅샷: 3초마다 영속(audit#2). fix마다도 persist되지만, 무신호 구간에서
    // 시간만 흐를 때의 복구 정확도를 위해 주기 저장도 둔다. 크래시 시 복구 지점.
    snapTimer.current=setInterval(()=>runTracker.persist(),3000);
    await startTracking(goalKm,{
      onError:reason=>{
        // 권한 회수성 에러면 엔진을 멈춰 가비지 거리/시간 누적을 막는다(subscribe의
        // permissionRevoked 핸들러가 delivery 정리 + 안내를 맡는다). 그 외는 신호 없음.
        if(isPermissionError(reason))runTracker.notifyPermissionRevoked();
        else setGpsStatus('GPS 신호 없음');
      },
    });
  }

  function stop(){
    if(stepSub.current){clearInterval(stepSub.current);stepSub.current=null;}
    if(baroSub.current){try{baroSub.current.remove();}catch{/* noop */}baroSub.current=null;}
    if(pedDistUnsub.current){try{pedDistUnsub.current();}catch{/* noop */}pedDistUnsub.current=null;}
    pedometerDistance.stop(); // CMPedometer 스트림 종료(#16 융합) — 배터리·프라이버시

    liveActivity.end(); // 잠금화면 위젯 닫기(종료/완주/취소/언마운트 모두 stop 경유)
    watchSession.stopWorkout(); // 워치 워크아웃도 종료(자동시작의 짝) — 종료/완주/취소 모두 경유
    clearInterval(timer.current);
    clearInterval(snapTimer.current);
    void stopTracking();
    runTracker.stop();
    // 화면 자동잠금 방지 해제 — 종료/완주/취소/언마운트(effect cleanup)가 모두 stop()을 경유.
    try{deactivateKeepAwake(KEEP_AWAKE_TAG);}catch{/* 무해: 이미 해제됨 */}
  }

  function handlePause(){
    // 수동 토글: 엔진이 pauseStart 가드로 pausedMs를 1회만 가산한다.
    runTracker.togglePause();
  }

  // 런 종료(실제 stop) — RunActiveScreen 종료 버튼의 롱프레스로만 호출된다(롱프레스 자체가
  // 오작동 종료 가드라 별도 2단계 확인은 두지 않는다). 거리가 너무 짧으면 계속/나가기 선택.
  // 워치 정지 미러링(2026-07-18) — 워치에서 종료를 누르면 폰 러닝도 같은 종료 플로우를
  // 탄다(세리머니 없이 finishRun 직행 — 폰은 주머니/잠금일 확률이 높다). 배달 보장 큐로
  // 늦게 온 스테일 정지가 다음 러닝을 죽이지 않게 '이번 러닝 시작 이후의 정지'만 존중
  // (30s = 폰·워치 시계 오차 허용). watchStopRef 로 중복 배달(메시지+큐)도 1회만 처리.
  const runBeganMsRef=useRef(0);
  const finishRunRef=useRef<()=>void>(()=>{});
  finishRunRef.current=finishRun;
  const watchStopHandledRef=useRef(false);
  useEffect(()=>watchSession.onWatchStop(cmdAtMs=>{
    if(!runBeganMsRef.current||watchStopHandledRef.current)return;
    if(cmdAtMs>0&&cmdAtMs<runBeganMsRef.current-30000)return; // 이전 러닝의 스테일 정지
    watchStopHandledRef.current=true;
    finishRunRef.current();

  }),[]);

  async function finishRun(){
    // 최종 거리/시간. 트랙 모드는 랩수×확정랩거리(GPS 누적 아님), 그 외는 엔진 누적거리.
    const ft=runTracker.getElapsedFinal();
    const fk=trackMode?(lapTimesRef.current.length*lapMRef.current)/1000:runTracker.getDistanceKm();
    if(fk<0.01){
      stop();
      showDialog('거리가 너무 짧아요','조금 더 달릴까요, 아니면 여기서 마칠까요?',[
        {text:'계속 달리기',onPress:()=>{setKm(0);setElapsed(0);setCadence(0);setGpsStatus('GPS 신호 찾는 중...');setPaused(false);setAutoPaused(false);void beginRun();}},
        {text:'나가기',style:'destructive',onPress:onDiscard},
      ]);
      return;
    }
    stop();
    // 저장으로 이어지는 완주만 계측한다(위 거리 가드에서 버려진 런은 제외). 거리·시간은
    // 버킷으로만 나간다(심사 B-12 최소 수집).
    trackRunSave({km:fk,durationSec:ft,device:'phone',hadGps:runTracker.getPointCount()>1});
    // 완주 요약 음성 — "운동을 종료합니다. 수고하셨습니다, N킬로미터, 경과 시간 …, 평균 페이스 …"
    // (Nike/NRC 종료 요약 관용). 거리는 클립 격자(0.5km)로 반올림해 읽는다(화면엔 정확값).
    runVoice.finishSummary(fk, ft, fk > 0.2 ? ft / fk : null);
    const sampled=simplifyRoute(runTracker.getPoints() as any,200);
    const routeFin=sampled.length>=2?JSON.stringify(sampled):'';
    setFinRoute(routeFin);
    // 고도: **기압계 우선, GPS 는 기압계 부재 시 폴백만**(2026-07-17 비교런 근본수정).
    // 구 max(기압계, GPS)는 도심 GPS 고도 반사 노이즈가 3m 임계를 뚫고 수천 m 를 쌓으면
    // (실측: 3km 러닝에 GPS 3,262m vs 기압계 9m vs NRC 20m) 쓰레기가 이겼다 — 스플릿의
    // '기압계 우선' 로직과도 모순돼 총합·마지막 구간이 오염됐다. 주머니 러닝의 기압계
    // 구독 정지로 인한 소량 유실은 감수한다(작게 틀리는 쪽 — 정확성 우선).
    const finElevTotal=baroAvail.current?Math.round(baroElev.current.gain):runTracker.getElevationGain();
    // 마지막 정수 km 이후 남은 부분 구간(예: 5.6km 의 0.6km)을 스플릿에 한 줄 추가한다 —
    // 레코더는 정수 km 경계만 남겨 꼬리 구간이 통째 누락됐다. lastSplitRef 가 마지막 경계의
    // 경과초·누적고도를 들고 있어 그 차이로 구간 시간·고도를 per-km 페이스로 환산한다.
    // 트랙: per-km GPS 스플릿은 안 만든다(GPS 거리 미사용) — 페이스 곡선/PB 는 랩 시계열이 정본.
    // paceTrack = lapsToTrack(랩시각들, 확정랩거리 km) → 저장 시 paceTrack_<id>로 영속돼
    // 거리 PB(bestEfforts) 파이프라인이 그대로 먹는다(엔진 통합 테스트로 못박음).
    const splitsFin=trackMode?[]:appendFinalSplit(splitsRef.current,fk,ft,lastSplitRef.current.elapsed,finElevTotal,lastSplitRef.current.elevM);
    const paceTrackFin=trackMode?lapsToTrack(lapTimesRef.current,lapMRef.current/1000):runTracker.getPaceTrack().slice();
    const hrTrackFin=runTracker.getHrTrack().slice();
    const gapTrackFin=runTracker.getGapTrack().slice();
    setFinSplits(splitsFin);
    setFinPaceTrack(paceTrackFin);
    setFinHrTrack(hrTrackFin);
    setFinGapTrack(gapTrackFin);
    setFinLocation(locationRef.current);
    // 케이던스 기록은 업계 표준인 '러닝 전체 평균'(총 걸음수 ÷ 이동 시간) — 정지 직전
    // 롤링 값은 마지막 30~60초만 반영해 걷기 마무리 시 기록 전체가 왜곡된다. 보조칩
    // 이력에서 총 걸음수를 조회하고, 조회 실패 시에만 롤링 값으로 폴백. 걸음은 이동 중에만
    // 쌓이므로 분모는 일시정지 제외 이동 시간(ft)이 맞다. 자동 저장이 이 값을 기다린다
    // (구 fire-and-forget 은 검토 화면 체류 시간에 기대던 암묵 대기 — 이제 명시 await).
    setFinKm(fk);setFinTime(ft);
    let cadFin=cadRef.current;
    if(stepT0Ref.current&&ft>0){
      try{
        const r=await Pedometer.getStepCountAsync(stepT0Ref.current,new Date());
        const avg=averageSpm(r?.steps??0,ft);
        if(avg>0)cadFin=avg;
      }catch{/* 조회 실패 — 롤링 폴백 유지 */}
    }
    setFinCad(cadFin);
    setFinElev(finElevTotal);
    // ── 자동 저장(심사 #1, 2026-07-22 — Peak-End 복원) ─────────────────────────
    // 세리머니→리캡 직결: 감정의 정점(완주) 직후에 '저장/버리기' 행정 화면을 두지 않는다
    // (NRC·Strava·Apple Fitness 문법). 저장하기 탭 누락 = 기록 유실 경로도 함께 제거.
    // 메모는 리캡 입력('오늘의 러닝, 한 줄로')으로 단일화(구 검토 화면과 2중 입력 해소).
    // 실패 시에만 검토 화면(phase 'done')으로 폴백해 '저장하기' 재시도를 제공한다.
    // 버리기는 리캡 상단 휴지통(확인 다이얼로그)으로 이동 — 저장 후 삭제라 되돌리기도 가능.
    try{
      let loc=locationRef.current;
      if(!loc&&routeFin){
        // 저장 직전 폴백 역지오코딩 — OS 내장 지오코더(lib/geocode, Nominatim 은퇴).
        try{
          const pts2=JSON.parse(routeFin);
          if(pts2.length>0){
            const {lat,lon}=pts2[0];
            loc=await reverseGeoLabelKo(lat,lon);
          }
        }catch{/* 무해: 역지오코딩 실패 → 위치 라벨 없이 저장 */}
      }
      await onSave(Math.round(fk*100)/100,ft,cadFin,'',routeFin,loc,splitsFin,finElevTotal,estimateCaloriesTotal(fk,ft,weightKg),paceTrackFin,hrTrackFin,gapTrackFin,
        trackMode?{lapM:Math.round(lapMRef.current),laps:lapTimesRef.current.length,lapTimes:lapTimesRef.current.slice()}:null);
      hapticSuccess(); // 저장 성공 — 완주 보상 촉각(설정 off 면 graceful no-op).
    }catch{
      setPhase('done');
      showDialog('저장하지 못했어요','기록은 안전하게 남아 있어요 — 잠시 후 저장하기를 다시 눌러 주세요.');
    }
  }

  async function handleSave(){
    // 거리 가드(2026-07-05): resume 'review' 경로는 finishRun 의 fk<0.01 가드를 우회해
    // 0.00km 좀비 스냅샷(거리 fix 0 + 경과시간만)이 그대로 저장되던 버그가 있었다.
    // 거리 없는 런은 저장 가치가 없다 — 스냅샷만 정리하고 닫는다.
    if(finKm<0.01){
      showDialog('거리가 기록되지 않았어요','저장할 거리가 없어 이 기록은 닫을게요.',[
        {text:'확인',onPress:()=>{void clearSnapshot();onDiscard();}},
      ]);
      return;
    }
    setSaving(true);
    try{
      let loc=finLocation||locationRef.current;
      if(!loc&&finRoute){
        // 저장 직전 폴백 역지오코딩 — OS 내장 지오코더(lib/geocode, Nominatim 은퇴).
        try{
          const pts2=JSON.parse(finRoute);
          if(pts2.length>0){
            const {lat,lon}=pts2[0];
            loc=await reverseGeoLabelKo(lat,lon);
          }
        }catch{/* 무해: 역지오코딩 실패 → 위치 라벨 없이 저장 */}
      }
      await onSave(Math.round(finKm*100)/100,finTime,finCad,memo,finRoute,loc,finSplits,finElev,estimateCaloriesTotal(finKm,finTime,weightKg),finPaceTrack,finHrTrack,finGapTrack,
        trackMode?{lapM:Math.round(lapMRef.current),laps:lapTimesRef.current.length,lapTimes:lapTimesRef.current.slice()}:null);
      hapticSuccess(); // 저장 성공 — 완주 보상 촉각(설정 off 면 graceful no-op).
    }catch{
      // 저장 실패 — 예전엔 catch 가 없어 버튼만 조용히 다시 활성화되고 사용자는 이유를
      // 몰랐다. 화면·상태를 그대로 두어(스냅샷 보존) 다시 저장을 누를 수 있게 안내한다.
      showDialog('저장하지 못했어요','방금 달린 기록은 아직 남아 있어요 — 잠시 후 저장을 다시 눌러 주세요.');
    }finally{setSaving(false);}
  }

  // 완주 검토 화면의 '버리기'는 되돌릴 수 없는 파괴적 동작(방금 완주한 기록 영구 소실)이라
  // 확인을 받는다 — 저장된 기록 삭제(HistoryScreen)와 동일한 보호. 오탭 한 번으로 유실 금지.
  function confirmDiscard(){
    showDialog('이 기록을 버릴까요?',`방금 달린 ${finKm.toFixed(2)}km 기록이 사라지고 되돌릴 수 없어요.`,[
      {text:'취소',style:'cancel'},
      {text:'버리기',style:'destructive',onPress:onDiscard},
    ]);
  }

  const pauseLabel=autoPaused?'자동 일시정지':paused?'일시정지':'러닝 중';
  // 칼로리 추정(활동+안정=총소모) — 라이브(현재 거리·경과)와 완주(finKm·finTime) 각각.
  // 트랙 모드 라이브 거리는 랩수×확정랩거리(GPS 누적 아님).
  const liveCal=estimateCaloriesTotal(trackMode?(lapCount*lapM)/1000:km,elapsed,weightKg);
  const finCal=estimateCaloriesTotal(finKm,finTime,weightKg);

  // 검토 화면 — 자동 저장(심사 #1) 이후 정상 경로에선 안 보인다. 남은 진입은 두 갈래:
  // ① 자동 저장 실패 폴백('저장하기' 재시도), ② 크래시 복구 'review' 모드(스냅샷 검토 후
  // 저장/버리기 — 이건 사용자 결정이 필요한 지점이라 검토 화면이 정답).
  // 지난 랩(최근 3개) — 각 랩의 구간시간(초). 러닝 화면 '지난 랩' 한 줄에 표시.
  // useMemo: 이 화면은 1초 틱으로 매초 리렌더되는데 랩은 몇 분에 한 번만 늘어난다. 매 렌더
  // 새 배열을 만들면 아래 track 객체까지 매번 새로 나가 하위 memo 가 전부 무력화된다.
  // ⚠️ 훅은 조건부 return(아래 phase==='done') **위**에 있어야 한다 — 순서가 갈리면 React 가
  //    훅 상태를 잘못 매칭한다(lint react-hooks/rules-of-hooks 가 잡아준 자리).
  // 의존성의 lapCount 는 랩 배열(ref) 변화의 대리 신호다 — ref 자체는 의존성이 될 수 없다.
  const recentLaps=useMemo(()=>{
    if(!trackMode)return [] as {lap:number;split:number}[];
    const lt=lapTimesRef.current;const out:{lap:number;split:number}[]=[];
    for(let i=lt.length-1;i>=0&&out.length<3;i--)out.push({lap:i+1,split:Math.max(0,lt[i]-(i>0?lt[i-1]:0))});
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[trackMode,lapCount]);

  if(phase==='done') return(
    <View style={[run.screen,{paddingTop:insets.top+24,paddingBottom:insets.bottom+28}]}>
      <View style={run.top}>
        <View style={run.liveRow}><Text style={[run.liveText,{color:ACCENT}]}>완료</Text></View>
        <View style={run.shoeChip}><MaterialCommunityIcons name="shoe-sneaker" size={ri(ICON.inline)} color={T3}/><Text style={run.shoeChipText}>{ui.model||shoe.name}</Text></View>
      </View>
      <View style={run.body}>
        <Ring size={ri(272)} stroke={16} progress={1} color={ACCENT}>
          {/* VoiceOver: 링 안 3줄을 한 요소로 묶어 완주 결과를 한 번에 낭독(심사 P0 #5). */}
          <View style={{alignItems:'center'}} accessible accessibilityLabel={`${trackMode?`트랙 ${Math.round(lapMRef.current)}미터 ${lapTimesRef.current.length}랩`:`목표 ${goalKm}킬로미터 완료`}, ${finKm.toFixed(2)} 킬로미터`}>
            <Text style={run.goalText}>{trackMode?`트랙 · ${Math.round(lapMRef.current)}m × ${lapTimesRef.current.length}랩`:`목표 ${goalKm}km 완료`}</Text>
            <Text maxFontSizeMultiplier={FONT_SCALE_CAP_HERO} style={run.bigDist}>{finKm.toFixed(2)}</Text>
            <Text style={run.bigUnit}>킬로미터</Text>
          </View>
        </Ring>
      </View>
      <View style={run.metricsGrid}>
        {[
          {v:fmtTime(finTime), l:'시간'},
          {v:fmtPace(finKm,finTime), l:'평균 페이스'},
          {v:finCad>0?String(finCad):'--', l:'케이던스'},
          {v:finCal>0?String(finCal):'--', l:'칼로리', u:'kcal'},
          {v:String(finElev), l:'고도 상승', u:'m'},
        ].map((m,i)=>(
          <View key={i} style={run.metricCell} accessible accessibilityLabel={`${m.l} ${m.v}${m.u?` ${m.u}`:''}`}>
            <View style={run.metricVRow}>
              <Text style={run.metricV}>{m.v}</Text>
              {m.u?<Text style={run.metricU}> {m.u}</Text>:null}
            </View>
            <Text style={run.metricL}>{m.l}</Text>
          </View>
        ))}
      </View>
      {/* primitives.Input 표준(유리 표면·placeholder T3·다크 키보드 내장) — 구 SURFACE 수제 입력 폐지. */}
      <Input style={run.memo} value={memo} onChangeText={setMemo} placeholder="메모 (선택)" autoCorrect={false} autoCapitalize="none" accessibilityLabel="러닝 메모"/>
      <View style={run.actionRow}>
        <Pressable style={({pressed})=>[run.discardBtn,pressed&&{opacity:MOTION.press.opacity,transform:[{scale:MOTION.press.scale}]}]} onPress={confirmDiscard} accessibilityRole="button" accessibilityLabel="버리기"><Text style={run.discardTxt}>버리기</Text></Pressable>
        <Button style={run.saveBtn} label={saving?'저장 중...':'저장하기'} onPress={handleSave} disabled={saving}/>
      </View>
    </View>
  );

  // 실제 GPS 신호 세기(0~3): 마지막 fix 정확도(m)를 4단계로 매핑한다. 권한 회수=0,
  // fix 이전=0(검색 중), 死구간=1(약함), 그 외 정확도가 좋을수록 높다(<=12m 좋음,
  // <=30m 보통, 그 이상 약함) — RunActiveScreen 안테나 바/라벨이 이 값을 읽는다.
  const gpsLevel = permLost ? 0
    : accuracyM==null ? 0
    : gpsStalled ? 1
    : accuracyM<=12 ? 3
    : accuracyM<=30 ? 2
    : 1;
  // 실내(트레드밀)·지하 무신호 — **한 번도 fix 를 못 받은 채** 시간만 흐르는 상태.
  // 이 구간은 지금까지 화면이 아무 말도 하지 않았다(약함 배너는 gpsLevel===1 에서만 뜨고,
  // fix 이전은 0 이라 조건에서 빠졌다). 사용자는 거리가 왜 0 인지 모른 채 달린다 —
  // 게다가 그 km 는 신발 마모에도 안 잡힌다(2026-07-26 출시 심사 B-13).
  // 실내 모드가 생기기 전까지는 **정직하게 알리는 것**이 최선이다.
  //  · NO_FIX_WARN_SEC 만큼 기다린 뒤에만 띄운다 — 시작 직후 전이 구간에 상태 UI 를
  //    끼워넣지 않는다(구 'GPS 찾는 중' 필이 레이아웃을 밀어 제거된 이력, 2026-07-25).
  //  · 트랙 모드는 제외 — 거리를 랩×랩거리로 세므로 GPS 가 없어도 정확히 기록된다.
  const noGpsFix = !permLost && !trackMode && accuracyM==null && elapsed>=NO_FIX_WARN_SEC;
  // 트랙 표시값: 거리=랩수×확정랩거리, '현재 페이스'=직전 랩 페이스(GPS 롤링 대신 — 트랙 드리프트
  // 회피), 평균=트랙거리/경과. 자유/거리 모드는 기존 GPS 신호 그대로.
  const trackDistKm=(lapCount*lapM)/1000;
  const lastLapPaceSec=trackMode&&lapCount>0&&lapM>0?(()=>{
    const lt=lapTimesRef.current;const prev=lt.length>=2?lt[lt.length-2]:0;
    const dt=lt[lt.length-1]-prev;return dt>0?dt/(lapM/1000):null;
  })():null;
  const dispDist=trackMode?trackDistKm:km;
  // 링을 '현재 바퀴 진행'으로 채운다(살아있는 링). 지난 랩 시간 대비 지금 몇 % 왔나 → 매 랩 리셋.
  // 첫 랩 전엔 명목 페이스(5분/km=lapM*0.3초)로 추정해 처음부터 움직이게 한다.
  const lapProgress=trackMode?(()=>{
    const lt=lapTimesRef.current;const n=lt.length;
    const lastAt=n>=1?lt[n-1]:0;
    const lastDur=n>=1?(lt[n-1]-(n>=2?lt[n-2]:0)):0;
    const expected=lastDur>0?lastDur:(lapM>0?lapM*0.3:120);
    return expected>0?Math.max(0,Math.min(1,(elapsed-lastAt)/expected)):0;
  })():0;
  // 트랙 상태 묶음. useMemo 를 쓰지 않는 이유: 이 값이 의존하는 lapProgress·trackDistKm 이
  // 위 조건부 return 아래에서 계산되어 훅을 그 위로 올릴 수 없고(Rules of Hooks), 소비처인
  // RunActiveScreenView 는 memo 대상이 아니다(지표 40여 개가 매초 바뀌어 shallow 비교가
  // 항상 실패 — memo 를 붙여도 이득이 없다). 참조 안정화가 실제 이득을 내려면 그 화면을
  // 지표 단위로 쪼개야 하는데, 그건 이 사이클의 범위가 아니다.
  const trackProp=trackMode?{lapCount,lapM,lapDistKm:trackDistKm,calibrated:lapLockedRef.current,progress:lapProgress,recent:recentLaps}:null;
  return (
    <RunActiveScreenView
      shoeLabel={ui.model||shoe.name}
      distanceKm={dispDist}
      goalKm={goalKm}
      goalMin={goalMin}
      elapsedSec={elapsed}
      timeLabel={fmtTime(elapsed)}
      paceLabel={trackMode?(lastLapPaceSec!=null?fmtPace(1,lastLapPaceSec):'--'):(currentPaceSec!=null?fmtPace(1,currentPaceSec):'--')}
      avgPaceLabel={fmtPace(dispDist,elapsed)}
      currentPaceSec={trackMode?lastLapPaceSec:currentPaceSec}
      targetPaceSec={pacePlan&&pacePlan.length?currentTargetPace(pacePlan,km):null}
      cadence={cadence}
      calories={liveCal}
      elevationM={elevGain}
      bpm={heartRate}
      targetZone={targetZone}
      zoneDeviation={zoneDeviation}
      age={age}
      restHR={restHR}
      gpsLevel={gpsLevel}
      noGpsFix={noGpsFix}
      paused={paused}
      statusLabel={pauseLabel}
      onPause={handlePause}
      onStop={finishRun}
      permLost={permLost}
      snapshotFailing={snapshotFailing}
      onOpenSettings={()=>{Promise.resolve(Linking.openSettings()).catch(()=>{});}}
      liveCoords={liveCoords}
      track={trackProp}
      onLap={()=>registerLap(elapsedRef.current,false)}
      onUndoLap={undoLap}
      handoff={!resume}
      voiceMuted={voiceMuted}
      onToggleVoice={toggleVoice}
      pausedMoveNudge={pauseMoveNudge}
    />
  );
}

const run=StyleSheet.create({
  screen:{flex:1,backgroundColor:BG,paddingHorizontal:GUTTER},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  liveRow:{flexDirection:'row',alignItems:'center',gap: rv(8)},
  liveDot:{width: rs(8),height: rs(8),borderRadius:RADIUS.pill},
  liveText:{fontFamily:FP,fontSize: rf(15),fontWeight:'500',letterSpacing:0.3},
  shoeChip:{flexDirection:'row',alignItems:'center',gap: rv(8),minHeight: rs(30),paddingHorizontal: rs(12),borderRadius:RADIUS.pill,backgroundColor:SURFACE},
  shoeChipText:{color:T3,fontFamily:FH,fontSize: rf(14),fontWeight:'600'},
  gpsRow:{flexDirection:'row',alignItems:'center',marginTop: rv(8)},
  gpsText:{color:T3,fontFamily:FP,fontSize: rf(14),fontWeight:'600'},
  banner:{flexDirection:'row',alignItems:'center',gap: rv(8),marginTop: rv(10),paddingVertical: rv(10),paddingHorizontal: rs(12),borderRadius:RADIUS.sm,borderWidth:StyleSheet.hairlineWidth},
  bannerWarn:{backgroundColor:withAlpha(WARN,0.12),borderColor:WARN},
  bannerDanger:{backgroundColor:withAlpha(DANGER,0.14),borderColor:DANGER},
  bannerText:{flex:1,color:T1,fontFamily:FP,fontSize: rf(14),fontWeight:'500',lineHeight: rf(17)},
  body:{flex:1,alignItems:'center',justifyContent:'center'},
  goalText:{color:T3,fontFamily:FP,fontSize: rf(13),fontWeight:'500',letterSpacing:1},
  // 검토 화면 거리 = 러닝 화면과 '같은 숫자' — NUM(Jost) 램프 정렬(심사 #27: 구 Pretendard
  // +자간 +1 로 홀로 표류). 대형 숫자 자간은 음수가 규칙.
  bigDist:{color:T1,fontFamily:NUM,fontSize: rf(84),fontWeight:'500',letterSpacing:-1,lineHeight: rf(102),includeFontPadding:false,marginTop: rv(6),fontVariant:['tabular-nums']},
  bigUnit:{color:T3,fontFamily:FP,fontSize: rf(15),fontWeight:'600',marginTop: rv(2)},
  metrics:{flexDirection:'row',marginHorizontal: rs(-4),paddingVertical: rv(14),paddingBottom: rv(24),borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:SEP},
  metric:{flex:1,alignItems:'center',gap: rv(4)},
  // 5지표 그리드(시간/페이스/케이던스/칼로리/고도) — 3열로 흘러 2행(3+2).
  metricsGrid:{flexDirection:'row',flexWrap:'wrap',paddingTop: rv(14),paddingBottom: rv(20),borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:SEP},
  metricCell:{width:'33.33%',alignItems:'center',gap: rv(4),paddingVertical: rv(8)},
  metricVRow:{flexDirection:'row',alignItems:'flex-end'},
  metricV:{color:T1,fontFamily:FH,fontSize: rf(26),letterSpacing:-0.4,fontVariant:['tabular-nums']},
  metricU:{color:T3,fontFamily:FP,fontSize: rf(12),marginBottom: rv(3)},
  metricL:{color:T3,fontFamily:FP,fontSize: rf(13),fontWeight:'600'},
  // 러닝 중 메트릭 위계 — 시간·페이스 hero(큰) + 케이던스·칼로리·고도 sub(작은).
  heroMetrics:{flexDirection:'row',paddingVertical: rv(16),borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:SEP},
  hm:{flex:1,alignItems:'center'},
  hmV:{fontFamily:FH,fontSize: rf(34),fontWeight:'600',color:T1,letterSpacing:-1,fontVariant:['tabular-nums']},
  hmL:{color:T3,fontFamily:FP,fontSize: rf(13),fontWeight:'500',marginTop: rv(4)},
  subMetrics:{flexDirection:'row',justifyContent:'space-around',paddingVertical: rv(12)},
  smV:{fontFamily:FH,fontSize: rf(16),fontWeight:'500',color:T2,textAlign:'center',fontVariant:['tabular-nums']},
  smL:{color:T3,fontFamily:FP,fontSize: rf(11),fontWeight:'500',marginTop: rv(3),textAlign:'center'},
  controls:{flexDirection:'row',alignItems:'flex-start',justifyContent:'center',gap: rv(40),paddingTop: rv(4),paddingBottom: rv(8)},
  ctrlHint:{color:T3,fontFamily:FP,fontSize: rf(12),letterSpacing:0.5,textAlign:'center'},
  // primitives.Input 표준 위에 배치 여백만(표면·타이포는 Input 소유).
  memo:{marginBottom: rv(16)},
  actionRow:{flexDirection:'row',gap: rv(12)},
  // 버리기는 SURFACE flat 보조 버튼 — 모서리는 saveBtn(단일 Button=RADIUS.btn)과 맞춰 통일.
  discardBtn:{flex:1,backgroundColor:SURFACE,borderRadius:RADIUS.btn,padding: rs(16),alignItems:'center'},
  discardTxt:{color:T1,fontSize: rf(17),fontFamily:FP,fontWeight:'600'},
  // 저장하기는 단일 Button 프리미티브로 라우팅(그라데이션/글로우/RADIUS.btn). 여기선 flex 비율만.
  saveBtn:{flex:2},
});
