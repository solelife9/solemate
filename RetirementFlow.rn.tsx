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
//   3 키프세이크 카드 — RetirementCard(정사각/스토리, 기본 정사각) + 이미지 저장 / 공유
// 은퇴 확정은 스텝 2 → 3 전환에서 단 한 번 일어난다.
// ============================================================================
import React, {useMemo, useRef, useState} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {View, ScrollView, Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG,
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
  withAlpha, TYPE,
  GLASS, MOTION,
  ICON,
  RING_ACCENT,
} from './theme';
import {Button, GlassEdge, SwipeBack} from './primitives';
import {Unit} from './lib/units';
import {
  buildRetirementSummary,
  buildRetiredShoeRecord,
} from './lib/progression/retirement';
import {persistRetiredShoe} from './lib/progression/retirementStore';
import {
  buildRetirementCardModel,
  RETIREMENT_CARD_FORMATS,
  RETIREMENT_CARD_FORMAT_LABEL,
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
  /**
   * '다음 신발 찾아보기' — 보관 완료 화면에서만 호출된다.
   *
   * 미지정이면 그 버튼을 아예 렌더하지 않는다(눌러도 안 되는 버튼은 두지 않는다).
   * 이 초대는 **은퇴식이 끝난 뒤에만** 나온다 — 작별 화면에 쇼핑 버튼을 같이 두지
   * 않는 것이 이 플로우의 설계다(감정과 커머스를 시간으로 분리).
   */
  onFindNextShoe?: () => void;
  /** 플로우 닫기(취소/완료). */
  onClose: () => void;
}

// 0 확인 · 1 여정 · 2 하이라이트 · 3 키프세이크 카드 · 4 보관 완료.
type Step = 0 | 1 | 2 | 3 | 4;
const STEP_COUNT = 5;

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
  onFindNextShoe,
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

  // 엣지 스와이프 백(UX 감사 ⑨) — 상단 닫기와 같은 동작. 전체화면의 절반만 지원해
  // 한 번 통한 제스처가 다음 화면에서 먹통이 되던 불일치를 없앤다.
  return (
    <SwipeBack onBack={onClose}>
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
          <Ionicons name="close" size={ri(ICON.action)} color={T2} />
        </Pressable>
        <View
          style={s.dots}
          accessible
          accessibilityLabel={`${STEP_COUNT}단계 중 ${step + 1}`}>
          {Array.from({length: STEP_COUNT}, (_, i) => i).map(i => (
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
        {step === 4 && <ArchivedStep model={model} />}
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
            <Button
              label="여정 돌아보기"
              onPress={() => setStep(1)}
              testID="retire-flow-next-0"
              style={s.btnPrimary}
            />
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
            <Button
              label="하이라이트 보기"
              onPress={() => setStep(2)}
              testID="retire-flow-next-1"
              style={s.btnPrimary}
            />
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
            <Button
              label="은퇴하고 카드 만들기"
              onPress={commitRetire}
              testID="retire-flow-commit"
              style={s.btnPrimary}
            />
          </View>
        )}
        {step === 3 && (
          <Button
            label="완료"
            onPress={() => setStep(4)}
            testID="retire-flow-done"
            style={[s.btnPrimary, s.btnFull]}
          />
        )}
        {/* 보관 완료 — 여기서**만** 다음 신발 이야기를 꺼낸다. 작별(0~2)과 카드(3)에는
            쇼핑 동선이 없다. 초대를 거절하는 길('홈으로')이 항상 같은 크기로 있다. */}
        {step === 4 && (
          onFindNextShoe ? (
            <View style={s.footRow}>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="홈으로"
                testID="retire-flow-home"
                style={({pressed}) => [s.btn, s.btnGhost, pressed && s.pressed]}>
                <Text style={[s.btnTxt, {color: T2}]}>홈으로</Text>
              </Pressable>
              <Button
                label="다음 신발 찾아보기"
                onPress={onFindNextShoe}
                testID="retire-flow-next-shoe"
                style={s.btnPrimary}
              />
            </View>
          ) : (
            <Button
              label="홈으로"
              onPress={onClose}
              testID="retire-flow-home"
              style={[s.btnPrimary, s.btnFull]}
            />
          )
        )}
      </View>
    </View>
    </SwipeBack>
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
        <GlassEdge glints={false} radius={RADIUS.lg} />
        <BasicRow label="누적 거리" value={model.distanceLabel} />
        <BasicRow label="함께한 러닝" value={`${model.runCountLabel}회`} />
        <BasicRow label="사용 기간" value={period} last />
      </View>
      <Text style={s.note}>
        은퇴해도 이 신발의 모든 러닝 기록은 그대로 보존돼요. 러닝화 아카이브에서 언제든
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
    cells.push({l: '최장 러닝', v: `${model.longestRun}${model.unit}`});
  if (model.usageDays > 0)
    cells.push({l: '사용 기간', v: usagePeriodKo(model.usageDays)});

  return (
    <View style={s.stepWrap}>
      <Text style={s.eyebrow}>함께한 여정</Text>
      <Text style={s.stepTitle}>{model.shoeName}의 일대기</Text>
      {!!model.dateRange && <Text style={s.dateRange}>{model.dateRange}</Text>}
      <View style={[s.card, s.grid]}>
        <GlassEdge glints={false} radius={RADIUS.lg} />
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
        {/* 배지 이모지 제거 — 공유 카드(RetirementCard stripEmoji)와 같은 절제 문법. */}
        <Text style={[s.gradeText, {color: badge.color}]}>
          {badge.label}
        </Text>
      </View>

      {/* Most Memorable Moment(있으면) — 단 하나의 가장 강렬한 실제 하이라이트 */}
      {!!model.mostMemorable && (
        <View style={[s.card, s.momentCard]} testID="most-memorable">
          <GlassEdge glints={false} radius={RADIUS.lg} />
          <Text style={s.momentLabel}>Most Memorable Moment</Text>
          <Text style={s.momentValue}>{model.mostMemorable}</Text>
        </View>
      )}

      {/* 실제 달성한 하이라이트 목록(우선순위 순). 없으면 격려 카피(날조 금지). */}
      {hasHighlights ? (
        <View style={[s.card, s.hlCard]}>
          <GlassEdge glints={false} radius={RADIUS.lg} />
          {model.highlights.map((h, i) => (
            <View
              key={h + i}
              style={[s.hlRow, i < model.highlights.length - 1 && s.hlRowBorder]}
              testID={`highlight-${i}`}>
              <Ionicons name="ribbon-outline" size={ri(ICON.inline)} color={ACCENT} />
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
  // 미리보기 폭 — 본문 패딩 제외. 스토리(9:16)는 세로가 길어 62%로 줄여 스텝 안에 담는다.
  const win = useWindowDimensions();
  const bodyW = Math.max(200, win.width - SPACE.xl * 2);
  const previewW = format === 'S' ? Math.round(bodyW * 0.62) : bodyW;
  return (
    <View style={s.stepWrap}>
      <Text style={s.eyebrow}>키프세이크 카드</Text>
      <Text style={s.stepTitle}>훌륭한 여정이었어요</Text>

      {/* 포맷 스위처 — 정사각(기본)/스토리 */}
      <View style={s.formatRow}>
        {RETIREMENT_CARD_FORMATS.map(f => {
          const on = f === format;
          return (
            <Pressable
              key={f}
              onPress={() => onFormat(f)}
              accessibilityRole="button"
              accessibilityLabel={`카드 포맷 ${RETIREMENT_CARD_FORMAT_LABEL[f]}`}
              accessibilityState={{selected: on}}
              testID={`retire-card-format-${f}`}
              style={({pressed}) => [
                s.formatBtn,
                on && s.formatBtnOn,
                pressed && s.pressed,
              ]}>
              {/* 비활성=유리 헤어라인, 활성=ACCENT 의미 보더(형제 화면 칩 문법). */}
              {!on && <GlassEdge glints={false} radius={RADIUS.sm} />}
              <Text style={[s.formatTxt, on && s.formatTxtOn]}>{RETIREMENT_CARD_FORMAT_LABEL[f]}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 카드 미리보기 — RetirementCard(캡처용 순수 SVG, viewBox 축소 렌더). ref 로 PNG 캡처. */}
      <View
        style={[s.preview, format === 'S' && [s.previewStory, {width: previewW}]]}
        testID="retire-card-preview">
        <RetirementCard ref={cardRef} model={model} format={format} displayWidth={previewW} />
        <GlassEdge glints={false} radius={RADIUS.lg} />
      </View>

      <RetirementCardActions onSave={onSave} onShare={onShare} />
    </View>
  );
}

// ── 스텝 4 · 보관 완료 ──────────────────────────────────────────────────────────
// 작별이 끝났다는 걸 조용히 확인해 주는 화면. 여기까지 와서야 '다음 신발' 이야기를
// 꺼낸다 — 은퇴식 화면에 쇼핑 버튼을 같이 두면 작별이 판매의 미끼가 된다.
// 화면 자체는 짧게 둔다(확인 한 줄 + 어디서 다시 볼 수 있는지).
function ArchivedStep({
  model,
}: {
  model: ReturnType<typeof buildRetirementCardModel>;
}) {
  return (
    <View style={s.stepWrap} testID="retire-flow-archived">
      {/* 완료 표식 — 수명 링이 끝까지 찬 상태의 언어를 그대로 쓴다(Ember 테두리). */}
      <View style={s.doneMark}>
        <Ionicons name="checkmark" size={ri(ICON.action)} color={RING_ACCENT} />
      </View>

      <Text style={s.doneTitle}>아카이브에 담았어요</Text>
      <Text style={s.doneSub}>러닝화 아카이브에서 언제든 다시 만날 수 있어요.</Text>

      {/* 무엇이 보관됐는지 눈으로 확인시킨다 — '담았다'는 말만으로는 안 믿긴다. */}
      <View style={s.archivedCard}>
        <GlassEdge glints={false} radius={RADIUS.md} />
        <Text style={s.archivedName} numberOfLines={1}>{model.shoeName}</Text>
        <Text style={s.archivedMeta}>
          {model.distanceLabel}
          {model.usageDays > 0 ? ` · ${usagePeriodKo(model.usageDays)}` : ''}
        </Text>
      </View>

      {/* 여기서 화제가 바뀐다는 걸 선으로 알린다 — 작별과 다음은 같은 이야기가 아니다. */}
      <View style={s.divider}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>이제, 다음 동행</Text>
        <View style={s.dividerLine} />
      </View>

      {/* 명령이 아니라 질문 — 거절해도 되는 초대여야 한다(BRAND.md §3-4). */}
      <Text style={s.inviteCopy}>
        비어 있는 자리, 함께 달릴{'\n'}다음 신발을 찾아볼까요?
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  // 누름 표준(MOTION.press) — 사설 opacity 0.85 폐지.
  pressed: {opacity: MOTION.press.opacity, transform: [{scale: MOTION.press.scale}]},
  nav: {
    paddingTop: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: rs(38),
    height: rs(38),
    borderRadius: RADIUS.pill,
    backgroundColor: CARD_HI,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {flexDirection: 'row', alignItems: 'center', gap: rv(8)},
  dot: {
    width: rs(7),
    height: rs(7),
    borderRadius: RADIUS.pill,
    backgroundColor: withAlpha(T1, 0.16),
  },
  dotOn: {backgroundColor: T2, width: rs(20)},
  dotDone: {backgroundColor: withAlpha(ACCENT, 0.5)},

  // 상단 시작(정본 — 콘텐츠 상단 정렬): 구 justifyContent center 폐지.
  body: {flexGrow: 1, padding: SPACE.xl, paddingBottom: SPACE.xxl, gap: SPACE.lg},
  stepWrap: {gap: SPACE.md},
  eyebrow: {
    color: ACCENT,
    fontFamily: FONT,
    fontSize: TYPE.label.fontSize,
    fontWeight: '700',
    letterSpacing: 1,
  },
  shoeName: {
    color: T1,
    fontFamily: DISPLAY,
    fontSize: TYPE.display.fontSize,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: rf(40),
  },
  stepTitle: {
    color: T1,
    fontFamily: DISPLAY,
    fontSize: TYPE.title1.fontSize,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  lede: {
    color: T2,
    fontFamily: FONT,
    fontSize: TYPE.heading.fontSize,
    fontWeight: '500',
    lineHeight: rf(25),
  },

  // ── 보관 완료(스텝 4) ────────────────────────────────────────────────────────
  // 수명 링이 끝까지 찬 상태를 그대로 축소한 표식 — Ember 는 '진행/러닝 에너지'
  // 허용 범위 안이다(DESIGN.md §1). 채우지 않고 테두리만 써서 성취 축하가 아니라
  // 완결의 톤으로 남긴다.
  doneMark: {
    alignSelf: 'center',
    width: rs(56),
    height: rs(56),
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: withAlpha(RING_ACCENT, 0.55),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: rv(8),
  },
  doneTitle: {
    color: T1,
    fontFamily: DISPLAY,
    fontSize: TYPE.title1.fontSize,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  doneSub: {
    color: T3,
    fontFamily: FONT,
    fontSize: TYPE.body.fontSize,
    textAlign: 'center',
    marginTop: rv(-4),
  },
  archivedCard: {
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    gap: rv(3),
  },
  archivedName: {
    color: T1,
    fontFamily: FONT,
    fontSize: TYPE.heading.fontSize,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  archivedMeta: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize},
  divider: {flexDirection: 'row', alignItems: 'center', gap: SPACE.sm},
  dividerLine: {flex: 1, height: 1, backgroundColor: SEP},
  dividerText: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize},
  inviteCopy: {
    color: T2,
    fontFamily: FONT,
    fontSize: TYPE.heading.fontSize,
    fontWeight: '500',
    lineHeight: rf(25),
    textAlign: 'center',
  },
  ledeStrong: {color: T1, fontWeight: '700'},
  dateRange: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '500'},
  note: {
    color: T3,
    fontFamily: FONT,
    fontSize: TYPE.label.fontSize,
    lineHeight: rf(20),
    marginTop: SPACE.xs,
  },

  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  // 표면도 불투명 CARD_DIM → 반투명 유리(GLASS.fill) — 다른 화면 카드 재질과 통일.
  card: {
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  basicCard: {paddingHorizontal: SPACE.lg, marginTop: SPACE.xs},
  basicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.md, // 구 SPACE.md+2 산수 폐지 — 스케일 값으로 수렴
  },
  basicRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEP,
  },
  basicLabel: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '500'},
  basicValue: {color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700'},

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
    fontSize: TYPE.title.fontSize,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  gridLabel: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(4)},

  gradeBadge: {
    alignSelf: 'flex-start',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingHorizontal: SPACE.md, // 구 SPACE.md+2 산수 폐지
    paddingVertical: SPACE.sm,
  },
  gradeText: {fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},

  momentCard: {
    padding: SPACE.lg,
    gap: rv(6),
    borderColor: withAlpha(ACCENT, 0.3),
  },
  momentLabel: {
    color: ACCENT,
    fontFamily: FONT,
    fontSize: TYPE.caption.fontSize,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  momentValue: {
    color: T1,
    fontFamily: DISPLAY,
    fontSize: TYPE.title.fontSize,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  hlCard: {paddingHorizontal: SPACE.lg},
  hlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.md, // 구 SPACE.md+1 산수 폐지
  },
  hlRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEP,
  },
  hlText: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600'},

  formatRow: {flexDirection: 'row', gap: SPACE.sm},
  // 불투명 CARD_HI → 유리(GLASS.fill + GlassEdge 헤어라인) — 형제 세그먼트 문법.
  formatBtn: {
    flex: 1,
    minHeight: rs(42),
    borderRadius: RADIUS.sm,
    borderCurve: 'continuous',
    backgroundColor: GLASS.fill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  formatBtnOn: {
    borderColor: withAlpha(ACCENT, 0.6),
    backgroundColor: withAlpha(ACCENT, 0.14),
  },
  formatTxt: {color: T3, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  formatTxtOn: {color: ACCENT},

  // 불투명 CARD → 유리(GLASS.fill + GlassEdge) — 카드 재질 통일. SVG 카드가 면을 다
  // 덮으므로 표면은 로딩 순간의 배경 역할만 한다.
  preview: {
    aspectRatio: 1,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: GLASS.fill,
  },
  // 스토리(1080×1920) 미리보기 — 9:16 비율, 중앙 정렬(폭은 런타임 계산).
  previewStory: {
    aspectRatio: 9 / 16,
    alignSelf: 'center',
  },

  footer: {
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SEP,
  },
  footRow: {flexDirection: 'row', gap: SPACE.md},
  // 보조(취소/이전) ghost 버튼 박스 — 모서리는 primary(단일 Button=RADIUS.btn)와 통일.
  btn: {
    flex: 1,
    minHeight: rs(54),
    borderRadius: RADIUS.btn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFull: {flex: 0},
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: withAlpha(T1, 0.16),
  },
  // primary(다음/확정/완료)는 단일 Button 프리미티브로 라우팅 — 그라데이션/글로우/RADIUS.btn.
  // 여기선 박스 크기만(ghost 형제와 동일 flex/height 로 페어 정렬).
  btnPrimary: {flex: 1, minHeight: rs(54)},
  btnTxt: {fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
});

export default RetirementFlow;
