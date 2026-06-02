// ============================================================================
// ProfileScreen.rn.tsx — 프로필: identity, lifetime stats, achievements, settings
// 설정 4행은 실제로 구동된다(하드코딩 '주5회'/'켜짐'/'킬로미터' 제거):
//   · 목표 설정 — 주간 목표 거리(km 표준) 스테퍼 + 달성률
//   · 알림     — 신발 교체 알림 on/off + 임계값(수명 사용률 %)
//   · 단위     — km ↔ mi 토글(전 화면 즉시 환산 반영)
//   · 계정 설정 — 기기/가입/버전 정보
// 값은 App이 소유(영속은 lib/settings)하고, 이 화면은 표시 + 변경 콜백만 담당한다.
// ============================================================================
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { BG, CARD, CARD_DIM, CARD_HI, ACCENT, GOOD, T1, T2, T3, SEP, FONT, DISPLAY, withAlpha } from './theme';
import { TabBar, Ring, Pill, SectionTitle } from './primitives';
import { Unit, unitKorean, displayNum, displayToKm } from './lib/units';
import {
  AlertSettings, GOAL_STEP_DISPLAY, THRESHOLD_STEP,
  MIN_THRESHOLD_PCT, MAX_THRESHOLD_PCT, DEFAULT_SETTINGS, DEFAULT_ALERTS,
} from './lib/settings';

export type Profile = { name: string; since: string; totalKm: number; totalRuns: number; totalTime: string; level: string };
export type Badge = { icon: string; label: string; on: boolean };
// 개인 기록(PR) 카드 한 칸. value/unit은 App이 표시 단위로 환산·포맷해 주입한다
// (기록 없음은 value='--'). 화면은 표시만 담당한다.
export type PersonalRecord = { icon: string; label: string; value: string; unit: string };

const DEFAULT_PROFILE: Profile = { name: '러너', since: '', totalKm: 0, totalRuns: 0, totalTime: '0', level: '러닝 레벨 1' };
const APP_VERSION = '0.0.1';

// −/＋ 스테퍼(목표 거리·알림 임계값 공용). 모듈 스코프에 둬 매 렌더 재생성을 피한다.
function Stepper({ value, suffix, onMinus, onPlus }: { value: number | string; suffix: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={s.stepper}>
      <Pressable onPress={onMinus} style={({ pressed }) => [s.stepBtn, pressed && { backgroundColor: CARD }]}>
        <Ionicons name="remove" size={20} color={T1} />
      </Pressable>
      <View style={s.stepVal}>
        <Text style={s.stepNum}>{value}</Text>
        <Text style={s.stepUnit}>{suffix}</Text>
      </View>
      <Pressable onPress={onPlus} style={({ pressed }) => [s.stepBtn, pressed && { backgroundColor: CARD }]}>
        <Ionicons name="add" size={20} color={T1} />
      </Pressable>
    </View>
  );
}

export default function ProfileScreen({
  profile = DEFAULT_PROFILE, badges = [], records = [], onTab,
  unit = 'km', onChangeUnit,
  goalWeeklyKm = DEFAULT_SETTINGS.goalWeeklyKm, weeklyPercent = 0, weeklyDoneKm = 0, onChangeGoal,
  streakDays = 0, weekDays = [], weekTodayIdx = -1,
  alerts = { ...DEFAULT_ALERTS }, onChangeAlerts,
  deviceId = '',
}: {
  profile?: Profile;
  badges?: Badge[];
  records?: PersonalRecord[];
  onTab?: (i: number) => void;
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
}) {
  // 어떤 설정 행이 펼쳐졌는지(단위는 패널 없이 즉시 토글). 한 번에 하나만 펼친다.
  const [open, setOpen] = useState<null | 'goal' | 'alerts' | 'account'>(null);
  const toggleOpen = (k: 'goal' | 'alerts' | 'account') => setOpen((o) => (o === k ? null : k));

  // 목표는 km로 저장하되 화면은 표시 단위(km|mi)로 보여주고 스텝도 표시 단위로 움직인다.
  const goalDisplay = displayNum(goalWeeklyKm, unit, 0);
  const stepGoal = (dir: 1 | -1) => {
    const next = goalDisplay + dir * GOAL_STEP_DISPLAY;   // 표시 단위 기준 증감
    onChangeGoal?.(displayToKm(next, unit));               // km로 되돌려 저장(클램프는 App)
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

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: 60, paddingHorizontal: 18, paddingBottom: 8, gap: 16 }}>
        {/* header */}
        <View style={s.headerRow}>
          <Text style={s.title}>프로필</Text>
          <Pressable style={s.iconBtn}><Ionicons name="settings-outline" size={19} color={T2} /></Pressable>
        </View>

        {/* identity */}
        <View style={s.identity}>
          <View style={s.avatarRing}>
            <View style={s.avatarInner}>
              <Ionicons name="person" size={30} color={T3} />
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name}>{profile.name}</Text>
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
        <View>
          <Text style={[s.sectionLabel, { paddingBottom: 12 }]}>설정</Text>
          <View style={[s.card, { overflow: 'hidden' }]}>
            {/* 1) 목표 설정 */}
            <Pressable onPress={() => toggleOpen('goal')} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
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
            <Pressable onPress={() => toggleOpen('alerts')} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="notifications-outline" size={17} color={ACCENT} /></View>
              <Text style={s.settingLabel}>알림</Text>
              <Text style={s.settingDetail}>{alerts.enabled ? '켜짐' : '꺼짐'}</Text>
              <Ionicons name={open === 'alerts' ? 'chevron-up' : 'chevron-forward'} size={16} color={T3} />
            </Pressable>
            {open === 'alerts' && (
              <View style={[s.panel, s.settingBorder]}>
                <Pressable onPress={toggleAlerts} style={[s.toggle, alerts.enabled ? s.toggleOn : s.toggleOff]}>
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
            <Pressable onPress={() => onChangeUnit?.(unit === 'km' ? 'mi' : 'km')} style={({ pressed }) => [s.settingRow, s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
              <View style={s.settingIcon}><Ionicons name="speedometer-outline" size={17} color={ACCENT} /></View>
              <Text style={s.settingLabel}>단위</Text>
              <Text style={s.settingDetail}>{unitKorean(unit)}</Text>
              <Ionicons name="swap-horizontal" size={16} color={T3} />
            </Pressable>

            {/* 4) 계정 설정 */}
            <Pressable onPress={() => toggleOpen('account')} style={({ pressed }) => [s.settingRow, pressed && { backgroundColor: CARD_HI }]}>
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
  avatarInner: { padding: 2.5, borderRadius: 999, backgroundColor: BG },
  name: { color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '500', letterSpacing: -0.5 },
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
});
