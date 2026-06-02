// ============================================================================
// ChallengesSection.tsx — 개인 챌린지 섹션(프로필) (Slice 4)
// 개인(혼자) 전용 챌린지를 만들고 진행률을 본다. 계정/서버 없이 동작하며, 진행률은
// lib/challenges 의 순수 함수(challengeProgress)로 런 기록에서 파생한다. 영속(신규
// AsyncStorage 키)·런 매핑은 App 이 소유하고, 이 컴포넌트는 표시 + 생성/삭제 콜백만
// 담당한다(백업 UI 와 같은 패턴). 진행률 링은 기존 Ring primitive 를 재사용한다.
// 토큰만 — 네이티브 0.
// ============================================================================
import React, {useState} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {CARD, CARD_HI, ACCENT, GOOD, T1, T2, T3, SEP, FONT, DISPLAY, RADIUS, withAlpha} from './theme';
import {Ring, Pill} from './primitives';
import {Challenge, ChallengeRun, ChallengeKind, challengeProgress} from './lib/challenges';

// 챌린지 한 줄의 사람이 읽는 라벨(순수 카피 — 토큰 아님).
export function challengeLabel(ch: Challenge): string {
  if (ch.kind === 'streak') return `${ch.targetDays ?? 0}일 연속 달리기`;
  return `${ch.targetKm ?? 0}km 도전`;
}

// 'YYYY-MM-DD' 에 n일을 더한 날짜(로컬). 생성 시 종료일 계산에만 쓴다(DST 안전).
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

const DURATIONS = [7, 30] as const;
const KM_STEP = 10;
const DAY_STEP = 1;
const MIN_TARGET = 1;

function ChallengeCard({
  ch,
  runs,
  onDelete,
}: {
  ch: Challenge;
  runs: ChallengeRun[];
  onDelete?: (id: string) => void;
}) {
  const p = challengeProgress(ch, runs);
  const pctLabel = `${Math.round(p.pct * 100)}%`;
  const label = challengeLabel(ch);
  const unit = ch.kind === 'streak' ? '일' : 'km';
  // 거리는 소수1 표기(2자리 흔들림 방지), 스트릭은 정수.
  const cur = ch.kind === 'streak' ? p.current : Math.round(p.current * 10) / 10;

  return (
    <View style={[s.card, p.completed && s.cardDone]} testID={`challenge-${ch.id}`}>
      <Ring size={64} stroke={7} progress={p.pct} color={p.completed ? GOOD : ACCENT}>
        <Text style={s.ringPct} testID={`challenge-pct-${ch.id}`}>
          {pctLabel}
        </Text>
      </Ring>
      <View style={{flex: 1, minWidth: 0}}>
        <View style={s.titleRow}>
          <Text style={s.title} numberOfLines={1}>
            {label}
          </Text>
          {p.completed && (
            <Pill tone="good" icon="trophy" label="달성!" testID={`challenge-badge-${ch.id}`} />
          )}
        </View>
        <Text style={s.progressTxt}>
          <Text style={s.progressCur}>{cur}</Text>
          <Text style={s.progressTot}>
            {' '}
            / {ch.kind === 'streak' ? ch.targetDays ?? 0 : ch.targetKm ?? 0} {unit}
          </Text>
        </Text>
        <Text style={s.period}>
          {ch.startDate} ~ {ch.endDate}
        </Text>
      </View>
      <Pressable
        onPress={() => onDelete?.(ch.id)}
        accessibilityRole="button"
        accessibilityLabel={`챌린지 삭제 ${label}`}
        hitSlop={8}
        style={({pressed}) => [s.del, pressed && {opacity: 0.6}]}>
        <Ionicons name="close" size={16} color={T3} />
      </Pressable>
    </View>
  );
}

export default function ChallengesSection({
  challenges = [],
  runs = [],
  onCreate,
  onDelete,
  today = '',
}: {
  challenges?: Challenge[];
  runs?: ChallengeRun[];
  onCreate?: (c: Challenge) => void;
  onDelete?: (id: string) => void;
  // 생성 시 시작일 기준(미주입 시 실기기 오늘). 테스트 결정성을 위해 주입 가능.
  today?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ChallengeKind>('distance');
  const [targetKm, setTargetKm] = useState(50);
  const [targetDays, setTargetDays] = useState(5);
  const [durationDays, setDurationDays] = useState<number>(30);

  const startDate = (today || isoToday()).slice(0, 10);
  const endDate = addDaysISO(startDate, Math.max(1, durationDays) - 1);

  const create = () => {
    const isStreak = kind === 'streak';
    const target = isStreak ? targetDays : targetKm;
    const ch: Challenge = {
      id: `ch_${kind}_${startDate}_${durationDays}_${target}`,
      kind,
      startDate,
      endDate,
      ...(isStreak ? {targetDays} : {targetKm}),
    };
    onCreate?.(ch);
    setOpen(false);
  };

  return (
    <View testID="challenges-section">
      <View style={s.headerRow}>
        <Text style={s.sectionLabel}>개인 챌린지</Text>
        <Pressable
          onPress={() => setOpen(o => !o)}
          accessibilityRole="button"
          accessibilityLabel="새 챌린지"
          accessibilityState={{expanded: open}}
          hitSlop={8}
          style={({pressed}) => [s.addBtn, pressed && {opacity: 0.7}]}>
          <Ionicons name={open ? 'chevron-up' : 'add'} size={16} color={ACCENT} />
          <Text style={s.addBtnTxt}>{open ? '닫기' : '새 챌린지'}</Text>
        </Pressable>
      </View>

      {open && (
        <View style={s.form} testID="challenge-form">
          {/* 종류 */}
          <View style={s.segRow}>
            {(['distance', 'streak'] as ChallengeKind[]).map(k => {
              const on = kind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  accessibilityRole="button"
                  accessibilityLabel={k === 'distance' ? '거리 챌린지' : '스트릭 챌린지'}
                  accessibilityState={{selected: on}}
                  style={[s.seg, on && s.segOn]}>
                  <Text style={[s.segTxt, on && s.segTxtOn]}>{k === 'distance' ? '거리' : '연속'}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* 목표 스테퍼 */}
          {kind === 'distance' ? (
            <Stepper
              value={`${targetKm}`}
              suffix="km"
              onMinus={() => setTargetKm(v => Math.max(MIN_TARGET, v - KM_STEP))}
              onPlus={() => setTargetKm(v => v + KM_STEP)}
            />
          ) : (
            <Stepper
              value={`${targetDays}`}
              suffix="일 연속"
              onMinus={() => setTargetDays(v => Math.max(MIN_TARGET, v - DAY_STEP))}
              onPlus={() => setTargetDays(v => v + DAY_STEP)}
            />
          )}

          {/* 기간 */}
          <View style={s.segRow}>
            {DURATIONS.map(d => {
              const on = durationDays === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDurationDays(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`${d}일 기간`}
                  accessibilityState={{selected: on}}
                  style={[s.seg, on && s.segOn]}>
                  <Text style={[s.segTxt, on && s.segTxtOn]}>{d}일</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={create}
            accessibilityRole="button"
            accessibilityLabel="챌린지 만들기"
            style={({pressed}) => [s.createBtn, pressed && {opacity: 0.85}]}>
            <Ionicons name="flag" size={16} color={T1} />
            <Text style={s.createBtnTxt}>챌린지 만들기</Text>
          </Pressable>
        </View>
      )}

      {challenges.length === 0 ? (
        <Text style={s.empty} testID="challenges-empty">
          아직 챌린지가 없어요. 새 챌린지로 나만의 목표를 세워 계속 달려보세요.
        </Text>
      ) : (
        <View style={{gap: 10}}>
          {challenges.map(ch => (
            <ChallengeCard key={ch.id} ch={ch} runs={runs} onDelete={onDelete} />
          ))}
        </View>
      )}
    </View>
  );
}

// −/＋ 스테퍼(목표 거리·연속일 공용).
function Stepper({
  value,
  suffix,
  onMinus,
  onPlus,
}: {
  value: string;
  suffix: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={s.stepper}>
      <Pressable
        onPress={onMinus}
        accessibilityRole="button"
        accessibilityLabel={`${suffix} 줄이기`}
        style={({pressed}) => [s.stepBtn, pressed && {backgroundColor: CARD}]}>
        <Ionicons name="remove" size={18} color={T1} />
      </Pressable>
      <View style={s.stepVal} accessible accessibilityLabel={`${value} ${suffix}`}>
        <Text style={s.stepNum}>{value}</Text>
        <Text style={s.stepUnit}>{suffix}</Text>
      </View>
      <Pressable
        onPress={onPlus}
        accessibilityRole="button"
        accessibilityLabel={`${suffix} 늘리기`}
        style={({pressed}) => [s.stepBtn, pressed && {backgroundColor: CARD}]}>
        <Ionicons name="add" size={18} color={T1} />
      </Pressable>
    </View>
  );
}

// 실기기 오늘('YYYY-MM-DD'). today prop 미주입 시에만 호출(테스트는 today 를 주입).
function isoToday(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

const s = StyleSheet.create({
  headerRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 12},
  sectionLabel: {color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2},
  addBtn: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.14)},
  addBtnTxt: {color: ACCENT, fontFamily: FONT, fontSize: 12.5, fontWeight: '700'},

  empty: {color: T3, fontFamily: FONT, fontSize: 13, lineHeight: 19, paddingHorizontal: 4},

  card: {flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: CARD, borderRadius: RADIUS.xl, padding: 16},
  cardDone: {borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(GOOD, 0.5)},
  ringPct: {color: T1, fontFamily: DISPLAY, fontSize: 14, letterSpacing: 0.2},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  title: {flex: 1, color: T1, fontFamily: FONT, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.2},
  progressTxt: {marginTop: 4},
  progressCur: {color: T1, fontFamily: DISPLAY, fontSize: 18, letterSpacing: 0.2},
  progressTot: {color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '700'},
  period: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500', marginTop: 4},
  del: {width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: CARD_HI},

  form: {backgroundColor: CARD, borderRadius: RADIUS.xl, padding: 16, gap: 14, marginBottom: 12},
  segRow: {flexDirection: 'row', gap: 8},
  seg: {flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  segOn: {backgroundColor: withAlpha(ACCENT, 0.16), borderColor: ACCENT},
  segTxt: {color: T2, fontFamily: FONT, fontSize: 13.5, fontWeight: '600'},
  segTxtOn: {color: ACCENT, fontWeight: '700'},
  stepper: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14},
  stepBtn: {width: 44, height: 44, borderRadius: 14, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},
  stepVal: {flex: 1, alignItems: 'center'},
  stepNum: {color: T1, fontFamily: DISPLAY, fontSize: 26, letterSpacing: 0.3},
  stepUnit: {color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '600', marginTop: 2},
  createBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: ACCENT},
  createBtnTxt: {color: T1, fontFamily: FONT, fontSize: 14.5, fontWeight: '700'},
});
