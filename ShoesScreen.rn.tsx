// ============================================================================
// ShoesScreen.rn.tsx — 신발 locker + 신발 상세 (ShoeDetail)
// (sample data removed — real shoes/runs/totals injected via props)
// ============================================================================
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD, CARD_HI, ACCENT, DANGER, WARN, GOOD, T1, T2, T3, SEP, FONT, DISPLAY, withAlpha, Shoe, Run, SHOES,
} from './theme';
import { Ring, TabBar, TierBadge, Pill } from './primitives';
import { costPerKm } from './lib/shoeRecommend';
import { Unit, displayNum, displayToKm } from './lib/units';
import { clampMaxKm, KEEP_GOING_REPLACE, SHOE_MAX_STEP_KM, SHOE_REPLACE_PCT } from './lib/shoe';

// lastWorn: 이 신발의 마지막 착용일(런에서 파생, 한국어 표기). 미착용이면 생략.
export type ShoeTotals = { totalRuns: number; totalTime: string; lastWorn?: string };

// 정수 원화에 천단위 콤마. 음수/NaN은 그대로(호출부가 양수만 넘김).
const fmtWon = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Proportional condition → color (shoeHealth tiers: 양호 / 주의 / 교체).
const condColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : GOOD);
const ringColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : ACCENT);

// ── shoe detail ───────────────────────────────────────────────────────────────
function ShoeDetail({
  shoe, idx, runs, totals, price, unit, onBack, onRename, onDelete, onRetire, onSetPrice, onSetMaxKm, onStartRun,
}: {
  shoe: Shoe;
  idx: number;
  runs: Run[];
  totals: ShoeTotals;
  price?: number;
  unit: Unit;
  onBack: () => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onRetire?: (id: string, retired: boolean) => void;
  onSetPrice?: (id: string, price: number) => void;
  // 신발별 수명(max_km) 조정 — 교체 임계의 분모를 사용자가 직접 보정한다.
  onSetMaxKm?: (id: string, maxKm: number) => void;
  // shoe-first 동선: 이 신발로 바로 런 시작(목표 설정 → 러닝). 신발 id를 넘긴다.
  onStartRun?: (id: string) => void;
}) {
  // 비율은 km 절대값, 표시 숫자만 단위 환산. cost-per-km는 의도적으로 km 기준(원/km).
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remainKm / shoe.max : 0;
  const remain = displayNum(remainKm, unit);
  const usedDisp = displayNum(shoe.used, unit);
  const maxDisp = displayNum(shoe.max, unit);
  const ring = ringColor(shoe.condition);
  const retired = !!shoe.retired;
  const shoeRuns = runs.filter((r) => r.shoe === idx);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(`${shoe.brand} ${shoe.model}`.trim());

  // 구매가(원) 입력 — 저장하면 onSetPrice로 영속화된다. km당 비용은 순수함수로 파생.
  const [priceInput, setPriceInput] = useState(price != null && price > 0 ? String(price) : '');
  const savePrice = () => {
    if (!shoe.id) return;
    const v = Math.round(Number(priceInput) || 0);
    if (v >= 0) onSetPrice?.(shoe.id, v);
  };
  const cpk = costPerKm(Number(priceInput) || 0, shoe.used);

  // 신발 수명(max_km) 조정: ＋/− 50km씩 보정. 비율(percentUsed)은 km 절대값으로
  // 계산하지만 표시·스텝은 단위를 따른다(goal 스테퍼와 동일). 임계 tier는 새 max로
  // 즉시 재판정해, 수명을 올리면 교체→주의→양호로 완화되는 걸 바로 보여준다.
  const usedKm = shoe.used;
  const percentUsed = shoe.max > 0 ? (usedKm / shoe.max) * 100 : 0;
  const maxStepDisplay = displayNum(SHOE_MAX_STEP_KM, unit, 0) || 1;
  const stepMaxKm = (dir: 1 | -1) => {
    if (!shoe.id) return;
    const nextDisplay = displayNum(shoe.max, unit, 0) + dir * maxStepDisplay;
    onSetMaxKm?.(shoe.id, clampMaxKm(displayToKm(nextDisplay, unit)));
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

  return (
    <View style={s.screen}>
      <View style={s.detailNav}>
        <Pressable onPress={onBack} style={s.iconBtn}><Ionicons name="chevron-back" size={20} color={T1} /></Pressable>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => setEditing((e) => !e)} style={s.iconBtn}><Ionicons name="pencil" size={16} color={T2} /></Pressable>
          <Pressable onPress={toggleRetire} style={s.iconBtn}><Ionicons name={retired ? 'arrow-undo-outline' : 'archive-outline'} size={16} color={retired ? ACCENT : T2} /></Pressable>
          <Pressable onPress={confirmDelete} style={s.iconBtn}><Ionicons name="trash-outline" size={16} color={DANGER} /></Pressable>
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
            <View style={s.row}>
              <Text style={s.dBrand}>{shoe.brand}</Text>
              {/* 교체/주의 tier 배지 — 상세 헤더에서 즉시 눈에 띄게(양호는 미노출). */}
              <TierBadge condition={shoe.condition} size="md" />
              {retired && <Pill tone="dim" label="보관됨" />}
            </View>
            <Text style={s.dModel}>{shoe.model}</Text>
          </View>
        )}

        {/* 기본 CTA: 이 신발로 바로 런 시작(shoe-first). 보관된 신발은 시작 동선에서
            제외되므로 숨긴다(런 기록은 그대로 보존·표시). */}
        {!retired && shoe.id && onStartRun && (
          <Pressable onPress={() => onStartRun(shoe.id!)} style={s.runCta}>
            <Ionicons name="play" size={18} color={T1} />
            <Text style={s.runCtaText}>이 신발로 달리기</Text>
          </Pressable>
        )}

        {/* durability hero */}
        <View style={[s.card, s.dHero]}>
          <Ring size={116} stroke={12} progress={pct} color={ring}>
            <Text style={s.dHeroPct}>{Math.round(pct * 100)}<Text style={s.dHeroPctU}>%</Text></Text>
          </Ring>
          <View style={{ flex: 1 }}>
            <Text style={s.dHeroLabel}>남은 수명</Text>
            <View style={[s.baselineRow, { marginTop: 2 }]}>
              <Text style={s.dHeroRemain}>{remain}</Text>
              <Text style={s.dHeroRemainU}>{unit}</Text>
            </View>
            <View style={[s.row, { marginTop: 8 }]}>
              <View style={[s.dot, { backgroundColor: condColor(shoe.condition) }]} />
              <Text style={[s.condText, { color: condColor(shoe.condition) }]}>{shoe.condition}</Text>
              <Text style={s.condSub}>· {usedDisp}/{maxDisp}{unit}</Text>
            </View>
          </View>
        </View>

        {/* 교체 내러티브(keep-going 보이스) — 교체 tier 도달 시, 교체를 '손실'이 아니라
            '부상 없이 계속 달리기'의 조건으로 프레이밍해 상세를 마감한다. KEEP_GOING_REPLACE
            (lib/shoe 단일 카피)에서 파생. */}
        {!retired && shoe.condition === '교체' && (
          <View style={s.keepGoing}>
            <Ionicons name="shield-checkmark" size={17} color={ACCENT} />
            <Text style={s.keepGoingText}>{`${KEEP_GOING_REPLACE} 달릴 수 있어요`}</Text>
          </View>
        )}

        {/* 신발별 수명(max_km) 조정 + 교체 임계 표시 — 신발별 교체 임계의 분모.
            보관된 신발은 조정 동선에서 제외(기록은 그대로 유지). */}
        {!retired && shoe.id && onSetMaxKm && (
          <View style={[s.card, { padding: 18, gap: 14 }]}>
            <View style={s.cpkHead}>
              <Text style={s.dHeroLabel}>신발 수명</Text>
              <TierBadge condition={shoe.condition} />
            </View>
            <View style={s.maxStepper}>
              <Pressable
                onPress={() => stepMaxKm(-1)}
                hitSlop={6}
                style={({ pressed }) => [s.maxStepBtn, pressed && { backgroundColor: CARD }]}
              >
                <Ionicons name="remove" size={20} color={T1} />
              </Pressable>
              <View style={s.maxStepVal}>
                <Text style={s.maxStepNum}>{displayNum(shoe.max, unit, 0)}<Text style={s.maxStepUnit}> {unit}</Text></Text>
                <Text style={s.maxStepCaption}>{Math.round(percentUsed)}% 사용</Text>
              </View>
              <Pressable
                onPress={() => stepMaxKm(1)}
                hitSlop={6}
                style={({ pressed }) => [s.maxStepBtn, pressed && { backgroundColor: CARD }]}
              >
                <Ionicons name="add" size={20} color={T1} />
              </Pressable>
            </View>
            {/* 임계 표시: 교체 tier(≥90%) 도달까지 남은 거리. 이미 교체 tier면 사실만
                알리고, keep-going 카피는 위 배너가 단독으로 담당한다(중복 방지). */}
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

        {/* totals */}
        <View style={[s.card, s.statRow]}>
          {[
            { v: String(usedDisp), u: unit, l: '총 누적 거리' },
            { v: String(totals.totalRuns), u: '회', l: '총 런 횟수' },
            { v: totals.totalTime, u: '', l: '총 러닝 시간' },
          ].map((x, i) => (
            <View key={i} style={[s.statCell, i > 0 && s.statDivider]}>
              <Text style={s.statValue}>{x.v}<Text style={s.statUnit}>{x.u}</Text></Text>
              <Text style={s.statLabel}>{x.l}</Text>
            </View>
          ))}
        </View>

        {/* cost-per-km: 구매가 입력 → km당 비용 파생 */}
        <View style={[s.card, { padding: 18, gap: 12 }]}>
          <View style={s.cpkHead}>
            <Text style={s.dHeroLabel}>구매가</Text>
            {cpk != null && (
              <View style={s.cpkBadge}>
                <Text style={s.cpkBadgeV}>{fmtWon(cpk)}</Text>
                <Text style={s.cpkBadgeU}>원/km</Text>
              </View>
            )}
          </View>
          <View style={s.priceRow}>
            <TextInput
              value={priceInput}
              onChangeText={(v) => setPriceInput(v.replace(/[^0-9]/g, ''))}
              onBlur={savePrice}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={T3}
              style={s.priceInput}
            />
            <Text style={s.priceUnit}>원</Text>
          </View>
          <Text style={s.cpkHint}>
            {cpk != null
              ? `${usedDisp}${unit} 사용 · 1km당 ${fmtWon(cpk)}원`
              : '구매가를 입력하면 1km당 비용이 계산돼요.'}
          </Text>
        </View>

        {/* runs */}
        <View style={[s.row, { paddingHorizontal: 4, justifyContent: 'space-between' }]}>
          <Text style={s.sectionLabel}>이 신발로 달린 기록</Text>
          {!!totals.lastWorn && <Text style={s.lastWorn}>마지막 착용 {totals.lastWorn}</Text>}
        </View>
        {shoeRuns.length === 0 ? (
          <View style={[s.card, { padding: 24, alignItems: 'center' }]}>
            <Text style={{ color: T3, fontFamily: FONT, fontSize: 13 }}>아직 기록이 없어요</Text>
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
      </ScrollView>
    </View>
  );
}

// ── locker ─────────────────────────────────────────────────────────────────
function ShoeCard({ shoe, featured, onPress, onPlay, unit }: { shoe: Shoe; featured: boolean; onPress: () => void; onPlay?: () => void; unit: Unit }) {
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remainKm / shoe.max : 0;
  const ring = ringColor(shoe.condition);
  const retired = !!shoe.retired;
  const usedDisp = displayNum(shoe.used, unit);
  const maxDisp = displayNum(shoe.max, unit);
  return (
    <Pressable onPress={onPress} style={[s.shoeCard, featured ? s.shoeCardFeatured : s.shoeCardIdle, retired && s.shoeCardRetired]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Ring size={72} stroke={9} progress={pct} color={retired ? T3 : ring}>
          <Text style={s.shoeRingPct}>{Math.round(pct * 100)}<Text style={s.shoeRingPctU}>%</Text></Text>
        </Ring>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.row}>
            <Text style={s.shoeBrand}>{shoe.brand}</Text>
            {/* 교체/주의 tier 배지 — 목록 카드에서 한눈에(양호는 미노출). */}
            {!retired && <TierBadge condition={shoe.condition} />}
            {retired ? <Pill tone="dim" label="보관됨" />
              : featured && <Pill tone="accent" label="사용 중" />}
          </View>
          <Text style={s.shoeModel} numberOfLines={1}>{shoe.model}</Text>
          <Text style={s.shoeMeta}>{usedDisp} / {maxDisp} {unit} · <Text style={{ color: condColor(shoe.condition) }}>{shoe.condition}</Text></Text>
        </View>
        {/* play 어포던스: 카드에서 바로 이 신발로 런 시작(shoe-first). 카드 자체 탭은
            상세로 가므로, 시작은 별도 버튼으로 분리한다. 보관된 신발엔 노출하지 않는다. */}
        {!retired && onPlay ? (
          <Pressable onPress={onPlay} hitSlop={10} style={s.cardPlay} testID={shoe.id ? `shoe-play-${shoe.id}` : undefined}>
            <Ionicons name="play" size={16} color={T1} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={T3} />
        )}
      </View>
      <View style={s.track}>
        <View style={[s.trackFill, { width: `${pct * 100}%`, backgroundColor: retired ? T3 : ring }]} />
      </View>
    </Pressable>
  );
}

export default function ShoesScreen({
  shoes = SHOES, runs = [], totals = {}, activeIdx = 0, prices = {}, unit = 'km', onAddShoe, onTab, onRename, onDelete, onRetire, onSetPrice, onSetMaxKm, onStartRun,
}: {
  shoes?: Shoe[];
  runs?: Run[];
  totals?: Record<number, ShoeTotals>;
  activeIdx?: number;
  // 신발 id → 구매가(원). cost-per-km 파생용. 미입력 신발은 키 없음.
  prices?: Record<string, number>;
  // 표시 단위(km|mi). 수명·기록 거리가 이를 따른다(cost-per-km는 km 고정).
  unit?: Unit;
  onAddShoe?: () => void;
  onTab?: (i: number) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onRetire?: (id: string, retired: boolean) => void;
  onSetPrice?: (id: string, price: number) => void;
  // 신발별 수명(max_km) 조정 — 상세 화면 수명 스테퍼가 호출한다.
  onSetMaxKm?: (id: string, maxKm: number) => void;
  // shoe-first 동선: 상세 CTA·락커 카드 play에서 해당 신발 id로 런 시작을 알린다.
  onStartRun?: (id: string) => void;
}) {
  const [detail, setDetail] = useState<number | null>(null);

  if (detail != null && shoes[detail]) {
    const dShoe = shoes[detail];
    return (
      <ShoeDetail
        shoe={dShoe}
        idx={detail}
        runs={runs}
        totals={totals[detail] || { totalRuns: 0, totalTime: '--' }}
        price={dShoe.id ? prices[dShoe.id] : undefined}
        unit={unit}
        onBack={() => setDetail(null)}
        onRename={onRename}
        onDelete={onDelete}
        onRetire={onRetire}
        onSetPrice={onSetPrice}
        onSetMaxKm={onSetMaxKm}
        onStartRun={onStartRun}
      />
    );
  }

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.headerCount}>{shoes.length}켤레 보유</Text>
        <Text style={s.title}>신발</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8, gap: 14, paddingTop: 12 }}>
        {shoes.map((shoe, i) => (
          <ShoeCard
            key={shoe.id || i}
            shoe={shoe}
            featured={i === activeIdx}
            unit={unit}
            onPress={() => setDetail(i)}
            onPlay={shoe.id && onStartRun ? () => onStartRun(shoe.id!) : undefined}
          />
        ))}
        <Pressable onPress={onAddShoe} style={s.addCard}>
          <Ionicons name="add" size={18} color={T3} />
          <Text style={s.addText}>러닝화 등록하기</Text>
        </Pressable>
      </ScrollView>
      <TabBar active={2} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },
  card: { backgroundColor: CARD, borderRadius: 22 },
  sectionLabel: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 4 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  condText: { fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  condSub: { color: T3, fontFamily: FONT, fontSize: 13 },

  header: { paddingTop: 60, paddingHorizontal: 22, paddingBottom: 8 },
  headerCount: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600' },
  title: { color: T1, fontFamily: FONT, fontSize: 32, fontWeight: '500', letterSpacing: -0.8, marginTop: 2 },

  shoeCard: { backgroundColor: CARD, borderRadius: 22, padding: 22 },
  shoeCardFeatured: { borderWidth: 1, borderColor: ACCENT },
  shoeCardIdle: { borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.05) },
  shoeCardRetired: { opacity: 0.55, borderColor: withAlpha(T1, 0.05) },
  shoeRingPct: { color: T1, fontFamily: DISPLAY, fontSize: 17 },
  shoeRingPctU: { color: T3, fontFamily: FONT, fontSize: 9 },
  shoeBrand: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500', letterSpacing: 1.3 },
  shoeModel: { color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '500', letterSpacing: -0.3, marginTop: 3 },
  shoeMeta: { color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '600', marginTop: 5 },
  cardPlay: { width: 38, height: 38, borderRadius: 999, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 999, backgroundColor: CARD_HI, overflow: 'hidden', marginTop: 16 },
  trackFill: { height: '100%', borderRadius: 999 },

  addCard: { borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: withAlpha(T1, 0.12), padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addText: { color: T3, fontFamily: FONT, fontSize: 15, fontWeight: '500' },

  // detail
  detailNav: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },
  dBrand: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', letterSpacing: 1.6 },
  dModel: { color: T1, fontFamily: FONT, fontSize: 27, fontWeight: '500', letterSpacing: -0.6, marginTop: 4 },
  runCta: { height: 54, borderRadius: 18, backgroundColor: ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  runCtaText: { color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },

  // 교체 내러티브 배너(keep-going 보이스) — accent 톤 반투명 표면(withAlpha 파생).
  keepGoing: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: withAlpha(ACCENT, 0.12), borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.35), paddingHorizontal: 16, paddingVertical: 13 },
  keepGoingText: { flex: 1, color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: -0.1, lineHeight: 18 },
  dHero: { padding: 24, flexDirection: 'row', alignItems: 'center', gap: 22 },
  dHeroPct: { color: T1, fontFamily: DISPLAY, fontSize: 30 },
  dHeroPctU: { color: T3, fontFamily: FONT, fontSize: 13 },
  dHeroLabel: { color: T3, fontFamily: FONT, fontSize: 13 },
  dHeroRemain: { color: T1, fontFamily: DISPLAY, fontSize: 44, letterSpacing: 0.5 },
  dHeroRemainU: { color: T2, fontFamily: FONT, fontSize: 16, marginLeft: 5, marginBottom: 6 },

  editInput: { backgroundColor: CARD_HI, borderRadius: 14, color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '500', paddingHorizontal: 16, paddingVertical: 13 },
  editBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  editBtnTxt: { fontFamily: FONT, fontSize: 15, fontWeight: '600' },

  statRow: { flexDirection: 'row', paddingVertical: 20, paddingHorizontal: 14 },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP },
  statValue: { color: T1, fontFamily: DISPLAY, fontSize: 22, letterSpacing: 0.3 },
  statUnit: { color: T3, fontFamily: FONT, fontSize: 12 },
  statLabel: { color: T3, fontFamily: FONT, fontSize: 11, marginTop: 4 },

  cpkHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cpkBadge: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, backgroundColor: CARD_HI, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  cpkBadgeV: { color: ACCENT, fontFamily: DISPLAY, fontSize: 17 },
  cpkBadgeU: { color: T3, fontFamily: FONT, fontSize: 11, marginBottom: 1 },
  priceRow: { backgroundColor: CARD_HI, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  priceInput: { flex: 1, color: T1, fontFamily: DISPLAY, fontSize: 22, paddingVertical: 12 },
  priceUnit: { color: T3, fontFamily: FONT, fontSize: 15 },
  cpkHint: { color: T3, fontFamily: FONT, fontSize: 11.5 },
  lastWorn: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },

  // 신발 수명(max_km) 조정 스테퍼
  maxStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  maxStepBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center' },
  maxStepVal: { flex: 1, alignItems: 'center' },
  maxStepNum: { color: T1, fontFamily: DISPLAY, fontSize: 28, letterSpacing: 0.3 },
  maxStepUnit: { color: T3, fontFamily: FONT, fontSize: 13 },
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
