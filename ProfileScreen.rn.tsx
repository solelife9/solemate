// ============================================================================
// ProfileScreen.rn.tsx — 프로필: identity, lifetime stats, achievements, settings
// 설정 4행은 실제로 구동된다(하드코딩 '주5회'/'켜짐'/'킬로미터' 제거):
//   · 목표 설정 — 주간 목표 거리(km 표준) 스테퍼 + 달성률
//   · 알림     — 신발 교체 알림 on/off + 임계값(수명 사용률 %)
//   · 단위     — km ↔ mi 토글(전 화면 즉시 환산 반영)
//   · 계정 설정 — 기기/가입/버전 정보
// 값은 App이 소유(영속은 lib/settings)하고, 이 화면은 표시 + 변경 콜백만 담당한다.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Image, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { BG, CARD, CARD_DIM, CARD_HI, ACCENT, GOOD, DANGER, WARN, T1, T2, T3, SEP, CARD_BORDER, FONT, DISPLAY, withAlpha, TIER_COLORS, TIER_LABEL, KAKAO_YELLOW, KAKAO_LABEL, NAVER_GREEN, NAVER_LABEL, RADIUS } from './theme';
// recap 토글 = SegmentedControl(accentSolid), 스탯 그리드들 = StatGrid 단일 프리미티브.
import { TabBar, Ring, Pill, SectionTitle, Button, SegmentedControl, StatGrid } from './primitives';
import { Unit, unitKorean, displayNum, displayToKm } from './lib/units';
import { weeklyRecap, monthlyRecap, type RecapRun, type RecapShoe } from './lib/recap';
import { buildRecapShareCardModel, shareRecapCard, formatRecapPRs, type RecapKind, type SvgCapturable } from './lib/shareCard';
import RecapShareCard from './RecapShareCard';
import {
  AlertSettings, GOAL_STEP_DISPLAY, THRESHOLD_STEP,
  MIN_THRESHOLD_PCT, MAX_THRESHOLD_PCT, DEFAULT_SETTINGS, DEFAULT_ALERTS,
  WEIGHT_STEP, MIN_WEIGHT_KG, MAX_WEIGHT_KG,
} from './lib/settings';
import { NotifSettings, DEFAULT_NOTIF_SETTINGS } from './lib/notifications';
import { requestPushPermission as defaultRequestPushPermission } from './lib/pushMessaging';
import { BackupPayload, BackupV1 } from './lib/backup';
import { Challenge, ChallengeRun } from './lib/challenges';
import { mergeCloudData, nextAuthState, AuthState } from './lib/cloudSync';
import type { CloudPort, CloudProvider, CloudUser } from './lib/cloudPort';
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
// '아직 동기 안 함' 카피로 분기한다.
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
      <Ionicons name={value ? 'notifications' : 'notifications-off'} size={16} color={value ? T1 : T2} />
      <Text style={[s.toggleTxt, { color: value ? T1 : T2 }]}>{`${label} ${value ? '켜짐' : '꺼짐'}`}</Text>
    </Pressable>
  );
}

// −/＋ 스테퍼(목표 거리·알림 임계값 공용). 모듈 스코프에 둬 매 렌더 재생성을 피한다.
function Stepper({ value, suffix, onMinus, onPlus }: { value: number | string; suffix: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={s.stepper}>
      <Pressable onPress={onMinus} accessibilityRole="button" accessibilityLabel={`${suffix} 줄이기`} style={({ pressed }) => [s.stepBtn, pressed && { backgroundColor: CARD }]}>
        <Ionicons name="remove" size={20} color={T1} />
      </Pressable>
      <View style={s.stepVal} accessible accessibilityLabel={`${value} ${suffix}`}>
        <Text style={s.stepNum}>{value}</Text>
        <Text style={s.stepUnit}>{suffix}</Text>
      </View>
      <Pressable onPress={onPlus} accessibilityRole="button" accessibilityLabel={`${suffix} 늘리기`} style={({ pressed }) => [s.stepBtn, pressed && { backgroundColor: CARD }]}>
        <Ionicons name="add" size={20} color={T1} />
      </Pressable>
    </View>
  );
}

export default function ProfileScreen({
  profile = DEFAULT_PROFILE, badges = [], records = [], onTab,
  profilePhotoUri = '', onChangeName, onPickPhoto,
  weightKg = DEFAULT_SETTINGS.weightKg, onChangeWeight,
  initialOpen = null, onConsumeInitialOpen,
  unit = 'km', onChangeUnit,
  goalWeeklyKm = DEFAULT_SETTINGS.goalWeeklyKm, weeklyPercent = 0, weeklyDoneKm = 0, onChangeGoal,
  streakDays = 0, weekDays = [], weekTodayIdx = -1,
  alerts = { ...DEFAULT_ALERTS }, onChangeAlerts,
  notifSettings = DEFAULT_NOTIF_SETTINGS, onChangeNotifSettings,
  onRequestPushPermission = defaultRequestPushPermission,
  recapRuns = [], recapShoes = [], recapNow,
  deviceId = '',
  backupData = { shoes: [], runs: [], settings: {} },
  cloudPort, onCloudMerged, cloudClock = () => Date.now(),
  onOpenProgression,
  onOpenHallOfShoes, retiredCount = 0,
}: {
  profile?: Profile;
  badges?: Badge[];
  records?: PersonalRecord[];
  onTab?: (i: number) => void;
  // 프로필 정체성(로컬 영속). 사진 URI(없으면 아이콘 폴백), 이름 변경, 사진 선택 콜백.
  profilePhotoUri?: string;
  onChangeName?: (name: string) => void;
  onPickPhoto?: () => void;
  // 체중(kg) — 칼로리 추정용. 설정 스테퍼가 조정한다.
  weightKg?: number;
  onChangeWeight?: (kg: number) => void;
  // 외부(홈 주간목표 탭)에서 특정 설정 패널을 펼친 채 진입한다(한 번만 소비).
  initialOpen?: 'goal' | 'weight' | 'alerts' | 'notif' | 'account' | 'import' | null;
  onConsumeInitialOpen?: () => void;
  unit?: Unit;
  onChangeUnit?: (u: Unit) => void;
  goalWeeklyKm?: number;
  weeklyPercent?: number;
  // 이번 주 누적 거리(km 표준). 주간 목표 링/카피의 분자(달성 거리)로 표시 단위 환산해 쓴다.
  weeklyDoneKm?: number;
  onChangeGoal?: (km: number) => void;
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
  // 개인 챌린지: App 이 소유(영속)하는 목록 + 런 매핑({date,dist}). 생성/삭제 콜백만 받는다.
  challenges?: Challenge[];
  challengeRuns?: ChallengeRun[];
  onCreateChallenge?: (c: Challenge) => void;
  onDeleteChallenge?: (id: string) => void;
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
  // 진척(랭크·타이틀·업적) 화면 진입. App 이 전체화면 ProgressionScreen 으로 전환한다.
  // 없으면 진척 진입 버튼은 표시되지 않는다(안전한 no-op).
  onOpenProgression?: () => void;
  // 명예의 전당(은퇴 신발 박물관) 진입. 없으면 진입 버튼 미표시(안전한 no-op).
  onOpenHallOfShoes?: () => void;
  // 은퇴한 신발 수(전당 진입 행의 부제에 표시). 0이어도 진입은 가능(빈 전당 안내).
  retiredCount?: number;
}) {
  // 어떤 설정 행이 펼쳐졌는지(단위는 패널 없이 즉시 토글). 한 번에 하나만 펼친다.
  const [open, setOpen] = useState<null | 'goal' | 'weight' | 'alerts' | 'notif' | 'account' | 'import'>(null);
  const toggleOpen = (k: 'goal' | 'weight' | 'alerts' | 'notif' | 'account' | 'import') => setOpen((o) => (o === k ? null : k));

  // 마이탭 정리(설정 분리): 기본은 프로필+기록만 보이고, 헤더 ⚙️ 를 누르면 같은 화면이
  // 전체화면 '설정' 뷰로 전환된다(목표·알림·푸시·단위·체중·계정·클라우드를 한곳에 모음).
  // 상태/핸들러는 그대로 공유하므로 데이터 흐름은 바뀌지 않는다(뷰 전환일 뿐).
  const [showSettings, setShowSettings] = useState(false);

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
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cloudMsg, setCloudMsg] = useState<{ ok: boolean; text: string } | null>(null);
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
      setAuthState((s) => nextAuthState(s, 'signInSuccess'));
      // 동기는 아래 자동 동기 effect 가 (signedIn 전환 + 데이터 변경 시) 처리한다.
    } catch (e: any) {
      setAuthState((s) => nextAuthState(s, 'signInError'));
      setCloudMsg({ ok: false, text: e?.message || '로그인에 실패했습니다.' });
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
    setLastSyncAt(null);
    setCloudMsg(null);
    setAuthState((s) => nextAuthState(s, 'signOut'));
  };

  // 동기 본체: pull(원격) → mergeCloudData(로컬, 원격) → push(병합 결과). 양방향 무손실
  // 병합이라 백업·복원을 한 번에 끝낸다(어느 쪽 레코드도 버리지 않음). 병합 결과는
  // onCloudMerged 로 App 에 돌려 원격에만 있던 레코드를 로컬에도 반영한다.
  // signedIn 가드 없이 cloudPort(currentUser)만 의존 — 로그인 직후 자동 호출에서도
  // authState 상태 갱신 타이밍과 무관하게 동작한다.
  const runSync = async (silent = false) => {
    if (!cloudPort || syncing) return;
    setSyncing(true);
    if (!silent) setCloudMsg(null);
    try {
      const remote = await cloudPort.pull();
      const merged = mergeCloudData(backupData, remote);
      await cloudPort.push(merged);
      onCloudMerged?.(merged);
      setLastSyncAt(cloudClock());
      // 자동(silent) 동기는 성공 팝업을 띄우지 않는다(계정 행 상태로만 표시). 에러는 항상 안내.
      if (!silent) setCloudMsg({ ok: true, text: '클라우드 동기 완료 — 데이터가 안전하게 백업됐습니다.' });
    } catch (e: any) {
      setCloudMsg({ ok: false, text: e?.message || '동기에 실패했습니다. 로컬 데이터는 그대로입니다.' });
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
  const lastSyncLabel = lastSyncAt == null ? '아직 동기 안 함' : `${fmtSyncTime(lastSyncAt)} 동기됨`;

  // 목표는 km로 저장하되 화면은 표시 단위(km|mi)로 보여주고 스텝도 표시 단위로 움직인다.
  const goalDisplay = displayNum(goalWeeklyKm, unit, 0);
  const stepGoal = (dir: 1 | -1) => {
    const next = goalDisplay + dir * GOAL_STEP_DISPLAY;   // 표시 단위 기준 증감
    onChangeGoal?.(displayToKm(next, unit));               // km로 되돌려 저장(클램프는 App)
  };

  const stepWeight = (dir: 1 | -1) => {
    onChangeWeight?.(Math.max(MIN_WEIGHT_KG, Math.min(MAX_WEIGHT_KG, weightKg + dir * WEIGHT_STEP)));
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
  const recapTotalDisplay = displayNum(recap.totalKm, unit, 1);
  // 공유 카드(화면 밖 마운트) 모델 — press 시 Svg.toDataURL 로 캡처해 공유.
  const recapCardRef = useRef<SvgCapturable | null>(null);
  const recapCardModel = buildRecapShareCardModel(recap, { unit, kind: recapMode });
  const onShareRecap = () => {
    shareRecapCard(recapCardRef, recap, { unit, kind: recapMode });
  };

  // 주간 목표 링/카피: 달성률(%)·달성 거리·남은 거리를 표시 단위로 환산해 keep-going 톤
  // 한 줄로 묶는다. 100% 이상이면 '달성!' 축하 카피, 그 전이면 '남은 거리만 더' 격려.
  const doneDisplay = displayNum(weeklyDoneKm, unit, 1);
  const remainingKm = Math.max(0, goalWeeklyKm - weeklyDoneKm);
  const remainingDisplay = displayNum(remainingKm, unit, 1);
  const reached = weeklyPercent >= 100;
  const ringProgress = Math.max(0, Math.min(1, weeklyPercent / 100));
  const keepGoing = reached
    ? '이번 주 목표 달성! 🎉 계속 이어가요'
    : `${remainingDisplay}${unit}만 더 — 계속 달려요!`;
  // 이번 주 스트릭 점: weekDays(월~일)를 항상 7칸으로 정규화(미주입/부족분은 false).
  const week7 = Array.from({ length: 7 }, (_, i) => !!weekDays[i]);
  const DOW = ['월', '화', '수', '목', '금', '토', '일'];

  const insets = useSafeAreaInsets();
  return (
    <View style={s.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 8, gap: 16 }}>
        {/* header — 마이(프로필+기록) ↔ 설정 뷰 전환 */}
        {showSettings ? (
          <View style={s.headerRow}>
            <Pressable onPress={() => setShowSettings(false)} accessibilityRole="button" accessibilityLabel="뒤로" style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="chevron-back" size={20} color={T2} /></Pressable>
            <Text style={s.title}>설정</Text>
            <View style={{ width: 38 }} />
          </View>
        ) : (
          <View style={s.headerRow}>
            <Text style={s.title}>마이</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => Share.share({ message: 'Keego에서 내 러닝화 수명을 관리하고 있어요 🏃' })} accessibilityRole="button" accessibilityLabel="기록 공유" style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="share-outline" size={18} color={T2} /></Pressable>
            <Pressable onPress={() => setShowSettings(true)} accessibilityRole="button" accessibilityLabel="설정 열기" style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="settings-outline" size={19} color={T2} /></Pressable>
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
                <Ionicons name="person" size={30} color={T3} />
              )}
            </View>
            <View style={s.avatarEdit}><Ionicons name="camera" size={11} color={BG} /></View>
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
                <Pressable onPress={saveName} accessibilityRole="button" accessibilityLabel="이름 저장" style={s.nameSaveBtn}>
                  <Ionicons name="checkmark" size={18} color={BG} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={startEditName} accessibilityRole="button" accessibilityLabel="이름 편집" style={s.nameRow} testID="profile-name">
                <Text style={s.name} numberOfLines={1}>{profile.name}</Text>
                <Ionicons name="pencil" size={13} color={T3} />
              </Pressable>
            )}
            <View style={[s.row, { marginTop: 6 }]}>
              <View
                testID="profile-rank-chip"
                style={[
                  s.rankChip,
                  {
                    backgroundColor: withAlpha(TIER_COLORS[profile.rankTier], 0.16),
                    borderColor: withAlpha(TIER_COLORS[profile.rankTier], 0.5),
                  },
                ]}>
                <Text style={[s.rankChipText, { color: TIER_COLORS[profile.rankTier] }]}>
                  {TIER_LABEL[profile.rankTier]}
                </Text>
              </View>
              {!!profile.equippedTitle && (
                <View style={s.titlePill} testID="profile-title-pill">
                  <Ionicons name="ribbon" size={11} color={ACCENT} />
                  <Text style={s.titlePillText} numberOfLines={1}>{profile.equippedTitle}</Text>
                </View>
              )}
              {!!profile.since && <Text style={s.since}>{profile.since}</Text>}
            </View>
            <View style={[s.row, { marginTop: 7, gap: 14 }]} testID="profile-progression-stats">
              <Text style={s.idStat}>업적 <Text style={s.idStatNum}>{profile.achievementCount ?? 0}</Text></Text>
              <Text style={s.idStat}>은퇴 신발 <Text style={s.idStatNum}>{profile.retiredShoes ?? 0}</Text></Text>
            </View>
          </View>
          {streakDays > 0 && (
            <Pill tone="warn" icon="flame" label={`${streakDays}일 연속`} testID="streak-pill" />
          )}
        </View>

        {/* 주간 목표 달성 링 + keep-going 카피 */}
        <View style={[s.card, s.goalCard]} testID="goal-ring-card">
          <Ring size={92} stroke={9} progress={ringProgress}>
            <View style={s.ringCenter}>
              <Text style={s.ringPct}>{weeklyPercent}<Text style={s.ringPctU}>%</Text></Text>
            </View>
          </Ring>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.goalLabel}>주간 목표</Text>
            <View style={[s.row, s.goalNumRow]}>
              <Text style={s.goalDone}>{doneDisplay}</Text>
              <Text style={s.goalTotal}> / {goalDisplay} {unit}</Text>
            </View>
            <Text style={[s.keepGoing, reached && s.keepGoingDone]} testID="keep-going">{keepGoing}</Text>
          </View>
        </View>

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
                <View key={i} style={s.streakDay} testID={`streak-day-${i}`}>
                  <View style={[s.streakDot, done ? s.streakDotDone : today ? s.streakDotToday : s.streakDotIdle]}>
                    {done && <Ionicons name="checkmark" size={14} color={T1} />}
                  </View>
                  <Text style={[s.streakDayLabel, today && s.streakDayLabelToday]}>{d}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* lifetime stats */}
        <View style={[s.card, { padding: 22 }]}>
          <Text style={s.cardTitle}>누적 기록</Text>
          <StatGrid
            divider
            valueSize={26}
            valueWeight="400"
            valueLS={0.3}
            items={[
              { value: profile.totalKm.toLocaleString(), unit: unit, label: '총 거리' },
              { value: String(profile.totalRuns), unit: '회', label: '총 러닝' },
              { value: profile.totalTime, unit: 'h', label: '총 시간' },
            ]}
          />
        </View>

        {/* 진척(랭크·타이틀·업적) 진입 — 전체화면 ProgressionScreen 으로 전환 */}
        {onOpenProgression && (
          <Pressable
            onPress={onOpenProgression}
            testID="open-progression"
            accessibilityRole="button"
            accessibilityLabel="진척 열기"
            style={({ pressed }) => [s.card, s.progressRow, pressed && { backgroundColor: CARD_HI }]}>
            <View style={s.progressIcon}><Ionicons name="trophy-outline" size={19} color={ACCENT} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.progressTitle}>진척</Text>
              <Text style={s.progressSub}>랭크 · 타이틀 · 업적</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={T3} />
          </Pressable>
        )}

        {/* 명예의 전당(은퇴 신발 박물관) 진입 — 전체화면 HallOfShoes 로 전환 */}
        {onOpenHallOfShoes && (
          <Pressable
            onPress={onOpenHallOfShoes}
            testID="open-hall-of-shoes"
            accessibilityRole="button"
            accessibilityLabel="명예의 전당 열기"
            style={({ pressed }) => [s.card, s.progressRow, pressed && { backgroundColor: CARD_HI }]}>
            <View style={s.progressIcon}><Ionicons name="ribbon-outline" size={19} color={ACCENT} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.progressTitle}>명예의 전당</Text>
              <Text style={s.progressSub}>{retiredCount > 0 ? `은퇴한 신발 ${retiredCount}켤레` : '은퇴한 신발들의 박물관'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={T3} />
          </Pressable>
        )}

        {/* personal records (PR) — 1km 페이스 · 5km 기록 · 최장 거리 */}
        {records.length > 0 && (
          <View style={[s.card, { padding: 22 }]}>
            <Text style={s.cardTitle}>개인 기록</Text>
            <StatGrid
              divider
              valueSize={26}
              valueWeight="400"
              valueLS={0.3}
              items={records.map((r) => ({
                value: r.value,
                unit: r.unit || undefined,
                label: r.label,
                top: <Ionicons name={r.icon} size={18} color={T2} style={{ marginBottom: 6 }} />,
              }))}
            />
          </View>
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
          <View style={[s.card, { padding: 20 }]} testID="recap-card">
            <View style={s.recapTopRow}>
              <Text style={s.recapPeriod} testID="recap-period">{recap.periodLabel}</Text>
              <Pressable
                onPress={onShareRecap}
                testID="recap-share"
                accessibilityRole="button"
                accessibilityLabel="리캡 카드 공유"
                style={({ pressed }) => [s.recapShareBtn, pressed && { backgroundColor: CARD_HI }]}>
                <Ionicons name="share-outline" size={16} color={ACCENT} />
                <Text style={s.recapShareTxt}>공유</Text>
              </Pressable>
            </View>

            {recap.isEmpty ? (
              // 빈 데이터 graceful — keep-going 보이스(A8-5). 수치 대신 응원 한 줄.
              <View style={s.recapEmpty} testID="recap-empty">
                <Ionicons name="footsteps-outline" size={26} color={ACCENT} style={{ marginBottom: 8 }} />
                <Text style={s.recapEmptyTxt}>
                  {recapMode === 'monthly'
                    ? '이번 달은 아직 기록이 없어요.\n가볍게 한 걸음부터 — keep going!'
                    : '이번 주는 아직 기록이 없어요.\n가볍게 한 걸음부터 — keep going!'}
                </Text>
              </View>
            ) : (
              <>
                {/* 총거리·런수·평균 페이스 3칸 (StatGrid) */}
                <StatGrid
                  style={{ marginTop: 6 }}
                  divider
                  valueSize={26}
                  valueWeight="400"
                  valueLS={0.3}
                  items={[
                    { value: recapTotalDisplay, unit: unit, label: '총 거리', testID: 'recap-total' },
                    { value: recap.runCount, unit: '회', label: '런 수', testID: 'recap-runcount' },
                    { value: recap.avgPaceLabel, unit: recap.avgPaceLabel === '--' ? undefined : '/km', label: '평균 페이스', testID: 'recap-pace' },
                  ]}
                />

                {/* 최다 착용 신발 */}
                {recap.mostWornShoe && (
                  <View style={s.recapMostWorn} testID="recap-most-worn">
                    <Ionicons name="footsteps" size={15} color={ACCENT} />
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

        {/* achievements */}
        {badges.length > 0 && (
          <View>
            <Text style={[s.sectionLabel, { paddingBottom: 12 }]}>업적</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {badges.map((b, i) => (
                <View key={i} style={[s.badge, { opacity: b.on ? 1 : 0.4 }]}>
                  <View style={[s.badgeIcon, { backgroundColor: b.on ? withAlpha(ACCENT, 0.12) : CARD_HI }]}>
                    <Ionicons name={b.icon} size={22} color={b.on ? ACCENT : T3} />
                  </View>
                  <Text style={[s.badgeLabel, { color: b.on ? T2 : T3 }]}>{b.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        </>)}

        {showSettings && (<>
        {/* settings — 실제 구동 */}
        <View>
          <Text style={[s.sectionLabel, { paddingBottom: 12 }]}>설정</Text>
          <View style={[s.card, { overflow: 'hidden' }]}>
            {/* 1) 목표 설정 */}
            <Pressable onPress={() => toggleOpen('goal')} accessibilityRole="button" accessibilityLabel={`목표 설정, 주 ${goalDisplay}${unit}`} accessibilityState={{ expanded: open === 'goal' }} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="flag-outline" size={17} color={ACCENT} /></View>
              <Text style={s.settingLabel}>목표 설정</Text>
              <Text style={s.settingDetail}>{`주 ${goalDisplay}${unit}`}</Text>
              <Ionicons name={open === 'goal' ? 'chevron-up' : 'chevron-forward'} size={16} color={T3} />
            </Pressable>
            {open === 'goal' && (
              <View style={[s.panel, s.settingBorder]}>
                <Stepper value={goalDisplay} suffix={`${unit}/주`} onMinus={() => stepGoal(-1)} onPlus={() => stepGoal(1)} />
                <Text style={s.panelHint}>이번 주 <Text style={{ color: ACCENT }}>{weeklyPercent}%</Text> 달성</Text>
              </View>
            )}

            {/* 2) 알림 */}
            <Pressable onPress={() => toggleOpen('alerts')} accessibilityRole="button" accessibilityLabel={`알림, ${alerts.enabled ? '켜짐' : '꺼짐'}`} accessibilityState={{ expanded: open === 'alerts' }} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="notifications-outline" size={17} color={ACCENT} /></View>
              <Text style={s.settingLabel}>알림</Text>
              <Text style={s.settingDetail}>{alerts.enabled ? '켜짐' : '꺼짐'}</Text>
              <Ionicons name={open === 'alerts' ? 'chevron-up' : 'chevron-forward'} size={16} color={T3} />
            </Pressable>
            {open === 'alerts' && (
              <View style={[s.panel, s.settingBorder]}>
                <Pressable onPress={toggleAlerts} accessibilityRole="switch" accessibilityLabel="신발 교체 알림" accessibilityState={{ checked: alerts.enabled }} style={[s.toggle, alerts.enabled ? s.toggleOn : s.toggleOff]}>
                  <Ionicons name={alerts.enabled ? 'notifications' : 'notifications-off'} size={16} color={alerts.enabled ? T1 : T2} />
                  <Text style={[s.toggleTxt, { color: alerts.enabled ? T1 : T2 }]}>{alerts.enabled ? '신발 교체 알림 켜짐' : '신발 교체 알림 꺼짐'}</Text>
                </Pressable>
                {alerts.enabled && (
                  <>
                    <Stepper value={alerts.thresholdPct} suffix="% 사용 시" onMinus={() => stepThreshold(-1)} onPlus={() => stepThreshold(1)} />
                    <Text style={s.panelHint}>신발 수명의 <Text style={{ color: ACCENT }}>{alerts.thresholdPct}%</Text>를 쓰면 교체 알림을 보냅니다.</Text>
                  </>
                )}
              </View>
            )}

            {/* 2.5) 푸시 알림 — 종류별 토글 + 리마인더 시각(기존 in-app '알림'[배지 임계값]과 별개·공존) */}
            <Pressable onPress={() => toggleOpen('notif')} accessibilityRole="button" accessibilityLabel={`푸시 알림, ${notifOnCount}개 켜짐`} accessibilityState={{ expanded: open === 'notif' }} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]} testID="notif-row">
              <View style={s.settingIcon}><Ionicons name="notifications-circle-outline" size={17} color={ACCENT} /></View>
              <Text style={s.settingLabel}>푸시 알림</Text>
              <Text style={s.settingDetail} testID="notif-detail">{notifOnCount > 0 ? `${notifOnCount}개 켜짐` : '꺼짐'}</Text>
              <Ionicons name={open === 'notif' ? 'chevron-up' : 'chevron-forward'} size={16} color={T3} />
            </Pressable>
            {open === 'notif' && (
              <View style={[s.panel, s.settingBorder]} testID="notif-panel">
                <Text style={s.panelHint}>러닝화 교체·주간 목표·러닝 리마인더를 푸시로 받아요. (앱 내 신발 교체 배지와는 별개예요)</Text>
                <NotifToggle label="교체 임박 알림" value={notifSettings.shoeReplacement} onToggle={() => toggleNotif('shoeReplacement')} testID="notif-toggle-shoeReplacement" />
                <NotifToggle label="주간 목표 알림" value={notifSettings.weeklyGoal} onToggle={() => toggleNotif('weeklyGoal')} testID="notif-toggle-weeklyGoal" />
                <NotifToggle label="러닝 리마인더" value={notifSettings.runReminder} onToggle={() => toggleNotif('runReminder')} testID="notif-toggle-runReminder" />
                <Stepper value={notifSettings.reminderTime} suffix="리마인더 시각" onMinus={() => stepReminder(-1)} onPlus={() => stepReminder(1)} />
                {pushDenied && (
                  <Text style={s.notifDenied} testID="notif-perm-denied">기기 알림 권한이 꺼져 있어요. 설정에서 허용하면 푸시를 받을 수 있어요. (설정은 저장됐어요)</Text>
                )}
              </View>
            )}

            {/* 3) 단위 — 즉시 토글(전 화면 환산 반영) */}
            <Pressable onPress={() => onChangeUnit?.(unit === 'km' ? 'mi' : 'km')} accessibilityRole="button" accessibilityLabel={`단위, 현재 ${unitKorean(unit)}. 눌러서 전환`} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="speedometer-outline" size={17} color={ACCENT} /></View>
              <Text style={s.settingLabel}>단위</Text>
              <Text style={s.settingDetail}>{unitKorean(unit)}</Text>
              <Ionicons name="swap-horizontal" size={16} color={T3} />
            </Pressable>

            {/* 3.5) 체중 — 칼로리 추정용 */}
            <Pressable onPress={() => toggleOpen('weight')} accessibilityRole="button" accessibilityLabel={`체중, ${weightKg}kg`} accessibilityState={{ expanded: open === 'weight' }} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="body-outline" size={17} color={ACCENT} /></View>
              <Text style={s.settingLabel}>체중</Text>
              <Text style={s.settingDetail}>{weightKg}kg</Text>
              <Ionicons name={open === 'weight' ? 'chevron-up' : 'chevron-forward'} size={16} color={T3} />
            </Pressable>
            {open === 'weight' && (
              <View style={[s.panel, s.settingBorder]}>
                <Stepper value={weightKg} suffix="kg" onMinus={() => stepWeight(-1)} onPlus={() => stepWeight(1)} />
                <Text style={s.panelHint}>러닝 칼로리 추정에 사용돼요(가이드 값 — 정밀 측정 아님).</Text>
              </View>
            )}
          </View>
        </View>

        {/* 계정 · 클라우드 동기 — 로그인하면 신발/런/설정을 계정 클라우드와 무손실 동기 */}
        <View testID="cloud-section">
          <Text style={[s.sectionLabel, { paddingBottom: 12 }]}>계정 · 클라우드</Text>
          <View style={[s.card, { overflow: 'hidden' }]}>
            {signedIn ? (
              <>
                {/* 로그인 상태 — 계정 + 자동 동기 상태(수동 버튼 없음: 로그인·변경 시 자동 동기) */}
                <View style={[s.settingRow, s.settingBorder]} testID="cloud-account">
                  <View style={s.settingIcon}><Ionicons name="person-circle-outline" size={17} color={ACCENT} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.settingLabel} numberOfLines={1}>{accountLabel}</Text>
                    <Text style={s.cloudSub} testID="cloud-last-sync">{syncing ? '자동 동기 중…' : (lastSyncAt == null ? '클라우드 연결됨 · 자동 동기' : `${lastSyncLabel} · 자동`)}</Text>
                  </View>
                  <Ionicons name={syncing ? 'sync-outline' : 'cloud-done-outline'} size={18} color={GOOD} />
                </View>

                {/* 로그아웃 */}
                <Pressable onPress={handleSignOut} accessibilityRole="button" accessibilityLabel="로그아웃" style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
                  <View style={s.settingIcon}><Ionicons name="log-out-outline" size={17} color={DANGER} /></View>
                  <Text style={[s.settingLabel, { color: DANGER }]}>로그아웃</Text>
                  <Ionicons name="chevron-forward" size={16} color={T3} />
                </Pressable>
              </>
            ) : (
              <View style={s.cloudPad}>
                <Text style={s.cloudIntro}>로그인하면 신발·런·설정이 클라우드에 안전하게 백업되고 기기 간 동기됩니다.</Text>
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
                  iconNode={<Ionicons name="logo-google" size={17} color={signingIn ? T3 : T1} />}
                  style={s.cloudBtnGoogle}
                />
                <Pressable testID="cloud-signin-apple" onPress={() => handleSignIn('apple')} disabled={signingIn} accessibilityRole="button" accessibilityLabel="Apple로 로그인" accessibilityState={{ disabled: signingIn }} style={({ pressed }) => [s.cloudBtn, s.cloudBtnApple, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="logo-apple" size={18} color={T1} />
                  <Text style={s.cloudBtnTxt}>{signingIn ? '로그인 중…' : 'Apple로 계속'}</Text>
                </Pressable>
              </View>
            )}
            {/* 앱·기기 정보(읽기 전용) — 기존 '계정 설정' 행을 계정 섹션으로 통합(이름 중복 제거). */}
            <View style={[s.panel, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) }]} testID="app-info">
              <View style={s.acctRow}><Text style={s.acctK}>기기 ID</Text><Text style={s.acctV} numberOfLines={1}>{deviceId || '—'}</Text></View>
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
      </View>
      <TabBar active={3} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  card: { backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER },
  cardTitle: { color: T2, fontFamily: FONT, fontSize: 13.5, fontWeight: '500', marginBottom: 16 },
  sectionLabel: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16 },
  progressIcon: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: withAlpha(ACCENT, 0.12), alignItems: 'center', justifyContent: 'center' },
  progressTitle: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '700' },
  progressSub: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', marginTop: 3 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { color: T1, fontFamily: FONT, fontSize: 32, fontWeight: '500', letterSpacing: -0.8 },
  iconBtn: { width: 38, height: 38, borderRadius: RADIUS.pill, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, paddingTop: 4 },
  avatarRing: { padding: 2, borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.12) },
  avatarInner: { padding: 2.5, borderRadius: RADIUS.pill, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 50, height: 50, borderRadius: RADIUS.pill },
  avatarEdit: { position: 'absolute', right: -1, bottom: -1, width: 18, height: 18, borderRadius: RADIUS.pill, backgroundColor: T3, borderWidth: 2, borderColor: BG, alignItems: 'center', justifyContent: 'center' },
  name: { color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '500', letterSpacing: -0.5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, color: T1, fontFamily: FONT, fontSize: 22, fontWeight: '500', letterSpacing: -0.5, borderBottomWidth: 1, borderBottomColor: ACCENT, paddingVertical: 2, paddingHorizontal: 0 },
  nameSaveBtn: { width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  rankChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 },
  rankChipText: { fontFamily: FONT, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },
  titlePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: withAlpha(ACCENT, 0.12), borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3, maxWidth: '60%' },
  titlePillText: { color: ACCENT, fontFamily: FONT, fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  idStat: { fontFamily: FONT, color: T3, fontSize: 12, fontWeight: '600' },
  idStatNum: { fontFamily: DISPLAY, color: T1, fontSize: 13, fontWeight: '800' },
  since: { color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '600' },

  // 주간 목표 링 카드
  goalCard: { flexDirection: 'row', alignItems: 'center', gap: 18, padding: 18 },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringPct: { color: T1, fontFamily: DISPLAY, fontSize: 23, letterSpacing: 0.2 },
  ringPctU: { color: T2, fontFamily: FONT, fontSize: 11, fontWeight: '700' },
  goalLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '700' },
  goalNumRow: { alignItems: 'baseline', gap: 0, marginTop: 4 },
  goalDone: { color: T1, fontFamily: DISPLAY, fontSize: 26, letterSpacing: 0.3 },
  goalTotal: { color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '700' },
  keepGoing: { color: ACCENT, fontFamily: FONT, fontSize: 12.5, fontWeight: '700', marginTop: 6 },
  keepGoingDone: { color: GOOD },

  // 이번 주 스트릭 카드
  streakCard: { padding: 16 },
  streakHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  streakCount: { color: ACCENT, fontFamily: FONT, fontSize: 11.5, fontWeight: '700' },
  streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakDay: { alignItems: 'center', gap: 6 },
  streakDot: { width: 30, height: 30, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  streakDotDone: { backgroundColor: ACCENT },
  streakDotIdle: { backgroundColor: CARD_DIM },
  streakDotToday: { backgroundColor: CARD_DIM, borderWidth: 1.5, borderStyle: 'dashed', borderColor: T3 },
  streakDayLabel: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '600' },
  streakDayLabelToday: { color: T2 },

  // 누적/개인 기록·리캡 요약 스탯 줄은 StatGrid 프리미티브로 이전(셀·값·라벨 토큰을
  // 그쪽이 단일 소스로 책임 — 과거 statRow/statCell/statDivider/statValue/Unit/Label 제거).

  badge: { flex: 1, backgroundColor: CARD, borderRadius: RADIUS.lg, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER },
  badgeIcon: { width: 44, height: 44, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  badgeLabel: { fontFamily: FONT, fontSize: 10.5, fontWeight: '500', textAlign: 'center' },

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, paddingHorizontal: 16 },
  settingBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  settingIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: withAlpha(T1, 0.06), alignItems: 'center', justifyContent: 'center' },
  settingLabel: { flex: 1, color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '600' },
  settingDetail: { color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '600' },

  // expandable panels
  panel: { paddingHorizontal: 18, paddingVertical: 16, gap: 14, backgroundColor: withAlpha(T1, 0.02) },
  panelHint: { color: T3, fontFamily: FONT, fontSize: 12.5, lineHeight: 18 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  stepBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center' },
  stepVal: { flex: 1, alignItems: 'center' },
  stepNum: { color: T1, fontFamily: DISPLAY, fontSize: 30, letterSpacing: 0.3 },
  stepUnit: { color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '600', marginTop: 2 },

  notifDenied: { color: WARN, fontFamily: FONT, fontSize: 12.5, lineHeight: 18 },

  // ── 돌아보기(리캡) ───────────────────────────────────────────────────────────
  recapHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, paddingHorizontal: 4 },
  // 주/월 토글은 SegmentedControl(accentSolid, block=false)로 이전(과거 recapToggle/
  // recapTab/recapTabOn/recapTabTxt/recapTabTxtOn 제거, 시각 동등).
  recapTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  recapPeriod: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '700' },
  recapShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.12) },
  recapShareTxt: { color: ACCENT, fontFamily: FONT, fontSize: 12.5, fontWeight: '700' },
  recapEmpty: { alignItems: 'center', paddingVertical: 22 },
  recapEmptyTxt: { color: T3, fontFamily: FONT, fontSize: 13.5, fontWeight: '600', lineHeight: 20, textAlign: 'center' },
  recapMostWorn: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP },
  recapMostWornTxt: { flex: 1, color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '600' },
  recapPrBox: { marginTop: 14, gap: 2 },
  recapPrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  recapPrLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600' },
  recapPrValue: { color: ACCENT, fontFamily: DISPLAY, fontSize: 16, letterSpacing: 0.2 },
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },

  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 14 },
  toggleOn: { backgroundColor: ACCENT },
  toggleOff: { backgroundColor: CARD_HI },
  toggleTxt: { fontFamily: FONT, fontSize: 14.5, fontWeight: '600' },

  acctRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  acctK: { color: T3, fontFamily: FONT, fontSize: 13.5, fontWeight: '500' },
  acctV: { flex: 1, textAlign: 'right', color: T2, fontFamily: FONT, fontSize: 13.5, fontWeight: '500' },

  // 데이터 가져오기 패널 — dataInput/dataBtn/dataBtnTxt/dataMsg(사각 radius:14 ACCENT
  // 버튼 포함)은 미사용 dead 스타일이라 제거(버튼 radius 혼재 정리). 클라우드 메시지
  // 톤(dataMsgOk/Err)만 cloud-msg 가 계속 참조한다.
  dataMsgOk: { color: GOOD },
  dataMsgErr: { color: DANGER },

  // 계정 · 클라우드 동기
  cloudSub: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', marginTop: 2 },
  cloudPad: { padding: 16, gap: 12 },
  cloudIntro: { color: T3, fontFamily: FONT, fontSize: 12.5, lineHeight: 18 },
  // 브랜드 로그인 버튼(카카오/네이버/애플) 공용 박스 — 모서리는 Google(단일 Button=
  // RADIUS.btn)과 맞춰 통일. Google 은 단일 Button 프리미티브로 라우팅(아래 cloudBtnGoogle).
  cloudBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: RADIUS.btn },
  // Google = 앱 accent CTA → 단일 Button(그라데이션/글로우/RADIUS.btn). 여기선 높이만.
  cloudBtnGoogle: { height: 48 },
  cloudBtnApple: { backgroundColor: CARD_HI },
  cloudBtnKakao: { backgroundColor: KAKAO_YELLOW },
  cloudBtnNaver: { backgroundColor: NAVER_GREEN },
  brandMark: { fontFamily: DISPLAY, fontSize: 17, fontWeight: '800' },
  cloudBtnTxt: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600' },
  cloudMsg: { fontFamily: FONT, fontSize: 12.5, fontWeight: '600', lineHeight: 18, paddingHorizontal: 16, paddingBottom: 14 },
});
