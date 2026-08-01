// ============================================================================
// ProfileScreen.rn.tsx — 프로필: identity, lifetime stats, achievements, settings
// 설정 행은 실제로 구동된다(하드코딩 '주5회'/'켜짐'/'킬로미터' 제거):
//   · 주간 목표 — 홈 '이번 주 러닝' 카드 히어로 탭 → 스테퍼 시트가 유일한 수정 경로
//     (마이탭 주간 목표 카드·스트릭 카드는 홈 원카드로 이관 — IA 정리 2026-07-25)
//   · 알림     — 신발 교체 알림 on/off + 임계값(수명 사용률 %)
//   · 단위     — km ↔ mi 토글(전 화면 즉시 환산 반영)
//   · 계정 설정 — 기기/가입/버전 정보
// 값은 App이 소유(영속은 lib/settings)하고, 이 화면은 표시 + 변경 콜백만 담당한다.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import { View, ScrollView, Pressable, StyleSheet, Image, Share, Linking } from 'react-native';
import { showDialog } from './lib/dialog';
import {Text} from './lib/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { BG, CARD, CARD_HI, ACCENT, GOOD, DANGER, WARN, T1, T2, T3, SEP, CARD_BORDER, FONT, DISPLAY, withAlpha, TIER_COLORS, TIER_LABEL, KAKAO_YELLOW, KAKAO_LABEL, NAVER_GREEN, NAVER_LABEL, RADIUS, GUTTER, MOTION, HALL_GOLD, TYPE, GLASS, ICON} from './theme';
// recap 토글 = SegmentedControl(sm), 스탯 그리드들 = StatGrid 단일 프리미티브.
import { TabBar, TABBAR_CLEARANCE, Button, SegmentedControl, StatGrid, Stepper, AmbientBackdrop, Rise, GlassEdge, Toggle, KakaoMark, NaverMark, Input } from './primitives';
import { Unit, unitKorean, displayNum } from './lib/units';
import { monthlyRecap, type RecapRun, type RecapShoe } from './lib/recap';
import { reportIssue } from './lib/crashlytics';
import { hkAvailable, hkLinked, hkLink, hkRestingHR } from './lib/healthkit';
import { buildRecapShareCardModel, shareRecapCard, shareRunnerSpecCard, formatRecapPRs, type RecapKind, type SvgCapturable } from './lib/shareCard';
import RecapShareCard from './RecapShareCard';
import RunnerSpecShareCard, { type RunnerSpecShareModel } from './RunnerSpecShareCard';
import SocialProfileCard from './SocialProfileCard';
import type { PublicProfile } from './lib/publicProfile';
import {
  AlertSettings, THRESHOLD_STEP,
  MIN_THRESHOLD_PCT, MAX_THRESHOLD_PCT, DEFAULT_SETTINGS, DEFAULT_ALERTS,
  WEIGHT_STEP, MIN_WEIGHT_KG, MAX_WEIGHT_KG,
  AGE_STEP, MIN_AGE, MAX_AGE,
  VoiceSettings, DEFAULT_VOICE, loadVoiceSettings, saveVoiceSettings, VOICE_VOLUME_STEPS,
  loadAutoPause, saveAutoPause, DEFAULT_AUTOPAUSE,
  loadHaptics, saveHaptics, DEFAULT_HAPTICS,
} from './lib/settings';
import { setHapticsEnabled } from './lib/haptics';
import { watchSession } from './lib/watchSession';
import { NotifSettings, DEFAULT_NOTIF_SETTINGS } from './lib/notifications';
import { requestPushPermission as defaultRequestPushPermission } from './lib/pushMessaging';
import { BackupPayload } from './lib/backup';
import { mergeCloudData, nextAuthState, AuthState } from './lib/cloudSync';
import type { CloudPort, CloudProvider, CloudUser } from './lib/cloudPort';
import { loadCloudAccount, saveCloudAccount, clearCloudAccount, CLOUD_PROVIDER_LABEL } from './lib/cloudAccount';
import type { RunBestEfforts } from './lib/bestEfforts';
import { STANDARD_DISTANCES } from './lib/bestEfforts';
import { fitnessSummary } from './lib/analytics/fitness';
import { fmtTime } from './lib/format';
import { authErrorMessage } from './lib/authErrorMessage';
import { PRIVACY_URL, TERMS_URL, SUPPORT_EMAIL } from './lib/legalLinks';
import { trackLogin } from './lib/productAnalytics';
import type { RankTier } from './lib/progression/types';

// 신원 칩은 진척 시스템의 단일 Rank(티어)로 통일한다 — 옛 '러닝 레벨 N'(km/100) 개념 폐기.
// equippedTitle·achievementCount·retiredShoes 는 진척 신원 블록(스펙)용(없으면 미표시/0).
export type Profile = { name: string; since: string; totalKm: number; totalRuns: number; totalTime: string; rankTier: RankTier; equippedTitle?: string | null; achievementCount?: number; retiredShoes?: number };
export type Badge = { icon: string; label: string; on: boolean };
// 개인 기록(PR) 카드 한 칸. value/unit은 App이 표시 단위로 환산·포맷해 주입한다
// (기록 없음은 value='--'). 화면은 표시만 담당한다.
export type PersonalRecord = { icon: string; label: string; value: string; unit: string };

const DEFAULT_PROFILE: Profile = { name: '러너', since: '', totalKm: 0, totalRuns: 0, totalTime: '0', rankTier: 'bronze' };
// 버전 단일 소스 = package.json(심사 #16, 2026-07-22) — 릴리스 때 package.json 만 올리면 된다.
// (네이티브 MARKETING_VERSION 직접 읽기는 신규 네이티브 의존이 필요해 보류 — 승인제.)
const APP_VERSION: string = require('./package.json').version;

// 마지막 동기 시각을 HH:MM 로 짧게 포맷한다(상세 행 detail 용). null 이면 호출부가
// '아직 동기화 안 됨' 카피로 분기한다.
function fmtSyncTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// 러닝 리마인더 시각('HH:MM')을 30분 단위로 증감한다(24시간 순환). 형식 불량/결측은
// 19:00 기준으로 보정해 NaN 없이 graceful 하게 동작한다(notifications 의 정규화와 동일 톤).
const REMINDER_STEP_MIN = 30;
function stepReminderTime(hhmm: string, dir: 1 | -1): string {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(typeof hhmm === 'string' ? hhmm : '');
  const base = m ? Number(m[1]) * 60 + Number(m[2]) : 19 * 60;
  let next = (base + dir * REMINDER_STEP_MIN) % (24 * 60);
  if (next < 0) next += 24 * 60;
  const h = Math.floor(next / 60);
  const mm = next % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// on/off 설정 행 — 라벨 좌측(무채) + 우측 작은 iOS 스위치(Toggle 프리미티브, ON=파파야).
// 구 풀폭 솔리드 바(GOOD 배경 + 종 아이콘 + "켜짐/꺼짐" 텍스트)는 패널에 3~5장 쌓이면
// 색 대면적이 시끄러워 폐지(사용자 2026-07-16 "보기 어렵다 → 우측에 작게, 좌우로").
function NotifToggle({ label, value, onToggle, testID }: { label: string; value: boolean; onToggle: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onToggle}
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      style={s.toggleRow}
    >
      <Text style={s.toggleLabel}>{label}</Text>
      <Toggle on={value} />
    </Pressable>
  );
}

// −/＋ 스테퍼(목표 거리·알림 임계값 공용). 모듈 스코프에 둬 매 렌더 재생성을 피한다.
// 스텝퍼는 앱 공용 프리미티브(primitives.Stepper) — 로컬 구현 제거(2026-07-04 DS 통일).

export default function ProfileScreen({
  profile = DEFAULT_PROFILE, badges: _badges = [], records = [], distancePBs = {}, onTab,
  socialVisibility = 'unset', onToggleSocial, socialPreview = null,
  profilePhotoUri = '', onChangeName, onPickPhoto,
  weightKg = DEFAULT_SETTINGS.weightKg, onChangeWeight,
  age = DEFAULT_SETTINGS.age, onChangeAge,
  sex = DEFAULT_SETTINGS.sex, onChangeSex,
  restHR = DEFAULT_SETTINGS.restHR, onChangeRestHR,
  initialOpen = null, onConsumeInitialOpen,
  unit = 'km', onChangeUnit,
  alerts = { ...DEFAULT_ALERTS }, onChangeAlerts,
  notifSettings = DEFAULT_NOTIF_SETTINGS, onChangeNotifSettings,
  onRequestPushPermission = defaultRequestPushPermission,
  recapRuns = [], recapShoes = [], recapNow,
  backupData = { shoes: [], runs: [], settings: {} },
  cloudPort, onCloudMerged, onDeleteAccount, cloudClock = () => Date.now(),
  onOpenProgression,
  onOpenHallOfShoes, retiredCount = 0,
  onOpenMedalArchive, medalCount = 0,
  todayISO = '',
  onReplayOnboarding,
}: {
  profile?: Profile;
  badges?: Badge[];
  records?: PersonalRecord[];
  distancePBs?: RunBestEfforts;
  /** 공개 프로필 상태(소셜). 'unset' 은 아직 안 물어본 것 — 이 화면에선 '꺼짐'과 같이 다룬다. */
  socialVisibility?: 'unset' | 'public' | 'private';
  onToggleSocial?: (next: 'public' | 'private') => void;
  /** 남들에게 보일 카드(공개 중일 때 설정 안에서 그대로 보여준다). */
  socialPreview?: PublicProfile | null;
  onTab?: (i: number) => void;
  // 프로필 정체성(로컬 영속). 사진 URI(없으면 아이콘 폴백), 이름 변경, 사진 선택 콜백.
  profilePhotoUri?: string;
  onChangeName?: (name: string) => void;
  onPickPhoto?: () => void;
  // 체중(kg) — 칼로리 추정용. 설정 스테퍼가 조정한다.
  weightKg?: number;
  onChangeWeight?: (kg: number) => void;
  // 신체지표(심박존용) — 나이→최대심박, 안정심박→Karvonen, 성별→TRIMP. 0=미설정.
  age?: number;
  onChangeAge?: (v: number) => void;
  sex?: 'male' | 'female';
  onChangeSex?: (v: 'male' | 'female') => void;
  restHR?: number;
  onChangeRestHR?: (v: number) => void;
  initialOpen?: 'body' | 'alerts' | 'notif' | 'account' | null;
  onConsumeInitialOpen?: () => void;
  unit?: Unit;
  onChangeUnit?: (u: Unit) => void;
  // (스트릭 주간 점·주간 목표 카드는 홈 '이번 주 러닝' 원카드로 이관 — IA 정리 2026-07-25.
  //  streakDays/weekDays/weekTodayIdx/challengeExt*/weeklyGoalKm/onEditSmartTarget prop 폐지.)
  alerts?: AlertSettings;
  onChangeAlerts?: (a: AlertSettings) => void;
  // 푸시 알림 설정(신규 notif_settings 키). 기존 in-app 배지 알림(AlertSettings)과 별개·공존.
  // App 이 getNotifSettings 로 복원해 주입하고, 변경은 onChangeNotifSettings 로 올려 영속한다.
  notifSettings?: NotifSettings;
  onChangeNotifSettings?: (s: NotifSettings) => void;
  // 기기 푸시 권한 요청(주입 가능 — 기본은 lib/pushMessaging). 거부해도 throw 하지 않고
  // false 를 돌려주므로(S8-3) 호출부는 비차단으로 graceful 안내만 한다.
  onRequestPushPermission?: () => Promise<boolean>;
  // ── 기간 리캡(돌아보기, slice-8-recap-ui) ───────────────────────────────────
  // App 이 소유한 런/신발 원본을 그대로 주입한다(lib/recap 이 읽기 전용으로 요약, 원본
  // 불변 A8-1). recapNow 는 기간 분기 결정용 기준 시각(미주입 시 현재 시각 — 프로덕션
  // 기본). 테스트는 recapNow 를 주입해 주/월 분기를 결정적으로 검증한다.
  recapRuns?: RecapRun[];
  recapShoes?: RecapShoe[];
  recapNow?: Date;
  // 로컬 백업 대상(신발+런+설정). App이 소유한 상태를 모아 주입한다.
  backupData?: BackupPayload;
  // 가져오기: parseBackup 검증 성공 시에만 호출된다(실패 시 미호출 — 기존 데이터 보존).
  // 기준일('YYYY-MM-DD') — 심폐 체력(VO₂max) 최근성 판정용. 테스트 결정성 주입.
  todayISO?: string;
  // ── 계정·클라우드 동기 ───────────────────────────────────────────────────────
  // 백엔드 포트(주입). App 은 firebaseCloudPort 를, 테스트는 메모리 목 포트를 넣는다.
  // 없으면 계정 섹션의 버튼은 동작하지 않는다(안전한 no-op).
  cloudPort?: CloudPort;
  // 동기로 병합된 결과(BackupPayload)를 App 상태/영속에 반영하는 콜백. pull→merge→push
  // 직후 호출돼 원격에만 있던 레코드를 로컬에도 무손실로 들여온다(데이터 파괴 금지).
  onCloudMerged?: (data: BackupPayload) => void;
  // 마지막 동기 시각용 시계(테스트 주입). 기본은 Date.now.
  cloudClock?: () => number;
  // 진척(나의 여정·업적) 화면 진입. App 이 전체화면 ProgressionScreen 으로 전환한다.
  // 없으면 진척 진입 버튼은 표시되지 않는다(안전한 no-op).
  onOpenProgression?: () => void;
  // 명예의 전당(은퇴 신발 박물관) 진입. 없으면 진입 버튼 미표시(안전한 no-op).
  // (신발탭 이동을 검토했으나 사용자 결정으로 마이탭 유지 — 2026-07-02.)
  onOpenHallOfShoes?: () => void;
  // 마라톤 메달 아카이브 진입(명예의 전당 옆). 없으면 행 미표시(안전한 no-op).
  onOpenMedalArchive?: () => void;
  medalCount?: number;
  // 은퇴한 신발 수(전당 진입 행의 부제에 표시). 0이어도 진입은 가능(빈 전당 안내).
  retiredCount?: number;
  // (신발 보관함 진입은 신발 탭 하단으로 이관 — 심사 #7, 2026-07-22.)
  // 온보딩 다시 보기 — 설정에서 온보딩 플로우를 비영속으로 재생(리뷰용). 없으면 행 미표시.
  onReplayOnboarding?: () => void;
  // 회원 탈퇴(계정+클라우드+로컬 영구 삭제). App 이 cloudPort.deleteAccount + 로컬 초기화를
  // 수행한다. 없으면 탈퇴 행 미표시(안전한 no-op).
  onDeleteAccount?: () => Promise<void>;
}) {
  // 어떤 설정 행이 펼쳐졌는지(단위는 패널 없이 즉시 토글). 한 번에 하나만 펼친다.
  // 'weight' 아코디언은 '신체 정보'(body)로 병합(심사 #21, 2026-07-22).
  const [open, setOpen] = useState<null | 'body' | 'alerts' | 'notif' | 'voice' | 'account'>(null);
  const toggleOpen = (k: 'body' | 'alerts' | 'notif' | 'voice' | 'account') => setOpen((o) => (o === k ? null : k));

  // ── 음성 코칭 설정(탑티어 패리티 #14) — 로컬 로드/저장, 다음 러닝부터 적용 ──────
  const [voice, setVoice] = useState<VoiceSettings>({...DEFAULT_VOICE});
  useEffect(() => { void loadVoiceSettings().then(setVoice); }, []);
  const patchVoice = (patch: Partial<VoiceSettings>) => {
    setVoice(prev => {
      const next = {...prev, ...patch};
      void saveVoiceSettings(next);
      return next;
    });
  };

  // ── 자동 일시정지(#16) — 즉시 토글, 다음 러닝부터 적용 ──────────────────────
  const [autoPauseOn, setAutoPauseOn] = useState<boolean>(DEFAULT_AUTOPAUSE);
  useEffect(() => { void loadAutoPause().then(setAutoPauseOn); }, []);
  const toggleAutoPause = () => {
    setAutoPauseOn(prev => {
      const next = !prev;
      void saveAutoPause(next);
      return next;
    });
  };

  // ── 햅틱(진동) on/off — 즉시 적용. 폰 Vibration(lib/haptics) + 워치(자동 랩·존 이탈)를
  //    한 스위치로. "화면 전환 진동이 거슬리는 사람"을 위한 단일 스위치(사용자 요청). ──
  const [hapticsOn, setHapticsOn] = useState<boolean>(DEFAULT_HAPTICS);
  useEffect(() => { void loadHaptics().then(v => { setHapticsOn(v); setHapticsEnabled(v); }); }, []);
  const toggleHaptics = () => {
    setHapticsOn(prev => {
      const next = !prev;
      setHapticsEnabled(next);      // 폰 진동 즉시 반영(전 화면 공통)
      watchSession.setHaptics(next); // 워치 자동 랩·존 이탈 진동에도 전달
      void saveHaptics(next);
      return next;
    });
  };

  // 마이탭 정리(설정 분리): 기본은 프로필+기록만 보이고, 헤더 ⚙️ 를 누르면 같은 화면이
  // 전체화면 '설정' 뷰로 전환된다(목표·알림·푸시·단위·체중·계정·클라우드를 한곳에 모음).
  // 상태/핸들러는 그대로 공유하므로 데이터 흐름은 바뀌지 않는다(뷰 전환일 뿐).
  const [showSettings, setShowSettings] = useState(false);

  // Apple 건강(HealthKit) 연동 상태 — 기기가 지원할 때만 행 노출. 연동 성공 시
  // 안정시심박이 비어 있으면 HK 최신값으로 자동 채움(Karvonen HR존 정확도 ↑).
  const [hkOn, setHkOn] = useState(false);
  useEffect(() => { void hkLinked().then(setHkOn); }, []);
  const linkHealth = async () => {
    if (hkOn) return;
    const ok = await hkLink();
    if (!ok) return;
    setHkOn(true);
    if (!(restHR > 0)) {
      const v = await hkRestingHR();
      if (v > 0) onChangeRestHR?.(v);
    }
  };

  const scrollRef = useRef<ScrollView>(null);

  // 홈 주간목표 탭으로 진입 시: 해당 설정 패널을 펼치고 설정 섹션으로 스크롤한다(한 번만 소비).
  useEffect(() => {
    if (!initialOpen) return;
    setShowSettings(true);   // 홈 주간목표 탭 등 외부 진입 → 설정 뷰를 연다
    setOpen(initialOpen);
    onConsumeInitialOpen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen]);

  // 이름 인라인 편집(저장은 onChangeName → App 이 영속). 편집 시작 시 현재 이름을
  // 초안으로 채우고, 저장 시 공백이면 App 이 기본값으로 보정한다.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);
  const startEditName = () => { setNameDraft(profile.name); setEditingName(true); };
  const saveName = () => { onChangeName?.(nameDraft); setEditingName(false); };

  // ── 계정·클라우드 동기 ───────────────────────────────────────────────────────
  // 인증 상태는 lib/cloudSync 의 상태머신(nextAuthState)으로만 전이시켜 화면이 임의로
  // 상태를 깨지 않게 한다. 실제 로그인/동기는 주입된 cloudPort 뒤에서 일어나고, 이 화면은
  // 상태 표시 + 트리거만 담당한다(백엔드는 firebaseCloudPort, 테스트는 메모리 목 포트).
  const [authState, setAuthState] = useState<AuthState>('signedOut');
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [cloudProvider, setCloudProvider] = useState<CloudProvider | null>(null);
  // 로그인 상태 복원(2026-07-05): App 은 Firebase 세션으로 이미 게이팅하지만 이 패널의
  // authState 는 재시작 시 'signedOut'으로 초기화돼 로그인해도 '카카오로 계속…' 버튼이
  // 계속 떴다. 저장된 계정을 읽어 로그인 상태 + 제공자를 복원한다.
  useEffect(() => {
    let alive = true;
    void loadCloudAccount().then((acc) => {
      if (!alive || !acc) return;
      setCloudUser({uid: acc.uid, email: acc.email ?? null, displayName: acc.displayName ?? null});
      setCloudProvider(acc.provider);
      setAuthState((s) => (s === 'signedOut' ? 'signedIn' : s));
    });
    return () => { alive = false; };
  }, []);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  // 동기화 실패 표시(2026-07-05): 지금까진 실패해도 조용해 데이터가 안 올라가도 몰랐다.
  // 자동 동기가 실패하면 계정 카드에 '동기화 실패 · 다시 시도'로 알리고 재시도 가능하게.
  const [syncFailed, setSyncFailed] = useState(false);
  const [cloudMsg, setCloudMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 계정·클라우드 아코디언(사용자 2026-07-05): 로그인 시 6행 → 헤더 1행 + 탭하면 펼침.
  const [acctOpen, setAcctOpen] = useState(false);
  const signedIn = authState === 'signedIn';
  const signingIn = authState === 'signingIn';

  // 로그인: signInStart→(성공)signInSuccess/(실패)signInError. error 상태에서의 재시도는
  // 상태머신 계약상 signedOut 경유가 필요하므로 먼저 signedOut 으로 리셋한 뒤 시작한다.
  const handleSignIn = async (provider: CloudProvider) => {
    if (!cloudPort || signingIn) return;
    setCloudMsg(null);
    setAuthState((s) => nextAuthState(s === 'error' ? 'signedOut' : s, 'signInStart'));
    try {
      const user = await cloudPort.signIn(provider);
      setCloudUser(user);
      setCloudProvider(provider);
      void saveCloudAccount(provider, user);
      setAuthState((s) => nextAuthState(s, 'signInSuccess'));
      // 제공자별 성공만 남긴다 — 계정 식별자는 남기지 않는다(심사 B-12 최소 수집).
      trackLogin(provider as any);
      // 동기는 아래 자동 동기 effect 가 (signedIn 전환 + 데이터 변경 시) 처리한다.
    } catch (e: any) {
      setAuthState((s) => nextAuthState(s, 'signInError'));
      // 원문은 로그로만 — 화면엔 사용자 언어(LoginScreen 과 동일 매퍼, 출시 감사).
      reportIssue('auth: profile sign-in', e);
      const msg = authErrorMessage(e);
      if (msg) setCloudMsg({ ok: false, text: msg });
    }
  };

  // 로그아웃: 어디서든 signedOut 으로. 로컬 데이터는 건드리지 않는다(데이터 파괴 금지).
  // 확인 다이얼로그 1겹(심사 #15, 2026-07-22) — 탈퇴엔 있는데 로그아웃엔 없던 관습 위반 보정.
  // 카피가 "기록은 안전"을 함께 말해 데이터 불안도 해소한다.
  const doSignOut = async () => {
    if (!cloudPort) return;
    try {
      await cloudPort.signOut();
    } catch {
      // 네트워크 실패로 원격 세션이 안 닫혀도 화면은 로그아웃으로 떨군다.
    }
    setCloudUser(null);
    setCloudProvider(null);
    void clearCloudAccount();
    setLastSyncAt(null);
    setCloudMsg(null);
    setAuthState((s) => nextAuthState(s, 'signOut'));
  };
  const handleSignOut = () => {
    showDialog('로그아웃', '로그아웃할까요? 기록은 이 기기와 클라우드에 안전하게 남아요.', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => { void doSignOut(); } },
    ]);
  };

  // 회원 탈퇴: 되돌릴 수 없는 영구 삭제이므로 확인 다이얼로그를 거친다. 확인 시 App 의
  // onDeleteAccount(클라우드 계정+백업 삭제 → 로컬 전체 삭제 → 온보딩 초기화)를 호출하고,
  // 성공하면 화면도 signedOut 으로 떨군다. 실패(재인증 필요 등)는 정직한 메시지로 안내.
  const handleDeleteAccount = () => {
    if (!onDeleteAccount) return;
    showDialog(
      '회원 탈퇴',
      '계정과 모든 데이터(신발·러닝 기록·설정)가 영구 삭제되며 복구할 수 없어요. 정말 탈퇴할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            try {
              await onDeleteAccount();
              setCloudUser(null);
              setLastSyncAt(null);
              setAuthState((s) => nextAuthState(s, 'signOut'));
              setCloudMsg({ ok: true, text: '계정이 삭제됐어요.' });
            } catch (e: any) {
              // raw 에러(영문 Firebase 코드)를 화면에 노출하지 않는다 — 콘솔에만.
              reportIssue('auth: account delete', e);
              const reauth = /requires-recent-login|recent login|re-authenticate/i.test(String(e?.code ?? e?.message ?? ''));
              setCloudMsg({ ok: false, text: reauth ? '보안을 위해 다시 로그인한 뒤 탈퇴해 주세요.' : '계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.' });
            }
          },
        },
      ],
    );
  };

  // 동기 본체: pull(원격) → mergeCloudData(로컬, 원격) → push(병합 결과). 양방향 무손실
  // 병합이라 백업·복원을 한 번에 끝낸다(어느 쪽 레코드도 버리지 않음). 병합 결과는
  // onCloudMerged 로 App 에 돌려 원격에만 있던 레코드를 로컬에도 반영한다.
  // signedIn 가드 없이 cloudPort(currentUser)만 의존 — 로그인 직후 자동 호출에서도
  // authState 상태 갱신 타이밍과 무관하게 동작한다.
  const runSync = async (silent = false) => {
    if (!cloudPort || syncing) return;
    setSyncing(true);
    setSyncFailed(false);
    if (!silent) setCloudMsg(null);
    try {
      const remote = await cloudPort.pull();
      const merged = mergeCloudData(backupData, remote);
      await cloudPort.push(merged);
      onCloudMerged?.(merged);
      setLastSyncAt(cloudClock());
      setSyncFailed(false);
      // 자동(silent) 동기는 성공 팝업을 띄우지 않는다(계정 행 상태로만 표시). 에러는 항상 안내.
      if (!silent) setCloudMsg({ ok: true, text: '모든 기록이 안전하게 보관됐어요.' });
    } catch (e: any) {
      // 원문(Firestore 에러 등)은 로그로만 — 화면엔 사용자 언어(출시 감사).
      reportIssue('cloud sync (profile)', e);
      setSyncFailed(true); // 계정 카드에 '동기화 실패 · 다시 시도' 표시(조용한 실패 방지).
      if (!silent) setCloudMsg({ ok: false, text: '지금은 연결이 원활하지 않아요. 기록은 이 기기에 그대로 있어요.' });
    } finally {
      setSyncing(false);
    }
  };
  // 자동 동기: 로그인(signedIn 전환) + 로컬 데이터(신발/런/설정) 변경 시 디바운스로
  // 백그라운드 동기한다(수동 '지금 동기' 버튼 없음). 변경 폭주는 1초 디바운스로 합친다.
  // 변경 감지는 렌더마다 전체 backupData 를 JSON.stringify(런 수백 건·route 블롭 포함,
  // 비싸다) 하는 대신 경량 시그니처(개수 + 최종 수정시각 + 설정)로 한다: 신발/런 추가·
  // 삭제(개수)·수정(updatedAt 증가)·설정 변경이면 시그니처가 바뀌어 재동기한다. settings
  // 만 stringify 하므로 비용이 데이터 크기에 비례하지 않는다.
  const dataSig = useMemo(() => {
    const maxUpdated = (arr: readonly unknown[]) =>
      arr.reduce<number>((m, x) => {
        const u = (x as { updatedAt?: unknown }).updatedAt;
        return typeof u === 'number' && u > m ? u : m;
      }, 0);
    const shoes = backupData.shoes || [];
    const runs = backupData.runs || [];
    return `${shoes.length}:${runs.length}:${Math.max(maxUpdated(shoes), maxUpdated(runs))}:${JSON.stringify(backupData.settings || {})}`;
  }, [backupData]);
  useEffect(() => {
    if (!signedIn) return;
    const t = setTimeout(() => { void runSync(true); }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, dataSig]);

  const accountLabel = cloudUser?.email || cloudUser?.displayName || '계정 연결됨';
  const lastSyncLabel = lastSyncAt == null ? '아직 동기화 안 됨' : `${fmtSyncTime(lastSyncAt)} 동기화됨`;

  const stepWeight = (dir: 1 | -1) => {
    onChangeWeight?.(Math.max(MIN_WEIGHT_KG, Math.min(MAX_WEIGHT_KG, weightKg + dir * WEIGHT_STEP)));
  };
  // 나이·안정심박 스테퍼 — 미설정(0)에서 처음 +를 누르면 각자 하한값에서 시작한다.
  const stepAge = (dir: 1 | -1) => {
    const base = age > 0 ? age : (dir > 0 ? MIN_AGE - AGE_STEP : MIN_AGE);
    onChangeAge?.(Math.max(MIN_AGE, Math.min(MAX_AGE, base + dir * AGE_STEP)));
  };

  const toggleAlerts = () => onChangeAlerts?.({ ...alerts, enabled: !alerts.enabled });
  const stepThreshold = (dir: 1 | -1) => {
    const next = Math.max(MIN_THRESHOLD_PCT, Math.min(MAX_THRESHOLD_PCT, alerts.thresholdPct + dir * THRESHOLD_STEP));
    onChangeAlerts?.({ ...alerts, thresholdPct: next });
  };

  // ── 푸시 알림 설정(신규 notif_settings) ─────────────────────────────────────
  // 기기 권한이 거부됐을 때만 보여주는 비차단 graceful 안내(설정 자체는 저장됨). 권한은
  // '켜는' 순간 1회 요청하고, ref 로 허용 여부를 기억해 매 토글마다 다시 묻지 않는다.
  const [pushDenied, setPushDenied] = useState(false);
  const pushGrantedRef = useRef(false);
  // 프라이밍 1회 표시 여부 — OS 권한 다이얼로그는 되돌릴 수 없으므로(거부 후 앱 재요청 불가),
  // 그 앞에 '왜 필요한지'를 먼저 설명한다(애플 권장 pre-permission 패턴, 위치 프라이밍과 일관).
  const pushPrimedRef = useRef(false);
  const ensurePushPermission = async () => {
    if (pushGrantedRef.current) return;
    // 첫 요청 전: OS 다이얼로그가 뜨는 이유를 한국어로 먼저 설명한다(프라이밍).
    if (!pushPrimedRef.current) {
      pushPrimedRef.current = true;
      const proceed = await new Promise<boolean>((resolve) => {
        showDialog(
          '알림을 켤까요?',
          '정해둔 시각에 러닝 리마인더를 보내드려요. 러닝화 교체 시기·주간 목표는 앱을 열 때 안내해요. 광고성 알림은 보내지 않아요.',
          [
            { text: '나중에', style: 'cancel', onPress: () => resolve(false) },
            { text: '알림 받기', onPress: () => resolve(true) },
          ],
          // (구 Alert 의 {cancelable:false} 는 제거 — 커스텀 다이얼로그는 스크림 탭으로 닫히지 않아 동일 시맨틱.)
        );
      });
      // '나중에' — OS 다이얼로그를 띄우지 않는다(설정은 켠 채 유지, 비차단 안내만).
      if (!proceed) { setPushDenied(true); return; }
    }
    try {
      // requestPushPermission 은 거부/오류에도 throw 하지 않고 false 를 돌려준다(S8-3).
      const granted = await onRequestPushPermission?.();
      if (granted) { pushGrantedRef.current = true; setPushDenied(false); }
      else setPushDenied(true);
    } catch {
      // 만약을 위한 방어 — 권한 흐름 예외도 비차단(설정은 그대로 유지).
      setPushDenied(true);
    }
  };
  // 종류 토글: 변경을 즉시 상위로 올려 영속(끄기는 권한과 무관). 켜는 경우에만 권한을
  // 확인하되, 거부돼도 설정은 저장되고 안내만 띄운다(비차단, S8-3).
  const toggleNotif = (key: 'shoeReplacement' | 'weeklyGoal' | 'runReminder') => {
    const turningOn = !notifSettings[key];
    onChangeNotifSettings?.({ ...notifSettings, [key]: turningOn });
    if (turningOn) void ensurePushPermission();
  };
  const stepReminder = (dir: 1 | -1) => {
    onChangeNotifSettings?.({ ...notifSettings, reminderTime: stepReminderTime(notifSettings.reminderTime, dir) });
  };
  const notifOnCount =
    (notifSettings.shoeReplacement ? 1 : 0) +
    (notifSettings.weeklyGoal ? 1 : 0) +
    (notifSettings.runReminder ? 1 : 0);

  // ── 기간 리캡(돌아보기) — 월간 전용 ──────────────────────────────────────────
  // 주간 모드 폐지(간결화 E2, 2026-07-26): weeklyRecap 은 '최근 월요일~일요일' 로 홈
  // '이번 주 러닝' 원카드와 **완전히 같은 창·같은 3지표**(거리·횟수·평균 페이스)였다.
  // B안에서 스트릭·주간 목표를 홈으로 모은 것과 같은 이유로 주간의 집은 홈, 마이 탭은
  // 주보다 긴 호흡(월간)을 맡는다. lib/recap.weeklyRecap 은 공유 카드·다른 소비처를 위해
  // 그대로 남는다(제거한 건 이 화면의 토글뿐). recapNow 미주입 시 현재 시각 — useMemo 가
  // 매 렌더 새 Date 를 만들지 않도록 한 번만 고정한다.
  const recapMode: RecapKind = 'monthly';
  const nowRef = useRef<Date>(recapNow ?? new Date());
  const recapBase = recapNow ?? nowRef.current;
  const recap = useMemo(
    () => monthlyRecap(recapRuns, recapShoes, { now: recapBase }),
    [recapRuns, recapShoes, recapBase],
  );
  // 화면 표시용 PR 행(카드와 동일 포맷 재사용). 표시 단위 환산은 빌더가 처리.
  const recapPRs = formatRecapPRs(recap.prs, unit);
  // 심폐 체력(VO2max) — 러너 스펙(기록 탭 FitnessCard 를 마이 탭 스펙 카드로 이관). 같은 매핑.
  const vo2 = useMemo(
    () => fitnessSummary(
      (recapRuns as RecapRun[]).map((r) => ({ km: Number(r?.km ?? 0), durationS: Number(r?.duration ?? 0), runDate: String(r?.run_date || '') })),
      todayISO || '',
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recapRuns.length, (recapRuns as RecapRun[])[recapRuns.length - 1]?.id, todayISO],
  );
  const paceRec = records.find((r) => r.label.includes('1km'));
  const longRec = records.find((r) => r.label.includes('최장'));
  const recapTotalDisplay = displayNum(recap.totalKm, unit, 1);
  // 공유 카드(화면 밖 마운트) 모델 — press 시 Svg.toDataURL 로 캡처해 공유.
  const recapCardRef = useRef<SvgCapturable | null>(null);
  const recapCardModel = buildRecapShareCardModel(recap, { unit, kind: recapMode });
  // 러너 스펙 공유 카드(화면 밖 마운트) — 캡처해 공유.
  const specCardRef = useRef<SvgCapturable | null>(null);
  const specShareModel: RunnerSpecShareModel = {
    runner: profile?.name || '러너',
    brand: 'Keego',
    vo2max: vo2.vo2max,
    vo2maxLabel: vo2.vo2maxLabel,
    medals: STANDARD_DISTANCES.map((d) => {
      const sec = distancePBs[d.key];
      const earned = typeof sec === 'number' && sec > 0;
      return { label: d.label, value: earned ? fmtTime(Math.round(sec)) : '아직', earned };
    }),
    pace: paceRec && paceRec.value !== '--' ? `${paceRec.value}${paceRec.unit ?? ''}` : '--',
    longest: longRec && longRec.value !== '--' ? `${longRec.value}${longRec.unit ?? ''}` : '--',
    totalKm: profile.totalKm > 0 ? `${displayNum(profile.totalKm, unit, 0)}${unit}` : undefined,
  };
  const onShareSpec = () => { shareRunnerSpecCard(specCardRef, `${profile?.name || '러너'}의 러너 스펙 — Keego`); };
  const onShareRecap = () => {
    shareRecapCard(recapCardRef, recap, { unit, kind: recapMode });
  };

  const insets = useSafeAreaInsets();
  // 문의/지원 — 앱스토어 심사(ASC)가 요구하는 지원 연락처. 메일 앱으로 프리필된 문의를 연다.
  // 메일 앱이 없거나 실패하면 주소를 Alert 로 안내(막다른 길 방지).
  const openSupport = () => {
    const subject = encodeURIComponent('[Keego] 문의');
    const body = encodeURIComponent('\n\n\n————————\n문의 내용을 위에 적어주세요. 앱 버전·기기 정보를 함께 주시면 더 빨리 도와드릴 수 있어요.');
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() => {
      showDialog('문의하기', `메일 앱을 열 수 없어요.\n${SUPPORT_EMAIL} 로 문의해 주세요.`);
    });
  };
  // 법적 문서(개인정보·이용약관) + 문의 — 로그인 시엔 계정 아코디언 안에, 로그아웃 시엔 상시 노출.
  const legalRows = (
    <>
      <Pressable
        testID="support-contact"
        onPress={openSupport}
        accessibilityRole="button"
        accessibilityLabel="문의하기"
        style={({ pressed }) => [s.settingRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) }, pressed && { backgroundColor: CARD_HI }]}>
        <View style={s.settingIcon}><Ionicons name="mail-outline" size={ri(ICON.inline)} color={T2} /></View>
        <Text style={s.settingLabel}>문의하기</Text>
        <Ionicons name="chevron-forward" size={ri(ICON.inline)} color={T3} />
      </Pressable>
      <Pressable
        testID="legal-privacy"
        onPress={() => { Linking.openURL(PRIVACY_URL).catch(() => {}); }}
        accessibilityRole="link"
        accessibilityLabel="개인정보 처리방침 열기"
        style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
        <View style={s.settingIcon}><Ionicons name="shield-checkmark-outline" size={ri(ICON.inline)} color={T2} /></View>
        <Text style={s.settingLabel}>개인정보 처리방침</Text>
        <Ionicons name="open-outline" size={ri(ICON.inline)} color={T3} />
      </Pressable>
      <Pressable
        testID="legal-terms"
        onPress={() => { Linking.openURL(TERMS_URL).catch(() => {}); }}
        accessibilityRole="link"
        accessibilityLabel="이용약관 열기"
        style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
        <View style={s.settingIcon}><Ionicons name="document-text-outline" size={ri(ICON.inline)} color={T2} /></View>
        <Text style={s.settingLabel}>이용약관</Text>
        <Ionicons name="open-outline" size={ri(ICON.inline)} color={T3} />
      </Pressable>
    </>
  );
  return (
    <View style={s.screen}>
      <AmbientBackdrop />
      <Rise style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: GUTTER, paddingBottom: TABBAR_CLEARANCE, gap: rv(16) }}>
        {/* header — 마이(프로필+기록) ↔ 설정 뷰 전환 */}
        {showSettings ? (
          <View style={s.headerRow}>
            <Pressable onPress={() => setShowSettings(false)} accessibilityRole="button" accessibilityLabel="뒤로" hitSlop={8} style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="chevron-back" size={ri(ICON.action)} color={T2} /></Pressable>
            <Text style={s.title}>설정</Text>
            <View style={{ width: rs(38) }} />
          </View>
        ) : (
          <View style={s.headerRow}>
            <Text style={s.title}>마이</Text>
            <View style={{ flexDirection: 'row', gap: rv(8) }}>
              <Pressable onPress={() => { Share.share({ message: 'Keego에서 내 러닝화 수명을 관리하고 있어요 🏃' }).catch(() => {}); }} accessibilityRole="button" accessibilityLabel="기록 공유" hitSlop={8} style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="share-outline" size={ri(ICON.action)} color={T2} /></Pressable>
            <Pressable onPress={() => setShowSettings(true)} accessibilityRole="button" accessibilityLabel="설정 열기" hitSlop={8} style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="settings-outline" size={ri(ICON.action)} color={T2} /></Pressable>
            </View>
          </View>
        )}

        {!showSettings && (<>
        {/* identity — 아바타(탭하면 사진 변경) + 이름(탭하면 인라인 편집) */}
        <View style={s.identity}>
          <Pressable onPress={onPickPhoto} accessibilityRole="button" accessibilityLabel="프로필 사진 변경" style={s.avatarRing} testID="profile-avatar">
            <View style={s.avatarInner}>
              {profilePhotoUri ? (
                <Image source={{ uri: profilePhotoUri }} style={s.avatarImg} testID="profile-avatar-img" />
              ) : (
                <Ionicons name="person" size={ri(30)} color={T3} />
              )}
            </View>
            <View style={s.avatarEdit}><Ionicons name="camera" size={ri(ICON.tag)} color={BG} /></View>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <View style={s.nameEditRow}>
                <Input
                  variant="inline"
                  testID="profile-name-input"
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoFocus
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                  placeholder="이름"
                  style={s.nameInput}
                  accessibilityLabel="이름 입력"
                />
                <Pressable onPress={saveName} accessibilityRole="button" accessibilityLabel="이름 저장" hitSlop={8} style={s.nameSaveBtn}>
                  <Ionicons name="checkmark" size={ri(ICON.action)} color={T1} />
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={[s.tierEyebrow, {color: TIER_COLORS[profile.rankTier]}]} testID="profile-rank-chip">
                  {TIER_LABEL[profile.rankTier]}
                </Text>
                <Pressable onPress={startEditName} accessibilityRole="button" accessibilityLabel="이름 편집" style={s.nameRow} testID="profile-name">
                  <Text style={s.name} numberOfLines={1}>{profile.name}</Text>
                  <Ionicons name="pencil" size={ri(ICON.tag)} color={T3} />
                </Pressable>
              </>
            )}
            {/* 티어·메타(2026-07-04 재구성): 칩 상자·유령 타이틀필(타이틀 시스템 폐지
                잔재) 제거 — 진척탭과 같은 타이포 락업(아이브로우가 이름 위, 메타 한 줄). */}
            <View style={[s.row, { marginTop: rv(6), gap: rv(8) }]} testID="profile-progression-stats">
              {!!profile.since && <Text style={s.since}>{profile.since}</Text>}
              {!!profile.since && <Text style={s.since}>·</Text>}
              {(profile.achievementCount ?? 0) > 0 && (
                <Text style={s.idStat}>업적 <Text style={s.idStatNum}>{profile.achievementCount}</Text></Text>
              )}
              {(profile.retiredShoes ?? 0) > 0 && (
                <Text style={s.idStat}>은퇴 <Text style={s.idStatNum}>{profile.retiredShoes}</Text></Text>
              )}
            </View>
          </View>
          {/* 스트릭 Pill 제거(노이즈 감사 2026-07-05) — 같은 숫자가 바로 아래 '이번 주
              스트릭' 카드 헤더에 또 있었다(같은 정보는 한 번만). */}
        </View>

        {/* 러너 스펙 — VO2max + 거리 PB 훈장(5K·10K·하프·풀, 미달성 잠금) + 최고페이스/최장.
            러너의 정체성 '스펙 시트'(사용자 방향 2026-07-05). 거리 PB 는 paceTrack 베스트에포트. */}
        {(records.length > 0 || vo2.vo2max > 0) && (
          <View style={[s.card, { padding: rs(16) }]} testID="runner-spec">
            <GlassEdge glints={false} radius={RADIUS.lg} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rv(16) }}>
              <Text style={[s.cardTitle, { marginBottom: rv(0) }]}>러너 스펙</Text>
              <Pressable onPress={onShareSpec} testID="spec-share" accessibilityRole="button" accessibilityLabel="러너 스펙 공유" hitSlop={8} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: rv(4) }, pressed && { transform: [{ scale: MOTION.press.scale }], opacity: MOTION.press.opacity }]}>
                <Ionicons name="share-outline" size={ri(ICON.inline)} color={ACCENT} />
                <Text style={{ color: ACCENT, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700' }}>공유</Text>
              </Pressable>
            </View>

            {/* 거리 PB — 러너 스펙의 메인(사용자 확정 A안). 5K·10K·하프·풀 최고 기록 타일 2×2.
                달성 = 골드 메달, 미달성 = 잠금 + '아직'(빈 칸도 채우고 싶은 목표로 동작). */}
            <View style={s.pbGrid}>
              {STANDARD_DISTANCES.map((d) => {
                const sec = distancePBs[d.key];
                const earned = typeof sec === 'number' && sec > 0;
                return (
                  <View key={d.key} style={[s.pbTile, earned ? s.pbTileOn : s.pbTileOff]} testID={`pb-${d.key}`}
                    accessible accessibilityLabel={`${d.label} ${earned ? `최고 기록 ${fmtTime(Math.round(sec))}` : '아직 기록 없음'}`}>
                    <View style={s.pbHead}>
                      <Ionicons name={earned ? 'medal' : 'lock-closed'} size={ri(ICON.tag)} color={earned ? HALL_GOLD : T3} />
                      <Text style={[s.pbLabel, { color: earned ? T1 : T3 }]}>{d.label}</Text>
                    </View>
                    <Text style={[s.pbVal, earned ? s.pbValOn : s.pbValOff]}>
                      {earned ? fmtTime(Math.round(sec)) : '아직'}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* 서브 스탯 — 러너가 자랑하는 3지표: 누적 거리 · 최장 러닝 · 1km 최고 페이스. */}
            <View style={s.specSubRow}>
              <View style={s.specSub}>
                <Text style={s.specSubVal}>{displayNum(profile.totalKm || 0, unit, 0)}<Text style={s.specSubUnit}> {unit}</Text></Text>
                <Text style={s.specSubLabel}>누적 거리</Text>
              </View>
              <View style={[s.specSub, s.specSubDiv]}>
                <Text style={s.specSubVal}>
                  {longRec && longRec.value !== '--' ? longRec.value : '--'}
                  {longRec && longRec.value !== '--' ? <Text style={s.specSubUnit}> {longRec.unit ?? unit}</Text> : null}
                </Text>
                <Text style={s.specSubLabel}>최장 러닝</Text>
              </View>
              <View style={[s.specSub, s.specSubDiv]}>
                <Text style={s.specSubVal}>{paceRec && paceRec.value !== '--' ? paceRec.value : '--'}</Text>
                <Text style={s.specSubLabel}>1km 최고</Text>
              </View>
            </View>

            {/* 심폐 체력(VO₂max) — 낯설고 앱마다 값이 다른 지표라 보조로 강등(푸터 한 줄, 사용자 지시). */}
            {vo2.vo2max > 0 && (
              <View style={s.specVo2Foot} accessible accessibilityLabel={`심폐 체력 ${vo2.vo2max.toFixed(1)} VO2max, ${vo2.vo2maxLabel}`}>
                <Ionicons name="pulse-outline" size={ri(ICON.tag)} color={T3} />
                <Text style={s.specVo2FootText}>심폐 체력 <Text style={s.specVo2FootStrong}>{vo2.vo2max.toFixed(1)} VO₂max</Text> · {vo2.vo2maxLabel}</Text>
              </View>
            )}
          </View>
        )}

        {/* (이번 주 스트릭 카드·주간 목표 카드 제거 — 홈 '이번 주 러닝' 원카드로 이관,
            IA 정리 2026-07-25: 스트릭=히어로 점 7칸, 주간 목표=히어로 탭 스테퍼 시트.
            같은 정보의 두 번째 집을 없애 마이탭은 정체성·진척·기록(PR)·리캡에 집중한다.) */}

        {/* 누적 기록 카드 제거 — 기록(History) 탭에서 주/월/년/전체 기간별로 볼 수 있어
            마이 탭과 중복(사용자 요청). 정체성·진척·기록(PR)·리캡만 남긴다. */}

        {/* 성취 컬렉션 진입 — 진척 · 러닝화 아카이브 · 메달 아카이브를 한 카드 3행으로
            (간결화 E1, 2026-07-26). 셋 다 '아이콘 + 제목 + 부제 + ›' 로 완전히 같은 골격이라
            카드 표면 3장은 정보를 나누지 못하고 여백만 먹었다(애플 설정앱식 그룹 목록으로).
            행 사이만 헤어라인으로 나누고, 표면·유리 헤어라인은 카드 하나가 소유한다. */}
        {(onOpenProgression || onOpenHallOfShoes || onOpenMedalArchive) && (() => {
          const entries = [
            onOpenProgression && {
              key: 'progression', testID: 'open-progression', icon: 'trophy-outline' as const,
              title: '진척', sub: '나의 여정 · 업적', a11y: '진척 열기', onPress: onOpenProgression,
            },
            onOpenHallOfShoes && {
              key: 'hall-of-shoes', testID: 'open-hall-of-shoes', icon: 'ribbon-outline' as const,
              title: '러닝화 아카이브',
              sub: retiredCount > 0 ? `은퇴한 신발 ${retiredCount}켤레` : '은퇴한 러닝화의 기록이 남는 곳',
              a11y: '러닝화 아카이브 열기', onPress: onOpenHallOfShoes,
            },
            onOpenMedalArchive && {
              key: 'medal-archive', testID: 'open-medal-archive', icon: 'medal-outline' as const,
              title: '메달 아카이브',
              sub: medalCount > 0 ? `완주 메달 ${medalCount}개` : '완주한 대회의 메달과 기록',
              a11y: '메달 아카이브 열기', onPress: onOpenMedalArchive,
            },
          ].filter(Boolean) as { key: string; testID: string; icon: string; title: string; sub: string; a11y: string; onPress: () => void }[];
          return (
            <View style={s.card} testID="archive-group">
              <GlassEdge glints={false} radius={RADIUS.lg} />
              {entries.map((e, i) => (
                <Pressable
                  key={e.key}
                  onPress={e.onPress}
                  testID={e.testID}
                  accessibilityRole="button"
                  accessibilityLabel={e.a11y}
                  style={({ pressed }) => [s.progressRow, i > 0 && s.progressRowDiv, pressed && { backgroundColor: CARD_HI }]}>
                  <View style={s.progressIcon}><Ionicons name={e.icon} size={ri(ICON.action)} color={T2} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.progressTitle}>{e.title}</Text>
                    <Text style={s.progressSub}>{e.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={ri(ICON.action)} color={T3} />
                </Pressable>
              ))}
            </View>
          );
        })()}

        {/* Apple 건강 연동은 설정 섹션의 compact 행으로 이동(사용자 요청) — 아래 설정 목록 참조. */}

        {/* 신발 보관함 진입은 신발 탭 하단으로 이관(심사 #7, 2026-07-22) — '보관 처리' 행동이
            있는 신발 탭에 복원 동선도 함께 둔다. 마이탭은 성취 계열(진척·러닝화 아카이브·
            메달 아카이브)만 남아 '아카이브 vs 보관함' 이름 충돌이 해소된다. */}


        {/* 돌아보기(리캡) — 이번 달 요약 + 카드 공유. 주간/월간 토글은 폐지(간결화 E2). */}
        <View testID="recap-section">
          <View style={s.recapHead}>
            <Text style={s.sectionLabel}>이번 달 돌아보기</Text>
          </View>
          <View style={[s.card, { padding: rs(16) }]} testID="recap-card">
            <GlassEdge glints={false} radius={RADIUS.lg} />
            <View style={s.recapTopRow}>
              <Text style={s.recapPeriod} testID="recap-period">{recap.periodLabel}</Text>
              <Pressable
                onPress={onShareRecap}
                testID="recap-share"
                accessibilityRole="button"
                accessibilityLabel="리캡 카드 공유"
                style={({ pressed }) => [s.recapShareBtn, pressed && { backgroundColor: CARD_HI }]}>
                <Ionicons name="share-outline" size={ri(ICON.inline)} color={ACCENT} />
                <Text style={s.recapShareTxt}>공유</Text>
              </Pressable>
            </View>

            {recap.isEmpty ? (
              // 빈 데이터 graceful — keep-going 보이스(A8-5). 수치 대신 응원 한 줄.
              <View style={s.recapEmpty} testID="recap-empty">
                <Ionicons name="footsteps-outline" size={ri(ICON.feature)} color={ACCENT} style={{ marginBottom: rv(8) }} />
                <Text style={s.recapEmptyTxt}>
                  이번 달은 아직 기록이 없어요.{'\n'}가볍게 한 걸음부터 — Keep Going
                </Text>
              </View>
            ) : (
              <>
                {/* 총거리·런수·평균 페이스 3칸 (StatGrid) */}
                <StatGrid
                  style={{ marginTop: rv(6) }}
                  divider
                  size="md"
                  items={[
                    { value: recapTotalDisplay, unit: unit, label: '총 거리', testID: 'recap-total' },
                    { value: recap.runCount, unit: '회', label: '러닝 수', testID: 'recap-runcount' },
                    { value: recap.avgPaceLabel, unit: recap.avgPaceLabel === '--' ? undefined : '/km', label: '평균 페이스', testID: 'recap-pace' },
                  ]}
                />

                {/* 최다 착용 신발 */}
                {recap.mostWornShoe && (
                  <View style={s.recapMostWorn} testID="recap-most-worn">
                    <Ionicons name="footsteps" size={ri(ICON.inline)} color={ACCENT} />
                    <Text style={s.recapMostWornTxt} numberOfLines={1}>
                      최다 착용 · <Text style={{ color: T1, fontWeight: '700' }}>{recap.mostWornShoe.name}</Text>
                      <Text style={{ color: T3 }}>{`  ${recap.mostWornShoe.km}km`}</Text>
                    </Text>
                  </View>
                )}

                {/* 개인 기록(PR) */}
                {recapPRs.length > 0 && (
                  <View style={s.recapPrBox} testID="recap-prs">
                    {recapPRs.map((pr) => (
                      <View key={pr.label} style={s.recapPrRow}>
                        <Text style={s.recapPrLabel}>{pr.label}</Text>
                        <Text style={s.recapPrValue}>{pr.value}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* 업적 배지 그리드는 제거 — 진척(ProgressionScreen)의 업적 탭에 진행도/XP까지
            더 자세히 있어 중복이었다. 마이탭은 정체성·기록 중심으로 정리. */}
        </>)}

        {showSettings && (<>
        {/* settings — 실제 구동 */}
        <View>
          <Text style={[s.sectionLabel, { paddingBottom: rv(12) }]}>설정</Text>
          <View style={[s.card, { overflow: 'hidden' }]}>
            <GlassEdge glints={false} radius={RADIUS.lg} />
            {/* 알림(단일화 2026-07-05, 노이즈 감사): 예전엔 인앱 '알림'(임계 %)과 '푸시
                알림'이 별개 행이라 신발 교체 알림을 두 군데서 만났다 — 한 행으로 병합.
                교체 임박 토글이 인앱 배지(alerts.enabled)와 푸시를 함께 다루고, 임계
                스텝퍼는 그 아래에 산다. */}
            <Pressable onPress={() => toggleOpen('notif')} accessibilityRole="button" accessibilityLabel={`알림, ${notifOnCount}개 켜짐`} accessibilityState={{ expanded: open === 'notif' }} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]} testID="notif-row">
              <View style={s.settingIcon}><Ionicons name="notifications-outline" size={ri(ICON.inline)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>알림</Text>
              <Text style={s.settingDetail} testID="notif-detail">{notifOnCount > 0 ? `${notifOnCount}개 켜짐` : '꺼짐'}</Text>
              <Ionicons name={open === 'notif' ? 'chevron-up' : 'chevron-forward'} size={ri(ICON.inline)} color={T3} />
            </Pressable>
            {open === 'notif' && (
              <View style={[s.panel, s.settingBorder]} testID="notif-panel">
                {/* 정직 카피(2026-07-30): 이 세 가지는 발화 방식이 서로 다르다.
                    러닝 리마인더만 OS 스케줄로 앱이 닫혀 있어도 울리고(lib/localReminder),
                    교체·주간 목표는 앱을 열 때 계산해 보여주는 인앱 안내다(dueNotifications
                    → presentDue). '매일'도 부정확했다 — 이미 달린 날은 건너뛴다
                    (reminderFireDates 의 ranToday: 달린 날 저녁의 "달려볼까요?"는 신뢰를 깎는다). */}
                <Text style={s.panelHint}>러닝 리마인더는 정해둔 시각에 울려요(달린 날은 건너뛰어요). 교체·주간 목표는 앱을 열 때 알려드려요</Text>
                <NotifToggle
                  label="교체 임박 알림"
                  value={notifSettings.shoeReplacement}
                  onToggle={() => {
                    const next = !notifSettings.shoeReplacement;
                    toggleNotif('shoeReplacement');
                    // 인앱 배지/경고(alerts)도 같은 스위치를 따른다 — 채널별 이중 설정 제거.
                    if (alerts.enabled !== next) toggleAlerts();
                  }}
                  testID="notif-toggle-shoeReplacement"
                />
                {notifSettings.shoeReplacement && (
                  <>
                    {/* 표기 방향 통일(2026-07-26): 앱의 모든 수명 %는 '남은 수명'인데 이 설정만
                        '사용률'이라 같은 화면에서 방향이 반대로 읽혔다. 저장값(thresholdPct)은
                        사용률 그대로 두고(알림 임계·워치 호환 불변) 표시만 100−값으로 뒤집는다.
                        [+]가 '남은 %'를 올리려면 사용률은 내려가야 하므로 ± 도 서로 바꾼다. */}
                    <Stepper value={100 - alerts.thresholdPct} suffix="% 남았을 때" onMinus={() => stepThreshold(1)} onPlus={() => stepThreshold(-1)} />
                    <Text style={s.panelHint}>신발 수명이 <Text style={{ color: ACCENT }}>{100 - alerts.thresholdPct}%</Text> 남으면 알려드려요</Text>
                  </>
                )}
                <NotifToggle label="주간 목표 알림" value={notifSettings.weeklyGoal} onToggle={() => toggleNotif('weeklyGoal')} testID="notif-toggle-weeklyGoal" />
                <NotifToggle label="러닝 리마인더" value={notifSettings.runReminder} onToggle={() => toggleNotif('runReminder')} testID="notif-toggle-runReminder" />
                <Stepper value={notifSettings.reminderTime} suffix="리마인더 시각" onMinus={() => stepReminder(-1)} onPlus={() => stepReminder(1)} />
                {pushDenied && (
                  /* Text onPress → Pressable + hitSlop 12: 텍스트 한 줄(~18pt)은 44pt 터치
                     타깃 미달이었다(2026-07-25 접근성 스윕). */
                  <Pressable
                    testID="notif-perm-denied"
                    accessibilityRole="button"
                    accessibilityLabel="알림 권한이 꺼져 있어요. 눌러서 설정 열기"
                    hitSlop={12}
                    onPress={() => { Promise.resolve(Linking.openSettings()).catch(() => {}); }}>
                    <Text style={s.notifDenied}>알림 권한이 꺼져 있어요 — 설정에서 허용하기 ›</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* 음성 코칭(탑티어 패리티 #14) — 주기·항목·페이스 기준·볼륨. 다음 러닝부터 적용. */}
            <Pressable onPress={() => toggleOpen('voice')} accessibilityRole="button" accessibilityLabel={`음성 코칭, ${voice.enabled ? '켜짐' : '꺼짐'}`} accessibilityState={{ expanded: open === 'voice' }} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]} testID="voice-row">
              <View style={s.settingIcon}><Ionicons name="volume-medium-outline" size={ri(ICON.inline)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>음성 코칭</Text>
              <Text style={s.settingDetail} testID="voice-detail">{!voice.enabled ? '꺼짐' : voice.intervalKm === 0 ? '거리 안내 끔' : `${voice.intervalKm}km 마다`}</Text>
              <Ionicons name={open === 'voice' ? 'chevron-up' : 'chevron-forward'} size={ri(ICON.inline)} color={T3} />
            </Pressable>
            {open === 'voice' && (
              <View style={[s.panel, s.settingBorder]} testID="voice-panel">
                <NotifToggle label="음성 코칭" value={voice.enabled} onToggle={() => patchVoice({ enabled: !voice.enabled })} testID="voice-toggle-enabled" />
                {voice.enabled && (
                  <>
                    <Text style={s.panelHint}>거리 안내 주기</Text>
                    <SegmentedControl
                      size="sm"
                      items={[{ key: '0.5', label: '0.5km' }, { key: '1', label: '1km' }, { key: '2', label: '2km' }, { key: '0', label: '끄기' }]}
                      value={String(voice.intervalKm)}
                      onChange={(k) => patchVoice({ intervalKm: Number(k) as VoiceSettings['intervalKm'] })}
                      labelFor={(it) => `거리 안내 ${it.label}`}
                      testIDFor={(it) => `voice-interval-${it.key}`}
                    />
                    <NotifToggle label="페이스 안내" value={voice.paceCue} onToggle={() => patchVoice({ paceCue: !voice.paceCue })} testID="voice-toggle-pace" />
                    {voice.paceCue && (
                      <SegmentedControl
                        size="sm"
                        items={[{ key: 'split', label: '구간 페이스' }, { key: 'avg', label: '평균 페이스' }]}
                        value={voice.paceBasis}
                        onChange={(k) => patchVoice({ paceBasis: k as VoiceSettings['paceBasis'] })}
                        labelFor={(it) => `${it.label} 기준`}
                        testIDFor={(it) => `voice-basis-${it.key}`}
                      />
                    )}
                    <NotifToggle label="경과 시간 안내" value={voice.timeCue} onToggle={() => patchVoice({ timeCue: !voice.timeCue })} testID="voice-toggle-time" />
                    <Text style={s.panelHint}>볼륨</Text>
                    <SegmentedControl
                      size="sm"
                      items={[{ key: String(VOICE_VOLUME_STEPS[0]), label: '작게' }, { key: String(VOICE_VOLUME_STEPS[1]), label: '보통' }, { key: String(VOICE_VOLUME_STEPS[2]), label: '크게' }]}
                      value={String(voice.volume)}
                      onChange={(k) => patchVoice({ volume: Number(k) })}
                      labelFor={(it) => `볼륨 ${it.label}`}
                      testIDFor={(it) => `voice-volume-${it.key}`}
                    />
                  </>
                )}
                <Text style={s.panelHint}>변경은 다음 러닝부터 적용돼요</Text>
              </View>
            )}

            {/* 자동 일시정지(#16, 가민/NRC 패리티) — 즉시 토글. 신호대기 자동 멈춤을 끄면
                트레드밀/언덕 반복에서 오작동이 없다. 다음 러닝부터 적용. */}
            <Pressable onPress={toggleAutoPause} accessibilityRole="button" accessibilityLabel={`자동 일시정지, 현재 ${autoPauseOn ? '켜짐' : '꺼짐'}. 눌러서 전환`} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]} testID="autopause-row">
              <View style={s.settingIcon}><Ionicons name="pause-circle-outline" size={ri(ICON.inline)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>자동 일시정지</Text>
              <Text style={[s.settingDetail, autoPauseOn && { color: GOOD }]} testID="autopause-detail">{autoPauseOn ? '켜짐' : '꺼짐'}</Text>
              <Ionicons name="swap-horizontal" size={ri(ICON.inline)} color={T3} />
            </Pressable>

            {/* 햅틱(진동) — 즉시 토글. 화면 전환·버튼·존 이탈·워치 랩 진동을 한 번에 끈다.
                진동이 거슬리는 사용자를 위한 단일 스위치(사용자 요청 2026-07-13). */}
            <Pressable onPress={toggleHaptics} accessibilityRole="button" accessibilityLabel={`햅틱 진동, 현재 ${hapticsOn ? '켜짐' : '꺼짐'}. 눌러서 전환`} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]} testID="haptics-row">
              <View style={s.settingIcon}><Ionicons name="phone-portrait-outline" size={ri(ICON.inline)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>햅틱(진동)</Text>
              <Text style={[s.settingDetail, hapticsOn && { color: GOOD }]} testID="haptics-detail">{hapticsOn ? '켜짐' : '꺼짐'}</Text>
              <Ionicons name="swap-horizontal" size={ri(ICON.inline)} color={T3} />
            </Pressable>

            {/* 프로필 공개(소셜) — 즉시 토글. 끄면 올라간 프로필이 **내려간다**(안 쓰는 게
                아니라 지운다). keego 는 동의 없이 공개되던 사고를 이미 냈다(AUDIT 1) —
                그래서 이 스위치는 항상 보이고, 끄면 즉시 반영된다. */}
            {onToggleSocial ? (
              <Pressable
                onPress={() => onToggleSocial(socialVisibility === 'public' ? 'private' : 'public')}
                accessibilityRole="button"
                accessibilityLabel={`프로필 공개, 현재 ${socialVisibility === 'public' ? '공개' : '비공개'}. 눌러서 전환`}
                style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}
                testID="social-visibility-row">
                <View style={s.settingIcon}><Ionicons name="people-outline" size={ri(ICON.inline)} color={ACCENT} /></View>
                <Text style={s.settingLabel}>프로필 공개</Text>
                <Text
                  style={[s.settingDetail, socialVisibility === 'public' && { color: GOOD }]}
                  testID="social-visibility-detail">
                  {socialVisibility === 'public' ? '공개' : '비공개'}
                </Text>
                <Ionicons name="swap-horizontal" size={ri(ICON.inline)} color={T3} />
              </Pressable>
            ) : null}

            {/* 남들에게 보이는 그대로 — 토글만 있으면 "뭐가 나가는지 모르겠다"가 남는다.
                실물을 그 자리에서 보여주는 게 추상적인 스위치보다 훨씬 안심된다.
                공개 중일 때만 띄운다(비공개면 보여줄 것이 없다). */}
            {socialVisibility === 'public' && socialPreview ? (
              <View style={{ paddingTop: rv(10), paddingBottom: rv(4) }} testID="social-preview">
                <Text style={s.settingSectionLabel}>남들에게 이렇게 보여요</Text>
                <SocialProfileCard profile={socialPreview} />
              </View>
            ) : null}

            {/* Apple 건강(HealthKit) — 설정 안에 compact 행으로. 기기 지원 시만. */}
            {hkAvailable() && (
              <Pressable onPress={linkHealth} testID="link-health" accessibilityRole="button" accessibilityLabel="Apple 건강 연동" accessibilityState={{ disabled: hkOn }} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && !hkOn && { backgroundColor: CARD_HI }]}>
                <View style={s.settingIcon}><Ionicons name="heart-outline" size={ri(ICON.inline)} color={ACCENT} /></View>
                <Text style={s.settingLabel}>Apple 건강</Text>
                <Text style={[s.settingDetail, hkOn && { color: GOOD }]}>{hkOn ? '연동됨' : '연동'}</Text>
                <Ionicons name={hkOn ? 'checkmark' : 'chevron-forward'} size={ri(ICON.inline)} color={T3} />
              </Pressable>
            )}

            {/* 3) 단위 — 즉시 토글(전 화면 환산 반영) */}
            <Pressable onPress={() => onChangeUnit?.(unit === 'km' ? 'mi' : 'km')} accessibilityRole="button" accessibilityLabel={`단위, 현재 ${unitKorean(unit)}. 눌러서 전환`} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="speedometer-outline" size={ri(ICON.inline)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>단위</Text>
              <Text style={s.settingDetail}>{unitKorean(unit)}</Text>
              <Ionicons name="swap-horizontal" size={ri(ICON.inline)} color={T3} />
            </Pressable>

            {/* 신체 정보 — 체중(칼로리)·나이/성별(심박존)·안정심박을 한 행으로 병합
                (심사 #21, 2026-07-22 — 두 아코디언이 모두 '내 몸' 입력이라 Hick 축소). */}
            <Pressable onPress={() => toggleOpen('body')} accessibilityRole="button" accessibilityLabel="신체 정보 설정" accessibilityState={{ expanded: open === 'body' }} style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="body-outline" size={ri(ICON.inline)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>신체 정보</Text>
              <Text style={s.settingDetail}>{`${weightKg}kg${age > 0 ? ` · ${age}세` : ''}`}</Text>
              <Ionicons name={open === 'body' ? 'chevron-up' : 'chevron-forward'} size={ri(ICON.inline)} color={T3} />
            </Pressable>
            {open === 'body' && (
              <View style={[s.panel, s.settingBorder]}>
                <Stepper value={weightKg} suffix="kg" onMinus={() => stepWeight(-1)} onPlus={() => stepWeight(1)} />
                <Text style={s.panelHint}>러닝 칼로리·신발 수명 계산에 사용돼요</Text>
                <View style={{ marginTop: rv(14) }}>
                  <Stepper value={age > 0 ? age : '미설정'} suffix="나이(세)" onMinus={() => stepAge(-1)} onPlus={() => stepAge(1)} />
                </View>
                {/* 수제 흰 솔리드 칩 → SegmentedControl — 앱 전역 선택 스트립과 같은
                    필 문법(설정 인라인 = sm. 검수 MED 2026-07-16 → 필 수렴 2026-07-25). */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rv(14) }}>
                  <Text style={s.settingLabel}>성별</Text>
                  <SegmentedControl
                    size="sm"
                    items={[{ key: 'male', label: '남성' }, { key: 'female', label: '여성' }]}
                    value={sex ?? ''}
                    onChange={(k) => onChangeSex?.(k as 'male' | 'female')}
                    block={false}
                    style={{ minWidth: rs(150) }}
                  />
                </View>
                {/* 안정시 심박 수동 입력 제거(2026-07-05): 보통 러너는 자기 안정시 심박을
                    몰라 — 대충 찍으면 오히려 부정확. Apple 건강에서 자동으로 채우고(워치),
                    없으면 나이 기반(%HRmax)으로 심박 존을 낸다(가민 기본값과 동일). */}
                {restHR > 0 && (
                  <View style={{ marginTop: rv(14), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={s.settingLabel}>안정시 심박</Text>
                    <Text style={s.settingDetail}>{restHR}bpm · Apple 건강</Text>
                  </View>
                )}
                <Text style={s.panelHint}>
                  {restHR > 0
                    ? '심박 존을 더 정확하게 — Apple 건강에서 자동으로 가져와요'
                    : '나이로 심박 존을 계산해요. Apple 건강을 연동하면 더 정확해져요'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 계정 · 클라우드 동기 — 로그인하면 신발/런/설정을 계정 클라우드와 무손실 동기 */}
        <View testID="cloud-section">
          <Text style={[s.sectionLabel, { paddingBottom: rv(12) }]}>계정 · 클라우드</Text>
          <View style={[s.card, { overflow: 'hidden' }]}>
            <GlassEdge glints={false} radius={RADIUS.lg} />
            {signedIn ? (
              <>
                {/* 계정 헤더 — 탭하면 아코디언(사용자 2026-07-05): 6행 → 1행 + 펼침.
                    접혀 있어도 우측 동기 아이콘이 상태(연결/실패)를 한눈에 말한다. */}
                <Pressable
                  onPress={() => setAcctOpen(o => !o)}
                  accessibilityRole="button"
                  accessibilityLabel="계정 · 클라우드 설정"
                  accessibilityState={{ expanded: acctOpen }}
                  style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}
                  testID="cloud-account">
                  <View style={s.settingIcon}><Ionicons name="person-circle-outline" size={ri(ICON.inline)} color={ACCENT} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {/* 어떤 provider 로 로그인했는지 표시(2026-07-05) — '카카오 계정' + 이메일. */}
                    <Text style={s.settingLabel} numberOfLines={1} testID="cloud-provider">
                      {cloudProvider ? `${CLOUD_PROVIDER_LABEL[cloudProvider]} 계정` : accountLabel}
                    </Text>
                    {!!(cloudUser?.email || cloudUser?.displayName) && (
                      <Text style={s.cloudSub} numberOfLines={1}>{cloudUser.email || cloudUser.displayName}</Text>
                    )}
                  </View>
                  <Ionicons
                    name={syncing ? 'sync-outline' : syncFailed ? 'cloud-offline-outline' : 'cloud-done-outline'}
                    size={ri(ICON.inline)}
                    color={syncFailed ? DANGER : GOOD}
                  />
                  <Ionicons name={acctOpen ? 'chevron-up' : 'chevron-down'} size={ri(ICON.inline)} color={T3} />
                </Pressable>

                {/* 동기화 상태 줄 — 실패 시엔 접혀 있어도 항상 노출(조치 가능). 그 외엔 펼침 시. */}
                {(acctOpen || syncFailed) && (
                  <Pressable
                    onPress={syncFailed && !syncing ? () => { void runSync(false); } : undefined}
                    disabled={!syncFailed || syncing}
                    accessibilityRole={syncFailed ? 'button' : 'text'}
                    accessibilityLabel={syncing ? '동기화 중' : syncFailed ? '동기화 실패, 눌러서 다시 시도' : lastSyncAt == null ? '클라우드 연결됨' : `${lastSyncLabel}`}
                    style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && syncFailed && { backgroundColor: CARD_HI }]}
                    testID="cloud-sync-status">
                    <View style={s.settingIcon}><Ionicons name={syncing ? 'sync-outline' : syncFailed ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={ri(ICON.inline)} color={syncFailed ? DANGER : T3} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.settingLabel, { fontWeight: '500', color: syncFailed ? DANGER : T2 }]}>
                        {syncing ? '동기화 중…' : syncFailed ? '동기화 실패 · 다시 시도' : (lastSyncAt == null ? '클라우드 연결됨 · 자동 동기화' : lastSyncLabel)}
                      </Text>
                      {/* 동기화 범위 고지(2026-07-26 출시 심사 B-05). '동기화됨'만 보이면 사진까지
                          지켜진다고 믿게 된다 — 실제로 사진은 기기에만 있다(클라우드 백업 미구현).
                          별도 화면·배너 대신 오해가 생기는 바로 그 자리에 한 줄로 적는다.
                          실패/진행 중에는 그 상태가 우선이므로 숨긴다. */}
                      {!syncing && !syncFailed && (
                        <Text style={s.cloudSub} testID="cloud-sync-scope">사진은 기기에만 저장돼요 · 앱을 지우면 복구할 수 없어요</Text>
                      )}
                    </View>
                    {syncFailed && !syncing && <Ionicons name="refresh" size={ri(ICON.inline)} color={DANGER} />}
                  </Pressable>
                )}

                {acctOpen && (
                  <>
                    {/* 로그아웃 */}
                    <Pressable onPress={handleSignOut} accessibilityRole="button" accessibilityLabel="로그아웃" style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
                      <View style={s.settingIcon}><Ionicons name="log-out-outline" size={ri(ICON.inline)} color={DANGER} /></View>
                      <Text style={[s.settingLabel, { color: DANGER }]}>로그아웃</Text>
                      <Ionicons name="chevron-forward" size={ri(ICON.inline)} color={T3} />
                    </Pressable>

                    {/* 회원 탈퇴(영구 삭제) — 앱스토어 인앱 탈퇴 요건 */}
                    {onDeleteAccount && (
                      <Pressable testID="account-delete" onPress={handleDeleteAccount} accessibilityRole="button" accessibilityLabel="회원 탈퇴" style={({ pressed }) => [s.settingRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) }, pressed && { backgroundColor: CARD_HI }]}>
                        <View style={s.settingIcon}><Ionicons name="trash-outline" size={ri(ICON.inline)} color={DANGER} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.settingLabel, { color: DANGER }]}>회원 탈퇴</Text>
                          <Text style={s.cloudSub}>계정·데이터 영구 삭제(복구 불가)</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={ri(ICON.inline)} color={T3} />
                      </Pressable>
                    )}

                    {legalRows}
                  </>
                )}
              </>
            ) : (
              <View style={s.cloudPad}>
                <Text style={s.cloudIntro}>로그인하면 신발·러닝 기록·설정이 안전하게 보관되고, 기기를 바꿔도 그대로 이어져요.</Text>
                <Pressable testID="cloud-signin-kakao" onPress={() => handleSignIn('kakao')} disabled={signingIn} accessibilityRole="button" accessibilityLabel="카카오로 로그인" accessibilityState={{ disabled: signingIn }} style={({ pressed }) => [s.cloudBtn, s.cloudBtnKakao, pressed && { transform: [{ scale: MOTION.press.scale }], opacity: MOTION.press.opacity }]}>
                  <KakaoMark size={ri(ICON.inline)} color={KAKAO_LABEL} />
                  <Text style={[s.cloudBtnTxt, { color: KAKAO_LABEL }]}>{signingIn ? '로그인 중…' : '카카오로 계속'}</Text>
                </Pressable>
                <Pressable testID="cloud-signin-naver" onPress={() => handleSignIn('naver')} disabled={signingIn} accessibilityRole="button" accessibilityLabel="네이버로 로그인" accessibilityState={{ disabled: signingIn }} style={({ pressed }) => [s.cloudBtn, s.cloudBtnNaver, pressed && { transform: [{ scale: MOTION.press.scale }], opacity: MOTION.press.opacity }]}>
                  <NaverMark size={ri(ICON.tag)} color={NAVER_LABEL} />
                  <Text style={[s.cloudBtnTxt, { color: NAVER_LABEL }]}>{signingIn ? '로그인 중…' : '네이버로 계속'}</Text>
                </Pressable>
                <Button
                  testID="cloud-signin-google"
                  label={signingIn ? '로그인 중…' : 'Google로 계속'}
                  onPress={() => handleSignIn('google')}
                  disabled={signingIn}
                  iconNode={<Ionicons name="logo-google" size={ri(ICON.inline)} color={signingIn ? T3 : T1} />}
                  style={s.cloudBtnGoogle}
                />
                <Pressable testID="cloud-signin-apple" onPress={() => handleSignIn('apple')} disabled={signingIn} accessibilityRole="button" accessibilityLabel="Apple로 로그인" accessibilityState={{ disabled: signingIn }} style={({ pressed }) => [s.cloudBtn, s.cloudBtnApple, pressed && { transform: [{ scale: MOTION.press.scale }], opacity: MOTION.press.opacity }]}>
                  <Ionicons name="logo-apple" size={ri(ICON.action)} color={T1} />
                  <Text style={s.cloudBtnTxt}>{signingIn ? '로그인 중…' : 'Apple로 계속'}</Text>
                </Pressable>
              </View>
            )}
            {/* 법적 문서 — 로그아웃 시엔 상시 노출(스토어 심사·신뢰), 로그인 시엔 위 계정
                아코디언 안으로 접힌다(한 칸으로 줄이기, 사용자 2026-07-05). */}
            {!signedIn && legalRows}
            {/* 앱·기기 정보(읽기 전용) — 기존 '계정 설정' 행을 계정 섹션으로 통합(이름 중복 제거). */}
            <View style={[s.panel, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) }]} testID="app-info">
              <View style={s.acctRow}><Text style={s.acctK}>가입</Text><Text style={s.acctV}>{profile.since || '기록 없음'}</Text></View>
              <View style={s.acctRow}><Text style={s.acctK}>버전</Text><Text style={s.acctV}>{APP_VERSION}</Text></View>
              {!!onReplayOnboarding && (
                <Pressable onPress={onReplayOnboarding} accessibilityRole="button" accessibilityLabel="온보딩 다시 보기"
                  style={({ pressed }) => [s.acctRow, { minHeight: rs(44) }, pressed && { backgroundColor: CARD_HI }]}>
                  <Text style={s.acctK}>온보딩 다시 보기</Text>
                  <Ionicons name="chevron-forward" size={ri(ICON.inline)} color={T3} />
                </Pressable>
              )}
            </View>
            {/* 메이커 노트 — 진정성·판정 독립 선언(BRAND.md §0·§2). 과장 없이 한 문단만. */}
            <Text testID="maker-note" style={s.makerNote}>
              keego는 러너 한 사람이 직접 달리며 만들어요. 모든 숫자는 실제 기록이고,
              교체 예측은 어떤 제휴와도 무관하게 달린 데이터로만 계산해요.
              부상 없이, 계속 달리도록 — keep going.
            </Text>
            {cloudMsg && (
              <Text testID="cloud-msg" style={[s.cloudMsg, cloudMsg.ok ? s.dataMsgOk : s.dataMsgErr]}>{cloudMsg.text}</Text>
            )}
          </View>
        </View>
        </>)}

      </ScrollView>
      </Rise>
      {/* 화면 밖에 마운트된 리캡 공유 카드 — ref.toDataURL()로 PNG 캡처(보이지 않음). */}
      <View style={s.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <RecapShareCard ref={recapCardRef} model={recapCardModel} />
        <RunnerSpecShareCard ref={specCardRef} model={specShareModel} />
      </View>
      <TabBar active={3} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  row: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  card: { backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden' },
  cardTitle: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', marginBottom: rv(16) },
  // 러너 스펙 카드
  // 거리 PB 메달 타일 2×2(러너 스펙 메인) — 달성=CARD_HI + 골드, 미달성=흐린 판.
  pbGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: rv(10) },
  pbTile: { width: '48.5%', paddingHorizontal: rs(14), paddingVertical: rv(12), borderRadius: rs(14), borderCurve: 'continuous' },
  pbTileOn: { backgroundColor: CARD_HI },
  pbTileOff: { backgroundColor: withAlpha(T1, 0.04) },
  pbHead: { flexDirection: 'row', alignItems: 'center', gap: rv(6) },
  pbLabel: { fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 0.3 },
  pbVal: { fontFamily: DISPLAY, marginTop: rv(6), fontVariant: ['tabular-nums'] },
  pbValOn: { color: T1, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.4 },
  pbValOff: { color: T3, fontSize: TYPE.body.fontSize, fontWeight: '600' },
  // 서브 스탯 3열(누적·최장·1km 최고).
  specSubRow: { flexDirection: 'row', marginTop: rv(16), paddingTop: rv(16), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CARD_BORDER },
  specSub: { flex: 1, alignItems: 'center', gap: rv(3) },
  specSubDiv: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: CARD_BORDER },
  specSubVal: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '600', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  specSubUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600' },
  specSubLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
  // 심폐 체력(VO₂max) 강등 푸터 — 한 줄.
  specVo2Foot: { flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(16), paddingTop: rv(14), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CARD_BORDER },
  specVo2FootText: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
  specVo2FootStrong: { color: T2, fontWeight: '700' },
  // 섹션 헤더 = SectionTitle 프리미티브와 동일 스펙(700) — 화면 간 헤더 무게 통일(600 혼용 제거).
  sectionLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700', letterSpacing: 0.4, paddingHorizontal: rs(4) },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: rv(12), padding: rs(16) },
  // 그룹 카드 안 행 구분(첫 행 제외) — 카드 표면을 나누는 대신 헤어라인 하나로.
  progressRowDiv: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  // 진입 행 아이콘: 브랜드 파파야 → 무채(2026-07-25 색의미 스윕 P1 #34 — 브랜드색은 러닝
  // 링 전용, 그 외 강조는 무채). 스트릭 점(진행 지표)만 BRAND 유지.
  progressIcon: { width: rs(38), height: rs(38), borderRadius: RADIUS.sm, backgroundColor: withAlpha(T1, 0.06), alignItems: 'center', justifyContent: 'center' },
  progressTitle: { color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700' },
  progressSub: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', marginTop: rv(3) },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: rs(4) },
  // 화면 타이틀은 전 탭(신발·기록·마이) 동일 스케일(title1) — '마이'만 display 로 커서 튀던 것 통일.
  title: { color: T1, fontFamily: FONT, ...TYPE.screenTitle },
  iconBtn: { width: rs(38), height: rs(38), borderRadius: RADIUS.pill, backgroundColor: CARD_HI, borderWidth: 1, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },

  identity: { flexDirection: 'row', alignItems: 'center', gap: rv(14), paddingHorizontal: rs(4), paddingTop: rv(4) },
  avatarRing: { padding: rs(2), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.12) },
  avatarInner: { padding: 2.5, borderRadius: RADIUS.pill, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: rs(50), height: rs(50), borderRadius: RADIUS.pill },
  avatarEdit: { position: 'absolute', right: -1, bottom: -1, width: rs(18), height: rs(18), borderRadius: RADIUS.pill, backgroundColor: T3, borderWidth: 2, borderColor: BG, alignItems: 'center', justifyContent: 'center' },
  tierEyebrow: { fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 3.5, textTransform: 'uppercase', marginBottom: rv(3) },
  name: { color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '600', letterSpacing: -0.5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  // Input variant="inline" 채택(2026-07-25) — 편집 활성 밑줄(ACCENT)과 타이틀급 타이포만 소유.
  nameInput: { flex: 1, fontSize: TYPE.title.fontSize, fontWeight: '500', letterSpacing: TYPE.title.letterSpacing, borderBottomWidth: 1, borderBottomColor: ACCENT, paddingVertical: rv(2) },
  nameSaveBtn: { width: rs(34), height: rs(34), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.1), alignItems: 'center', justifyContent: 'center' },
  idStat: { fontFamily: FONT, color: T3, fontSize: TYPE.caption.fontSize, fontWeight: '600' },
  idStatNum: { fontFamily: DISPLAY, color: T1, fontSize: TYPE.label.fontSize, fontWeight: '700', fontVariant: ['tabular-nums'] },
  since: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },

  // (이번 주 스트릭 카드 스타일 삭제 — 홈 원카드 이관, 2026-07-25)

  // 누적/개인 기록·리캡 요약 스탯 줄은 StatGrid 프리미티브로 이전(셀·값·라벨 토큰을
  // 그쪽이 단일 소스로 책임 — 과거 statRow/statCell/statDivider/statValue/Unit/Label 제거).

  // (badge/badgeIcon/badgeLabel 스타일 삭제 — 미사용 잔재. 카드 보더 통일 스윕 2026-07-10)

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: rv(12), paddingVertical: rv(14), paddingHorizontal: rs(16) },
  settingBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  settingIcon: { width: rs(30), height: rs(30), borderRadius: rs(9), backgroundColor: withAlpha(T1, 0.06), alignItems: 'center', justifyContent: 'center' },
  // 설정 안 소제목(미리보기 등) — 행 라벨보다 작고 눌린 톤.
  settingSectionLabel: {
    fontFamily: FONT, color: T3, fontSize: rf(11), fontWeight: '700',
    letterSpacing: 0.9, marginBottom: rv(8),
  },
  settingLabel: { flex: 1, color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600' },
  settingDetail: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },

  // expandable panels
  panel: { paddingHorizontal: rs(16), paddingVertical: rv(16), gap: rv(14), backgroundColor: withAlpha(T1, 0.02) },
  panelHint: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(18) },

  notifDenied: { color: WARN, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(18) },

  // ── 돌아보기(리캡) ───────────────────────────────────────────────────────────
  recapHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: rv(12), paddingHorizontal: rs(4) },
  // 주/월 토글은 SegmentedControl(sm, block=false)로 이전(과거 recapToggle/
  // recapTab/recapTabOn/recapTabTxt/recapTabTxtOn 제거).
  recapTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rv(8) },
  recapPeriod: { color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700' },
  recapShareBtn: { flexDirection: 'row', alignItems: 'center', gap: rv(4), paddingHorizontal: rs(12), paddingVertical: rv(8), borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.12) },
  recapShareTxt: { color: ACCENT, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700' },
  recapEmpty: { alignItems: 'center', paddingVertical: rv(22) },
  recapEmptyTxt: { color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', lineHeight: rf(20), textAlign: 'center' },
  recapMostWorn: { flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(16), paddingTop: rv(14), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP },
  recapMostWornTxt: { flex: 1, color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  recapPrBox: { marginTop: rv(14), gap: rv(2) },
  recapPrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: rv(8) },
  recapPrLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  recapPrValue: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '600', letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },

  // on/off 행 — 라벨 좌 + 우측 작은 스위치(Toggle 프리미티브). 구 풀폭 솔리드 바 폐지.
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: rs(44) },
  toggleLabel: { color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '500' },

  acctRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rv(14) },
  acctK: { color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '500' },
  acctV: { flex: 1, textAlign: 'right', color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '500' },

  // 데이터 가져오기 패널 — dataInput/dataBtn/dataBtnTxt/dataMsg(사각 radius:14 ACCENT
  // 버튼 포함)은 미사용 dead 스타일이라 제거(버튼 radius 혼재 정리). 클라우드 메시지
  // 톤(dataMsgOk/Err)만 cloud-msg 가 계속 참조한다.
  dataMsgOk: { color: GOOD },
  dataMsgErr: { color: DANGER },

  // 계정 · 클라우드 동기
  cloudSub: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', marginTop: rv(2) },
  cloudPad: { padding: rs(16), gap: rv(12) },
  cloudIntro: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(18) },
  // 브랜드 로그인 버튼(카카오/네이버/애플) 공용 박스 — 모서리는 Google(단일 Button=
  // RADIUS.btn)과 맞춰 통일. Google 은 단일 Button 프리미티브로 라우팅(아래 cloudBtnGoogle).
  cloudBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), minHeight: rs(48), borderRadius: RADIUS.btn },
  // Google = 앱 accent CTA → 단일 Button(그라데이션/글로우/RADIUS.btn). 여기선 높이만.
  cloudBtnGoogle: { height: rs(48) },
  cloudBtnApple: { backgroundColor: CARD_HI },
  cloudBtnKakao: { backgroundColor: KAKAO_YELLOW },
  cloudBtnNaver: { backgroundColor: NAVER_GREEN },
  brandMark: { fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700' },
  cloudBtnTxt: { color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600' },
  cloudMsg: { fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', lineHeight: rf(18), paddingHorizontal: rs(16), paddingBottom: rv(14) },
  makerNote: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '400', lineHeight: rf(19), paddingHorizontal: rs(16), paddingTop: rv(4), paddingBottom: rv(14) },
});
