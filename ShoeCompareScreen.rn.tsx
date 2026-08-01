// ============================================================================
// ShoeCompareScreen.rn.tsx — 러닝화 비교
// ----------------------------------------------------------------------------
// 흩어진 스펙을 한 표에 세운다. 지금 이걸 하려면 브랜드마다 공식몰을 열고, 단위도
// 제각각이고(oz/g), 무게 잰 사이즈가 다른 것도 모른 채 비교해야 한다. 그 수고를
// 우리가 미리 해둔 게 카탈로그이고, 이 화면이 그 데이터가 값을 하는 자리다.
//
// '추천'이 아니라 '비교'인 이유: 추천은 우리가 순서를 정하니 "커미션 때문에 뜬 건가"
// 하는 의심이 붙는다. 비교는 무엇을 놓을지 사용자가 고르므로 왜곡될 자리가 없다.
//
// 계산은 전부 lib/shoeCompareTable.ts(순수)에 있다. 여기는 그리기만 한다.
// ============================================================================
import React, {useMemo, useState} from 'react';
import {View, StyleSheet, Pressable, ScrollView, Modal} from 'react-native';
import {Text, TextInput} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {rf, rs, rv} from './lib/responsive';
import {BG, CARD, CARD_HI, T1, T2, T3, T4, SEP, FONT, NUM, RADIUS, GUTTER,
  RING_ACCENT, withAlpha, TYPE} from './theme';
import {buildCompareTable, mineSummary, MAX_COMPARE, type CompareShoe} from './lib/shoeCompareTable';
import {allCatalogShoes, displayName, toCompareShoe} from './lib/shoeCatalogLookup';
import {searchShoes} from './lib/shoeSearch';
import type {ShoeDoc} from './types/shoe';

export type CompareSeed = {shoe: CompareShoe};

// ── 추가 시트 ────────────────────────────────────────────────────────────────
// 검색은 카탈로그 전체를 훑는다(내 신발장은 호출부가 seed 로 먼저 넣어준다).
function AddSheet({visible, onClose, onPick, exclude}: {
  visible: boolean;
  onClose: () => void;
  onPick: (d: ShoeDoc) => void;
  exclude: readonly string[];
}) {
  const [q, setQ] = useState('');
  const insets = useSafeAreaInsets();
  const results = useMemo(() => {
    const all = allCatalogShoes().filter(d => !exclude.includes(d.id));
    return searchShoes(all, q, {limit: 40});
  }, [q, exclude]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[s.screen, {paddingTop: insets.top + rv(10)}]}>
        <View style={s.bar}>
          <Text style={s.title}>러닝화 추가</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
            <Text style={s.done}>완료</Text>
          </Pressable>
        </View>
        <SearchBox value={q} onChange={setQ} />
        <ScrollView
          style={s.flex1}
          contentContainerStyle={{paddingBottom: Math.max(insets.bottom, rv(16))}}
          keyboardShouldPersistTaps="handled">
          {results.map(d => (
            <Pressable
              key={d.id}
              onPress={() => { onPick(d); onClose(); }}
              accessibilityRole="button"
              accessibilityLabel={`${d.brand} ${displayName(d)} 추가`}
              style={({pressed}) => [s.item, pressed && s.pressed]}>
              <View style={s.flex1}>
                <Text numberOfLines={1} style={s.itemName}>{displayName(d)}</Text>
                <Text style={s.itemSub}>{summaryLine(d)}</Text>
              </View>
            </Pressable>
          ))}
          {results.length === 0 && (
            <Text style={s.empty}>“{q.trim()}” 검색 결과가 없어요.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** 검색 결과 한 줄 요약 — 아는 것만 잇는다(모르는 축은 빠진다). */
function summaryLine(d: ShoeDoc): string {
  const parts: string[] = [d.brand];
  if (d.weight != null) parts.push(`${d.weight}g`);
  if (d.stackHeight) parts.push(`${d.stackHeight.heel}/${d.stackHeight.forefoot}mm`);
  if (d.drop != null) parts.push(`드롭 ${d.drop}`);
  return parts.length > 1 ? parts.join(' · ') : `${d.brand} · 스펙 확인 중`;
}

function SearchBox({value, onChange}: {value: string; onChange: (v: string) => void}) {
  return (
    <View style={s.search}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="브랜드나 모델명 검색"
        placeholderTextColor={T4}
        style={s.searchInput}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="러닝화 검색"
        testID="compare-search"
      />
    </View>
  );
}

// ── 본 화면 ──────────────────────────────────────────────────────────────────
export default function ShoeCompareScreen({seed, onClose}: {
  /** 첫 칸(기준)에 미리 세울 신발. 없으면 빈 상태로 시작한다. */
  seed?: CompareShoe | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [shoes, setShoes] = useState<CompareShoe[]>(seed ? [seed] : []);
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(() => buildCompareTable(shoes), [shoes]);
  const mine = useMemo(() => mineSummary(shoes[0]), [shoes]);
  const full = shoes.length >= MAX_COMPARE;

  const add = (d: ShoeDoc) => setShoes(prev =>
    prev.length >= MAX_COMPARE ? prev : [...prev, toCompareShoe(d)]);
  const remove = (id: string) => setShoes(prev => prev.filter(x => x.id !== id));

  return (
    <View style={[s.screen, {paddingTop: insets.top + rv(10)}]}>
      <View style={s.bar}>
        <Text style={s.title}>러닝화 비교</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
          <Text style={s.done}>완료</Text>
        </Pressable>
      </View>

      <ScrollView
        style={s.flex1}
        contentContainerStyle={{paddingBottom: Math.max(insets.bottom, rv(16)) + rv(20)}}>
        {shoes.length === 0 ? (
          <Text style={s.empty}>비교할 러닝화를 추가해 보세요.</Text>
        ) : (
          <View style={s.table}>
            {/* 헤더 — 신발 이름 */}
            <View style={s.row}>
              <View style={s.labelCell} />
              {shoes.map((sh, i) => (
                <View key={sh.id} style={s.cell}>
                  <Text style={s.brand} numberOfLines={1}>{sh.brand.toUpperCase()}</Text>
                  <Text style={[s.model, i === 0 && s.modelBase]} numberOfLines={2}>{sh.name}</Text>
                  <Pressable
                    onPress={() => remove(sh.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`${sh.name} 비교에서 빼기`}
                    style={({pressed}) => [s.pill, i === 0 && s.pillBase, pressed && s.pressed]}>
                    <Text style={[s.pillTxt, i === 0 && s.pillTxtBase]}>
                      {i === 0 ? '기준' : '빼기'}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>

            {/* 값 행 */}
            {rows.map(r => (
              <View key={r.key} style={[s.row, s.rowSep]}>
                <View style={s.labelCell}>
                  <Text style={s.label}>{r.label}</Text>
                  {!!r.hint && <Text style={s.hint}>{r.hint}</Text>}
                </View>
                {r.cells.map((c, i) => (
                  <View key={`${r.key}-${i}`} style={s.cell}>
                    {c.value === null ? (
                      <Text style={s.dash}>—</Text>
                    ) : c.unit ? (
                      <Text style={[s.value, i === 0 && s.valueBase]}>
                        {c.value}<Text style={s.unit}>{c.unit}</Text>
                      </Text>
                    ) : (
                      <Text style={[s.textVal, i === 0 && s.textValBase]}>{c.value}</Text>
                    )}
                    {/* 차이와 보조표기는 **둘 다** 필요하다. 예전엔 sub 가 있으면 delta 를
                        가려서, 잰 사이즈가 다른 신발은 차이가 아예 안 보였다. */}
                    {c.delta != null && (
                      <Text style={[s.delta, i === 0 && s.deltaBase]}>{c.delta}</Text>
                    )}
                    {c.sub != null && (
                      <Text style={[s.delta, i === 0 && s.deltaBase]}>{c.sub}</Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* 기준이 내 신발일 때만 — 비교 축이 아니라 맥락이라 표 밖에 둔다 */}
        {mine && (
          <View style={s.mine}>
            <View style={s.mineRow}>
              <Text style={s.mineKey} numberOfLines={1}>{mine.name} 남은 수명</Text>
              <Text style={s.mineVal}>{mine.remainKm} km</Text>
            </View>
            <View style={s.mineTrack}>
              <View style={[s.mineFill, {width: `${Math.round(mine.pct * 100)}%`}]} />
            </View>
          </View>
        )}

        <Pressable
          onPress={() => setAddOpen(true)}
          disabled={full}
          accessibilityRole="button"
          accessibilityLabel="비교할 러닝화 추가"
          accessibilityState={{disabled: full}}
          testID="compare-add"
          style={({pressed}) => [s.cta, full && s.ctaOff, pressed && !full && s.pressed]}>
          <Text style={[s.ctaTxt, full && s.ctaTxtOff]}>
            {full ? `한 번에 ${MAX_COMPARE}켤레까지 볼 수 있어요` : '＋ 러닝화 추가'}
          </Text>
        </Pressable>
      </ScrollView>

      <AddSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={add}
        exclude={shoes.map(x => x.id)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  flex1: {flex: 1},
  pressed: {opacity: 0.6},

  bar: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: GUTTER, paddingBottom: rv(14)},
  // 글씨 크기는 **전부 theme.ts 의 TYPE 토큰**을 쓴다(2026-08-01).
  // 그 전에는 9·9.5·10·11.5·12.5·19.5 처럼 숫자를 직접 박아 놨는데, 그중 셋이 스케일
  // 최소값 micro(11)보다도 작아 실기기에서 읽기 어려웠다("전체적으로 글씨가 너무 작아").
  // 토큰을 쓰면 다른 화면과 위계가 자동으로 맞고, 접근성 스케일도 함께 따라간다.
  title: {fontFamily: FONT, ...TYPE.screenTitle, color: T1},
  done: {fontFamily: FONT, ...TYPE.body, color: T3},

  table: {paddingHorizontal: rs(12)},
  row: {flexDirection: 'row', alignItems: 'flex-start'},
  rowSep: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  labelCell: {width: rs(78), paddingHorizontal: rs(8), paddingTop: rv(15)},
  label: {fontFamily: FONT, ...TYPE.caption, color: T3},
  hint: {fontFamily: FONT, ...TYPE.micro, color: T4, marginTop: rv(2), letterSpacing: 0.2},
  cell: {flex: 1, paddingHorizontal: rs(8), paddingTop: rv(13), paddingBottom: rv(14)},

  brand: {fontFamily: FONT, ...TYPE.micro, color: T4, marginBottom: rv(3)},
  model: {fontFamily: FONT, ...TYPE.label, fontWeight: '700', color: T2, letterSpacing: -0.2},
  modelBase: {color: T1},
  pill: {alignSelf: 'flex-start', marginTop: rv(7), paddingHorizontal: rs(6), paddingVertical: rv(2.5),
    borderRadius: RADIUS.sm / 2, backgroundColor: CARD_HI},
  pillBase: {backgroundColor: withAlpha(T1, 0.13)},
  pillTxt: {fontFamily: FONT, ...TYPE.micro, color: T3},
  pillTxtBase: {color: T1},

  // 표에서 제일 먼저 읽어야 하는 건 숫자다. 예전 19.5 는 모델명(12.5)과 두 배도 차이가
  // 안 나 위계가 약했다 — title(23)로 올려 한눈에 숫자가 먼저 들어오게 한다.
  value: {fontFamily: NUM, ...TYPE.title, color: T3, letterSpacing: -0.3},
  valueBase: {color: T1, fontWeight: '500'},
  unit: {fontFamily: FONT, ...TYPE.caption, color: T4},
  textVal: {fontFamily: FONT, ...TYPE.body, color: T2, letterSpacing: -0.2},
  textValBase: {color: T1, fontWeight: '600'},
  dash: {fontFamily: FONT, ...TYPE.body, color: T4},
  delta: {fontFamily: NUM, ...TYPE.label, color: T2, marginTop: rv(5)},
  deltaBase: {color: T4, fontWeight: '400'},

  mine: {marginHorizontal: GUTTER, marginTop: rv(18), padding: rs(14),
    backgroundColor: CARD, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP},
  mineRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline'},
  mineKey: {flex: 1, fontFamily: FONT, ...TYPE.caption, color: T3},
  mineVal: {fontFamily: NUM, ...TYPE.body, color: T2, marginLeft: rs(8)},
  mineTrack: {marginTop: rv(9), height: rv(3), borderRadius: rv(2),
    backgroundColor: withAlpha(T1, 0.08), overflow: 'hidden'},
  mineFill: {height: '100%', borderRadius: rv(2), backgroundColor: RING_ACCENT},

  cta: {marginHorizontal: GUTTER, marginTop: rv(18), paddingVertical: rv(15),
    borderRadius: RADIUS.btn, backgroundColor: CARD_HI, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  ctaOff: {backgroundColor: 'transparent'},
  ctaTxt: {fontFamily: FONT, ...TYPE.body, fontWeight: '600', color: T1},
  ctaTxtOff: {color: T4, fontWeight: '400'},

  search: {marginHorizontal: GUTTER, marginBottom: rv(6), backgroundColor: CARD_HI,
    borderRadius: RADIUS.input, paddingHorizontal: rs(14)},
  searchInput: {fontFamily: FONT, ...TYPE.body, color: T1, paddingVertical: rv(12)},
  item: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER,
    paddingVertical: rv(12)},
  itemName: {fontFamily: FONT, ...TYPE.body, fontWeight: '600', color: T1, letterSpacing: -0.2},
  itemSub: {fontFamily: FONT, ...TYPE.caption, color: T4, marginTop: rv(3)},
  empty: {fontFamily: FONT, ...TYPE.body, color: T3, textAlign: 'center',
    marginTop: rv(40), paddingHorizontal: GUTTER, lineHeight: rf(24)},
});
