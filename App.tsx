import React, {useState, useEffect, useRef, useMemo, useCallback} from 'react';
import {
  View, StatusBar, Linking, AppState,
} from 'react-native';
import {showDialog, showPermissionSettingsDialog} from './lib/dialog';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Pedometer} from 'expo-sensors';

import {BG, Shoe, Run} from './theme';
import {
  toUiShoe, toUiRun, buildIdxById, buildNameById, homeShoePairs, sortRunsByDateDesc,
} from './lib/appViewModel';
import {BootSkeleton, BootError} from './screens/BootStates.rn';
import ErrorBoundary from './ErrorBoundary';
import ToastHost from './ToastHost';
import DialogHost from './DialogHost';
import {installCrashHandler, setCrashUser, recordError, reportIssue} from './lib/crashlytics';
import {devSeedShoes, devSeedRuns} from './lib/devSeed';
// BackendShoe / BackendRun 은 types.d.ts 의 전역 ambient 인터페이스(import 불필요).
import HomeScreen, {WeekStats} from './HomeScreen.rn';
import HistoryScreen, {PeriodSummary, PeriodChart} from './HistoryScreen.rn';
import ShoesScreen, {ShoeTotals} from './ShoesScreen.rn';
import ProfileScreen, {Profile, Badge, PersonalRecord} from './ProfileScreen.rn';
import RunEngine from './screens/RunEngine';
import AddShoeScreen from './AddShoeScreen.rn';
import OnboardingScreen, {RegisteredShoe} from './OnboardingScreen.rn';
import RunGoalScreen, {RunGoal} from './RunGoalScreen.rn';
import RunActiveScreenView from './RunActiveScreen.rn';
import ProgressionScreen from './ProgressionScreen.rn';
import HallOfShoes from './HallOfShoes.rn';
import ShoeArchiveScreen from './ShoeArchiveScreen.rn';
import RunRecapScreen from './RunRecapScreen.rn';
import MedalArchiveScreen from './MedalArchiveScreen.rn';
// 러닝화 찾기 — 기준 → 후보 → 1:1 비교 → 스펙 표 → 구매처. 전에는 은퇴할 때만
// 열려서(구 '다음 신발') 신발을 은퇴시키지 않는 사람은 평생 못 보던 화면이다.
import FindShoesScreen from './FindShoesScreen.rn';
import RaceMedalScreen from './RaceMedalScreen.rn';
// 마라톤 메달 아카이브 — 완주 감지(위치+날짜) → 대회 기록 흐름 → 아카이브(로컬 우선).
import {loadMedals, saveMedals, normalizeMedals, sortMedals, liveMedals, addMedal as addMedalStore, removeMedal as removeMedalStore, type Medal} from './lib/medals';
import {detectRace, SEED_RACES, type RaceEvent, type RaceMatch, type RaceDistance} from './data/raceEvents';
import {syncRemoteRaces} from './lib/raceCatalogRemote';
import {checkForceUpdate, type RemoteAppConfig} from './lib/forceUpdate';
import {reconcileAccountStorage} from './lib/accountScope';
// 로그인 제공자 표시값 — **계정 정합이 끝난 뒤** 여기서만 쓴다(쓰는 곳이 둘이면 어긋난다).
import {saveCloudAccount} from './lib/cloudAccount';
import type {CloudProvider} from './lib/cloudPort';
import {mirrorRecords, pullRecords, mergePulled, isPayloadMirrored, stripRecordArrays, loadMarkers} from './lib/recordSync';
import {retirementRecordsFromShoes, setShoeRetirement, migrateRetiredShoes} from './lib/shoeRetirement';
import {buildPublicProfile, publishProfile, loadVisibility, saveVisibility, type ProfileVisibility} from './lib/publicProfile';
import {fitnessSummary} from './lib/analytics/fitness';
import SocialConsentScreen from './SocialConsentScreen.rn';
import ForceUpdateScreen from './ForceUpdateScreen.rn';
import {nativeRecognizer} from './lib/ocrNative';
import {parseRoute} from './lib/route';
import LocationPrimeScreen from './LocationPrimeScreen.rn';
import HallOfFameScreen from './HallOfFameScreen.rn';
// 남의 공개 프로필(소셜 2단계) — 랭킹에서 사람을 눌렀을 때만 읽는다(읽기 1건).
import RunnerProfileScreen from './RunnerProfileScreen.rn';
import {buildContext} from './lib/progression/context';
import {getProgression, pickRecentAchievement, collectUnlockedKeys} from './lib/progression';
import {RANK_XP} from './lib/progression/rank';
import {RARITY_COLORS} from './theme';
import CelebrationScreen, {CelebrationData} from './CelebrationScreen.rn';
import {loadProgression, saveProgression} from './lib/progression/storage';
import {mergeProgression} from './lib/progression/mergeProgression';
import {mergeCelebBaseline} from './lib/celebrationBaseline';
import {setHapticsEnabled} from './lib/haptics';
import type {ProgressionState, RetiredShoeRecord, ContextChallengeInput} from './lib/progression/types';
import type {HomeProgression, HomeChallengeView} from './HomeScreen.rn';
import {challengeProgress} from './lib/challenges';

// 트랙 모드 순수 엔진 — 복귀감지(haversineM)·첫 랩 GPS 보정(calibrateLapM)·랩→시계열(lapsToTrack).
// 러닝 시작 **전에** 위치 권한을 확인·요청하기 위한 진입점(2026-08-04 — 예전엔 카운트다운을
// 다 돌린 뒤 러닝 화면에서야 물었다). 상태 조회는 요청 없이, 요청은 설명 화면의 '계속'에서.
import {
  getForegroundPermissionState,
  hasForegroundPermission,
  requestRunPermissions,
} from './lib/locationService';

// 러닝 중 화면이 OS 자동잠금으로 꺼지지 않게 하는 태그(손에 들고/암밴드로 지표를 흘끗 보는
// 시나리오용). 시작 시 활성, 종료/언마운트 시 해제. 주머니(화면 off)는 백그라운드 추적이 책임.
import {fmtTime, fmtKDate, getMonday, ymdLocal} from './lib/format';
import {
  sumKm, avgPaceLabel, totalTimeLabel, durationLabel, summaryOf, maxDayStreak,
  weekBuckets, monthBuckets, yearBuckets,
} from './lib/stats';
import {parseShoeName, shoeHealth, isRetired, DEFAULT_MAX_KM, clampMaxKm, reconcileShoeAlerts, effectiveMaxKm, raiseHighWater, lowerHighWater, detectMileageDrops} from './lib/shoe';
// 한 러닝은 한 기록 — 폰·워치 중복 저장 병합(신발 이중 차감 차단).
import {findMergeTarget, mergeRuns} from './lib/runMerge';
// 상승 고도는 폰이 한 벌 규칙으로 계산한다(워치는 원자료만 보낸다).
import {elevationGainFrom} from './lib/elevation';
import {setRunSurface, parseSurface, type Surface} from './lib/wearModel';
import {forecastReplacement, type ReplacementForecast} from './lib/replacementForecast';
import {mostRecentShoeId, lastWornDate} from './lib/shoeRecommend';
import {recommendRotation} from './lib/rotation';
import {
  CACHE_SHOES_KEY, CACHE_RUNS_KEY, loadBootCache, writeBootCache,
  persistRunToCache, persistRunCacheRemove,
} from './lib/bootCache';
import {reportStorageResult, reportSyncResult} from './lib/storageAlert';
import {nowMs as syncNowMs, loadClockOffset} from './lib/clockOffset';
import {trackFirstShoeAdded} from './lib/productAnalytics';
import {buildWatchShoes, buildWatchRecentRuns, buildWidgetShoe} from './lib/watchPayload';
import {
  loadSnapshot, clearSnapshot, isResumable,
  loadPendingRuns, overlayPendingRuns, removePendingRun,
  RunSnapshot,
} from './lib/runPersistence';
import {Unit, kmToDisplay, displayNum} from './lib/units';
import {
  AlertSettings, loadSettings, saveUnit, saveGoal, saveAlerts, saveWeight,
  saveAge, saveSex, saveRestHR, Sex,
  loadSettingsUpdatedAt, saveSettingsUpdatedAt,
  clampGoal, clampWeight, DEFAULT_SETTINGS,
  loadHaptics,
} from './lib/settings';
import {
  settingsTsOf, shouldApplySettings, pickRestorableSettings, nextSettingsTs,
} from './lib/settingsRestore';
import {detectPRs, PRKind} from './lib/records';
import {runInsights} from './lib/runInsights';
import {getDistancePBs, PB_CACHE_KEY} from './lib/distancePBStore';
import type {RunBestEfforts} from './lib/bestEfforts';
import {hkSaveRunWorkout, hkBackfillHeartRate, hkEnsureLinked, hkFindRunWorkoutWindow} from './lib/healthkit';
import {registerRunForHr, saveWatchHrTrack, retryPendingHr, avgBpmFromTrack, hasHrTrack} from './lib/hrBackfill';
import {syncRunDetails, runsWithCloudRoute, enqueueDetailDeletion} from './lib/runDetailSync';
import {updateHomeWidgetShoe} from './lib/homeWidget';
import {checkCacheOwner, claimCacheOwner} from './lib/cacheOwner';
import {liveActivity} from './lib/liveActivity';
import {watchSession} from './lib/watchSession';
import {assessTrainingLoad, loadRatioPhraseKo, LOAD_WORD, LoadLevel} from './lib/trainingLoad';
import {
  getNotifSettings, setNotifSettings, dueNotifications,
  DEFAULT_NOTIF_SETTINGS, type NotifSettings, type NotifState, type ShoeForecast,
} from './lib/notifications';
import {presentDue, setupPushMessaging, shouldPrimePushPermission, markPushPrimed, primePushPermission, type PushWiring} from './lib/pushMessaging';
import {syncRunReminder, ensureForegroundHandler} from './lib/localReminder';
import {weeklyProgress, personalRecords} from './lib/goals';
import {BackupPayload} from './lib/backup';
import {Challenge, ChallengeRun} from './lib/challenges';
import {ExtChallenge, challengeExtProgress, extChallengesToContext, type ExtRun, type ExtShoe} from './lib/progression/challengesExt';
import {createFirebaseCloudPort} from './lib/firebaseCloudPort';
import {getAuth, onAuthStateChanged} from '@react-native-firebase/auth';
import {syncRemoteCatalog} from './lib/shoeCatalogRemote';
import {setRemoteShoeDocs} from './lib/shoeCatalogStore';
import {LoginScreen} from './LoginScreen.rn';
import {stampUpdatedAt, markDeleted, partitionTombstones, mergeCloudData, mergeMedals, liveRecords, reconcileLivePreservingLocal, unionTombstones, stripSyncedRoutes, shouldSkipCloudSync, compactTombstones, SHOE_TOMBSTONE_KEEP} from './lib/cloudSync';
import {publishMyRanking} from './lib/progression/firestoreRankingStore';
import {LEADERBOARD_PUBLISH_ENABLED, SOCIAL_PROFILE_PUBLISH_ENABLED} from './lib/featureFlags';
import {genRunId, genShoeId} from './lib/genId';
import {showToast} from './lib/toast';
import {withTimeout} from './lib/withTimeout';
import {migrateStorageSchema} from './lib/storageMigration';
import {resolveGoogleCredential} from './lib/googleAuth';
import {resolveAppleCredential} from './lib/appleAuth';
import {resolveKakaoFirebaseToken} from './lib/kakaoAuth';
import {resolveNaverFirebaseToken} from './lib/naverAuth';
import {pickPhotoWithPermission} from './lib/photo';

// 로컬 백업 가져오기 시 원본을 보관하는 신규 AsyncStorage 키(기존 키 파괴 금지).
// 개인 챌린지 목록을 영속하는 신규 AsyncStorage 키(개인 전용 — 계정/서버 불필요).
const K_CHALLENGES = 'challenges_v1';
// 프로필 이름/사진(로컬 전용 — 개인 식별, 서버 불필요). 신규 키라 기존 데이터와 격리.
const K_PROFILE_NAME = 'profile_name';
const K_PROFILE_PHOTO = 'profile_photo';
const DEFAULT_PROFILE_NAME = '러너';
// 포그라운드에서 이미 표시한 푸시 알림 key 집합(당일 1회 표시, A8-4). 키는 날짜 스탬프를
// 포함하므로(예: 'run_reminder:2026-06-09') 다음 날엔 자연히 새 키가 되어 다시 표시된다.
const K_NOTIF_PRESENTED = 'notif_presented';
// 런 삭제가 클라우드 상세 삭제를 기다리는 최대 시간(ms). 초과하면 재시도 큐로 넘긴다 —
// 로컬 삭제와 사용자 피드백이 네트워크에 인질로 잡히면 안 된다(QA 감사 Q-2 동류).
const DETAIL_DELETE_TIMEOUT_MS = 8000;

// audit#9/#10: 콜드 백엔드 부팅 상태기계. 'loading'(스켈레톤) → 'ready'(정상) |
// 'error'(재시도 카드). 'error'는 fetch 실패만을 의미하며, 빈-신규(fetch 성공 + 빈
// 배열)와 구분된다 — 신규 사용자는 재시도 카드가 아니라 온보딩/빈 홈을 본다.
type BootState = 'loading' | 'ready' | 'error';

// 첫 실행 온보딩 / 위치 권한 priming 의 1회성 플래그 키(AsyncStorage 영속).
const ONBOARD_KEY = 'onboarded';        // 온보딩 완료
const LOC_PRIME_KEY = 'loc_perm_primed'; // 위치 권한 사전 안내 완료
// 로컬-퍼스트 폴백 캐시(키·읽기·쓰기는 lib/bootCache 가 소유한다).
// audit a2: soft-delete 묘비(tombstone) 영속 키. 삭제는 하드삭제 대신 {id,deleted:true,
// updatedAt} 묘비로 표현해, 라이브 신발/런 배열엔 안 보이게 하면서도 backupData 에 실어
// 클라우드 머지로 삭제가 전파되고(다른 기기에서도 사라짐) 부활하지 않게 한다. REST 는 정본
// (실제 DELETE)이고, 묘비는 Firestore 백업 머지가 지워진 레코드를 되살리지 못하게 막는다.
const K_TOMBSTONES = 'tombstones_v1';
// ── 셀러브레이션(등급상승/업적) 트리거 — 한글 매핑 + '이미 본 것' 베이스라인 키 ──────────
const CELEB_SEEN_KEY = 'celebration_seen_v1';
const CELEB_RANK_KO: Record<string, string> = {bronze: '브론즈', silver: '실버', gold: '골드', platinum: '플래티넘', diamond: '다이아몬드', master: '마스터', legend: '레전드'};
const CELEB_CAT_KO: Record<string, string> = {runningMilestone: '러닝 이정표', distanceMilestone: '누적 거리', consistency: '꾸준함', shoeJourney: '신발 여정', shoeMemory: '신발과 동행', experience: '특별 경험', keego: 'Keep Going'};
// 카테고리별 메달 글리프(모두 리본으로 뜨던 구멍 수정 — 사용자 발견 2026-07-04).
// star 는 등급 상승 전용이라 업적엔 쓰지 않는다(중복 방지): 이정표=결승 깃발 ·
// 누적=발자국 · 꾸준함=걷는 사람 · 신발 여정=리본 훈장(은퇴) · 동행=트로피 ·
// 특별 경험=반짝임 · Keep Going=∞(브랜드 심볼).
const CELEB_ICON: Record<string, 'medal'|'trophy'|'flag'|'route'|'run'|'star'|'sparkles'|'infinite'> = {
  runningMilestone: 'flag', distanceMilestone: 'route', consistency: 'run',
  shoeJourney: 'medal', shoeMemory: 'trophy', experience: 'sparkles', keego: 'infinite',
};
const CELEB_RARITY: Record<string, {ko: string; color: string}> = {common: {ko: '커먼', color: RARITY_COLORS.common}, rare: {ko: '레어', color: RARITY_COLORS.rare}, epic: {ko: '에픽', color: RARITY_COLORS.epic}, legendary: {ko: '레전더리', color: RARITY_COLORS.legendary}};
function nowTimeLabel():string{
  const n=new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

function today():string{return ymdLocal(new Date());}

// ── 진척 홈 띠(Slice D) 챌린지 라벨/단위 — 표시 전용 순수 헬퍼 ─────────────────────
// 홈 띠에 한 줄로 보일 짧은 라벨/단위. 진행 수치는 challengeProgress/challengeExtProgress
// 가 권위(여긴 카피만). 결정적·방어적(누락 → 기본값).
function baseChallengeLabel(c:Challenge):string{
  return c.kind==='streak'
    ? `${Number(c.targetDays)||0}일 연속 달리기`
    : `${Number(c.targetKm)||0}km 달리기`;
}
function extChallengeLabel(c:ExtChallenge):string{
  if(c.kind==='weekly')
    return c.metric==='count' ? `이번 주 ${Number(c.targetRuns)||0}회` : `이번 주 ${Number(c.targetKm)||0}km`;
  if(c.kind==='shoe')
    return `한 신발로 ${Number(c.targetKm)||0}km`;
  // rotation
  return c.rotationMode==='balance'
    ? `로테이션 균형 ${Number(c.maxSharePct)||60}% 이하`
    : `로테이션 ${Number(c.targetShoes)||2}켤레`;
}
function extChallengeUnit(c:ExtChallenge):string{
  if(c.kind==='weekly') return c.metric==='count' ? '회' : 'km';
  if(c.kind==='shoe') return 'km';
  return c.rotationMode==='balance' ? '%' : '켤레';
}

// 위치 권한이 없거나 회수됐을 때의 한국어 안내 + 설정 딥링크. 앱은 권한을 직접
// 되돌릴 수 없으므로 OS 설정 화면으로 보내 사용자가 다시 허용하게 한다. openSettings
// 실패(미지원 환경 등)는 삼켜서 크래시를 막는다(트래킹 차단이 목적, 크래시 금지).

// 부팅 시 전역 JS 에러 핸들러 설치 — 잡히지 않은 예외를 Crashlytics 에 기록(멱등·graceful).
// 모듈 로드 시 1회. jest 등 ErrorUtils 부재 환경에선 no-op 으로 폴백한다.
installCrashHandler();

export default function App(){
  // 라이브 액티비티 고아 청소(2026-07-25 실기기 버그): 앱이 강제 종료되면 러닝 종료
  // 경로의 liveActivity.end() 가 못 돌아 잠금화면/다이내믹 아일랜드 위젯이 최대 8시간
  // 떠 있었다. 부팅 즉시 우리 타입의 잔존 액티비티를 전부 닫는다(네이티브가 전체 목록
  // 순회 — 러닝 재개 흐름은 이후 start() 가 새로 띄우므로 충돌 없음).
  useEffect(()=>{liveActivity.end();},[]);
  return(
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={BG}/>
      <ErrorBoundary>
        <Main/>
      </ErrorBoundary>
      {/* 전역 스낵바 호스트 — 앱 어디서든 showToast()를 부르면 여기서 그린다(루트 1회 마운트). */}
      <ToastHost/>
      {/* 전역 다이얼로그 호스트(A안 '시스템 정합', 2026-07-25 민우님 확정) — showDialog(). */}
      <DialogHost/>
    </SafeAreaProvider>
  );
}

function Main(){
  const [tab,setTab]=useState(0);                 // 0 home · 1 shoes · 2 history · 3 profile (primitives TABS 순서와 동일)
  const [shoes,setShoes]=useState<BackendShoe[]>([]);
  const [runs,setRuns]=useState<BackendRun[]>([]);
  // 거리 PB(러너 스펙) — paceTrack 베스트에포트 집계. 캐시·마이그레이션·삭제복구는 store 담당.
  const pbDeps=useMemo(()=>({
    loadTrack:async(id:string)=>{try{const raw=await AsyncStorage.getItem('paceTrack_'+id);return raw?JSON.parse(raw):null;}catch{return null;}},
    getCache:async()=>{try{const raw=await AsyncStorage.getItem(PB_CACHE_KEY);return raw?JSON.parse(raw):null;}catch{return null;}},
    setCache:async(c:any)=>{try{await AsyncStorage.setItem(PB_CACHE_KEY,JSON.stringify(c));}catch(e){recordError(e,'storage: distance PB cache write');}},
  }),[]);
  const [distancePBs,setDistancePBs]=useState<RunBestEfforts>({});
  const runIdSig=runs.map(r=>String((r as any).id)).filter(Boolean).join(',');
  useEffect(()=>{
    let alive=true;
    getDistancePBs(runIdSig?runIdSig.split(','):[],pbDeps).then(pb=>{if(alive)setDistancePBs(pb);}).catch(()=>{});
    return()=>{alive=false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[runIdSig]);
  // audit a2: soft-delete 묘비 저장소. 라이브 shoes/runs 는 항상 묘비-free(삭제 레코드 0)라
  // 화면/집계가 자동으로 삭제를 제외한다. 묘비는 여기에만 모아 backupData 에 합류시켜 동기로
  // 삭제를 전파하고, 머지 결과는 applyBackupPayload 가 다시 live/묘비로 분리해 이 불변식을
  // 유지한다(한 id 가 live 와 묘비에 동시에 있지 않는다 → 자기충돌 부활 없음).
  const [tombstones,setTombstones]=useState<{shoes:BackendShoe[];runs:BackendRun[]}>({shoes:[],runs:[]});
  // 최신 묘비 미러(ref) — applyBackupPayload 가 동기 await 뒤 실행될 때, 그 await 도중
  // 로컬에서 새로 만든 묘비를 stale 클로저 대신 이 ref 로 읽어 부활을 막는다(2026-07-05).
  const tombstonesRef=useRef(tombstones);
  useEffect(()=>{tombstonesRef.current=tombstones;},[tombstones]);
  // 런별 노면 태그 캐시(surface_<runId> → Surface). 실효 마모/교체 예측 보정용. 미태그는
  // road로 동작(차단 아님). runs 변경 시 한 번에 읽어들이고, 손상/실패는 무시한다.
  const [runSurfaces,setRunSurfaces]=useState<Record<string,Surface>>({});
  // 홈/신발 화면이 공유하는 '선택 신발' id. null이면 휴식 로테이션 추천 신발로 폴백한다
  // (activeIdx={0} 하드코딩 제거 — 선택/추천이 홈 히어로를 몬다).
  const [selectedShoeId,setSelectedShoeId]=useState<string|null>(null);
  // 홈 카드 → 화면 이동: 히어로 신발 탭 시 그 신발 상세를 신발탭에서 열고, 주간목표 탭 시
  // 프로필의 목표 설정 패널을 펼친 채 진입한다(각각 한 번만 소비).
  const [shoesDetailId,setShoesDetailId]=useState<string|null>(null);
  const [profileInitialOpen,setProfileInitialOpen]=useState<'body'|'alerts'|'account'|null>(null);
  // 진척(랭크·타이틀·업적) 전체화면 표시 여부. 프로필의 '진척' 버튼이 열고, 화면의
  // 뒤로 버튼이 닫는다. 기존 탭/온보딩 부트 흐름과 독립적인 오버레이형 게이트다.
  const [showProgression,setShowProgression]=useState(false);
  // 명예의 전당(은퇴 신발 박물관) 전체화면 표시 여부. 프로필 진입 버튼이 열고 화면
  // 뒤로 버튼이 닫는다. 진척과 같은 오버레이형 게이트(부트 흐름과 독립).
  const [showHallOfShoes,setShowHallOfShoes]=useState(false);
  const [showArchive,setShowArchive]=useState(false);
  // 마라톤 메달 아카이브(로컬 우선) — 부팅 시 로드. 마이 탭 진입 갤러리 + 완주 기록 흐름.
  const [medals,setMedals]=useState<Medal[]>([]);
  const [showMedalArchive,setShowMedalArchive]=useState(false);
  // 마이 탭에서 연 러닝화 찾기. 기준을 안 주므로 '어떤 신발을 기준으로 볼까요?'부터
  // 시작한다(내 신발 고르기 · 카탈로그에서 고르기 · 기준 없이 둘러보기).
  const [showFindShoes,setShowFindShoes]=useState(false);
  // 대회 기록 흐름(완주 감지 배너 또는 아카이브 '추가'에서 진입). null = 미표시.
  const [medalFlow,setMedalFlow]=useState<null|{date:string;runId?:string;appTimeSec?:number;appPaceSec?:number;presetRaceId?:string;presetDistance?:RaceDistance}>(null);
  // 완주 리캡의 대회 감지 컨텍스트(배너용) — setRunRecap 과 함께 세팅, 닫을 때 함께 해제.
  const [recapRace,setRecapRace]=useState<null|{match:RaceMatch;date:string;runId?:string;appTimeSec:number;appPaceSec?:number}>(null);
  // 대회 카탈로그 — 번들 시드로 시작, 부팅 시 Firestore 'races' 머지(서버 갱신 반영). 실패 시 시드 유지.
  const [races,setRaces]=useState<RaceEvent[]>(SEED_RACES);
  // 대회 원격 동기는 로그인 이후 별도 effect 가 맡는다(AUDIT 2 I-1 — 아래 syncRemoteRaces).
  useEffect(()=>{void loadMedals().then(setMedals);},[]);
  // 필수 업데이트 게이트(AUDIT 2 I-3). null = 막지 않음(기본값이자 fail-open 의 기본 상태).
  const [forceUpdateCfg,setForceUpdateCfg]=useState<RemoteAppConfig|null>(null);
  // 공개 범위(소셜). 'unset' = 아직 안 물어봤다 → 동의 화면을 띄우고, 그 전엔 아무것도 안 올린다.
  const [socialVisibility,setSocialVisibility]=useState<ProfileVisibility>('unset');
  useEffect(()=>{void loadVisibility().then(setSocialVisibility);},[]);
  // 햅틱(진동) 설정 부팅 복원 — 폰 Vibration(lib/haptics 싱글턴) 동기화 + 워치에도 전달.
  // off 면 화면 전환·버튼·존 이탈·워치 랩 진동이 전부 조용해진다(사용자 요청 2026-07-13).
  useEffect(()=>{void loadHaptics().then(v=>{setHapticsEnabled(v);watchSession.setHaptics(v);});},[]);
  // 부상위험 상세(시그니처) 전체화면 — 홈 신호등 카드 탭이 열고 뒤로가 닫는다(오버레이형).
  // 완주 리캡(P0-2) — 러닝 저장 직후 축하 풀스크린. '완료'로 닫으면 기록 탭으로 이동.
  const [runRecap,setRunRecap]=useState<{km:number;durationS:number;cadence:number;bpm:number;splits:any[];elevationM:number;calories:number;prKinds:PRKind[];moment?:string;shoeName?:string;goalKm?:number;goalMin?:number;pacePlan?:number[];shoeWear?:{addedKm:number;remainingPct:number;deltaPct:number}|null;loadInfo?:{phrase:string;word:string;level:LoadLevel}|null;route?:string|null;track?:{lapM:number;laps:number}|null;runId?:string}|null>(null);
  // 위치 권한 설명(priming) 풀스크린 — 첫 GPS 런 직전 들고 있을 목표(RunGoal). null=미표시.
  // '계속'에서 권한 안내 완료 영속 + 런 진입, '나중에'면 닫고 시작 취소.
  const [locPrimeGoal,setLocPrimeGoal]=useState<RunGoal|null>(null);
  // 설정에서 위치를 허용하고 돌아오면 **바로 이어서 시작할** 러닝 목표. null = 기다리는 것 없음.
  const [permRetryGoal,setPermRetryGoal]=useState<RunGoal|null>(null);
  // 명예의 전당(라이브 리더보드) 전체화면 표시 여부 — 진척 화면 헤더 버튼이 연다.
  const [showHallOfFame,setShowHallOfFame]=useState(false);
  /**
   * 방금 로그인한 제공자. LoginScreen 이 올려주고, **계정 정합이 끝난 뒤** 아래
   * 효과가 한 번 적어 넣는다(그 전에 쓰면 정합이 덮는다 — 2026-08-03 버그).
   */
  // 테스트는 로그인 화면을 우회(__KEEGO_AUTH_USER__)하므로 제공자가 전달될 길이 없다.
  // 기존 관례(__KEEGO_AUTH_USER__ · __KEEGO_ENABLE_ACCOUNT_SCOPE__)와 같은 문법으로 주입한다.
  const pendingProviderRef=useRef<CloudProvider|null>(
    ((globalThis as any).__KEEGO_PENDING_PROVIDER__ as CloudProvider|undefined)??null);
  // 열람 중인 러너(uid + 목록이 이미 알던 이름). null 이면 안 열려 있고, 그동안은
  // profiles 를 한 번도 읽지 않는다 — 목록을 그리며 미리 당겨오면 100명이면 100읽기다.
  const [viewedRunner,setViewedRunner]=useState<{uid:string;name:string}|null>(null);
  // 진척 영속 상태(progression_v1) — Hall of Shoes 레코드 + 은퇴 키프세이크 컨텍스트의
  // 소스. 마운트 시 로드하고, 은퇴 확정 시 레코드를 ADDITIVE 하게 덧붙인다(파생값은 재계산).
  const [progState,setProgState]=useState<ProgressionState|null>(null);
  // 셀러브레이션(등급상승/업적 획득) — 현재 표출 1건 + 대기 큐 + '이미 본 것' 베이스라인.
  const [celebration,setCelebration]=useState<CelebrationData|null>(null);
  const celebQueueRef=useRef<CelebrationData[]>([]);
  const celebBaselineRef=useRef<{ach:string[];tier:string}|null>(null);
  const [celebReady,setCelebReady]=useState(false);
  // 온보딩 미리보기(개발 전용) — 계정에 신발이 있어 자연 노출 안 되는 온보딩을 dev 빌드
  // 실행 시 강제로 보여준다(넘기면 홈으로, 비영속). 릴리스 빌드에선 항상 꺼진다
  // (__DEV__ 게이트 — 출시 블로커 해소 2026-07-10. 온보딩 리뷰는 07-09~10 기기에서 완료).
  // jest 에서도 끈다 — 부팅/온보딩 통합 테스트가 실제 게이트 조건(!onboarded)을 검증해야 한다.
  const [previewOnboard,setPreviewOnboard]=useState(__DEV__&&!(typeof process!=='undefined'&&process.env&&process.env.JEST_WORKER_ID));
  const [overlay,setOverlay]=useState<'none'|'add'|'goal'|'countdown'|'run'>('none');
  const [pendingShoe,setPendingShoe]=useState<{id:string;name:string;ui:Shoe}|null>(null);
  const [activeRun,setActiveRun]=useState<{id:string;name:string;goalKm:number;goalMin:number;pacePlan:number[];targetZone:number;trackLapM?:number;indoor?:boolean}|null>(null);
  // audit#2: 앱 시작 시 감지된 미완료 런 스냅샷. 사용자가 '복구' 선택 시 done
  // 화면으로 시드되어 검토 후 저장/버리기를 결정한다(데이터 유실 금지).
  const [resumeSnap,setResumeSnap]=useState<RunSnapshot|null>(null);
  // 복구 모드: 'review'=스냅샷을 done 화면에 띄워 저장만, 'continue'=GPS 재가동해 이어 달리기.
  const [resumeMode,setResumeMode]=useState<'review'|'continue'>('review');
  // ── 사용자 설정(ProfileScreen 설정 4행이 구동) ─────────────────────────────
  // 거리 단위(표시 전용 — 저장 표준은 항상 km), 주간 목표(km), 신발 교체 알림.
  // loadSettings로 AsyncStorage(settings_unit/goal_weekly_km/settings_alerts)에서
  // 복원하고, 변경 시 즉시 영속 + 상태 갱신해 전 화면에 반영한다.
  const [unit,setUnit]=useState<Unit>(DEFAULT_SETTINGS.unit);
  const [goalWeeklyKm,setGoalWeeklyKm]=useState(DEFAULT_SETTINGS.goalWeeklyKm);
  const [alerts,setAlerts]=useState<AlertSettings>({...DEFAULT_SETTINGS.alerts});
  // 푸시 알림 설정(신규 notif_settings 키 — 기존 settings_alerts 와 별개). getNotifSettings
  // 로 복원하고, ProfileScreen 의 변경을 changeNotifSettings 가 즉시 영속 + 상태 반영한다.
  const [notifSettings,setNotifSettingsState]=useState<NotifSettings>(DEFAULT_NOTIF_SETTINGS);
  // 체중(kg) — 러닝 칼로리 추정에 쓴다(설정에서 조정, 기본 65). 표시 단위와 무관.
  const [weightKg,setWeightKg]=useState(DEFAULT_SETTINGS.weightKg);
  // 신체지표(심박존용) — 나이→최대심박(Tanaka), 안정심박→Karvonen 존, 성별→TRIMP 계수.
  // 0/기본은 '미설정'(폴백으로 동작). 설정에서 조정.
  const [age,setAge]=useState(DEFAULT_SETTINGS.age);
  const [sex,setSex]=useState<Sex>(DEFAULT_SETTINGS.sex);
  const [restHR,setRestHR]=useState(DEFAULT_SETTINGS.restHR);
  // 설정 블록 최종 수정 시각(epoch ms, 0=미수정) — 클라우드 병합 last-write-wins 판정.
  // ref 미러는 동기 왕복(await) 중의 편집을 applyBackupPayload 가 즉시 보게 한다(클로버 가드).
  const [settingsTs,setSettingsTs]=useState(0);
  const settingsTsRef=useRef(0);
  // 개인 챌린지 목록(거리·연속일). 신규 키(K_CHALLENGES)로 영속하며 런 기록에서
  // 진행률을 파생한다(lib/challenges). 기존 키와 분리돼 데이터 파괴 위험이 없다.
  const [challenges,setChallenges]=useState<Challenge[]>([]);
  // 확장 챌린지(monthly/shoe/rotation, 스마트 추천 수락분). 기존 distance/streak 과 같은
  // 키(K_CHALLENGES)에 한 배열로 함께 영속하되, kind 로 분리해 서로를 건드리지 않는다.
  const [extChallenges,setExtChallenges]=useState<ExtChallenge[]>([]);
  // 진척 컨텍스트용 챌린지 완료 신호(2026-07-14 정확성 수정). getProgression 이 challenges
  // 인자를 받지 못해 completedChallengeCount 가 항상 0 → challenge_starter/dedicated/master
  // 업적이 영원히 잠기고 130XP·랭크 상한이 도달 불가였다. 수락한 base(거리/연속)+ext
  // (월간/신발/로테이션) 챌린지의 완료 여부를 buildContext 가 세는 것과 동일한 모양
  // (ContextChallengeInput{completed})으로 변환해 모든 getProgression 호출에 흘린다.
  // raw runs/shoes 를 받아 라이브 머지 경로(liveRuns)와 렌더 경로 모두 같은 함수로 쓴다.
  const buildContextChallenges=useCallback((rawRuns:readonly BackendRun[],rawShoes:readonly BackendShoe[],nowISO:string):ContextChallengeInput[]=>{
    const cRuns:ChallengeRun[]=rawRuns.map(r=>({date:String(r.run_date||'').slice(0,10),dist:Number(r.km)||0}));
    const eRuns:ExtRun[]=rawRuns.map(r=>({date:String(r.run_date||'').slice(0,10),dist:Number(r.km)||0,shoeId:r.shoe_id,durationS:r.duration}));
    const eShoes:ExtShoe[]=rawShoes.map(sh=>({id:sh.id,name:sh.name,retired:!!sh.retired,createdAt:sh.purchase_date,targetKm:sh.max_km}));
    return [
      ...challenges.map(c=>({completed:challengeProgress(c,cRuns).completed})),
      ...extChallengesToContext(extChallenges,eRuns,eShoes,nowISO),
    ];
  },[challenges,extChallenges]);
  // 프로필 이름/사진(로컬 영속). 이름 기본은 '러너', 사진은 없으면 빈 문자열(아바타
  // 아이콘 폴백). 신규 키라 기존 신발/런 데이터와 격리돼 파괴 위험이 없다.
  const [profileName,setProfileName]=useState(DEFAULT_PROFILE_NAME);
  const [profilePhoto,setProfilePhoto]=useState('');
  // audit#9/#10: 콜드 백엔드 부팅 상태(스켈레톤/재시도 카드). 최초엔 'loading'으로 떠
  // 스켈레톤을 보여주고, initUser 성공 시 'ready', fetch 실패 시 'error'로 간다.
  const [bootState,setBootState]=useState<BootState>('loading');
  // 필수 로그인 게이트(Firebase 인증). undefined=확인중(스플래시) · null=미로그인(로그인 화면)
  // · 객체=로그인됨(앱 진입). 실기기에선 onAuthStateChanged 가 채운다. 테스트(NODE_ENV
  // ==='test')에선 게이트를 우회해 기존 App 테스트가 로그인 화면에 막히지 않게 한다
  // (LoginScreen 은 단독 렌더로 검증). __KEEGO_AUTH_USER__ 전역으로 강제 주입도 가능.
  const [authUser,setAuthUser]=useState<{uid:string}|null|undefined>(()=>{
    const inj=(globalThis as any).__KEEGO_AUTH_USER__;
    if(inj!==undefined) return inj;
    return process.env.NODE_ENV==='test' ? {uid:'test-uid'} : undefined;
  });
  // 마지막 동기화 성공 시각(epoch ms). REST 재fetch + pending flush 가 성공한 순간 갱신되어
  // Home 의 '방금 동기화'/'N분 전' 칩으로 노출된다. 초기 null(미동기). 표시 전용.
  const [lastSyncAt,setLastSyncAt]=useState<number|null>(null);
  // 첫 실행 온보딩 노출 여부(완료 시 영속). 신규(신발 0개·미완료)에게만 1회 보여준다.
  const [onboarded,setOnboarded]=useState(true);
  // 위치 권한 사전 안내(priming) 완료 여부. false면 첫 GPS 런 시작 직전 이유를
  // 먼저 안내(Alert)한 뒤 OS 권한 다이얼로그로 넘어간다(audit#9/#10).
  const [locPrimed,setLocPrimed]=useState(true);
  const insets=useSafeAreaInsets();

  // 부팅 — **로그인한 계정이 정해진 뒤에** 로컬 데이터를 읽는다(AUDIT 1 S-1 잔여, 2026-08-01).
  //
  // 예전엔 마운트 즉시(deps []) 한 번만 돌았다. 그래서 한 기기에서 A 로그아웃 → B 로그인 하면
  // **B 화면에 A 의 신발·러닝·GPS 경로가 그대로 남아 있었다.** 다시 읽을 계기가 없었기 때문이다.
  // (클라우드 오염은 AUDIT 1 의 cacheOwner 가 이미 막았지만, 화면에 보이는 것은 그대로였다.)
  //
  // 이제 uid 가 바뀔 때마다 다시 부팅하고, **읽기 전에** reconcileAccountStorage 로 저장소를
  // 그 계정 것으로 갈아끼운다. 이전 계정 데이터는 지우지 않고 보관함으로 옮긴다 —
  // 그 계정으로 다시 로그인하면 미동기 기록까지 그대로 돌아온다(lib/accountScope).
  //
  // 정합에 실패하면 **부팅하지 않는다.** 남의 데이터를 보여주느니 재시도 카드가 낫다.
  useEffect(()=>{
    // 테스트는 기본 우회(25개 App 스위트가 계정 정합 없이 그대로 통과한다).
    // 이 경로 자체의 검증은 __KEEGO_ENABLE_ACCOUNT_SCOPE__ 로 켜서 한다
    // (__tests__/App.accountSwitch.test.tsx — 클라우드 동기의 관례와 동일).
    const scopeOn=process.env.NODE_ENV!=='test'||(globalThis as any).__KEEGO_ENABLE_ACCOUNT_SCOPE__===true;
    if(!scopeOn){void initUser();return;}
    const uid=authUser?.uid;
    if(!uid){
      // 로그아웃/인증 확인중 — 메모리에 남은 이전 계정 데이터를 즉시 비운다.
      // **저장소는 건드리지 않는다**(다시 로그인하면 그대로 돌아온다).
      // bootState 를 함께 'loading' 으로 내리는 게 중요하다 — 캐시 쓰기 디바운스가
      // 'ready' 일 때만 돌기 때문에, 이 빈 상태가 멀쩡한 캐시를 덮어쓰지 않는다.
      setShoes([]);setRuns([]);setBootState('loading');
      return;
    }
    // 정합·재로드가 끝날 때까지 스켈레톤 — 이전 계정 화면이 한 프레임도 비치지 않게.
    setBootState('loading');
    let alive=true;
    (async()=>{
      try{
        await reconcileAccountStorage(uid);
        // **정합이 끝난 뒤에** 제공자를 적는다. 먼저 쓰면 위 정합이 옛 계정 서랍의
        // 값으로 덮어써서, 카카오로 로그인했는데 "네이버 계정"으로 표시된다
        // (2026-08-03 실기기). 쓰는 곳을 여기 하나로 모은 게 이 수정의 핵심이다.
        const prov=pendingProviderRef.current;
        if(prov){pendingProviderRef.current=null;await saveCloudAccount(prov,{uid});}
      }catch(e){
        reportIssue('accountScope 정합 실패 — 부팅 중단(남의 데이터 노출 방지)',e);
        if(alive)setBootState('error');
        return;
      }
      if(alive)void initUser();
    })();
    return()=>{alive=false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.uid]);

  // 필수 로그인 게이트 — Firebase 인증 상태를 구독해 authUser 를 채운다. 로그인/로그아웃/
  // 토큰 만료를 한곳에서 반영한다. 테스트에선 게이트가 우회(authUser 기본 로그인)되므로
  // 구독을 걸지 않아 기존 App 테스트의 비동기 누수를 만들지 않는다.
  useEffect(()=>{
    if(process.env.NODE_ENV==='test') return;
    if((globalThis as any).__KEEGO_AUTH_USER__!==undefined) return;
    const unsub=onAuthStateChanged(getAuth(),(u:any)=>{setAuthUser(u?{uid:u.uid}:null);setCrashUser(u?String(u.uid):'');});
    return unsub;
  },[]);

  // 진척 영속 상태(progression_v1) 복원 — Hall of Shoes 레코드 + 은퇴 컨텍스트의 소스.
  // 손상/누락은 storage 가 안전 기본값으로 복구한다(절대 throw 없음). 1회 로드.
  useEffect(()=>{let alive=true;loadProgression().then(s=>{if(alive)setProgState(s);});return()=>{alive=false;};},[]);

  // 원격 신발 카탈로그 동기화 — 새 러닝화가 앱 업데이트 없이 등록 화면에 뜨게 한다.
  // 로그인 뒤에 돈다(규칙상 shoes 읽기는 로그인 필요). 실패는 조용히 삼키고 번들 목록으로
  // 그대로 간다 — 카탈로그 갱신은 부가 기능이고, 등록은 오프라인에서도 돼야 한다.
  useEffect(()=>{
    if(process.env.NODE_ENV==='test') return;
    if(!authUser) return;
    let alive=true;
    syncRemoteCatalog().then(docs=>{if(alive&&docs.length)setRemoteShoeDocs(docs);}).catch(()=>{});
    return()=>{alive=false;};
  },[authUser]);

  // 필수 업데이트 게이트(AUDIT 2 I-3) — 원격 config/app 의 minSupportedVersion 미만이면
  // 앱을 막는다. 스토어에 나간 빌드에 데이터 유실급 버그가 있을 때, 심사를 기다리는 것
  // 말고 할 수 있는 유일한 조치다. **fail-open** 이라 못 읽으면 막지 않는다(lib/forceUpdate).
  // 로그인 뒤에 읽는다(규칙상 config 도 로그인 필요) — 막아야 할 대상인 '이미 설치해 쓰던
  // 사용자'는 로그인 상태이므로 실효가 있다.
  useEffect(()=>{
    if(process.env.NODE_ENV==='test') return;
    if(!authUser) return;
    let alive=true;
    checkForceUpdate().then(cfg=>{if(alive&&cfg)setForceUpdateCfg(cfg);}).catch(()=>{});
    return()=>{alive=false;};
  },[authUser]);

  // 원격 대회 카탈로그 동기화 — 신발 카탈로그와 같은 규약(24시간 간격 + 커서 증분).
  // **로그인 뒤에 돈다**(규칙상 races 읽기도 로그인 필요). 예전에는 마운트 즉시(deps [])
  // 컬렉션 전량을 읽었는데, 그건 두 가지로 잘못이었다(AUDIT 2 I-1):
  //   · 인증 복원이 아직 안 끝난 시점이라 규칙에 막혀 조용히 실패하고 재시도도 없었다
  //     → 서버에서 대회를 고쳐도 사용자에게 영영 도달하지 않는다.
  //   · 성공하는 경우엔 실행마다 82 읽기 — 하루 읽기의 96%.
  // 실패해도 syncRemoteRaces 가 시드+캐시를 돌려주므로 화면은 그대로 동작한다.
  useEffect(()=>{
    if(process.env.NODE_ENV==='test') return;
    if(!authUser) return;
    let alive=true;
    syncRemoteRaces().then(rs=>{if(alive&&rs.length)setRaces(rs);}).catch(()=>{});
    return()=>{alive=false;};
  },[authUser]);

  // 셀러브레이션 베이스라인('이미 본' 업적 + 등급) 로드 — 1회. 없으면 null(첫 감지 때 시딩).
  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const raw=await AsyncStorage.getItem(CELEB_SEEN_KEY);
        const p=raw?JSON.parse(raw):null;
        if(alive)celebBaselineRef.current=p&&Array.isArray(p.ach)?{ach:p.ach.map(String),tier:String(p.tier||'')}:null;
      }catch{/* 손상/부재 → null(시딩) */}
      if(alive)setCelebReady(true);
    })();
    return()=>{alive=false;};
  },[]);

  // 등급상승/업적 획득 감지 → 셀러브레이션 오버레이 큐잉. 베이스라인 대비 신규만 띄우고,
  // 첫 실행(베이스라인 없음)은 현재를 시딩만 한다(기존 업적·현재 등급 소급 축하 금지).
  useEffect(()=>{
    if(!celebReady||!progState)return;
    const view=getProgression(runs,shoes,progState??undefined,undefined,buildContextChallenges(runs,shoes,today()));
    const currentAch=collectUnlockedKeys(view);
    const tier=String(view.rank.tier);
    const base=celebBaselineRef.current;
    // 단조(monotonic) 베이스라인: 부팅 직후 데이터(shoes/runs)가 아직 안 실린 빈 상태로
    // 이 effect 가 먼저 돌면 currentAch=[]/tier=bronze 다. 그걸 그대로 저장하면 저장된
    // baseline 을 비워버려, 곧이어 Firestore/캐시에서 데이터가 실릴 때 모든 업적·랭크가
    // '신규'로 오인돼 매 실행 셀러브레이션이 재폭주한다(사용자 보고 버그). 그래서 baseline 은
    // union(업적)·max(랭크)로만 키워, 빈 상태가 기존 baseline 을 절대 축소하지 못하게 한다.
    const persist=(next:{ach:string[];tier:string})=>{
      const merged=mergeCelebBaseline(celebBaselineRef.current,next,RANK_XP as Record<string,number>);
      celebBaselineRef.current=merged;
      // 축하 중복 방지 마커 — 실패해도 최악은 축하가 한 번 더 뜨는 것뿐(데이터 무해).
      try{void AsyncStorage.setItem(CELEB_SEEN_KEY,JSON.stringify(merged));}catch{/* 무해: 축하 1회 중복 */}
    };
    if(base===null){persist({ach:currentAch,tier});return;}
    const seen=new Set(base.ach);
    const newAch=currentAch.filter(k=>!seen.has(k));
    const rankUp=(RANK_XP as Record<string,number>)[tier]>((RANK_XP as Record<string,number>)[base.tier]??-1)&&tier!==base.tier;
    if(newAch.length>0||rankUp){
      const q:CelebrationData[]=[];
      if(rankUp){
        q.push({
          type:'rankup',
          rankKo:CELEB_RANK_KO[tier]??tier,
          rankColor:view.rank.color,
          prevKo:CELEB_RANK_KO[base.tier]??base.tier,
          nextKo:view.rank.nextTier?(CELEB_RANK_KO[String(view.rank.nextTier)]??String(view.rank.nextTier)):null,
          xpToNext:view.rank.xpForNext,
        });
      }
      for(const k of newAch){
        const a=view.achievements.find(x=>x.key===k);
        if(!a||!a.unlocked)continue;
        const rar=CELEB_RARITY[a.rarity]??CELEB_RARITY.common;
        q.push({
          type:'achievement',
          nameKo:a.name,
          catKo:CELEB_CAT_KO[a.category]??'러닝 기록',
          icon:CELEB_ICON[a.category]??'medal',
          rarityKo:rar.ko,
          rarityColor:rar.color,
          xp:a.xp,
          detail:a.description,
          legendary:a.rarity==='legendary',
        });
      }
      if(q.length){
        celebQueueRef.current.push(...q);
        setCelebration(prev=>prev??celebQueueRef.current.shift()??null);
      }
    }
    persist({ach:currentAch,tier});
  },[runs,shoes,progState,celebReady,buildContextChallenges]);

  const closeCelebration=()=>setCelebration(celebQueueRef.current.shift()??null);

  // 개인 챌린지 목록 복원(신규 키 — 네트워크 무관, 1회). 손상/형식오류는 조용히
  // 무시해 빈 목록으로 시작한다(기존 데이터 보존, 크래시 금지).
  useEffect(()=>{
    (async()=>{
      try{
        const raw=await AsyncStorage.getItem(K_CHALLENGES);
        if(!raw)return;
        const arr=JSON.parse(raw);
        if(!Array.isArray(arr))return;
        const valid=arr.filter((c:any)=>c&&typeof c.id==='string');
        // kind 로 분리: distance/streak → 기존 개인 챌린지, monthly/shoe/rotation → 확장.
        setChallenges(valid.filter((c:any)=>c.kind==='distance'||c.kind==='streak'));
        setExtChallenges(valid.filter((c:any)=>c.kind==='weekly'||c.kind==='shoe'||c.kind==='rotation'));
      }catch(e){reportIssue('challenges load',e);}
    })();
  },[]);

  // 프로필 이름/사진 복원(신규 키 — 네트워크 무관, 1회). 손상/부재는 조용히 기본값으로
  // 폴백한다(이름='러너', 사진 없음). 기존 데이터와 격리돼 파괴 위험 0.
  useEffect(()=>{
    (async()=>{
      try{
        const [nm,ph]=await Promise.all([
          AsyncStorage.getItem(K_PROFILE_NAME),
          AsyncStorage.getItem(K_PROFILE_PHOTO),
        ]);
        if(nm&&nm.trim())setProfileName(nm);
        if(ph)setProfilePhoto(ph);
      }catch(e){reportIssue('profile load',e);}
    })();
  },[]);

  // 푸시 알림 설정 복원(신규 키 — 네트워크 무관, 1회). 손상/부재는 getNotifSettings 가
  // 기본값으로 graceful 폴백하므로 별도 방어가 필요 없다(기존 settings_alerts 불변).
  useEffect(()=>{
    (async()=>{
      try{setNotifSettingsState(await getNotifSettings());}catch(e){reportIssue('notif settings load',e);}
    })();
  },[]);

  // 이미 표시한 푸시 알림 key 집합(당일 1회). 메모리 캐시 + 영속을 함께 들고, 포그라운드
  // 진입마다 같은 알림이 반복 표시되는 것을 막는다(checkShoeAlerts 의 신발별 추적과 같은 톤).
  const presentedNotifKeys=useRef<Set<string>>(new Set());
  useEffect(()=>{
    (async()=>{
      try{
        const raw=await AsyncStorage.getItem(K_NOTIF_PRESENTED);
        const arr=JSON.parse(raw||'[]');
        if(Array.isArray(arr))presentedNotifKeys.current=new Set(arr.filter((k:any)=>typeof k==='string'));
      }catch{/* 손상/부재는 무시 — 빈 집합으로 시작 */}
    })();
  },[]);

  // audit a2: soft-delete 묘비 복원(영속 → 상태). 네트워크와 무관하므로 마운트 시 1회 읽어,
  // 온라인 부팅이 REST 데이터로 라이브 배열을 교체해도(묘비는 별도 저장) backupData 가 계속
  // 묘비를 싣게 한다 — 동기 직전 강제종료(묘비 미푸시) 후 재부팅에서도 삭제가 부활하지 않는다.
  useEffect(()=>{
    (async()=>{
      try{
        const raw=await AsyncStorage.getItem(K_TOMBSTONES);
        const parsed=JSON.parse(raw||'{}');
        if(parsed&&typeof parsed==='object'){
          setTombstones({
            shoes:Array.isArray(parsed.shoes)?parsed.shoes:[],
            runs:Array.isArray(parsed.runs)?parsed.runs:[],
          });
        }
      }catch{/* 손상/부재는 무시 — 빈 묘비로 시작 */}
    })();
  },[]);

  // ── 은퇴 기록 1회 이관: progression → 신발 (2026-08-01 결정 A) ──────────────
  // 옛 빌드는 은퇴 스냅샷을 progression.retiredShoes 에 따로 뒀다. 같은 신발을 두 곳이
  // 설명하던 구조라 이제 신발 문서로 모은다. **무손실**이다 — 신발에 이미 스냅샷이
  // 있으면 덮지 않고, 짝이 없는 기록(신발이 이미 삭제됨)만 버린다(결정 A와 같은 의미).
  // 이관이 끝나면 옛 배열을 비워 두 곳이 다시 어긋나지 않게 한다.
  useEffect(()=>{
    if(bootState!=='ready') return;
    const legacy=progState?.retiredShoes;
    if(!legacy?.length) return;
    let orphanCount=0;
    setShoes(prev=>{
      const {shoes:next,migrated,orphaned}=migrateRetiredShoes(prev as any,legacy);
      orphanCount=orphaned;
      if(migrated===0) return prev;
      // 이관으로 새로 붙은 신발만 스탬프한다 — 클라우드 병합이 이 변경을 최신으로 본다.
      return (next as typeof prev).map((sh,i)=>sh===prev[i]?sh:stampUpdatedAt(sh));
    });
    // 옛 배열은 비운다 — 이관됐거나(신발에 있음) 고아(신발 없음)라 더 볼 일이 없다.
    setProgState(prev=>prev?{...prev,retiredShoes:[]}:prev);
    if(orphanCount>0){
      reportIssue('은퇴 기록 이관: 짝 없는 기록 폐기(신발이 이미 삭제됨)',
        new Error(`orphaned=${orphanCount}`));
    }
    // shoes 는 setShoes(prev=>…) 로만 읽으므로 의존성이 아니다(불필요한 재실행 방지).
  },[bootState,progState?.retiredShoes]);

  // ── 공개 프로필용 러너 스펙 (소셜) ─────────────────────────────────────────
  // 마이 탭이 쓰는 것과 **같은 계산**을 재사용한다 — 두 화면이 다른 값을 말하면 안 된다.
  // VO2max 는 러닝 기록에서 파생한 성능 추정치라 공개해도 되는 값으로 봤다.
  // **심박(안정시·평균)은 담지 않는다** — 건강 정보라 민감정보 별도 동의가 필요하고,
  // 무엇보다 노력으로 못 바꾸는 값이라 비교 지표로 부적합하다(업적 원칙: 안전 정렬).
  const socialSpecInput=useMemo(()=>{
    const liveRuns=liveRecords(runs as any) as any[];
    const fit=fitnessSummary(
      liveRuns.map(r=>({km:Number(r?.km??0),durationS:Number(r?.duration??0),runDate:String(r?.run_date||'')})),
      today(),
    );
    let longestKm=0;
    let sumKmAll=0;
    let sumSec=0;
    for(const r of liveRuns){
      const km=Number(r?.km)||0;
      const dur=Number(r?.duration)||0;
      if(km>longestKm) longestKm=km;
      if(km>0&&dur>0){sumKmAll+=km;sumSec+=dur;}
    }
    return {
      vo2max:fit?.vo2max??0,
      paceSec:sumKmAll>0?sumSec/sumKmAll:0,
      longestKm,
      pb:distancePBs as Record<string,number|undefined>,
    };
  },[runs,distancePBs]);

  // ── 신발 마일리지 최고수위 (AUDIT 3 D-4) ──────────────────────────────────
  // usedKm 은 런 목록에서 매번 다시 계산하는 파생값이라, 런이 어떤 이유로든 사라지면
  // **말없이 줄어든다.** 예전엔 그걸 아는 주체가 아무도 없었다 — 수명 링이 뒤로 감기고
  // 교체 알림이 늦춰져도 사용자는 몰랐다.
  //
  // 되돌리지는 않는다(무엇이 옳은지 앱은 모른다 — 삭제가 정당했을 수도 있다).
  // **조용하지 않게** 만드는 것이 목적이다: 도달했던 최대치를 기록해 두고, 설명되지 않는
  // 감소가 생기면 한 번 알린 뒤 그 값으로 다시 기준을 잡는다(같은 일로 계속 나무라지 않는다).
  // 삭제처럼 정당한 감소는 deleteRun 이 수위를 미리 내려 여기 걸리지 않는다.
  useEffect(()=>{
    if(bootState!=='ready') return;
    const drops=detectMileageDrops(shoes as any,runs as any);
    if(drops.length){
      const first=drops[0];
      showToast({message:drops.length===1
        ?`${first.shoeName}의 기록 ${first.missingKm.toFixed(1)}km 가 보이지 않아요`
        :`신발 ${drops.length}켤레의 기록 일부가 보이지 않아요`});
      reportIssue('마일리지 감소 감지',new Error(JSON.stringify(drops.slice(0,5))));
      // 재기준 — 알렸으니 이 감소는 소비됐다. 다음에 또 줄면 그때 다시 알린다.
      setShoes(prev=>prev.map(sh=>{
        const d=drops.find(x=>x.shoeId===String(sh.id));
        return d?stampUpdatedAt({...sh,usedKmHighWater:d.currentKm}):sh;
      }));
      return;
    }
    // 수위 상승 — 바뀐 신발이 없으면 **원본 배열을 그대로** 돌려줘 재렌더를 만들지 않는다.
    setShoes(prev=>{
      let changed=false;
      const next=prev.map(sh=>{
        const r=raiseHighWater(sh,runs as any);
        if(r===sh) return sh;
        changed=true;
        return stampUpdatedAt(r);
      });
      return changed?next:prev;
    });
  },[bootState,shoes,runs]);

  // 부팅 폴백 캐시(cache_shoes_v1/cache_runs_v1) 상시 갱신(디바운스). 기존엔 initUser 의
  // 서버 fetch 성공 직후에만 캐시를 썼다 — 그 뒤 신발/런 mutation(추가/편집/삭제/동기 화해)이
  // 캐시에 반영되지 않아, 오프라인 재부팅 시 *마지막 fetch 시점*의 낡은 데이터만 보였다.
  // shoes/runs 가 바뀔 때마다 현재 라이브 상태를 캐시에 덮어써(800ms 디바운스로 폭주 합침)
  // 다음 오프라인 부팅이 최신 데이터로 'ready' 되게 한다. 'ready' 일 때만 써, 부팅 'loading'
  // 의 빈 초기상태가 멀쩡한 캐시를 지우지 않게 한다(쓰기 실패는 비차단 — 부팅 영향 0).
  useEffect(()=>{
    if(bootState!=='ready') return;
    const t=setTimeout(()=>{
      (async()=>{
        try{
          await writeBootCache(shoes as any[],runs as any[]);
          reportStorageResult(true);
        }catch(e){
          reportStorageResult(false);
          // 다음 mutation 에서 재시도되지만, 저장 공간 부족이면 계속 실패해 캐시가 조용히
          // 낡는다 — 오프라인으로 열었을 때 며칠 전 상태가 '현재'로 보이는 원인. 원격 계측 필수.
          recordError(e,'storage: boot cache write (debounced)');
        }
      })();
    },800);
    return ()=>clearTimeout(t);
  },[shoes,runs,bootState]);

  // 포그라운드 진입 시 띄울 알림 계산/표시 함수의 최신 클로저를 담는 ref. 아래 render 에서
  // 신발 forecast·weekly·lastRun·settings 가 모두 준비된 뒤 갱신한다(AppState 리스너는
  // 1회만 구독하므로 stale 클로저를 피하려 ref 로 우회한다).
  const presentDueRef=useRef<(()=>void)|null>(null);
  // 백그라운드 → 포그라운드(active) 전환 시 dueNotifications 를 계산해 presentDue 로 표시한다
  // (slice-8-notif-ui 배선). 최초 마운트(이미 active)에는 'change' 가 안 와 중복 표시되지
  // 않고, 기존 온보딩/부트·런 등록 흐름과 독립적으로 동작한다(비차단·기존 흐름 보존).
  useEffect(()=>{
    const sub=AppState.addEventListener('change',(next)=>{
      if(next==='active')presentDueRef.current?.();
    });
    return ()=>sub.remove();
  },[]);

  // audit a4: 앱측 FCM 배선(부팅 직후 1회). silent:true(심사 #3, 2026-07-22) — 부팅에서는
  // OS 권한 다이얼로그를 절대 띄우지 않고, 이미 허용된 경우에만 토큰을 취득한다. 실제 권한
  // 요청은 '첫 러닝 리캡을 닫는 순간'의 프라이밍(아래 maybePrimePush)으로 이연 — 가치를 본
  // 뒤에 묻는다(온보딩 첫 60초에 시스템 다이얼로그 난입 금지). 나머지 규약은 기존과 동일:
  // 전 과정 try/catch 비차단, 포그라운드 FCM 수신 시 dueNotifications 표시, 언마운트 해제.
  useEffect(()=>{
    let wiring:PushWiring|null=null;
    let cancelled=false;
    void (async()=>{
      try{
        const w=await setupPushMessaging({
          silent:true,
          onForegroundMessage:()=>{presentDueRef.current?.();},
        });
        if(cancelled){w.unsubscribeForeground();w.unsubscribeTokenRefresh();}
        else wiring=w;
      }catch(e){reportIssue('push wiring',e);} // 비차단(이중 방어)
    })();
    return ()=>{
      cancelled=true;
      try{wiring?.unsubscribeForeground();wiring?.unsubscribeTokenRefresh();}catch{/* no-op */}
    };
  },[]);

  // 알림 권한 프라이밍(심사 #3) — 첫 러닝 리캡을 '닫는 순간' 1회. 가치를 본 직후가 가장
  // 설득력 있는 타이밍이다. shouldPrime 이 NOT_DETERMINED + 미프라이밍일 때만 true 라
  // 사실상 최초 1회만 뜨고, '나중에'를 골라도 마킹해 다시 조르지 않는다(설정 토글 경로 유지).
  const maybePrimePush=useCallback(()=>{
    void (async()=>{
      try{
        if(!(await shouldPrimePushPermission()))return;
        await markPushPrimed();
        showDialog(
          '알림을 켤까요?',
          '정해둔 시각에 러닝 리마인더를 보내드려요. 러닝화 교체 시기·주간 목표는 앱을 열 때 안내해요. 광고성 알림은 보내지 않아요.',
          [
            {text:'나중에',style:'cancel'},
            {text:'알림 받기',onPress:()=>{void primePushPermission();}},
          ],
        );
      }catch{/* 비차단 — 프라이밍 실패가 리캡 닫힘을 막지 않는다 */}
    })();
  },[]);

  // 런별 노면 태그(surface_<runId>) 일괄 로드 → 실효 마모/예측 보정에 반영. runs가 바뀔
  // 때마다 **한 번의 getMany** 로 읽고, 손상/실패/미태그는 road로 graceful 폴백한다(차단 아님).
  //
  // 2026-08-04 QA 감사 Q-4: 여기 주석은 원래도 "multiGet 으로 한 번에"라고 적혀 있었는데
  // 코드는 `Promise.all(ids.map(getItem))` — **런 수만큼의 개별 브리지 왕복**이었다. 이 effect 는
  // runs 가 바뀔 때마다(동기 1회·런 추가/편집/삭제·워치 런 수신) 전량이 다시 도는 자리라,
  // 런 1000건이면 한 번에 1000 왕복이 나갔다. 같은 저장소 래퍼의 배치 API 를 다른 곳에선
  // 이미 쓰고 있었다(runPersistence·bootCache) — 여기만 빠져 있었다.
  useEffect(()=>{
    let alive=true;
    const ids=runs.map(r=>String(r.id)).filter(Boolean);
    if(ids.length===0){setRunSurfaces({});return;}
    (async()=>{
      try{
        const got=await AsyncStorage.getMany(ids.map(id=>'surface_'+id));
        if(!alive)return;
        const map:Record<string,Surface>={};
        for(const id of ids){const v=got['surface_'+id];if(v!=null) map[id]=parseSurface(v);}
        setRunSurfaces(map);
      }catch{/* 손상/실패는 무시 — 전부 road로 동작 */}
    })();
    return()=>{alive=false;};
  },[runs]);

  // audit#2: 미완료 런 감지 → 복구/저장 프롬프트. 한 번만 묻는다.
  //
  // **게이트를 통과한 뒤에 묻는다**(2026-08-04 QA 감사 Q-5). 예전엔 deps [] 로 마운트 즉시
  // 돌아서, DialogHost 가 루트에 있는 탓에 **로그인 화면·부팅 스켈레톤 위로** 이 다이얼로그가
  // 떴다. 알림에는 이미 같은 가드를 넣어 뒀는데(presentDueRef — "로그인 화면 위로 알림이 뜬다",
  // 2026-07-30 Android 실측) 이쪽엔 빠져 있었다. 게다가 이쪽이 더 나쁘다 — 알림은 정보만
  // 주지만 이건 **선택을 요구**하고, 그 선택이 세우는 overlay==='run' 은 렌더 사다리에서
  // 인증·부팅 게이트보다 아래라 즉시 반영되지도 않는다.
  const resumeAskedRef=useRef(false);
  useEffect(()=>{
    if(!authUser?.uid||bootState!=='ready') return;
    if(resumeAskedRef.current) return;
    (async()=>{
      const snap=await loadSnapshot();
      if(resumeAskedRef.current||!isResumable(snap)||!snap) return;
      resumeAskedRef.current=true;
      // 트랙 런이면 거리는 랩수×확정랩거리(GPS 누적 아님) — 안내·복구에 이 값을 쓴다.
      const dispKm=snap.track?(snap.track.lapTimes.length*snap.track.lapM)/1000:snap.dist;
      const trackLapM=snap.track?.lapM;
      showDialog(
        '완료하지 않은 러닝이 있어요',
        `${dispKm.toFixed(2)}km${snap.track?` · ${snap.track.lapTimes.length}랩`:''} · ${fmtTime(snap.elapsed)} 기록이 남아 있어요.\n이어서 달릴까요, 여기까지 저장할까요?`,
        [
          {text:'버리기',style:'destructive',onPress:()=>{void clearSnapshot();}},
          {text:'기록 저장',onPress:()=>{
            setActiveRun({id:snap.shoe.id,name:snap.shoe.name,goalKm:snap.goalKm,goalMin:snap.goalMin??0,pacePlan:snap.pacePlan??[],targetZone:0,trackLapM});
            setResumeMode('review');
            setResumeSnap(snap);
            setOverlay('run');
          }},
          {text:'이어 달리기',onPress:()=>{
            // GPS/센서를 다시 켜고 누적 거리·경과시간을 시드해 계속 달린다(엔진 seed*).
            setActiveRun({id:snap.shoe.id,name:snap.shoe.name,goalKm:snap.goalKm,goalMin:snap.goalMin??0,pacePlan:snap.pacePlan??[],targetZone:0,trackLapM});
            setResumeMode('continue');
            setResumeSnap(snap);
            setOverlay('run');
          }},
        ],
      );
    })();
  },[authUser?.uid,bootState]);

  async function initUser(){
    // 재시도(재진입) 시 스켈레톤으로 되돌려 직전 에러 카드를 치운다.
    setBootState('loading');
    try{
    let did=await AsyncStorage.getItem('device_id');
    if(!did){did='sl_'+Date.now()+'_'+Math.random().toString(36).slice(2,11);await AsyncStorage.setItem('device_id',did);}
    // 서버 시계 보정값 복원(AUDIT 3 D-2) — 이후 모든 레코드 스탬프가 이 값을 쓴다.
    // 실패해도 보정 없이(offset 0) 예전과 똑같이 동작한다.
    await loadClockOffset();
    // audit a1: 로컬 스토리지 스키마 마이그레이션(1회). 이전 빌드의 캐시 신발/런 레코드엔
    // updatedAt 이 없어 클라우드 '최신 우선' 머지가 무력했다 — 부재 레코드에 updatedAt 을
    // 시드한다. 멱등·비파괴이며, 실패해도 내부에서 스킵+로그하므로 부팅을 막지 않는다.
    await migrateStorageSchema();
    // 1회성 플래그(온보딩/권한 priming) 복원. 네트워크와 무관하므로 fetch try 밖에서
    // 먼저 읽어, 콜드 백엔드라도 첫 실행 안내가 정상 동작하게 한다.
    const [onbRaw,primeRaw]=await Promise.all([
      AsyncStorage.getItem(ONBOARD_KEY),
      AsyncStorage.getItem(LOC_PRIME_KEY),
    ]);
    setOnboarded(!!onbRaw);
    setLocPrimed(!!primeRaw);
    // 설정 복원은 네트워크와 무관하므로 fetch try 밖에서 먼저 읽는다(오프라인에서도
    // 단위/목표/알림이 사용자가 마지막에 정한 값으로 뜬다). 알림 판정에 갓 읽은
    // alerts 설정을 직접 넘긴다(setAlerts state 갱신 전이라 클로저가 옛값일 수 있음).
    const st=await loadSettings();
    setUnit(st.unit);setGoalWeeklyKm(st.goalWeeklyKm);setAlerts(st.alerts);setWeightKg(st.weightKg);
    setAge(st.age);setSex(st.sex);setRestHR(st.restHR);
    // 설정 수정 시각 복원 — 클라우드 병합 LWW 판정 기준(ref 는 동기 왕복 중에도 최신).
    const stTs=await loadSettingsUpdatedAt();
    settingsTsRef.current=stTs;setSettingsTs(stTs);
    // Stage 3(Firestore 정본 부팅): 로컬 캐시로 즉시 'ready'. 원격 복원은 runCloudSync
    // effect(authUser.uid)가 pull→merge→push 로 수행한다 — 재설치/기기변경 데이터 복구 포함.
    // REST 콜드대기/에러 카드가 사라진다(부팅은 로컬 캐시 로드라 실패하지 않는다). 첫 실행/
    // 캐시 없음은 빈 상태로 'ready'(온보딩). 레거시 미동기 큐가 남아 있으면 오버레이해 보존한다
    // (다음 cloudSync 가 Firestore 로 올린다).
    const bootCache=await loadBootCache();
    let pending:any[]=[];
    // 침묵 catch 금지(감사 #50 인접): 펜딩 런 로드 실패는 데이터 유실 신호일 수 있어
    // Crashlytics 비치명으로 남긴다(recordError 는 graceful — 부팅은 계속 진행).
    try{pending=await loadPendingRuns();}catch(e){recordError(e,'boot loadPendingRuns 실패 — 펜딩 큐 없이 진행');}
    let liveShoes:any[]=bootCache?bootCache.shoes:[];
    let liveRuns:any[]=overlayPendingRuns(bootCache?bootCache.runs:[],pending);
    // 개발 전용 데모 시드(디자인/에뮬 검증용 로컬 목). 운영 안전 3중 게이트:
    //   ① __DEV__  ② NODE_ENV!=='test'  ③ 빈 신발(실데이터 안 덮음).
    if(__DEV__ && process.env.NODE_ENV!=='test' && liveShoes.length===0 && (globalThis as any).__KEEGO_DEV_SEED__!==false){
      liveShoes=devSeedShoes();liveRuns=devSeedRuns();
      // setMany — 두 키를 한 번의 브리지 왕복으로. 실패는 계측한다(무음 금지).
      try{await AsyncStorage.setMany({[CACHE_SHOES_KEY]:JSON.stringify(liveShoes),[CACHE_RUNS_KEY]:JSON.stringify(liveRuns)});reportStorageResult(true);}catch(e){recordError(e,'storage: cache write after sync');reportStorageResult(false);}
    }
    // 묘비(삭제) 필터(#4): 부팅캐시는 800ms 디바운스라, 삭제 직후 강제종료/크래시되면 캐시엔
    // 아직 삭제된 레코드가 남아 있을 수 있다. 삭제 시 *동기적으로* 영속되는 묘비(tombstones_v1)로
    // 부팅 라이브를 한 번 걸러, 삭제가 부팅에서 부활하지 않게 한다. overlayPendingRuns 로 되살아난
    // 레거시 펜딩 런도 묘비면 함께 걸러진다(#5 부활 차단). 묘비 자체는 보존돼 cloudSync 가 전파한다.
    try{
      const traw=await AsyncStorage.getItem(K_TOMBSTONES);
      const tp=JSON.parse(traw||'{}');
      if(tp&&typeof tp==='object'){
        const tShoes=new Set((Array.isArray(tp.shoes)?tp.shoes:[]).map((s:any)=>String(s?.id)));
        const tRuns=new Set((Array.isArray(tp.runs)?tp.runs:[]).map((r:any)=>String(r?.id)));
        if(tShoes.size) liveShoes=liveShoes.filter((s:any)=>!tShoes.has(String(s?.id)));
        if(tRuns.size) liveRuns=liveRuns.filter((r:any)=>!tRuns.has(String(r?.id)));
      }
    }catch{/* 묘비 손상/부재는 무시 — 필터 없이 진행 */}
    setShoes(liveShoes);setRuns(liveRuns);
    setBootState('ready');
    checkShoeAlerts(liveShoes,liveRuns,st.alerts);
    }catch(e){
      // 부팅 초기화 실패(스토리지 손상/네이티브 결측 등) — 무한 스켈레톤 대신 재시도
      // 카드로 보낸다(2026-07-05: setBootState('error')가 한 번도 안 불려 BootError 가
      // 죽은 코드였고, throw 시 'loading'에 영구 고착됐다). 재시도는 initUser 재진입.
      reportIssue('initUser boot',e);
      setBootState('error');
    }
  }

  // 당겨서 새로고침(RefreshControl) 진입점 — Home/History 가 호출한다. Stage 3(Firestore 정본):
  // 클라우드 동기(pull→merge→push)를 재호출한다. 미로그인이면 runCloudSync 가 no-op. lastSyncAt
  // 칩은 runCloudSync 가 갱신한다. 실패는 던지지 않고 조용히 무시(스피너만 내림 — 비차단).
  async function refreshData(){
    // 사용자가 직접 당긴 새로고침은 최소 간격을 무시한다(AUDIT 2 I-2) — 명시적 요청에
    // 아무 일도 안 일어나면 고장 난 것으로 보인다.
    try{await runCloudSyncRef.current({force:true});}catch{/* 오프라인/실패 — 화면 데이터 유지(비차단) */}
  }

  async function addShoe(name:string,maxKm:number,startKm:number,date:string,priceKrw?:number){
    // Stage 2: 신발 생성은 Firestore 정본. 로그인(authUser)만 있으면 클라이언트 id 로 즉시
    // 로컬 생성(로컬-퍼스트) — 서버 왕복 없이 바로 화면 반영. 영속은 부팅캐시 + cloudSync
    // (디바운스 push)가 담당한다(REST 의존 제거). 로그인 게이트가 이미 막지만 방어적 가드 유지.
    if(!authUser?.uid){
      showDialog('로그인이 필요해요','신발을 추가하려면 먼저 로그인해 주세요.');
      return;
    }
    // 첫 신발 등록 = 활성화 지표(심사 B-12). 리텐션의 분기점이라 '첫 켤레'만 남긴다.
    // (등록 경로 구분은 아직 없다 — 온보딩·메인 모두 이 함수를 지난다.)
    if(shoes.filter(sh=>!isRetired(sh)).length===0){trackFirstShoeAdded('picker');}
    // 클라이언트 id + updatedAt 스탬프(머지 '최신 우선'). max_km/start_km/purchase_date 만
    // 채우고 나머지(total_km/run_time)는 런에서 파생(서버 truth 부재 시 폴백).
    // price_krw 는 입력했을 때만 싣는다(0/NaN 을 '0원에 샀다'로 오해하지 않게 — 결측과
    // 0원은 다르다). 원/km 는 값이 있을 때만 계산된다.
    const priceOk=typeof priceKrw==='number'&&isFinite(priceKrw)&&priceKrw>0;
    const create=()=>{
      const newShoe=stampUpdatedAt({
        id:genShoeId(),name,max_km:clampMaxKm(maxKm),start_km:startKm,purchase_date:date,
        ...(priceOk?{price_krw:Math.round(priceKrw as number)}:{}),
      } as BackendShoe);
      setShoes(prev=>[newShoe,...prev]);
    };
    // 중복 등록 확인 한 겹(2026-08-04 QA 감사 Q-8). 예전엔 아무 방어가 없어 같은 신발을
    // 몇 번이든 등록할 수 있었고, 등록 뒤엔 화면이 이름만 보여줘 **구분할 방법이 없었다** —
    // 어느 쪽에 기록을 붙이는지 모른 채 두 켤레의 수명이 동시에 틀어진다.
    // 막지는 않는다: 같은 모델을 진짜 두 켤레 쓰는 사람이 있다(로테이션이 이 앱의 차별점이다).
    // 차단이 아니라 확인이 맞다. 보관한 신발은 세지 않는다(이미 목록에서 빠져 있다).
    const dup=shoes.find(s=>!isRetired(s)&&String(s.name||'').trim().toLowerCase()===name.trim().toLowerCase());
    if(dup){
      showDialog('이미 등록한 러닝화예요',`'${name}'는 이미 목록에 있어요.\n같은 모델을 두 켤레 쓰신다면 그대로 추가하세요.`,[
        {text:'취소',style:'cancel'},
        {text:'그대로 추가',onPress:create},
      ]);
      return;
    }
    create();
  }

  async function updateShoeName(id:string,name:string){
    // Stage 2: 로컬 상태만 갱신(Firestore 정본 — cloudSync 가 push). stampUpdatedAt 으로
    // 머지 '최신 우선'이 이 변경을 이긴다.
    setShoes(prev=>prev.map(s=>s.id===id?stampUpdatedAt({...s,name}):s));
  }

  // 신발별 수명(max_km) 조정 — 신발별 교체 임계의 분모. clampMaxKm로 범위를 보정한
  // 뒤 낙관적으로 상태를 갱신(즉시 배지/링 반영)하고 백엔드에 PATCH한다. 수명을 올려
  // 임계 아래로 내려간 신발은 다음 checkShoeAlerts에서 추적 집합에서 빠진다.
  async function updateShoeMaxKm(id:string,maxKm:number){
    const v=clampMaxKm(maxKm);
    // Stage 2: 로컬 상태만(Firestore 정본). 낙관적 갱신 + stampUpdatedAt(머지 최신 우선).
    setShoes(prev=>prev.map(s=>s.id===id?stampUpdatedAt({...s,max_km:v}):s));
  }

  // audit a2: 묘비 저장소 영속(비차단). 실패해도 메모리 상태는 갱신돼 동기로 전파된다.
  const persistTombstones=(t:{shoes:BackendShoe[];runs:BackendRun[]})=>{
    try{void AsyncStorage.setItem(K_TOMBSTONES,JSON.stringify(t));}catch(e){reportIssue('storage: tombstone persist',e);}
  };
  // 한 레코드를 묘비(markDeleted: deleted+updatedAt)로 만들어 해당 묶음 저장소에 더한다.
  // 같은 id 의 옛 묘비는 교체해(중복 방지) 최신 updatedAt 만 남긴다. 라이브 배열에선 이미
  // 제거됐으므로 한 id 가 live·묘비에 동시에 있지 않는다(자기충돌 부활 없음).
  const addShoeTombstone=(rec:BackendShoe)=>{
    setTombstones(prev=>{
      const next={...prev,shoes:[...prev.shoes.filter(s=>String(s.id)!==String(rec.id)),markDeleted(rec)]};
      persistTombstones(next);
      return next;
    });
  };
  const addRunTombstone=(rec:BackendRun)=>{
    setTombstones(prev=>{
      const next={...prev,runs:[...prev.runs.filter(r=>String(r.id)!==String(rec.id)),markDeleted(rec)]};
      persistTombstones(next);
      return next;
    });
  };

  // ── 삭제 확인 정책(2026-07-25 민우님 확정) ──────────────────────────────────────
  // '실행취소' 토스트 액션은 전면 폐지 — 보호막은 삭제 전 확인 다이얼로그 1겹으로 단일화.
  // 삭제는 여전히 묘비(soft-delete)라 데이터 파괴는 아니다(사고 시 개발자 복구 여지 유지).
  // 구 완전복원 기계(RunUndo 스냅샷·restoreRun/restoreShoe)는 소비처가 사라져 함께 제거.

  // 신발 삭제는 더 이상 런 기록을 동반삭제하지 않는다(iron law: 데이터 파괴 금지).
  // 런은 보존되어 기록/통계에 남고, 신발만 잠금장(locker)에서 제거된다. 신발을
  // 영구히 지우는 대신 보존이 목적이면 retireShoe(보관)를 쓴다.
  // Stage 2: 삭제는 로컬 제거 + 묘비(soft-delete)로 표현한다. 묘비는 cloudSync 로 전파되어
  // Firestore 백업 머지가 다른 기기의 옛 라이브 신발로 삭제를 되돌리지 못하게 한다(부활 방지).
  async function deleteShoe(id:string){
    // 로컬-퍼스트 삭제: 로컬에서 제거 + 묘비(되돌아오지 않게). 묘비가 다음 동기/부팅 머지에서
    // 잔존 레코드를 이긴다(재등장 방지). 영속은 cloudSync(묘비는 backupData 에 합류) 담당.
    const target=shoes.find(s=>s.id===id);
    setShoes(prev=>prev.filter(s=>s.id!==id));
    addShoeTombstone(target??({id} as BackendShoe));
    if(target)showToast({message:'신발 삭제됨'});
  }

  // 보관(retire/archive): 신발을 선택목록·홈 picker에서 숨기되 신발과 런 기록은
  // 모두 보존한다. retired 토글이므로 복원도 가능하다.
  async function retireShoe(id:string,retired:boolean){
    // Stage 2: 로컬 상태(retired 토글)만 갱신(Firestore 정본). stampUpdatedAt 으로 이 변경이
    // 머지에서 옛 값을 이긴다. 영속은 cloudSync 담당.
    setShoes(prev=>prev.map(s=>s.id===id?stampUpdatedAt({...s,retired}):s));
  }


  // 완주 런 저장(Stage 2b · Firestore 정본): 로컬 우선 + cloudSync push. REST POST/큐 제거.
  //   1) 사이드키(route_/time_) 영속 + 캐시에 즉시 durable 기록(크래시-세이프티) — 네트워크 무관.
  //   2) 낙관적 setRuns. 영속/동기는 부팅캐시 + cloudSync(Firestore)가 담당한다.
  // localId(genRunId)가 런의 영구 id다 — 서버 재키잉이 없으므로 머지 키가 안정적이다.
  async function addRun(shoeId:string,km:number,date:string,memo:string,source:string,duration?:number,cadence?:number,route?:string,location?:string,heart_rate?:number,elevationM?:number,calories?:number){
    const timeStr=nowTimeLabel();
    const stampedAt=syncNowMs(); // AUDIT 3 D-2 — 서버 보정 시계(병합 LWW 기준)
    const localId=genRunId(stampedAt);
    // 완주 런 레코드 — 모든 필드(source/location/heart_rate 포함)를 담아 Firestore 정본에
    // 유실 없이 올린다(이전엔 일부 필드가 REST 왕복으로만 보존됐다). updatedAt 으로 머지 최신 우선.
    const record:BackendRun={
      id:localId, shoe_id:shoeId, km, run_date:date, memo:memo||'', source,
      duration:duration||0, cadence:cadence||0, route:route||'', location:location||'',
      heart_rate:heart_rate||0, elevation_m:elevationM||0, calories:calories||0,
      run_time:timeStr, updatedAt:stampedAt,
    };
    // ── 1) 로컬 우선 영속화(크래시-세이프티) — 사이드키 + 캐시 즉시 durable 기록 ──
    // 사이드키(route/time)는 보조 데이터다 — setItem 이 실패해도 삼켜서 런 자체(캐시+상태)는
    // 반드시 남긴다(예전엔 여기서 throw 하면 persistRunToCache·setRuns 에 못 가 완주 기록이
    // 통째로 유실되고 저장 화면엔 아무 안내도 없었다 — 감사 발견).
    // 사이드키 실패를 **삼키기만 하면 경로가 로컬에서 통째로 사라진다**(F-08 이후 캐시는
    // 경로를 빼고 저장하므로, 사이드키가 없으면 남는 사본이 없다 — 디스크 만석 등에서 실재).
    // 실패를 관측해 그때만 캐시에 경로를 남긴다(무거워지지만 유실보다 낫다).
    // 다음 디바운스 캐시 쓰기의 ensureRouteSidecars 가 사이드키를 다시 시도해 정상화한다.
    let routeSidecarOk=true;
    try{
      if(route) await AsyncStorage.setItem('route_'+localId, route);
      await AsyncStorage.setItem('time_'+localId, timeStr);
    }catch(e){
      routeSidecarOk=false;
      recordError(e,'storage: run sidecar write');
    }
    await persistRunToCache(record,{keepRoute:!!route&&!routeSidecarOk});
    // ── 2) 낙관적 상태 반영(영속은 cloudSync 가 Firestore 로 push) ──
    setRuns(prev=>[record,...prev]);
    // 노면 태그(선택)는 호출부가 localId로 영속하므로 생성된 localId를 돌려준다.
    return localId;
  }

  // 수동 런 입력(앱 외 주행·잔존 마일리지 보정): source='manual'로 addRun을 재사용한다.
  // 로컬 우선 + 낙관적 삽입 동선을 그대로 타므로 신발 km(shoeHealth)이 즉시 반영되고
  // 영속은 cloudSync 가 담당한다. route/cadence는 비운다(GPS 미동반).
  async function addManualRun(shoeId:string,km:number,date:string,durationSec:number,surface?:Surface){
    const localId=await addRun(shoeId,km,date,'','manual',durationSec);
    // 노면 태그(선택)는 새 런 id가 생긴 뒤 영속한다. road(기본)는 키를 만들지 않는다(잡음 0).
    if(localId&&surface&&surface!=='road') await setRunSurface(localId,surface);
  }

  // 개별 런 편집(Stage 2b · Firestore 정본). 낙관적으로 runs 상태를 갱신 → toUiShoe가
  // runs에서 shoeHealth를 파생하므로 신발 수명은 자동 재계산된다(별도 신발 변경 불필요).
  // fields는 컬럼명(shoe_id/km/run_date/duration). stampUpdatedAt 으로 머지 최신 우선,
  // 영속은 캐시 + cloudSync(Firestore push)가 담당한다(REST PATCH 제거).
  async function editRun(id:string,fields:{shoe_id?:string;km?:number;run_date?:string;duration?:number}){
    const sid=String(id);
    const editedAt=syncNowMs(); // AUDIT 3 D-2
    setRuns(prev=>prev.map(r=>String(r.id)===sid?stampUpdatedAt({...r,...fields},editedAt):r));
    // 부팅캐시 즉시 갱신(#9): 캐시는 800ms 디바운스라 편집 후 그 안에 종료/크래시되면 편집이
    // 유실(옛 값으로 부팅)된다. persistRunToCache 는 id 로 upsert(교체)하므로 편집본을 즉시 durable
    // 하게 박아 둔다(addRun 과 같은 크래시-세이프티 패턴). 영속/동기는 이후 cloudSync 가 담당.
    const target=runs.find(r=>String(r.id)===sid);
    if(target) await persistRunToCache(stampUpdatedAt({...target,...fields},editedAt));
  }

  // 러닝 메모/사진 저장(리캡 — 2026-07-05). 메모는 런 레코드 필드로(동기됨),
  // 사진은 로컬 사이드카 runphoto_<id>(URI 문자열 — 기기 로컬 전용, 결측 graceful).
  async function saveRunMeta(id:string,meta:{memo?:string;photoUri?:string|null}){
    const sid=String(id);
    if(meta.photoUri!==undefined){
      try{
        if(meta.photoUri)await AsyncStorage.setItem('runphoto_'+sid,meta.photoUri);
        else await AsyncStorage.removeItem('runphoto_'+sid);
      }catch(e){reportIssue('storage: run photo persist',e);}
    }
    if(meta.memo!==undefined){
      const memo=meta.memo.trim();
      const editedAt=syncNowMs(); // AUDIT 3 D-2
      setRuns(prev=>prev.map(r=>String(r.id)===sid?stampUpdatedAt({...r,memo},editedAt):r));
      const target=runs.find(r=>String(r.id)===sid);
      if(target)await persistRunToCache(stampUpdatedAt({...target,memo},editedAt));
    }
  }

  // 개별 런 삭제(백엔드 DELETE). 삭제 확인 Alert는 화면(HistoryScreen)이 띄운다.
  // runs에서 제거하면 shoeHealth가 줄어 신발 사용거리도 자동 감소한다(파생값). 미동기
  // 런은 서버에 없으므로 네트워크 없이 로컬에서만 제거하고, 동기된 런은 서버 삭제 성공
  // 후 제거한다(실패 시 보존). route_/time_ 로컬키도 함께 정리해 누수를 막는다.
  // audit a2: 라이브 배열에서 빼는 동시에 묘비를 남긴다. 미동기(_pending) 런도 자동 동기가
  // backupData(라이브 런 포함)를 이미 Firestore 에 올렸을 수 있으므로 똑같이 묘비를 남겨,
  // 어느 경로로든 클라우드에 올라간 런이 다른 기기 머지로 부활하지 않게 한다.
  // 개별 런 삭제(Stage 2b · 로컬-퍼스트). runs에서 제거하면 shoeHealth가 줄어 신발 사용거리도
  // 자동 감소한다(파생값). 라이브에서 빼는 동시에 묘비를 남겨, 어느 경로로든 클라우드(Firestore)에
  // 올라간 런이 다른 기기 머지로 부활하지 않게 한다. 모든 사이드키(route_/time_/surface_/splits_/
  // paceTrack_/hrTrack_/gapTrack_)를 정리하고, 실행취소 스냅샷에도 담아 완전복원한다.
  async function deleteRun(id:string){
    const sid=String(id);
    const target=runs.find(r=>String(r.id)===sid);
    // 레거시 미동기 큐(pending)에 같은 런이 남아 있으면 큐에서도 제거한다(#5). 안 그러면 다음
    // 부팅 overlayPendingRuns 로 되살아난다(묘비 필터가 표시를 막아도 큐 항목이 영구 누수).
    try{
      const q=await loadPendingRuns();
      if(q.some(p=>String(p.localId)===sid)) await removePendingRun(sid);
    }catch{/* 큐 접근 실패는 삭제를 막지 않는다 */}
    // 로컬-퍼스트 삭제: 라이브 제거 + 묘비(cloudSync 전파) + 사이드키 정리. 영속은 cloudSync 담당.
    setRuns(prev=>prev.filter(r=>String(r.id)!==sid));
    if(target)addRunTombstone(target);
    // AUDIT 3 D-4: 삭제는 **정당한 감소**다 — 그만큼 최고수위도 함께 내린다.
    // 안 내리면 다음 계산에서 '설명되지 않는 감소'로 잡혀 지울 때마다 경고가 뜬다.
    if(target){
      const delKm=typeof target.km==='number'?target.km:parseFloat(String(target.km));
      const shoeId=String(target.shoe_id??'');
      if(Number.isFinite(delKm)&&delKm>0&&shoeId){
        setShoes(prev=>prev.map(sh=>{
          if(String(sh.id)!==shoeId) return sh;
          const next=lowerHighWater(sh,delKm);
          return next===sh?sh:stampUpdatedAt(next);
        }));
      }
    }
    // 부팅캐시에서도 즉시 제거(묘비 필터와 별개로 캐시 자체를 깔끔히 — 800ms 디바운스 의존 제거).
    await persistRunCacheRemove(sid);
    await AsyncStorage.removeItem('route_'+sid);
    await AsyncStorage.removeItem('time_'+sid);
    await AsyncStorage.removeItem('surface_'+sid);
    await AsyncStorage.removeItem('splits_'+sid);
    // 곡선 시계열 사이드키(페이스/심박/GAP)도 정리 — 없으면 삭제된 런의 시계열이 영구 누수된다.
    await AsyncStorage.removeItem('paceTrack_'+sid);
    await AsyncStorage.removeItem('hrTrack_'+sid);
    await AsyncStorage.removeItem('gapTrack_'+sid);
    // 오늘의 한 컷 사이드카(2026-07-05 추가)도 정리 — 없으면 삭제된 런의 사진 URI 가 영구 고아.
    await AsyncStorage.removeItem('runphoto_'+sid);
    // AUDIT 3 D-3 — **클라우드 상세도 지운다.** 예전엔 로컬만 지우고 서버의 GPS 경로·심박·
    // 스플릿은 그대로 뒀다(삭제 API 자체가 없었다). 탈퇴하지 않는 한 영구히 남았다.
    // 실패해도 삭제 흐름을 막지 않되 **큐에 적어 다음 스윕에서 재시도**한다 — 오프라인·
    // 미로그인에서 지운 런의 경로가 영영 안 지워지는 것을 막는 유일한 장치다(D-5의 마커
    // 정리도 큐가 함께 처리한다).
    try{
      const port=cloudPortRef.current;
      // 오프라인에서는 Firestore 쓰기가 **거절되지 않고 그냥 안 끝난다**(서버 ack 까지 pending).
      // 예전엔 여기서 영원히 멈춰 아래 '삭제됨' 토스트도, 마커 정리도 오지 않았다(Q-2 동류).
      // 제한 시간을 두고, 못 끝내면 재시도 큐에 남긴다 — 그 큐가 원래 이 상황을 위한 것이다.
      if(port.deleteRunDetail) await withTimeout(port.deleteRunDetail(sid),DETAIL_DELETE_TIMEOUT_MS,'런 상세 삭제');
      else await enqueueDetailDeletion(sid);
      await AsyncStorage.removeMany(['detail_pushed_'+sid,'detail_absent_'+sid]);
    }catch(e){
      reportIssue('cloud runDetail 삭제 실패 — 큐에 남겨 재시도',e);
      await enqueueDetailDeletion(sid);
    }
    if(target)showToast({message:'러닝 기록 삭제됨'});
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
        // keep-going 카피는 브랜드 보이스 결정(BRAND.md — 테스트 계약 App.shoebadge)이라 유지.
        // 감사 #75 의 '얼럿 최소화'는 이중 개행 정리까지만 적용(HIG 와 브랜드 보이스의 절충).
        // % 는 '남은 수명' 방향으로 말한다(표기 통일 2026-07-26) — 임계값 자체는 사용률 그대로.
        showDialog('신발 교체 알림',names.join(', ')+`\n수명이 ${Math.max(0,100-alertCfg.thresholdPct)}% 남았어요. 이제 다음 러닝화를 준비해볼까요?`,[{text:'확인'}]);
      }
    }catch(e){reportIssue('shoe replacement alerts',e);}
  }

  // ── 설정 변경(영속 + 상태 갱신) — ProfileScreen 설정 행이 호출 ──────────────
  // 각 setter는 즉시 setState로 화면을 갱신하고 saveX로 AsyncStorage에 영속한다.
  // bumpSettingsTs: 사용자가 설정을 바꿀 때마다 수정 시각을 올린다 — 클라우드 병합
  // last-write-wins + 동기 왕복 중 편집 클로버 가드(applyBackupPayload)의 판정 기준.
  const bumpSettingsTs=()=>{
    const ts=syncNowMs(); // AUDIT 3 D-2 — 설정 LWW 도 같은 기준을 쓴다
    settingsTsRef.current=ts;setSettingsTs(ts);void saveSettingsUpdatedAt(ts);
  };
  const changeUnit=(u:Unit)=>{setUnit(u);void saveUnit(u);bumpSettingsTs();};
  const changeGoal=(km:number)=>{const v=clampGoal(km);setGoalWeeklyKm(v);void saveGoal(v);bumpSettingsTs();};
  const changeAlerts=(a:AlertSettings)=>{setAlerts(a);void saveAlerts(a);bumpSettingsTs();};
  const changeWeight=(kg:number)=>{setWeightKg(kg);void saveWeight(kg);bumpSettingsTs();};
  const changeAge=(v:number)=>{setAge(v);void saveAge(v);bumpSettingsTs();};
  const changeSex=(v:Sex)=>{setSex(v);void saveSex(v);bumpSettingsTs();};
  const changeRestHR=(v:number)=>{setRestHR(v);void saveRestHR(v);bumpSettingsTs();};
  // 푸시 알림 설정 변경: 즉시 상태 반영 + 신규 notif_settings 키에만 영속(기존 키 불변).
  const changeNotifSettings=(s:NotifSettings)=>{setNotifSettingsState(s);void setNotifSettings(s);};
  // 러닝 리마인더 OS 체인(7일 원샷) 동기 — 설정·오늘 런 여부가 바뀔 때마다 갱신한다
  // (2026-07-05 신뢰 버그 수정: 설정만 있고 앱 닫힘 상태에서 안 울리던 반쪽 제거).
  const ranTodayForReminder=useMemo(()=>{
    const today=ymdLocal(new Date());
    return runs.some((r:any)=>String(r.run_date||'').slice(0,10)===today);
  },[runs]);
  useEffect(()=>{
    ensureForegroundHandler();
    void syncRunReminder({enabled:notifSettings.runReminder,reminderTime:notifSettings.reminderTime,ranToday:ranTodayForReminder});
  },[notifSettings.runReminder,notifSettings.reminderTime,ranTodayForReminder]);

  // ── 로컬 백업/복원(Slice 4) ─────────────────────────────────────────────────
  // 내보내기 대상: 현재 신발+런+설정을 그대로 모은다(km 표준 settings). ProfileScreen이
  // serializeBackup→RN Share로 내보낸다.
  // audit a2: 묘비를 라이브 레코드 뒤에 합류시켜 동기(mergeCloudData)가 삭제를 전파하게 한다.
  // 라이브 배열은 묘비-free 이고 한 id 가 양쪽에 동시에 있지 않으므로 합집합이 깨끗하다.
  // AUDIT 3 D-1: 묘비는 **껍데기로, 기한 안의 것만** 싣는다. 예전엔 지운 레코드 전체가
  // 영구 보존돼 백업 문서가 단조 증가했고, 1MiB 벽에 닿으면 동기가 통째로 멎는 구조였다.
  // 신발 묘비는 name 을 남긴다 — 지난 기록의 신발 이름 표시에 실제로 쓰인다(buildNameById).
  const backupData={
    shoes:[...shoes,...compactTombstones(tombstones.shoes,Date.now(),SHOE_TOMBSTONE_KEEP)],
    runs:[...runs,...compactTombstones(tombstones.runs,Date.now())],
    // 신체지표(체중·나이·성별·안정시심박)도 포함 — 재설치·기기변경 시 심박존(Tanaka/
    // Karvonen)·칼로리·TRIMP 가 틀어지지 않게(유실 0). updated_at 은 병합 LWW 판정 기준.
    settings:{unit,goal_weekly_km:goalWeeklyKm,alerts,weight_kg:weightKg,age,sex,rest_hr:restHR,updated_at:settingsTs},
    // 진척(은퇴 신발·랭크·업적 seen)도 클라우드 백업에 포함 — 재설치/기기변경 복원(유실 0).
    ...(progState?{progression:progState}:{}),
    // 마라톤 메달도 클라우드 백업에 포함 — 재설치/기기변경에도 컬렉션 유지(동기 병합=mergeMedals).
    ...(medals.length?{medals}:{}),
  };
  // 백업 페이로드(신발+런+설정)를 현재 상태로 반영한다. 로컬 가져오기와 클라우드 동기
  // 병합 결과가 공유한다. 설정은 changeX(=saveX) 정상 경로로만 갱신해 기존 키 파괴를 막는다.
  // audit a2: 머지/백업 결과를 받을 때 묘비를 라이브에서 분리한다 — live(!deleted)는 화면
  // 상태로, 묘비는 저장소로 보내 (a) 삭제 레코드가 거리/수명 계산에 안 끼고 (b) 다음 동기에서도
  // 삭제가 계속 전파되게 한다. merged 는 id 당 1개(머지가 dedupe)라 한 id 가 live·묘비에 동시에
  // 남지 않는다 → 자기충돌 부활 없음.
  // preserveExtras(기본 true): 동기 결과를 반영하되, 동기 왕복(await) 도중 로컬에 추가/편집된
  // 레코드가 '전체 교체'로 유실되지 않게 함수형 updater 로 보존한다(reconcileLivePreservingLocal).
  // import(사용자가 명시적으로 백업으로 교체)만 false 로 호출해 그대로 교체한다.
  const applyBackupPayload=(data:BackupPayload,opts?:{preserveExtras?:boolean})=>{
    const preserve=opts?.preserveExtras!==false;
    const sPart=Array.isArray(data.shoes)?partitionTombstones(data.shoes as BackendShoe[]):null;
    const rPart=Array.isArray(data.runs)?partitionTombstones(data.runs as BackendRun[]):null;
    // 부활 방지(2026-07-05): tomb 집합에 stale merged 묘비뿐 아니라 *현재* 로컬 묘비
    // (tombstonesRef — await 중 삭제분 포함)를 합쳐 넘긴다. preserve=false(명시적 import
    // 교체)면 로컬 묘비를 무시하고 백업 그대로 반영한다.
    const liveTomb=tombstonesRef.current;
    if(sPart){
      const tomb=new Set(sPart.tombstones.map(s=>String((s as BackendShoe).id)));
      if(preserve)for(const s of liveTomb.shoes)tomb.add(String(s.id));
      setShoes(preserve?prev=>reconcileLivePreservingLocal(prev,sPart.live,tomb):sPart.live);
    }
    if(rPart){
      const tomb=new Set(rPart.tombstones.map(r=>String((r as BackendRun).id)));
      if(preserve)for(const r of liveTomb.runs)tomb.add(String(r.id));
      setRuns(preserve?prev=>reconcileLivePreservingLocal(prev,rPart.live,tomb):rPart.live);
    }
    if(sPart||rPart){
      setTombstones(prev=>{
        // 교체가 아니라 합집합(preserve): await 중 새로 만든 로컬 묘비가 stale merged
        // 묘비 목록으로 파괴되지 않게. import(preserve=false)만 그대로 교체한다.
        const next=preserve
          ?{shoes:sPart?unionTombstones(prev.shoes,sPart.tombstones):prev.shoes,
            runs:rPart?unionTombstones(prev.runs,rPart.tombstones):prev.runs}
          :{shoes:sPart?sPart.tombstones:prev.shoes,runs:rPart?rPart.tombstones:prev.runs};
        persistTombstones(next);
        return next;
      });
    }
    // 설정 복원(단위·목표·알림 + 체중·나이·성별·안정시심박) — LWW 클로버 가드(2026-07-16).
    // 병합 결과의 updated_at 이 현재(ref, 동기 왕복 중 편집 포함)보다 오래됐으면 통째로
    // 스킵한다 — 과거엔 stale 스냅샷을 무조건 change* 로 되돌려서, 동기 중 바꾼 단위가
    // 원위치되는 클로버가 있었다. 명시적 가져오기(preserveExtras=false)는 사용자 의사가
    // '백업으로 교체'이므로 가드 없이 적용하고 수정 시각을 지금으로 올린다(이후 동기에서 승리).
    // 상태 반영은 change* 가 아니라 저수준 set+save 로 — change* 는 bumpSettingsTs 를 불러
    // 복원을 '이 기기의 새 편집'으로 둔갑시키고, 그러면 다른 기기의 더 최신 편집을 이긴다.
    const st:any=data.settings||{};
    const mergedTs=settingsTsOf(st);
    const forceSettings=!preserve; // 명시적 import 교체
    if(shouldApplySettings(mergedTs,settingsTsRef.current,forceSettings)){
      const pick=pickRestorableSettings(st,{alerts});
      if(pick.unit!==undefined){setUnit(pick.unit);void saveUnit(pick.unit);}
      if(pick.goalWeeklyKm!==undefined){setGoalWeeklyKm(pick.goalWeeklyKm);void saveGoal(pick.goalWeeklyKm);}
      if(pick.alerts!==undefined){setAlerts(pick.alerts);void saveAlerts(pick.alerts);}
      if(pick.weightKg!==undefined){setWeightKg(pick.weightKg);void saveWeight(pick.weightKg);}
      if(pick.age!==undefined){setAge(pick.age);void saveAge(pick.age);}
      if(pick.sex!==undefined){setSex(pick.sex);void saveSex(pick.sex);}
      if(pick.restHR!==undefined){setRestHR(pick.restHR);void saveRestHR(pick.restHR);}
      const nextTs=nextSettingsTs(forceSettings,mergedTs,settingsTsRef.current,Date.now());
      if(nextTs>0&&nextTs!==settingsTsRef.current){
        settingsTsRef.current=nextTs;setSettingsTs(nextTs);void saveSettingsUpdatedAt(nextTs);
      }
    }
    // 진척 복원(은퇴 신발·랭크·업적 seen) — 동기 왕복(await) 중 만든 로컬 진척(은퇴·언락·
    // 포인트)을 잃지 않게 함수형 updater 로 현재 상태(prev)와 재병합한다. 과거엔 blind replace
    // (setProgState(data.progression))라, mergeCloudData 가 쓴 값이 **동기 시작 시점 스냅샷**
    // 기반이라 그 사이 은퇴한 신발/획득 업적이 통째로 사라졌다(신발/러닝/메달과 달리 보존
    // updater 가 빠져 있던 유일한 페이로드 — iron law: 은퇴 신발을 잃지 않는다).
    if(data.progression&&typeof data.progression==='object'){
      setProgState(prev=>{
        const merged=mergeProgression(prev??undefined,data.progression as ProgressionState)??(data.progression as ProgressionState);
        void saveProgression(merged);
        return merged;
      });
    }
    // 메달 복원/병합 — 동기 왕복 중 로컬 추가분을 잃지 않게 함수형 updater 로 prev 와 union
    // (신발/러닝의 reconcileLivePreservingLocal 과 같은 취지). normalizeMedals 가 검증·정렬.
    if(Array.isArray(data.medals)){
      const incoming=data.medals as unknown[];
      setMedals(prev=>{
        const merged=normalizeMedals(mergeMedals(incoming,prev));
        void saveMedals(merged);
        return merged;
      });
    }
  };
  // 클라우드 머지(pull→mergeCloudData) 결과를 받는 콜백. Stage 3(Firestore 정본): 병합 결과를
  // applyBackupPayload 로 화면/묘비에 반영하기만 하면 된다(영속은 cloudSync 의 push). REST
  // 역등록(backRegisterMerged)은 제거됨 — Firestore 가 유일 백엔드이므로 정본 합류가 곧 push 다.
  const onCloudMerged=(merged:BackupPayload)=>{
    applyBackupPayload(merged);
  };

  // ── 계정·클라우드 동기(Slice 5) ─────────────────────────────────────────────
  // firebase 구현 포트를 한 번만 만든다(getAuth/getFirestore 는 메서드 안에서 지연
  // 호출 — 생성 자체는 네이티브를 건드리지 않는다). ProfileScreen 이 이 포트로 로그인/
  // 동기를 트리거하고, 병합(cloudSync.mergeCloudData) 결과를 applyBackupPayload 로 받는다.
  // resolveGoogleCredential 주입으로 'Google로 계속' 버튼이 실제 네이티브 로그인을 탄다
  // (리졸버는 hasPlayServices→signIn→idToken→OAuth 자격증명; 실패는 정직한 에러로 전파).
  // 테스트 주입 seam(__KEEGO_CLOUD_PORT__) — devSeed 게이트와 같은 패턴. 운영 빌드엔
  // 주입이 없어(undefined) 항상 실제 firebase 포트를 쓴다. 테스트는 메모리 목 포트를 꽂아
  // pull→merge→onCloudMerged(역등록) 경로를 네이티브 없이 검증한다.
  const cloudPortRef=useRef((globalThis as any).__KEEGO_CLOUD_PORT__ ?? createFirebaseCloudPort({
    resolveGoogleCredential,
    resolveAppleCredential,
    resolveKakaoToken:resolveKakaoFirebaseToken,
    resolveNaverToken:resolveNaverFirebaseToken,
  }));

  // ── Phase 2: 앱 전역 클라우드 동기(Firestore 정본) ───────────────────────────
  // 데이터 정본을 Firestore(userBackups/{uid})로 옮기는 핵심. ProfileScreen 탭에 있지
  // 않아도 (1) 부팅/로그인 직후 1회 복원(pull→merge — 재설치·기기변경에도 데이터 복구)과
  // (2) 신발/런/설정 변경 시 디바운스 백업(push)이 항상 돈다. 무손실 양방향 병합
  // (mergeCloudData)이라 어느 쪽 레코드도 버리지 않는다. 동시 실행은 ref 락으로 막는다.
  // REST 의존은 Phase 5(task#5)에서 제거 — 이 단계는 Firestore 를 정본으로 '켜는' 것.
  const cloudSyncBusyRef=useRef(false);
  // 마지막으로 **성공한** 동기의 시각과 그때의 데이터 시그니처(AUDIT 2 I-2).
  // busy 락은 "겹치지 마라"이지 "자주 하지 마라"가 아니다 — 앱을 껐다 켜기만 반복해도
  // 전환마다 1 읽기 + 1 쓰기가 나갔다. 아래 shouldSkipCloudSync 가 그 낭비만 걷어낸다.
  const lastCloudSyncRef=useRef<{at:number;sig:string}>({at:0,sig:''});
  // 경로가 클라우드 사이드카(runDetails/{runId})에 확실히 올라간 런 id 집합. 이 런들만
  // 동기 페이로드에서 route 를 덜어낸다(stripSyncedRoutes) — 백업 문서 1MiB 상한 방어.
  // 비어 있으면 아무것도 덜어내지 않는다(안전한 기본값). 상세 스윕 뒤에 갱신된다.
  const cloudRouteIdsRef=useRef<Set<string>>(new Set());
  // 머지된 payload 로 내 월간 랭킹 엔트리를 계산·발행한다. 점수는 live 레코드 기준,
  // 표시정보(닉네임/랭크/색/장착 타이틀)는 현재 progression 파생. best-effort(throw 흡수).
  // ⚠️ 2026-07-29 감사로 **플래그 오프**. 랭킹 화면 진입점이 없는데도 닉네임·월간 거리가
  // 전원 읽기 가능한 leaderboards 컬렉션에 동의 없이 쌓이고 있었다. 발행 구현과 화면은
  // 그대로 두고 호출만 막는다 — 재개봉은 lib/featureFlags 의 플래그 하나로(1.1 예정).
  const publishMyRankingNow=async(merged:{shoes:any[];runs:any[]})=>{
    if(!LEADERBOARD_PUBLISH_ENABLED) return;
    // **동의한 사용자만 랭킹에 오른다.** AUDIT 1 의 사고가 정확히 "동의 없이 공개"였다 —
    // 플래그가 켜져도 이 가드가 없으면 같은 일이 반복된다. 공개 프로필과 같은 스위치를 쓴다.
    if(socialVisibility!=='public') return;
    try{
      const liveShoes=liveRecords(merged.shoes);
      const liveRuns=liveRecords(merged.runs);
      const view=getProgression(liveRuns,liveShoes,progState??undefined,undefined,buildContextChallenges(liveRuns,liveShoes,today()));
      const equipped=view.titles.equipped
        ? (view.titles.unlocked.find(t=>t.key===view.titles.equipped)?.name??null)
        : null;
      await publishMyRanking({
        // 「1,2,3위는 뭘 신나」 — 랭킹 행에 신발을 함께 싣는다(추가 읽기 0).
        // 공개 프로필과 **같은 출처**를 쓴다: 화면마다 다른 신발을 말하면 안 된다.
        shoes_summary:(buildPublicProfile({
          visibility:'public',
          nickname:profileName||DEFAULT_PROFILE_NAME,
          shoes:liveShoes as any,
          runs:liveRuns as any,
          nowMs:Date.now(),
        })?.activeShoes??[]).map(sh=>({brand:sh.brand,model:sh.model||sh.name,usedKm:sh.usedKm})),
        nickname:profileName||DEFAULT_PROFILE_NAME,
        rankTier:view.rank.tier,
        rankColor:view.rank.color,
        equippedTitle:equipped,
        runs:liveRuns,
        shoes:liveShoes,
        progressPoints:view.rank.xp,
        nowMs:Date.now(),
      });
    }catch(e){reportIssue('publish ranking',e);}
  };
  const runCloudSync=async(opts?:{force?:boolean})=>{
    // 부팅 캐시(로컬 신발/런)가 hydrate 되기 전에는 절대 동기하지 않는다(데이터 유실 가드).
    // Firebase auth 복원이 initUser 의 캐시 로드보다 먼저 끝나는 일이 잦은데, 그때 동기가
    // 빈 로컬(runs=[])을 remote 와 머지하면 *아직 클라우드에 안 올라간 로컬-전용 런*이 머지
    // 입력에서 빠지고, applyBackupPayload + 부팅캐시 영속이 그 런을 덮어써 영구 삭제한다.
    // bootState!=='ready' 가드가 이 레이스를 차단한다(ready 시 runs/shoes 가 같은 배치로 hydrate).
    if(cloudSyncBusyRef.current||!authUser?.uid||bootState!=='ready') return;
    // 최소 간격 가드(AUDIT 2 I-2). **로컬 데이터가 그대로일 때만** 건너뛴다 —
    // 바뀐 게 있으면 간격과 무관하게 즉시 올린다(유실 위험을 만들지 않는 게 우선이다).
    // 그래서 이 가드가 실제로 걷어내는 건 '앱 전환만 반복하는' 헛도는 동기뿐이다.
    if(shouldSkipCloudSync(opts?.force,cloudDataSig,lastCloudSyncRef.current,Date.now())) return;
    // 계정 전환 오염 차단(2026-07-31 AUDIT 1). 로컬 캐시에는 소유자 표시가 없었고,
    // 로그아웃은 신발·런 상태도 캐시도 비우지 않는다(탈퇴만 비운다). 그래서 한 기기에서
    // A 로그아웃 → B 로그인 하면 **메모리에 남은 A 의 기록이 B 계정으로 병합·업로드**됐다.
    // 캐시 주인이 다르면 동기를 통째로 건너뛴다 — 올리지도 내리지도 않는다.
    // 지우지는 않는다: 오프라인에서 쌓인 미동기 기록이 로그아웃 한 번에 사라지면 안 된다
    // (Iron Law). 완전한 계정별 캐시 격리는 저장소 구조 변경이라 별도 승인 대상이다.
    const ownership=await checkCacheOwner(authUser.uid);
    if(ownership==='other'){
      reportIssue('cloud sync 차단: 이 기기 캐시는 다른 계정 것이다(계정 전환 오염 방지)',
        new Error('cache owner mismatch'));
      return;
    }
    cloudSyncBusyRef.current=true;
    try{
      const port=cloudPortRef.current;
      // P1-4: 원자 동기(pull→merge→push 를 한 트랜잭션) 우선 — 동시-기기 클로버 방지.
      // 미구현 포트(테스트 스텁)면 비원자 pull→merge→push 로 폴백한다(동작 동일, 경합만 노출).
      let merged:BackupPayload;
      // 올릴 때만 경로를 덜어낸다 — 사이드카에 확실히 올라간 런 한정(백업 문서 1MiB 방어).
      // 내보내기용 backupData 자체는 건드리지 않는다(사용자 백업 파일은 자기 완결적이어야 한다).
      const syncPayload=stripSyncedRoutes(backupData,cloudRouteIdsRef.current);
      // ── 3단계: 확인된 뒤에만 덩어리를 비운다 ────────────────────────────
      // 판정 기준은 **병합 결과(local ∪ remote)** 다. 로컬만 보면 새로 설치한 기기가
      // "비었으니 다 올라갔다"로 오판해 원격 기록을 지운다. 병합 결과의 모든 레코드가
      // 하위 문서에 올라간 것이 확인돼야 덩어리가 잉여가 된다 — 새 기기는 첫 동기에
      // 받아서 미러링하고 다음 동기에서 비운다(스스로 낫는 순서).
      // 빈 배열을 **명시적으로** 쓴다: 키를 지우면 합집합 병합이 원격의 옛 배열을 되살린다.
      const markers=await loadMarkers();
      // 병합 결과의 레코드를 따로 잡아둔다 — 덩어리를 비우면 merged 에서 사라지므로,
      // 화면에 반영할 목록은 여기서 가져와야 원격에만 있던 기록을 잃지 않는다.
      let mergedRecords:{runs:unknown[];shoes:unknown[];medals:unknown[]}={runs:[],shoes:[],medals:[]};
      const mergeFn=(l:BackupPayload,r:BackupPayload|null):BackupPayload=>{
        const m=mergeCloudData(l,r);
        mergedRecords={
          runs:(m.runs??[]) as unknown[],
          shoes:(m.shoes??[]) as unknown[],
          medals:((m as {medals?:unknown[]}).medals??[]) as unknown[],
        };
        return isPayloadMirrored(m as any,markers)?(stripRecordArrays(m as any) as BackupPayload):m;
      };
      if(port.syncMerge){
        merged=await port.syncMerge(syncPayload,mergeFn);
      }else{
        const remote=await port.pull();
        merged=mergeFn(syncPayload,remote);
        await port.push(merged);
      }
      // ── 2단계: 읽기를 하위 문서 델타로 ──────────────────────────────────
      // 덩어리 병합 결과 위에 **하위 문서에서 바뀐 것만** 얹는다. 합집합이라 조회가
      // 비거나 실패해도 화면의 기록이 사라지지 않고, 로컬에만 있는(아직 안 올라간)
      // 러닝도 그대로 남는다. 경로는 로컬 것을 지킨다 — 하위 문서엔 route 가 없으므로
      // 그냥 덮으면 동기 한 번에 모든 지도가 사라진다(mergePulled 참조).
      let applied:BackupPayload=merged;
      try{
        const pulled=await pullRecords(cloudPortRef.current);
        // 레코드 병합의 기준은 **병합 결과**다(merged 가 아니라) — 3단계에서 덩어리를
        // 비우면 merged 에는 레코드가 없기 때문이다. 거기에 원격 델타를 얹는다.
        applied={
          ...merged,
          shoes:mergePulled(mergedRecords.shoes as any,(pulled.records.shoes??[]) as any) as any,
          runs:mergePulled(mergedRecords.runs as any,(pulled.records.runs??[]) as any) as any,
          ...(mergedRecords.medals.length||pulled.records.medals?.length
            ?{medals:mergePulled(mergedRecords.medals as any,(pulled.records.medals??[]) as any)}
            :{}),
        } as BackupPayload;
      }catch(e){
        // 델타 조회 실패는 동기 전체를 실패로 만들지 않는다 — 덩어리 병합 결과로 간다.
        reportIssue('recordSync 델타 조회',e);
      }
      applyBackupPayload(applied);
      setLastSyncAt(Date.now());
      // 다음 호출의 최소 간격 판정 기준(AUDIT 2 I-2). 성공했을 때만 기록한다 —
      // 실패를 기록하면 오프라인 구간에서 재시도까지 막혀 유실 위험이 생긴다.
      lastCloudSyncRef.current={at:Date.now(),sig:cloudDataSig};
      // 동기가 성공했으면 이 장치 캐시의 주인을 지금 계정으로 등록한다(멱등).
      // 표시가 없던 기존 사용자도 첫 성공 동기에서 자연히 주인이 된다.
      void claimCacheOwner(authUser.uid);
      // Phase 3: 동기 직후 내 월간 랭킹 엔트리를 Firestore 에 발행(best-effort·논블로킹).
      // 점수는 머지된 live 레코드로 클라이언트가 계산하고, 표시정보(닉네임/랭크/타이틀)는
      // 현재 progression 에서 파생한다. 실패해도 동기 흐름·데이터엔 영향 없음(throw 흡수).
      // ⚠️ 현재 LEADERBOARD_PUBLISH_ENABLED=false 라 이 호출은 즉시 반환한다(발행 없음).
      void publishMyRankingNow(merged);
      // ── 소셜: 공개 프로필 발행(동의했을 때만) ──────────────────────────
      // 개인 저장소에서 **화이트리스트로 추린 것만** 별도 컬렉션에 올린다. 동의가
      // 없으면(미결정 포함) 아무것도 안 올리고, 껐으면 올라가 있던 것을 **내린다** —
      // "안 쓰는 것"이 아니라 "내리는 것"이어야 껐을 때 실제로 안 보인다.
      // 실패해도 러닝 동기에는 영향이 없다(비차단).
      //
      // ⚠️ 2026-08-02 App Store 심사 감사 B-1 로 **플래그 오프**(SOCIAL_PROFILE_PUBLISH_ENABLED).
      // 처리방침에 '다른 이용자에게 공개' 고지가 없고 스토어 신고서에도 이 항목이 없는데
      // 로그인 전원이 읽을 수 있는 컬렉션에 올라가고 있었다. 리더보드와 같은 규율을 적용한다.
      // 플래그가 꺼져 있으면 profile 을 **null 로 만든다** — publishProfile 은 null 을
      // "지우라"로 읽으므로, 이미 올라가 있던 문서까지 함께 내려간다(멈추는 게 아니라 내린다).
      void (async()=>{
        try{
          const profile=SOCIAL_PROFILE_PUBLISH_ENABLED?buildPublicProfile({
            visibility:socialVisibility,
            nickname:profileName||DEFAULT_PROFILE_NAME,
            shoes:liveRecords(applied.shoes as any) as any,
            runs:liveRecords(applied.runs as any) as any,
            nowMs:Date.now(),
            spec:socialSpecInput,
          }):null;
          await publishProfile(cloudPortRef.current as any,profile);
        }catch(e){reportIssue('공개 프로필 발행',e);}
      })();
      // AUDIT 3 D-1: 동기 성공 — 실패 카운터를 되돌린다(회복되면 조용해진다).
      reportSyncResult(true);
      // ── 1단계 이중 쓰기(설계: docs/design/2026-08-01-cloud-data-model.md) ──
      // 덩어리 쓰기가 **성공한 뒤에** 레코드를 하위 문서로도 미러링한다. 순서가 중요하다 —
      // 미러링이 실패해도 덩어리는 온전하므로 유실이 없고, 실패한 종류는 마커를 안 올려
      // 다음 동기에 그대로 재시도된다. 읽기는 아직 덩어리라 이 단계에서는 화면이 안 바뀐다.
      void mirrorRecords(cloudPortRef.current, {
        runs: applied.runs as Record<string, unknown>[],
        shoes: applied.shoes as Record<string, unknown>[],
        medals: (applied as {medals?: Record<string, unknown>[]}).medals ?? [],
      }).catch(e=>reportIssue('recordSync 미러링',e));
    }catch(e){
      reportIssue('cloud sync',e);
      // AUDIT 3 D-1: **동기 실패를 사용자에게 알린다.** 예전엔 Crashlytics 로만 갔다 —
      // 백업이 멎은 채 몇 주가 지나고, 기기를 바꿀 때 그제야 기록이 없다는 걸 알았다.
      // 임계 3회·쿨다운 1시간이라 지하철 같은 일시적 오프라인으로는 뜨지 않는다.
      reportSyncResult(false);
    }
    finally{cloudSyncBusyRef.current=false;}
  };
  // 항상 최신 클로저를 가리키는 ref — effect 가 stale backupData/applyBackupPayload 를 잡지 않게.
  const runCloudSyncRef=useRef(runCloudSync);
  runCloudSyncRef.current=runCloudSync;
  // 변경 시그니처(개수+최신 updatedAt+설정). 값이 같으면 디바운스 effect 가 재실행되지 않는다
  // (런 수백 건·route 블롭을 매 렌더 stringify 하지 않는다 — 비용이 데이터 크기에 무관).
  const cloudDataSig=(()=>{
    const maxU=(arr:any[])=>arr.reduce((m:number,x:any)=>{const u=x?.updatedAt;return typeof u==='number'&&u>m?u:m;},0);
    return `${shoes.length}:${runs.length}:${Math.max(maxU(shoes),maxU(runs))}:${unit}:${goalWeeklyKm}:${JSON.stringify(alerts)}:${weightKg}:${age}:${sex}:${restHR}:${settingsTs}`;
  })();
  // 테스트(NODE_ENV==='test')에선 기본 우회 — 25개 App 스위트가 setTimeout 누수/네이티브
  // 호출 없이 그대로 통과한다. 전용 테스트는 __KEEGO_ENABLE_CLOUD_SYNC__ 로 켜서 검증한다.
  const cloudEnabled=process.env.NODE_ENV!=='test'||(globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__===true;
  // (구 Phase 5b Stage 0 — REST→Firestore 일회성 이관은 2026-07-17 Render 은퇴와 함께
  //  제거. 실사용 데이터는 수 주간 Firestore 정본으로 동기돼 이관 역할 종료.)
  // 부팅 캐시 hydrate(bootState 'ready') + 로그인 직후 1회 동기(원격 복원). bootState 를
  // 의존성에 넣어, auth 가 먼저 와도 캐시 로드가 끝난 뒤에만 동기가 돌게 한다(로컬-전용 런
  // 클로버 방지 — runCloudSync 의 ready 가드와 짝).
  useEffect(()=>{
    if(!cloudEnabled||!authUser?.uid||bootState!=='ready') return;
    void runCloudSyncRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.uid,bootState]);
  // 데이터 변경 시 디바운스 백업(1.2s). 폭주 변경을 한 번으로 합친다.
  useEffect(()=>{
    if(!cloudEnabled||!authUser?.uid) return;
    const t=setTimeout(()=>{void runCloudSyncRef.current();},1200);
    return ()=>clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.uid,cloudDataSig]);

  // 앱 이탈/복귀 시 동기 — 디바운스(1.2s)·부팅만으로는 못 메우는 빈틈을 닫는다.
  //   · 'background'(앱 이탈 직전): 직전 로컬 변경을 즉시 flush. 런 저장 후 곧장 화면을 끄거나
  //     앱을 종료해 1.2s 디바운스 창을 놓쳐도, 이탈 직전 push 가 한 번 걸린다(Firestore 오프라인
  //     영속이 큐잉하므로 그 직후 suspend 돼도 다음 연결에 서버로 올라간다 → 유실 방지).
  //   · 'active'(복귀): 타 기기 변경 pull + 직전에 오프라인 등으로 실패해 아직 안 올라간 변경의
  //     재시도. (warm resume 은 부팅 effect 가 재발화하지 않으므로 여기서 동기를 보장한다.)
  // 'inactive'(제어센터/통화 배너 등 일시 상태)는 제외해 과한 호출을 피한다. runCloudSync 가
  // ready·authUser·busy 가드를 하므로 호출 자체는 항상 안전(미충족이면 no-op).
  useEffect(()=>{
    if(!cloudEnabled) return;
    const sub=AppState.addEventListener('change',(next)=>{
      // 'background'(이탈 직전 flush)는 최소 간격을 무시한다 — 이 호출의 목적이 '유실 방지'라
      // 아끼면 안 된다. 'active'(복귀)는 타 기기 변경 pull 이 목적이라 간격 가드를 받는다
      // (로컬이 그대로면 60초 안에는 다시 안 읽는다 — AUDIT 2 I-2).
      if(next==='active'||next==='background') void runCloudSyncRef.current({force:next==='background'});
    });
    return ()=>sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── 회원 탈퇴(계정 영구 삭제) — 앱스토어 5.1.1(v) 인앱 탈퇴 요건 ──────────────
  // 1) 클라우드 계정+백업 삭제(실패 시 throw → 화면이 안내하고 로컬은 보존). 2) 성공 시
  // 로컬 전체 삭제 + 상태를 신규(온보딩)로 초기화. 사용자가 명시적으로 요청한 파기이므로
  // '데이터 파괴 금지' 불변식의 정당한 예외다(되돌릴 수 없음을 화면에서 분명히 고지).
  const handleDeleteAccount=async()=>{
    await cloudPortRef.current.deleteAccount();
    // 초기화 실패는 이전 계정 데이터가 남는다는 뜻 — 조용히 넘기면 안 된다.
    try{await AsyncStorage.clear();}catch(e){recordError(e,'storage: clear all (reset)');}
    setShoes([]);setRuns([]);
    setTombstones({shoes:[],runs:[]});
    setChallenges([]);
    setProgState(null);
    setOnboarded(false);
  };

  // 주간 목표 수정 = 홈 '이번 주 러닝' 히어로 탭 → 스테퍼 시트(B안, 2026-07-25 — 구 마이탭
  // 카드 폐지). 0(목표 없음) 포함해 changeGoal(단일 진실원)으로 위임한다 — lib/settings 가
  // 0 을 '사용자가 고른 목표 없음'으로 영속·복원하므로 재시작해도 되살아나지 않는다.
  const changeWeeklyGoal=changeGoal;

  // ── 프로필 이름/사진(영속 + 상태) ───────────────────────────────────────────
  // 이름은 공백이면 기본값('러너')으로 보정해 빈 이름을 막고, 사진은 expo-image-picker로
  // 고른 로컬 URI를 저장한다. 권한 거부/취소(null)·실패는 모두 비차단(조용히 유지).
  const changeProfileName=(name:string)=>{
    const v=(name||'').trim()||DEFAULT_PROFILE_NAME;
    setProfileName(v);
    try{void AsyncStorage.setItem(K_PROFILE_NAME,v);}catch(e){reportIssue('storage: profile name save',e);}
  };
  const pickProfilePhoto=async()=>{
    try{
      const picked=await pickPhotoWithPermission();
      if(!picked.ok){
        // 권한 거부 시 무반응이던 것 개선(2026-07-05) — 설정 안내(취소는 조용히).
        // 2026-08-04: 같은 안내를 하는 곳이 넷이라 공용 헬퍼로 모았다(QA 감사 Q-7).
        if(picked.reason==='denied')showPermissionSettingsDialog(
          '사진 접근 권한이 필요해요',
          '설정에서 사진 권한을 허용하면 프로필 사진을 바꿀 수 있어요.',
        );
        return;
      }
      setProfilePhoto(picked.uri);
      try{await AsyncStorage.setItem(K_PROFILE_PHOTO,picked.uri);}catch(e){reportIssue('storage: profile photo save',e);}
    }catch(e){reportIssue('profile photo pick',e);}
  };
  // 챌린지 진행률용 런 매핑: 런 기록 → {date,dist}. km 은 백엔드가 문자열로도 보내므로
  // Number 로 강제하고, 음수/NaN 은 lib(challengeProgress)에서 0 으로 방어한다.
  const challengeRuns:ChallengeRun[]=runs.map(r=>({date:String(r.run_date||'').slice(0,10),dist:Number(r.km)||0}));

  // ── adapters: backend → presentational shapes (lib/appViewModel) ──────────
  const uiShoes:Shoe[]=shoes.map(s=>toUiShoe(s,runs,weightKg));
  const idxById=buildIdxById(shoes);
  const nameById=buildNameById(shoes,tombstones.shoes);

  const homeShoes=homeShoePairs(shoes,uiShoes,runs);
  const homeUiShoes:Shoe[]=homeShoes.map(x=>x.ui);

  // ── 선택/기본 신발(activeIdx 하드코딩 제거) ──────────────────────────────────
  // 기본: 가장 최근에 신은 활성 신발(손이 가는 신발). 선택: 사용자가 홈에서 고른 신발
  // (없으면 기본으로 폴백). effectiveId 하나가 홈 히어로와 신발화면 '사용 중' 표시를 몬다.
  const recentId=mostRecentShoeId(shoes,runs) as string|null;
  const effectiveId=
    (selectedShoeId&&homeShoes.some(x=>x.raw.id===selectedShoeId))?selectedShoeId
    :(recentId&&homeShoes.some(x=>x.raw.id===recentId))?recentId
    :(homeShoes[0]?.raw.id??null);
  const homeActiveIdx=Math.max(0,homeShoes.findIndex(x=>x.raw.id===effectiveId));
  // (신발탭 '사용 중' 강조 인덱스는 2026-07-11 라벨 제거와 함께 폐지 — 카드 동일 취급.)
  // 홈 picker(보관 제외) 인덱스 → 원본 신발 id로 선택 상태를 갱신한다.
  const selectHomeShoe=(i:number)=>{const e=homeShoes[i];if(e)setSelectedShoeId(e.raw.id);};

  // ── Keego Watch 동기화(2026-07-10) ────────────────────────────────────────
  // ① 활성 신발 목록(홈과 같은 최근착용순) + 심박존 파라미터(Tanaka 최대심박·안정시심박)
  //    를 워치에 푸시한다. 워치 시작 화면이 이 목록을 좌우 스와이프로 넘기고, 남은 수명
  //    %·컨디션 도트를 그린다. applicationContext 라 워치가 꺼져 있어도 다음 실행 때
  //    도착·캐시된다. 직렬화 문자열을 dep 으로 써 내용이 실제로 바뀔 때만 전송한다.
  const watchShoesJson=JSON.stringify(buildWatchShoes(homeShoes,age,restHR));
  useEffect(()=>{
    const p=JSON.parse(watchShoesJson);
    watchSession.updateShoes(p.shoes,p.hr);
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
        ? elevationGainFrom(p.routeAlt)
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
      const dup=findMergeTarget(incoming,ctx.runs as any,{incomingStartMs:p.startMs});
      if(dup){
        const merged=mergeRuns(dup as any,incoming,'watch');
        setRuns(prev=>prev.map(r=>r.id===dup.id?({...r,...merged} as any):r));
        // 경로가 폰에 없고 워치에만 있으면 사이드카도 채운다(지도 유실 방지).
        if(routeStr&&!String((dup as any).route||'')){
          try{await AsyncStorage.setItem('route_'+dup.id,routeStr);}catch{/* 비치명적 */}
        }
        return; // 새 런을 만들지 않는다 — 신발 이중 차감의 근본 차단.
      }
      const newId=await ctx.addRun(shoeId,p.km,date,'','watch',Math.round(p.durationS),Math.round(p.cadence),routeStr,'',Math.round(p.avgBpm),elevM,Math.round(p.kcal));
      // 트랙 런이면 track_<id> 마커 저장 — 폰 RunDetail 이 '트랙·Nm×N랩' 표시(폰 트랙 런과
      // 동일 계약). 거리(랩수×랩거리)·시간은 이미 레코드에 있으므로 메타만 얹는다.
      if(newId&&p.laps>0&&p.lapM>0){
        try{await AsyncStorage.setItem('track_'+newId,JSON.stringify({lapM:Math.round(p.lapM),laps:Math.round(p.laps),lapTimes:(p.lapTimes||[]).map(t=>Math.round(t))}));}catch{/* 비치명적 */}
        // 폰 트랙 런과 같은 규칙으로 노면을 태깅한다(2026-07-27) — 유입 경로가 달라도
        // 같은 러닝이면 마모 계산이 같아야 한다.
        try{await setRunSurface(newId,'track');}catch{/* 비치명적 */}
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

  // 심박 지연 보강 — 폰이 주머니에 있어(화면 꺼짐) 실시간 심박을 놓쳐도 hrTrack 이 채워지게.
  const runsForHrRef=useRef<BackendRun[]>([]);
  runsForHrRef.current=runs;
  // 평균 심박 지연 보정 — hrTrack(그래프 사이드카)은 백필로 채워졌는데 레코드 heart_rate 가
  // 0 인 런(워치가 타앱 세션에 잡혀 라이브 스트림이 없던 러닝 등)의 평균을 사이드카에서
  // 산출해 레코드에 채운다. 상세 요약·공유 카드가 읽는 정본은 레코드 필드라 여기까지
  // 채워야 '--'가 사라진다(2026-07-18 실기기: 그래프는 있는데 평균만 '--').
  const repairAvgBpm=async(runId:string)=>{
    const sid=String(runId);
    const target=runsForHrRef.current.find(r=>String(r.id)===sid);
    if(!target||(Number(target.heart_rate)||0)>0)return;
    try{
      const raw=await AsyncStorage.getItem('hrTrack_'+sid);
      const avg=raw?avgBpmFromTrack(JSON.parse(raw)):null;
      if(avg==null)return;
      const editedAt=Date.now();
      setRuns(prev=>prev.map(r=>String(r.id)===sid?stampUpdatedAt({...r,heart_rate:avg},editedAt):r));
      await persistRunToCache(stampUpdatedAt({...target,heart_rate:avg},editedAt));
    }catch{/* 비치명적 */}
  };
  // 백필 + 평균 보정 묶음 — retryPendingHr/recoverRecentHr 가 트랙을 채우는 모든 경로에서
  // 레코드 평균까지 한 번에 따라온다.
  const hkBackfillAndRepair=(id:string,s:number,e:number)=>
    hkBackfillHeartRate(id,s,e).then(n=>{if(n>0)void repairAvgBpm(id);return n;});
  // (A) 워치가 러닝 끝에 직송하는 심박 기록을 시간창으로 폰 런과 매칭해 저장(정본·HK 무관).
  useEffect(()=>watchSession.onWatchHrTrack(async p=>{
    try{
      const rid=await saveWatchHrTrack(p.startMs,p.endMs,p.offsetS,p.bpm,Date.now());
      if(rid)void repairAvgBpm(rid);
    }catch{/* 비치명적 */}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }),[]);
  // (B) HealthKit 백필 재시도 + 최근 러닝 심박 복구 — 마운트 시 1회 + 앱 복귀('active')마다.
  //   · retryPendingHr: 새 런의 대기 목록을 정확한 창으로 재백필(저장 직후 동기화 지연 보완).
  //   · recoverRecentHr: 최근 48h 러닝을 창(updatedAt-duration)으로 재백필한다. HealthKit
  //     백필이 richer-wins 라, 워치→폰 동기화가 늦어 저장 때 못 잡았거나 스트레이 1~2점만
  //     잡혀 '평평한 가짜 심박'이 된 런도, 앱 복귀 시 애플 건강의 완전한 실측으로 교정된다.
  useEffect(()=>{
    const recoverRecentHr=async()=>{
      try{
        const now=Date.now();
        const recent=(runsForHrRef.current||[]).filter(r=>{
          const end=Number((r as {updatedAt?:number}).updatedAt)||0;
          return end>0 && now-end<48*3600*1000 && (Number(r.duration)||0)>30;
        }).slice(0,10);
        for(const r of recent){
          const end=Number((r as {updatedAt?:number}).updatedAt)||0;
          const start=end-(Number(r.duration)||0)*1000;
          await hkBackfillHeartRate(String(r.id),start,end);
          // 트랙은 있는데 레코드 평균이 빈 런(이전 버전에서 백필된 기록 포함) 소급 보정.
          await repairAvgBpm(String(r.id));
        }
      }catch{/* 비치명적 */}
    };
    const run=()=>{void retryPendingHr(Date.now(),hkBackfillAndRepair).catch(()=>{});void recoverRecentHr();};
    run();
    // 콜드런치 대비 — 마운트 직후엔 runs 가 아직 로드 전이라 복구가 헛돈다. 로드된 뒤 재시도.
    const t1=setTimeout(run,3000);const t2=setTimeout(run,12000);
    const sub=AppState.addEventListener('change',n=>{if(n==='active')run();});
    return ()=>{clearTimeout(t1);clearTimeout(t2);sub.remove();};
  // repairAvgBpm/hkBackfillAndRepair 는 ref 기반이라 첫 렌더 인스턴스로 충분(재구독 불필요).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // 심박 상세 복구 스윕(2026-07-24, 실기기: 재설치로 로컬 사이드카가 초기화돼 예전 기록의
  // 심박 그래프가 실종) — 하루 1회, hrTrack 없는 최근 런(30개)을 'HK 워크아웃의 실제
  // 시간창'으로 정밀 재백필한다. recoverRecentHr(48h·updatedAt 근사)와 달리 저장 당시
  // 워크아웃 시각이 정본이라 오래된 기록도 안전하다(±120s 매치 실패 시 건드리지 않음 —
  // 엉뚱한 창 백필이 '없음'보다 나쁘다). 전 과정 비차단.
  useEffect(()=>{
    let alive=true;
    const HR_SWEEP_AT_KEY='hr_recover_sweep_at_v2'; // v2: route 픽스와 함께 1회 강제 재스윕(v1 빈 스탬프 무효화)
    const sweep=async()=>{
      try{
        // 자가 복구 포함(재설치로 연동 플래그가 지워져도 OS 권한이 있으면 복원 후 진행).
        if(!(await hkEnsureLinked()))return;
        const last=Number(await AsyncStorage.getItem(HR_SWEEP_AT_KEY))||0;
        if(Date.now()-last<24*3600*1000)return;
        const candidates=(runsForHrRef.current||[]).filter(r=>(Number(r.duration)||0)>300).slice(0,30);
        for(const r of candidates){
          if(!alive)return;
          const id=String(r.id);
          if(await hasHrTrack(id))continue;
          const win=await hkFindRunWorkoutWindow(String(r.run_date||''),Number(r.duration)||0);
          if(!win)continue;
          await hkBackfillAndRepair(id,win.startMs,win.endMs);
        }
        await AsyncStorage.setItem(HR_SWEEP_AT_KEY,String(Date.now()));
      }catch{/* 비차단 — 다음 기회에 재시도 */}
    };
    const t=setTimeout(()=>{void sweep();},8000); // 부팅 러시(캐시 로드·동기화) 지난 뒤 조용히
    return()=>{alive=false;clearTimeout(t);};
  // hkBackfillAndRepair 는 ref 기반이라 첫 렌더 인스턴스로 충분(재구독 불필요).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // 런 상세 사이드카 클라우드 동기(2026-07-24 — 재설치 유실 재발 방지): 하루 1회, 최근
  // 30개 런의 상세를 양방향 동기한다(로컬 有→push · 로컬 無→pull 복원, runDetailSync).
  // 심박 스윕(위, 8s)이 먼저 hrTrack 을 채운 뒤 돌도록 15s 지연. 미로그인·포트 미구현은
  // syncRunDetails 가 조용히 생략(전 과정 비차단).
  useEffect(()=>{
    let alive=true;
    const DETAIL_SWEEP_AT_KEY='detail_sync_sweep_at_v1';
    const sweep=async()=>{
      try{
        if(!alive||!authUser?.uid)return;
        const last=Number(await AsyncStorage.getItem(DETAIL_SWEEP_AT_KEY))||0;
        if(Date.now()-last<24*3600*1000)return;
        await syncRunDetails((runsForHrRef.current||[]) as {id:string|number}[],cloudPortRef.current,{max:30});
        await AsyncStorage.setItem(DETAIL_SWEEP_AT_KEY,String(Date.now()));
        // 스윕 직후 '경로가 사이드카에 올라간 런'을 다시 셈해 둔다 — 다음 클라우드 동기부터
        // 그 런들의 route 를 본문에서 덜어내 백업 문서가 점진적으로 줄어든다.
        if(alive)cloudRouteIdsRef.current=await runsWithCloudRoute(((runsForHrRef.current||[]) as {id:string|number}[]).map(r=>r.id));
      }catch{/* 비차단 — 다음 기회 */}
    };
    const t=setTimeout(()=>{void sweep();},15000);
    return()=>{alive=false;clearTimeout(t);};

  },[authUser?.uid]);

  // ── 실효 마모/교체 예측 보정(Slice 6) ────────────────────────────────────────
  // 런별 노면 태그 조회(미태그 → road). 신발 상세(ShoesScreen)와 홈 히어로 예측이 같은
  // 보정(체중·노면)을 공유하도록 한 곳에서 만든다. 표시 파생값이며 원본은 읽기만 한다.
  const surfaceOf=(runId:string):Surface=>runSurfaces[runId]??'road';
  // 홈 히어로(선택 신발)의 교체 예측. 신발 상세와 동일 입력(target=max_km, 거리/시간/날짜,
  // weightKg, surfaceOf)으로 계산해 두 화면 예측이 일치한다. ok/overdue일 때만 히어로에 노출.
  const homeActiveRaw=shoes.find(s=>s.id===effectiveId)||null;
  // 한 신발의 교체 예측(상세와 동일 보정: target=max_km, 거리/시간/날짜, weightKg, surfaceOf).
  const forecastForRaw=(raw:BackendShoe|null):ReplacementForecast|null=>raw?forecastReplacement(
    {name:raw.name,target_km:Number(raw.max_km),start_km:Number(raw.start_km)||0,purchase_date:raw.purchase_date},
    runs.filter(r=>r.shoe_id===raw.id).map(r=>({
      id:r.id,distance_km:parseFloat(String(r.km))||0,duration_s:r.duration||0,date:String(r.run_date||''),
    })),
    {weightKg,surfaceOf},
  ):null;
  const homeForecast:ReplacementForecast|null=forecastForRaw(homeActiveRaw);
  // 캐러셀 카드마다 자기 신발의 예측을 바로 보여주려고 전 신발 예측을 맵으로 모은다
  // (활성 1개만 내려주던 구조 → 스와이프 시 forecast 가 한 박자 늦게 뜨던 지연 제거).
  const homeForecasts:Record<string,ReplacementForecast|null>={};
  for(const s of shoes){ if(s.id) homeForecasts[s.id]=forecastForRaw(s); }

  // ── 진척 홈 노출(Slice D) ───────────────────────────────────────────────────────
  // 진척 계산에 넘길 챌린지 완료 신호(렌더 경로 단일 소스, 메모). 홈 띠·프로필 랭크·업적이
  // 모두 이 값을 공유해 completedChallengeCount 가 실제 완료 수를 반영한다(챌린지 업적 잠김 해소).
  const contextChallenges=useMemo(()=>buildContextChallenges(runs,shoes,today()),[buildContextChallenges,runs,shoes]);
  // getProgression(읽기 전용 — 런/신발/progression_v1 불변)으로 랭크·장착 타이틀·업적을
  // 읽고, 수락한 챌린지(base distance/streak + ext monthly/shoe/rotation) 중 활성 1개의
  // 진행을 골라 홈 띠로 내려준다. 데이터를 만들지 않고 표시 파생만 한다(getProgression
  // 내부 메모 + 작은 루프라 매 렌더 비용은 무시 가능). 미주입 progState 도 안전 기본값.
  const homeProgression:HomeProgression=useMemo(()=>{
    const view=getProgression(runs,shoes,progState??undefined,undefined,contextChallenges);
    const equipped=view.titles.equipped
      ? (view.titles.unlocked.find(t=>t.key===view.titles.equipped)?.name??null)
      : null;
    // 최근(하이라이트) 업적: seenUnlocks 의 해제 순서(꼬리=최신) 기준 — 포인트가 아니라 recency.
    const recentAch=pickRecentAchievement(view,progState?.seenUnlocks);
    // 활성 챌린지 후보: base + ext 진행 파생 → (미완료 우선, pct 내림차순) 1개.
    const nowISO=today();
    const extRuns:ExtRun[]=runs.map(r=>({date:String(r.run_date||'').slice(0,10),dist:Number(r.km)||0,shoeId:r.shoe_id,durationS:r.duration}));
    const extShoes:ExtShoe[]=shoes.map(sh=>({id:sh.id,name:sh.name,retired:!!sh.retired,createdAt:sh.purchase_date,targetKm:sh.max_km}));
    const cands:{v:HomeChallengeView;completed:boolean;pct:number}[]=[];
    for(const c of challenges){
      const p=challengeProgress(c,challengeRuns);
      cands.push({v:{label:baseChallengeLabel(c),current:p.current,target:p.target,pct:p.pct,unit:c.kind==='streak'?'일':'km'},completed:p.completed,pct:p.pct});
    }
    for(const c of extChallenges){
      const p=challengeExtProgress(c,extRuns,extShoes,nowISO);
      cands.push({v:{label:extChallengeLabel(c),current:p.current,target:p.target,pct:p.pct,unit:extChallengeUnit(c)},completed:p.completed,pct:p.pct});
    }
    const sorted=cands.filter(c=>c.v.target>0)
      .sort((a,b)=>(Number(a.completed)-Number(b.completed))||(b.pct-a.pct));
    const activeChallenges=sorted.map(c=>c.v);
    return {
      tier:view.rank.tier,
      score:view.rank.score,
      equippedTitle:equipped,
      challenge:activeChallenges[0]??null,
      challenges:activeChallenges,
      achievement:recentAch?{name:recentAch.name}:null,
    };

  },[runs,shoes,challenges,extChallenges,challengeRuns,progState,contextChallenges]);

  // (마이 탭 스마트 챌린지 카드 입력 challengeExt 파생 제거 — 주간 목표가 홈 시트로
  //  이관되며 소비처가 사라짐, 2026-07-25. 스마트 추천 산식은 lib 에 그대로 보존.)

  // ── 은퇴 키프세이크 컨텍스트(Slice B) ────────────────────────────────────────
  // 영속된 은퇴 레코드(Hall of Shoes 소스) + 진척 컨텍스트(요약/등급 판정용). buildContext
  // 는 순수·읽기 전용(런/신발 불변). progState 미로드 시 빈 레코드로 안전 동작.
  // 은퇴 기록의 **유일한 출처는 신발**이다(2026-08-01 결정 A). 예전엔 progression 이
  // 따로 들고 있어 같은 신발을 두 곳이 설명했다 — 명예의 전당이 어느 쪽을 봐야 하는지
  // 늘 헷갈렸고, 한쪽만 지워지는 경로가 생기면 조용히 어긋난다. 이제 신발 하나가 답한다.
  // 삭제한 신발은 여기서 자연히 빠진다(= 명예의 전당에서도 사라진다 — 결정 A).
  const retiredRecords:RetiredShoeRecord[]=useMemo(()=>retirementRecordsFromShoes(shoes as any),[shoes]);
  // 보관함 목록: retired(보관) 처리됐지만 명예의 전당(키프세이크) 기록이 없는 신발 = 단순
  // 보관 신발. 명예의 전당 신발은 박물관에 있으므로 제외한다. 마이 탭 '신발 보관함'이 소비.
  const museumShoeIds=new Set(retiredRecords.map(r=>r.shoeId));
  const archivedUiShoes:Shoe[]=uiShoes.filter(s=>s.retired&&!!s.id&&!museumShoeIds.has(s.id));
  const progressionCtx=useMemo(
    ()=>buildContext(runs,shoes,progState?.earnedTitles??[],null,Date.now(),retiredRecords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs,shoes,progState],
  );
  // 은퇴 확정 후 UI 상태 즉시 갱신(디스크 영속은 flow 가 persistRetiredShoe 로 이미 처리).
  // shoeId 기준 UPSERT — 신발당 1개를 유지하되, 보관 복원 후 재은퇴 시 km/등급을 최신으로
  // 교체한다(stale 레코드 방지). run/shoe 상태는 건드리지 않는다.
  const onRetiredKeepsake=(record:RetiredShoeRecord)=>{
    // 신발 문서에 은퇴 스냅샷을 붙인다(신발당 1개, 재은퇴 시 교체). 영속·동기는 신발
    // 레코드 경로가 그대로 담당하므로 별도 저장이 필요 없다 — 진실이 한 곳이라는 게
    // 이 구조의 값어치다(결정 A).
    setShoes(prev=>{
      const next=setShoeRetirement(prev as any,record) as typeof prev;
      if(next===prev) return prev;
      return next.map(sh=>String(sh.id)===String(record.shoeId)?stampUpdatedAt(sh):sh);
    });
  };

  const sortedRaw=sortRunsByDateDesc(runs);
  const uiRuns:Run[]=sortedRaw.map(r=>toUiRun(r,idxById,nameById));

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
  // ('N일 연속' 스트릭 카운트 표시 폐지 — 홈 원카드 점 7칸(weekBuckets)이 대체, 2026-07-25.)

  // ── 푸시 알림 표시 배선(slice-8-notif-ui) ────────────────────────────────────
  // dueNotifications(순수) 의 입력 상태를 기존 lib 산출물에서 조립한다(중복 계산 0):
  //   · shoesWithForecast — 신발마다 forecastReplacement(홈 히어로와 동일 입력: 체중·노면)
  //   · weekly            — goalProgress(weeklyProgress) 그대로
  //   · lastRunISO        — 가장 최근 런 날짜('YYYY-MM-DD'), 런 0개면 null
  //   · settings          — notif_settings(notifSettings)
  const buildNotifState=():NotifState=>{
    const shoesWithForecast:ShoeForecast[]=shoes.map(s=>({
      shoe:{id:s.id,name:s.name,target_km:Number(s.max_km)},
      forecast:forecastReplacement(
        // 교체 예보 푸시도 홈 히어로(forecastForRaw)와 동일하게 start_km/age 를 반영한다 —
        // 빠지면 이미 신던 신발이 '교체 권장' 푸시를 못 받아 홈 UI 와 알림이 어긋난다.
        {name:s.name,target_km:Number(s.max_km),start_km:Number(s.start_km)||0,purchase_date:s.purchase_date},
        runs.filter(r=>r.shoe_id===s.id).map(r=>({
          id:r.id,distance_km:parseFloat(String(r.km))||0,duration_s:r.duration||0,date:String(r.run_date||''),
        })),
        {weightKg,surfaceOf},
      ),
    }));
    const lastRunISO=runs.length
      ? runs.reduce((m:string,r:any)=>{const d=String(r.run_date||'');return d>m?d:m;},'')||null
      : null;
    return {shoesWithForecast,weekly:goalProgress,lastRunISO,settings:notifSettings};
  };
  // 포그라운드 진입 시 실제 표시 경로. 당일 이미 표시한 key 는 제외(A8-4), 표시 후 key 를
  // 메모리/영속에 누적한다. 날짜 스탬프 키만 유지해 어제 키는 자연 만료(누수 0). presentDue
  // 의 기본 표시는 Alert 라 FCM 권한과 무관하게 동작한다(비차단). 예외는 삼켜 흐름을 막지 않는다.
  presentDueRef.current=()=>{
    try{
      // 로그인 게이트를 통과하고 데이터가 준비된 뒤에만 띄운다(2026-07-30 Android 실측 발견).
      // 안 그러면 **로그인 화면 위로** 알림이 뜬다 — 에뮬레이터 첫 실행에서 아직 가입도
      // 하지 않은 사용자에게 "오늘 달릴 시간이에요", "이번 주 목표의 0%를 달렸어요"가
      // 연달아 떴다. 기록이 0인 사람에게 진척을 말하는 것이라 내용도 틀렸고, 로그인 버튼
      // 위를 덮어 탭까지 가로챈다. 게이트 통과 전에는 알릴 '내 기록'이라는 것 자체가 없다.
      if(!authUser?.uid||bootState!=='ready')return;
      const intents=dueNotifications(buildNotifState(),new Date());
      const fresh=intents.filter(i=>!presentedNotifKeys.current.has(i.key));
      if(fresh.length===0)return;
      void presentDue(fresh);
      fresh.forEach(i=>presentedNotifKeys.current.add(i.key));
      const todayY=today();
      const kept=[...presentedNotifKeys.current].filter(k=>k.includes(todayY));
      presentedNotifKeys.current=new Set(kept);
      try{void AsyncStorage.setItem(K_NOTIF_PRESENTED,JSON.stringify(kept));}catch{/* 영속 실패는 삼킴 */}
    }catch(e){reportIssue('notification present',e);}
  };

  // 신발 로테이션 추천(차별점): 보유 신발+런 기록에서만 파생(새 상태 없음). 활성 2켤레+
  // 일 때만 picks 가 채워지고, runType 미선택이라 '휴식·마모 분산' 기본 추천이 된다.
  // 카테고리는 brand+model(parseShoeName) 로 data/shoeModels 조회 — 커스텀은 브랜드 폴백.
  const rotationPicks=recommendRotation({
    // max_km 은 화면의 수명 링·교체 판정과 **같은 유효값**(몸무게 반영)을 넘긴다 —
    // 추천이 절대 누적 km 로 마모를 비교하면 수명이 짧은 신발이 과대평가돼 더 닳은
    // 신발을 먼저 권하게 된다(2026-07-26 출시 심사 B-14). 분모가 표시와 달라도 같은
    // 종류의 어긋남이 생기므로 effectiveMaxKm 을 그대로 쓴다.
    shoes:shoes.map(s=>{const {brand,model}=parseShoeName(s.name);return {id:s.id,brand:brand||s.name,model:model||(brand?'':s.name),retired:isRetired(s),start_km:Number(s.start_km)||0,max_km:effectiveMaxKm(s.max_km||DEFAULT_MAX_KM,weightKg)};}),
    runs:runs.map(r=>({shoeId:String(r.shoe_id),date:String(r.run_date),km:parseFloat(String(r.km))||0})),
    today:ymdLocal(now),
  });

  // 훈련 부하(재노출 2026-07-18) — 홈 조건부 시그널용. BackendRun 은 run_date/km/duration
  // 필드 그대로 LoadRun 을 만족한다(리캡 loadAfter 와 동일 경로).
  const homeLoad=useMemo(
    ()=>assessTrainingLoad(runs as any[],today()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs.length,(runs as any[])[runs.length-1]?.id,today()],
  );

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
    // 누적 러닝 시간은 서버 truth(run_time, 초)를 우선한다 — 다른 기기의 미동기 런까지
    // 반영된 값. 없으면 로컬 런 로그 합산으로 폴백한다(audit#9/#10).
    const serverSec=Number(s.run_time);
    const totalTime=Number.isFinite(serverSec)&&serverSec>0?durationLabel(serverSec):totalTimeLabel(list);
    // 신발별 평균 페이스(기록 있는 런만, lib/stats). 신발끼리 페이스 비교용으로 상세·목록에 노출.
    shoeTotals[i]={totalRuns:list.length,totalTime,avgPace:avgPaceLabel(list),lastWorn:worn?fmtKDate(worn).date:undefined};
  });

  // ── profile ─────────────────────────────────────────────────
  const totalKm=Math.round(sumKm(runs));
  const totalSec=runs.reduce((a,r)=>a+(r.duration||0),0);
  const firstDate=runs.length?runs.reduce((m:string,r:any)=>r.run_date<m?r.run_date:m,runs[0].run_date):'';
  const since=firstDate?(()=>{const d=new Date(firstDate+'T00:00:00');return `${d.getFullYear()}년 ${d.getMonth()+1}월부터`;})():'';
  const streak=maxDayStreak(runs.map(r=>r.run_date).filter(Boolean));
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
  const badges:Badge[]=[
    {icon:'trophy',label:'100km',on:totalKm>=100},
    {icon:'flame',label:'7일 연속',on:streak>=7},
    {icon:'flash',label:'10회 달성',on:runs.length>=10},
    {icon:'map',label:'하프',on:runs.some(r=>parseFloat(String(r.km))>=21.1)},
  ];
  // 개인 기록(PR) 프로필 카드: 1km/5km 최고 기록·최장 거리. 거리·시간이 모두 양수인
  // 런만 산정에 쓴다(personalRecords 순수함수). 거리 최고는 전부 '완주 시간' 표기로 통일
  // (러닝 관례 — 과거 1km 만 페이스 /km 라 5km 와 섞였다, 사용자 지적 2026-07-16).
  const prRuns=runs.map(r=>({run_date:String(r.run_date),km:parseFloat(String(r.km))||0,durationS:r.duration||0}));
  const pr=personalRecords(prRuns);
  const records:PersonalRecord[]=[
    {icon:'flash-outline',label:'1km 최고 기록',value:pr.fastest1k!=null?fmtTime(Math.round(pr.fastest1k)):'--',unit:''},
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
    addShoe(`${shoe.brand} ${shoe.model}`.trim(),shoe.max,shoe.used,today(),shoe.priceKrw);
    setOverlay('none');
  };

  // ── 위젯 딥링크(keego://start) — 홈/잠금화면 위젯 탭 → 활성 신발로 러닝 시작 플로우 ──
  // 홈 히어로 '러닝 시작' CTA와 동일 경로(startFromShoeId → 목표 화면). AppDelegate 가
  // keego://start(host=start)만 RN Linking 으로 라우팅(그 외 keego:// 는 네이버 로그인).
  // 콜드스타트(getInitialURL)는 신발 로드 전 도착할 수 있어 → pending 플래그로 로드 후 처리.
  const deepLinkCtx=useRef({effectiveId,startFromShoeId});
  deepLinkCtx.current={effectiveId,startFromShoeId};
  const pendingWidgetStart=useRef(false);
  useEffect(()=>{
    if((globalThis as any).__KEEGO_CAPTURE__) return;
    const fire=()=>{
      const {effectiveId,startFromShoeId}=deepLinkCtx.current;
      if(effectiveId){pendingWidgetStart.current=false;startFromShoeId(effectiveId);}
      else pendingWidgetStart.current=true; // 신발 로드 전 → 로드되면 아래 effect가 처리
    };
    const handle=(url:string|null)=>{if(url&&url.replace(/\/+$/,'')==='keego://start')fire();};
    Linking.getInitialURL().then(handle).catch(()=>{});
    const sub=Linking.addEventListener('url',e=>handle(e.url));
    return ()=>sub.remove();
  },[]);
  useEffect(()=>{
    if(pendingWidgetStart.current&&effectiveId){pendingWidgetStart.current=false;deepLinkCtx.current.startFromShoeId(effectiveId);}
  },[effectiveId]);

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
  /** OS 권한을 실제로 묻고, 허용되면 그 목표로 러닝을 시작한다(거부면 설정 안내). */
  const requestLocationThenStart=async(goal:RunGoal)=>{
    const perm=await requestRunPermissions();
    // 동작·피트니스도 여기서 한 번에 — 케이던스(Pedometer)와 고도(Barometer)가 같은 모션
    // 권한을 쓰므로, 첫 러닝 순간이 아니라 앞단에서 받아 매끄럽게 동작하게 한다.
    try{await Pedometer.requestPermissionsAsync();}catch{/* 거부/미지원 — 러닝은 계속 */}
    if(!perm.foreground){showLocationDenied(goal);return;} // 카운트다운으로 넘기지 않는다
    enterRun(goal);
  };
  const startActiveRun=async(goal:RunGoal)=>{
    if(!pendingShoe) return;
    // 실내(트레드밀)는 GPS 를 아예 쓰지 않는다 — 거리는 걸음이 정본이다(runTracker.indoorMode).
    // 그런데 예전엔 러닝 화면의 위치 게이트가 indoor 를 보지 않아, **쓰지도 않는 권한 때문에
    // 실내 러닝이 시작조차 되지 않았다**(2026-08-04 QA 후속). 묻지 않는 게 맞다.
    if(goal.indoor){enterRun(goal);return;}
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

  // 설정에서 위치를 허용하고 돌아왔다면 기다리던 러닝을 바로 시작한다. 허용 안 하고 왔으면
  // 아무 말도 하지 않는다(목표 화면에 그대로 머문다 — 돌아오자마자 또 조르지 않는다).
  useEffect(()=>{
    if(!permRetryGoal) return;
    const sub=AppState.addEventListener('change',next=>{
      if(next!=='active') return;
      void (async()=>{
        if(!(await hasForegroundPermission())) return;
        setPermRetryGoal(null);
        enterRun(permRetryGoal);
      })();
    });
    return ()=>sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[permRetryGoal]);

  // 온보딩 완료: 1회성 플래그 영속 + 화면에서 치운다. 온보딩의 등록 단계에서 고른
  // 신발(있으면)은 실제 백엔드 신발로 만들어 홈에 바로 반영한다(없으면 빈 홈으로).
  // setOnboarded(true)가 먼저라 addShoe의 비동기 shoes 갱신이 흐름을 끊지 않는다.
  const completeOnboarding=(registered:RegisteredShoe|null,weightKg?:number)=>{
    setOnboarded(true);
    void AsyncStorage.setItem(ONBOARD_KEY,'1');
    // 온보딩에서 몸무게를 입력했으면 설정에 반영(칼로리+내구도 공용). 미입력이면 기본값 유지.
    if(typeof weightKg==='number'&&weightKg>0){changeWeight(clampWeight(weightKg));}
    if(registered&&authUser?.uid){
      addShoe(`${registered.brand} ${registered.model}`.trim(),registered.max||DEFAULT_MAX_KM,Math.round(registered.km),today());
    }
    setOverlay('none');
  };

  // ── render ──────────────────────────────────────────────────
  // 필수 로그인 게이트 — 부팅보다 먼저 검사한다. 인증 확인중이면 스플래시(스켈레톤),
  // 미로그인이면 로그인 화면을 강제한다. 로그인되면(authUser 객체) 아래 부팅으로 진행.
  if(authUser===undefined){
    return <BootSkeleton/>;
  }
  if(authUser===null){
    return <LoginScreen cloudPort={cloudPortRef.current}
      onSignedIn={(u,p)=>{pendingProviderRef.current=p;setAuthUser({uid:u.uid});}}/>;
  }
  // 필수 업데이트 게이트(AUDIT 2 I-3) — 부팅 성공 여부보다 **먼저** 검사한다.
  // 막아야 할 만큼 심각한 버그라면 부팅 자체가 깨져 있을 수 있는데, 그때 BootError 만
  // 뜨면 사용자는 무엇을 해야 할지 알 수 없다. 이 게이트가 그 위에 온다.
  if(forceUpdateCfg){
    return <ForceUpdateScreen config={forceUpdateCfg}/>;
  }
  // 콜드 백엔드 부팅: 스켈레톤(로딩) / 재시도 카드(에러). 빈-신규는 'ready'라 여기
  // 걸리지 않고 아래 온보딩/홈으로 간다(fetch 실패와 빈 데이터의 구분).
  if(bootState==='loading'){
    return <BootSkeleton/>;
  }
  if(bootState==='error'){
    return <BootError onRetry={()=>{void initUser();}}/>;
  }
  if(overlay==='add'){
    return <AddShoeScreen onClose={()=>setOverlay('none')} onSave={onAddSaved}/>;
  }
  // 첫 실행 온보딩: 신발이 없고(신규) 아직 온보딩 전이면 신발→런→수명 차감 흐름을
  // 1회 소개한다. 신발을 이미 가진 사용자/완료자에겐 뜨지 않는다.
  // 온보딩 미리보기(개발 전용, __DEV__) — 넘기면 비영속으로 닫고 홈으로.
  if(previewOnboard){
    return <OnboardingScreen onDone={()=>setPreviewOnboard(false)}/>;
  }
  if(!onboarded&&shoes.length===0&&overlay==='none'){
    return <OnboardingScreen onDone={completeOnboarding}/>;
  }
  // 공개 범위 동의(소셜 1단계) — **아직 안 물어봤을 때 한 번만.**
  // 신발이 생긴 뒤에 띄운다: 온보딩이 신발 등록으로 끝나므로 이 시점엔 카드가 비어 있지
  // 않고, "이렇게 보여요"가 실제로 뭔가를 보여준다. 동의 전에는 아무것도 안 올라간다.
  // 테스트는 기본 우회(다른 App 스위트가 홈에 못 가면 전부 깨진다). 이 화면 자체의
  // 검증은 __KEEGO_ENABLE_SOCIAL_CONSENT__ 로 켜서 한다(클라우드 동기·계정격리와 같은 관례).
  // ⚠️ 2026-08-02 심사 감사 B-1: 발행이 꺼져 있으면(SOCIAL_PROFILE_PUBLISH_ENABLED=false)
  // 동의도 묻지 않는다 — 꺼진 기능의 동의를 받아 두는 건 사용자를 오도한다("공개했는데
  // 아무 데도 안 보이는" 상태). 테스트 seam 은 그대로 둔다: 이 화면 자체의 동작 검증은
  // 플래그와 무관하게 계속 돌아야 하고(1.1 재개봉 전제), seam 은 프로덕션에서 절대 켜지지 않는다.
  const consentGateOn=(globalThis as any).__KEEGO_ENABLE_SOCIAL_CONSENT__===true
    ||(SOCIAL_PROFILE_PUBLISH_ENABLED&&process.env.NODE_ENV!=='test');
  if(consentGateOn&&socialVisibility==='unset'&&shoes.length>0&&overlay==='none'&&!activeRun){
    const preview=buildPublicProfile({
      visibility:'public', // 미리보기 — 실제 공개는 아래 버튼을 눌러야 시작된다
      nickname:profileName||DEFAULT_PROFILE_NAME,
      shoes:liveRecords(shoes as any) as any,
      runs:liveRecords(runs as any) as any,
      nowMs:Date.now(),
      spec:socialSpecInput,
    });
    if(preview){
      return <SocialConsentScreen
        preview={preview}
        onAccept={()=>{setSocialVisibility('public');void saveVisibility('public');}}
        onDecline={()=>{setSocialVisibility('private');void saveVisibility('private');}}
      />;
    }
  }
  // 위치 권한 설명(priming) — 첫 GPS 런 직전. goal 화면보다 우선해 표시한다(이 분기를
  // goal 분기 앞에 둬야 goal 위에 덮인다). '계속'에서 안내 완료를 영속하고 런으로 진입,
  // '나중에'면 닫고(goal 로 복귀) 시작을 취소한다(다음 시도 시 재안내).
  if(locPrimeGoal!=null){
    return <LocationPrimeScreen
      onContinue={async()=>{const g=locPrimeGoal;setLocPrimed(true);void AsyncStorage.setItem(LOC_PRIME_KEY,'1');setLocPrimeGoal(null);
        // **여기서 실제로 묻는다.** 이 화면은 "다음 화면에서 위치와 동작·피트니스 권한을
        // 물어봐요"라고 약속하는데, 예전엔 '계속'이 동작 권한만 요청하고 위치는 카운트다운
        // 뒤 러닝 화면이 물었다 — 약속한 순서가 아니었고, 거부하면 세리머니를 다 돌린 뒤에야
        // 알게 됐다. 설명 바로 다음이 OS 다이얼로그인 게 이 화면의 존재 이유다.
        await requestLocationThenStart(g);}}
      onCancel={()=>setLocPrimeGoal(null)}/>;
  }
  if(overlay==='goal'&&pendingShoe){
    return (
      <RunGoalScreen
        // 신발은 홈 히어로에서 선택해 pendingShoe 로 넘어온다 — 이 화면은 목표만(신발 행 제거
        // 2026-07-19 민우). 신발 바꾸려면 뒤로가기 → 홈에서 다시 선택.
        age={age}
        restHR={restHR}
        runs={runs}
        // 목표 화면을 떠나면 '설정 다녀오면 시작' 대기도 함께 푼다(엉뚱한 순간의 자동 시작 방지).
        onBack={()=>{setOverlay('none');setPendingShoe(null);setPermRetryGoal(null);}}
        onStart={startActiveRun}
      />
    );
  }
  if(overlay==='countdown'&&activeRun){
    // 카운트다운 = 러닝 화면(뷰)의 countdown 모드(2026-07-16 통합, 사용자 확정 "한 링처럼").
    // 엔진 없이 레이아웃만 실물과 동일하게 렌더 — 3·2·1 이 러닝 링 그 자리에서 돌고,
    // onDone 에서 엔진 인스턴스(아래 'run' 분기)로 스왑해도 링 위치가 픽셀 그대로다.
    // GPS/권한/타이머는 기존처럼 'run' 진입 때만 시작(데이터 회계 불변).
    return (
      <RunActiveScreenView
        shoeLabel={parseShoeName(activeRun.name).model||activeRun.name}
        goalKm={activeRun.goalKm}
        goalMin={activeRun.goalMin}
        distanceKm={0} elapsedSec={0} timeLabel="0:00" paceLabel="--" avgPaceLabel="--"
        calories={0} elevationM={0} bpm={0}
        countdown={{onCancel:()=>setOverlay('goal'),onDone:()=>setOverlay('run')}}
      />
    );
  }
  if(overlay==='run'&&activeRun){
    return (
      <RunEngine
        shoe={activeRun}
        insets={insets}
        goalKm={activeRun.goalKm}
        goalMin={activeRun.goalMin}
        targetZone={activeRun.targetZone}
        pacePlan={activeRun.pacePlan}
        track={activeRun.trackLapM?{lapM:activeRun.trackLapM}:null}
        indoor={!!activeRun.indoor}
        weightKg={weightKg}
        age={age}
        restHR={restHR}
        resume={resumeSnap}
        resumeMode={resumeMode}
        onSave={async(km,dur,cad,memo,route,location,splits,elevM,cal,paceTrack,hrTrack,gapTrack,trackMeta)=>{
          // 신기록(PR) 감지 — addRun 의 낙관적 setRuns 전이라 runs 는 '이전 런들'이다.
          const prKinds=detectPRs({dist:km,durationS:dur},runs.map(r=>({dist:Number(r.km)||0,durationS:r.duration||0,runDate:r.run_date})));
          // 평균 심박을 레코드에 함께 저장(2026-07-17 비교런 수정) — 여태 undefined 로 저장돼
          // 상세 요약 카드가 '--'(심박존 카드는 hrTrack 사이드카라 정상)인 소스 불일치였다.
          // 라이브 hrTrack 이 비면(주머니 러닝) undefined 유지 → HealthKit 백필이 채운다.
          const liveHr=(hrTrack||[]).filter(p=>p.bpm>0);
          const avgBpm=liveHr.length?Math.round(liveHr.reduce((sm,p)=>sm+p.bpm,0)/liveHr.length):undefined;
          const newId=await addRun(activeRun.id,km,today(),memo||'','gps',dur,cad,route,location,avgBpm,elevM,cal);
          // 트랙 세션 마커 — RunDetail 이 track_<id> 로 읽어 '트랙 · 400m×12랩'을 표시한다.
          // 거리·페이스·PB 는 이미 랩 시계열(paceTrack=lapsToTrack)로 정본이라 별도 계산 불필요.
          // 실내 러닝은 트레드밀 노면으로 자동 태깅한다(2026-07-27) — 사용자가 '실내'를
          // 직접 골랐으므로 확정 정보다. 트레드밀은 쿠션·균일해서 아스팔트보다 덜 닳는다
          // (SURFACE_FACTOR 0.85). 이 태깅이 없으면 실내 km 가 로드로 계산돼 수명이 과소평가된다.
          if(activeRun.indoor) await setRunSurface(newId,'treadmill');
          if(trackMeta&&trackMeta.laps>0){
            await AsyncStorage.setItem('track_'+newId, JSON.stringify(trackMeta));
            // 노면 자동 태깅(2026-07-27): 트랙에서 달린 것이 **확정 정보**이므로 추측이 아니다.
            // 여태 마모 모델(SURFACE_FACTOR)은 완성돼 있는데 노면을 넣어주는 곳이 수동 런
            // 추가/편집 폼 하나뿐이라, 실제로 달린 GPS 런은 전부 road(1.0)로 계산됐다 —
            // 차별점의 정확도 장치가 실사용에서 죽어 있었다. 트랙은 우레탄이라 아스팔트보다
            // 덜 닳는다(계수 0.9).
            await setRunSurface(newId,'track');
          }
          // per-km 스플릿(레코더가 1km 통과 시각으로 남긴 실측 구간)을 localId로 영속한다.
          // route_/surface_ 와 동일 패턴(로컬 전용·동기 시 serverId로 재키잉). RunDetail이
          // splits_<id> 로 읽어 표시한다. 2구간 미만이면 표시 가치가 없어 저장 생략.
          if(splits&&splits.length>=2) await AsyncStorage.setItem('splits_'+newId, JSON.stringify(splits));
          // 곡선 전용 (거리,경과시간) 시계열 영속 — RunDetail 이 paceTrack_<id> 로 읽어 고운
          // 페이스 곡선을 그린다(없으면 per-km 스플릿으로 폴백). 2점 미만은 저장 가치 없음.
          if(paceTrack&&paceTrack.length>=2) await AsyncStorage.setItem('paceTrack_'+newId, JSON.stringify(paceTrack));
          // 심박 시계열 영속 — RunDetail/리캡이 hrTrack_<id>로 읽어 HR존 구간시간·평균/최대·
          // 트레이닝효과(TRIMP)를 산출한다. 워치 미연동(빈/0)이면 저장 생략(표시 가치 없음).
          if(hrTrack&&hrTrack.length>=2) await AsyncStorage.setItem('hrTrack_'+newId, JSON.stringify(hrTrack));
          // GAP 시계열 영속 — RunDetail이 gapTrack_<id>로 읽어 경사보정페이스(Strava식)를 낸다.
          // 고도 있는 점이 2개 미만이면 경사 계산 불가라 저장 생략.
          if(gapTrack&&gapTrack.length>=2) await AsyncStorage.setItem('gapTrack_'+newId, JSON.stringify(gapTrack));
          // Apple 건강(연동 시, 비차단) — ① 이 러닝을 HK 워크아웃으로 기록(활동 링 크레딧)
          // ② 러닝 시간창의 HK 심박을 hrTrack_<id> 로 백필(워치 컴패니언이 이미 채웠으면
          // 건너뜀 — 실측 우선). 실패는 조용히 무시(러닝 저장에 영향 0).
          {
            const hkEndMs=Date.now();const hkStartMs=hkEndMs-Math.max(1,dur)*1000;
            // 건강 앱에 워크아웃이 안 들어가면 사용자는 '기록이 없다'고 인식한다 — 무음 금지.
            void hkSaveRunWorkout(km,hkStartMs,hkEndMs,cal).catch(e=>recordError(e,'healthkit: save workout'));
            void hkBackfillAndRepair(newId,hkStartMs,hkEndMs).catch(e=>recordError(e,'healthkit: backfill HR'));
            // 심박 보강 대기 등록(경로 A 매칭·B 재시도 대상) + 지연 재시도. 워치→폰 HealthKit
            // 동기화가 저장 순간엔 덜 됐을 수 있어, 앱 유지 중이면 15s·60s 뒤 다시 채운다.
            // 이 등록이 실패하면 지연 재시도 대상에서 빠져 그 런의 심박이 영영 비어 있게 된다.
            void registerRunForHr(newId,hkStartMs,hkEndMs,Date.now()).catch(e=>recordError(e,'healthkit: register run for HR backfill'));
            setTimeout(()=>{void retryPendingHr(Date.now(),hkBackfillAndRepair).catch(()=>{});},15000);
            setTimeout(()=>{void retryPendingHr(Date.now(),hkBackfillAndRepair).catch(()=>{});},60000);
          }
          // 상세 즉시 백업(2026-07-24) — 방금 쓴 사이드카를 런별 하위 문서로 push(비차단).
          void syncRunDetails([{id:newId}],cloudPortRef.current,{max:1});
          await clearSnapshot();
          // 완주 리캡(P0-2) — 기록 탭으로 바로 점프하던 대신 축하 풀스크린을 띄운다(러너가
          // 가장 자랑스러운 순간 — 리텐션·공유 트리거). 신기록(PR)은 토스트 대신 리캡 배지로.
          const shoeLabel=parseShoeName(activeRun.name).model||activeRun.name;
          const goalKm=activeRun.goalKm;
          // 신발 마모 델타(시그니처) — 이 런이 신발 수명에 미친 영향. uiShoes 는 이 런 반영 전
          // 상태라 used 는 '이전', used+km 가 '이후'. max 0 이면 표기 생략.
          const aShoeUi=uiShoes.find(s=>s.id===activeRun.id);
          const shoeWear=aShoeUi&&aShoeUi.max>0?{
            addedKm:km,
            remainingPct:Math.max(0,Math.round((aShoeUi.max-(aShoeUi.used+km))/aShoeUi.max*100)),
            deltaPct:Math.round(km/aShoeUi.max*1000)/10,
          }:null;
          // 훈련 부하 영향(#5) — 이 런을 포함한 이번 주 부하(ACWR) 평가. 표본 부족(미확신)이면 생략.
          const loadAfter=assessTrainingLoad([...(runs as any[]),{run_date:today(),km,duration:dur}],today());
          const loadInfo=loadAfter.confident?{phrase:loadRatioPhraseKo(loadAfter),word:LOAD_WORD[loadAfter.level],level:loadAfter.level as LoadLevel}:null;
          setResumeSnap(null);setActiveRun(null);setOverlay('none');
          // 대회 감지 — GPS 시작 위치 + 날짜로 특정 대회 확정("상암 11/1 하프 → JTBC"),
          // 없으면 하프/풀 완주 시 일반 감지. 매치되면 리캡에 '대회 기록 남기기' 배너.
          const startPt=parseRoute(route||'')[0];
          const rMatch=detectRace({date:today(),startLat:startPt?.lat,startLon:startPt?.lon,km},races);
          setRecapRace(rMatch?{match:rMatch,date:today(),runId:newId,appTimeSec:dur,appPaceSec:km>0?dur/km:undefined}:null);
          // route 원문도 리캡에 전달 — 완주 직후 '오늘의 코스' 지도 + 경로 포함 공유 카드.
          // 평균 심박 — 라이브 캡처된 hrTrack 에서 산출(워치 착용 시). 주머니 러닝은 저장 후
          // 백필로 채워지므로 리캡 순간엔 0 → 타일 숨김(리캡은 즉시성, 상세는 복구본이 정본).
          const recapHrPts=(hrTrack||[]).filter(p=>p.bpm>0);
          const recapBpm=recapHrPts.length?Math.round(recapHrPts.reduce((sm,p)=>sm+p.bpm,0)/recapHrPts.length):0;
          // 기록 모먼트(공유 카드 리본) — 신기록 우선, 없으면 자연어 인사이트(네거티브 스플릿·
          // N일 연속·N일 만의 러닝·이번 달 최장) 중 top 하나. 아무 것도 없으면 undefined.
          const recapInsights=runInsights({km,durationS:dur,runDate:today(),splits:(splits||[]).map((sp:any)=>({km:sp.km,paceSec:sp.paceSec}))},(runs as any[]).map(r=>({dist:Number(r.km)||0,durationS:r.duration||0,runDate:r.run_date})),{prKinds});
          const recapMoment=prKinds.includes('longestDist')?'개인 최고 거리':prKinds.includes('fastestPace')?'개인 최고 페이스':prKinds.includes('longestTime')?'개인 최장 시간':(recapInsights[0]?.text||undefined);
          setRunRecap({km,durationS:dur,cadence:cad||0,bpm:recapBpm,splits:splits||[],elevationM:elevM||0,calories:cal||0,prKinds,moment:recapMoment,shoeName:shoeLabel,goalKm,goalMin:activeRun.goalMin,pacePlan:activeRun.pacePlan,shoeWear,loadInfo,route:route||null,track:trackMeta||null,runId:newId});
        }}
        onDiscard={()=>{void clearSnapshot();setResumeSnap(null);setActiveRun(null);setOverlay('none');}}
      />
    );
  }

  // 진척 전체화면(오버레이형) — 프로필 '진척' 버튼이 열고 뒤로 버튼이 닫는다. 런/신발
  // 원본은 읽기 전용으로 넘기고(데이터 파괴 0), 닉네임은 profile_name 을 그대로 쓴다.
  // 명예의 전당(라이브 리더보드) 전체화면 — Firestore 월간 카테고리별 랭킹. provider 가
  // 미로그인/쿼리 실패면 빈 상태로 떨어진다(가짜 경쟁자 금지). 내 엔트리 발행은 클라우드
  // 동기(publishMyRanking)가 담당하므로 화면엔 별도 device 연결이 필요 없다.
  // showProgression 보다 먼저 검사한다 — 진척 위에 띄우고 뒤로 가면 진척으로 복귀(스택 보존).
  // 셀러브레이션(등급상승/업적) — 풀스크린 오버레이. 닫으면 큐의 다음 항목 또는 종료.
  if(celebration){
    return <CelebrationScreen data={celebration} onClose={closeCelebration}/>;
  }
  if(showHallOfFame){
    // 러너 프로필은 랭킹 **위에** 얹힌다 — 닫으면 보던 순위 자리로 그대로 돌아온다.
    if(viewedRunner){
      return <RunnerProfileScreen
        uid={viewedRunner.uid} fallbackName={viewedRunner.name}
        port={cloudPortRef.current} onClose={()=>setViewedRunner(null)}/>;
    }
    return <HallOfFameScreen profileName={profileName}
      onOpenRunner={(uid,name)=>setViewedRunner({uid,name})}
      onBack={()=>setShowHallOfFame(false)}/>;
  }

  if(showProgression){
    // 라이브 리더보드(HallOfFame) 진입 — 2026-08-01 재개봉.
    // **공개에 동의한 사용자에게만 보인다.** 비공개인 사람에게 랭킹 입구를 보여주면
    // 들어가서 빈 화면을 보거나(내 엔트리가 없다) 남의 기록만 구경하게 된다 —
    // 둘 다 이상하다. 동의가 곧 참여 조건이다.
    // 초기에 사람이 적어 초라해 보이는 건 감수한다(민우님 결정 2026-08-01):
    // "내가 순위권이네?"는 앱 초기에만 존재하는 경험이라 아꼈다 쓸 수 없다.
    //
    // ⚠️ 2026-08-02 심사 감사 B-3: **발행 플래그도 함께 본다.** 발행이 꺼져 있으면
    // 아무도 엔트리를 올리지 않으므로 어느 달이든 리더보드가 비어 있고, 화면은 영구히
    // "랭킹이 곧 열려요"만 띄운다 — 스토어 설명에 적힌 기능이 실제로는 빈 화면인 상태라
    // App Store 2.1(미완성)·4.2('coming soon')에 걸린다. 진입점은 **데이터를 만드는
    // 플래그를 따라가야 한다** — 동의 여부만 보면 둘이 어긋난다.
    return <ProgressionScreen runs={runs} shoes={shoes} profileName={profileName} challenges={contextChallenges}
      onBack={()=>setShowProgression(false)}
      {...(LEADERBOARD_PUBLISH_ENABLED&&socialVisibility==='public'?{onOpenHallOfFame:()=>setShowHallOfFame(true)}:{})}/>;
  }

  // 명예의 전당(은퇴 신발 박물관) 전체화면 — 영속된 은퇴 레코드를 그대로 전시한다
  // (리로드에도 보존). 데이터를 만들지 않고 progState.retiredShoes 만 읽는다(읽기 전용).
  if(showHallOfShoes){
    return <HallOfShoes records={retiredRecords} unit={unit} userName={profileName} onBack={()=>setShowHallOfShoes(false)} onGoShoes={()=>{setShowHallOfShoes(false);setTab(1);}}/>;
  }
  if(showArchive){
    return <ShoeArchiveScreen shoes={archivedUiShoes} unit={unit} onRestore={(id)=>retireShoe(id,false)} onBack={()=>setShowArchive(false)}/>;
  }
  // 부상위험 상세 — 홈 신호등 카드(InjuryRiskCard) 탭으로 진입. 활성(히어로) 신발 마모 ×
  // 전체 런 부하를 융합해 코칭을 보여준다. runs/활성 신발만 읽는 읽기 전용 오버레이.
  // (부상위험 상세 화면 제거 2026-07-05 애널리틱스 다이어트 — 홈 진입점이 사라져 도달 불가.)
  // 완주 리캡 — 러닝 저장 직후 축하 풀스크린. '완료'로 닫으면 기록 탭으로 이동한다.
  // 대회 기록 흐름 — 완주 감지 배너/아카이브 추가에서 진입. 저장 시 로컬 우선 영속 + 상태 갱신.
  if(medalFlow){
    return <RaceMedalScreen
      date={medalFlow.date} runId={medalFlow.runId}
      appTimeSec={medalFlow.appTimeSec} appPaceSec={medalFlow.appPaceSec}
      presetRaceId={medalFlow.presetRaceId} presetDistance={medalFlow.presetDistance}
      races={races} recognizer={nativeRecognizer ?? undefined}
      onSave={(m)=>{const stamped={...m,updatedAt:Date.now()};setMedals(cur=>sortMedals([stamped,...cur.filter(x=>x.id!==stamped.id)]));void addMedalStore(stamped);setMedalFlow(null);setShowMedalArchive(true);}}
      onClose={()=>setMedalFlow(null)}/>;
  }
  if(showFindShoes){
    return <FindShoesScreen
      myShoes={homeShoes.map(x=>({brand:x.ui.brand,model:x.ui.model,
        usedKm:x.ui.used??0,lifespanKm:x.ui.max??0}))}
      onClose={()=>setShowFindShoes(false)} />;
  }
  if(showMedalArchive){
    return <MedalArchiveScreen medals={liveMedals(medals)}
      onBack={()=>setShowMedalArchive(false)}
      onAddMedal={()=>setMedalFlow({date:today()})}
      onDelete={(id)=>{
        // 키프세이크(메달) 보호 = 확인 다이얼로그 1겹(2026-07-25 민우님 확정 — 실행취소
        // 액션 전면 폐지). 삭제 자체는 soft-delete 라 데이터 파괴는 아니다. 대회명은 상세
        // 화면에 이미 크게 있어 카피에서 반복하지 않는다.
        showDialog('메달 삭제','아카이브에서 사라져요.',[
          {text:'취소',style:'cancel'},
          {text:'삭제',style:'destructive',onPress:()=>{
            const now=Date.now();
            setMedals(cur=>cur.map(m=>m.id===id?{...m,deleted:true,updatedAt:now}:m));
            void removeMedalStore(id,now);
            showToast({message:'메달 삭제됨'});
          }},
        ]);
      }}/>;
  }
  if(runRecap){
    return <RunRecapScreen {...runRecap} unit={unit}
      onSaveMeta={saveRunMeta}
      raceMatch={recapRace?.match ?? null}
      onLogRace={recapRace?()=>{
        const rc=recapRace;setRunRecap(null);setRecapRace(null);
        setMedalFlow({date:rc.date,runId:rc.runId,appTimeSec:rc.appTimeSec,appPaceSec:rc.appPaceSec,
          presetRaceId:rc.match.kind==='geo'?rc.match.race?.id:undefined,presetDistance:rc.match.distance});
      }:undefined}
      onDelete={runRecap.runId?()=>{
        // 자동 저장(심사 #1) 이후의 '버리기' — 이미 저장된 기록의 삭제라 확인 1겹 + 기존
        // deleteRun 경로(실행취소 스낵바 포함)를 그대로 탄다.
        const rid=String(runRecap.runId);
        showDialog('기록 삭제',`방금 저장한 ${runRecap.km.toFixed(2)}km 기록을 삭제할까요?`,[
          {text:'취소',style:'cancel'},
          {text:'삭제',style:'destructive',onPress:()=>{setRunRecap(null);setRecapRace(null);void deleteRun(rid);setTab(2);}},
        ]);
      }:undefined}
      onClose={()=>{setRunRecap(null);setRecapRace(null);setTab(2);maybePrimePush();}}/>;
  }
  return(
    <View style={{flex:1,backgroundColor:BG}}>
      <View style={{flex:1}}>
        {tab===0&&(
          <HomeScreen
            shoes={homeUiShoes} week={week} dateLabel={dateLabel} unit={unit} userName={profileName}
            activeIdx={homeActiveIdx} onSelect={selectHomeShoe}
            onStart={startFromIdx} onAddShoe={()=>setOverlay('add')} onTab={setTab}
            forecast={homeForecast}
            onOpenShoe={(id)=>{setSelectedShoeId(id);setShoesDetailId(id);setTab(1);}}
            progression={homeProgression}
            onRefresh={refreshData} lastSyncAt={lastSyncAt}
            weeklyGoalKm={goalWeeklyKm} onChangeWeeklyGoal={changeWeeklyGoal}
            weekDays={weekBuckets(runs, mon).map(v => v > 0)}
            weekTodayIdx={(now.getDay() + 6) % 7}
            load={homeLoad}
            rotation={rotationPicks}
          />
        )}
        {tab===2&&(
          <HistoryScreen
            shoes={uiShoes} runs={uiRuns} summary={summary} chart={chart} unit={unit} onTab={setTab}
            onAddRun={addManualRun} onEditRun={editRun} onDeleteRun={deleteRun}
            onRefresh={refreshData}
            age={age} sex={sex} restHR={restHR}
            todayISO={today()}
          />
        )}
        {tab===1&&(
          <ShoesScreen
            shoes={uiShoes} runs={uiRuns} totals={shoeTotals}
            unit={unit} weightKg={weightKg} surfaceOf={surfaceOf}
            onAddShoe={()=>setOverlay('add')} onTab={setTab}
            onRename={updateShoeName} onDelete={deleteShoe} onRetire={retireShoe}
            onSetMaxKm={updateShoeMaxKm} onStartRun={startFromShoeId}
            detailShoeId={shoesDetailId} onConsumeDetail={()=>setShoesDetailId(null)}
            rawShoes={shoes} rawRuns={runs} progressionCtx={progressionCtx} userName={profileName}
            onRetiredKeepsake={onRetiredKeepsake} forecasts={homeForecasts}
            age={age} sex={sex} restHR={restHR}
            onOpenArchive={()=>setShowArchive(true)} archivedCount={archivedUiShoes.length}
          />
        )}
        {tab===3&&(
          <ProfileScreen
            profile={profile} badges={badges} records={records} distancePBs={distancePBs} onTab={setTab}
            onProviderSignedIn={(p)=>{pendingProviderRef.current=p;}}
            socialVisibility={socialVisibility}
            onToggleSocial={(next)=>{setSocialVisibility(next);void saveVisibility(next);}}
            profilePhotoUri={profilePhoto} onChangeName={changeProfileName} onPickPhoto={pickProfilePhoto}
            weightKg={weightKg} onChangeWeight={changeWeight}
            age={age} onChangeAge={changeAge} sex={sex} onChangeSex={changeSex}
            restHR={restHR} onChangeRestHR={changeRestHR}
            initialOpen={profileInitialOpen} onConsumeInitialOpen={()=>setProfileInitialOpen(null)}
            unit={unit} onChangeUnit={changeUnit}
            alerts={alerts} onChangeAlerts={changeAlerts}
            notifSettings={notifSettings} onChangeNotifSettings={changeNotifSettings}
            recapRuns={runs} recapShoes={shoes}
            backupData={backupData}
            todayISO={today()}
            cloudPort={cloudPortRef.current} onCloudMerged={onCloudMerged}
            onDeleteAccount={handleDeleteAccount}
            onOpenProgression={()=>setShowProgression(true)}
            onOpenHallOfShoes={()=>setShowHallOfShoes(true)} retiredCount={retiredRecords.length}
            onOpenMedalArchive={()=>setShowMedalArchive(true)} medalCount={liveMedals(medals).length}
            onOpenFindShoes={()=>setShowFindShoes(true)}
            // 랭킹은 **공개에 동의한 사람에게만** 준다. 비공개인데 입구를 보여주면
            // 들어가서 내 자리가 없는 목록을 보게 된다(2026-08-01 판단 유지).
            {...(LEADERBOARD_PUBLISH_ENABLED&&socialVisibility==='public'
              ?{onOpenRanking:()=>setShowHallOfFame(true)}:{})}
            onReplayOnboarding={()=>setPreviewOnboard(true)}
          />
        )}
      </View>
    </View>
  );
}

// (라이브 러닝 엔진은 screens/RunEngine.tsx 로 분리 — 감사 F-03 1단계, 2026-07-26.
//  App.tsx 는 부팅·인증·동기화·CRUD·라우팅을 맡고, 러닝 실행은 그 파일이 소유한다.)
