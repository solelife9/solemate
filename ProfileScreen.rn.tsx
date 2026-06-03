// ============================================================================
// ProfileScreen.rn.tsx — 프로필: identity, lifetime stats, achievements, settings
// 설정 4행은 실제로 구동된다(하드코딩 '주5회'/'켜짐'/'킬로미터' 제거):
//   · 목표 설정 — 주간 목표 거리(km 표준) 스테퍼 + 달성률
//   · 알림     — 신발 교체 알림 on/off + 임계값(수명 사용률 %)
//   · 단위     — km ↔ mi 토글(전 화면 즉시 환산 반영)
//   · 계정 설정 — 기기/가입/버전 정보
// 값은 App이 소유(영속은 lib/settings)하고, 이 화면은 표시 + 변경 콜백만 담당한다.
// ============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { BG, CARD, CARD_DIM, CARD_HI, ACCENT, GOOD, DANGER, T1, T2, T3, SEP, FONT, DISPLAY, withAlpha, KAKAO_YELLOW, KAKAO_LABEL, NAVER_GREEN, NAVER_LABEL } from './theme';
import { TabBar, Ring, Pill, SectionTitle } from './primitives';
import { Unit, unitKorean, displayNum, displayToKm } from './lib/units';
import {
  AlertSettings, GOAL_STEP_DISPLAY, THRESHOLD_STEP,
  MIN_THRESHOLD_PCT, MAX_THRESHOLD_PCT, DEFAULT_SETTINGS, DEFAULT_ALERTS,
  WEIGHT_STEP, MIN_WEIGHT_KG, MAX_WEIGHT_KG,
} from './lib/settings';
import { BackupPayload, BackupV1 } from './lib/backup';
import { Challenge, ChallengeRun } from './lib/challenges';
import { mergeCloudData, nextAuthState, AuthState } from './lib/cloudSync';
import type { CloudPort, CloudProvider, CloudUser } from './lib/cloudPort';

export type Profile = { name: string; since: string; totalKm: number; totalRuns: number; totalTime: string; level: string };
export type Badge = { icon: string; label: string; on: boolean };
// 개인 기록(PR) 카드 한 칸. value/unit은 App이 표시 단위로 환산·포맷해 주입한다
// (기록 없음은 value='--'). 화면은 표시만 담당한다.
export type PersonalRecord = { icon: string; label: string; value: string; unit: string };

const DEFAULT_PROFILE: Profile = { name: '러너', since: '', totalKm: 0, totalRuns: 0, totalTime: '0', level: '러닝 레벨 1' };
const APP_VERSION = '0.0.1';

// 마지막 동기 시각을 HH:MM 로 짧게 포맷한다(상세 행 detail 용). null 이면 호출부가
// '아직 동기 안 함' 카피로 분기한다.
function fmtSyncTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
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
  deviceId = '',
  backupData = { shoes: [], runs: [], settings: {} },
  cloudPort, onCloudMerged, cloudClock = () => Date.now(),
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
  initialOpen?: 'goal' | 'weight' | 'alerts' | 'account' | 'import' | null;
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
}) {
  // 어떤 설정 행이 펼쳐졌는지(단위는 패널 없이 즉시 토글). 한 번에 하나만 펼친다.
  const [open, setOpen] = useState<null | 'goal' | 'weight' | 'alerts' | 'account' | 'import'>(null);
  const toggleOpen = (k: 'goal' | 'weight' | 'alerts' | 'account' | 'import') => setOpen((o) => (o === k ? null : k));

  // 헤더 설정 버튼 → '설정' 섹션으로 스크롤(무반응이던 버튼에 동작 부여). 섹션 위치는
  // onLayout 으로 측정한다(콘텐츠 컨테이너 기준 y).
  const scrollRef = useRef<ScrollView>(null);
  const [settingsY, setSettingsY] = useState(0);
  const scrollToSettings = () => scrollRef.current?.scrollTo({ y: Math.max(0, settingsY - 8), animated: true });

  // 홈 주간목표 탭으로 진입 시: 해당 설정 패널을 펼치고 설정 섹션으로 스크롤한다(한 번만 소비).
  useEffect(() => {
    if (!initialOpen) return;
    setOpen(initialOpen);
    const t = setTimeout(scrollToSettings, 250);
    onConsumeInitialOpen?.();
    return () => clearTimeout(t);
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
  const dataSig = JSON.stringify(backupData);
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
        {/* header */}
        <View style={s.headerRow}>
          <Text style={s.title}>프로필</Text>
          <Pressable onPress={scrollToSettings} accessibilityRole="button" accessibilityLabel="설정으로 이동" style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: CARD }]}><Ionicons name="settings-outline" size={19} color={T2} /></Pressable>
        </View>

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
              <View style={s.levelChip}><Text style={s.levelChipText}>{profile.level}</Text></View>
              {!!profile.since && <Text style={s.since}>{profile.since}</Text>}
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
          <View style={s.statRow}>
            {[
              { v: profile.totalKm.toLocaleString(), u: unit, l: '총 거리' },
              { v: String(profile.totalRuns), u: '회', l: '총 러닝' },
              { v: profile.totalTime, u: 'h', l: '총 시간' },
            ].map((x, i) => (
              <View key={i} style={[s.statCell, i > 0 && s.statDivider]}>
                <Text style={s.statValue}>{x.v}<Text style={s.statUnit}>{x.u}</Text></Text>
                <Text style={s.statLabel}>{x.l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* personal records (PR) — 1km 페이스 · 5km 기록 · 최장 거리 */}
        {records.length > 0 && (
          <View style={[s.card, { padding: 22 }]}>
            <Text style={s.cardTitle}>개인 기록</Text>
            <View style={s.statRow}>
              {records.map((r, i) => (
                <View key={i} style={[s.statCell, i > 0 && s.statDivider]}>
                  <Ionicons name={r.icon} size={18} color={ACCENT} style={{ marginBottom: 6 }} />
                  <Text style={s.statValue}>{r.value}{!!r.unit && <Text style={s.statUnit}>{r.unit}</Text>}</Text>
                  <Text style={s.statLabel}>{r.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

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

        {/* settings — 실제 구동 */}
        <View onLayout={(e) => setSettingsY(e.nativeEvent.layout.y)}>
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

            {/* 4) 계정 설정 */}
            <Pressable onPress={() => toggleOpen('account')} accessibilityRole="button" accessibilityLabel="계정 설정" accessibilityState={{ expanded: open === 'account' }} style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="settings-outline" size={17} color={ACCENT} /></View>
              <Text style={s.settingLabel}>계정 설정</Text>
              <Ionicons name={open === 'account' ? 'chevron-up' : 'chevron-forward'} size={16} color={T3} />
            </Pressable>
            {open === 'account' && (
              <View style={s.panel}>
                <View style={s.acctRow}><Text style={s.acctK}>기기 ID</Text><Text style={s.acctV} numberOfLines={1}>{deviceId || '—'}</Text></View>
                <View style={s.acctRow}><Text style={s.acctK}>가입</Text><Text style={s.acctV}>{profile.since || '기록 없음'}</Text></View>
                <View style={s.acctRow}><Text style={s.acctK}>버전</Text><Text style={s.acctV}>{APP_VERSION}</Text></View>
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
                <Pressable testID="cloud-signin-google" onPress={() => handleSignIn('google')} disabled={signingIn} accessibilityRole="button" accessibilityLabel="Google로 로그인" accessibilityState={{ disabled: signingIn }} style={({ pressed }) => [s.cloudBtn, s.cloudBtnGoogle, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="logo-google" size={17} color={T1} />
                  <Text style={s.cloudBtnTxt}>{signingIn ? '로그인 중…' : 'Google로 계속'}</Text>
                </Pressable>
                <Pressable testID="cloud-signin-apple" onPress={() => handleSignIn('apple')} disabled={signingIn} accessibilityRole="button" accessibilityLabel="Apple로 로그인" accessibilityState={{ disabled: signingIn }} style={({ pressed }) => [s.cloudBtn, s.cloudBtnApple, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="logo-apple" size={18} color={T1} />
                  <Text style={s.cloudBtnTxt}>{signingIn ? '로그인 중…' : 'Apple로 계속'}</Text>
                </Pressable>
              </View>
            )}
            {cloudMsg && (
              <Text testID="cloud-msg" style={[s.cloudMsg, cloudMsg.ok ? s.dataMsgOk : s.dataMsgErr]}>{cloudMsg.text}</Text>
            )}
          </View>
        </View>

      </ScrollView>
      <TabBar active={3} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  card: { backgroundColor: CARD, borderRadius: 22 },
  cardTitle: { color: T2, fontFamily: FONT, fontSize: 13.5, fontWeight: '500', marginBottom: 16 },
  sectionLabel: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 4 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { color: T1, fontFamily: FONT, fontSize: 32, fontWeight: '500', letterSpacing: -0.8 },
  iconBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, paddingTop: 4 },
  avatarRing: { padding: 3, borderRadius: 999, backgroundColor: ACCENT },
  avatarInner: { padding: 2.5, borderRadius: 999, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 50, height: 50, borderRadius: 999 },
  avatarEdit: { position: 'absolute', right: -1, bottom: -1, width: 18, height: 18, borderRadius: 999, backgroundColor: ACCENT, borderWidth: 2, borderColor: BG, alignItems: 'center', justifyContent: 'center' },
  name: { color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '500', letterSpacing: -0.5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, color: T1, fontFamily: FONT, fontSize: 22, fontWeight: '500', letterSpacing: -0.5, borderBottomWidth: 1, borderBottomColor: ACCENT, paddingVertical: 2, paddingHorizontal: 0 },
  nameSaveBtn: { width: 34, height: 34, borderRadius: 999, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  levelChip: { backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2 },
  levelChipText: { color: ACCENT, fontFamily: FONT, fontSize: 11.5, fontWeight: '500' },
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
  streakDot: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  streakDotDone: { backgroundColor: ACCENT },
  streakDotIdle: { backgroundColor: CARD_DIM },
  streakDotToday: { backgroundColor: CARD_DIM, borderWidth: 1.5, borderStyle: 'dashed', borderColor: T3 },
  streakDayLabel: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '600' },
  streakDayLabelToday: { color: T2 },

  statRow: { flexDirection: 'row' },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP },
  statValue: { color: T1, fontFamily: DISPLAY, fontSize: 26, letterSpacing: 0.3 },
  statUnit: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600' },
  statLabel: { color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '600', marginTop: 4 },

  badge: { flex: 1, backgroundColor: CARD, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 8 },
  badgeIcon: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badgeLabel: { fontFamily: FONT, fontSize: 10.5, fontWeight: '500', textAlign: 'center' },

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, paddingHorizontal: 16 },
  settingBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  settingIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: withAlpha(ACCENT, 0.13), alignItems: 'center', justifyContent: 'center' },
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

  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 14 },
  toggleOn: { backgroundColor: ACCENT },
  toggleOff: { backgroundColor: CARD_HI },
  toggleTxt: { fontFamily: FONT, fontSize: 14.5, fontWeight: '600' },

  acctRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  acctK: { color: T3, fontFamily: FONT, fontSize: 13.5, fontWeight: '500' },
  acctV: { flex: 1, textAlign: 'right', color: T2, fontFamily: FONT, fontSize: 13.5, fontWeight: '500' },

  // 데이터 가져오기 패널
  dataInput: { minHeight: 84, maxHeight: 160, borderRadius: 12, backgroundColor: CARD_HI, color: T1, fontFamily: FONT, fontSize: 13, padding: 12, textAlignVertical: 'top' },
  dataBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 14, backgroundColor: ACCENT },
  dataBtnTxt: { color: T1, fontFamily: FONT, fontSize: 14.5, fontWeight: '600' },
  dataMsg: { fontFamily: FONT, fontSize: 12.5, fontWeight: '600', lineHeight: 18 },
  dataMsgOk: { color: GOOD },
  dataMsgErr: { color: DANGER },

  // 계정 · 클라우드 동기
  cloudSub: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', marginTop: 2 },
  cloudPad: { padding: 16, gap: 12 },
  cloudIntro: { color: T3, fontFamily: FONT, fontSize: 12.5, lineHeight: 18 },
  cloudBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14 },
  cloudBtnGoogle: { backgroundColor: ACCENT },
  cloudBtnApple: { backgroundColor: CARD_HI },
  cloudBtnKakao: { backgroundColor: KAKAO_YELLOW },
  cloudBtnNaver: { backgroundColor: NAVER_GREEN },
  brandMark: { fontFamily: DISPLAY, fontSize: 17, fontWeight: '800' },
  cloudBtnTxt: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600' },
  cloudMsg: { fontFamily: FONT, fontSize: 12.5, fontWeight: '600', lineHeight: 18, paddingHorizontal: 16, paddingBottom: 14 },
});
