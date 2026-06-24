// ============================================================================
// ChallengesSection.tsx — 스마트 챌린지 카드(마이 탭) (Slice 4 → 스마트 전용·상시)
// 개인(직접 만드는) 챌린지는 제거하고, generateSmartChallenge 가 런/신발 데이터에서
// 결정적으로 추천하는 '스마트 챌린지' 한 장을 라벨 + 진행률과 함께 항상 보여준다(수락 단계
// 없음). 사용자는 우상단 수정 버튼으로 '주간 목표 거리(km)'만 조정할 수 있고, 그 값은 App 이
// 챌린지 id 별로 영속한다(주가 바뀌면 새 추천으로 복귀). 진행률은 lib 순수 함수로 파생(영속
// 금지). 진행률 링은 Ring primitive 재사용. 토큰만.
// ============================================================================
import React, {useState} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {CARD, CARD_HI, ACCENT, GOOD, T1, T2, T3, SEP, FONT, DISPLAY, RADIUS, withAlpha} from './theme';
import {Ring, Pill} from './primitives';
import {ChallengeRun, ChallengeProgressResult} from './lib/challenges';
import {
  ExtChallenge,
  ExtRun,
  ExtShoe,
  challengeExtProgress,
  generateSmartChallenge,
} from './lib/progression/challengesExt';

// ── 확장 챌린지(monthly/shoe/rotation/smart) 카피 헬퍼 ─────────────────────────
// 표시명: 구체적 shoeId 면 등록 신발 이름, '새 신발'(new/newShoe)이면 일반 라벨.
function resolveShoeName(ch: ExtChallenge, shoes: ExtShoe[]): string {
  if (ch.shoeId && ch.shoeId !== 'new') {
    const f = (shoes || []).find(s => s && s.id === ch.shoeId);
    if (f) return f.name || '신발';
  }
  return '새 신발';
}

// 확장 챌린지 한 줄 라벨(순수 카피). kind 별로 사람이 읽는 목표를 만든다.
export function extChallengeLabel(ch: ExtChallenge, shoes: ExtShoe[] = []): string {
  switch (ch.kind) {
    case 'weekly':
      return ch.metric === 'count'
        ? `이번 주 ${ch.targetRuns ?? 0}회 달리기`
        : `이번 주 ${ch.targetKm ?? 0}km`;
    case 'shoe':
      return `${resolveShoeName(ch, shoes)}로 ${ch.targetKm ?? 0}km`;
    case 'rotation':
      return ch.rotationMode === 'balance'
        ? '신발 고르게 신기'
        : `이번 주 ${ch.targetShoes ?? 2}켤레 로테이션`;
    default:
      return '챌린지';
  }
}

// 진행률 본문(현재/목표 + 단위). balance 는 '아래로 유지'형이라 현재 점유율·목표 상한을 함께 보인다.
function extProgressText(ch: ExtChallenge, p: ChallengeProgressResult): string {
  const round1 = (x: number) => Math.round(x * 10) / 10;
  if (ch.kind === 'weekly' && ch.metric === 'count') {
    return `${p.current} / ${p.target}회`;
  }
  if (ch.kind === 'rotation' && ch.rotationMode === 'balance') {
    return `최대 ${Math.round(p.current)}% · 목표 ${p.target}% 이하`;
  }
  if (ch.kind === 'rotation') {
    return `${p.current} / ${p.target}켤레`;
  }
  // monthly(distance) · shoe → 거리(km), 소수1 표기.
  return `${round1(p.current)} / ${p.target}km`;
}

// 주간 목표 거리 스텝(km). 사용자가 우상단 수정으로 조정하는 최소 단위.
const SMART_KM_STEP = 1;
const SMART_KM_MIN = 1;

// 스마트 챌린지 카드. generateSmartChallenge 가 만든 개인화·결정적 주간 챌린지를 '스마트
// 챌린지' 라벨 + 진행률 링과 함께 항상 보여준다(수락 단계 없는 상시 카드 — 누르면 사라지던
// 옛 동작 폐지). 우상단 수정 버튼으로 '주간 목표 거리(km)'만 ± 조정할 수 있고, 변경은
// onEditTargetKm 으로 위임한다(영속은 App 이 챌린지 id 별로 소유). 진행률은
// challengeExtProgress 로 런/신발에서 매번 파생한다(영속 금지 — 데이터 변형 0).
export function SmartChallengeCard({
  ch,
  runs,
  shoes,
  now,
  onEditTargetKm,
}: {
  ch: ExtChallenge;
  runs: ExtRun[];
  shoes: ExtShoe[];
  now: string;
  /** 주간 목표 거리(km) 변경 위임. 없으면 수정 버튼을 숨긴다(읽기 전용). */
  onEditTargetKm?: (km: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const target = ch.targetKm ?? 0;
  const p = challengeExtProgress(ch, runs, shoes, now);
  const pctLabel = `${Math.round(p.pct * 100)}%`;
  const step = (delta: number) => onEditTargetKm?.(Math.max(SMART_KM_MIN, target + delta));
  return (
    <View style={s.smartCard} testID="smart-challenge">
      <View style={s.smartHead}>
        <Pill tone="accent" icon="sparkles" label="스마트 챌린지" testID="smart-challenge-tag" />
        {p.completed && !editing && (
          <Pill tone="good" icon="trophy" label="달성!" testID="smart-challenge-badge" />
        )}
        {!!onEditTargetKm && (
          <Pressable
            onPress={() => setEditing(e => !e)}
            accessibilityRole="button"
            accessibilityLabel={editing ? '목표 거리 수정 완료' : '목표 거리 수정'}
            hitSlop={8}
            testID="smart-challenge-edit"
            style={({pressed}) => [s.smartEditBtn, pressed && {opacity: 0.6}]}>
            <Ionicons name={editing ? 'checkmark' : 'pencil'} size={15} color={ACCENT} />
          </Pressable>
        )}
      </View>
      {editing ? (
        <View style={s.smartEditWrap}>
          <Text style={s.smartEditLabel}>주간 목표 거리</Text>
          <View style={s.smartStepper}>
            <Pressable
              onPress={() => step(-SMART_KM_STEP)}
              accessibilityRole="button"
              accessibilityLabel="목표 거리 줄이기"
              hitSlop={6}
              style={({pressed}) => [s.smartStepBtn, pressed && {opacity: 0.6}]}>
              <Ionicons name="remove" size={18} color={T1} />
            </Pressable>
            <Text style={s.smartStepVal} testID="smart-challenge-target">
              {target}
              <Text style={s.smartStepUnit}> km</Text>
            </Text>
            <Pressable
              onPress={() => step(SMART_KM_STEP)}
              accessibilityRole="button"
              accessibilityLabel="목표 거리 늘리기"
              hitSlop={6}
              style={({pressed}) => [s.smartStepBtn, pressed && {opacity: 0.6}]}>
              <Ionicons name="add" size={18} color={T1} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={s.smartBody}>
          <Ring size={64} stroke={7} progress={p.pct} color={p.completed ? GOOD : ACCENT}>
            <Text style={s.ringPct} testID="smart-challenge-pct">
              {pctLabel}
            </Text>
          </Ring>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={s.smartTitle} numberOfLines={2}>
              {extChallengeLabel(ch, shoes)}
            </Text>
            <Text style={s.extProgress} testID="smart-challenge-progress">
              {extProgressText(ch, p)}
            </Text>
            {!!ch.reason && (
              <Text style={s.smartReason} testID="smart-challenge-reason">
                {ch.reason}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}


export default function ChallengesSection({
  runs = [],
  today = '',
  extRuns,
  shoes = [],
  now,
  smartSuggestion,
  smartTargetById = {},
  onEditSmartTarget,
}: {
  /** base 런(거리 집계 폴백). extRuns 미주입 시 스마트 집계에 사용한다. */
  runs?: ChallengeRun[];
  /** 주 윈도우 기준일('YYYY-MM-DD'). 미주입 시 now→실기기 오늘. */
  today?: string;
  /** 신발 귀속(shoeId)을 가진 런. 미주입 시 base runs 로 폴백(거리 기반 집계엔 충분). */
  extRuns?: ExtRun[];
  /** 활성/은퇴 신발(스마트 집계·표시명). */
  shoes?: ExtShoe[];
  /** 주 윈도우 기준일('YYYY-MM-DD'). 미주입 시 today→실기기 오늘. */
  now?: string;
  /** 스마트 챌린지를 명시 주입(테스트 결정성). undefined 면 데이터에서 자동 생성, null 이면 미노출. */
  smartSuggestion?: ExtChallenge | null;
  /** 챌린지 id별 사용자 지정 목표 거리(km) 오버라이드. App 이 영속·주입한다. */
  smartTargetById?: Record<string, number>;
  /** 목표 거리(km) 변경 위임 — (챌린지 id, km). 없으면 수정 버튼을 숨긴다. */
  onEditSmartTarget?: (id: string, km: number) => void;
}) {
  const nowISO = ((now || today) ? (now || today).slice(0, 10) : isoToday());
  const safeExtRuns: ExtRun[] = extRuns ?? (runs as ExtRun[]);
  // smartSuggestion 을 명시(=null 포함) 주입하면 그대로, 아니면 데이터에서 결정적으로 생성.
  const base =
    smartSuggestion !== undefined
      ? smartSuggestion
      : generateSmartChallenge(safeExtRuns, shoes, nowISO);
  // 사용자가 이 챌린지(id)의 목표 거리를 직접 조정했으면 그 값으로 덮어쓴다(주가 바뀌어
  // id가 달라지면 자동으로 추천 기본값으로 복귀).
  const override = base ? smartTargetById[base.id] : undefined;
  const smart = base && override != null ? {...base, targetKm: override} : base;

  return (
    <View testID="challenges-section">
      {smart ? (
        <SmartChallengeCard
          ch={smart}
          runs={safeExtRuns}
          shoes={shoes}
          now={nowISO}
          onEditTargetKm={onEditSmartTarget ? km => onEditSmartTarget(smart.id, km) : undefined}
        />
      ) : (
        <Text style={s.empty} testID="challenges-empty">
          아직 추천할 챌린지가 없어요. 러닝을 기록하면 신발·페이스에 맞춘 챌린지를 추천해드려요.
        </Text>
      )}
    </View>
  );
}

// 실기기 오늘('YYYY-MM-DD'). now/today 미주입 시에만 호출(테스트는 now 를 주입).
function isoToday(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

const s = StyleSheet.create({
  headerRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 12},
  sectionLabel: {color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2},
  addBtn: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.14)},
  addBtnTxt: {color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '700'},

  empty: {color: T3, fontFamily: FONT, fontSize: 13, lineHeight: 19, paddingHorizontal: 4},

  card: {flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: CARD, borderRadius: RADIUS.xl, padding: 16},
  cardDone: {borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(GOOD, 0.5)},
  ringPct: {color: T1, fontFamily: DISPLAY, fontSize: 14, letterSpacing: 0.2},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  title: {flex: 1, color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '700', letterSpacing: -0.2},
  progressTxt: {marginTop: 4},
  progressCur: {color: T1, fontFamily: DISPLAY, fontSize: 18, letterSpacing: 0.2},
  progressTot: {color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '700'},
  period: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500', marginTop: 4},
  del: {width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: CARD_HI},

  form: {backgroundColor: CARD, borderRadius: RADIUS.xl, padding: 16, gap: 14, marginBottom: 12},
  segRow: {flexDirection: 'row', gap: 8},
  seg: {flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  segOn: {backgroundColor: withAlpha(ACCENT, 0.16), borderColor: ACCENT},
  segTxt: {color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '600'},
  segTxtOn: {color: ACCENT, fontWeight: '700'},
  stepper: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14},
  stepBtn: {width: 44, height: 44, borderRadius: 14, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},
  stepVal: {flex: 1, alignItems: 'center'},
  stepNum: {color: T1, fontFamily: DISPLAY, fontSize: 26, letterSpacing: 0.3},
  stepUnit: {color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', marginTop: 2},
  // 단일 Button 프리미티브로 라우팅(그라데이션/글로우/RADIUS.btn). 여기선 높이만 얹는다.
  createBtn: {height: 46},
  xpHint: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'center'},
  xpHintTxt: {color: ACCENT, fontFamily: FONT, fontSize: 12, fontWeight: '600'},
  xpEarned: {color: ACCENT, fontFamily: FONT, fontSize: 12, fontWeight: '700', marginTop: 2},

  // ── 확장 챌린지(Slice C) ──
  extWrap: {marginTop: 18, gap: 10},
  extLabel: {paddingHorizontal: 4, paddingBottom: 2},
  extProgress: {color: T1, fontFamily: DISPLAY, fontSize: 17, letterSpacing: 0.2, marginTop: 4},
  smartCard: {backgroundColor: CARD, borderRadius: RADIUS.xl, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.45)},
  smartHead: {flexDirection: 'row', alignItems: 'center', gap: 8},
  smartBody: {flexDirection: 'row', alignItems: 'center', gap: 16},
  smartTitle: {color: T1, fontFamily: FONT, fontSize: 17, fontWeight: '700', letterSpacing: -0.2},
  smartReason: {color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500', lineHeight: 18, marginTop: 4},
  // 우상단 목표 거리 수정(연필/체크) 버튼 — 헤더 오른쪽 끝으로 민다.
  smartEditBtn: {marginLeft: 'auto', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.14)},
  // 편집 모드: 목표 거리 ± 스테퍼.
  smartEditWrap: {gap: 10},
  smartEditLabel: {color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.2},
  smartStepper: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CARD_HI, borderRadius: RADIUS.md, padding: 8},
  smartStepBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center'},
  smartStepVal: {color: T1, fontFamily: DISPLAY, fontSize: 24, letterSpacing: 0.2},
  smartStepUnit: {color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '600'},
});
