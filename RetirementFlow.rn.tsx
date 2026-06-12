// ============================================================================
// RetirementFlow.rn.tsx — 신발 은퇴 키프세이크 플로우 (Slice B · UI)
// ----------------------------------------------------------------------------
// 사용자가 [은퇴]를 누르면 열리는 3스텝 회고 + 키프세이크 카드. 절대 자동 은퇴하지
// 않으며(사용자 제어), 마지막 확정에서만 **기존 은퇴 경로**(onRetire = apiPatchShoe
// retired)를 호출하고 동시에 Hall of Shoes 영속(persistRetiredShoe)에 RetiredShoeRecord
// 를 덧붙인다. run/shoe 데이터는 절대 파괴하지 않는다(보존만).
//
// 모든 수치는 그 신발의 **실제 런**에서만 파생한다(buildRetirementSummary, 날조 금지).
// 톤은 슬프지 않고 자랑스럽게(Apple 키노트 / Spotify Wrapped) — "수명을 다했다"가
// 아니라 "훌륭한 여정"을 기린다. 토큰·primitives 만(raw hex 0), 한국어.
//
// 스텝:
//   0 확인(確認)     — 신발명 · 누적 거리 · 러닝 횟수 · 사용 기간 (마지막 인사 준비)
//   1 여정 요약      — 전체 일대기(거리/횟수/시간/페이스/최장 런/기간)
//   2 하이라이트     — 실제 달성한 하이라이트 + Most Memorable Moment + 등급
//   3 키프세이크 카드 — RetirementCard(포맷 A/B/C/D, 기본 C) + 이미지 저장 / 공유
// 은퇴 확정은 스텝 2 → 3 전환에서 단 한 번 일어난다.
// ============================================================================
import React, {useMemo, useRef, useState} from 'react';
import {View, Text, ScrollView, Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG,
  CARD,
  CARD_DIM,
  CARD_HI,
  ACCENT,
  T1,
  T2,
  T3,
  SEP,
  FONT,
  DISPLAY,
  SPACE,
  RADIUS,
  withAlpha,
} from './theme';
import {Unit} from './lib/units';
import {
  buildRetirementSummary,
  buildRetiredShoeRecord,
} from './lib/progression/retirement';
import {persistRetiredShoe} from './lib/progression/retirementStore';
import {
  buildRetirementCardModel,
  RETIREMENT_CARD_FORMATS,
  DEFAULT_RETIREMENT_CARD_FORMAT,
  type RetirementCardFormat,
} from './lib/progression/retirementCard';
import {
  saveRetirementCardImage,
  shareRetirementCard,
} from './lib/progression/retirementShare';
import type {SvgCapturable} from './lib/shareCard';
import RetirementCard from './RetirementCard';
import RetirementCardActions from './RetirementCardActions';
import type {
  ProgressionContext,
  RetiredShoeRecord,
} from './lib/progression/types';

export interface RetirementFlowProps {
  /** 은퇴할 신발(서버 행). id 로 런을 필터링하고 요약을 만든다. */
  shoe: BackendShoe;
  /** 전체 런(서버 행) — 요약이 shoe_id 로 이 신발 런만 집계한다(읽기 전용). */
  runs: readonly BackendRun[];
  /** 진척 컨텍스트 — 올타임 PB/등급 판정(읽기 전용). */
  ctx: ProgressionContext;
  /** 은퇴 기준 시각(epoch ms) — 테스트 결정성. 미지정 시 Date.now(). */
  now?: number;
  /** 표시 단위(km|mi). 기본 km. */
  unit?: Unit;
  /** 장착 타이틀 표시명(카드 워드마크 근처 은은). 없으면 미표시. */
  equippedTitle?: string | null;
  /** 기존 은퇴 경로(apiPatchShoe retired). 확정 시 호출 — 새 은퇴 로직 재구현 금지. */
  onRetire?: (id: string, retired: boolean) => void;
  /** 은퇴 확정 후 영속된 레코드를 부모에 알린다(Hall of Shoes 즉시 갱신용). */
  onRetired?: (record: RetiredShoeRecord) => void;
  /** 플로우 닫기(취소/완료). */
  onClose: () => void;
}

type Step = 0 | 1 | 2 | 3;

/** 사용 기간(일)을 한국어로 — 슬프지 않고 함께한 시간을 기린다. */
function usagePeriodKo(days: number): string {
  const d = Number.isFinite(days) && days > 0 ? Math.round(days) : 0;
  if (d <= 0) return '함께한 시간';
  if (d < 31) return `${d}일 동안`;
  const months = Math.round(d / 30);
  return `약 ${months}개월 동안`;
}

function RetirementFlow({
  shoe,
  runs,
  ctx,
  now,
  unit = 'km',
  equippedTitle = null,
  onRetire,
  onRetired,
  onClose,
}: RetirementFlowProps) {
  const insets = useSafeAreaInsets();
  // 은퇴 기준 시각은 한 번만 고정한다(매 렌더 새 타임스탬프가 요약/등급을 흔들지 않게).
  const nowRef = useRef<number>(now ?? Date.now());
  const nowMs = now ?? nowRef.current;

  // 요약/카드 모델 — 그 신발의 실제 런에서만(날조 금지). 입력 참조 동일 시 재계산 안 함.
  const summary = useMemo(
    () => buildRetirementSummary(shoe, runs, ctx, nowMs),
    [shoe, runs, ctx, nowMs],
  );
  // 권위 누적 거리 = 서버 truth(perShoe.km, 등록 마일리지/타 기기 미동기 런 포함) 우선.
  // 런 합(summary.totalKm)만 쓰면 과소표시(또는 로컬 런 0 → 0km) — context.ts·lib/shoe 와
  // 동일하게 서버 total_km 을 우선해 명패(record.km)와 카드 거리가 항상 일치하게 한다.
  const authoritativeKm = useMemo(() => {
    const perShoeKm = shoe.id ? ctx?.perShoe?.[shoe.id]?.km : undefined;
    return Number.isFinite(perShoeKm) && (perShoeKm as number) > 0
      ? (perShoeKm as number)
      : summary.totalKm;
  }, [ctx, shoe.id, summary.totalKm]);
  const model = useMemo(
    () =>
      buildRetirementCardModel(summary, summary.grade, {
        unit,
        equippedTitle,
        retiredAtMs: nowMs,
        distanceKm: authoritativeKm,
      }),
    [summary, unit, equippedTitle, nowMs, authoritativeKm],
  );

  const [step, setStep] = useState<Step>(0);
  const [format, setFormat] = useState<RetirementCardFormat>(
    DEFAULT_RETIREMENT_CARD_FORMAT,
  );
  // 중복 확정 가드 — 확정은 단 한 번(연타로 두 번 은퇴/영속되지 않게).
  const committed = useRef(false);
  const cardRef = useRef<SvgCapturable | null>(null);

  // 은퇴 확정: 기존 경로 호출 + 키프세이크 영속. 단 한 번만. 그 후 카드 스텝으로.
  const commitRetire = () => {
    if (!committed.current) {
      committed.current = true;
      // 명패 km = 권위 누적 거리(서버 truth 우선) — 카드 거리와 동일 값으로 영속한다.
      const record = buildRetiredShoeRecord(summary, authoritativeKm, nowMs);
      if (shoe.id) onRetire?.(shoe.id, true);
      // 영속은 ADDITIVE·멱등(progression_v1.retiredShoes 만) — run/shoe 불변.
      void persistRetiredShoe(record);
      onRetired?.(record);
    }
    setStep(3);
  };

  // 카드 저장/공유 — 캡처 인프라 재사용(절대 throw 하지 않음, 텍스트 폴백 내장).
  // 진행 중 busy-락이 동작하도록 Promise<void> 를 돌려준다(actions 가 in-flight 잠금).
  const onSave = async () => {
    await saveRetirementCardImage(cardRef, model);
  };
  const onShare = () => shareRetirementCard(cardRef, model);

  return (
    <View style={[s.screen, {paddingTop: insets.top}]}>
      {/* 상단 바: 닫기 + 스텝 진행 점(4) */}
      <View style={s.nav}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="닫기"
          testID="retire-flow-close"
          style={s.iconBtn}>
          <Ionicons name="close" size={20} color={T2} />
        </Pressable>
        <View style={s.dots}>
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={[s.dot, i === step ? s.dotOn : i < step && s.dotDone]}
            />
          ))}
        </View>
        <View style={s.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <ConfirmStep model={model} period={usagePeriodKo(model.usageDays)} />
        )}
        {step === 1 && <JourneyStep model={model} />}
        {step === 2 && <HighlightsStep model={model} />}
        {step === 3 && (
          <CardStep
            cardRef={cardRef}
            model={model}
            format={format}
            onFormat={setFormat}
            onSave={onSave}
            onShare={onShare}
          />
        )}
      </ScrollView>

      {/* 하단 액션 — 스텝별. 자동 은퇴 없음: 확정은 명시적 누름으로만. */}
      <View style={[s.footer, {paddingBottom: insets.bottom + SPACE.md}]}>
        {step === 0 && (
          <View style={s.footRow}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="취소"
              style={({pressed}) => [s.btn, s.btnGhost, pressed && s.pressed]}>
              <Text style={[s.btnTxt, {color: T2}]}>취소</Text>
            </Pressable>
            <Pressable
              onPress={() => setStep(1)}
              accessibilityRole="button"
              accessibilityLabel="여정 돌아보기"
              testID="retire-flow-next-0"
              style={({pressed}) => [s.btn, s.btnPrimary, pressed && s.pressed]}>
              <Text style={[s.btnTxt, {color: BG}]}>여정 돌아보기</Text>
            </Pressable>
          </View>
        )}
        {step === 1 && (
          <View style={s.footRow}>
            <Pressable
              onPress={() => setStep(0)}
              accessibilityRole="button"
              accessibilityLabel="이전"
              style={({pressed}) => [s.btn, s.btnGhost, pressed && s.pressed]}>
              <Text style={[s.btnTxt, {color: T2}]}>이전</Text>
            </Pressable>
            <Pressable
              onPress={() => setStep(2)}
              accessibilityRole="button"
              accessibilityLabel="하이라이트 보기"
              testID="retire-flow-next-1"
              style={({pressed}) => [s.btn, s.btnPrimary, pressed && s.pressed]}>
              <Text style={[s.btnTxt, {color: BG}]}>하이라이트 보기</Text>
            </Pressable>
          </View>
        )}
        {step === 2 && (
          <View style={s.footRow}>
            <Pressable
              onPress={() => setStep(1)}
              accessibilityRole="button"
              accessibilityLabel="이전"
              style={({pressed}) => [s.btn, s.btnGhost, pressed && s.pressed]}>
              <Text style={[s.btnTxt, {color: T2}]}>이전</Text>
            </Pressable>
            <Pressable
              onPress={commitRetire}
              accessibilityRole="button"
              accessibilityLabel="은퇴 확정"
              testID="retire-flow-commit"
              style={({pressed}) => [s.btn, s.btnPrimary, pressed && s.pressed]}>
              <Text style={[s.btnTxt, {color: BG}]}>은퇴하고 카드 만들기</Text>
            </Pressable>
          </View>
        )}
        {step === 3 && (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="완료"
            testID="retire-flow-done"
            style={({pressed}) => [
              s.btn,
              s.btnPrimary,
              s.btnFull,
              pressed && s.pressed,
            ]}>
            <Text style={[s.btnTxt, {color: BG}]}>완료</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── 스텝 0 · 확인 ───────────────────────────────────────────────────────────────
function ConfirmStep({
  model,
  period,
}: {
  model: ReturnType<typeof buildRetirementCardModel>;
  period: string;
}) {
  return (
    <View style={s.stepWrap}>
      <Text style={s.eyebrow}>마지막 인사를 준비해요</Text>
      <Text style={s.shoeName}>{model.shoeName}</Text>
      <Text style={s.lede}>
        <Text style={s.ledeStrong}>{model.distanceLabel}</Text>를 함께
        달렸어요.
      </Text>
      <View style={[s.card, s.basicCard]}>
        <BasicRow label="누적 거리" value={model.distanceLabel} />
        <BasicRow label="함께한 러닝" value={`${model.runCountLabel}회`} />
        <BasicRow label="사용 기간" value={period} last />
      </View>
      <Text style={s.note}>
        은퇴해도 이 신발의 모든 러닝 기록은 그대로 보존돼요. 명예의 전당에서 언제든
        다시 만날 수 있어요.
      </Text>
    </View>
  );
}

function BasicRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[s.basicRow, !last && s.basicRowBorder]}>
      <Text style={s.basicLabel}>{label}</Text>
      <Text style={s.basicValue}>{value}</Text>
    </View>
  );
}

// ── 스텝 1 · 여정 요약 ───────────────────────────────────────────────────────────
function JourneyStep({
  model,
}: {
  model: ReturnType<typeof buildRetirementCardModel>;
}) {
  // 실제 집계만 노출(없으면 그 칸은 비운다 — 날조 금지).
  const cells: {l: string; v: string}[] = [
    {l: '누적 거리', v: model.distanceLabel},
    {l: '러닝 횟수', v: `${model.runCountLabel}회`},
  ];
  if (model.totalTime) cells.push({l: '러닝 시간', v: model.totalTime});
  if (model.avgPace) cells.push({l: '평균 페이스', v: `${model.avgPace}/km`});
  if (model.bestPace) cells.push({l: '최고 페이스', v: `${model.bestPace}/km`});
  if (model.longestRun)
    cells.push({l: '최장 런', v: `${model.longestRun}${model.unit}`});
  if (model.usageDays > 0)
    cells.push({l: '사용 기간', v: usagePeriodKo(model.usageDays)});

  return (
    <View style={s.stepWrap}>
      <Text style={s.eyebrow}>함께한 여정</Text>
      <Text style={s.stepTitle}>{model.shoeName}의 일대기</Text>
      {!!model.dateRange && <Text style={s.dateRange}>{model.dateRange}</Text>}
      <View style={[s.card, s.grid]}>
        {cells.map((c, i) => (
          <View key={c.l} style={s.gridCell} testID={`journey-cell-${i}`}>
            <Text style={s.gridValue}>{c.v}</Text>
            <Text style={s.gridLabel}>{c.l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── 스텝 2 · 하이라이트 ──────────────────────────────────────────────────────────
function HighlightsStep({
  model,
}: {
  model: ReturnType<typeof buildRetirementCardModel>;
}) {
  const badge = model.grade;
  const hasHighlights = model.highlights.length > 0;
  return (
    <View style={s.stepWrap}>
      <Text style={s.eyebrow}>하이라이트</Text>
      <Text style={s.stepTitle}>가장 빛났던 순간들</Text>

      {/* Smart Retirement Grade 배지 */}
      <View
        style={[
          s.gradeBadge,
          {
            borderColor: withAlpha(badge.color, 0.5),
            backgroundColor: withAlpha(badge.color, 0.12),
          },
        ]}>
        <Text style={[s.gradeText, {color: badge.color}]}>
          {badge.emoji} {badge.label}
        </Text>
      </View>

      {/* Most Memorable Moment(있으면) — 단 하나의 가장 강렬한 실제 하이라이트 */}
      {!!model.mostMemorable && (
        <View style={[s.card, s.momentCard]} testID="most-memorable">
          <Text style={s.momentLabel}>Most Memorable Moment</Text>
          <Text style={s.momentValue}>{model.mostMemorable}</Text>
        </View>
      )}

      {/* 실제 달성한 하이라이트 목록(우선순위 순). 없으면 격려 카피(날조 금지). */}
      {hasHighlights ? (
        <View style={[s.card, s.hlCard]}>
          {model.highlights.map((h, i) => (
            <View
              key={h + i}
              style={[s.hlRow, i < model.highlights.length - 1 && s.hlRowBorder]}
              testID={`highlight-${i}`}>
              <Ionicons name="ribbon-outline" size={16} color={ACCENT} />
              <Text style={s.hlText}>{h}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.note}>
          이 신발과의 모든 걸음이 곧 하이라이트였어요. 다음 신발과 또 새로운 기록을
          만들어가요.
        </Text>
      )}
    </View>
  );
}

// ── 스텝 3 · 키프세이크 카드 ──────────────────────────────────────────────────────
function CardStep({
  cardRef,
  model,
  format,
  onFormat,
  onSave,
  onShare,
}: {
  cardRef: React.MutableRefObject<SvgCapturable | null>;
  model: ReturnType<typeof buildRetirementCardModel>;
  format: RetirementCardFormat;
  onFormat: (f: RetirementCardFormat) => void;
  onSave: () => void | Promise<void>;
  onShare: () => void | Promise<void>;
}) {
  return (
    <View style={s.stepWrap}>
      <Text style={s.eyebrow}>키프세이크 카드</Text>
      <Text style={s.stepTitle}>훌륭한 여정이었어요</Text>

      {/* 포맷 스위처 A/B/C/D(기본 C) */}
      <View style={s.formatRow}>
        {RETIREMENT_CARD_FORMATS.map(f => {
          const on = f === format;
          return (
            <Pressable
              key={f}
              onPress={() => onFormat(f)}
              accessibilityRole="button"
              accessibilityLabel={`카드 포맷 ${f}`}
              accessibilityState={{selected: on}}
              testID={`retire-card-format-${f}`}
              style={({pressed}) => [
                s.formatBtn,
                on && s.formatBtnOn,
                pressed && s.pressed,
              ]}>
              <Text style={[s.formatTxt, on && s.formatTxtOn]}>{f}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 카드 미리보기 — RetirementCard(캡처용 순수 SVG). ref 로 PNG 캡처. */}
      <View style={s.preview} testID="retire-card-preview">
        <RetirementCard ref={cardRef} model={model} format={format} />
      </View>

      <RetirementCardActions onSave={onSave} onShare={onShare} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  pressed: {opacity: 0.85},
  nav: {
    paddingTop: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    backgroundColor: CARD_HI,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {flexDirection: 'row', alignItems: 'center', gap: 7},
  dot: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: withAlpha(T1, 0.16),
  },
  dotOn: {backgroundColor: ACCENT, width: 20},
  dotDone: {backgroundColor: withAlpha(ACCENT, 0.5)},

  body: {padding: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg},
  stepWrap: {gap: SPACE.md},
  eyebrow: {
    color: ACCENT,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  shoeName: {
    color: T1,
    fontFamily: DISPLAY,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 40,
  },
  stepTitle: {
    color: T1,
    fontFamily: DISPLAY,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  lede: {
    color: T2,
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 25,
  },
  ledeStrong: {color: T1, fontWeight: '700'},
  dateRange: {color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '500'},
  note: {
    color: T3,
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 20,
    marginTop: SPACE.xs,
  },

  card: {
    backgroundColor: CARD_DIM,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(T1, 0.07),
  },
  basicCard: {paddingHorizontal: SPACE.lg, marginTop: SPACE.xs},
  basicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.md + 2,
  },
  basicRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEP,
  },
  basicLabel: {color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '500'},
  basicValue: {color: T1, fontFamily: DISPLAY, fontSize: 18, fontWeight: '700'},

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: SPACE.xs,
    paddingHorizontal: SPACE.lg,
  },
  gridCell: {width: '50%', paddingVertical: SPACE.md},
  gridValue: {
    color: T1,
    fontFamily: DISPLAY,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  gridLabel: {color: T3, fontFamily: FONT, fontSize: 12, marginTop: 4},

  gradeBadge: {
    alignSelf: 'flex-start',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACE.md + 2,
    paddingVertical: SPACE.sm,
  },
  gradeText: {fontFamily: FONT, fontSize: 14, fontWeight: '700'},

  momentCard: {
    padding: SPACE.lg,
    gap: 6,
    borderColor: withAlpha(ACCENT, 0.3),
  },
  momentLabel: {
    color: ACCENT,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  momentValue: {
    color: T1,
    fontFamily: DISPLAY,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  hlCard: {paddingHorizontal: SPACE.lg},
  hlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md + 1,
  },
  hlRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEP,
  },
  hlText: {color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600'},

  formatRow: {flexDirection: 'row', gap: SPACE.sm},
  formatBtn: {
    flex: 1,
    height: 42,
    borderRadius: RADIUS.sm,
    backgroundColor: CARD_HI,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  formatBtnOn: {
    borderColor: withAlpha(ACCENT, 0.6),
    backgroundColor: withAlpha(ACCENT, 0.14),
  },
  formatTxt: {color: T3, fontFamily: DISPLAY, fontSize: 16, fontWeight: '800'},
  formatTxtOn: {color: ACCENT},

  preview: {
    aspectRatio: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: CARD,
  },

  footer: {
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SEP,
  },
  footRow: {flexDirection: 'row', gap: SPACE.md},
  btn: {
    flex: 1,
    height: 54,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFull: {flex: 0},
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(T1, 0.16),
  },
  btnPrimary: {backgroundColor: ACCENT},
  btnTxt: {fontFamily: FONT, fontSize: 16, fontWeight: '700'},
});

export default RetirementFlow;
