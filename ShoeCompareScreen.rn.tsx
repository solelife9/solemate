// ============================================================================
// ShoeCompareScreen.rn.tsx — 러닝화 스펙 비교
// ----------------------------------------------------------------------------
// 흩어진 스펙을 한 표에 세운다. 지금 이걸 하려면 브랜드마다 공식몰을 열고, 단위도
// 제각각이고(oz/g), 무게 잰 사이즈가 다른 것도 모른 채 비교해야 한다. 그 수고를
// 우리가 미리 해둔 게 카탈로그이고, 이 화면이 그 데이터가 값을 하는 자리다.
//
// '추천'이 아니라 '비교'인 이유: 추천은 우리가 순서를 정하니 "커미션 때문에 뜬 건가"
// 하는 의심이 붙는다. 비교는 무엇을 놓을지 사용자가 고르므로 왜곡될 자리가 없다.
//
// ── 2026-08-02 재설계(실기기 피드백) ────────────────────────────────────────
// 셋을 고쳤다. 전부 "기준(첫 칸)이 곧 내 신발"이라는 낡은 가정에서 나온 문제였다.
//  · **「기준」 칩이 삭제 버튼이었다.** 배지처럼 생겼는데 누르면 그 신발이 빠졌다
//    (민우님: "기준이라고 써있는 걸 클릭하면 없어지는데"). 빼기는 ✕ 로 분리했다.
//  · **기준을 바꿀 수 없었다.** 처음 넣은 게 영구 기준이라 "내 신발 말고 저 둘을
//    견주고 싶다"가 불가능했다. 이제 어느 칸이든 「기준으로」 로 기준이 된다.
//  · **추가할 때 카탈로그가 한 줄로 쏟아졌다.** 그것도 '최근 출시 40켤레'라, 관련
//    있어 보이지만 아무 의미 없는 목록이었다. 등록·온보딩이 쓰는 공용 ShoePicker
//    (브랜드 레일 + 모델)를 그대로 쓴다 — 새로 만들지 않고 있는 걸 쓴다.
// 종류(데일리·레이싱…)도 칸마다 적는다. 무게 296g 이 무거운 건지 아닌지는 종류를
// 알아야 판단된다.
//
// 계산은 전부 lib/shoeCompareTable.ts(순수)에 있다. 여기는 그리기만 한다.
// ============================================================================
import React, {useMemo, useState} from 'react';
import {View, StyleSheet, Pressable, ScrollView} from 'react-native';
import {Text} from './lib/text';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {rf, ri, rs, rv} from './lib/responsive';
import {BG, CARD, CARD_HI, T1, T2, T3, T4, SEP, FONT, NUM, RADIUS, GUTTER,
  RING_ACCENT, withAlpha, TYPE, ICON} from './theme';
import {buildCompareTable, mineSummary, MAX_COMPARE, type CompareShoe} from './lib/shoeCompareTable';
import {findCatalogShoe, toCompareShoe, unknownCompareShoe, SHOE_CATEGORY_KO} from './lib/shoeCatalogLookup';
import {ShoePicker, type PickedShoe} from './ShoePicker';

/** 브랜드+모델이 같은지(대소문자·여백 무시) — 내 신발과 카탈로그를 잇는 열쇠. */
const sameShoe = (a: {brand: string; model: string}, b: {brand: string; model: string}) =>
  a.brand.trim().toLowerCase() === b.brand.trim().toLowerCase()
  && a.model.trim().toLowerCase() === b.model.trim().toLowerCase();

/** 내 신발장 한 켤레 — 표에 세울 때 사용률(mine)까지 함께 실어준다. */
export interface MyShoeRef {
  brand: string;
  model: string;
  usedKm: number;
  lifespanKm: number;
}

export default function ShoeCompareScreen({seeds, myShoes = [], onClose}: {
  /** 미리 세워둘 신발들(1:1 비교에서 넘어오면 기준+후보 둘). 없으면 빈 표로 시작한다. */
  seeds?: readonly CompareShoe[] | null;
  /** 내 신발장 — 피커 맨 위에 얹어 한 번에 넣는다. */
  myShoes?: readonly MyShoeRef[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [shoes, setShoes] = useState<CompareShoe[]>(
    () => (seeds ? seeds.slice(0, MAX_COMPARE) : []));
  /** 차이를 재는 기준 칸. 빼기로 칸이 사라지면 아래에서 따라 움직인다. */
  const [baseIdx, setBaseIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const rows = useMemo(() => buildCompareTable(shoes, baseIdx), [shoes, baseIdx]);
  const mine = useMemo(() => mineSummary(shoes[baseIdx]), [shoes, baseIdx]);
  const full = shoes.length >= MAX_COMPARE;

  /** 피커가 넘긴 {브랜드, 모델} → 표에 세울 형태. 내 신발이면 사용률까지 싣는다. */
  const add = (p: PickedShoe) => {
    const owned = myShoes.find(m => sameShoe(m, p));
    const mineRec = owned ? {usedKm: owned.usedKm, lifespanKm: owned.lifespanKm} : null;
    const doc = findCatalogShoe(p.brand, p.model);
    const next = doc
      ? toCompareShoe(doc, mineRec)
      : unknownCompareShoe(p.brand, p.model, mineRec);
    setShoes(prev =>
      prev.length >= MAX_COMPARE || prev.some(x => x.id === next.id) ? prev : [...prev, next]);
  };

  /**
   * 칸을 뺀다. 기준 칸을 빼면 남은 첫 칸이 기준이 되고, 기준보다 앞을 빼면 기준이
   * 한 칸 당겨진다 — 안 그러면 엉뚱한 신발이 조용히 기준이 된다.
   */
  const remove = (id: string) => {
    const i = shoes.findIndex(x => x.id === id);
    if (i < 0) return;
    setShoes(shoes.filter((_, k) => k !== i));
    setBaseIdx(b => (i < b ? b - 1 : i === b ? 0 : b));
  };

  return (
    <View style={[s.screen, {paddingTop: insets.top + rv(10)}]} testID="shoe-compare-screen">
      <View style={s.bar}>
        <Text style={s.title}>스펙 비교</Text>
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
            {/* 헤더 — 브랜드 · 모델 · 종류 · 기준 컨트롤 */}
            <View style={s.row}>
              <View style={s.labelCell} />
              {shoes.map((sh, i) => {
                const isBase = i === baseIdx;
                const cat = sh.category ? SHOE_CATEGORY_KO[sh.category] : null;
                return (
                  <View key={sh.id} style={s.cell}>
                    {/* 빼기는 ✕ 하나로만. 「기준」 칩과 섞지 않는다 — 그게 사고로 지우던 원인이다. */}
                    <Pressable
                      onPress={() => remove(sh.id)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={`${sh.name} 비교에서 빼기`}
                      testID={`compare-remove-${sh.id}`}
                      style={({pressed}) => [s.rm, pressed && s.pressed]}>
                      <Ionicons name="close" size={ri(ICON.inline)} color={T4} />
                    </Pressable>
                    <Text style={s.brand} numberOfLines={1}>{sh.brand.toUpperCase()}</Text>
                    <Text style={[s.model, isBase && s.modelBase]} numberOfLines={2}>{sh.name}</Text>
                    {!!cat && <Text style={s.cat} numberOfLines={1}>{cat}</Text>}
                    {!!sh.mine && <Text style={s.owned} numberOfLines={1}>내 신발</Text>}
                    {isBase ? (
                      <View style={[s.pill, s.pillBase]} testID={`compare-base-${sh.id}`}>
                        <Text style={[s.pillTxt, s.pillTxtBase]}>기준</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setBaseIdx(i)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`${sh.name} 을 기준으로`}
                        testID={`compare-setbase-${sh.id}`}
                        style={({pressed}) => [s.pill, pressed && s.pressed]}>
                        <Text style={s.pillTxt}>기준으로</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
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
                      <Text style={[s.value, i === baseIdx && s.valueBase]}>
                        {c.value}<Text style={s.unit}>{c.unit}</Text>
                      </Text>
                    ) : (
                      <Text style={[s.textVal, i === baseIdx && s.textValBase]}>{c.value}</Text>
                    )}
                    {/* 차이와 보조표기는 **둘 다** 필요하다. 예전엔 sub 가 있으면 delta 를
                        가려서, 잰 사이즈가 다른 신발은 차이가 아예 안 보였다. */}
                    {c.delta != null && (
                      <Text style={[s.delta, i === baseIdx && s.deltaBase]}>{c.delta}</Text>
                    )}
                    {c.sub != null && (
                      <Text style={[s.delta, i === baseIdx && s.deltaBase]}>{c.sub}</Text>
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
          onPress={() => setPickerOpen(true)}
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

      {/* 등록·온보딩과 같은 2열 피커. 이미 담은 신발은 '내 러닝화'에서 빼 준다. */}
      <ShoePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={add}
        myShoes={myShoes
          .filter(m => !shoes.some(x => sameShoe({brand: x.brand, model: x.name}, m)))
          .map(m => ({
            brand: m.brand,
            model: m.model,
            sub: `${m.brand} · ${Math.round(m.usedKm)} / ${Math.round(m.lifespanKm)} km`,
          }))}
        insetTop={insets.top}
        insetBottom={insets.bottom}
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
  // (헤더 칸의 ✕ 는 absolute 라 값 행 높이에는 영향을 주지 않는다)

  brand: {fontFamily: FONT, ...TYPE.micro, color: T4, marginBottom: rv(3)},
  model: {fontFamily: FONT, ...TYPE.label, fontWeight: '700', color: T2, letterSpacing: -0.2},
  modelBase: {color: T1},
  // 종류(데일리·레이싱…) — 무게 296g 이 무거운 건지는 종류를 알아야 판단된다.
  cat: {fontFamily: FONT, ...TYPE.micro, color: T4, marginTop: rv(3)},
  owned: {fontFamily: FONT, ...TYPE.micro, color: T3, marginTop: rv(2), fontWeight: '700'},
  // 빼기 ✕ — 칸 오른쪽 위. 글자보다 위에 놓아 겹치지 않는다(cell 의 paddingTop 이 자리를 판다).
  rm: {position: 'absolute', top: rv(1), right: rs(1), width: rs(24), height: rs(24),
    alignItems: 'center', justifyContent: 'center'},
  pill: {alignSelf: 'flex-start', marginTop: rv(7), paddingHorizontal: rs(6), paddingVertical: rv(3),
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

  empty: {fontFamily: FONT, ...TYPE.body, color: T3, textAlign: 'center',
    marginTop: rv(40), paddingHorizontal: GUTTER, lineHeight: rf(24)},
});
