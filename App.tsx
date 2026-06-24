import React, {useState, useEffect, useRef, useMemo} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, StatusBar,
  Linking, AppState,
} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Pedometer} from 'expo-sensors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Tts from 'react-native-tts';

import {
  BG, CARD, CARD_HI as SURFACE, ACCENT, WARN, DANGER, T1, T2, T3,
  FONT as FP, DISPLAY as FH, SEP, RADIUS, Shoe, Run,
} from './theme';
import {Ring, Button} from './primitives';
import ErrorBoundary from './ErrorBoundary';
import ToastHost from './ToastHost';
import {installCrashHandler, setCrashUser} from './lib/crashlytics';
import {apiAuth, apiGetShoes, apiGetRuns, fetchWithTimeout} from './lib/api';
import {devSeedShoes, devSeedRuns} from './lib/devSeed';
// BackendShoe / BackendRun 은 types.d.ts 의 전역 ambient 인터페이스(import 불필요).
import HomeScreen, {WeekStats} from './HomeScreen.rn';
import HistoryScreen, {PeriodSummary, PeriodChart} from './HistoryScreen.rn';
import ShoesScreen, {ShoeTotals} from './ShoesScreen.rn';
import ProfileScreen, {Profile, Badge, PersonalRecord} from './ProfileScreen.rn';
import AddShoeScreen from './AddShoeScreen.rn';
import OnboardingScreen, {RegisteredShoe} from './OnboardingScreen.rn';
import RunGoalScreen from './RunGoalScreen.rn';
import RunCountdownScreen from './RunCountdownScreen.rn';
import RunActiveScreenView from './RunActiveScreen.rn';
import ProgressionScreen from './ProgressionScreen.rn';
import HallOfShoes from './HallOfShoes.rn';
import ShoeArchiveScreen from './ShoeArchiveScreen.rn';
import HallOfFameScreen from './HallOfFameScreen.rn';
import {buildContext} from './lib/progression/context';
import {getProgression, pickRecentAchievement, collectUnlockedKeys} from './lib/progression';
import {RANK_XP} from './lib/progression/rank';
import {TIER_LABEL} from './theme';
import CelebrationScreen, {CelebrationData} from './CelebrationScreen.rn';
import {loadProgression, saveProgression} from './lib/progression/storage';
import {mergeCelebBaseline} from './lib/celebrationBaseline';
import {success as hapticSuccess} from './lib/haptics';
import type {ProgressionState, RetiredShoeRecord} from './lib/progression/types';
import type {HomeProgression, HomeChallengeView} from './HomeScreen.rn';
import {challengeProgress} from './lib/challenges';

import {simplifyRoute} from './lib/geo';
import {runTracker} from './lib/runTracker';
import {
  requestRunPermissions, startTracking, stopTracking, isPermissionError,
  RunPermissions,
} from './lib/locationService';
import {initStepCadence, feedStepCount} from './lib/stepCadence';
import {fmtPace, fmtTime, fmtKDate, getMonday, ymdLocal} from './lib/format';
import {
  sumKm, avgPaceLabel, totalTimeLabel, durationLabel, summaryOf, maxDayStreak,
  weekBuckets, monthBuckets, yearBuckets,
} from './lib/stats';
import {parseShoeName, shoeHealth, isRetired, DEFAULT_MAX_KM, clampMaxKm, reconcileShoeAlerts, KEEP_GOING_REPLACE} from './lib/shoe';
import {setRunSurface, parseSurface, type Surface} from './lib/wearModel';
import {forecastReplacement, type ReplacementForecast} from './lib/replacementForecast';
import {mostRecentShoeId, lastWornDate} from './lib/shoeRecommend';
import {recommendRotation} from './lib/rotation';
import {
  loadSnapshot, clearSnapshot, isResumable,
  enqueuePendingRun, loadPendingRuns, overlayPendingRuns,
  RunSnapshot, PendingRun,
} from './lib/runPersistence';
import {Unit, kmToDisplay, displayNum} from './lib/units';
import {
  AlertSettings, loadSettings, saveUnit, saveGoal, saveAlerts, saveWeight,
  clampGoal, DEFAULT_SETTINGS,
} from './lib/settings';
import {estimateCalories} from './lib/calories';
import {
  getNotifSettings, setNotifSettings, dueNotifications,
  DEFAULT_NOTIF_SETTINGS, type NotifSettings, type NotifState, type ShoeForecast,
} from './lib/notifications';
import {presentDue, setupPushMessaging, type PushWiring} from './lib/pushMessaging';
import {weeklyProgress, currentStreak, personalRecords} from './lib/goals';
import {serializeBackup, BackupV1, BackupPayload} from './lib/backup';
import {Challenge, ChallengeRun} from './lib/challenges';
import {ExtChallenge, challengeExtProgress, type ExtRun, type ExtShoe} from './lib/progression/challengesExt';
import {createFirebaseCloudPort} from './lib/firebaseCloudPort';
import {getAuth, onAuthStateChanged} from '@react-native-firebase/auth';
import {LoginScreen} from './LoginScreen.rn';
import {stampUpdatedAt, markDeleted, partitionTombstones, mergeCloudData, liveRecords} from './lib/cloudSync';
import {publishMyRanking} from './lib/progression/firestoreRankingStore';
import {migrateRestToFirestore, REST_MIGRATION_KEY} from './lib/restToFirestoreMigration';
import {genRunId, genShoeId} from './lib/genId';
import {showToast, TOAST_UNDO_LABEL} from './lib/toast';
import {migrateStorageSchema} from './lib/storageMigration';
import {resolveGoogleCredential} from './lib/googleAuth';
import {resolveAppleCredential} from './lib/appleAuth';
import {resolveKakaoFirebaseToken} from './lib/kakaoAuth';
import {resolveNaverFirebaseToken} from './lib/naverAuth';
import {pickShoePhoto} from './lib/photo';

// 로컬 백업 가져오기 시 원본을 보관하는 신규 AsyncStorage 키(기존 키 파괴 금지).
const K_BACKUP_IMPORT = 'imported_backup_v1';
// 개인 챌린지 목록을 영속하는 신규 AsyncStorage 키(개인 전용 — 계정/서버 불필요).
const K_CHALLENGES = 'challenges_v1';
// 스마트 챌린지 목표 거리(km) 사용자 오버라이드(챌린지 id→km). 로컬 전용 신규 키.
const K_SMART_TARGET = 'smart_target_km_v1';
// 프로필 이름/사진(로컬 전용 — 개인 식별, 서버 불필요). 신규 키라 기존 데이터와 격리.
const K_PROFILE_NAME = 'profile_name';
const K_PROFILE_PHOTO = 'profile_photo';
const DEFAULT_PROFILE_NAME = '러너';
// 포그라운드에서 이미 표시한 푸시 알림 key 집합(당일 1회 표시, A8-4). 키는 날짜 스탬프를
// 포함하므로(예: 'run_reminder:2026-06-09') 다음 날엔 자연히 새 키가 되어 다시 표시된다.
const K_NOTIF_PRESENTED = 'notif_presented';

// audit#9/#10: 콜드 백엔드 부팅 상태기계. 'loading'(스켈레톤) → 'ready'(정상) |
// 'error'(재시도 카드). 'error'는 fetch 실패만을 의미하며, 빈-신규(fetch 성공 + 빈
// 배열)와 구분된다 — 신규 사용자는 재시도 카드가 아니라 온보딩/빈 홈을 본다.
type BootState = 'loading' | 'ready' | 'error';

// 첫 실행 온보딩 / 위치 권한 priming 의 1회성 플래그 키(AsyncStorage 영속).
const ONBOARD_KEY = 'onboarded';        // 온보딩 완료
const LOC_PRIME_KEY = 'loc_perm_primed'; // 위치 권한 사전 안내 완료
// 로컬-퍼스트 폴백 캐시: 마지막으로 성공한 신발/런을 보관해, 콜드/다운 백엔드에서도
// 재시도 카드 대신 '오프라인 부팅'으로 마지막 데이터를 보여준다(랭킹·동기화는 복구 시).
const CACHE_SHOES_KEY = 'cache_shoes_v1';
const CACHE_RUNS_KEY = 'cache_runs_v1';
// audit a2: soft-delete 묘비(tombstone) 영속 키. 삭제는 하드삭제 대신 {id,deleted:true,
// updatedAt} 묘비로 표현해, 라이브 신발/런 배열엔 안 보이게 하면서도 backupData 에 실어
// 클라우드 머지로 삭제가 전파되고(다른 기기에서도 사라짐) 부활하지 않게 한다. REST 는 정본
// (실제 DELETE)이고, 묘비는 Firestore 백업 머지가 지워진 레코드를 되살리지 못하게 막는다.
const K_TOMBSTONES = 'tombstones_v1';
// ── 셀러브레이션(등급상승/업적) 트리거 — 한글 매핑 + '이미 본 것' 베이스라인 키 ──────────
const CELEB_SEEN_KEY = 'celebration_seen_v1';
const CELEB_RANK_KO: Record<string, string> = {bronze: '브론즈', silver: '실버', gold: '골드', platinum: '플래티넘', diamond: '다이아몬드', master: '마스터', legend: '레전드'};
const CELEB_CAT_KO: Record<string, string> = {runningMilestone: '러닝 마일스톤', distanceMilestone: '거리 마일스톤', shoeJourney: '신발 여정', shoeMemory: '신발 추억', experience: '경험', keego: 'Keego'};
const CELEB_RARITY: Record<string, {ko: string; color: string}> = {common: {ko: '커먼', color: '#9A9A9A'}, rare: {ko: '레어', color: '#4B93F7'}, epic: {ko: '에픽', color: '#A468F0'}, legendary: {ko: '레전더리', color: '#E7B84B'}};
/** 부팅 폴백 캐시 로드 — 신발 배열이 있으면 {shoes,runs}, 없으면(미존재/손상) null. */
async function loadBootCache(): Promise<{shoes: any[]; runs: any[]} | null> {
  try {
    const [s, r] = await Promise.all([
      AsyncStorage.getItem(CACHE_SHOES_KEY),
      AsyncStorage.getItem(CACHE_RUNS_KEY),
    ]);
    const shoes = JSON.parse(s || 'null');
    if (!Array.isArray(shoes)) return null;
    const runs = JSON.parse(r || 'null');
    return {shoes, runs: Array.isArray(runs) ? runs : []};
  } catch {
    return null;
  }
}


// keep-going 톤: 실패를 '끝'이 아니라 '잠깐 멈춤'으로 프레이밍해 재시도를 유도한다.
const KEEP_GOING_RETRY = '잠깐 숨 고르는 중이에요. 다시 시도하면 계속 달릴 수 있어요.';
// keep-going 톤(로딩): 스켈레톤이 비어 보이지 않도록 '곧 이어 달린다'는 안내를 얹는다.
const KEEP_GOING_LOADING = '기록을 불러오는 중이에요. 곧 다시 달릴 수 있어요.';

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
function openLocationSettingsAlert(message:string){
  Alert.alert('위치 권한 필요',message,[
    {text:'닫기',style:'cancel'},
    {text:'설정 열기',onPress:()=>{Promise.resolve(Linking.openSettings()).catch(()=>{});}},
  ]);
}

// 부팅 시 전역 JS 에러 핸들러 설치 — 잡히지 않은 예외를 Crashlytics 에 기록(멱등·graceful).
// 모듈 로드 시 1회. jest 등 ErrorUtils 부재 환경에선 no-op 으로 폴백한다.
installCrashHandler();

export default function App(){
  return(
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={BG}/>
      <ErrorBoundary>
        <Main/>
      </ErrorBoundary>
      {/* 전역 스낵바 호스트 — 앱 어디서든 showToast()를 부르면 여기서 그린다(루트 1회 마운트). */}
      <ToastHost/>
    </SafeAreaProvider>
  );
}

function Main(){
  const [tab,setTab]=useState(0);                 // 0 home · 1 history · 2 shoes · 3 profile
  const [shoes,setShoes]=useState<BackendShoe[]>([]);
  const [runs,setRuns]=useState<BackendRun[]>([]);
  // audit a2: soft-delete 묘비 저장소. 라이브 shoes/runs 는 항상 묘비-free(삭제 레코드 0)라
  // 화면/집계가 자동으로 삭제를 제외한다. 묘비는 여기에만 모아 backupData 에 합류시켜 동기로
  // 삭제를 전파하고, 머지 결과는 applyBackupPayload 가 다시 live/묘비로 분리해 이 불변식을
  // 유지한다(한 id 가 live 와 묘비에 동시에 있지 않는다 → 자기충돌 부활 없음).
  const [tombstones,setTombstones]=useState<{shoes:BackendShoe[];runs:BackendRun[]}>({shoes:[],runs:[]});
  // 런별 노면 태그 캐시(surface_<runId> → Surface). 실효 마모/교체 예측 보정용. 미태그는
  // road로 동작(차단 아님). runs 변경 시 한 번에 읽어들이고, 손상/실패는 무시한다.
  const [runSurfaces,setRunSurfaces]=useState<Record<string,Surface>>({});
  // 홈/신발 화면이 공유하는 '선택 신발' id. null이면 휴식 로테이션 추천 신발로 폴백한다
  // (activeIdx={0} 하드코딩 제거 — 선택/추천이 홈 히어로와 신발 '사용 중' 표시를 함께 몬다).
  const [selectedShoeId,setSelectedShoeId]=useState<string|null>(null);
  // 홈 카드 → 화면 이동: 히어로 신발 탭 시 그 신발 상세를 신발탭에서 열고, 주간목표 탭 시
  // 프로필의 목표 설정 패널을 펼친 채 진입한다(각각 한 번만 소비).
  const [shoesDetailId,setShoesDetailId]=useState<string|null>(null);
  const [profileInitialOpen,setProfileInitialOpen]=useState<'weight'|'alerts'|'account'|'import'|null>(null);
  // 진척(랭크·타이틀·업적) 전체화면 표시 여부. 프로필의 '진척' 버튼이 열고, 화면의
  // 뒤로 버튼이 닫는다. 기존 탭/온보딩 부트 흐름과 독립적인 오버레이형 게이트다.
  const [showProgression,setShowProgression]=useState(false);
  // 명예의 전당(은퇴 신발 박물관) 전체화면 표시 여부. 프로필 진입 버튼이 열고 화면
  // 뒤로 버튼이 닫는다. 진척과 같은 오버레이형 게이트(부트 흐름과 독립).
  const [showHallOfShoes,setShowHallOfShoes]=useState(false);
  const [showArchive,setShowArchive]=useState(false);
  // 명예의 전당(라이브 리더보드) 전체화면 표시 여부 — 진척 화면 헤더 버튼이 연다.
  const [showHallOfFame,setShowHallOfFame]=useState(false);
  // 진척 영속 상태(progression_v1) — Hall of Shoes 레코드 + 은퇴 키프세이크 컨텍스트의
  // 소스. 마운트 시 로드하고, 은퇴 확정 시 레코드를 ADDITIVE 하게 덧붙인다(파생값은 재계산).
  const [progState,setProgState]=useState<ProgressionState|null>(null);
  // 셀러브레이션(등급상승/업적 획득) — 현재 표출 1건 + 대기 큐 + '이미 본 것' 베이스라인.
  const [celebration,setCelebration]=useState<CelebrationData|null>(null);
  const celebQueueRef=useRef<CelebrationData[]>([]);
  const celebBaselineRef=useRef<{ach:string[];tier:string}|null>(null);
  const [celebReady,setCelebReady]=useState(false);
  const [overlay,setOverlay]=useState<'none'|'add'|'goal'|'countdown'|'run'>('none');
  const [pendingShoe,setPendingShoe]=useState<{id:string;name:string;ui:Shoe}|null>(null);
  const [activeRun,setActiveRun]=useState<{id:string;name:string;goalKm:number}|null>(null);
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
  const [deviceId,setDeviceId]=useState<string>('');
  // 개인 챌린지 목록(거리·연속일). 신규 키(K_CHALLENGES)로 영속하며 런 기록에서
  // 진행률을 파생한다(lib/challenges). 기존 키와 분리돼 데이터 파괴 위험이 없다.
  const [challenges,setChallenges]=useState<Challenge[]>([]);
  // 확장 챌린지(monthly/shoe/rotation, 스마트 추천 수락분). 기존 distance/streak 과 같은
  // 키(K_CHALLENGES)에 한 배열로 함께 영속하되, kind 로 분리해 서로를 건드리지 않는다.
  const [extChallenges,setExtChallenges]=useState<ExtChallenge[]>([]);
  // 스마트 챌린지 목표 거리(km) 사용자 오버라이드 — 챌린지 id별. 마이 탭 카드의 수정 버튼이
  // 조정하며 K_SMART_TARGET 에 영속한다. 주가 바뀌어 챌린지 id가 달라지면 자동으로 추천
  // 기본값으로 복귀(맵에 키가 없으면 미적용). 읽기 전용 표시라 런/신발 데이터와 격리된다.
  const [smartTargetById,setSmartTargetById]=useState<Record<string,number>>({});
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{initUser();},[]);

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
    const view=getProgression(runs,shoes,progState??undefined);
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
      try{void AsyncStorage.setItem(CELEB_SEEN_KEY,JSON.stringify(merged));}catch{}
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
          rankName:(TIER_LABEL as Record<string,string>)[tier]??tier,
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
  },[runs,shoes,progState,celebReady]);

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
      }catch(e){console.log('challenges load error',e);}
    })();
  },[]);

  // 스마트 챌린지 목표 거리(km) 오버라이드 복원(신규 키 — 1회). 손상/부재는 조용히 빈 맵으로
  // 폴백한다. 값이 유한한 양수인 항목만 받아들인다(데이터 위생). 기존 데이터와 격리.
  useEffect(()=>{
    (async()=>{
      try{
        const raw=await AsyncStorage.getItem(K_SMART_TARGET);
        if(!raw)return;
        const obj=JSON.parse(raw);
        if(!obj||typeof obj!=='object')return;
        const clean:Record<string,number>={};
        for(const[id,km]of Object.entries(obj)){
          const n=Number(km);
          if(typeof id==='string'&&Number.isFinite(n)&&n>0)clean[id]=n;
        }
        setSmartTargetById(clean);
      }catch(e){console.log('smart target load error',e);}
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
      }catch(e){console.log('profile load error',e);}
    })();
  },[]);

  // 푸시 알림 설정 복원(신규 키 — 네트워크 무관, 1회). 손상/부재는 getNotifSettings 가
  // 기본값으로 graceful 폴백하므로 별도 방어가 필요 없다(기존 settings_alerts 불변).
  useEffect(()=>{
    (async()=>{
      try{setNotifSettingsState(await getNotifSettings());}catch(e){console.log('notif settings load error',e);}
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
          await AsyncStorage.setItem(CACHE_SHOES_KEY,JSON.stringify(shoes));
          await AsyncStorage.setItem(CACHE_RUNS_KEY,JSON.stringify(runs));
        }catch{/* 캐시 쓰기 실패는 삼킨다(다음 mutation 에서 재시도) */}
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

  // audit a4: 앱측 FCM 배선(부팅 직후 1회). setupPushMessaging 가 권한→토큰 취득→
  // 'fcm_token_pending' 영속+등록(백엔드 등록 API 미존재 → graceful no-op 큐잉)→포그라운드
  // 메시지/onTokenRefresh 핸들러를 한 번에 처리한다. 내부가 전 과정을 try/catch 로 감싸므로
  // 권한 거부·토큰 실패·네이티브 부재 등 어떤 실패도 throw 하지 않는다 — 토큰 배선이 부팅을
  // 막지 않는다(iron law: 비차단). 포그라운드 FCM 수신 시 dueNotifications 표시를 트리거하고,
  // 언마운트 시 두 핸들러를 해제한다. mount 1회만 배선한다(중복 등록 방지).
  useEffect(()=>{
    let wiring:PushWiring|null=null;
    let cancelled=false;
    void (async()=>{
      try{
        const w=await setupPushMessaging({
          onForegroundMessage:()=>{presentDueRef.current?.();},
        });
        if(cancelled){w.unsubscribeForeground();w.unsubscribeTokenRefresh();}
        else wiring=w;
      }catch(e){console.log('push wiring error',e);} // 비차단(이중 방어)
    })();
    return ()=>{
      cancelled=true;
      try{wiring?.unsubscribeForeground();wiring?.unsubscribeTokenRefresh();}catch{/* no-op */}
    };
  },[]);

  // 런별 노면 태그(surface_<runId>) 일괄 로드 → 실효 마모/예측 보정에 반영. runs가 바뀔
  // 때마다 multiGet으로 한 번에 읽고, 손상/실패/미태그는 road로 graceful 폴백한다(차단 아님).
  useEffect(()=>{
    let alive=true;
    const ids=runs.map(r=>String(r.id)).filter(Boolean);
    if(ids.length===0){setRunSurfaces({});return;}
    (async()=>{
      try{
        const vals=await Promise.all(ids.map(id=>AsyncStorage.getItem('surface_'+id)));
        if(!alive)return;
        const map:Record<string,Surface>={};
        ids.forEach((id,i)=>{const v=vals[i];if(v!=null) map[id]=parseSurface(v);});
        setRunSurfaces(map);
      }catch{/* 손상/실패는 무시 — 전부 road로 동작 */}
    })();
    return()=>{alive=false;};
  },[runs]);

  // audit#2: 미완료 런 감지 → 복구/저장 프롬프트. 한 번만 묻는다.
  useEffect(()=>{
    let asked=false;
    (async()=>{
      const snap=await loadSnapshot();
      if(asked||!isResumable(snap)||!snap) return;
      asked=true;
      Alert.alert(
        '미완료 런 발견',
        `${snap.dist.toFixed(2)}km · ${fmtTime(snap.elapsed)} 기록이 남아 있습니다.\n이어서 달릴까요, 여기까지 저장할까요?`,
        [
          {text:'버리기',style:'destructive',onPress:()=>{void clearSnapshot();}},
          {text:'기록 저장',onPress:()=>{
            setActiveRun({id:snap.shoe.id,name:snap.shoe.name,goalKm:snap.goalKm});
            setResumeMode('review');
            setResumeSnap(snap);
            setOverlay('run');
          }},
          {text:'이어 달리기',onPress:()=>{
            // GPS/센서를 다시 켜고 누적 거리·경과시간을 시드해 계속 달린다(엔진 seed*).
            setActiveRun({id:snap.shoe.id,name:snap.shoe.name,goalKm:snap.goalKm});
            setResumeMode('continue');
            setResumeSnap(snap);
            setOverlay('run');
          }},
        ],
      );
    })();
  },[]);

  async function initUser(){
    // 재시도(재진입) 시 스켈레톤으로 되돌려 직전 에러 카드를 치운다.
    setBootState('loading');
    let did=await AsyncStorage.getItem('device_id');
    if(!did){did='sl_'+Date.now()+'_'+Math.random().toString(36).substr(2,9);await AsyncStorage.setItem('device_id',did);}
    setDeviceId(did);
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
    // Stage 3(Firestore 정본 부팅): 로컬 캐시로 즉시 'ready'. 원격 복원은 runCloudSync
    // effect(authUser.uid)가 pull→merge→push 로 수행한다 — 재설치/기기변경 데이터 복구 포함.
    // REST 콜드대기/에러 카드가 사라진다(부팅은 로컬 캐시 로드라 실패하지 않는다). 첫 실행/
    // 캐시 없음은 빈 상태로 'ready'(온보딩). 레거시 미동기 큐가 남아 있으면 오버레이해 보존한다
    // (다음 cloudSync 가 Firestore 로 올린다).
    const bootCache=await loadBootCache();
    let pending:any[]=[];
    try{pending=await loadPendingRuns();}catch{}
    let liveShoes:any[]=bootCache?bootCache.shoes:[];
    let liveRuns:any[]=overlayPendingRuns(bootCache?bootCache.runs:[],pending);
    // 개발 전용 데모 시드(디자인/에뮬 검증용 로컬 목). 운영 안전 3중 게이트:
    //   ① __DEV__  ② NODE_ENV!=='test'  ③ 빈 신발(실데이터 안 덮음).
    if(__DEV__ && process.env.NODE_ENV!=='test' && liveShoes.length===0 && (globalThis as any).__KEEGO_DEV_SEED__!==false){
      liveShoes=devSeedShoes();liveRuns=devSeedRuns();
      try{await AsyncStorage.setItem(CACHE_SHOES_KEY,JSON.stringify(liveShoes));await AsyncStorage.setItem(CACHE_RUNS_KEY,JSON.stringify(liveRuns));}catch{}
    }
    setShoes(liveShoes);setRuns(liveRuns);
    setBootState('ready');
    checkShoeAlerts(liveShoes,liveRuns,st.alerts);
  }

  // 당겨서 새로고침(RefreshControl) 진입점 — Home/History 가 호출한다. Stage 3(Firestore 정본):
  // 클라우드 동기(pull→merge→push)를 재호출한다. 미로그인이면 runCloudSync 가 no-op. lastSyncAt
  // 칩은 runCloudSync 가 갱신한다. 실패는 던지지 않고 조용히 무시(스피너만 내림 — 비차단).
  async function refreshData(){
    try{await runCloudSyncRef.current();}catch{/* 오프라인/실패 — 화면 데이터 유지(비차단) */}
  }

  async function addShoe(name:string,maxKm:number,startKm:number,date:string){
    // Stage 2: 신발 생성은 Firestore 정본. 로그인(authUser)만 있으면 클라이언트 id 로 즉시
    // 로컬 생성(로컬-퍼스트) — 서버 왕복 없이 바로 화면 반영. 영속은 부팅캐시 + cloudSync
    // (디바운스 push)가 담당한다(REST 의존 제거). 로그인 게이트가 이미 막지만 방어적 가드 유지.
    if(!authUser?.uid){
      Alert.alert('로그인이 필요해요','신발을 추가하려면 먼저 로그인해 주세요.');
      return;
    }
    // 클라이언트 id + updatedAt 스탬프(머지 '최신 우선'). max_km/start_km/purchase_date 만
    // 채우고 나머지(total_km/run_time)는 런에서 파생(서버 truth 부재 시 폴백).
    const newShoe=stampUpdatedAt({
      id:genShoeId(),name,max_km:maxKm,start_km:startKm,purchase_date:date,
    } as BackendShoe);
    setShoes(prev=>[newShoe,...prev]);
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
    try{void AsyncStorage.setItem(K_TOMBSTONES,JSON.stringify(t));}catch(e){console.log('tombstone persist error',e);}
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

  // ── 삭제 undo(실행취소) ────────────────────────────────────────────────────────
  // 삭제는 묘비(soft-delete)일 뿐 데이터 파괴가 아니므로 '실행취소'로 *완전복원*할 수 있다.
  // 완전복원의 의미(부분복원 금지): 라이브 레코드 + 사이드키(런의 route_/time_/surface_/
  // splits_)까지 전부 되살리고, 묘비를 되돌린다. 묘비 되돌림은 (a) tombstones store 에서 해당
  // id 를 빼고 (b) 라이브 레코드를 deleted:false + updatedAt 갱신으로 다시 넣는 것 — updatedAt 을
  // 새로 찍어야 머지 '최신 우선'이 (다른 기기/클라우드 백업에 남은) 옛 묘비보다 un-delete 를
  // 최신 사실로 보고 부활(삭제 재적용)을 막는다.

  // 삭제 직전 런 스냅샷: 레코드 + 사이드키 + (미동기였다면)큐 항목. 사이드키를 지우기 전에
  // 읽어 담아야 유실 없이 되살릴 수 있다(부분복원=런만 살고 사이드키 유실 방지).
  type RunUndo={
    record:BackendRun;
    sidecars:{route:string|null;time:string|null;surface:string|null;splits:string|null};
    pending:PendingRun|null;
  };
  const restoreRun=async(undo:RunUndo)=>{
    const sid=String(undo.record.id);
    const sc=undo.sidecars;
    // 1) 사이드키 복원 — 원래 값이 있던 키만 되쓴다(없던 키를 새로 만들지 않음).
    if(sc.route!=null)await AsyncStorage.setItem('route_'+sid,sc.route);
    if(sc.time!=null)await AsyncStorage.setItem('time_'+sid,sc.time);
    if(sc.surface!=null)await AsyncStorage.setItem('surface_'+sid,sc.surface);
    if(sc.splits!=null)await AsyncStorage.setItem('splits_'+sid,sc.splits);
    // 2) 묘비 되돌림 — store 에서 해당 id 제거(삭제 전파 취소).
    setTombstones(prev=>{
      const next={...prev,runs:prev.runs.filter(r=>String(r.id)!==sid)};
      persistTombstones(next);
      return next;
    });
    // 3) 라이브 복원 — deleted:false + updatedAt 갱신(un-delete 가 머지에서 이기게).
    const restored=stampUpdatedAt({...undo.record,deleted:false});
    setRuns(prev=>prev.some(r=>String(r.id)===sid)?prev:[restored,...prev]);
    // 4) 미동기였던 런이면 큐도 되살려 다음 flush 가 다시 POST 하게 한다.
    if(undo.pending){try{await enqueuePendingRun(undo.pending);}catch{/* 큐 복원 실패는 라이브 복원을 막지 않는다 */}}
  };
  const offerRunUndo=(undo:RunUndo)=>{
    showToast({message:'러닝 기록 삭제됨',actionLabel:TOAST_UNDO_LABEL,onAction:()=>{void restoreRun(undo);}});
  };

  const restoreShoe=(record:BackendShoe)=>{
    const sid=String(record.id);
    setTombstones(prev=>{
      const next={...prev,shoes:prev.shoes.filter(s=>String(s.id)!==sid)};
      persistTombstones(next);
      return next;
    });
    const restored=stampUpdatedAt({...record,deleted:false});
    setShoes(prev=>prev.some(s=>String(s.id)===sid)?prev:[restored,...prev]);
  };
  const offerShoeUndo=(record:BackendShoe)=>{
    showToast({message:'신발 삭제됨',actionLabel:TOAST_UNDO_LABEL,onAction:()=>{restoreShoe(record);}});
  };

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
    // 삭제됨 · 실행취소: 신발만 잠금장에서 빠졌을 뿐이므로 완전복원할 수 있다.
    if(target)offerShoeUndo(target);
  }

  // 보관(retire/archive): 신발을 선택목록·홈 picker에서 숨기되 신발과 런 기록은
  // 모두 보존한다. retired 토글이므로 복원도 가능하다.
  async function retireShoe(id:string,retired:boolean){
    // Stage 2: 로컬 상태(retired 토글)만 갱신(Firestore 정본). stampUpdatedAt 으로 이 변경이
    // 머지에서 옛 값을 이긴다. 영속은 cloudSync 담당.
    setShoes(prev=>prev.map(s=>s.id===id?stampUpdatedAt({...s,retired}):s));
  }


  // 런 한 건을 부팅 캐시(CACHE_RUNS_KEY)에 즉시 durable 하게 prepend 한다(크래시-세이프티).
  // 같은 id 가 이미 있으면 교체(멱등). 800ms 디바운스 캐시 효과가 전체 상태로 덮어쓰기 전에
  // 크래시가 나도 이 동기 기록 덕에 런이 살아남는다(audit#3 미동기 큐의 역할을 대체). 비차단.
  const persistRunToCache=async(run:BackendRun)=>{
    try{
      const raw=await AsyncStorage.getItem(CACHE_RUNS_KEY);
      const arr=raw?JSON.parse(raw):[];
      const list=Array.isArray(arr)?arr:[];
      const next=[run,...list.filter((r:any)=>String(r?.id)!==String(run.id))];
      await AsyncStorage.setItem(CACHE_RUNS_KEY,JSON.stringify(next));
    }catch(e){console.log('persistRunToCache error',e);}
  };

  // 완주 런 저장(Stage 2b · Firestore 정본): 로컬 우선 + cloudSync push. REST POST/큐 제거.
  //   1) 사이드키(route_/time_) 영속 + 캐시에 즉시 durable 기록(크래시-세이프티) — 네트워크 무관.
  //   2) 낙관적 setRuns. 영속/동기는 부팅캐시 + cloudSync(Firestore)가 담당한다.
  // localId(genRunId)가 런의 영구 id다 — 서버 재키잉이 없으므로 머지 키가 안정적이다.
  async function addRun(shoeId:string,km:number,date:string,memo:string,source:string,duration?:number,cadence?:number,route?:string,location?:string,heart_rate?:number){
    const timeStr=nowTimeLabel();
    const stampedAt=Date.now();
    const localId=genRunId(stampedAt);
    // 완주 런 레코드 — 모든 필드(source/location/heart_rate 포함)를 담아 Firestore 정본에
    // 유실 없이 올린다(이전엔 일부 필드가 REST 왕복으로만 보존됐다). updatedAt 으로 머지 최신 우선.
    const record:BackendRun={
      id:localId, shoe_id:shoeId, km, run_date:date, memo:memo||'', source,
      duration:duration||0, cadence:cadence||0, route:route||'', location:location||'',
      heart_rate:heart_rate||0, run_time:timeStr, updatedAt:stampedAt,
    };
    // ── 1) 로컬 우선 영속화(크래시-세이프티) — 사이드키 + 캐시 즉시 durable 기록 ──
    if(route) await AsyncStorage.setItem('route_'+localId, route);
    await AsyncStorage.setItem('time_'+localId, timeStr);
    await persistRunToCache(record);
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
    const editedAt=Date.now();
    setRuns(prev=>prev.map(r=>String(r.id)===sid?stampUpdatedAt({...r,...fields},editedAt):r));
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
  // 올라간 런이 다른 기기 머지로 부활하지 않게 한다. route_/time_/surface_/splits_ 사이드키도 정리.
  async function deleteRun(id:string){
    const sid=String(id);
    const target=runs.find(r=>String(r.id)===sid);
    // undo 스냅샷: 사이드키를 *지우기 전에* 읽어 담는다 — '실행취소' 시 런만 살고
    // route_/time_/surface_/splits_ 가 유실되는 부분복원을 막는다(완전복원 보장).
    const [route,time,surface,splits]=await Promise.all([
      AsyncStorage.getItem('route_'+sid),
      AsyncStorage.getItem('time_'+sid),
      AsyncStorage.getItem('surface_'+sid),
      AsyncStorage.getItem('splits_'+sid),
    ]);
    const undo:RunUndo|null=target?{record:target,sidecars:{route,time,surface,splits},pending:null}:null;
    // 로컬-퍼스트 삭제: 라이브 제거 + 묘비(cloudSync 전파) + 사이드키 정리. 영속은 cloudSync 담당.
    setRuns(prev=>prev.filter(r=>String(r.id)!==sid));
    if(target)addRunTombstone(target);
    await AsyncStorage.removeItem('route_'+sid);
    await AsyncStorage.removeItem('time_'+sid);
    await AsyncStorage.removeItem('surface_'+sid);
    await AsyncStorage.removeItem('splits_'+sid);
    if(undo)offerRunUndo(undo);
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
  const changeWeight=(kg:number)=>{setWeightKg(kg);void saveWeight(kg);};
  // 푸시 알림 설정 변경: 즉시 상태 반영 + 신규 notif_settings 키에만 영속(기존 키 불변).
  const changeNotifSettings=(s:NotifSettings)=>{setNotifSettingsState(s);void setNotifSettings(s);};

  // ── 로컬 백업/복원(Slice 4) ─────────────────────────────────────────────────
  // 내보내기 대상: 현재 신발+런+설정을 그대로 모은다(km 표준 settings). ProfileScreen이
  // serializeBackup→RN Share로 내보낸다.
  // audit a2: 묘비를 라이브 레코드 뒤에 합류시켜 동기(mergeCloudData)가 삭제를 전파하게 한다.
  // 라이브 배열은 묘비-free 이고 한 id 가 양쪽에 동시에 있지 않으므로 합집합이 깨끗하다.
  const backupData={
    shoes:[...shoes,...tombstones.shoes],
    runs:[...runs,...tombstones.runs],
    settings:{unit,goal_weekly_km:goalWeeklyKm,alerts},
    // 진척(은퇴 신발·랭크·업적 seen)도 클라우드 백업에 포함 — 재설치/기기변경 복원(유실 0).
    ...(progState?{progression:progState}:{}),
  };
  // 가져오기: ProfileScreen이 parseBackup으로 *검증에 성공한* BackupV1만 넘겨준다.
  // 검증 실패 시엔 호출 자체가 없으므로 여기 도달하면 기존 데이터를 안전하게 교체한다.
  // 신규 키(K_BACKUP_IMPORT)에 원본을 영속해 두어 추후 추적/롤백 근거를 남기고,
  // 기존 키(settings_*)는 changeX(=saveX)가 정상 경로로만 갱신해 파괴를 막는다.
  // 백업 페이로드(신발+런+설정)를 현재 상태로 반영한다. 로컬 가져오기와 클라우드 동기
  // 병합 결과가 공유한다. 설정은 changeX(=saveX) 정상 경로로만 갱신해 기존 키 파괴를 막는다.
  // audit a2: 머지/백업 결과를 받을 때 묘비를 라이브에서 분리한다 — live(!deleted)는 화면
  // 상태로, 묘비는 저장소로 보내 (a) 삭제 레코드가 거리/수명 계산에 안 끼고 (b) 다음 동기에서도
  // 삭제가 계속 전파되게 한다. merged 는 id 당 1개(머지가 dedupe)라 한 id 가 live·묘비에 동시에
  // 남지 않는다 → 자기충돌 부활 없음.
  const applyBackupPayload=(data:BackupPayload)=>{
    const sPart=Array.isArray(data.shoes)?partitionTombstones(data.shoes as BackendShoe[]):null;
    const rPart=Array.isArray(data.runs)?partitionTombstones(data.runs as BackendRun[]):null;
    if(sPart)setShoes(sPart.live);
    if(rPart)setRuns(rPart.live);
    if(sPart||rPart){
      setTombstones(prev=>{
        const next={shoes:sPart?sPart.tombstones:prev.shoes,runs:rPart?rPart.tombstones:prev.runs};
        persistTombstones(next);
        return next;
      });
    }
    const st:any=data.settings||{};
    if(st.unit==='km'||st.unit==='mi')changeUnit(st.unit);
    if(typeof st.goal_weekly_km==='number')changeGoal(st.goal_weekly_km);
    if(st.alerts&&typeof st.alerts==='object'){
      const en=typeof st.alerts.enabled==='boolean'?st.alerts.enabled:alerts.enabled;
      const th=Number(st.alerts.thresholdPct);
      changeAlerts({enabled:en,thresholdPct:Number.isFinite(th)?th:alerts.thresholdPct});
    }
    // 진척 복원(은퇴 신발·랭크·업적 seen) — 머지 결과를 상태+영속(progression_v1)에 반영한다.
    // 클라우드 머지(mergeCloudData)가 이미 local 진척과 union 한 값이라, 화면/저장 둘 다 안전.
    if(data.progression&&typeof data.progression==='object'){
      setProgState(data.progression as ProgressionState);
      void saveProgression(data.progression as ProgressionState);
    }
  };
  const importBackup=(data:BackupV1)=>{
    try{void AsyncStorage.setItem(K_BACKUP_IMPORT,serializeBackup({shoes:data.shoes,runs:data.runs,settings:data.settings}));}catch(e){console.log('backup persist error',e);}
    applyBackupPayload({shoes:data.shoes,runs:data.runs,settings:data.settings});
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
  // 머지된 payload 로 내 월간 랭킹 엔트리를 계산·발행한다. 점수는 live 레코드 기준,
  // 표시정보(닉네임/랭크/색/장착 타이틀)는 현재 progression 파생. best-effort(throw 흡수).
  const publishMyRankingNow=async(merged:{shoes:any[];runs:any[]})=>{
    try{
      const liveShoes=liveRecords(merged.shoes);
      const liveRuns=liveRecords(merged.runs);
      const view=getProgression(liveRuns,liveShoes,progState??undefined);
      const equipped=view.titles.equipped
        ? (view.titles.unlocked.find(t=>t.key===view.titles.equipped)?.name??null)
        : null;
      await publishMyRanking({
        nickname:profileName||DEFAULT_PROFILE_NAME,
        rankTier:view.rank.tier,
        rankColor:view.rank.color,
        equippedTitle:equipped,
        runs:liveRuns,
        shoes:liveShoes,
        progressPoints:view.rank.xp,
        nowMs:Date.now(),
      });
    }catch(e){console.log('publish ranking error',e);}
  };
  const runCloudSync=async()=>{
    // 부팅 캐시(로컬 신발/런)가 hydrate 되기 전에는 절대 동기하지 않는다(데이터 유실 가드).
    // Firebase auth 복원이 initUser 의 캐시 로드보다 먼저 끝나는 일이 잦은데, 그때 동기가
    // 빈 로컬(runs=[])을 remote 와 머지하면 *아직 클라우드에 안 올라간 로컬-전용 런*이 머지
    // 입력에서 빠지고, applyBackupPayload + 부팅캐시 영속이 그 런을 덮어써 영구 삭제한다.
    // bootState!=='ready' 가드가 이 레이스를 차단한다(ready 시 runs/shoes 가 같은 배치로 hydrate).
    if(cloudSyncBusyRef.current||!authUser?.uid||bootState!=='ready') return;
    cloudSyncBusyRef.current=true;
    try{
      const port=cloudPortRef.current;
      // P1-4: 원자 동기(pull→merge→push 를 한 트랜잭션) 우선 — 동시-기기 클로버 방지.
      // 미구현 포트(테스트 스텁)면 비원자 pull→merge→push 로 폴백한다(동작 동일, 경합만 노출).
      let merged:BackupPayload;
      if(port.syncMerge){
        merged=await port.syncMerge(backupData,mergeCloudData);
      }else{
        const remote=await port.pull();
        merged=mergeCloudData(backupData,remote);
        await port.push(merged);
      }
      applyBackupPayload(merged);
      setLastSyncAt(Date.now());
      // Phase 3: 동기 직후 내 월간 랭킹 엔트리를 Firestore 에 발행(best-effort·논블로킹).
      // 점수는 머지된 live 레코드로 클라이언트가 계산하고, 표시정보(닉네임/랭크/타이틀)는
      // 현재 progression 에서 파생한다. 실패해도 동기 흐름·데이터엔 영향 없음(throw 흡수).
      void publishMyRankingNow(merged);
    }catch(e){console.log('cloud sync error',e);}
    finally{cloudSyncBusyRef.current=false;}
  };
  // 항상 최신 클로저를 가리키는 ref — effect 가 stale backupData/applyBackupPayload 를 잡지 않게.
  const runCloudSyncRef=useRef(runCloudSync);
  runCloudSyncRef.current=runCloudSync;
  // 변경 시그니처(개수+최신 updatedAt+설정). 값이 같으면 디바운스 effect 가 재실행되지 않는다
  // (런 수백 건·route 블롭을 매 렌더 stringify 하지 않는다 — 비용이 데이터 크기에 무관).
  const cloudDataSig=(()=>{
    const maxU=(arr:any[])=>arr.reduce((m:number,x:any)=>{const u=x?.updatedAt;return typeof u==='number'&&u>m?u:m;},0);
    return `${shoes.length}:${runs.length}:${Math.max(maxU(shoes),maxU(runs))}:${unit}:${goalWeeklyKm}:${JSON.stringify(alerts)}`;
  })();
  // 테스트(NODE_ENV==='test')에선 기본 우회 — 25개 App 스위트가 setTimeout 누수/네이티브
  // 호출 없이 그대로 통과한다. 전용 테스트는 __KEEGO_ENABLE_CLOUD_SYNC__ 로 켜서 검증한다.
  const cloudEnabled=process.env.NODE_ENV!=='test'||(globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__===true;
  // ── Phase 5b·Stage 0: REST→Firestore 일회성 이관(데이터 유실 가드) ──────────────
  // Firestore 가 비어 있고 REST 에 데이터가 있으면 1회 시드(멱등·비차단). REST 에만 있던
  // 기존 사용자 데이터가 Firestore 정본에도 반드시 존재함을 보장 → 이후 Stage 3(REST 부팅
  // 제거)이 안전해진다. 로컬 상태는 건드리지 않는다(initUser 가 이미 REST 로 채움) — 여기선
  // Firestore 시드만. 세션 1회(ref) + 영속 플래그(다음 세션도 멱등).
  const restMigratedRef=useRef(false);
  useEffect(()=>{
    if(!cloudEnabled||!authUser?.uid||restMigratedRef.current) return;
    restMigratedRef.current=true;
    void migrateRestToFirestore({
      isDone:async()=>{try{return (await AsyncStorage.getItem(REST_MIGRATION_KEY))==='1';}catch{return false;}},
      markDone:async()=>{try{await AsyncStorage.setItem(REST_MIGRATION_KEY,'1');}catch{}},
      pullRemote:()=>cloudPortRef.current.pull(),
      loadRest:async()=>{
        try{
          const did=await AsyncStorage.getItem('device_id');
          if(!did) return null;
          const auth=await apiAuth(did);
          const[sd,rd]=await Promise.all([apiGetShoes(auth.user_id),apiGetRuns(auth.user_id)]);
          return {shoes:Array.isArray(sd)?sd:[],runs:Array.isArray(rd)?rd:[],settings:{}};
        }catch{return null;}
      },
      pushRemote:(d)=>cloudPortRef.current.push(d),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser?.uid]);
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
      if(next==='active'||next==='background') void runCloudSyncRef.current();
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
    try{await AsyncStorage.clear();}catch{}
    setShoes([]);setRuns([]);
    setTombstones({shoes:[],runs:[]});
    setChallenges([]);
    setProgState(null);
    setOnboarded(false);
  };

  // ── 개인 챌린지 생성/삭제(영속 + 상태 갱신) ─────────────────────────────────
  // 신규 키(K_CHALLENGES)에만 쓰므로 기존 데이터(신발/런/설정)와 격리된다. 진행률은
  // 저장하지 않고 런 기록에서 매번 파생(challengeProgress)해 단일 진실원을 유지한다.
  // base(distance/streak) + ext(monthly/shoe/rotation)를 한 배열로 합쳐 K_CHALLENGES 에 쓴다.
  // 두 부분집합을 항상 함께 직렬화하므로, 한쪽을 갱신해도 다른 쪽이 사라지지 않는다(상호 비파괴).
  const persistAllChallenges=(base:Challenge[],ext:ExtChallenge[])=>{
    try{void AsyncStorage.setItem(K_CHALLENGES,JSON.stringify([...base,...ext]));}catch(e){console.log('challenges save error',e);}
  };
  const persistChallenges=(next:Challenge[])=>{
    setChallenges(next);
    persistAllChallenges(next,extChallenges);
  };
  const createChallenge=(c:Challenge)=>{
    // 같은 id(같은 종류·기간·목표) 중복 생성은 덮어쓴다(목록 비대화 방지).
    persistChallenges([...challenges.filter(x=>x.id!==c.id),c]);
  };
  const deleteChallenge=(id:string)=>{
    persistChallenges(challenges.filter(c=>c.id!==id));
  };
  // 스마트 챌린지 목표 거리(km) 수정 — 챌린지 id별로 오버라이드를 갱신·영속한다(상태 즉시
  // 반영 + K_SMART_TARGET 쓰기). 1km 미만은 1로 바닥 처리해 0/음수 목표를 막는다.
  const editSmartTarget=(id:string,km:number)=>{
    const v=Math.max(1,Math.round(Number(km)||0));
    const next={...smartTargetById,[id]:v};
    setSmartTargetById(next);
    try{void AsyncStorage.setItem(K_SMART_TARGET,JSON.stringify(next));}catch(e){console.log('smart target save error',e);}
  };

  // ── 프로필 이름/사진(영속 + 상태) ───────────────────────────────────────────
  // 이름은 공백이면 기본값('러너')으로 보정해 빈 이름을 막고, 사진은 expo-image-picker로
  // 고른 로컬 URI를 저장한다. 권한 거부/취소(null)·실패는 모두 비차단(조용히 유지).
  const changeProfileName=(name:string)=>{
    const v=(name||'').trim()||DEFAULT_PROFILE_NAME;
    setProfileName(v);
    try{void AsyncStorage.setItem(K_PROFILE_NAME,v);}catch(e){console.log('profile name save error',e);}
  };
  const pickProfilePhoto=async()=>{
    try{
      const picked=await pickShoePhoto();
      if(!picked)return;
      setProfilePhoto(picked.uri);
      try{await AsyncStorage.setItem(K_PROFILE_PHOTO,picked.uri);}catch(e){console.log('profile photo save error',e);}
    }catch(e){console.log('profile photo pick error',e);}
  };
  // 챌린지 진행률용 런 매핑: 런 기록 → {date,dist}. km 은 백엔드가 문자열로도 보내므로
  // Number 로 강제하고, 음수/NaN 은 lib(challengeProgress)에서 0 으로 방어한다.
  const challengeRuns:ChallengeRun[]=runs.map(r=>({date:String(r.run_date||'').slice(0,10),dist:Number(r.km)||0}));

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
  // 신발명 by id — 삭제(tombstone)된 신발까지 포함해, 그 신발로 달린 런의 공유 카드에도
  // 이름이 뜨게 한다(삭제는 소프트삭제라 이름 정보가 묘비에 남아있다).
  const nameById:Record<string,string>={};
  shoes.forEach(s=>{if(s.name)nameById[s.id]=s.name;});
  tombstones.shoes.forEach(s=>{if(s.id&&s.name&&!nameById[s.id])nameById[s.id]=s.name;});

  // 홈/러닝 picker용 목록: 보관된 신발은 숨기고 '가장 최근에 신은 순'으로 정렬한다
  // (미착용은 뒤, 동률은 등록순 유지). 홈 히어로 기준(mostRecentShoeId)과 picker 카드
  // 순서를 같은 기준으로 맞춰, 손이 가는 신발이 맨 앞에 오게 한다. 정렬 후 인덱스는
  // homeActiveIdx·selectHomeShoe·startFromIdx가 모두 같은 homeShoes를 되짚으므로
  // 선택/시작 매핑이 어긋나지 않는다(런 기록은 잠금장·통계에 그대로 남는다).
  const homeShoes=shoes.map((s,i)=>({raw:s,ui:uiShoes[i]})).filter(x=>!isRetired(x.raw))
    .map((x,i)=>({x,i,worn:lastWornDate(x.raw.id,runs)}))
    .sort((a,b)=>{
      if(a.worn===b.worn) return a.i-b.i;   // 동률(같은 날짜·둘 다 미착용) → 등록순 유지
      if(a.worn===null) return 1;            // a 미착용 → 뒤로
      if(b.worn===null) return -1;           // b 미착용 → 앞으로
      return a.worn>b.worn?-1:1;             // 더 늦은(최근) 날짜가 앞
    })
    .map(o=>o.x);
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
  // 신발화면(보관 포함 전체)에서 선택 신발의 인덱스 — '사용 중' 강조용.
  const shoesActiveIdx=Math.max(0,shoes.findIndex(s=>s.id===effectiveId));
  // 홈 picker(보관 제외) 인덱스 → 원본 신발 id로 선택 상태를 갱신한다.
  const selectHomeShoe=(i:number)=>{const e=homeShoes[i];if(e)setSelectedShoeId(e.raw.id);};

  // ── 실효 마모/교체 예측 보정(Slice 6) ────────────────────────────────────────
  // 런별 노면 태그 조회(미태그 → road). 신발 상세(ShoesScreen)와 홈 히어로 예측이 같은
  // 보정(체중·노면)을 공유하도록 한 곳에서 만든다. 표시 파생값이며 원본은 읽기만 한다.
  const surfaceOf=(runId:string):Surface=>runSurfaces[runId]??'road';
  // 홈 히어로(선택 신발)의 교체 예측. 신발 상세와 동일 입력(target=max_km, 거리/시간/날짜,
  // weightKg, surfaceOf)으로 계산해 두 화면 예측이 일치한다. ok/overdue일 때만 히어로에 노출.
  const homeActiveRaw=shoes.find(s=>s.id===effectiveId)||null;
  // 한 신발의 교체 예측(상세와 동일 보정: target=max_km, 거리/시간/날짜, weightKg, surfaceOf).
  const forecastForRaw=(raw:BackendShoe|null):ReplacementForecast|null=>raw?forecastReplacement(
    {name:raw.name,target_km:Number(raw.max_km)},
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
  // getProgression(읽기 전용 — 런/신발/progression_v1 불변)으로 랭크·장착 타이틀·업적을
  // 읽고, 수락한 챌린지(base distance/streak + ext monthly/shoe/rotation) 중 활성 1개의
  // 진행을 골라 홈 띠로 내려준다. 데이터를 만들지 않고 표시 파생만 한다(getProgression
  // 내부 메모 + 작은 루프라 매 렌더 비용은 무시 가능). 미주입 progState 도 안전 기본값.
  const homeProgression:HomeProgression=useMemo(()=>{
    const view=getProgression(runs,shoes,progState??undefined);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[runs,shoes,challenges,extChallenges,challengeRuns,progState]);

  // 마이 탭 스마트 챌린지 카드 입력 — 런/신발을 확장 챌린지 형태(extRuns/extShoes)로
  // 읽기 전용 파생한다(원본 불변). ProfileScreen 의 ChallengesSection 이 이 입력으로
  // 스마트 추천을 결정적으로 생성하고 수락 카드 진행률을 그린다. 챌린지 탭이 진척에서
  // 마이로 이관되며 추가됨.
  const challengeExt=useMemo(()=>{
    const extRuns:ExtRun[]=runs.map(r=>({date:String(r.run_date||'').slice(0,10),dist:Number(r.km)||0,shoeId:r.shoe_id,durationS:r.duration}));
    const extShoes:ExtShoe[]=shoes.map(sh=>({id:sh.id,name:sh.name,retired:!!sh.retired,createdAt:sh.purchase_date,targetKm:sh.max_km}));
    return {extRuns,extShoes};
  },[runs,shoes]);

  // ── 은퇴 키프세이크 컨텍스트(Slice B) ────────────────────────────────────────
  // 영속된 은퇴 레코드(Hall of Shoes 소스) + 진척 컨텍스트(요약/등급 판정용). buildContext
  // 는 순수·읽기 전용(런/신발 불변). progState 미로드 시 빈 레코드로 안전 동작.
  const retiredRecords:RetiredShoeRecord[]=progState?.retiredShoes??[];
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
    setProgState(prev=>{
      const base=prev??{earnedTitles:[],equippedTitleKey:null,seenUnlocks:[],retiredShoes:[],points:0};
      const idx=base.retiredShoes.findIndex(r=>r.shoeId===record.shoeId);
      if(idx>=0){
        const next=base.retiredShoes.slice();
        next[idx]=record; // 최신 은퇴 레코드로 교체(여전히 신발당 1개)
        return {...base,retiredShoes:next};
      }
      return {...base,retiredShoes:[...base.retiredShoes,record]};
    });
  };

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
      shoeName:nameById[run.shoe_id]??'', // 삭제 신발 포함 — 공유 카드 폴백용
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
        {name:s.name,target_km:Number(s.max_km)},
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
      const intents=dueNotifications(buildNotifState(),new Date());
      const fresh=intents.filter(i=>!presentedNotifKeys.current.has(i.key));
      if(fresh.length===0)return;
      void presentDue(fresh);
      fresh.forEach(i=>presentedNotifKeys.current.add(i.key));
      const todayY=today();
      const kept=[...presentedNotifKeys.current].filter(k=>k.includes(todayY));
      presentedNotifKeys.current=new Set(kept);
      try{void AsyncStorage.setItem(K_NOTIF_PRESENTED,JSON.stringify(kept));}catch{/* 영속 실패는 삼킴 */}
    }catch(e){console.log('notif present error',e);}
  };

  // 신발 로테이션 추천(차별점): 보유 신발+런 기록에서만 파생(새 상태 없음). 활성 2켤레+
  // 일 때만 picks 가 채워지고, runType 미선택이라 '휴식·마모 분산' 기본 추천이 된다.
  // 카테고리는 brand+model(parseShoeName) 로 data/shoeModels 조회 — 커스텀은 브랜드 폴백.
  const rotationPicks=recommendRotation({
    shoes:shoes.map(s=>{const {brand,model}=parseShoeName(s.name);return {id:s.id,brand:brand||s.name,model:model||(brand?'':s.name),retired:isRetired(s)};}),
    runs:runs.map(r=>({shoeId:String(r.shoe_id),date:String(r.run_date),km:parseFloat(String(r.km))||0})),
    today:ymdLocal(now),
  });

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
  const profView=getProgression(runs,shoes,progState??undefined);
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

  // ── 위치 권한 priming(audit#9/#10) ──────────────────────────────────────────
  // 라이브 런 진입 직전 관문. 권한을 처음 쓰는 사용자에겐 OS 다이얼로그 전에 '왜
  // 위치 권한이 필요한지'를 먼저 한국어로 안내한다(priming). '계속'을 누르면 1회성
  // 플래그를 영속하고 런으로 진입 → RunActiveScreen 이 실제 OS 권한을 요청한다.
  // 이미 안내했거나(locPrimed) 닫으면 추가 안내 없이 동작한다.
  const enterRun=(km:number)=>{
    // 목표 설정 → 카운트다운(준비·GPS 워밍업·3·2·1·GO) → 라이브 런. 카운트다운의
    // onDone 이 실제 런(GPS 트래킹 시작) 화면으로 넘긴다. 미완료 런 복구 경로는
    // 카운트다운을 거치지 않고 곧장 'run'으로 간다(이미 끝난 런의 검토라서).
    setActiveRun({id:pendingShoe!.id,name:pendingShoe!.name,goalKm:km});
    setOverlay('countdown');
  };
  const startActiveRun=(km:number)=>{
    if(!pendingShoe) return;
    if(locPrimed){enterRun(km);return;}
    Alert.alert(
      '위치 권한 안내',
      '러닝 거리와 코스를 GPS로 정확히 측정하기 위해 위치 권한이 필요해요. 다음 화면에서 권한을 허용해 주세요.',
      [
        {text:'닫기',style:'cancel'},
        {text:'계속',onPress:()=>{
          setLocPrimed(true);
          void AsyncStorage.setItem(LOC_PRIME_KEY,'1');
          enterRun(km);
        }},
      ],
    );
  };

  // 온보딩 완료: 1회성 플래그 영속 + 화면에서 치운다. 온보딩의 등록 단계에서 고른
  // 신발(있으면)은 실제 백엔드 신발로 만들어 홈에 바로 반영한다(없으면 빈 홈으로).
  // setOnboarded(true)가 먼저라 addShoe의 비동기 shoes 갱신이 흐름을 끊지 않는다.
  const completeOnboarding=(registered:RegisteredShoe|null)=>{
    setOnboarded(true);
    void AsyncStorage.setItem(ONBOARD_KEY,'1');
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
    return <LoginScreen cloudPort={cloudPortRef.current} onSignedIn={(u)=>setAuthUser({uid:u.uid})}/>;
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
  if(!onboarded&&shoes.length===0&&overlay==='none'){
    return <OnboardingScreen onDone={completeOnboarding}/>;
  }
  if(overlay==='goal'&&pendingShoe){
    return (
      <RunGoalScreen
        shoeBrand={pendingShoe.ui.brand}
        shoeLabel={pendingShoe.ui.model||pendingShoe.ui.brand}
        shoeCondition={pendingShoe.ui.condition}
        remainKm={Math.max(0,pendingShoe.ui.max-pendingShoe.ui.used)}
        onBack={()=>{setOverlay('none');setPendingShoe(null);}}
        onStart={startActiveRun}
      />
    );
  }
  if(overlay==='countdown'&&activeRun){
    return (
      <RunCountdownScreen
        goalKm={activeRun.goalKm}
        shoeLabel={parseShoeName(activeRun.name).model||activeRun.name}
        onCancel={()=>setOverlay('goal')}
        onDone={()=>setOverlay('run')}
      />
    );
  }
  if(overlay==='run'&&activeRun){
    return (
      <RunActiveScreen
        shoe={activeRun}
        insets={insets}
        goalKm={activeRun.goalKm}
        weightKg={weightKg}
        resume={resumeSnap}
        resumeMode={resumeMode}
        onSave={async(km,dur,cad,memo,route,location,splits)=>{
          const newId=await addRun(activeRun.id,km,today(),memo||'','gps',dur,cad,route,location);
          // per-km 스플릿(레코더가 1km 통과 시각으로 남긴 실측 구간)을 localId로 영속한다.
          // route_/surface_ 와 동일 패턴(로컬 전용·동기 시 serverId로 재키잉). RunDetail이
          // splits_<id> 로 읽어 표시한다. 2구간 미만이면 표시 가치가 없어 저장 생략.
          if(splits&&splits.length>=2) await AsyncStorage.setItem('splits_'+newId, JSON.stringify(splits));
          await clearSnapshot();
          setResumeSnap(null);setActiveRun(null);setOverlay('none');setTab(2);
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
    return <HallOfFameScreen profileName={profileName}
      onBack={()=>setShowHallOfFame(false)}/>;
  }

  if(showProgression){
    return <ProgressionScreen runs={runs} shoes={shoes} profileName={profileName}
      onBack={()=>setShowProgression(false)}
      onOpenHallOfFame={()=>setShowHallOfFame(true)}/>;
  }

  // 명예의 전당(은퇴 신발 박물관) 전체화면 — 영속된 은퇴 레코드를 그대로 전시한다
  // (리로드에도 보존). 데이터를 만들지 않고 progState.retiredShoes 만 읽는다(읽기 전용).
  if(showHallOfShoes){
    return <HallOfShoes records={retiredRecords} unit={unit} userName={profileName} onBack={()=>setShowHallOfShoes(false)} onGoShoes={()=>{setShowHallOfShoes(false);setTab(1);}}/>;
  }
  if(showArchive){
    return <ShoeArchiveScreen shoes={archivedUiShoes} unit={unit} onRestore={(id)=>retireShoe(id,false)} onBack={()=>setShowArchive(false)}/>;
  }

  return(
    <View style={{flex:1,backgroundColor:BG}}>
      <View style={{flex:1}}>
        {tab===0&&(
          <HomeScreen
            shoes={homeUiShoes} week={week} dateLabel={dateLabel} unit={unit} userName={profileName}
            activeIdx={homeActiveIdx} onSelect={selectHomeShoe}
            onStart={startFromIdx} onAddShoe={()=>setOverlay('add')} onTab={setTab}
            rotation={rotationPicks} onPickShoe={setSelectedShoeId}
            forecast={homeForecast}
            forecasts={homeForecasts}
            onOpenShoe={(id)=>{setSelectedShoeId(id);setShoesDetailId(id);setTab(1);}}
            progression={homeProgression}
            onOpenProgression={()=>setShowProgression(true)}
            onRefresh={refreshData} lastSyncAt={lastSyncAt}
          />
        )}
        {tab===2&&(
          <HistoryScreen
            shoes={uiShoes} runs={uiRuns} summary={summary} chart={chart} unit={unit} onTab={setTab}
            onAddRun={addManualRun} onEditRun={editRun} onDeleteRun={deleteRun}
            onRefresh={refreshData}
          />
        )}
        {tab===1&&(
          <ShoesScreen
            shoes={uiShoes} runs={uiRuns} totals={shoeTotals} activeIdx={shoesActiveIdx}
            unit={unit} weightKg={weightKg} surfaceOf={surfaceOf}
            onAddShoe={()=>setOverlay('add')} onTab={setTab}
            onRename={updateShoeName} onDelete={deleteShoe} onRetire={retireShoe}
            onSetMaxKm={updateShoeMaxKm} onStartRun={startFromShoeId}
            detailShoeId={shoesDetailId} onConsumeDetail={()=>setShoesDetailId(null)}
            rawShoes={shoes} rawRuns={runs} progressionCtx={progressionCtx} userName={profileName}
            onRetiredKeepsake={onRetiredKeepsake}
          />
        )}
        {tab===3&&(
          <ProfileScreen
            profile={profile} badges={badges} records={records} onTab={setTab}
            profilePhotoUri={profilePhoto} onChangeName={changeProfileName} onPickPhoto={pickProfilePhoto}
            weightKg={weightKg} onChangeWeight={changeWeight}
            initialOpen={profileInitialOpen} onConsumeInitialOpen={()=>setProfileInitialOpen(null)}
            unit={unit} onChangeUnit={changeUnit}
            streakDays={goalStreak}
            weekDays={weekBuckets(runs, mon).map(v => v > 0)}
            weekTodayIdx={(now.getDay() + 6) % 7}
            alerts={alerts} onChangeAlerts={changeAlerts}
            notifSettings={notifSettings} onChangeNotifSettings={changeNotifSettings}
            recapRuns={runs} recapShoes={shoes}
            deviceId={deviceId}
            backupData={backupData} onImport={importBackup}
            challengeExtRuns={challengeExt.extRuns} challengeExtShoes={challengeExt.extShoes}
            smartTargetById={smartTargetById} onEditSmartTarget={editSmartTarget}
            todayISO={today()}
            cloudPort={cloudPortRef.current} onCloudMerged={onCloudMerged}
            onDeleteAccount={handleDeleteAccount}
            onOpenProgression={()=>setShowProgression(true)}
            onOpenHallOfShoes={()=>setShowHallOfShoes(true)}
            retiredCount={retiredRecords.length}
            onOpenArchive={()=>setShowArchive(true)}
            archivedCount={archivedUiShoes.length}
          />
        )}
      </View>
    </View>
  );
}

// ─── 콜드 백엔드 스켈레톤(audit#9/#10) ──────────────────────────────────────
// 스피너가 아니라 스켈레톤: 실제 콘텐츠(히어로 카드 + 주간 통계 3칸 + 신발 줄)의
// 자리표시 형태를 회색 블록으로 미리 보여줘 '레이아웃이 곧 채워진다'는 신호를 준다.
// testID로 통합테스트가 로딩 상태를 식별한다.
function SkelBlock({h,w,style}:{h:number;w?:number|string;style?:any}){
  return <View style={[{height:h,width:(w as any)??'100%',borderRadius:10,backgroundColor:SURFACE},style]}/>;
}
function BootSkeleton(){
  const insets=useSafeAreaInsets();
  return (
    <View testID="boot-skeleton" style={[boot.screen,{paddingTop:insets.top+12}]}>
      <View style={{height:24}}/>
      <Text testID="boot-loading-copy" style={boot.loadingCaption}>{KEEP_GOING_LOADING}</Text>
      <View style={{height:14}}/>
      <SkelBlock h={14} w={120}/>
      <View style={{height:18}}/>
      {/* 히어로 카드 자리 */}
      <SkelBlock h={150} style={{borderRadius:20}}/>
      <View style={{height:16}}/>
      {/* 주간 통계 3칸 */}
      <View style={{flexDirection:'row',gap:10}}>
        <SkelBlock h={64} w={'31%'as any}/>
        <SkelBlock h={64} w={'31%'as any}/>
        <SkelBlock h={64} w={'31%'as any}/>
      </View>
      <View style={{height:16}}/>
      {/* 신발 줄 자리 */}
      <SkelBlock h={84} style={{borderRadius:16}}/>
      <View style={{height:10}}/>
      <SkelBlock h={84} style={{borderRadius:16}}/>
    </View>
  );
}

// ─── 콜드 백엔드 에러: 재시도 카드(keep-going 톤, audit#9/#10) ───────────────
// fetch 실패(콜드/오프라인)에만 뜬다 — 빈-신규(성공+빈배열)와 구분된다. 실패를
// '잠깐 멈춤'으로 프레이밍하고 '다시 시도' 버튼으로 initUser 재진입을 제공한다.
function BootError({onRetry}:{onRetry:()=>void}){
  const insets=useSafeAreaInsets();
  return (
    <View testID="boot-error" style={[boot.screen,{justifyContent:'center',paddingTop:insets.top+12}]}>
      <View style={boot.card}>
        <Ionicons name="cloud-offline-outline" size={40} color={WARN}/>
        <Text style={boot.cardTitle}>연결이 잠시 끊겼어요</Text>
        <Text style={boot.cardBody}>{KEEP_GOING_RETRY}</Text>
        <Button testID="boot-retry" label="다시 시도" onPress={onRetry} icon="refresh" style={boot.retryBtn}/>
      </View>
    </View>
  );
}

const boot=StyleSheet.create({
  screen:{flex:1,backgroundColor:BG,paddingHorizontal:18,paddingTop:12},
  card:{backgroundColor:CARD,borderRadius:20,padding:24,alignItems:'center',gap:12,
    borderWidth:StyleSheet.hairlineWidth,borderColor:SEP},
  cardTitle:{color:T1,fontFamily:FP,fontSize:18,fontWeight:'700',marginTop:4},
  cardBody:{color:T3,fontFamily:FP,fontSize:14,lineHeight:20,textAlign:'center'},
  loadingCaption:{color:T3,fontFamily:FP,fontSize:13,lineHeight:19},
  // 단일 Button 프리미티브로 라우팅 — 모서리/그라데이션/글로우는 Button 이 책임진다.
  // 여기선 레이아웃(가로 stretch + 위 여백)만 얹는다.
  retryBtn:{marginTop:8,alignSelf:'stretch'},
});

// ─── Live run screen (GPS / sensors / TTS engine + handoff Ring UI) ─────────
function RunActiveScreen({shoe,insets,goalKm,weightKg,onSave,onDiscard,resume,resumeMode}:{shoe:{id:string;name:string};insets:any;goalKm:number;weightKg:number;onSave:(km:number,dur:number,cad:number,memo:string,route:string,location:string,splits:{km:number;paceSec:number;elevM:number}[])=>Promise<void>;onDiscard:()=>void;resume?:RunSnapshot|null;resumeMode?:'review'|'continue'}){
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
  const [,setGpsStatus]=useState('GPS 신호 찾는 중...');
  // GPS 死구간(audit#9): 마지막 fix 수신 후 무신호가 지속되면 거리는 멈춘 채 시간만
  // 누적된다. 순수 판정(gpsStallStatus)으로 감지해 한국어 배너를 띄운다.
  const [gpsStalled,setGpsStalled]=useState(false);
  // 주행 중 위치 권한 회수: 트래킹을 멈추고(가비지 거리 금지) 영구 배너 + 설정 안내.
  const [permLost,setPermLost]=useState(false);
  const [cadence,setCadence]=useState(resume?resume.cadence:0);
  // 마지막 fix 정확도(m, null=fix 이전). 실제 GPS 신호 강도(gpsLevel) 산출에 쓴다.
  const [accuracyM,setAccuracyM]=useState<number|null>(null);
  // 누적 고도 상승(m) — 엔진 state(elevGainM)에서 흘러온다. 복구 런은 스냅샷에 고도가
  // 없어 0에서 시작(엔진 미작동). finElev는 정지 시 최종값을 고정한다.
  const [elevGain,setElevGain]=useState(0);
  const [finElev,setFinElev]=useState(0);
  const [paused,setPaused]=useState(false);
  const [autoPaused,setAutoPaused]=useState(false);
  const [finKm,setFinKm]=useState(resume?resume.dist:0);
  const [finTime,setFinTime]=useState(resume?resume.elapsed:0);
  const [finCad,setFinCad]=useState(resume?resume.cadence:0);
  const [finRoute,setFinRoute]=useState(resumeRoute);
  // 완주 시 저장할 per-km 구간 스플릿(레코딩 결과 스냅샷).
  const [finSplits,setFinSplits]=useState<{km:number;paceSec:number;elevM:number}[]>([]);
  // 라이브 지도용 좌표 목록 — GPS fix마다 runTracker.getPoints()로 갱신한다.
  const [liveCoords,setLiveCoords]=useState<{lat:number;lon:number}[]>([]);
  const [finLocation,setFinLocation]=useState(resume?resume.location:'');
  const [memo,setMemo]=useState('');
  const [saving,setSaving]=useState(false);

  // elapsed 최신값을 km 안내 effect에서 정확히 읽기 위한 ref (state는 클로저 지연 있음).
  const elapsedRef=useRef(resume?resume.elapsed:0);

  const timer=useRef<any>(null);
  const snapTimer=useRef<any>(null);
  const stepSub=useRef<any>(null);
  // 케이던스(spm) 순수 상태기계 — 가속도 피크검출+윈도우 정규화는 lib/cadence.ts.
  // 케이던스만 화면이 소유한다(가속도계 기반). 거리/시간/일시정지/死구간/권한 회수는
  // 모두 공유 GPS 엔진(runTracker)이 소유하고 subscribe로 화면에 흘려보낸다.
  const cadenceState=useRef(initStepCadence());
  const cadRef=useRef(0);
  const locationRef=useRef('');
  const locationFetched=useRef(false);
  const announcedKm=useRef(0);
  // 요청한 위치 권한 결과(포그라운드/백그라운드). '계속 달리기'(거리 짧음 재시작) 시
  // 동일 권한으로 다시 트래킹을 시작하기 위해 보관한다.
  const permRef=useRef<RunPermissions>({foreground:true,background:false});
  // 이어 달리기 시드를 마운트당 1회만 적용하기 위한 가드(짧은 런 '계속 달리기' 재시작과 분리).
  const seededRef=useRef(false);
  // per-km 스플릿 누적(런 동안)과 마지막 km 경계의 시각/고도(구간 페이스·고도상승 계산용).
  const splitsRef=useRef<{km:number;paceSec:number;elevM:number}[]>([]);
  const lastSplitRef=useRef({elapsed:0,elevM:0});

  useEffect(()=>{
    // 'review' 복구는 이미 끝난 런을 검토만 한다 — GPS/센서/권한/TTS를 켜지 않는다.
    // 'continue'(이어 달리기)는 아래로 진행해 엔진을 시드 재가동한다. 일반 시작도 진행.
    if(resume&&!isContinue) return;
    // 공유 GPS 엔진(runTracker) 구독: 거리/시간/일시정지/死구간/권한 회수 상태가
    // 여기로 흘러와 화면 상태를 갱신한다. 포그라운드(watchPositionAsync)와
    // 백그라운드(task) fix가 모두 같은 엔진에 먹이므로, 화면off에서 누적된 거리도
    // 화면 복귀 시 이 구독으로 그대로 반영된다.
    const unsub=runTracker.subscribe(ev=>{
      if(ev.type==='state'){
        const s=ev.state;
        setKm(s.dist);setElapsed(s.elapsed);
        elapsedRef.current=s.elapsed;
        setPaused(s.paused);setAutoPaused(s.autoPaused);
        setGpsStalled(s.stalled);setPermLost(s.permissionRevoked);
        setElevGain(s.elevGainM);
        setAccuracyM(s.accuracyM);
        setLiveCoords(runTracker.getPoints());
        // per-km 스플릿: dist가 정수 km 경계를 새로 넘으면 그 1km의 소요시간(초)·고도상승(m)을
        // 기록한다. 경로에 타임스탬프가 없어 못 했던 '실제' 구간 페이스를 레코더가 직접 남긴다.
        if(Math.floor(s.dist)>splitsRef.current.length){
          const splitKm=splitsRef.current.length+1;
          splitsRef.current.push({km:splitKm,
            paceSec:Math.max(0,Math.round(s.elapsed-lastSplitRef.current.elapsed)),
            elevM:Math.max(0,Math.round(s.elevGainM-lastSplitRef.current.elevM))});
          lastSplitRef.current={elapsed:s.elapsed,elevM:s.elevGainM};
        }
        if(s.permissionRevoked)setGpsStatus('위치 권한 필요');
        else if(s.accuracyM!=null)setGpsStatus(`정확도 ${s.accuracyM}m`);
      }else if(ev.type==='paused'){
        try{Tts.stop();Tts.speak(ev.auto?'자동으로 일시정지합니다.':'일시정지합니다.');}catch{}
      }else if(ev.type==='resumed'){
        try{Tts.speak('달리기를 재개합니다.');}catch{}
      }else if(ev.type==='firstFix'){
        // 첫 fix 좌표로 1회 역지오코딩 → 위치 라벨. 엔진 메타에도 실어 스냅샷/저장에 반영.
        if(!locationFetched.current){
          locationFetched.current=true;
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${ev.lat}&lon=${ev.lon}&format=json&accept-language=ko`,{headers:{'User-Agent':'Keego/1.0'}})
            .then(r=>r.json()).then(d=>{
              const addr=d.address||{};
              const parts=[addr.suburb||addr.neighbourhood||addr.quarter||addr.city_district||addr.town,addr.city||addr.county||addr.state].filter(Boolean);
              locationRef.current=parts.length>0?parts.join(', '):(d.display_name||'').split(',').slice(0,2).join(',').trim()||'';
              runTracker.setMeta({location:locationRef.current});
            }).catch(()=>{});
        }
      }else if(ev.type==='permissionRevoked'){
        // 주행 중 권한 회수: 엔진이 트래킹(거리·시간)을 멈췄다. delivery 경로와
        // 1초 틱/스냅샷 타이머도 정리한다 — 틱이 계속 돌면 헛돌 뿐이고, 시간은
        // 엔진이 freeze하므로 더 증가하지 않는다(거리와 동일하게 정지).
        clearInterval(timer.current);clearInterval(snapTimer.current);
        void stopTracking();
        setGpsStatus('위치 권한 필요');setGpsStalled(false);
        openLocationSettingsAlert('주행 중 위치 권한이 회수되어 거리 기록을 멈췄습니다. 설정에서 위치 권한을 다시 허용해 주세요.');
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
      }catch{}
    })();
    setTimeout(()=>{try{Tts.speak(isContinue?`달리기를 이어갑니다. 현재 ${resume?.dist.toFixed(1)}킬로미터입니다.`:`달리기를 시작합니다! 목표는 ${goalKm}킬로미터입니다.`);}catch{}},800);
    (async()=>{
      // expo-location 통합 권한 게이트(android/ios 공통). 포그라운드 권한이 트래킹
      // 시작의 유일한 관문이다 — 거부 시 절대 시작하지 않는다(가비지 거리 금지).
      // 백그라운드(화면off) 권한은 추가 요청하되 거부돼도 비치명적: 포그라운드
      // 트래킹은 그대로 동작한다(graceful). 회귀 금지.
      const perm=await requestRunPermissions();
      permRef.current=perm;
      if(!perm.foreground){
        openLocationSettingsAlert('위치 권한을 허용해야 GPS 러닝이 가능합니다. 설정에서 위치 권한을 허용해 주세요.');
        setPermLost(true);
        return;
      }
      await beginRun();
    })();
    return()=>{stop();unsub();try{Tts.stop();}catch{}};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    const fullKm=Math.floor(km);
    if(fullKm>0&&fullKm>announcedKm.current){
      announcedKm.current=fullKm;
      const remaining=Math.max(0,goalKm-fullKm);
      const el=elapsedRef.current;

      // 페이스를 한국어 음성으로 변환: 330초 → "5분 30초"
      const toPaceKo=(distKm:number,sec:number)=>{
        if(distKm<=0||sec<=0) return '';
        const sPerKm=Math.round(sec/distKm);
        const m=Math.floor(sPerKm/60), s=sPerKm%60;
        return s>0?`${m}분 ${s}초`:`${m}분`;
      };
      const pace=toPaceKo(fullKm,el);

      // 특별 구간 메시지
      const isHalf=goalKm>0&&fullKm===Math.floor(goalKm/2)&&goalKm>=2;
      const isLastKm=remaining===1;

      try{Tts.stop();}catch{}
      if(remaining>0){
        const parts=[`${fullKm}킬로미터`];
        if(pace) parts.push(`페이스 ${pace}`);
        parts.push(`남은 거리 ${Math.round(remaining)}킬로미터`);
        if(isHalf) parts.push('절반 왔어요, 잘 하고 있어요');
        if(isLastKm) parts.push('마지막 1킬로미터, 끝까지 달려요');
        try{Tts.speak(parts.join('. ')+'.');}catch{}
      }else{
        const totalPace=toPaceKo(km,el);
        const parts=[`목표 달성! ${goalKm}킬로미터 완주`];
        if(totalPace) parts.push(`평균 페이스 ${totalPace}`);
        parts.push('수고했어요');
        try{Tts.speak(parts.join('. ')+'.');}catch{}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[km]);

  // 런 시작: 공유 엔진을 초기화하고, 케이던스 가속도계 + 1초 틱(경과/死구간) +
  // 3초 스냅샷 타이머를 띄운 뒤 expo-location 트래킹(포그라운드 watch + 가능 시
  // 백그라운드 task)을 시작한다. 거리/시간/일시정지/死구간 판정은 모두 엔진이
  // 소유하고 subscribe로 화면에 반영된다(이 함수는 delivery/타이머만 띄운다).
  async function beginRun(){
    // 이어 달리기(첫 진입에 한함): 스냅샷의 누적 거리·경로·경과시간을 엔진/화면에 시드한다.
    // t0=now−elapsed 로 경과를 잇고, 死구간을 가로지르는 허위 거리를 막기 위해 거리는
    // seedDist 로만 잇는다(엔진이 첫 fix 를 새 앵커로 삼음). '계속 달리기'(짧은 런 재시작)로
    // 다시 호출될 땐 seed 하지 않는다 — 그 경로는 0 부터 새로 시작이 의도다.
    const seed=isContinue&&resume&&!seededRef.current?resume:null;
    seededRef.current=true; // 시드는 마운트당 첫 beginRun 1회만 — '계속 달리기' 재시작은 0부터.
    if(seed){
      runTracker.start({goalKm,shoe:{id:shoe.id,name:shoe.name},
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
    }else{
    runTracker.start({goalKm,shoe:{id:shoe.id,name:shoe.name}});
    splitsRef.current=[];lastSplitRef.current={elapsed:0,elevM:0};
    setKm(0);setElapsed(0);setCadence(0);setAccuracyM(null);
    setGpsStalled(false);setPermLost(false);setGpsStatus('GPS 신호 찾는 중...');
    cadenceState.current=initStepCadence();cadRef.current=0;
    locationRef.current='';locationFetched.current=false;announcedKm.current=0;
    }
    // 케이던스(걸음수): OS 걸음 센서(expo-sensors Pedometer)의 누적 걸음수를 받아 분당
    // 비율로 spm 을 산출한다(가속도 10Hz 피크검출은 ~170을 ~90으로 절반 누락해 교체).
    // ACTIVITY_RECOGNITION 런타임 권한 필요 — 거부/미지원 기기에선 케이던스만 0(러닝은 계속).
    // 자동 일시정지/재개는 여전히 GPS 속도 상태기계(decideAutoPause)가 fix마다 판정한다.
    try{
      const perm=await Pedometer.requestPermissionsAsync();
      const available=perm.granted?await Pedometer.isAvailableAsync():false;
      if(available){
        stepSub.current=Pedometer.watchStepCount(({steps})=>{
          if(runTracker.pausedFlag())return;
          // 누적 걸음수 표본 공급 → 롤링 윈도우 분당비율 spm(순수 stepCadence).
          const c=feedStepCount(cadenceState.current,steps,Date.now());
          cadenceState.current=c.state;
          if(c.spm!==cadRef.current){cadRef.current=c.spm;setCadence(c.spm);runTracker.setMeta({cadence:c.spm});}
        });
      }
    }catch{/* 걸음 센서 미지원/권한 거부 — 케이던스만 비활성, 러닝은 계속 */}
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
    if(stepSub.current){const sub=stepSub.current;if(typeof sub.remove==='function')sub.remove();else if(typeof sub.unsubscribe==='function')sub.unsubscribe();stepSub.current=null;}
    clearInterval(timer.current);
    clearInterval(snapTimer.current);
    void stopTracking();
    runTracker.stop();
  }

  function handlePause(){
    // 수동 토글: 엔진이 pauseStart 가드로 pausedMs를 1회만 가산한다.
    runTracker.togglePause();
  }

  // 런 종료(실제 stop) — RunActiveScreen 종료 버튼의 롱프레스로만 호출된다(롱프레스 자체가
  // 오작동 종료 가드라 별도 2단계 확인은 두지 않는다). 거리가 너무 짧으면 계속/나가기 선택.
  function finishRun(){
    // 최종 거리/시간은 엔진(단일 소스)에서 읽는다 — 화면off 동안 누적분도 포함된다.
    const fk=runTracker.getDistanceKm(),ft=runTracker.getElapsedFinal();
    if(fk<0.01){
      stop();
      Alert.alert('거리가 너무 짧아요','계속 달리거나 나가기를 선택하세요',[
        {text:'계속 달리기',onPress:()=>{setKm(0);setElapsed(0);setCadence(0);setGpsStatus('GPS 신호 찾는 중...');setPaused(false);setAutoPaused(false);void beginRun();}},
        {text:'나가기',style:'destructive',onPress:onDiscard},
      ]);
      return;
    }
    stop();
    const sampled=simplifyRoute(runTracker.getPoints() as any,200);
    setFinRoute(sampled.length>=2?JSON.stringify(sampled):'');
    setFinSplits(splitsRef.current.slice());
    setFinLocation(locationRef.current);
    setFinKm(fk);setFinTime(ft);setFinCad(cadRef.current);
    setFinElev(runTracker.getElevationGain());
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
            const d=await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`,{headers:{'User-Agent':'Keego/1.0'}},5000).then(r=>r.json());
            const addr=d.address||{};
            const parts=[addr.suburb||addr.neighbourhood||addr.quarter||addr.city_district||addr.town,addr.city||addr.county||addr.state].filter(Boolean);
            loc=parts.length>0?parts.join(', '):(d.display_name||'').split(',').slice(0,2).join(',').trim()||'';
          }
        }catch{}
      }
      await onSave(Math.round(finKm*100)/100,finTime,finCad,memo,finRoute,loc,finSplits);
      hapticSuccess(); // 저장 성공 — 완주 보상 촉각(설정 off 면 graceful no-op).
    }finally{setSaving(false);}
  }

  const pauseLabel=autoPaused?'자동 일시정지':paused?'일시정지':'러닝 중';
  // 칼로리 추정(체중×거리×1.036) — 라이브(현재 km)와 완주(finKm) 각각. 거리 0이면 0.
  const liveCal=estimateCalories(km,weightKg);
  const finCal=estimateCalories(finKm,weightKg);

  if(phase==='done') return(
    <View style={[run.screen,{paddingTop:insets.top+24,paddingBottom:insets.bottom+28}]}>
      <View style={run.top}>
        <View style={run.liveRow}><Text style={[run.liveText,{color:ACCENT}]}>완료</Text></View>
        <View style={run.shoeChip}><MaterialCommunityIcons name="shoe-sneaker" size={15} color={T3}/><Text style={run.shoeChipText}>{ui.model||shoe.name}</Text></View>
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
      <View style={run.metricsGrid}>
        {[
          {v:fmtTime(finTime), l:'시간'},
          {v:fmtPace(finKm,finTime), l:'평균 페이스'},
          {v:finCad>0?String(finCad):'--', l:'케이던스'},
          {v:finCal>0?String(finCal):'--', l:'칼로리', u:'kcal'},
          {v:String(finElev), l:'고도 상승', u:'m'},
        ].map((m,i)=>(
          <View key={i} style={run.metricCell}>
            <View style={run.metricVRow}>
              <Text style={run.metricV}>{m.v}</Text>
              {m.u?<Text style={run.metricU}> {m.u}</Text>:null}
            </View>
            <Text style={run.metricL}>{m.l}</Text>
          </View>
        ))}
      </View>
      <TextInput style={run.memo} value={memo} onChangeText={setMemo} placeholder="메모 (선택)" placeholderTextColor={T3} autoCorrect={false} autoCapitalize="none"/>
      <View style={run.actionRow}>
        <TouchableOpacity style={run.discardBtn} onPress={onDiscard} accessibilityRole="button" accessibilityLabel="버리기"><Text style={run.discardTxt}>버리기</Text></TouchableOpacity>
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
  return (
    <RunActiveScreenView
      shoeLabel={ui.model||shoe.name}
      distanceKm={km}
      goalKm={goalKm}
      timeLabel={fmtTime(elapsed)}
      paceLabel={fmtPace(km,elapsed)}
      cadence={cadence}
      calories={liveCal}
      elevationM={elevGain}
      gpsLevel={gpsLevel}
      paused={paused}
      statusLabel={pauseLabel}
      onPause={handlePause}
      onStop={finishRun}
      permLost={permLost}
      onOpenSettings={()=>{Promise.resolve(Linking.openSettings()).catch(()=>{});}}
      liveCoords={liveCoords}
    />
  );
}

const run=StyleSheet.create({
  screen:{flex:1,backgroundColor:BG,paddingHorizontal:22},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  liveRow:{flexDirection:'row',alignItems:'center',gap:7},
  liveDot:{width:8,height:8,borderRadius:999},
  liveText:{fontFamily:FP,fontSize:14,fontWeight:'500',letterSpacing:0.3},
  shoeChip:{flexDirection:'row',alignItems:'center',gap:7,height:30,paddingHorizontal:12,borderRadius:999,backgroundColor:SURFACE},
  shoeChipText:{color:T3,fontFamily:FH,fontSize:13,fontWeight:'600'},
  gpsRow:{flexDirection:'row',alignItems:'center',marginTop:8},
  gpsText:{color:T3,fontFamily:FP,fontSize:13,fontWeight:'600'},
  banner:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10,paddingVertical:10,paddingHorizontal:12,borderRadius:12,borderWidth:StyleSheet.hairlineWidth},
  bannerWarn:{backgroundColor:'rgba(255,193,7,0.12)',borderColor:WARN},
  bannerDanger:{backgroundColor:'rgba(255,69,58,0.14)',borderColor:DANGER},
  bannerText:{flex:1,color:T1,fontFamily:FP,fontSize:13,fontWeight:'500',lineHeight:17},
  body:{flex:1,alignItems:'center',justifyContent:'center'},
  goalText:{color:T3,fontFamily:FP,fontSize:12,fontWeight:'500',letterSpacing:1},
  bigDist:{color:T1,fontFamily:FH,fontSize:84,letterSpacing:1,marginTop:6},
  bigUnit:{color:T3,fontFamily:FP,fontSize:14,fontWeight:'600',marginTop:2},
  metrics:{flexDirection:'row',marginHorizontal:-4,paddingVertical:14,paddingBottom:24,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:SEP},
  metric:{flex:1,alignItems:'center',gap:4},
  // 5지표 그리드(시간/페이스/케이던스/칼로리/고도) — 3열로 흘러 2행(3+2).
  metricsGrid:{flexDirection:'row',flexWrap:'wrap',paddingTop:14,paddingBottom:20,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:SEP},
  metricCell:{width:'33.33%',alignItems:'center',gap:4,paddingVertical:8},
  metricVRow:{flexDirection:'row',alignItems:'flex-end'},
  metricV:{color:T1,fontFamily:FH,fontSize:25,letterSpacing:0.3},
  metricU:{color:T3,fontFamily:FP,fontSize:11,marginBottom:3},
  metricL:{color:T3,fontFamily:FP,fontSize:12,fontWeight:'600'},
  // 러닝 중 메트릭 위계 — 시간·페이스 hero(큰) + 케이던스·칼로리·고도 sub(작은).
  heroMetrics:{flexDirection:'row',paddingVertical:16,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:SEP},
  hm:{flex:1,alignItems:'center'},
  hmV:{fontFamily:FH,fontSize:34,fontWeight:'600',color:T1,letterSpacing:-1},
  hmL:{color:T3,fontFamily:FP,fontSize:12,fontWeight:'500',marginTop:5},
  subMetrics:{flexDirection:'row',justifyContent:'space-around',paddingVertical:12},
  smV:{fontFamily:FH,fontSize:15,fontWeight:'500',color:T2,textAlign:'center'},
  smL:{color:T3,fontFamily:FP,fontSize:10,fontWeight:'500',marginTop:3,textAlign:'center'},
  controls:{flexDirection:'row',alignItems:'flex-start',justifyContent:'center',gap:40,paddingTop:4,paddingBottom:8},
  ctrlPrimary:{width:92,height:92,borderRadius:999,backgroundColor:ACCENT,alignItems:'center',justifyContent:'center'},
  ctrlPrimaryLg:{width:96,height:96,borderRadius:999,backgroundColor:ACCENT,alignItems:'center',justifyContent:'center'},
  ctrlStop:{width:72,height:72,borderRadius:999,backgroundColor:'rgba(255,69,58,0.18)',alignItems:'center',justifyContent:'center',marginTop:10},
  ctrlHint:{color:T3,fontFamily:FP,fontSize:11,letterSpacing:0.5,textAlign:'center'},
  memo:{backgroundColor:SURFACE,borderRadius:14,padding:14,color:T1,fontSize:15,fontFamily:FP,marginBottom:16},
  actionRow:{flexDirection:'row',gap:12},
  // 버리기는 SURFACE flat 보조 버튼 — 모서리는 saveBtn(단일 Button=RADIUS.btn)과 맞춰 통일.
  discardBtn:{flex:1,backgroundColor:SURFACE,borderRadius:RADIUS.btn,padding:16,alignItems:'center'},
  discardTxt:{color:T1,fontSize:16,fontFamily:FP,fontWeight:'600'},
  // 저장하기는 단일 Button 프리미티브로 라우팅(그라데이션/글로우/RADIUS.btn). 여기선 flex 비율만.
  saveBtn:{flex:2},
});
