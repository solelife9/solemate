// ============================================================================
// hooks/useRunEntryGate.ts — 러닝 시작 관문(권한 확인 → 카운트다운 진입)
// ----------------------------------------------------------------------------
// App.tsx 에서 분리(2026-08-09 분해 5단계). **동작 변경 0 — 순수 이동이다.**
//
// 왜 이 경계인가: '시작' 버튼과 실제 러닝 사이에는 **분기가 여섯 개** 있다 — 실내/야외,
// 권한 미결정/거부/허용, 설명 화면을 봤는지. 이 판단은 서로를 참조하는데 App.tsx 안에서는
// 다른 관심사들 사이에 끼어 있어서, 하나를 고칠 때 나머지 다섯을 같이 보기 어려웠다.
// 실제로 그 틈에서 두 번 사고가 났다(아래).
//
// 이 파일이 지는 규칙 — **둘 다 실기기에서 다친 뒤에 생긴 것이다:**
//   1) **야외는 카운트다운 전에 묻는다.** 예전엔 세리머니(3·2·1·GO)를 다 돌린 뒤 러닝
//      화면이 물었다. 거부하면 사용자는 이미 달리기 시작한 뒤였고 아무것도 안 남았다.
//   2) **실내는 위치가 아니라 걸음을 본다.** 실내는 GPS 를 아예 안 켜고 걸음이 거리
//      정본이라, 위치를 검사하면 영영 통과 못 하고 걸음 권한이 없으면 **거리가 0 으로**
//      끝난다(2026-08-05 실측: 권한이 꺼진 채였는데 앱은 침묵했다).
//
// 밖으로 내보내는 셋(enterRun · startActiveRun · requestLocationThenStart)은 목표 화면과
// 위치 안내 화면이 부른다.
// ============================================================================

import {useEffect} from 'react';
import {AppState, Linking} from 'react-native';
import {Pedometer} from 'expo-sensors';
import {showDialog} from '../lib/dialog';
import {requestRunPermissions, hasForegroundPermission, getForegroundPermissionState} from '../lib/locationService';
import {trackPermissionResult} from '../lib/productAnalytics';
import type {RunGoal} from '../RunGoalScreen.rn';

/** App.tsx 의 activeRun state 와 **같은 모양이어야 한다**(그 setter 를 그대로 받는다). */
type ActiveRun = {
  id: string; name: string; goalKm: number; goalMin: number; pacePlan: number[];
  targetZone: number; trackLapM?: number; indoor?: boolean;
};

export function useRunEntryGate({
  pendingShoe, locPrimed, permRetryGoal,
  setPermRetryGoal, setLocPrimeGoal, setActiveRun, setOverlay,
}: {
  pendingShoe: {id: string; name: string} | null;
  locPrimed: boolean;
  permRetryGoal: RunGoal | null;
  setPermRetryGoal: (g: RunGoal | null) => void;
  setLocPrimeGoal: (g: RunGoal | null) => void;
  setActiveRun: (r: ActiveRun) => void;
  setOverlay: (o: any) => void;
}) {
  // ── 위치 권한 priming(audit#9/#10) ──────────────────────────────────────────
  // 라이브 런 진입 직전 관문. 권한을 처음 쓰는 사용자에겐 OS 다이얼로그 전에 '왜
  // 위치 권한이 필요한지'를 먼저 한국어로 안내한다(priming). '계속'을 누르면 1회성
  // 플래그를 영속하고 런으로 진입 → RunActiveScreen 이 실제 OS 권한을 요청한다.
  // 이미 안내했거나(locPrimed) 닫으면 추가 안내 없이 동작한다.
  const enterRun=(goal:RunGoal)=>{
    // 목표 설정 → 카운트다운(준비·GPS 워밍업·3·2·1·GO) → 라이브 런. 카운트다운의
    // onDone 이 실제 런(GPS 트래킹 시작) 화면으로 넘긴다. 미완료 런 복구 경로는
    // 카운트다운을 거치지 않고 곧장 'run'으로 간다(이미 끝난 런의 검토라서).
    setActiveRun({id:pendingShoe!.id,name:pendingShoe!.name,goalKm:goal.km,goalMin:goal.durationMin,pacePlan:goal.pacePlan,targetZone:goal.targetZone??0,trackLapM:goal.track?.lapM,indoor:!!goal.indoor});
    setOverlay('countdown');
  };
  /**
   * 위치 권한이 꺼져 있어 야외 러닝을 시작할 수 없다 — 설정으로 안내한다(2지선다).
   *
   * '설정 열기'를 고르면 그 목표를 들고 기다린다(permRetryGoal). 사용자가 설정에서 허용하고
   * 돌아오면 **바로 그 러닝이 시작된다** — 홈부터 다시 짚게 하면 방금 한 일이 헛수고가 된다
   * (주행 중 회수 복구가 이미 쓰는 문법과 같다 — RunEngine 의 AppState 재개).
   */
  const showLocationDenied=(goal:RunGoal)=>{
    showDialog(
      '위치 권한이 꺼져 있어요',
      'GPS 없이는 거리·페이스·코스가 기록되지 않아요. 설정에서 위치를 허용하면 바로 이어서 달릴 수 있어요.',
      [
        {text:'취소',style:'cancel',onPress:()=>setPermRetryGoal(null)},
        {text:'설정 열기',onPress:()=>{
          setPermRetryGoal(goal);
          Promise.resolve(Linking.openSettings()).catch(()=>{});
        }},
      ],
    );
  };
  /**
   * 실내(트레드밀) 러닝에 **동작 및 피트니스**가 없을 때. 야외와 달리 이건 치명적이다 —
   * 실내는 GPS 를 아예 켜지 않고 **걸음이 거리 정본**이라(`runTracker.indoorMode`,
   * `feedPedometerDistance`) 권한이 없으면 거리가 **영원히 0** 으로 끝난다.
   *
   * 2026-08-05 실기기에서 이 권한이 꺼진 채였는데 앱은 아무 말도 하지 않았다 — 케이던스가
   * '--' 로 뜰 뿐이었다. 야외였으니 GPS 가 받쳐 러닝은 남았지만, 실내였다면 32분을 달리고
   * 0km 를 받았을 것이다. 그래서 시작하기 **전에** 막고 이유를 말한다.
   *
   * 문법은 위치 거부와 같다 — '설정 열기'를 고르면 목표를 들고 기다렸다가, 허용하고
   * 돌아오면 그 러닝이 바로 시작된다(아래 permRetryGoal effect).
   */
  const showMotionDeniedIndoor=(goal:RunGoal,canOpenSettings:boolean)=>{
    showDialog(
      canOpenSettings?'동작 및 피트니스가 꺼져 있어요':'이 기기는 걸음 수를 잴 수 없어요',
      canOpenSettings
        ? '실내 러닝은 걸음 수로 거리를 재요. 이 권한이 없으면 거리가 0으로 기록돼요. 설정에서 허용하면 바로 이어서 달릴 수 있어요.'
        : '실내 러닝은 걸음 수로 거리를 재는데, 이 기기에서는 걸음 센서를 쓸 수 없어요. 야외 러닝은 GPS 로 정상 기록돼요.',
      canOpenSettings
        ? [
            {text:'취소',style:'cancel' as const,onPress:()=>setPermRetryGoal(null)},
            {text:'설정 열기',onPress:()=>{
              setPermRetryGoal(goal);
              Promise.resolve(Linking.openSettings()).catch(()=>{});
            }},
          ]
        : [{text:'확인',onPress:()=>setPermRetryGoal(null)}],
    );
  };
  /**
   * 실내 러닝에 필요한 걸음 권한을 확인한다(필요하면 묻는다).
   * @returns 'ok' 시작해도 된다 · 'denied' 설정에서 켜야 한다 · 'unsupported' 기기가 못 한다
   */
  const ensureIndoorStepPermission=async():Promise<'ok'|'denied'|'unsupported'>=>{
    try{
      if(!(await Pedometer.isAvailableAsync())) return 'unsupported';
      const cur=await Pedometer.getPermissionsAsync();
      if(cur?.granted) return 'ok';
      // 아직 안 물어봤으면 여기서 묻는다(iOS 는 한 번 거부하면 다시 안 묻는다 — 그때는
      // canAskAgain 이 false 라 곧장 설정 안내로 간다).
      if(cur?.canAskAgain!==false){
        const r=await Pedometer.requestPermissionsAsync();
        trackPermissionResult('motion',!!r?.granted);
        if(r?.granted) return 'ok';
      }
      return 'denied';
    }catch{
      // 권한 API 자체가 없는 환경(구형/미지원) — 거리를 못 재는 건 같으므로 막되,
      // 설정에서 해결될 문제가 아니므로 그렇게 말한다.
      return 'unsupported';
    }
  };
  /** OS 권한을 실제로 묻고, 허용되면 그 목표로 러닝을 시작한다(거부면 설정 안내). */
  const requestLocationThenStart=async(goal:RunGoal)=>{
    const perm=await requestRunPermissions();
    // 동작·피트니스도 여기서 한 번에 — 케이던스(Pedometer)와 고도(Barometer)가 같은 모션
    // 권한을 쓰므로, 첫 러닝 순간이 아니라 앞단에서 받아 매끄럽게 동작하게 한다.
    // 수락률 계측(L-12) — 케이던스·고도가 이 권한에 달려 있다. 같은 결과 중복 전송은
    // trackPermissionResult 가 막는다(RunEngine 에서 한 번 더 요청하므로).
    try{const mp=await Pedometer.requestPermissionsAsync();trackPermissionResult('motion',!!mp?.granted);}
    catch{trackPermissionResult('motion',false);/* 거부/미지원 — 러닝은 계속 */}
    if(!perm.foreground){showLocationDenied(goal);return;} // 카운트다운으로 넘기지 않는다
    enterRun(goal);
  };
  const startActiveRun=async(goal:RunGoal)=>{
    if(!pendingShoe) return;
    // 실내(트레드밀)는 GPS 를 아예 쓰지 않는다 — 거리는 걸음이 정본이다(runTracker.indoorMode).
    // 그런데 예전엔 러닝 화면의 위치 게이트가 indoor 를 보지 않아, **쓰지도 않는 권한 때문에
    // 실내 러닝이 시작조차 되지 않았다**(2026-08-04 QA 후속). 묻지 않는 게 맞다.
    // 다만 **걸음 권한은 반드시 확인한다** — 실내는 걸음이 거리 정본이라 없으면 0km 로
    // 끝난다(2026-08-05 실측: 이 권한이 꺼진 채였고 앱은 침묵했다). 위치를 안 묻는 것과
    // 걸음을 안 챙기는 것은 다르다.
    if(goal.indoor){
      const step=await ensureIndoorStepPermission();
      if(step!=='ok'){showMotionDeniedIndoor(goal,step==='denied');return;}
      enterRun(goal);
      return;
    }
    // 야외 — 카운트다운(3·2·1·GO)을 돌리기 **전에** 확인한다. 예전엔 세리머니를 다 하고
    // 러닝 화면에 들어가서야 물어, 시작한 줄 알고 달리다 아무것도 안 남는 일이 가능했다.
    const st=await getForegroundPermissionState();
    if(st==='granted'){enterRun(goal);return;}
    if(st==='undetermined'){
      // 아직 안 물어봤다 — OS 다이얼로그 전에 브랜디드 설명 화면을 띄우고, 그 '계속'이 실제로 묻는다.
      // 단 **설명을 이미 본 사람에겐 다시 띄우지 않는다**(locPrimed): OS 다이얼로그를 그냥
      // 넘겨 상태가 미결정으로 남는 경우가 있는데, 그때마다 풀스크린 안내를 다시 보여주면 조른다.
      if(locPrimed){void requestLocationThenStart(goal);return;}
      setLocPrimeGoal(goal);
      return;
    }
    showLocationDenied(goal); // 이미 거부 — 설명 화면은 무의미하다(OS 가 다시 안 묻는다).
  };

  // 설정에서 허용하고 돌아왔다면 기다리던 러닝을 바로 시작한다. 허용 안 하고 왔으면
  // 아무 말도 하지 않는다(목표 화면에 그대로 머문다 — 돌아오자마자 또 조르지 않는다).
  // ⚠️ **무엇을 확인할지는 목표가 정한다** — 실내는 위치를 쓰지 않으므로 위치를 검사하면
  // 영영 통과하지 못한다(허용하고 돌아와도 화면이 안 넘어간다). 실내는 걸음을 본다.
  useEffect(()=>{
    if(!permRetryGoal) return;
    const sub=AppState.addEventListener('change',next=>{
      if(next!=='active') return;
      void (async()=>{
        const ok=permRetryGoal.indoor
          ? (await Pedometer.getPermissionsAsync().catch(()=>null))?.granted===true
          : await hasForegroundPermission();
        if(!ok) return;
        setPermRetryGoal(null);
        enterRun(permRetryGoal);
      })();
    });
    return ()=>sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[permRetryGoal]);
  return {enterRun, startActiveRun, requestLocationThenStart};
}
