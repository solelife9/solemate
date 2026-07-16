// ============================================================================
// ShoesScreen.rn.tsx — 신발 locker + 신발 상세 (ShoeDetail)
// (sample data removed — real shoes/runs/totals injected via props)
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import { View, Text, ScrollView, Pressable, TextInput, Alert, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BG, CARD_HI, GLASS, ACCENT, DANGER, WARN, GOOD, BEST, T1, T2, T3, T4, SEP, FONT, DISPLAY, withAlpha, RADIUS, GUTTER, Shoe, Run, SHOES, TYPE,
  BAR,
} from './theme';
import { TabBar, TABBAR_CLEARANCE, Pill, InjuryBanner, Button, SwipeBack, AmbientBackdrop, Rise, GlassEdge } from './primitives';
import { RunCard, RunDetail } from './HistoryScreen.rn';
import { FuelGauge } from './FuelGauge';
import FirstShoeScreen from './FirstShoeScreen.rn';
import { Unit, displayNum } from './lib/units';
import { wearTier, WearTierTone, SHOE_REPLACE_PCT, clampMaxKm } from './lib/shoe';
import { assessShoeInjuryRisk } from './lib/injury';
import { buildWearView, forecastConfidenceKo, forecastLineKo, type ReplacementForecast, type Surface } from './lib/wearView';
import { findShoeClass, typeLabel, purposeSentenceKo } from './data/shoeClass';
import RetirementFlow from './RetirementFlow.rn';
import type { ProgressionContext, RetiredShoeRecord } from './lib/progression/types';

// lastWorn: 이 신발의 마지막 착용일(런에서 파생, 한국어 표기). 미착용이면 생략.
// avgPace: 이 신발로 달린 런들의 평균 페이스(예 "5'30\"" / 기록 없으면 '--'). 신발끼리
// 페이스를 비교할 수 있게 상세·목록 카드에 함께 노출한다.
export type ShoeTotals = { totalRuns: number; totalTime: string; avgPace: string; lastWorn?: string };

// 마모 4단계(사용률%) → 색/라벨. 톤→theme 토큰(raw hex 0). 최상🟢/좋음🟡/교체고려🟠/교체권장🔴.
const TONE_COLOR: Record<WearTierTone, string> = { good: BEST, mid: GOOD, warn: WARN, danger: DANGER };
const condColor = (pct: number) => TONE_COLOR[wearTier(pct).tone];
const ringColor = (pct: number) => TONE_COLOR[wearTier(pct).tone];
// 상태 점(shoeCondDot)이 이미 색 동그라미라, 라벨의 이모지(🟢/🟡/🟠/🔴)는 중복이므로 뺀다.
const condLabel = (pct: number) => wearTier(pct).label;

// ── shoe detail ───────────────────────────────────────────────────────────────
function ShoeDetail({
  shoe, idx, runs, totals, unit, weightKg, surfaceOf, onBack, onRename, onDelete, onRetire, onSetMaxKm,
  rawShoe, rawRuns, progressionCtx, equippedTitle, onRetiredKeepsake, now, allShoes,
}: {
  shoe: Shoe;
  idx: number;
  runs: Run[];
  /** 전체 신발 목록(RunCard 의 run.shoe 인덱스 해석용 — 기록탭과 동일 배열). */
  allShoes: Shoe[];
  totals: ShoeTotals;
  unit: Unit;
  // 실효 마모/교체 예측 보정값. 체중(kg)은 settings.weightKg 재사용(미설정 시 기준 1.0),
  // surfaceOf 는 런별 노면 태그 조회(미제공/미태그 시 road). 둘 다 표시 파생용.
  weightKg?: number;
  surfaceOf?: (runId: string) => Surface;
  onBack: () => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onRetire?: (id: string, retired: boolean) => void;
  // 신발별 수명(max_km) 조정 — 교체 임계의 분모를 사용자가 직접 보정한다.
  onSetMaxKm?: (id: string, maxKm: number) => void;
  // 키프세이크 은퇴 플로우 입력(선택). 셋 다 있으면 수명 도달 시 [계속 사용]/[은퇴]
  // 트리거 + 3스텝 회고 + 카드를 띄운다(buildRetirementSummary 가 실데이터로 요약).
  rawShoe?: BackendShoe | null;
  rawRuns?: readonly BackendRun[];
  progressionCtx?: ProgressionContext;
  equippedTitle?: string | null;
  onRetiredKeepsake?: (record: RetiredShoeRecord) => void;
  now?: number;
}) {
  // 비율은 km 절대값, 표시 숫자만 표시 단위로 환산한다.
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const remain = displayNum(remainKm, unit);
  const usedDisp = displayNum(shoe.used, unit);
  const maxDisp = displayNum(shoe.max, unit);
  // 상세 컨디션은 목록 카드와 **동일하게** 사용률(km%) 기반 wearTier(4단계)로 판정한다.
  // (이전엔 shoe.condition 3단계라 '양호'를 무조건 '최상의 컨디션'으로 표시 → 목록과 불일치 버그.)
  const detailWearPct = shoe.max > 0 ? (shoe.used / shoe.max) * 100 : 0;
  const retired = !!shoe.retired;
  const shoeRuns = runs.filter((r) => r.shoe === idx);
  // 사용자 DB(shoes.json): 종류(type)+추천 용도(recommended). 종류는 칩, 추천 용도는 recommended.
  const detailClass = findShoeClass(shoe.brand, shoe.model);
  // 실효 마모/교체 예측(차별점): 단순 누적 km 가 아니라 체중·노면·페이스·세월 보정 "진짜
  // 마모"와 "이 페이스면 약 N주 후 교체"를 파생한다(lib/wearView → wearModel/forecast 재사용).
  // 원본 shoe/run 은 읽기만 한다(A6-1). 모든 엣지에서 NaN/음수 없음(A6-2).
  const wearView = buildWearView(shoe, shoeRuns, { weightKg, surfaceOf });
  // 교체 예상(상세 카드, 핸드오프 정합): '현재 패턴 기준 약 N주 후 교체 예상이에요'.
  // ok 예측에서만 주수를 노출한다(overdue/예측불가는 카드 숨김 — 교체는 keep-going 배너가 담당).
  // 조건부 노출(2026-07-04 사용자 질문 → CD 결정): 예측이 8주 이내로 가까울 때만
  // 카드를 보인다 — 새 신발의 '40주 후'는 행동을 못 이끄는 노이즈, 카드의 등장
  // 자체가 '슬슬 준비하라'는 신호가 되게. 엔진은 그대로(교체 예보 푸시의 기반).
  const REPLACE_CARD_WEEKS = 8;
  const rawReplaceWeeks =
    wearView.forecast?.reason === 'ok' && wearView.forecast.weeksRemaining != null
      ? Math.max(1, Math.round(wearView.forecast.weeksRemaining))
      : null;
  const detailReplaceWeeks =
    rawReplaceWeeks != null && rawReplaceWeeks <= REPLACE_CARD_WEEKS ? rawReplaceWeeks : null;
  // 예측 투명성(탑티어 1-1): 정확도(confidence)를 사용자에게 노출.
  const detailConfHigh = wearView.forecast?.confidence === 'high';
  const detailConfLabel = forecastConfidenceKo(wearView.forecast);
  // 부상예방 경고(주의/위험) — shoeHealth 와 같은 마모 분모(used/max)로 판정한다.
  // 안전 등급/보관 신발은 경고를 노출하지 않는다(보관됨 상태와의 모순 방지).
  const injury = assessShoeInjuryRisk(shoe);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(`${shoe.brand} ${shoe.model}`.trim());
  // 신발 수명(교체거리 max_km) 편집 — 등록 후에도 바꿀 수 있게(무거운 러너·트레일·모델
  // 오선택 보정). ±50km 스텝을 clampMaxKm(100~2000)로 보정해 onSetMaxKm 로 즉시 반영.
  const [maxEditOpen, setMaxEditOpen] = useState(false);
  const stepMaxKm = (deltaKm: number) => { if (shoe.id) onSetMaxKm?.(String(shoe.id), clampMaxKm((Number(shoe.max) || 0) + deltaKm)); };
  // 런 상세 — 기록탭과 같은 RunDetail 재사용(읽기 전용: 삭제/편집은 기록탭 담당).
  const [selRun, setSelRun] = useState<Run | null>(null);

  // ── 추가 스탯(2026-07-04, CD 추천 확정): 최장 런(이 신발의 베스트) · 주 평균
  //    (최근 4주 — '약 N주 후 교체 예상'의 근거를 눈에 보이게) · 첫 착용부터 함께한
  //    기간 · 로테이션 점유율(최근 4주 러닝 중 이 신발 비중 — 우리만의 문장).
  const extra = useMemo(() => {
    const longest = shoeRuns.reduce((m, r) => Math.max(m, r.dist), 0);
    const parse = (iso?: string) => {
      if (!iso) return null;
      const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
      const t = new Date(y, m - 1, d).getTime();
      return Number.isFinite(t) ? t : null;
    };
    const now = Date.now();
    const cut = now - 28 * 86400000;
    let shoe4w = 0;
    let all4w = 0;
    for (const r of runs) {
      const t = parse(r.runDate);
      if (t == null || t < cut || t > now) continue;
      all4w += r.dist;
      if (r.shoe === idx) shoe4w += r.dist;
    }
    const weeklyAvg = shoe4w / 4;
    const sharePct = all4w > 0 ? Math.round((shoe4w / all4w) * 100) : null;
    let firstWornLabel = '';
    let firstMs = Infinity;
    for (const r of shoeRuns) { const t = parse(r.runDate); if (t != null && t < firstMs) firstMs = t; }
    if (Number.isFinite(firstMs) && firstMs !== Infinity) {
      const d = new Date(firstMs);
      firstWornLabel = `${d.getMonth() + 1}월 ${d.getDate()}일부터`;
    }
    return { longest, weeklyAvg, sharePct, firstWornLabel };
  }, [shoeRuns, runs, idx]);


  // 키프세이크 은퇴 플로우: 수명 도달 신발만 [계속 사용]/[은퇴]를 노출한다(자동 은퇴 절대
  // 금지 — 사용자가 [은퇴]를 눌러야만 flowOpen). [계속 사용]을 누르면 이번 세션 동안
  // 트리거를 접는다(kept). 영속 데이터·런/신발은 건드리지 않는다.
  const [flowOpen, setFlowOpen] = useState(false);
  const [kept, setKept] = useState(false);
  // 수명 도달 판정 = 사용률 임계 숫자 비교(구 3단계 condition==='교체' 폐지, 2026-07-11).
  // 임계 90%는 wearTier '교체 권장'·교체 알림과 동일(SHOE_REPLACE_PCT 단일 소스).
  const atLifespan = detailWearPct >= SHOE_REPLACE_PCT;
  const keepsakeReady = !retired && !!rawShoe && !!progressionCtx;

  const saveName = () => {
    const v = name.trim();
    if (shoe.id && v) onRename?.(shoe.id, v);
    setEditing(false);
  };
  // 보관/복원: 런 기록을 보존한 채 신발만 선택목록에서 숨기거나 되돌린다.
  const toggleRetire = () => {
    if (!shoe.id) return;
    if (retired) { onRetire?.(shoe.id, false); return; }
    Alert.alert('신발 보관', `${shoe.brand} ${shoe.model}을(를) 보관할까요?\n러닝 기록은 그대로 남고, 러닝 시작 목록에서만 숨겨져요.`, [
      { text: '취소', style: 'cancel' },
      { text: '보관', onPress: () => onRetire?.(shoe.id!, true) },
    ]);
  };
  const confirmDelete = () => {
    Alert.alert('신발 삭제', `${shoe.brand} ${shoe.model}을(를) 삭제할까요?\n러닝 기록은 그대로 남아요. 신발만 락커에서 사라져요.`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { if (shoe.id) onDelete?.(shoe.id); onBack(); } },
    ]);
  };

  const insets = useSafeAreaInsets();

  // 은퇴 키프세이크 플로우(전체화면 오버레이) — 사용자가 [은퇴]를 눌렀을 때만. 확정은
  // flow 내부에서 기존 경로(onRetire)를 호출하고 키프세이크를 영속한다. 완료/취소 시 닫고,
  // 실제 은퇴가 됐으면(rawShoe.retired 반영 전이라도) 상세를 빠져나가 잠금장으로 복귀한다.
  if (flowOpen && keepsakeReady && rawShoe) {
    return (
      <RetirementFlow
        shoe={rawShoe}
        runs={rawRuns ?? []}
        ctx={progressionCtx!}
        now={now}
        unit={unit}
        equippedTitle={equippedTitle ?? null}
        onRetire={onRetire}
        onRetired={onRetiredKeepsake}
        onClose={() => { setFlowOpen(false); onBack(); }}
      />
    );
  }

  // 런 상세(기록탭 RunDetail 재사용) — 카드 탭으로 진입, 뒤로가면 신발 상세 복귀.
  if (selRun) {
    return (
      <RunDetail run={selRun} shoe={allShoes[selRun.shoe]} unit={unit} onBack={() => setSelRun(null)} />
    );
  }

  return (
    // 엣지 스와이프 백 — 왼쪽 가장자리 우측 드래그로 락커 목록 복귀(iOS pop 제스처 대응).
    <SwipeBack onBack={onBack}>
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <AmbientBackdrop />
      <View style={s.detailNav}>
        <Pressable onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}><Ionicons name="chevron-back" size={ri(20)} color={T1} /></Pressable>
        <View style={{ flexDirection: 'row', gap: rv(10) }}>
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={6} accessibilityRole="button" accessibilityLabel="이름 편집" style={s.iconBtn}><Ionicons name="pencil" size={ri(16)} color={T2} /></Pressable>
          <Pressable onPress={confirmDelete} hitSlop={6} accessibilityRole="button" accessibilityLabel="신발 삭제" style={s.iconBtn}><Ionicons name="trash-outline" size={ri(16)} color={DANGER} /></Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: rs(18), paddingBottom: rv(28), gap: rv(16) }} keyboardShouldPersistTaps="handled">
        {editing ? (
          <View style={[s.card, { padding: rs(16), gap: rv(12) }]}>
            <GlassEdge glints={false} radius={RADIUS.lg} />
            <Text style={s.dHeroLabel}>신발 이름</Text>
            <TextInput value={name} onChangeText={setName} style={s.editInput} placeholderTextColor={T3} accessibilityLabel="신발 이름" autoFocus />
            <View style={{ flexDirection: 'row', gap: rv(10) }}>
              <Pressable onPress={() => setEditing(false)} style={[s.editBtn, { backgroundColor: CARD_HI }]}><Text style={[s.editBtnTxt, { color: T2 }]}>취소</Text></Pressable>
              <Button label="저장" onPress={saveName} style={s.editBtn} />
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: rs(4) }}>
            {/* 헤더 한 줄(사용자 요청): 좌 = 브랜드 + 종류 칩(데일리), 우 = 컨디션 상태.
                양호: 회색 칩 + 점. 주의/교체: tier 배지(testID 유지). 보관됨은 우측에 함께. */}
            <View style={s.dHeaderRow}>
              <View style={[s.row, { flexShrink: 1, minWidth: 0 }]}>
                <Text style={s.dBrand}>{shoe.brand}</Text>
              </View>
              <View style={s.row}>
                {/* 컨디션 칩: 목록 카드와 100% 동일한 wearTier 4단계 —
                    최상의 컨디션 / 좋은 상태 / 교체 고려 / 교체 권장. (TierBadge 3단계 폐지) */}
                <View style={s.statusPill} testID={`detail-cond-${wearTier(detailWearPct).key}`}>
                  <View style={[s.statusDot, { backgroundColor: condColor(detailWearPct) }]} />
                  <Text style={s.statusPillText}>{condLabel(detailWearPct)}</Text>
                </View>
                {retired && <Pill tone="dim" label="보관됨" />}
              </View>
            </View>
            <Text style={s.dModel} numberOfLines={2}>{shoe.model}</Text>
            {/* 추천 용도 칩(디자인 09 정합). 용도 '문장'은 칩과 같은 정보의 중복이라
                삭제(상세 텍스트 다이어트, 2026-07-04 — 침묵 원칙). */}
            {!!detailClass && detailClass.recommended.length > 0 && (
              <View style={s.dTags}>
                {detailClass.recommended.map((t) => (
                  <View key={t} style={s.dTag}><Text style={s.dTagText}>{t}</Text></View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* durability — 잔여 수명 카드(목업 09): 게이지 + 수명 조정 토글 */}
        <View style={[s.card, { padding: rs(18) }]}>
          <GlassEdge glints={false} radius={RADIUS.lg} />
          <FuelGauge
            remainLabel={String(remain)}
            unit={unit}
            fillPct={shoe.max > 0 ? Math.min(1, shoe.used / shoe.max) : 0}
            usedLabel={String(usedDisp)}
            maxLabel={String(maxDisp)}
            editSlot={onSetMaxKm ? (
              <Pressable onPress={() => setMaxEditOpen((o) => !o)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`신발 수명 편집, 현재 ${maxDisp}${unit}`} style={s.maxEditToggle}>
                <Ionicons name={maxEditOpen ? 'checkmark' : 'pencil'} size={ri(13)} color={T2} />
              </Pressable>
            ) : undefined}
          />
          {maxEditOpen && onSetMaxKm && (
            <View style={s.maxStepRow}>
              <Pressable onPress={() => stepMaxKm(-50)} hitSlop={8} accessibilityRole="button" accessibilityLabel="수명 50 줄이기" style={s.maxEditToggle}><Ionicons name="remove" size={ri(16)} color={T1} /></Pressable>
              <Text style={s.maxStepVal}>수명 {maxDisp}<Text style={s.maxStepUnitTxt}> {unit}</Text></Text>
              <Pressable onPress={() => stepMaxKm(50)} hitSlop={8} accessibilityRole="button" accessibilityLabel="수명 50 늘리기" style={s.maxEditToggle}><Ionicons name="add" size={ri(16)} color={T1} /></Pressable>
            </View>
          )}
        </View>

        {/* 부상예방 경고 배너(주의/위험) — 마모도가 임계를 넘으면 keep-going 보이스로
            교체를 권한다. 안전 등급(InjuryBanner null)·보관 신발은 미노출. */}
        {!retired && injury.level !== 'safe' && (
          <InjuryBanner level={injury.level} message={injury.message} />
        )}

        {/* '남은 수명' 옆 연필로 펼치는 신발 수명(max_km) 보정기 — ±로 교체 임계의 분모를
            직접 조정한다(기본 접힘). 보관된 신발은 조정 동선에서 제외(기록은 그대로 유지). */}

        {/* (keep-going 중복 배너 제거 2026-07-05: '지금 교체하면 부상 없이…'가 위 부상
            배너와 거의 같은 문장이라 중복이었다. 안전 신호는 부상 배너가, 은퇴의 긍정
            프레이밍은 아래 '훌륭한 여정' 카드가 담당한다.) */}

        {/* 은퇴 키프세이크 트리거(수명 도달 시) — 절대 자동 은퇴하지 않는다. 사용자가
            [계속 사용] 또는 [은퇴]를 직접 고른다. [은퇴]는 3스텝 회고+카드 플로우를 연다. */}
        {keepsakeReady && atLifespan && !kept && (
          <View testID="retire-keepsake-trigger" style={[s.card, s.keepsakeCard]}>
            <Text style={s.keepsakeTitle}>훌륭한 여정이었어요</Text>
            <Text style={s.keepsakeSub}>
              {shoe.model}이(가) 권장 수명에 도달했어요. 계속 신을지, 멋지게
              은퇴시킬지는 직접 정해요.
            </Text>
            <View style={s.keepsakeBtns}>
              <Pressable
                onPress={() => setKept(true)}
                accessibilityRole="button"
                accessibilityLabel="계속 사용"
                testID="retire-keep-using"
                style={({ pressed }) => [s.keepsakeBtn, s.keepUsingBtn, pressed && s.pressed]}>
                <Text style={[s.keepsakeBtnTxt, { color: T1 }]}>계속 사용</Text>
              </Pressable>
              <Button
                label="은퇴"
                onPress={() => setFlowOpen(true)}
                icon="ribbon-outline"
                testID="retire-open-flow"
                style={s.retireFlowBtn}
              />
            </View>
          </View>
        )}

        {/* 계속 사용 후에도 은퇴 진입점 유지(2026-07-05): [계속 사용]을 누르면 카드가
            사라져 '은퇴 어떻게 시키지?'가 되던 문제 — 조용한 링크 하나를 남긴다. */}
        {keepsakeReady && atLifespan && kept && (
          <Pressable
            onPress={() => setFlowOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="이 신발 은퇴시키기"
            testID="retire-open-flow"
            style={({ pressed }) => [s.retireLink, pressed && s.pressed]}>
            <Ionicons name="ribbon-outline" size={ri(15)} color={T3} />
            <Text style={s.retireLinkTxt}>이 신발 은퇴시키기</Text>
            <Ionicons name="chevron-forward" size={ri(14)} color={T4} />
          </Pressable>
        )}

        {/* (다음 러닝화 쇼핑 추천은 어필리에이트 정식 도입 전까지 상세에서 숨김 —
            2026-07-05: 수명 다한 상세가 쇼핑 카드로 조잡해진다는 사용자 피드백. 재도입 시
            NextShoeCard 되살리면 됨.) */}

        {/* totals — 3×2 그리드(2026-07-04 확장): 기존 4개 + 최장 런(이 신발의 베스트)
            + 주 평균(최근 4주 — 교체 예상의 근거). 아래에 점유율 한 줄(로테이션 인사이트). */}
        <View style={[s.card, { overflow: 'hidden' }]}>
          <GlassEdge glints={false} radius={RADIUS.lg} />
          <View style={s.statGrid}>
            {[
              { v: String(usedDisp), u: unit, l: '누적 거리' },
              { v: String(totals.totalRuns), u: '회', l: '러닝 횟수' },
              { v: totals.totalTime, u: '', l: '러닝 시간' },
              { v: totals.avgPace, u: totals.avgPace !== '--' ? '/km' : '', l: '평균 페이스' },
              { v: extra.longest > 0 ? String(displayNum(extra.longest, unit, 1)) : '--', u: extra.longest > 0 ? unit : '', l: '최장 러닝' },
              { v: extra.weeklyAvg > 0 ? String(displayNum(extra.weeklyAvg, unit, 1)) : '--', u: extra.weeklyAvg > 0 ? unit : '', l: '주 평균 · 4주' },
            ].map((x, i) => (
              <View key={i} style={s.statGridCell3}>
                <Text style={s.statValue}>{x.v}<Text style={s.statUnit}>{x.u}</Text></Text>
                <Text style={s.statLabel}>{x.l}</Text>
              </View>
            ))}
          </View>
          {extra.sharePct != null && extra.sharePct > 0 && (
            <Text style={s.shareLine} testID="shoe-share-line">
              최근 4주 러닝의 <Text style={{ color: T1, fontWeight: '700' }}>{extra.sharePct}%</Text>를 이 신발과 달렸어요
            </Text>
          )}
        </View>

        {/* 교체 예상 카드(목업 09: 통계 아래) — 핸드오프 문구 '현재 패턴 기준 약 N주 후
            교체 예상이에요'. ok 예측에서만 노출(보관/예측없음/overdue 면 숨김). */}
        {!retired && detailReplaceWeeks != null && (
          <View style={[s.card, s.wearCard]}>
            <GlassEdge glints={false} radius={RADIUS.lg} />
            <View style={s.wearLabelRow}>
              <Text style={s.wearLabel}>교체 예상</Text>
              <View style={[s.confChip, detailConfHigh ? s.confChipHi : s.confChipLo]}>
                <View style={[s.confDot, { backgroundColor: detailConfHigh ? GOOD : T3 }]} />
                <Text style={[s.confChipText, { color: detailConfHigh ? GOOD : T3 }]}>{detailConfLabel}</Text>
              </View>
            </View>
            <Text style={s.replaceForecastText}>약 <Text style={s.dForecastBold}>{detailReplaceWeeks}주 후</Text> 교체 예상</Text>
          </View>
        )}

        {/* runs */}
        <View style={[s.row, { paddingHorizontal: rs(4), justifyContent: 'space-between' }]}>
          <Text style={s.sectionLabel}>이 신발로 달린 기록</Text>
          {!!totals.lastWorn && (
            <Text style={s.lastWorn}>
              {extra.firstWornLabel ? `${extra.firstWornLabel} · ` : ''}마지막 착용 {totals.lastWorn}
            </Text>
          )}
        </View>
        {shoeRuns.length === 0 ? (
          <View style={[s.card, { padding: rs(24), alignItems: 'center' }]}>
            <GlassEdge glints={false} radius={RADIUS.lg} />
            <Text style={{ color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize }}>아직 기록이 없어요</Text>
          </View>
        ) : (
          // 기록탭과 완전히 같은 행(RunCard 재사용, 2026-07-04 사용자 결정) — '이 신발로
          // 얼마나 어떻게 달렸는지'를 기록탭의 언어 그대로 신발별로 모아 보여준다.
          <View style={{ gap: rv(10) }}>
            {shoeRuns.map((r, i) => (
              <RunCard key={r.id || i} run={r} shoes={allShoes} unit={unit} hideShoe onPress={() => setSelRun(r)} />
            ))}
          </View>
        )}

        {/* 신발 보관(아카이브) — 하단 전체폭 버튼(danger 외곽선). 키프세이크 '은퇴'(명예의
            전당 기록)와 구분되는 단순 보관 동선이다: 런 기록은 보존한 채 선택목록에서만
            숨긴다. 이미 보관된 신발은 '복원'으로 토글한다(키프세이크 기록 없음). */}
        {shoe.id && onRetire && (
          <Pressable
            onPress={toggleRetire}
            accessibilityRole="button"
            accessibilityLabel={retired ? '복원' : '보관 처리'}
            style={({ pressed }) => [retired ? s.restoreBtn : s.retireBtn, pressed && s.pressed]}>
            <Ionicons name={retired ? 'arrow-undo-outline' : 'archive-outline'} size={ri(16)} color={retired ? T2 : DANGER} />
            <Text style={[s.retireBtnText, { color: retired ? T2 : DANGER }]}>{retired ? '복원' : '보관 처리'}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
    </SwipeBack>
  );
}

// ── locker ─────────────────────────────────────────────────────────────────
function ShoeCard({ shoe, onPress, onPlay, unit, pace: _pace, forecast }: { shoe: Shoe; onPress: () => void; onPlay?: () => void; unit: Unit; pace?: string; forecast?: ReplacementForecast | null }) {
  // 교체 예측 한 줄(#2) — '약 N주 후 교체 예상' / 임박(overdue). ok·overdue 일 때만.
  // ok 예측은 8주 이내로 임박했을 때만(상세와 동일 — 등장이 곧 신호). overdue 는 항상.
  const fcNear = forecast?.reason === 'ok' && forecast.weeksRemaining != null && forecast.weeksRemaining <= 8;
  const fcLine = forecast && (fcNear || forecast.reason === 'overdue') ? forecastLineKo(forecast) : null;
  const fcOverdue = forecast?.reason === 'overdue';
  const retired = !!shoe.retired;
  const usedDisp = displayNum(shoe.used, unit);
  const maxDisp = displayNum(shoe.max, unit);
  // 사용률(%) — 라벨바 채움(목업 LifeBar 정합). 비율은 km 절대값으로(단위 불변).
  const usedPct = shoe.max > 0 ? Math.min(100, Math.round((shoe.used / shoe.max) * 100)) : 0;
  // 마모 색/라벨은 실제 사용률(km 기준, 100% 초과 가능)로 — 4단계 컨디션.
  const wearPct = shoe.max > 0 ? (shoe.used / shoe.max) * 100 : 0;
  const ring = ringColor(wearPct);
  // 사용자 DB: 종류(type)→칩, 추천 용도(recommended)→자연어 문장(핸드오프 purpose 정합).
  const cardClass = findShoeClass(shoe.brand, shoe.model);
  const cardType = typeLabel(cardClass?.type);
  const cardPurpose = purposeSentenceKo(cardClass?.recommended);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // 카드 정보(컨디션·남은 수명·교체 예측)를 label 에 합성한다 — 카드가 하나의
      // 접근성 요소로 붕괴되며 내부 텍스트가 낭독 안 되던 문제(2026-07-05 a11y 감사).
      accessibilityLabel={`${shoe.brand} ${shoe.model}, 컨디션 ${condLabel(wearPct)}, 남은 수명 ${Math.max(0, 100 - usedPct)}%${fcLine ? `, ${fcLine}` : ''}, 상세 보기`}
      // 달리기 버튼이 카드에 삼켜져(부모 accessible) VoiceOver 로 도달 불가하던 것을
      // iOS 표준 커스텀 동작으로 노출 — 로터/위아래 스와이프로 '달리기' 실행(레이아웃 무변경).
      accessibilityActions={!retired && onPlay ? [{ name: 'run', label: `${shoe.brand} ${shoe.model}로 달리기` }] : undefined}
      onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'run') onPlay?.(); }}
      style={({ pressed }) => [s.shoeCard, retired && s.shoeCardRetired, pressed && s.pressed]}>
      {/* 코너 페이드 헤어라인 — 전 카드 동일(2026-07-11 헤어라인 통일: 구 '사용중' 카드의
          20% 시감을 theme.GLASS.edgeBase 로 승격, 카드별 intensity 차등 폐지). 보관 카드는
          shoeCardRetired 의 카드 전체 opacity 로 함께 가라앉는다. */}
      <GlassEdge glints={false} radius={RADIUS.lg} />
      {/* 상단: 좌(브랜드·모델) ↔ 우(컨디션 위 · 화살표/▶ 아래) — 사진 정합 */}
      <View style={s.shoeTopSection}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[s.row, { flexShrink: 1, minWidth: 0 }]}>
            <Text style={s.shoeBrand}>{shoe.brand}</Text>
            {!!cardType && <View style={s.cardTypeChip}><Text style={s.cardTypeChipText}>{cardType}</Text></View>}
            {/* '사용 중' 라벨 제거(사용자 확정 2026-07-11) — 카드 간 구분 없이 동일 취급. */}
            {retired && <Pill tone="dim" label="보관됨" />}
          </View>
          <Text style={s.shoeModel} numberOfLines={2}>{shoe.model}</Text>
        </View>
        <View style={s.shoeRightCol}>
          <View style={s.shoeCondRow}>
            <View testID={`cond-dot-${wearTier(wearPct).key}`} style={[s.shoeCondDot, { backgroundColor: condColor(wearPct) }]} />
            <Text style={[s.shoeCondText, { color: T2 }]} numberOfLines={1}>{condLabel(wearPct)}</Text>
          </View>
          {!retired && onPlay ? (
            <Pressable onPress={onPlay} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${shoe.brand} ${shoe.model}로 달리기`} style={({ pressed }) => [s.cardPlay, pressed && s.pressed]} testID={shoe.id ? `shoe-play-${shoe.id}` : undefined}>
              <Ionicons name="play" size={ri(14)} color={T2} />
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={ri(18)} color={T3} />
          )}
        </View>
      </View>
      {/* 추천 용도(러닝 종류) — 중간(사진 정합). 모델 매칭 시만. */}
      {!!cardPurpose && <Text style={s.shoePurpose} numberOfLines={2}>{cardPurpose}</Text>}
      {/* 누적 거리(큰 숫자) + 교체까지 남은 거리(문장형) — 목업 lifeRow 정합 */}
      {/* 마모 4중 노출 병합(노이즈 감사 2026-07-05): '교체까지 Nkm' 문장·'총 Nkm' 정적값
          제거 — 큰 숫자(누적) + 바 + '남은 수명 %' 하나면 충분하다. */}
      <View style={s.shoeLifeRow}>
        <View style={s.baselineRow}>
          <Text style={s.shoeUsedNum}>{usedDisp}</Text>
          <Text style={s.shoeUsedU}>{unit}</Text>
        </View>
      </View>
      {/* 라벨바 = 남은 수명 게이지(배터리 방향, 홈 히어로 링과 통일 — 사용자 결정).
          새 신발 = 가득 찬 바, 닳을수록 비워진다. 색은 컨디션(마모) 기준 그대로. */}
      <View style={s.shoeBar}><View style={[s.shoeBarFill, { width: `${Math.max(0, 100 - usedPct)}%`, backgroundColor: retired ? T3 : ring }]} /></View>
      {/* 총 내구도(분모) 복원(2026-07-05 사용자): %는 상대값이라 총 km 가 있어야 신발끼리
          비교가 선다(마라톤화 500 vs 데일리 800). 문장(교체까지 Nkm)만 중복이라 제거 유지. */}
      <View style={s.shoeBarLabels}>
        <Text style={s.shoeBarLabel}>남은 수명 {Math.max(0, 100 - usedPct)}%</Text>
        <Text style={s.shoeBarLabel}>총 {maxDisp}{unit}</Text>
      </View>
      {/* 교체 예측 한 줄(#2) — 실효마모 모델 전면화. ok/overdue 일 때만. */}
      {fcLine && !retired && (
        <View style={s.fcRow} testID={shoe.id ? `shoe-forecast-${shoe.id}` : undefined}>
          <Ionicons name={fcOverdue ? 'alert-circle' : 'time-outline'} size={ri(13)} color={fcOverdue ? WARN : T3} />
          <Text style={[s.fcText, fcOverdue && { color: WARN, fontWeight: '600' }]} numberOfLines={1}>{fcLine}</Text>
        </View>
      )}
    </Pressable>
  );
}


export default function ShoesScreen({
  shoes = SHOES, runs = [], totals = {}, unit = 'km', weightKg, surfaceOf, onAddShoe, onTab, onRename, onDelete, onRetire, onSetMaxKm, onStartRun,
  detailShoeId, onConsumeDetail,
  rawShoes, rawRuns, progressionCtx, equippedTitle, onRetiredKeepsake, now, userName,
  forecasts,
}: {
  userName?: string;
  shoes?: Shoe[];
  // 신발 id별 교체 예측(App 이 실효마모 모델로 계산). 락커 목록에 '약 N주 후 교체' 한 줄 +
  // 교체 임박 신발 상단 정렬 + '곧 교체할 신발 N켤레' 요약에 쓴다(표시 전용, 미주입 시 폴백).
  forecasts?: Record<string, ReplacementForecast | null>;
  runs?: Run[];
  totals?: Record<number, ShoeTotals>;
  // (activeIdx '사용 중' 강조 prop 제거 2026-07-11 — 카드 간 구분 없이 동일 취급.)
  // 실효 마모/교체 예측 보정값(상세 화면 전달). 체중=settings.weightKg 재사용,
  // surfaceOf=런별 노면 태그 조회. 둘 다 선택(미제공 시 기준 1.0·road).
  weightKg?: number;
  surfaceOf?: (runId: string) => Surface;
  // 외부(홈 히어로 탭)에서 특정 신발 상세를 바로 연다. id가 들어오면 그 신발 상세로
  // 진입하고 onConsumeDetail로 한 번만 소비한다(뒤로가기는 내부 detail 상태로 복귀).
  detailShoeId?: string | null;
  onConsumeDetail?: () => void;
  // 표시 단위(km|mi). 수명·기록 거리가 이를 따른다.
  unit?: Unit;
  onAddShoe?: () => void;
  onTab?: (i: number) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onRetire?: (id: string, retired: boolean) => void;
  // 신발별 수명(max_km) 조정 — 상세 화면 수명 편집기가 호출한다.
  onSetMaxKm?: (id: string, maxKm: number) => void;
  // shoe-first 동선: 상세 CTA·락커 카드 play에서 해당 신발 id로 런 시작을 알린다.
  onStartRun?: (id: string) => void;
  // 은퇴 키프세이크 플로우 입력(선택, 상세 화면으로 전달). 서버 행/진척 컨텍스트가
  // 있어야 buildRetirementSummary 가 실데이터 요약을 만들 수 있다.
  rawShoes?: readonly BackendShoe[];
  rawRuns?: readonly BackendRun[];
  progressionCtx?: ProgressionContext;
  equippedTitle?: string | null;
  onRetiredKeepsake?: (record: RetiredShoeRecord) => void;
  now?: number;
}) {
  const [detail, setDetail] = useState<number | null>(() => {
    if (!detailShoeId) return null;
    const i = shoes.findIndex((sh) => sh.id === detailShoeId);
    return i >= 0 ? i : null;
  });
  // 홈 히어로에서 넘어온 신발 id를 상세로 연다(한 번만 소비).
  useEffect(() => {
    if (!detailShoeId) return;
    const i = shoes.findIndex((sh) => sh.id === detailShoeId);
    if (i >= 0) setDetail(i);
    onConsumeDetail?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailShoeId]);
  const insets = useSafeAreaInsets();

  if (detail != null && shoes[detail]) {
    const dShoe = shoes[detail];
    return (
      <ShoeDetail
        shoe={dShoe}
        idx={detail}
        runs={runs}
        allShoes={shoes}
        totals={totals[detail] || { totalRuns: 0, totalTime: '--', avgPace: '--' }}
        unit={unit}
        weightKg={weightKg}
        surfaceOf={surfaceOf}
        onBack={() => setDetail(null)}
        onRename={onRename}
        onDelete={onDelete}
        onRetire={onRetire}
        onSetMaxKm={onSetMaxKm}
        rawShoe={rawShoes?.find((rs) => rs.id === dShoe.id) ?? null}
        rawRuns={rawRuns}
        progressionCtx={progressionCtx}
        equippedTitle={equippedTitle}
        onRetiredKeepsake={onRetiredKeepsake}
        now={now}
      />
    );
  }

  // 활성 신발 0켤레 → 풍부한 빈 상태(러닝화 등록 유도). FirstShoeScreen 을 통째로 반환해
  // 헤더·탭바 중복 없이 한 화면으로 대체한다. 등록 버튼은 AddShoe 오버레이(onAddShoe)로 열린다.
  // 기준은 '전체'가 아니라 '활성'(retired 제외) — 전부 보관 처리하면 전체>0 인데 락커
  // 목록은 0장이 되는 사각지대(빈 화면)가 있었다(기기 발견 2026-07-10).
  if (!shoes.some((sh) => !sh.retired)) {
    return <FirstShoeScreen onRegister={onAddShoe} onTab={onTab} userName={userName} />;
  }

  // 교체 예측 기반 정렬·요약(#2). 교체 임박(overdue → ≤3주)일수록 상단. i(원본 인덱스)는
  // 정렬과 무관하게 보존되어 totals[i]/setDetail(i)가 그대로 맞다.
  const fcOf = (sh: Shoe): ReplacementForecast | null => (sh.id ? forecasts?.[sh.id] ?? null : null);
  const isSoon = (fc: ReplacementForecast | null) =>
    !!fc && (fc.reason === 'overdue' || (fc.reason === 'ok' && fc.weeksRemaining != null && fc.weeksRemaining <= 3));
  const urgency = (fc: ReplacementForecast | null) => {
    if (!fc) return 3;
    if (fc.reason === 'overdue') return 0;
    if (fc.reason === 'ok') return fc.weeksRemaining != null && fc.weeksRemaining <= 3 ? 1 : 2;
    return 3;
  };
  const activeShoes = shoes
    .map((sh, i) => ({ sh, i }))
    .filter(({ sh }) => !sh.retired)
    .sort((a, b) => {
      const ua = urgency(fcOf(a.sh)), ub = urgency(fcOf(b.sh));
      if (ua !== ub) return ua - ub;
      const wa = fcOf(a.sh)?.weeksRemaining ?? Infinity, wb = fcOf(b.sh)?.weeksRemaining ?? Infinity;
      return wa - wb;
    });
  const soonCount = activeShoes.filter(({ sh }) => isSoon(fcOf(sh))).length;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <AmbientBackdrop />
      <View style={s.topbar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>신발</Text>
        </View>
        <Pressable onPress={onAddShoe} accessibilityRole="button" accessibilityLabel="신발 추가" hitSlop={8} style={({ pressed }) => [s.addPill, pressed && s.pressed]}>
          <Text style={s.addPillText}>신발 추가</Text>
          <Ionicons name="add" size={ri(15)} color={T1} />
        </Pressable>
      </View>
      <Rise style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: TABBAR_CLEARANCE, gap: rv(14), paddingTop: rv(12) }}>
        {/* 교체 임박 요약(#2) — 곧 교체할 신발 N켤레. 0이면 숨김. */}
        {soonCount > 0 && (
          <View style={s.soonHeader} testID="shoes-soon-header">
            <Ionicons name="alert-circle" size={ri(16)} color={WARN} />
            <Text style={s.soonText}>곧 교체할 신발 <Text style={s.soonStrong}>{soonCount}켤레</Text></Text>
          </View>
        )}
        {activeShoes.map(({ sh, i }) => (
          <ShoeCard
            key={sh.id || i}
            shoe={sh}
            unit={unit}
            pace={totals[i]?.avgPace}
            forecast={fcOf(sh)}
            onPress={() => setDetail(i)}
            onPlay={sh.id && onStartRun ? () => onStartRun(sh.id!) : undefined}
          />
        ))}
        {/* 하단 '러닝화 등록하기' 점선 카드는 제거(사용자 결정 2026-07-02) — 상단 헤더
            '신발 추가'와 중복 진입점. 신발 0켤레는 FirstShoeScreen 빈 상태가 담당한다.
            명예의 전당 진입은 마이탭 소속(신발탭 이동안 철회). */}
      </ScrollView>
      </Rise>
      <TabBar active={1} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  card: { backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden' },
  sectionLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: 0.4, paddingHorizontal: rs(4) },
  dot: { width: rs(7), height: rs(7), borderRadius: RADIUS.pill },
  condText: { fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  condSub: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize },

  // 목업 정합: 제목 + '신발 추가' 버튼 한 줄(topbar)
  topbar: { paddingTop: rv(8), paddingHorizontal: GUTTER, paddingBottom: rv(8), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: T1, fontFamily: FONT, fontSize: TYPE.title1.fontSize, fontWeight: '800', letterSpacing: -0.9 },
  addPill: { height: rs(34), paddingHorizontal: rs(14), borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(T1, 0.2), backgroundColor: CARD_HI, flexDirection: 'row', alignItems: 'center', gap: rv(6) },
  addPillText: { color: T1, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },

  // 카드 하단 중복 진행바(track/trackFill)를 제거하고 원형 Ring 만 유지한다. 바가
  // 빠진 만큼 카드 패딩을 살짝 줄이고(20), 링(78)·모델 폰트(20)를 키워 비율을
  // 재조정했다 — 같은 pct 를 두 번 그리던 중복을 없애 시선이 링에 모인다.
  // 목업 정합: 카드 배경을 near-black(CARD_DIM)에서 살짝 떠 보이는 회색(HERO_BG — 홈
  // 히어로 카드와 동일 톤)으로 올려 black-on-black 을 피한다.
  // 보더 → 코너 페이드 헤어라인(GlassEdge glints=false, 2026-07-10 통일 스윕).
  // 2026-07-11: 카드별 intensity 차등 폐지 — 전 카드 GLASS.edgeBase(0.2) 단일 시감.
  shoeCard: { backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', padding: rs(16) },
  shoeCardRetired: { opacity: 0.55 },
  // 상단: 좌(브랜드·모델) ↔ 우(컨디션 위 · ▶/화살표 아래) — 사진 정합
  shoeTopSection: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: rv(10) },
  shoeRightCol: { alignItems: 'flex-end', gap: rv(10), flexShrink: 0 },
  shoeBrand: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '500', letterSpacing: 1.3 },
  shoeModel: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.5, lineHeight: rf(27), marginTop: rv(4) },
  shoeCondRow: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  // 종류 칩(카본 레이싱 등) — 브랜드 옆
  cardTypeChip: { backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: rs(6), paddingHorizontal: rs(8), paddingVertical: rv(2) },
  cardTypeChipText: { color: ACCENT, fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '700', letterSpacing: 0.1 },
  // 추천 용도(러닝 종류) 한 줄 — 카드 중간
  shoePurpose: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', letterSpacing: -0.1, marginTop: rv(10) },
  cardPlay: { width: rs(32), height: rs(32), borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(T1, 0.14), alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(BG, 0.3) },
  shoeCondDot: { width: rs(7), height: rs(7), borderRadius: RADIUS.pill },
  shoeCondText: { color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  // 누적 거리(큰 숫자) + 교체까지 남은 거리 — 목업 lifeRow 정합
  shoeLifeRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: rv(14), marginBottom: rv(10) },
  shoeUsedNum: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.title1.fontSize, fontWeight: '700', letterSpacing: -0.6 },
  shoeUsedU: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginLeft: rs(2) },
  shoeRemain: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  // 라벨바(목업 LifeBar): 사용/총 수명 양끝 라벨 + 가운데 평균 페이스
  shoeBar: { height: rs(BAR.md), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.1), overflow: 'hidden' },
  shoeBarFill: { height: '100%', borderRadius: RADIUS.pill },
  shoeBarLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rv(8) },
  shoeBarLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
  fcRow: { flexDirection: 'row', alignItems: 'center', gap: rv(4), marginTop: rv(8) },
  fcText: { flex: 1, color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
  soonHeader: { flexDirection: 'row', alignItems: 'center', gap: rv(8), backgroundColor: withAlpha(WARN, 0.1), borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(WARN, 0.35), paddingHorizontal: rs(12), paddingVertical: rv(10) },
  soonText: { color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  soonStrong: { color: WARN, fontWeight: '700' },
  shoePaceVal: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize },
  cardPlayAbs: { position: 'absolute', top: 14, right: 14, width: rs(36), height: rs(36), borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(T1, 0.14), alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(BG, 0.3) },
  retireBtn: { height: rs(54), borderRadius: RADIUS.md, marginTop: rv(22), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), backgroundColor: withAlpha(DANGER, 0.06), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(DANGER, 0.45) },
  restoreBtn: { height: rs(54), borderRadius: RADIUS.md, marginTop: rv(22), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), backgroundColor: 'transparent', borderWidth: 1, borderColor: withAlpha(T1, 0.14) },
  retireBtnText: { fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', letterSpacing: -0.2 },



  // detail
  detailNav: { paddingTop: rv(12), paddingHorizontal: rs(16), paddingBottom: rv(6), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: rs(38), height: rs(38), borderRadius: RADIUS.pill, backgroundColor: CARD_HI, borderWidth: 1, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },
  // 상태 칩(목업 09) — 회색 알약 + 흰 글씨 + 점(녹색 아님)
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: rv(8), backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: rs(12), paddingVertical: rv(8), alignSelf: 'flex-start' },
  statusDot: { width: rs(6), height: rs(6), borderRadius: RADIUS.pill, backgroundColor: T1 },
  statusPillText: { color: T1, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  dBrand: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '500', letterSpacing: 1.6 },
  dModel: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.display.fontSize, fontWeight: '700', letterSpacing: -0.5, marginTop: rv(2), lineHeight: rf(38) },
  dPurpose: { color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '500', letterSpacing: -0.2, lineHeight: rf(22), marginTop: rv(10) },
  dTags: { flexDirection: 'row', flexWrap: 'wrap', gap: rv(6), marginTop: rv(12) },
  dTag: { backgroundColor: CARD_HI, borderRadius: RADIUS.pill, paddingHorizontal: rs(12), paddingVertical: rv(4) },
  dTagText: { color: T2, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600' },
  // 헤더 한 줄: 좌(브랜드+종류칩) ↔ 우(컨디션). 수직 가운데 정렬.
  dHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rv(8), marginBottom: rv(10) },
  dTypeChip: { backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: RADIUS.pill, paddingHorizontal: rs(12), paddingVertical: rv(4) },
  dTypeChipText: { color: ACCENT, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 0.1 },
  dPurposeLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', marginTop: rv(16) },
  runCta: { height: rs(46), borderRadius: rs(14), backgroundColor: 'transparent', borderWidth: 1, borderColor: withAlpha(T1, 0.14), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8) },
  runCtaText: { color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', letterSpacing: -0.2 },

  // 교체 내러티브 배너(keep-going 보이스) — accent 톤 반투명 표면(withAlpha 파생).
  keepGoing: { flexDirection: 'row', alignItems: 'center', gap: rv(8), backgroundColor: withAlpha(ACCENT, 0.12), borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.35), paddingHorizontal: rs(16), paddingVertical: rv(12) },
  retireLink: { flexDirection: 'row', alignItems: 'center', gap: rv(8), paddingVertical: rv(14), paddingHorizontal: rs(4), marginTop: rv(4) },
  retireLinkTxt: { flex: 1, color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600' },
  keepGoingText: { flex: 1, color: ACCENT, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: -0.1, lineHeight: rf(18) },
  // 은퇴 키프세이크 트리거 카드(수명 도달) — 자랑스러운 톤. accent 보더로 주목.
  // 키프세이크 = 액센트 의미 보더(성취 순간 강조) — 헤어라인 스윕 예외로 RN 보더 유지.
  // (s.card 가 보더를 잃으면서 borderWidth 를 자체 소유해야 기존 시감이 보존된다.)
  keepsakeCard: { padding: rs(18), gap: rv(6), borderWidth: 1, borderColor: withAlpha(ACCENT, 0.3) },
  keepsakeTitle: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.2 },
  keepsakeSub: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(19) },
  keepsakeBtns: { flexDirection: 'row', gap: rv(10), marginTop: rv(8) },
  // 계속 사용(CARD_HI flat) — 모서리는 은퇴(단일 Button=RADIUS.btn)와 맞춰 통일.
  keepsakeBtn: { flex: 1, height: rs(50), borderRadius: RADIUS.btn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8) },
  keepUsingBtn: { backgroundColor: CARD_HI },
  // 은퇴는 단일 Button 프리미티브로 라우팅(그라데이션/글로우/RADIUS.btn). 여기선 박스 크기만.
  retireFlowBtn: { flex: 1, height: rs(50) },
  keepsakeBtnTxt: { fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700' },
  // 실효 마모 + 교체 예측 카드(차별점) — 본문 카드 톤에 accent 절제(라벨 아이콘/예측 라인만).
  wearCard: { padding: rs(18), gap: rv(2) },
  wearLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: 0.2 },
  wearValue: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.display.fontSize, fontWeight: '700', letterSpacing: 0.3 },
  wearUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, marginLeft: rs(4), marginBottom: rv(4) },
  wearTarget: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, marginBottom: rv(4) },
  wearForecast: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', letterSpacing: -0.1, lineHeight: rf(18), marginTop: rv(8) },
  // 교체 예상 lead(핸드오프 lead 정합: 16px·lineHeight 23) + 주수 강조(bold·T1).
  replaceForecastText: { color: T2, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '500', letterSpacing: -0.2, lineHeight: rf(23), marginTop: rv(8) },
  dForecastBold: { color: T1, fontWeight: '700' },
  // 예측 투명성(1-1): 라벨 우측 정확도 칩 + 근거 한 줄. accent 절제(정확도색만 톤).
  wearLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  confChip: { flexDirection: 'row', alignItems: 'center', gap: rv(4), borderRadius: RADIUS.pill, paddingHorizontal: rs(8), paddingVertical: rv(4) },
  confChipHi: { backgroundColor: withAlpha(GOOD, 0.12) },
  confChipLo: { backgroundColor: withAlpha(T1, 0.06) },
  confDot: { width: rs(5), height: rs(5), borderRadius: RADIUS.pill },
  confChipText: { fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 0.1 },
  wearBasisText: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', letterSpacing: -0.1, lineHeight: rf(18), marginTop: rv(8) },
  maxEditRow: { flexDirection: 'row', alignItems: 'center', gap: rv(4), alignSelf: 'flex-end', marginTop: rv(12) },
  maxEditTxt: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
  gaugeNote: { marginTop: rv(10), color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, lineHeight: rf(17) },

  dHero: { padding: rs(24), flexDirection: 'row', alignItems: 'center', gap: rv(22) },
  dHeroPct: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.display.fontSize },
  dHeroPctU: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize },
  dHeroLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize },
  dHeroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  maxEditToggle: { width: rs(26), height: rs(26), borderRadius: rs(8), backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center' },
  maxStepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(20), marginTop: rv(14) },
  maxStepVal: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: rs(96), textAlign: 'center' },
  maxStepUnitTxt: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  dHeroRemain: { color: T1, fontFamily: DISPLAY, fontSize: rf(44), letterSpacing: 0.5 },
  dHeroRemainU: { color: T2, fontFamily: FONT, fontSize: TYPE.heading.fontSize, marginLeft: rs(4), marginBottom: rv(6) },

  editInput: { backgroundColor: CARD_HI, borderRadius: rs(14), color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '500', paddingHorizontal: rs(16), paddingVertical: rv(12) },
  editBtn: { flex: 1, height: rs(46), borderRadius: RADIUS.btn, alignItems: 'center', justifyContent: 'center' },
  editBtnTxt: { fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600' },

  statRow: { flexDirection: 'row', paddingVertical: rv(20), paddingHorizontal: rs(14) },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP },
  // 2x2 통계 그리드(총거리/총횟수/총시간/평균페이스). 한 카드 안에 4칸을 넉넉히.
  // stats 2x2 — 사진(디자인 09)처럼 왼쪽 정렬. 글씨 비율에 맞게 패딩을 조여 카드가
  // 과하게 커지지 않게 한다(사용자 요청).
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: rv(6), paddingHorizontal: rs(18) },
  statGridCell: { width: '50%', paddingVertical: rv(10) },
  statGridCell3: { width: '33.3%', paddingVertical: rv(10) },
  shareLine: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, paddingHorizontal: rs(18), paddingBottom: rv(14), marginTop: rv(-2) },
  statValue: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, letterSpacing: 0.3 },
  statUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize },
  statLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(4) },

  lastWorn: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },

  // 신발 수명(max_km) 조정 스테퍼 + 직접 입력
  maxInputRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  maxInput: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.title1.fontSize, letterSpacing: 0.3, textAlign: 'center', minWidth: rs(70), paddingVertical: rv(0), paddingBottom: rv(2), borderBottomWidth: 1, borderBottomColor: withAlpha(ACCENT, 0.4) },
  maxStepUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, marginBottom: rv(3) },
  maxStepCaption: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', marginTop: rv(3) },
  maxHint: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, lineHeight: rf(18) },
});
