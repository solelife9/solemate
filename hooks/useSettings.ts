// ============================================================================
// hooks/useSettings.ts — 사용자 설정 한 덩어리(상태 + 영속 + 클라우드 병합)
// ----------------------------------------------------------------------------
// App.tsx 에서 분리(2026-08-09 분해 2단계). **동작 변경 0 — 순수 이동이다.**
// 1단계는 `screens/RunEngine.tsx`(러닝 엔진, 2026-07-26 감사 F-03)였다.
//
// 왜 이 경계인가: 설정 9종은 App.tsx 안에서 **세 곳에 흩어져** 있었다 —
// 상태 선언(useState 9개+ts+ref) · 변경 핸들러(change*) · 클라우드 병합 적용
// (applyBackupPayload 한복판). 셋은 같은 규약(LWW 수정시각) 하나로 묶여 있는데
// 파일 안에서 400줄씩 떨어져 있어, 설정 하나를 더할 때마다 세 곳을 정확히 같이
// 고쳐야 했다. 한 군데를 빠뜨리면 **조용히** 동기에서만 어긋난다.
//
// 이 파일이 소유하는 것: 값 · 변경(즉시 영속) · 수정시각(LWW 기준) · 부팅 복원 ·
// 클라우드 병합 적용. 판정 로직은 전부 `lib/settingsRestore`, 영속은 `lib/settings`
// 가 이미 가지고 있다 — 여기는 **상태와 배선만** 진다.
//
// ⚠️ 지켜야 할 선 두 가지(둘 다 과거에 실제로 깨졌다):
//   1) 복원은 change* 를 쓰지 않는다. change* 는 수정시각을 '지금'으로 올려서
//      복원을 '이 기기의 새 편집'으로 둔갑시키고, 그러면 다른 기기의 더 최신
//      편집을 이긴다. 복원은 저수준 set+save 로 한다.
//   2) 수정시각은 ref 를 정본으로 읽는다. 동기 왕복(await) 중에 사용자가 설정을
//      바꾸면 state 는 아직 옛값이라, ref 가 없으면 그 편집이 덮인다(클로버).
// ============================================================================

import {useState, useRef, useEffect} from 'react';
import {
  AlertSettings, Sex, DEFAULT_SETTINGS,
  loadSettings, loadSettingsUpdatedAt, saveSettingsUpdatedAt,
  saveUnit, saveGoal, saveAlerts, saveWeight, saveAge, saveSex, saveRestHR,
  clampGoal,
} from '../lib/settings';
import {
  settingsTsOf, shouldApplySettings, pickRestorableSettings, nextSettingsTs,
} from '../lib/settingsRestore';
import {
  getNotifSettings, setNotifSettings as persistNotifSettings,
  DEFAULT_NOTIF_SETTINGS, type NotifSettings,
} from '../lib/notifications';
import {nowMs as syncNowMs} from '../lib/clockOffset';
import {reportIssue} from '../lib/crashlytics';
import {Unit} from '../lib/units';

export type UseSettings = ReturnType<typeof useSettings>;

export function useSettings() {
  // 거리 단위(표시 전용 — 저장 표준은 항상 km), 주간 목표(km), 신발 교체 알림.
  const [unit, setUnit] = useState<Unit>(DEFAULT_SETTINGS.unit);
  const [goalWeeklyKm, setGoalWeeklyKm] = useState(DEFAULT_SETTINGS.goalWeeklyKm);
  const [alerts, setAlerts] = useState<AlertSettings>({...DEFAULT_SETTINGS.alerts});
  // 푸시 알림 설정(신규 notif_settings 키 — 기존 settings_alerts 와 별개).
  const [notifSettings, setNotifSettingsState] = useState<NotifSettings>(DEFAULT_NOTIF_SETTINGS);
  // 체중(kg) — 러닝 칼로리 추정에 쓴다(설정에서 조정, 기본 65). 표시 단위와 무관.
  const [weightKg, setWeightKg] = useState(DEFAULT_SETTINGS.weightKg);
  // 신체지표(심박존용) — 나이→최대심박(Tanaka), 안정심박→Karvonen 존, 성별→TRIMP 계수.
  // 0/기본은 '미설정'(폴백으로 동작). 설정에서 조정.
  const [age, setAge] = useState(DEFAULT_SETTINGS.age);
  const [sex, setSex] = useState<Sex>(DEFAULT_SETTINGS.sex);
  const [restHR, setRestHR] = useState(DEFAULT_SETTINGS.restHR);
  // 설정 블록 최종 수정 시각(epoch ms, 0=미수정) — 클라우드 병합 last-write-wins 판정.
  // ref 미러는 동기 왕복(await) 중의 편집을 applyCloudSettings 가 즉시 보게 한다.
  const [settingsTs, setSettingsTs] = useState(0);
  const settingsTsRef = useRef(0);

  // 푸시 알림 설정 복원(신규 키 — 네트워크 무관, 1회). 손상/부재는 getNotifSettings 가
  // 기본값으로 graceful 폴백하므로 별도 방어가 필요 없다(기존 settings_alerts 불변).
  useEffect(() => {
    (async () => {
      try { setNotifSettingsState(await getNotifSettings()); }
      catch (e) { reportIssue('notif settings load', e); }
    })();
  }, []);

  // bumpSettingsTs: 사용자가 설정을 바꿀 때마다 수정 시각을 올린다 — 클라우드 병합
  // last-write-wins + 동기 왕복 중 편집 클로버 가드의 판정 기준.
  const bumpSettingsTs = () => {
    const ts = syncNowMs(); // AUDIT 3 D-2 — 설정 LWW 도 같은 기준을 쓴다
    settingsTsRef.current = ts; setSettingsTs(ts); void saveSettingsUpdatedAt(ts);
  };

  // 각 setter 는 즉시 setState 로 화면을 갱신하고 saveX 로 AsyncStorage 에 영속한다.
  const changeUnit = (u: Unit) => { setUnit(u); void saveUnit(u); bumpSettingsTs(); };
  const changeGoal = (km: number) => { const v = clampGoal(km); setGoalWeeklyKm(v); void saveGoal(v); bumpSettingsTs(); };
  const changeAlerts = (a: AlertSettings) => { setAlerts(a); void saveAlerts(a); bumpSettingsTs(); };
  const changeWeight = (kg: number) => { setWeightKg(kg); void saveWeight(kg); bumpSettingsTs(); };
  const changeAge = (v: number) => { setAge(v); void saveAge(v); bumpSettingsTs(); };
  const changeSex = (v: Sex) => { setSex(v); void saveSex(v); bumpSettingsTs(); };
  const changeRestHR = (v: number) => { setRestHR(v); void saveRestHR(v); bumpSettingsTs(); };
  // 푸시 알림 설정 변경: 즉시 상태 반영 + 신규 notif_settings 키에만 영속(기존 키 불변).
  const changeNotifSettings = (s: NotifSettings) => { setNotifSettingsState(s); void persistNotifSettings(s); };

  /**
   * 부팅 시 로컬 복원. **네트워크와 무관하므로 fetch 보다 먼저** 부른다(오프라인에서도
   * 단위/목표/알림이 사용자가 마지막에 정한 값으로 뜬다).
   *
   * 갓 읽은 값을 그대로 반환한다 — 부르는 쪽이 알림 판정 등에 **state 갱신을 기다리지 않고**
   * 쓸 수 있어야 하기 때문이다(setState 직후 클로저는 아직 옛값이다).
   */
  const hydrateFromLocal = async () => {
    const st = await loadSettings();
    setUnit(st.unit); setGoalWeeklyKm(st.goalWeeklyKm); setAlerts(st.alerts); setWeightKg(st.weightKg);
    setAge(st.age); setSex(st.sex); setRestHR(st.restHR);
    // 설정 수정 시각 복원 — 클라우드 병합 LWW 판정 기준(ref 는 동기 왕복 중에도 최신).
    const stTs = await loadSettingsUpdatedAt();
    settingsTsRef.current = stTs; setSettingsTs(stTs);
    return st;
  };

  /**
   * 클라우드 병합 결과를 설정에 적용한다 — LWW 클로버 가드(2026-07-16).
   *
   * 병합 결과의 updated_at 이 현재(ref, 동기 왕복 중 편집 포함)보다 오래됐으면 통째로
   * 스킵한다 — 과거엔 stale 스냅샷을 무조건 change* 로 되돌려서, 동기 중 바꾼 단위가
   * 원위치되는 클로버가 있었다. 명시적 가져오기(force)는 사용자 의사가 '백업으로 교체'
   * 이므로 가드 없이 적용하고 수정 시각을 지금으로 올린다(이후 동기에서 승리).
   *
   * @param force 명시적 import 교체(preserveExtras=false)인가
   */
  const applyCloudSettings = (rawSettings: unknown, force: boolean) => {
    const st: any = rawSettings || {};
    const mergedTs = settingsTsOf(st);
    if (!shouldApplySettings(mergedTs, settingsTsRef.current, force)) return;
    // 상태 반영은 change* 가 아니라 저수준 set+save 로 — change* 는 bumpSettingsTs 를 불러
    // 복원을 '이 기기의 새 편집'으로 둔갑시키고, 그러면 다른 기기의 더 최신 편집을 이긴다.
    const pick = pickRestorableSettings(st, {alerts});
    if (pick.unit !== undefined) { setUnit(pick.unit); void saveUnit(pick.unit); }
    if (pick.goalWeeklyKm !== undefined) { setGoalWeeklyKm(pick.goalWeeklyKm); void saveGoal(pick.goalWeeklyKm); }
    if (pick.alerts !== undefined) { setAlerts(pick.alerts); void saveAlerts(pick.alerts); }
    if (pick.weightKg !== undefined) { setWeightKg(pick.weightKg); void saveWeight(pick.weightKg); }
    if (pick.age !== undefined) { setAge(pick.age); void saveAge(pick.age); }
    if (pick.sex !== undefined) { setSex(pick.sex); void saveSex(pick.sex); }
    if (pick.restHR !== undefined) { setRestHR(pick.restHR); void saveRestHR(pick.restHR); }
    const nextTs = nextSettingsTs(force, mergedTs, settingsTsRef.current, Date.now());
    if (nextTs > 0 && nextTs !== settingsTsRef.current) {
      settingsTsRef.current = nextTs; setSettingsTs(nextTs); void saveSettingsUpdatedAt(nextTs);
    }
  };

  return {
    unit, goalWeeklyKm, alerts, notifSettings, weightKg, age, sex, restHR, settingsTs,
    settingsTsRef,
    changeUnit, changeGoal, changeAlerts, changeWeight, changeAge, changeSex, changeRestHR,
    changeNotifSettings,
    hydrateFromLocal, applyCloudSettings,
  };
}
