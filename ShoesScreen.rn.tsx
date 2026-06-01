// ============================================================================
// ShoesScreen.rn.tsx — 신발 locker + 신발 상세 (ShoeDetail)
// (sample data removed — real shoes/runs/totals injected via props)
// ============================================================================
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD, CARD_HI, ACCENT, DANGER, WARN, GOOD, T1, T2, T3, SEP, FONT, DISPLAY, Shoe, Run, SHOES,
} from './theme';
import { Ring, TabBar } from './primitives';
import { costPerKm } from './lib/shoeRecommend';

// lastWorn: 이 신발의 마지막 착용일(런에서 파생, 한국어 표기). 미착용이면 생략.
export type ShoeTotals = { totalRuns: number; totalTime: string; lastWorn?: string };

// 정수 원화에 천단위 콤마. 음수/NaN은 그대로(호출부가 양수만 넘김).
const fmtWon = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Proportional condition → color (shoeHealth tiers: 양호 / 주의 / 교체).
const condColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : GOOD);
const ringColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : ACCENT);

// ── shoe detail ───────────────────────────────────────────────────────────────
function ShoeDetail({
  shoe, idx, runs, totals, price, onBack, onRename, onDelete, onRetire, onSetPrice,
}: {
  shoe: Shoe;
  idx: number;
  runs: Run[];
  totals: ShoeTotals;
  price?: number;
  onBack: () => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onRetire?: (id: string, retired: boolean) => void;
  onSetPrice?: (id: string, price: number) => void;
}) {
  const remain = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remain / shoe.max : 0;
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
              <Pressable onPress={saveName} style={[s.editBtn, { backgroundColor: ACCENT }]}><Text style={[s.editBtnTxt, { color: '#fff' }]}>저장</Text></Pressable>
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 4 }}>
            <View style={s.row}>
              <Text style={s.dBrand}>{shoe.brand}</Text>
              {retired && <View style={s.retiredChip}><Text style={s.retiredChipText}>보관됨</Text></View>}
            </View>
            <Text style={s.dModel}>{shoe.model}</Text>
          </View>
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
              <Text style={s.dHeroRemainU}>km</Text>
            </View>
            <View style={[s.row, { marginTop: 8 }]}>
              <View style={[s.dot, { backgroundColor: condColor(shoe.condition) }]} />
              <Text style={[s.condText, { color: condColor(shoe.condition) }]}>{shoe.condition}</Text>
              <Text style={s.condSub}>· {shoe.used}/{shoe.max}km</Text>
            </View>
          </View>
        </View>

        {/* totals */}
        <View style={[s.card, s.statRow]}>
          {[
            { v: String(shoe.used), u: 'km', l: '총 누적 거리' },
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
              ? `${shoe.used}km 사용 · 1km당 ${fmtWon(cpk)}원`
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
                  <View style={s.baselineRow}><Text style={s.runDist}>{r.dist}</Text><Text style={s.runDistU}>km</Text></View>
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
function ShoeCard({ shoe, featured, onPress }: { shoe: Shoe; featured: boolean; onPress: () => void }) {
  const remain = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remain / shoe.max : 0;
  const ring = ringColor(shoe.condition);
  const retired = !!shoe.retired;
  return (
    <Pressable onPress={onPress} style={[s.shoeCard, featured ? s.shoeCardFeatured : s.shoeCardIdle, retired && s.shoeCardRetired]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Ring size={72} stroke={9} progress={pct} color={retired ? T3 : ring}>
          <Text style={s.shoeRingPct}>{Math.round(pct * 100)}<Text style={s.shoeRingPctU}>%</Text></Text>
        </Ring>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.row}>
            <Text style={s.shoeBrand}>{shoe.brand}</Text>
            {retired ? <View style={s.retiredChip}><Text style={s.retiredChipText}>보관됨</Text></View>
              : featured && <View style={s.usingChip}><Text style={s.usingChipText}>사용 중</Text></View>}
          </View>
          <Text style={s.shoeModel} numberOfLines={1}>{shoe.model}</Text>
          <Text style={s.shoeMeta}>{shoe.used} / {shoe.max} km · <Text style={{ color: condColor(shoe.condition) }}>{shoe.condition}</Text></Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={T3} />
      </View>
      <View style={s.track}>
        <View style={[s.trackFill, { width: `${pct * 100}%`, backgroundColor: retired ? T3 : ring }]} />
      </View>
    </Pressable>
  );
}

export default function ShoesScreen({
  shoes = SHOES, runs = [], totals = {}, activeIdx = 0, prices = {}, onAddShoe, onTab, onRename, onDelete, onRetire, onSetPrice,
}: {
  shoes?: Shoe[];
  runs?: Run[];
  totals?: Record<number, ShoeTotals>;
  activeIdx?: number;
  // 신발 id → 구매가(원). cost-per-km 파생용. 미입력 신발은 키 없음.
  prices?: Record<string, number>;
  onAddShoe?: () => void;
  onTab?: (i: number) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onRetire?: (id: string, retired: boolean) => void;
  onSetPrice?: (id: string, price: number) => void;
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
        onBack={() => setDetail(null)}
        onRename={onRename}
        onDelete={onDelete}
        onRetire={onRetire}
        onSetPrice={onSetPrice}
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
          <ShoeCard key={shoe.id || i} shoe={shoe} featured={i === activeIdx} onPress={() => setDetail(i)} />
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
  shoeCardIdle: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.05)' },
  shoeCardRetired: { opacity: 0.55, borderColor: 'rgba(255,255,255,0.05)' },
  retiredChip: { backgroundColor: CARD_HI, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  retiredChipText: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '500', letterSpacing: 0.4 },
  shoeRingPct: { color: T1, fontFamily: DISPLAY, fontSize: 17 },
  shoeRingPctU: { color: T3, fontFamily: FONT, fontSize: 9 },
  shoeBrand: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500', letterSpacing: 1.3 },
  usingChip: { backgroundColor: 'rgba(255,101,0,0.14)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  usingChipText: { color: ACCENT, fontFamily: FONT, fontSize: 10, fontWeight: '500' },
  shoeModel: { color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '500', letterSpacing: -0.3, marginTop: 3 },
  shoeMeta: { color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '600', marginTop: 5 },
  track: { height: 6, borderRadius: 999, backgroundColor: CARD_HI, overflow: 'hidden', marginTop: 16 },
  trackFill: { height: '100%', borderRadius: 999 },

  addCard: { borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)', padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addText: { color: T3, fontFamily: FONT, fontSize: 15, fontWeight: '500' },

  // detail
  detailNav: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  dBrand: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', letterSpacing: 1.6 },
  dModel: { color: T1, fontFamily: FONT, fontSize: 27, fontWeight: '500', letterSpacing: -0.6, marginTop: 4 },
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
