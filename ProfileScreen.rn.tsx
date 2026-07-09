// ============================================================================
// ProfileScreen.rn.tsx — 프로필: identity, lifetime stats, achievements, settings
// 설정 행은 실제로 구동된다(하드코딩 '주5회'/'켜짐'/'킬로미터' 제거):
//   · 주간 목표 — 설정 행이 아니라 위의 주간 목표 카드 스테퍼가 유일한 수정 경로
//   · 알림     — 신발 교체 알림 on/off + 임계값(수명 사용률 %)
//   · 단위     — km ↔ mi 토글(전 화면 즉시 환산 반영)
//   · 계정 설정 — 기기/가입/버전 정보
// 값은 App이 소유(영속은 lib/settings)하고, 이 화면은 표시 + 변경 콜백만 담당한다.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Image, Share, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { BG, CARD, CARD_DIM, CARD_HI, ACCENT, BRAND, GOOD, DANGER, WARN, T1, T2, T3, SEP, CARD_BORDER, FONT, DISPLAY, withAlpha, TIER_COLORS, TIER_LABEL, KAKAO_YELLOW, KAKAO_LABEL, NAVER_GREEN, NAVER_LABEL, RADIUS, HALL_GOLD, TYPE } from './theme';
// recap 토글 = SegmentedControl(accentSolid), 스탯 그리드들 = StatGrid 단일 프리미티브.
import { TabBar, TABBAR_CLEARANCE, SectionTitle, Button, SegmentedControl, StatGrid, Stepper, AmbientBackdrop } from './primitives';
import { Unit, unitKorean, displayNum } from './lib/units';
import { weeklyRecap, monthlyRecap, type RecapRun, type RecapShoe } from './lib/recap';
import { hkAvailable, hkLinked, hkLink, hkRestingHR } from './lib/healthkit';
import { buildRecapShareCardModel, shareRecapCard, shareRunnerSpecCard, formatRecapPRs, type RecapKind, type SvgCapturable } from './lib/shareCard';
import RecapShareCard from './RecapShareCard';
import RunnerSpecShareCard, { type RunnerSpecShareModel } from './RunnerSpecShareCard';
import {
  AlertSettings, THRESHOLD_STEP,
  MIN_THRESHOLD_PCT, MAX_THRESHOLD_PCT, DEFAULT_SETTINGS, DEFAULT_ALERTS,
  WEIGHT_STEP, MIN_WEIGHT_KG, MAX_WEIGHT_KG,
  AGE_STEP, MIN_AGE, MAX_AGE,
} from './lib/settings';
import { NotifSettings, DEFAULT_NOTIF_SETTINGS } from './lib/notifications';
import { requestPushPermission as defaultRequestPushPermission } from './lib/pushMessaging';
import { BackupPayload, BackupV1 } from './lib/backup';
import ChallengesSection from './ChallengesSection';
import { ExtRun, ExtShoe } from './lib/progression/challengesExt';
import { mergeCloudData, nextAuthState, AuthState } from './lib/cloudSync';
import type { CloudPort, CloudProvider, CloudUser } from './lib/cloudPort';
import { loadCloudAccount, saveCloudAccount, clearCloudAccount, CLOUD_PROVIDER_LABEL } from './lib/cloudAccount';
import type { RunBestEfforts } from './lib/bestEfforts';
import { STANDARD_DISTANCES } from './lib/bestEfforts';
import { fitnessSummary } from './lib/analytics/fitness';
import { fmtTime } from './lib/format';
import { authErrorMessage } from './lib/authErrorMessage';
import { PRIVACY_URL, TERMS_URL } from './lib/legalLinks';
import type { RankTier } from './lib/progression/types';

// 신원 칩은 진척 시스템의 단일 Rank(티어)로 통일한다 — 옛 '러닝 레벨 N'(km/100) 개념 폐기.
// equippedTitle·achievementCount·retiredShoes 는 진척 신원 블록(스펙)용(없으면 미표시/0).
export type Profile = { name: string; since: string; totalKm: number; totalRuns: number; totalTime: string; rankTier: RankTier; equippedTitle?: string | null; achievementCount?: number; retiredShoes?: number };
export type Badge = { icon: string; label: string; on: boolean };
// 개인 기록(PR) 카드 한 칸. value/unit은 App이 표시 단위로 환산·포맷해 주입한다
// (기록 없음은 value='--'). 화면은 표시만 담당한다.
export type PersonalRecord = { icon: string; label: string; value: string; unit: string };

const DEFAULT_PROFILE: Profile = { name: '러너', since: '', totalKm: 0, totalRuns: 0, totalTime: '0', rankTier: 'bronze' };
const APP_VERSION = '0.0.1';

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

// 푸시 알림 종류별 on/off 스위치 행(기존 in-app 알림 토글과 동일한 토큰 스타일 재사용).
// value 가 실제 notif_settings 를 반영하고, press 시 onToggle 로 상위에 변경을 올린다.
function NotifToggle({ label, value, onToggle, testID }: { label: string; value: boolean; onToggle: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onToggle}
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      style={[s.toggle, value ? s.toggleOn : s.toggleOff]}
    >
      <Ionicons name={value ? 'notifications' : 'notifications-off'} size={ri(16)} color={value ? T1 : T2} />
      <Text style={[s.toggleTxt, { color: value ? T1 : T2 }]}>{`${label} ${value ? '켜짐' : '꺼짐'}`}</Text>
    </Pressable>
  );
}

// −/＋ 스테퍼(목표 거리·알림 임계값 공용). 모듈 스코프에 둬 매 렌더 재생성을 피한다.
// 스텝퍼는 앱 공용 프리미티브(primitives.Stepper) — 로컬 구현 제거(2026-07-04 DS 통일).

export default function ProfileScreen({
  profile = DEFAULT_PROFILE, badges: _badges = [], records = [], distancePBs = {}, onTab,
  profilePhotoUri = '', onChangeName, onPickPhoto,
  weightKg = DEFAULT_SETTINGS.weightKg, onChangeWeight,
  age = DEFAULT_SETTINGS.age, onChangeAge,
  sex = DEFAULT_SETTINGS.sex, onChangeSex,
  restHR = DEFAULT_SETTINGS.restHR, onChangeRestHR,
  initialOpen = null, onConsumeInitialOpen,
  unit = 'km', onChangeUnit,
  streakDays = 0, weekDays = [], weekTodayIdx = -1,
  alerts = { ...DEFAULT_ALERTS }, onChangeAlerts,
  notifSettings = DEFAULT_NOTIF_SETTINGS, onChangeNotifSettings,
  onRequestPushPermission = defaultRequestPushPermission,
  recapRuns = [], recapShoes = [], recapNow,
  backupData = { shoes: [], runs: [], settings: {} },
  cloudPort, onCloudMerged, onDeleteAccount, cloudClock = () => Date.now(),
  onOpenProgression,
  onOpenHallOfShoes, retiredCount = 0,
  onOpenMedalArchive, medalCount = 0,
  onOpenArchive, archivedCount = 0,
  challengeExtRuns = [], challengeExtShoes = [], todayISO = '',
  weeklyGoalKm = 0, onEditSmartTarget,
}: {
  profile?: Profile;
  badges?: Badge[];
  records?: PersonalRecord[];
  distancePBs?: RunBestEfforts;
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
  initialOpen?: 'weight' | 'alerts' | 'notif' | 'account' | 'import' | null;
  onConsumeInitialOpen?: () => void;
  unit?: Unit;
  onChangeUnit?: (u: Unit) => void;
  // 오늘까지 이어진 연속 달림 일수(keep-going 동기). 0이면 스트릭 칩/카운트 숨김.
  streakDays?: number;
  // 이번 주 월~일(7칸) 달림 여부. weekTodayIdx는 오늘 칸(0=월..6=일, 없으면 -1).
  weekDays?: boolean[];
  weekTodayIdx?: number;
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
  deviceId?: string;
  // 로컬 백업 대상(신발+런+설정). App이 소유한 상태를 모아 주입한다.
  backupData?: BackupPayload;
  // 가져오기: parseBackup 검증 성공 시에만 호출된다(실패 시 미호출 — 기존 데이터 보존).
  onImport?: (data: BackupV1) => void;
  // ── 주간 목표 카드(마이 탭) ───────────────────────────────────────────────────
  // App 이 런/신발에서 파생한 확장 입력(extRuns/extShoes)을 주입하면 ChallengesSection 이
  // 주간 목표 카드를 상시 노출한다 — 목표 미설정이면 추천(평균×3)이 기본값.
  // 진척 탭에서 마이 탭으로 이관됨. 옛 이름 '스마트 챌린지'는 폐지(주간 목표와 개념 통일).
  challengeExtRuns?: ExtRun[];
  challengeExtShoes?: ExtShoe[];
  todayISO?: string;
  /** 스마트 챌린지 id별 사용자 지정 목표 거리(km). App 이 영속·주입한다. */
  /** 홈과 공유하는 주간 목표(km) — 챌린지 목표의 단일 진실원. */
  weeklyGoalKm?: number;
  /** 목표 거리(km) 변경 위임 — (챌린지 id, km). App 이 영속한다. */
  onEditSmartTarget?: (id: string, km: number) => void;
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
  // 신발 보관함(보관 처리한 신발 복원) 진입. 없으면 행 미표시(안전한 no-op).
  onOpenArchive?: () => void;
  // 보관한 신발 수(보관함 진입 행 부제). 0이어도 진입 가능(빈 보관함 안내).
  archivedCount?: number;
  // 회원 탈퇴(계정+클라우드+로컬 영구 삭제). App 이 cloudPort.deleteAccount + 로컬 초기화를
  // 수행한다. 없으면 탈퇴 행 미표시(안전한 no-op).
  onDeleteAccount?: () => Promise<void>;
}) {
  // 어떤 설정 행이 펼쳐졌는지(단위는 패널 없이 즉시 토글). 한 번에 하나만 펼친다.
  const [open, setOpen] = useState<null | 'weight' | 'body' | 'alerts' | 'notif' | 'account' | 'import'>(null);
  const toggleOpen = (k: 'weight' | 'body' | 'alerts' | 'notif' | 'account' | 'import') => setOpen((o) => (o === k ? null : k));

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
      // 동기는 아래 자동 동기 effect 가 (signedIn 전환 + 데이터 변경 시) 처리한다.
    } catch (e: any) {
      setAuthState((s) => nextAuthState(s, 'signInError'));
      // 원문은 로그로만 — 화면엔 사용자 언어(LoginScreen 과 동일 매퍼, 출시 감사).
      console.log('profile signin error', e?.message || e);
      const msg = authErrorMessage(e);
      if (msg) setCloudMsg({ ok: false, text: msg });
    }
  };

  // 로그아웃: 어디서든 signedOut 으로. 로컬 데이터는 건드리지 않는다(데이터 파괴 금지).
  const handleSignOut = async () => {
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

  // 회원 탈퇴: 되돌릴 수 없는 영구 삭제이므로 확인 다이얼로그를 거친다. 확인 시 App 의
  // onDeleteAccount(클라우드 계정+백업 삭제 → 로컬 전체 삭제 → 온보딩 초기화)를 호출하고,
  // 성공하면 화면도 signedOut 으로 떨군다. 실패(재인증 필요 등)는 정직한 메시지로 안내.
  const handleDeleteAccount = () => {
    if (!onDeleteAccount) return;
    Alert.alert(
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
              console.log('account delete error', e);
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
      console.log('sync error', e?.message || e);
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
  const ensurePushPermission = async () => {
    if (pushGrantedRef.current) return;
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

  // ── 기간 리캡(돌아보기) ──────────────────────────────────────────────────────
  // 주간/월간 토글로 lib/recap 의 순수 요약을 만든다(원본 불변). recapNow 미주입 시
  // 현재 시각 — useMemo 가 매 렌더 새 Date 를 만들지 않도록 한 번만 고정한다.
  const [recapMode, setRecapMode] = useState<RecapKind>('weekly');
  const nowRef = useRef<Date>(recapNow ?? new Date());
  const recapBase = recapNow ?? nowRef.current;
  const recap = useMemo(
    () =>
      recapMode === 'monthly'
        ? monthlyRecap(recapRuns, recapShoes, { now: recapBase })
        : weeklyRecap(recapRuns, recapShoes, { now: recapBase }),
    [recapMode, recapRuns, recapShoes, recapBase],
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

  // 이번 주 스트릭 점: weekDays(월~일)를 항상 7칸으로 정규화(미주입/부족분은 false).
  const week7 = Array.from({ length: 7 }, (_, i) => !!weekDays[i]);
  const DOW = ['월', '화', '수', '목', '금', '토', '일'];

  const insets = useSafeAreaInsets();
  // 법적 문서(개인정보·이용약관) — 로그인 시엔 계정 아코디언 안에, 로그아웃 시엔 상시 노출.
  const legalRows = (
    <>
      <Pressable
        testID="legal-privacy"
        onPress={() => { Linking.openURL(PRIVACY_URL).catch(() => {}); }}
        accessibilityRole="link"
        accessibilityLabel="개인정보 처리방침 열기"
        style={({ pressed }) => [s.settingRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) }, pressed && { backgroundColor: CARD_HI }]}>
        <View style={s.settingIcon}><Ionicons name="shield-checkmark-outline" size={ri(16)} color={T2} /></View>
        <Text style={s.settingLabel}>개인정보 처리방침</Text>
        <Ionicons name="open-outline" size={ri(15)} color={T3} />
      </Pressable>
      <Pressable
        testID="legal-terms"
        onPress={() => { Linking.openURL(TERMS_URL).catch(() => {}); }}
        accessibilityRole="link"
        accessibilityLabel="이용약관 열기"
        style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
        <View style={s.settingIcon}><Ionicons name="document-text-outline" size={ri(16)} color={T2} /></View>
        <Text style={s.settingLabel}>이용약관</Text>
        <Ionicons name="open-outline" size={ri(15)} color={T3} />
      </Pressable>
    </>
  );
  return (
    <View style={s.screen}>
      <AmbientBackdrop />
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: rs(18), paddingBottom: TABBAR_CLEARANCE, gap: rv(16) }}>
        {/* header — 마이(프로필+기록) ↔ 설정 뷰 전환 */}
        {showSettings ? (
          <View style={s.headerRow}>
            <Pressable onPress={() => setShowSettings(false)} accessibilityRole="button" accessibilityLabel="뒤로" hitSlop={8} style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="chevron-back" size={ri(20)} color={T2} /></Pressable>
            <Text style={s.title}>설정</Text>
            <View style={{ width: rs(38) }} />
          </View>
        ) : (
          <View style={s.headerRow}>
            <Text style={s.title}>마이</Text>
            <View style={{ flexDirection: 'row', gap: rv(8) }}>
              <Pressable onPress={() => { Share.share({ message: 'Keego에서 내 러닝화 수명을 관리하고 있어요 🏃' }).catch(() => {}); }} accessibilityRole="button" accessibilityLabel="기록 공유" hitSlop={8} style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="share-outline" size={ri(18)} color={T2} /></Pressable>
            <Pressable onPress={() => setShowSettings(true)} accessibilityRole="button" accessibilityLabel="설정 열기" hitSlop={8} style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="settings-outline" size={ri(19)} color={T2} /></Pressable>
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
            <View style={s.avatarEdit}><Ionicons name="camera" size={ri(11)} color={BG} /></View>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <View style={s.nameEditRow}>
                <TextInput
                  testID="profile-name-input"
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoFocus
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                  placeholder="이름"
                  placeholderTextColor={T3}
                  style={s.nameInput}
                  accessibilityLabel="이름 입력"
                />
                <Pressable onPress={saveName} accessibilityRole="button" accessibilityLabel="이름 저장" hitSlop={8} style={s.nameSaveBtn}>
                  <Ionicons name="checkmark" size={ri(18)} color={T1} />
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={[s.tierEyebrow, {color: TIER_COLORS[profile.rankTier]}]} testID="profile-rank-chip">
                  {TIER_LABEL[profile.rankTier]}
                </Text>
                <Pressable onPress={startEditName} accessibilityRole="button" accessibilityLabel="이름 편집" style={s.nameRow} testID="profile-name">
                  <Text style={s.name} numberOfLines={1}>{profile.name}</Text>
                  <Ionicons name="pencil" size={ri(13)} color={T3} />
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
          <View style={[s.card, { padding: rs(22) }]} testID="runner-spec">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rv(16) }}>
              <Text style={[s.cardTitle, { marginBottom: rv(0) }]}>러너 스펙</Text>
              <Pressable onPress={onShareSpec} testID="spec-share" accessibilityRole="button" accessibilityLabel="러너 스펙 공유" hitSlop={8} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: rv(5) }, pressed && { opacity: 0.6 }]}>
                <Ionicons name="share-outline" size={ri(16)} color={ACCENT} />
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
                      <Ionicons name={earned ? 'medal' : 'lock-closed'} size={ri(14)} color={earned ? HALL_GOLD : T3} />
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
                <Ionicons name="pulse-outline" size={ri(14)} color={T3} />
                <Text style={s.specVo2FootText}>심폐 체력 <Text style={s.specVo2FootStrong}>{vo2.vo2max.toFixed(1)} VO₂max</Text> · {vo2.vo2maxLabel}</Text>
              </View>
            )}
          </View>
        )}

        {/* 이번 주 스트릭 — 월~일 달림 점 */}
        <View style={[s.card, s.streakCard]} testID="streak-card">
          <View style={s.streakHead}>
            <SectionTitle>이번 주 스트릭</SectionTitle>
            {streakDays > 0 && <Text style={s.streakCount}>🔥 {streakDays}일</Text>}
          </View>
          <View style={s.streakRow}>
            {DOW.map((d, i) => {
              const done = week7[i];
              const today = i === weekTodayIdx;
              return (
                <View key={i} style={s.streakDay} testID={`streak-day-${i}`}
                  accessible accessibilityLabel={`${d}요일 ${done ? '달림' : today ? '오늘' : '쉼'}`}>
                  {/* 달림 여부가 색·체크로만 전달되던 것을 라벨로 병기(2026-07-05 a11y — 색맹·스크린리더). */}
                  <View style={[s.streakDot, done ? s.streakDotDone : today ? s.streakDotToday : s.streakDotIdle]}>
                    {done && <Ionicons name="checkmark" size={ri(14)} color={BG} />}
                  </View>
                  <Text style={[s.streakDayLabel, today && s.streakDayLabelToday]}>{d}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 누적 기록 카드 제거 — 기록(History) 탭에서 주/월/년/전체 기간별로 볼 수 있어
            마이 탭과 중복(사용자 요청). 정체성·스트릭·주간 목표·진척·기록(PR)·리캡만 남긴다. */}

        {/* 주간 목표 카드 — 홈 '주간 목표' 바와 단일 진실원(settings.goalWeeklyKm).
            목표 미설정이면 추천이 기본값, 런이 없으면 빈 안내를 노출한다. */}
        <View testID="smart-challenge-section">
          <ChallengesSection
            extRuns={challengeExtRuns}
            shoes={challengeExtShoes}
            now={todayISO}
            weeklyGoalKm={weeklyGoalKm}
            onEditSmartTarget={onEditSmartTarget}
          />
        </View>

        {/* 진척(나의 여정·업적) 진입 — 전체화면 ProgressionScreen 으로 전환 */}
        {onOpenProgression && (
          <Pressable
            onPress={onOpenProgression}
            testID="open-progression"
            accessibilityRole="button"
            accessibilityLabel="진척 열기"
            style={({ pressed }) => [s.card, s.progressRow, pressed && { backgroundColor: CARD_HI }]}>
            <View style={s.progressIcon}><Ionicons name="trophy-outline" size={ri(19)} color={ACCENT} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.progressTitle}>진척</Text>
              <Text style={s.progressSub}>나의 여정 · 업적</Text>
            </View>
            <Ionicons name="chevron-forward" size={ri(18)} color={T3} />
          </Pressable>
        )}

        {/* 러닝화 아카이브(은퇴 신발 — 구명 명예의 전당) 진입 — 전체화면 HallOfShoes 로 전환.
            (신발탭 이동을 검토했으나 사용자 결정으로 마이탭 유지 — 2026-07-02.) */}
        {onOpenHallOfShoes && (
          <Pressable
            onPress={onOpenHallOfShoes}
            testID="open-hall-of-shoes"
            accessibilityRole="button"
            accessibilityLabel="러닝화 아카이브 열기"
            style={({ pressed }) => [s.card, s.progressRow, pressed && { backgroundColor: CARD_HI }]}>
            <View style={s.progressIcon}><Ionicons name="ribbon-outline" size={ri(19)} color={ACCENT} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.progressTitle}>러닝화 아카이브</Text>
              <Text style={s.progressSub}>{retiredCount > 0 ? `은퇴한 신발 ${retiredCount}켤레` : '은퇴한 러닝화의 기록이 남는 곳'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={ri(18)} color={T3} />
          </Pressable>
        )}

        {/* 메달 아카이브(마라톤 완주 메달·기록) — 러닝화 아카이브와 짝을 이루는 형제 컬렉션. */}
        {onOpenMedalArchive && (
          <Pressable
            onPress={onOpenMedalArchive}
            testID="open-medal-archive"
            accessibilityRole="button"
            accessibilityLabel="메달 아카이브 열기"
            style={({ pressed }) => [s.card, s.progressRow, pressed && { backgroundColor: CARD_HI }]}>
            <View style={s.progressIcon}><Ionicons name="medal-outline" size={ri(19)} color={ACCENT} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.progressTitle}>메달 아카이브</Text>
              <Text style={s.progressSub}>{medalCount > 0 ? `완주 메달 ${medalCount}개` : '완주한 대회의 메달과 기록'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={ri(18)} color={T3} />
          </Pressable>
        )}

        {/* Apple 건강(HealthKit) 연동 — 심박 백필·워크아웃 기록·안정시심박 자동 채움.
            기기가 HealthKit 을 지원할 때만 노출(안드로이드/시뮬 일부 숨김). */}
        {hkAvailable() && (
          <Pressable
            onPress={linkHealth}
            testID="link-health"
            accessibilityRole="button"
            accessibilityLabel="Apple 건강 연동"
            accessibilityState={{disabled: hkOn}}
            style={({ pressed }) => [s.card, s.progressRow, pressed && !hkOn && { backgroundColor: CARD_HI }]}>
            <View style={s.progressIcon}><Ionicons name="heart-outline" size={ri(19)} color={ACCENT} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.progressTitle}>Apple 건강</Text>
              <Text style={s.progressSub}>{hkOn ? '연동됨 — 심박·워크아웃 동기화 중' : '연동하면 워치 심박과 워크아웃이 이어져요'}</Text>
            </View>
            {hkOn
              ? <Ionicons name="checkmark-circle" size={ri(18)} color={GOOD} />
              : <Ionicons name="chevron-forward" size={ri(18)} color={T3} />}
          </Pressable>
        )}

        {/* 신발 보관함 진입 — 보관(retired) 처리한 신발을 모아 복원할 수 있는 전체화면.
            명예의 전당(은퇴) 아래에 둔다. 복원 진입점이 없던 갭을 메운다. */}
        {onOpenArchive && (
          <Pressable
            onPress={onOpenArchive}
            testID="open-shoe-archive"
            accessibilityRole="button"
            accessibilityLabel="신발 보관함 열기"
            style={({ pressed }) => [s.card, s.progressRow, pressed && { backgroundColor: CARD_HI }]}>
            <View style={s.progressIcon}><Ionicons name="archive-outline" size={ri(19)} color={ACCENT} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.progressTitle}>신발 보관함</Text>
              <Text style={s.progressSub}>{archivedCount > 0 ? `보관한 신발 ${archivedCount}켤레` : '러닝 목록에서 숨긴 신발'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={ri(18)} color={T3} />
          </Pressable>
        )}


        {/* 돌아보기(리캡) — 주간/월간 토글 + 요약 + 카드 공유(slice-8-recap-ui) */}
        <View testID="recap-section">
          <View style={s.recapHead}>
            <Text style={s.sectionLabel}>돌아보기</Text>
            <SegmentedControl
              variant="accentSolid"
              block={false}
              items={[{ key: 'weekly', label: '주간' }, { key: 'monthly', label: '월간' }]}
              value={recapMode}
              onChange={(k) => setRecapMode(k as RecapKind)}
              labelFor={(it) => `${it.label} 리캡`}
              testIDFor={(it) => `recap-toggle-${it.key}`}
            />
          </View>
          <View style={[s.card, { padding: rs(20) }]} testID="recap-card">
            <View style={s.recapTopRow}>
              <Text style={s.recapPeriod} testID="recap-period">{recap.periodLabel}</Text>
              <Pressable
                onPress={onShareRecap}
                testID="recap-share"
                accessibilityRole="button"
                accessibilityLabel="리캡 카드 공유"
                style={({ pressed }) => [s.recapShareBtn, pressed && { backgroundColor: CARD_HI }]}>
                <Ionicons name="share-outline" size={ri(16)} color={ACCENT} />
                <Text style={s.recapShareTxt}>공유</Text>
              </Pressable>
            </View>

            {recap.isEmpty ? (
              // 빈 데이터 graceful — keep-going 보이스(A8-5). 수치 대신 응원 한 줄.
              <View style={s.recapEmpty} testID="recap-empty">
                <Ionicons name="footsteps-outline" size={ri(26)} color={ACCENT} style={{ marginBottom: rv(8) }} />
                <Text style={s.recapEmptyTxt}>
                  {recapMode === 'monthly'
                    ? '이번 달은 아직 기록이 없어요.\n가볍게 한 걸음부터 — Keep Going'
                    : '이번 주는 아직 기록이 없어요.\n가볍게 한 걸음부터 — Keep Going'}
                </Text>
              </View>
            ) : (
              <>
                {/* 총거리·런수·평균 페이스 3칸 (StatGrid) */}
                <StatGrid
                  style={{ marginTop: rv(6) }}
                  divider
                  valueSize={rf(26)}
                  valueWeight="400"
                  valueLS={0.3}
                  items={[
                    { value: recapTotalDisplay, unit: unit, label: '총 거리', testID: 'recap-total' },
                    { value: recap.runCount, unit: '회', label: '러닝 수', testID: 'recap-runcount' },
                    { value: recap.avgPaceLabel, unit: recap.avgPaceLabel === '--' ? undefined : '/km', label: '평균 페이스', testID: 'recap-pace' },
                  ]}
                />

                {/* 최다 착용 신발 */}
                {recap.mostWornShoe && (
                  <View style={s.recapMostWorn} testID="recap-most-worn">
                    <Ionicons name="footsteps" size={ri(15)} color={ACCENT} />
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
            {/* 알림(단일화 2026-07-05, 노이즈 감사): 예전엔 인앱 '알림'(임계 %)과 '푸시
                알림'이 별개 행이라 신발 교체 알림을 두 군데서 만났다 — 한 행으로 병합.
                교체 임박 토글이 인앱 배지(alerts.enabled)와 푸시를 함께 다루고, 임계
                스텝퍼는 그 아래에 산다. */}
            <Pressable onPress={() => toggleOpen('notif')} accessibilityRole="button" accessibilityLabel={`알림, ${notifOnCount}개 켜짐`} accessibilityState={{ expanded: open === 'notif' }} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]} testID="notif-row">
              <View style={s.settingIcon}><Ionicons name="notifications-outline" size={ri(17)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>알림</Text>
              <Text style={s.settingDetail} testID="notif-detail">{notifOnCount > 0 ? `${notifOnCount}개 켜짐` : '꺼짐'}</Text>
              <Ionicons name={open === 'notif' ? 'chevron-up' : 'chevron-forward'} size={ri(16)} color={T3} />
            </Pressable>
            {open === 'notif' && (
              <View style={[s.panel, s.settingBorder]} testID="notif-panel">
                <Text style={s.panelHint}>러닝 리마인더는 매일 정시에 울려요. 교체·주간 목표는 앱을 열 때 알려드려요</Text>
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
                    <Stepper value={alerts.thresholdPct} suffix="% 사용 시" onMinus={() => stepThreshold(-1)} onPlus={() => stepThreshold(1)} />
                    <Text style={s.panelHint}>신발 수명의 <Text style={{ color: ACCENT }}>{alerts.thresholdPct}%</Text>를 쓰면 알려드려요</Text>
                  </>
                )}
                <NotifToggle label="주간 목표 알림" value={notifSettings.weeklyGoal} onToggle={() => toggleNotif('weeklyGoal')} testID="notif-toggle-weeklyGoal" />
                <NotifToggle label="러닝 리마인더" value={notifSettings.runReminder} onToggle={() => toggleNotif('runReminder')} testID="notif-toggle-runReminder" />
                <Stepper value={notifSettings.reminderTime} suffix="리마인더 시각" onMinus={() => stepReminder(-1)} onPlus={() => stepReminder(1)} />
                {pushDenied && (
                  <Text
                    style={s.notifDenied}
                    testID="notif-perm-denied"
                    accessibilityRole="button"
                    accessibilityLabel="알림 권한이 꺼져 있어요. 눌러서 설정 열기"
                    onPress={() => { Promise.resolve(Linking.openSettings()).catch(() => {}); }}>알림 권한이 꺼져 있어요 — 설정에서 허용하기 ›</Text>
                )}
              </View>
            )}

            {/* 3) 단위 — 즉시 토글(전 화면 환산 반영) */}
            <Pressable onPress={() => onChangeUnit?.(unit === 'km' ? 'mi' : 'km')} accessibilityRole="button" accessibilityLabel={`단위, 현재 ${unitKorean(unit)}. 눌러서 전환`} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="speedometer-outline" size={ri(17)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>단위</Text>
              <Text style={s.settingDetail}>{unitKorean(unit)}</Text>
              <Ionicons name="swap-horizontal" size={ri(16)} color={T3} />
            </Pressable>

            {/* 3.5) 체중 — 칼로리 추정용 */}
            <Pressable onPress={() => toggleOpen('weight')} accessibilityRole="button" accessibilityLabel={`체중, ${weightKg}kg`} accessibilityState={{ expanded: open === 'weight' }} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="body-outline" size={ri(17)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>체중</Text>
              <Text style={s.settingDetail}>{weightKg}kg</Text>
              <Ionicons name={open === 'weight' ? 'chevron-up' : 'chevron-forward'} size={ri(16)} color={T3} />
            </Pressable>
            {open === 'weight' && (
              <View style={[s.panel, s.settingBorder]}>
                <Stepper value={weightKg} suffix="kg" onMinus={() => stepWeight(-1)} onPlus={() => stepWeight(1)} />
                <Text style={s.panelHint}>러닝 칼로리 추정에 사용돼요</Text>
              </View>
            )}
            {/* 심박·신체 — 심박존/트레이닝효과 정확도용(나이·성별·안정심박). 선택 입력. */}
            <Pressable onPress={() => toggleOpen('body')} accessibilityRole="button" accessibilityLabel="심박 · 신체 설정" accessibilityState={{ expanded: open === 'body' }} style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="heart-outline" size={ri(17)} color={ACCENT} /></View>
              <Text style={s.settingLabel}>심박 · 신체</Text>
              <Text style={s.settingDetail}>{age > 0 ? `${age}세` : '미설정'}</Text>
              <Ionicons name={open === 'body' ? 'chevron-up' : 'chevron-forward'} size={ri(16)} color={T3} />
            </Pressable>
            {open === 'body' && (
              <View style={[s.panel, s.settingBorder]}>
                <Stepper value={age > 0 ? age : '미설정'} suffix="나이(세)" onMinus={() => stepAge(-1)} onPlus={() => stepAge(1)} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rv(14) }}>
                  <Text style={s.settingLabel}>성별</Text>
                  <View style={{ flexDirection: 'row', gap: rv(8) }}>
                    {(['male', 'female'] as const).map((sx) => (
                      <Pressable key={sx} onPress={() => onChangeSex?.(sx)} accessibilityRole="button" accessibilityLabel={sx === 'male' ? '남성' : '여성'} accessibilityState={{ selected: sex === sx }}
                        style={{ paddingVertical: rv(6), paddingHorizontal: rs(16), borderRadius: RADIUS.sm, backgroundColor: sex === sx ? ACCENT : CARD_HI }}>
                        <Text style={{ color: sex === sx ? BG : T2, fontFamily: FONT, fontWeight: '700', fontSize: TYPE.label.fontSize }}>{sx === 'male' ? '남성' : '여성'}</Text>
                      </Pressable>
                    ))}
                  </View>
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
                  <View style={s.settingIcon}><Ionicons name="person-circle-outline" size={ri(17)} color={ACCENT} /></View>
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
                    size={ri(17)}
                    color={syncFailed ? DANGER : GOOD}
                  />
                  <Ionicons name={acctOpen ? 'chevron-up' : 'chevron-down'} size={ri(16)} color={T3} />
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
                    <View style={s.settingIcon}><Ionicons name={syncing ? 'sync-outline' : syncFailed ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={ri(16)} color={syncFailed ? DANGER : T3} /></View>
                    <Text style={[s.settingLabel, { fontWeight: '500', color: syncFailed ? DANGER : T2 }]}>
                      {syncing ? '동기화 중…' : syncFailed ? '동기화 실패 · 다시 시도' : (lastSyncAt == null ? '클라우드 연결됨 · 자동 동기' : lastSyncLabel)}
                    </Text>
                    {syncFailed && !syncing && <Ionicons name="refresh" size={ri(15)} color={DANGER} />}
                  </Pressable>
                )}

                {acctOpen && (
                  <>
                    {/* 로그아웃 */}
                    <Pressable onPress={handleSignOut} accessibilityRole="button" accessibilityLabel="로그아웃" style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
                      <View style={s.settingIcon}><Ionicons name="log-out-outline" size={ri(17)} color={DANGER} /></View>
                      <Text style={[s.settingLabel, { color: DANGER }]}>로그아웃</Text>
                      <Ionicons name="chevron-forward" size={ri(16)} color={T3} />
                    </Pressable>

                    {/* 회원 탈퇴(영구 삭제) — 앱스토어 인앱 탈퇴 요건 */}
                    {onDeleteAccount && (
                      <Pressable testID="account-delete" onPress={handleDeleteAccount} accessibilityRole="button" accessibilityLabel="회원 탈퇴" style={({ pressed }) => [s.settingRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) }, pressed && { backgroundColor: CARD_HI }]}>
                        <View style={s.settingIcon}><Ionicons name="trash-outline" size={ri(16)} color={DANGER} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.settingLabel, { color: DANGER }]}>회원 탈퇴</Text>
                          <Text style={s.cloudSub}>계정·데이터 영구 삭제(복구 불가)</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={ri(16)} color={T3} />
                      </Pressable>
                    )}

                    {legalRows}
                  </>
                )}
              </>
            ) : (
              <View style={s.cloudPad}>
                <Text style={s.cloudIntro}>로그인하면 신발·러닝 기록·설정이 안전하게 보관되고, 기기를 바꿔도 그대로 이어져요.</Text>
                <Pressable testID="cloud-signin-kakao" onPress={() => handleSignIn('kakao')} disabled={signingIn} accessibilityRole="button" accessibilityLabel="카카오로 로그인" accessibilityState={{ disabled: signingIn }} style={({ pressed }) => [s.cloudBtn, s.cloudBtnKakao, pressed && { opacity: 0.85 }]}>
                  <Text style={[s.brandMark, { color: KAKAO_LABEL }]}>K</Text>
                  <Text style={[s.cloudBtnTxt, { color: KAKAO_LABEL }]}>{signingIn ? '로그인 중…' : '카카오로 계속'}</Text>
                </Pressable>
                <Pressable testID="cloud-signin-naver" onPress={() => handleSignIn('naver')} disabled={signingIn} accessibilityRole="button" accessibilityLabel="네이버로 로그인" accessibilityState={{ disabled: signingIn }} style={({ pressed }) => [s.cloudBtn, s.cloudBtnNaver, pressed && { opacity: 0.85 }]}>
                  <Text style={[s.brandMark, { color: NAVER_LABEL }]}>N</Text>
                  <Text style={[s.cloudBtnTxt, { color: NAVER_LABEL }]}>{signingIn ? '로그인 중…' : '네이버로 계속'}</Text>
                </Pressable>
                <Button
                  testID="cloud-signin-google"
                  label={signingIn ? '로그인 중…' : 'Google로 계속'}
                  onPress={() => handleSignIn('google')}
                  disabled={signingIn}
                  iconNode={<Ionicons name="logo-google" size={ri(17)} color={signingIn ? T3 : T1} />}
                  style={s.cloudBtnGoogle}
                />
                <Pressable testID="cloud-signin-apple" onPress={() => handleSignIn('apple')} disabled={signingIn} accessibilityRole="button" accessibilityLabel="Apple로 로그인" accessibilityState={{ disabled: signingIn }} style={({ pressed }) => [s.cloudBtn, s.cloudBtnApple, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="logo-apple" size={ri(18)} color={T1} />
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
            </View>
            {cloudMsg && (
              <Text testID="cloud-msg" style={[s.cloudMsg, cloudMsg.ok ? s.dataMsgOk : s.dataMsgErr]}>{cloudMsg.text}</Text>
            )}
          </View>
        </View>
        </>)}

      </ScrollView>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: rv(7) },
  card: { backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER },
  cardTitle: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', marginBottom: rv(16) },
  // 러너 스펙 카드
  // 거리 PB 메달 타일 2×2(러너 스펙 메인) — 달성=CARD_HI + 골드, 미달성=흐린 판.
  pbGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: rv(10) },
  pbTile: { width: '48.5%', paddingHorizontal: rs(14), paddingVertical: rv(13), borderRadius: rs(14), borderCurve: 'continuous' },
  pbTileOn: { backgroundColor: CARD_HI },
  pbTileOff: { backgroundColor: withAlpha(T1, 0.04) },
  pbHead: { flexDirection: 'row', alignItems: 'center', gap: rv(6) },
  pbLabel: { fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 0.3 },
  pbVal: { fontFamily: DISPLAY, marginTop: rv(6), fontVariant: ['tabular-nums'] },
  pbValOn: { color: T1, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.4 },
  pbValOff: { color: withAlpha(T1, 0.32), fontSize: TYPE.body.fontSize, fontWeight: '600' },
  // 서브 스탯 3열(누적·최장·1km 최고).
  specSubRow: { flexDirection: 'row', marginTop: rv(16), paddingTop: rv(16), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CARD_BORDER },
  specSub: { flex: 1, alignItems: 'center', gap: rv(3) },
  specSubDiv: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: CARD_BORDER },
  specSubVal: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '600', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  specSubUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600' },
  specSubLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
  // 심폐 체력(VO₂max) 강등 푸터 — 한 줄.
  specVo2Foot: { flexDirection: 'row', alignItems: 'center', gap: rv(7), marginTop: rv(16), paddingTop: rv(14), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CARD_BORDER },
  specVo2FootText: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
  specVo2FootStrong: { color: T2, fontWeight: '700' },
  sectionLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: 0.4, paddingHorizontal: rs(4) },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: rv(13), padding: rs(16) },
  progressIcon: { width: rs(38), height: rs(38), borderRadius: RADIUS.sm, backgroundColor: withAlpha(ACCENT, 0.12), alignItems: 'center', justifyContent: 'center' },
  progressTitle: { color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700' },
  progressSub: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', marginTop: rv(3) },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: rs(4) },
  title: { color: T1, fontFamily: FONT, fontSize: TYPE.display.fontSize, fontWeight: '500', letterSpacing: -0.8 },
  iconBtn: { width: rs(38), height: rs(38), borderRadius: RADIUS.pill, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },

  identity: { flexDirection: 'row', alignItems: 'center', gap: rv(14), paddingHorizontal: rs(4), paddingTop: rv(4) },
  avatarRing: { padding: rs(2), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.12) },
  avatarInner: { padding: 2.5, borderRadius: RADIUS.pill, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: rs(50), height: rs(50), borderRadius: RADIUS.pill },
  avatarEdit: { position: 'absolute', right: -1, bottom: -1, width: rs(18), height: rs(18), borderRadius: RADIUS.pill, backgroundColor: T3, borderWidth: 2, borderColor: BG, alignItems: 'center', justifyContent: 'center' },
  tierEyebrow: { fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 3.5, textTransform: 'uppercase', marginBottom: rv(3) },
  name: { color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '600', letterSpacing: -0.5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: rv(7) },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  nameInput: { flex: 1, color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '500', letterSpacing: -0.5, borderBottomWidth: 1, borderBottomColor: ACCENT, paddingVertical: rv(2), paddingHorizontal: rs(0) },
  nameSaveBtn: { width: rs(34), height: rs(34), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.1), alignItems: 'center', justifyContent: 'center' },
  idStat: { fontFamily: FONT, color: T3, fontSize: TYPE.caption.fontSize, fontWeight: '600' },
  idStatNum: { fontFamily: DISPLAY, color: T1, fontSize: TYPE.label.fontSize, fontWeight: '700' },
  since: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },

  // 이번 주 스트릭 카드
  streakCard: { padding: rs(16) },
  streakHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rv(14) },
  streakCount: { color: ACCENT, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700' },
  streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakDay: { alignItems: 'center', gap: rv(6) },
  streakDot: { width: rs(30), height: rs(30), borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  streakDotDone: { backgroundColor: BRAND },
  streakDotIdle: { backgroundColor: CARD_DIM },
  streakDotToday: { backgroundColor: CARD_DIM, borderWidth: 1.5, borderStyle: 'dashed', borderColor: T3 },
  streakDayLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '600' },
  streakDayLabelToday: { color: T2 },

  // 누적/개인 기록·리캡 요약 스탯 줄은 StatGrid 프리미티브로 이전(셀·값·라벨 토큰을
  // 그쪽이 단일 소스로 책임 — 과거 statRow/statCell/statDivider/statValue/Unit/Label 제거).

  badge: { flex: 1, backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', paddingVertical: rv(16), paddingHorizontal: rs(8), alignItems: 'center', gap: rv(8), borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER },
  badgeIcon: { width: rs(44), height: rs(44), borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  badgeLabel: { fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', textAlign: 'center' },

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: rv(13), paddingVertical: rv(14), paddingHorizontal: rs(16) },
  settingBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  settingIcon: { width: rs(30), height: rs(30), borderRadius: rs(9), backgroundColor: withAlpha(T1, 0.06), alignItems: 'center', justifyContent: 'center' },
  settingLabel: { flex: 1, color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600' },
  settingDetail: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },

  // expandable panels
  panel: { paddingHorizontal: rs(18), paddingVertical: rv(16), gap: rv(14), backgroundColor: withAlpha(T1, 0.02) },
  panelHint: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(18) },

  notifDenied: { color: WARN, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(18) },

  // ── 돌아보기(리캡) ───────────────────────────────────────────────────────────
  recapHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: rv(12), paddingHorizontal: rs(4) },
  // 주/월 토글은 SegmentedControl(accentSolid, block=false)로 이전(과거 recapToggle/
  // recapTab/recapTabOn/recapTabTxt/recapTabTxtOn 제거, 시각 동등).
  recapTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rv(8) },
  recapPeriod: { color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700' },
  recapShareBtn: { flexDirection: 'row', alignItems: 'center', gap: rv(5), paddingHorizontal: rs(12), paddingVertical: rv(7), borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.12) },
  recapShareTxt: { color: ACCENT, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700' },
  recapEmpty: { alignItems: 'center', paddingVertical: rv(22) },
  recapEmptyTxt: { color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', lineHeight: rf(20), textAlign: 'center' },
  recapMostWorn: { flexDirection: 'row', alignItems: 'center', gap: rv(7), marginTop: rv(16), paddingTop: rv(14), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP },
  recapMostWornTxt: { flex: 1, color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  recapPrBox: { marginTop: rv(14), gap: rv(2) },
  recapPrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: rv(7) },
  recapPrLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  recapPrValue: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '600', letterSpacing: -0.2 },
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },

  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), height: rs(44), borderRadius: rs(14), borderCurve: 'continuous' },
  toggleOn: { backgroundColor: GOOD },
  toggleOff: { backgroundColor: CARD_HI },
  toggleTxt: { fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600' },

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
  cloudBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), height: rs(48), borderRadius: RADIUS.btn },
  // Google = 앱 accent CTA → 단일 Button(그라데이션/글로우/RADIUS.btn). 여기선 높이만.
  cloudBtnGoogle: { height: rs(48) },
  cloudBtnApple: { backgroundColor: CARD_HI },
  cloudBtnKakao: { backgroundColor: KAKAO_YELLOW },
  cloudBtnNaver: { backgroundColor: NAVER_GREEN },
  brandMark: { fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700' },
  cloudBtnTxt: { color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600' },
  cloudMsg: { fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', lineHeight: rf(18), paddingHorizontal: rs(16), paddingBottom: rv(14) },
});
