// ============================================================================
// ShoesScreen.rn.tsx — 신발 locker + 신발 상세 (ShoeDetail)
// (sample data removed — real shoes/runs/totals injected via props)
// ============================================================================
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, StyleSheet, Linking } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BG, CARD, CARD_DIM, CARD_HI, HERO_BG, ACCENT, DANGER, WARN, GOOD, T1, T2, T3, T4, SEP, FONT, DISPLAY, withAlpha, Shoe, Run, SHOES,
} from './theme';
import { TabBar, TierBadge, Pill, InjuryBanner, SectionTitle } from './primitives';
import { FuelGauge } from './FuelGauge';
import FirstShoeScreen from './FirstShoeScreen.rn';
import { Unit, displayNum, displayToKm } from './lib/units';
import { clampMaxKm, KEEP_GOING_REPLACE, SHOE_MAX_STEP_KM, SHOE_REPLACE_PCT } from './lib/shoe';
import { assessShoeInjuryRisk } from './lib/injury';
import { buildWearView, forecastLineKo, type Surface } from './lib/wearView';
import { recommendNextShoes, buildShopLinks, categoryLabelKo, AFFILIATE_DISCLOSURE } from './lib/affiliate';
import { findShoeClass, typeLabel } from './data/shoeClass';
import { shouldRecommendNextShoe } from './lib/recommendTrigger';

// 수익화 v1(차별점 정합): 이 신발이 교체임박(forecast overdue/≤3주)일 때, 같은 카테고리의
// '다음 러닝화'를 상세에서도 추천한다(구매 의도 최고 시점의 contextual 추천 — 배너광고 아님).
// 쇼핑몰 검색 링크는 Linking.openURL 로 외부에서 열고, 투명성 안내를 하단에 명시한다.
function NextShoeCard({ shoe }: { shoe: Shoe }) {
  const recs = recommendNextShoes({ brand: shoe.brand, model: shoe.model }, 3);
  if (recs.length === 0) return null;
  const open = (url: string) => { Promise.resolve(Linking.openURL(url)).catch(() => {}); };
  return (
    <View testID="shoe-detail-next-shoe" style={{ gap: 12 }}>
      <SectionTitle style={s.nextSectionLabel}>이제 교체할 때 — 다음 러닝화</SectionTitle>
      <View style={[s.card, s.nextCard]}>
        <Text style={s.nextSub}>
          <Text style={{ color: T2, fontWeight: '600' }}>{shoe.model}</Text>의 수명이 거의 다 됐어요. 같은 용도의 다음 신발이에요.
        </Text>
        {recs.map((r, i) => (
          <View key={`${r.brand}-${r.model}`} style={[s.nextRow, i > 0 && s.nextRowSep]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.nextBrand} numberOfLines={1}>{r.brand}</Text>
              <Text style={s.nextModel} numberOfLines={1}>{r.model}</Text>
              <Text style={s.nextCat}>{categoryLabelKo[r.category]}</Text>
            </View>
            <View style={s.shopBtns}>
              {buildShopLinks(r).map((link) => (
                <Pressable
                  key={link.shop}
                  onPress={() => open(link.url)}
                  accessibilityRole="link"
                  accessibilityLabel={`${r.brand} ${r.model} ${link.shop}에서 보기`}
                  style={({ pressed }) => [s.shopBtn, pressed && s.pressed]}>
                  <Text style={s.shopBtnTxt}>{link.shop}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <Text style={s.nextDisclosure}>{AFFILIATE_DISCLOSURE}</Text>
      </View>
    </View>
  );
}

// lastWorn: 이 신발의 마지막 착용일(런에서 파생, 한국어 표기). 미착용이면 생략.
// avgPace: 이 신발로 달린 런들의 평균 페이스(예 "5'30\"" / 기록 없으면 '--'). 신발끼리
// 페이스를 비교할 수 있게 상세·목록 카드에 함께 노출한다.
export type ShoeTotals = { totalRuns: number; totalTime: string; avgPace: string; lastWorn?: string };

// Proportional condition → color (shoeHealth tiers: 양호 / 주의 / 교체).
const condColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : GOOD);
const ringColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : ACCENT);
// 락커 카드 컨디션 라벨 — 목업 정합(친근한 표현). 홈 히어로와 동일 매핑.
const condLabel = (c: string) => (c === '교체' ? '교체 권장' : c === '주의' ? '주의 필요' : '최상의 컨디션');

// ── shoe detail ───────────────────────────────────────────────────────────────
function ShoeDetail({
  shoe, idx, runs, totals, unit, weightKg, surfaceOf, onBack, onRename, onDelete, onRetire, onSetMaxKm,
}: {
  shoe: Shoe;
  idx: number;
  runs: Run[];
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
}) {
  // 비율은 km 절대값, 표시 숫자만 표시 단위로 환산한다.
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const remain = displayNum(remainKm, unit);
  const usedDisp = displayNum(shoe.used, unit);
  const maxDisp = displayNum(shoe.max, unit);
  const retired = !!shoe.retired;
  const shoeRuns = runs.filter((r) => r.shoe === idx);
  // 사용자 DB(shoes.json): 종류(type)+추천 용도(recommended). 종류는 칩, 추천 용도는 recommended.
  const detailClass = findShoeClass(shoe.brand, shoe.model);
  const detailType = typeLabel(detailClass?.type);
  // 실효 마모/교체 예측(차별점): 단순 누적 km 가 아니라 체중·노면·페이스·세월 보정 "진짜
  // 마모"와 "이 페이스면 약 N주 후 교체"를 파생한다(lib/wearView → wearModel/forecast 재사용).
  // 원본 shoe/run 은 읽기만 한다(A6-1). 모든 엣지에서 NaN/음수 없음(A6-2).
  const wearView = buildWearView(shoe, shoeRuns, { weightKg, surfaceOf });
  const forecastLine = forecastLineKo(wearView.forecast);
  // 부상예방 경고(주의/위험) — shoeHealth 와 같은 마모 분모(used/max)로 판정한다.
  // 안전 등급/보관 신발은 경고를 노출하지 않는다(보관됨 상태와의 모순 방지).
  const injury = assessShoeInjuryRisk(shoe);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(`${shoe.brand} ${shoe.model}`.trim());

  // 신발 수명(max_km)을 '남은 수명' 옆 연필로 펼쳐 바로 보정한다(기본 접힘).
  const [editingMax, setEditingMax] = useState(false);
  // 직접 입력 임시값(표시 단위 문자열). null이면 '입력 중 아님' → shoe.max를 그대로 보여준다.
  // 매 타건마다 커밋하지 않고 blur/제출 시 한 번만 onSetMaxKm으로 영속화한다.
  const [maxDraft, setMaxDraft] = useState<string | null>(null);

  // 신발 수명(max_km) 조정: ＋/− 10km씩 보정 + 직접 입력. 비율(percentUsed)은 km 절대값
  // 으로 계산하지만 표시·스텝·입력은 단위를 따른다. 임계 tier는 새 max로 즉시 재판정해,
  // 수명을 올리면 교체→주의→양호로 완화되는 걸 바로 보여준다.
  const usedKm = shoe.used;
  const percentUsed = shoe.max > 0 ? (usedKm / shoe.max) * 100 : 0;
  const maxStepDisplay = displayNum(SHOE_MAX_STEP_KM, unit, 0) || 1;
  const commitMaxKm = (km: number) => {
    if (!shoe.id) return;
    onSetMaxKm?.(shoe.id, clampMaxKm(km));
  };
  const stepMaxKm = (dir: 1 | -1) => {
    if (!shoe.id) return;
    setMaxDraft(null); // ± 사용 시 입력 임시값을 버리고 확정값 기준으로 보정
    const nextDisplay = displayNum(shoe.max, unit, 0) + dir * maxStepDisplay;
    commitMaxKm(displayToKm(nextDisplay, unit));
  };
  // 직접 입력 커밋: 표시 단위 → km 변환 후 클램프 영속. 빈/0 값은 무시하고 원복.
  const commitMaxDraft = () => {
    if (maxDraft != null) {
      const n = Number(maxDraft);
      if (Number.isFinite(n) && n > 0) commitMaxKm(displayToKm(n, unit));
    }
    setMaxDraft(null);
  };
  // 교체 임계 도달까지 남은 거리(표시 단위). 임계 = max_km * SHOE_REPLACE_PCT/100.
  const replaceAtKm = (shoe.max * SHOE_REPLACE_PCT) / 100;
  const toReplaceKm = Math.max(0, replaceAtKm - usedKm);

  const saveName = () => {
    const v = name.trim();
    if (shoe.id && v) onRename?.(shoe.id, v);
    setEditing(false);
  };
  // 보관/복원: 런 기록을 보존한 채 신발만 선택목록에서 숨기거나 되돌린다.
  const toggleRetire = () => {
    if (!shoe.id) return;
    if (retired) { onRetire?.(shoe.id, false); return; }
    Alert.alert('신발 보관', `${shoe.brand} ${shoe.model}을(를) 보관할까요?\n러닝 기록은 그대로 보존되며, 러닝 시작 목록에서만 숨겨집니다.`, [
      { text: '취소', style: 'cancel' },
      { text: '보관', onPress: () => onRetire?.(shoe.id!, true) },
    ]);
  };
  const confirmDelete = () => {
    Alert.alert('신발 삭제', `${shoe.brand} ${shoe.model}을(를) 삭제할까요?\n러닝 기록은 보존됩니다. 신발만 잠금장에서 제거됩니다.`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { if (shoe.id) onDelete?.(shoe.id); onBack(); } },
    ]);
  };

  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.detailNav}>
        <Pressable onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}><Ionicons name="chevron-back" size={20} color={T1} /></Pressable>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={6} accessibilityRole="button" accessibilityLabel="이름 편집" style={s.iconBtn}><Ionicons name="pencil" size={16} color={T2} /></Pressable>
          <Pressable onPress={confirmDelete} hitSlop={6} accessibilityRole="button" accessibilityLabel="신발 삭제" style={s.iconBtn}><Ionicons name="trash-outline" size={16} color={DANGER} /></Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28, gap: 16 }} keyboardShouldPersistTaps="handled">
        {editing ? (
          <View style={[s.card, { padding: 16, gap: 12 }]}>
            <Text style={s.dHeroLabel}>신발 이름</Text>
            <TextInput value={name} onChangeText={setName} style={s.editInput} placeholderTextColor={T3} autoFocus />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setEditing(false)} style={[s.editBtn, { backgroundColor: CARD_HI }]}><Text style={[s.editBtnTxt, { color: T2 }]}>취소</Text></Pressable>
              <Pressable onPress={saveName} style={[s.editBtn, { backgroundColor: ACCENT }]}><Text style={[s.editBtnTxt, { color: T1 }]}>저장</Text></Pressable>
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 4 }}>
            {/* 상태 칩(목업 09 상단) — 양호는 '최상의 컨디션' 칩, 주의/교체는 tier 배지(testID 유지). */}
            <View style={[s.row, { marginBottom: 12 }]}>
              {shoe.condition === '양호'
                ? <Pill tone="good" label="최상의 컨디션" />
                : <TierBadge condition={shoe.condition} size="md" />}
              {retired && <Pill tone="dim" label="보관됨" />}
            </View>
            <Text style={s.dBrand}>{shoe.brand}</Text>
            <Text style={s.dModel}>{shoe.model}</Text>
            {/* 종류 칩 + 추천 용도(사용자 DB) — 종류(카본 레이싱 등)는 칩, 추천 용도는 recommended. */}
            {!!detailType && (
              <View style={s.dTypeChip}><Text style={s.dTypeChipText}>{detailType}</Text></View>
            )}
            {!!detailClass && detailClass.recommended.length > 0 && (
              <>
                <Text style={s.dPurposeLabel}>추천 용도</Text>
                <View style={s.dTags}>
                  {detailClass.recommended.map((t) => (
                    <View key={t} style={s.dTag}><Text style={s.dTagText}>{t}</Text></View>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* durability — 수명 연료게이지(가로 바) + 수명 조정 토글 */}
        <View>
          <FuelGauge
            remainLabel={String(remain)}
            unit={unit}
            fillPct={shoe.max > 0 ? Math.min(1, shoe.used / shoe.max) : 0}
            condition={shoe.condition}
            usedLabel={String(usedDisp)}
            maxLabel={String(maxDisp)}
          />
          {!retired && shoe.id && onSetMaxKm && (
            <Pressable onPress={() => setEditingMax((e) => !e)} hitSlop={8} accessibilityRole="button" accessibilityLabel="신발 수명 수정" style={s.maxEditRow}>
              <Ionicons name={editingMax ? 'checkmark' : 'create-outline'} size={13} color={editingMax ? ACCENT : T3} />
              <Text style={s.maxEditTxt}>{editingMax ? '완료' : '수명 조정'}</Text>
            </Pressable>
          )}
        </View>

        {/* 교체 예상(차별점의 사용자 친화 결과) — 체중·노면·페이스·세월 보정 예측을 'N주 후
            교체 예상' 한 줄로(목업 09 교체예상 카드). '실효 마모' 용어는 일반 사용자가 헷갈려
            제거. 추정 톤('약'·'예상'). 보관 신발은 제외, 예측 없으면 카드 자체를 숨긴다. */}
        {!retired && !!forecastLine && (
          <View style={[s.card, s.wearCard]}>
            <Text style={s.wearLabel}>교체 예상</Text>
            <Text style={s.replaceForecastText}>{forecastLine}</Text>
          </View>
        )}

        {/* 부상예방 경고 배너(주의/위험) — 마모도가 임계를 넘으면 keep-going 보이스로
            교체를 권한다. 안전 등급(InjuryBanner null)·보관 신발은 미노출. */}
        {!retired && injury.level !== 'safe' && (
          <InjuryBanner level={injury.level} message={injury.message} />
        )}

        {/* '남은 수명' 옆 연필로 펼치는 신발 수명(max_km) 보정기 — ±로 교체 임계의 분모를
            직접 조정한다(기본 접힘). 보관된 신발은 조정 동선에서 제외(기록은 그대로 유지). */}
        {editingMax && !retired && shoe.id && onSetMaxKm && (
          <View style={[s.card, { padding: 18, gap: 12 }]}>
            <View style={s.maxStepper}>
              <Pressable onPress={() => stepMaxKm(-1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="수명 줄이기" style={({ pressed }) => [s.maxStepBtn, pressed && { backgroundColor: CARD }]}>
                <Ionicons name="remove" size={20} color={T1} />
              </Pressable>
              <View style={s.maxStepVal}>
                <View style={s.maxInputRow}>
                  <TextInput
                    value={maxDraft ?? String(displayNum(shoe.max, unit, 0))}
                    onChangeText={(v) => setMaxDraft(v.replace(/[^0-9]/g, ''))}
                    onBlur={commitMaxDraft}
                    onSubmitEditing={commitMaxDraft}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    maxLength={4}
                    selectTextOnFocus
                    accessibilityLabel="신발 수명 직접 입력"
                    style={s.maxInput}
                  />
                  <Text style={s.maxStepUnit}> {unit}</Text>
                </View>
                <Text style={s.maxStepCaption}>{Math.round(percentUsed)}% 사용</Text>
              </View>
              <Pressable onPress={() => stepMaxKm(1)} hitSlop={6} accessibilityRole="button" accessibilityLabel="수명 늘리기" style={({ pressed }) => [s.maxStepBtn, pressed && { backgroundColor: CARD }]}>
                <Ionicons name="add" size={20} color={T1} />
              </Pressable>
            </View>
            <Text style={s.maxHint}>
              {shoe.condition === '교체'
                ? '교체 시점을 넘겼어요.'
                : `교체 권장(${SHOE_REPLACE_PCT}%)까지 `}
              {shoe.condition !== '교체' && (
                <Text style={{ color: ACCENT }}>{displayNum(toReplaceKm, unit, 0)}{unit}</Text>
              )}
              {shoe.condition !== '교체' && ' 남음'}
            </Text>
          </View>
        )}

        {/* 교체 내러티브(keep-going 보이스) — 교체 tier 도달 시, 교체를 '손실'이 아니라
            '부상 없이 계속 달리기'의 조건으로 프레이밍해 상세를 마감한다. KEEP_GOING_REPLACE
            (lib/shoe 단일 카피)에서 파생. */}
        {!retired && shoe.condition === '교체' && (
          <View style={s.keepGoing}>
            <Ionicons name="shield-checkmark" size={17} color={ACCENT} />
            <Text style={s.keepGoingText}>{`${KEEP_GOING_REPLACE} 달릴 수 있어요`}</Text>
          </View>
        )}

        {/* 수익화 v1: 교체임박(forecast overdue/≤3주)이면 같은 카테고리 '다음 러닝화'를
            상세에서도 추천(여유 있는 신발엔 미노출, 보관 신발 제외 — 홈과 동일 트리거). */}
        {!retired && shouldRecommendNextShoe(wearView.forecast) && (
          <NextShoeCard shoe={shoe} />
        )}

        {/* totals — 2x2 그리드(평균 페이스 포함): 신발별 누적·페이스를 비교할 수 있게 한다 */}
        <View style={[s.card, s.statGrid]}>
          {[
            { v: String(usedDisp), u: unit, l: '누적 거리' },
            { v: String(totals.totalRuns), u: '회', l: '러닝 횟수' },
            { v: totals.totalTime, u: '', l: '러닝 시간' },
            { v: totals.avgPace, u: totals.avgPace !== '--' ? '/km' : '', l: '평균 페이스' },
          ].map((x, i) => (
            <View key={i} style={s.statGridCell}>
              <Text style={s.statValue}>{x.v}<Text style={s.statUnit}>{x.u}</Text></Text>
              <Text style={s.statLabel}>{x.l}</Text>
            </View>
          ))}
        </View>

        {/* runs */}
        <View style={[s.row, { paddingHorizontal: 4, justifyContent: 'space-between' }]}>
          <Text style={s.sectionLabel}>이 신발로 달린 기록</Text>
          {!!totals.lastWorn && <Text style={s.lastWorn}>마지막 착용 {totals.lastWorn}</Text>}
        </View>
        {shoeRuns.length === 0 ? (
          <View style={[s.card, { padding: 24, alignItems: 'center' }]}>
            <Text style={{ color: T3, fontFamily: FONT, fontSize: 13 }}>아직 기록이 없어요 — 이 신발로 첫 걸음을 떼어볼까요?</Text>
          </View>
        ) : (
          <View style={[s.card, { overflow: 'hidden' }]}>
            {shoeRuns.map((r, i) => (
              <View key={r.id || i} style={[s.runRow, i < shoeRuns.length - 1 && s.runRowBorder]}>
                <View style={s.runDate}>
                  <Text style={s.runDay}>{r.day}</Text>
                  <Text style={s.runDateNum}>{r.dateNum}</Text>
                </View>
                <View style={s.runDivider} />
                <View style={{ flex: 1 }}>
                  <View style={s.baselineRow}><Text style={s.runDist}>{displayNum(r.dist, unit, 2)}</Text><Text style={s.runDistU}>{unit}</Text></View>
                  <Text style={s.runSub}>{r.pace} /km   {r.time}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 신발 은퇴(보관) — 목업처럼 하단 전체폭 버튼(danger 외곽선). 상단 아이콘 대신
            여기서 명확히 처리한다. 이미 보관된 신발은 '보관 복원'으로 토글. */}
        {shoe.id && onRetire && (
          <Pressable
            onPress={toggleRetire}
            accessibilityRole="button"
            accessibilityLabel={retired ? '보관 복원' : '신발 은퇴 처리'}
            style={({ pressed }) => [retired ? s.restoreBtn : s.retireBtn, pressed && s.pressed]}>
            <Ionicons name={retired ? 'arrow-undo-outline' : 'archive-outline'} size={16} color={retired ? T2 : DANGER} />
            <Text style={[s.retireBtnText, { color: retired ? T2 : DANGER }]}>{retired ? '보관 복원' : '신발 은퇴 처리'}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// ── locker ─────────────────────────────────────────────────────────────────
function ShoeCard({ shoe, featured, onPress, onPlay, unit, pace }: { shoe: Shoe; featured: boolean; onPress: () => void; onPlay?: () => void; unit: Unit; pace?: string }) {
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const ring = ringColor(shoe.condition);
  const retired = !!shoe.retired;
  const usedDisp = displayNum(shoe.used, unit);
  const maxDisp = displayNum(shoe.max, unit);
  // 사용률(%) — 라벨바 채움(목업 LifeBar 정합). 비율은 km 절대값으로(단위 불변).
  const usedPct = shoe.max > 0 ? Math.min(100, Math.round((shoe.used / shoe.max) * 100)) : 0;
  // 사용자 DB: 종류(type)→칩, 추천 용도(recommended)→중간 한 줄(사진 정합).
  const cardClass = findShoeClass(shoe.brand, shoe.model);
  const cardType = typeLabel(cardClass?.type);
  const cardRec = cardClass?.recommended ?? [];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${shoe.brand} ${shoe.model} 상세`} style={({ pressed }) => [s.shoeCard, featured ? s.shoeCardFeatured : s.shoeCardIdle, retired && s.shoeCardRetired, pressed && s.pressed]}>
      {/* 상단: 좌(브랜드·사용중·모델) ↔ 우(컨디션 위 · 화살표/▶ 아래) — 사진 정합 */}
      <View style={s.shoeTopSection}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[s.row, { flexShrink: 1, minWidth: 0 }]}>
            <Text style={s.shoeBrand}>{shoe.brand}</Text>
            {!!cardType && <View style={s.cardTypeChip}><Text style={s.cardTypeChipText}>{cardType}</Text></View>}
            {retired ? <Pill tone="dim" label="보관됨" />
              : featured && <Text style={s.shoeUsing}>· 사용 중</Text>}
          </View>
          <Text style={s.shoeModel} numberOfLines={2}>{shoe.model}</Text>
        </View>
        <View style={s.shoeRightCol}>
          <View style={s.shoeCondRow}>
            <View testID={`cond-dot-${shoe.condition}`} style={[s.shoeCondDot, { backgroundColor: condColor(shoe.condition) }]} />
            <Text style={[s.shoeCondText, { color: T2 }]} numberOfLines={1}>{condLabel(shoe.condition)}</Text>
          </View>
          {!retired && onPlay ? (
            <Pressable onPress={onPlay} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${shoe.brand} ${shoe.model}로 달리기`} style={({ pressed }) => [s.cardPlay, pressed && s.pressed]} testID={shoe.id ? `shoe-play-${shoe.id}` : undefined}>
              <Ionicons name="play" size={14} color={T2} />
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={T3} />
          )}
        </View>
      </View>
      {/* 추천 용도(러닝 종류) — 중간(사진 정합). 모델 매칭 시만. */}
      {cardRec.length > 0 && <Text style={s.shoePurpose} numberOfLines={1}>{cardRec.join(' · ')}</Text>}
      {/* 누적 거리(큰 숫자) + 교체까지 남은 거리(문장형) — 목업 lifeRow 정합 */}
      <View style={s.shoeLifeRow}>
        <View style={s.baselineRow}>
          <Text style={s.shoeUsedNum}>{usedDisp}</Text>
          <Text style={s.shoeUsedU}>{unit}</Text>
        </View>
        <Text style={s.shoeRemain}>교체까지 약 {displayNum(remainKm, unit)}{unit} 남았어요</Text>
      </View>
      {/* 라벨바: 사용/총 수명을 양끝 라벨로(목업 LifeBar). 가운데 평균 페이스(기록 있을 때). */}
      <View style={s.shoeBar}><View style={[s.shoeBarFill, { width: `${usedPct}%`, backgroundColor: retired ? T3 : ring }]} /></View>
      <View style={s.shoeBarLabels}>
        <Text style={s.shoeBarLabel}>{usedDisp}{unit}</Text>
        {pace && pace !== '--' ? <Text style={s.shoeBarLabel}>평균 <Text style={s.shoePaceVal}>{pace}</Text>/km</Text> : <View />}
        <Text style={s.shoeBarLabel}>{maxDisp}{unit}</Text>
      </View>
    </Pressable>
  );
}

export default function ShoesScreen({
  shoes = SHOES, runs = [], totals = {}, activeIdx = 0, unit = 'km', weightKg, surfaceOf, onAddShoe, onTab, onRename, onDelete, onRetire, onSetMaxKm, onStartRun,
  detailShoeId, onConsumeDetail,
}: {
  shoes?: Shoe[];
  runs?: Run[];
  totals?: Record<number, ShoeTotals>;
  activeIdx?: number;
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
}) {
  const [detail, setDetail] = useState<number | null>(null);
  // 홈 히어로에서 넘어온 신발 id를 상세로 연다(한 번만 소비). id→index 매핑 후 detail 세팅.
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
        totals={totals[detail] || { totalRuns: 0, totalTime: '--', avgPace: '--' }}
        unit={unit}
        weightKg={weightKg}
        surfaceOf={surfaceOf}
        onBack={() => setDetail(null)}
        onRename={onRename}
        onDelete={onDelete}
        onRetire={onRetire}
        onSetMaxKm={onSetMaxKm}
      />
    );
  }

  // 신발 0개 → 풍부한 빈 상태(첫 러닝화 등록 유도). FirstShoeScreen 을 통째로 반환해
  // 헤더·탭바 중복 없이 한 화면으로 대체한다. 등록 버튼은 AddShoe 오버레이(onAddShoe)로 열린다.
  if (shoes.length === 0) {
    return <FirstShoeScreen onRegister={onAddShoe} onTab={onTab} />;
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.topbar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>신발</Text>
          <Text style={s.shoesSub}>{shoes.length}켤레와 함께 총 {displayNum(shoes.reduce((a, sh) => a + (sh.used || 0), 0), unit)}{unit}를 달렸어요</Text>
        </View>
        <Pressable onPress={onAddShoe} accessibilityRole="button" accessibilityLabel="신발 추가" hitSlop={8} style={({ pressed }) => [s.addPill, pressed && s.pressed]}>
          <Text style={s.addPillText}>신발 추가</Text>
          <Ionicons name="add" size={15} color={T2} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8, gap: 14, paddingTop: 12 }}>
        {shoes.map((shoe, i) => (
          <ShoeCard
            key={shoe.id || i}
            shoe={shoe}
            featured={i === activeIdx}
            unit={unit}
            pace={totals[i]?.avgPace}
            onPress={() => setDetail(i)}
            onPlay={shoe.id && onStartRun ? () => onStartRun(shoe.id!) : undefined}
          />
        ))}
        <Pressable onPress={onAddShoe} accessibilityRole="button" accessibilityLabel="러닝화 등록하기" style={({ pressed }) => [s.addCard, pressed && s.pressed]}>
          <Ionicons name="add" size={18} color={T3} />
          <Text style={s.addText}>러닝화 등록하기</Text>
        </Pressable>
      </ScrollView>
      <TabBar active={1} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },
  card: { backgroundColor: CARD_DIM, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.07) },
  sectionLabel: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 4 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  condText: { fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  condSub: { color: T3, fontFamily: FONT, fontSize: 13 },

  // 목업 정합: 제목 + '신발 추가' 버튼 한 줄(topbar)
  topbar: { paddingTop: 8, paddingHorizontal: 22, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: T1, fontFamily: FONT, fontSize: 28, fontWeight: '600', letterSpacing: -0.6 },
  shoesSub: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 5, letterSpacing: -0.2 },
  addPill: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.1), flexDirection: 'row', alignItems: 'center', gap: 6 },
  addPillText: { color: T2, fontFamily: FONT, fontSize: 12.5, fontWeight: '600' },

  // 카드 하단 중복 진행바(track/trackFill)를 제거하고 원형 Ring 만 유지한다. 바가
  // 빠진 만큼 카드 패딩을 살짝 줄이고(20), 링(78)·모델 폰트(20)를 키워 비율을
  // 재조정했다 — 같은 pct 를 두 번 그리던 중복을 없애 시선이 링에 모인다.
  // 목업 정합: 카드 배경을 near-black(CARD_DIM)에서 살짝 떠 보이는 회색(HERO_BG — 홈
  // 히어로 카드와 동일 톤)으로 올려 black-on-black 을 피한다.
  shoeCard: { backgroundColor: HERO_BG, borderRadius: 20, padding: 16 },
  shoeCardFeatured: { borderWidth: 1, borderColor: withAlpha(T1, 0.2) },
  shoeCardIdle: { borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.08) },
  shoeCardRetired: { opacity: 0.55, borderColor: withAlpha(T1, 0.05) },
  // 상단: 좌(브랜드·모델) ↔ 우(컨디션 위 · ▶/화살표 아래) — 사진 정합
  shoeTopSection: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  shoeRightCol: { alignItems: 'flex-end', gap: 10, flexShrink: 0 },
  shoeBrand: { color: T3, fontFamily: DISPLAY, fontSize: 11, fontWeight: '500', letterSpacing: 1.3 },
  shoeUsing: { color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '500' },
  shoeModel: { color: T1, fontFamily: DISPLAY, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, lineHeight: 27, marginTop: 4 },
  shoeCondRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  // 종류 칩(카본 레이싱 등) — 브랜드 옆
  cardTypeChip: { backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  cardTypeChipText: { color: ACCENT, fontFamily: FONT, fontSize: 10, fontWeight: '700', letterSpacing: 0.1 },
  // 추천 용도(러닝 종류) 한 줄 — 카드 중간
  shoePurpose: { color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '500', letterSpacing: -0.1, marginTop: 10 },
  cardPlay: { width: 32, height: 32, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.14), alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(BG, 0.3) },
  shoeCondDot: { width: 7, height: 7, borderRadius: 999 },
  shoeCondText: { color: T2, fontFamily: FONT, fontSize: 12.5, fontWeight: '500' },
  // 누적 거리(큰 숫자) + 교체까지 남은 거리 — 목업 lifeRow 정합
  shoeLifeRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 },
  shoeUsedNum: { color: T1, fontFamily: DISPLAY, fontSize: 25, fontWeight: '800', letterSpacing: -0.6 },
  shoeUsedU: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginLeft: 2 },
  shoeRemain: { color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '500' },
  // 라벨바(목업 LifeBar): 사용/총 수명 양끝 라벨 + 가운데 평균 페이스
  shoeBar: { height: 6, borderRadius: 999, backgroundColor: withAlpha(T1, 0.1), overflow: 'hidden' },
  shoeBarFill: { height: '100%', borderRadius: 999 },
  shoeBarLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  shoeBarLabel: { color: T4, fontFamily: FONT, fontSize: 11, fontWeight: '500' },
  shoePaceVal: { color: ACCENT, fontFamily: DISPLAY, fontSize: 12 },
  cardPlayAbs: { position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.14), alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(BG, 0.3) },
  retireBtn: { height: 54, borderRadius: 16, marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: withAlpha(DANGER, 0.06), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(DANGER, 0.45) },
  restoreBtn: { height: 54, borderRadius: 16, marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.14) },
  retireBtnText: { fontFamily: FONT, fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },

  addCard: { borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: withAlpha(T1, 0.12), padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addText: { color: T3, fontFamily: FONT, fontSize: 15, fontWeight: '500' },

  // detail
  detailNav: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },
  dBrand: { color: T3, fontFamily: DISPLAY, fontSize: 12, fontWeight: '500', letterSpacing: 1.6 },
  dModel: { color: T1, fontFamily: DISPLAY, fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginTop: 2, lineHeight: 38 },
  dPurpose: { color: T2, fontFamily: FONT, fontSize: 15, fontWeight: '500', letterSpacing: -0.2, lineHeight: 22, marginTop: 10 },
  dTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  dTag: { backgroundColor: CARD_HI, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  dTagText: { color: T2, fontFamily: FONT, fontSize: 12, fontWeight: '600' },
  dTypeChip: { alignSelf: 'flex-start', backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, marginTop: 12 },
  dTypeChipText: { color: ACCENT, fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 0.1 },
  dPurposeLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', marginTop: 16 },
  runCta: { height: 46, borderRadius: 14, backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.14), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  runCtaText: { color: T2, fontFamily: FONT, fontSize: 14.5, fontWeight: '600', letterSpacing: -0.2 },

  // 교체 내러티브 배너(keep-going 보이스) — accent 톤 반투명 표면(withAlpha 파생).
  keepGoing: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: withAlpha(ACCENT, 0.12), borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.35), paddingHorizontal: 16, paddingVertical: 13 },
  keepGoingText: { flex: 1, color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: -0.1, lineHeight: 18 },
  // 실효 마모 + 교체 예측 카드(차별점) — 본문 카드 톤에 accent 절제(라벨 아이콘/예측 라인만).
  wearCard: { padding: 18, gap: 2 },
  wearLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  wearValue: { color: T1, fontFamily: DISPLAY, fontSize: 30, letterSpacing: 0.3 },
  wearUnit: { color: T2, fontFamily: FONT, fontSize: 14, marginLeft: 4, marginBottom: 4 },
  wearTarget: { color: T3, fontFamily: FONT, fontSize: 13, marginBottom: 4 },
  wearForecast: { color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '500', letterSpacing: -0.1, lineHeight: 18, marginTop: 8 },
  replaceForecastText: { color: T2, fontFamily: FONT, fontSize: 15, fontWeight: '500', letterSpacing: -0.2, lineHeight: 22, marginTop: 8 },
  maxEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 12 },
  maxEditTxt: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },

  dHero: { padding: 24, flexDirection: 'row', alignItems: 'center', gap: 22 },
  dHeroPct: { color: T1, fontFamily: DISPLAY, fontSize: 30 },
  dHeroPctU: { color: T3, fontFamily: FONT, fontSize: 13 },
  dHeroLabel: { color: T3, fontFamily: FONT, fontSize: 13 },
  dHeroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  maxEditToggle: { width: 26, height: 26, borderRadius: 8, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center' },
  dHeroRemain: { color: T1, fontFamily: DISPLAY, fontSize: 44, letterSpacing: 0.5 },
  dHeroRemainU: { color: T2, fontFamily: FONT, fontSize: 16, marginLeft: 5, marginBottom: 6 },

  editInput: { backgroundColor: CARD_HI, borderRadius: 14, color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '500', paddingHorizontal: 16, paddingVertical: 13 },
  editBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  editBtnTxt: { fontFamily: FONT, fontSize: 15, fontWeight: '600' },

  statRow: { flexDirection: 'row', paddingVertical: 20, paddingHorizontal: 14 },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP },
  // 2x2 통계 그리드(총거리/총횟수/총시간/평균페이스). 한 카드 안에 4칸을 넉넉히.
  nextSectionLabel: { paddingHorizontal: 4 },
  nextCard: { backgroundColor: CARD_DIM, borderWidth: 1, borderColor: withAlpha(ACCENT, 0.3), padding: 16 },
  nextSub: { color: T3, fontFamily: FONT, fontSize: 12.5, lineHeight: 18, marginBottom: 6 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  nextRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  nextBrand: { color: T3, fontFamily: DISPLAY, fontSize: 10, fontWeight: '500', letterSpacing: 1.2 },
  nextModel: { color: T1, fontFamily: DISPLAY, fontSize: 14.5, fontWeight: '600', letterSpacing: -0.1, marginTop: 3 },
  nextCat: { color: T3, fontFamily: FONT, fontSize: 11, marginTop: 3 },
  shopBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 132 },
  shopBtn: { borderRadius: 999, borderWidth: 1, borderColor: withAlpha(ACCENT, 0.4), backgroundColor: withAlpha(ACCENT, 0.1), paddingHorizontal: 11, paddingVertical: 6 },
  shopBtnTxt: { color: ACCENT, fontFamily: FONT, fontSize: 11.5, fontWeight: '600' },
  nextDisclosure: { color: T3, fontFamily: FONT, fontSize: 10.5, lineHeight: 15, marginTop: 12, opacity: 0.85 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 8 },
  statGridCell: { width: '50%', alignItems: 'center', paddingVertical: 14 },
  statValue: { color: T1, fontFamily: DISPLAY, fontSize: 22, letterSpacing: 0.3 },
  statUnit: { color: T3, fontFamily: FONT, fontSize: 12 },
  statLabel: { color: T3, fontFamily: FONT, fontSize: 11, marginTop: 4 },

  lastWorn: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },

  // 신발 수명(max_km) 조정 스테퍼 + 직접 입력
  maxStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  maxStepBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center' },
  maxStepVal: { flex: 1, alignItems: 'center' },
  maxInputRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  maxInput: { color: T1, fontFamily: DISPLAY, fontSize: 28, letterSpacing: 0.3, textAlign: 'center', minWidth: 70, paddingVertical: 0, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: withAlpha(ACCENT, 0.4) },
  maxStepUnit: { color: T3, fontFamily: FONT, fontSize: 13, marginBottom: 3 },
  maxStepCaption: { color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '600', marginTop: 3 },
  maxHint: { color: T3, fontFamily: FONT, fontSize: 12, lineHeight: 18 },

  runRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 18 },
  runRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  runDate: { width: 42, alignItems: 'center' },
  runDay: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500' },
  runDateNum: { color: T1, fontFamily: DISPLAY, fontSize: 16 },
  runDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: SEP, marginVertical: 2 },
  runDist: { color: T1, fontFamily: DISPLAY, fontSize: 21, letterSpacing: 0.3 },
  runDistU: { color: T3, fontFamily: FONT, fontSize: 12.5, marginLeft: 4, marginBottom: 1 },
  runSub: { color: T3, fontFamily: FONT, fontSize: 12, marginTop: 3 },
});
