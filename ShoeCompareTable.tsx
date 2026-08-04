// ============================================================================
// ShoeCompareTable.tsx — 러닝화 스펙 표 (표시 전용, controlled)
// ----------------------------------------------------------------------------
// 흩어진 스펙을 한 표에 세운다. 지금 이걸 하려면 브랜드마다 공식몰을 열고, 단위도
// 제각각이고(oz/g), 무게 잰 사이즈가 다른 것도 모른 채 비교해야 한다. 그 수고를
// 우리가 미리 해둔 게 카탈로그이고, 이 표가 그 데이터가 값을 하는 자리다.
//
// '추천'이 아니라 '비교'인 이유: 추천은 우리가 순서를 정하니 "커미션 때문에 뜬 건가"
// 하는 의심이 붙는다. 비교는 무엇을 놓을지 사용자가 고르므로 왜곡될 자리가 없다.
//
// ── 왜 화면이 아니라 조각인가(2026-08-02) ───────────────────────────────────
// 전에는 독립 화면이었고, 그 앞에 막대 그래프로 견주는 1:1 화면이 따로 있었다.
// 그런데 그 막대는 정보가 거의 없었다 — 반발·안정은 카테고리에서 파생돼 **같은 종류
// 안에선 항상 동일**하고(후보는 같은 종류에서만 고른다), 쿠션은 힐 스택을 1~5로
// 뭉갠 값이라 이 표의 정확한 mm 보다 약하다. 그래서 막대 화면을 걷어내고 이 표를
// 비교의 유일한 면으로 삼는다. 부상 경고만 표 위 카드로 남는다.
//
// ── 좌우 스와이프(2026-08-02) ────────────────────────────────────────────────
// 5켤레까지 담는다(민우님: "러닝화 추가를 한 5개 정도 해서 좌우로 스와이프 하면 어때?").
// 신발 칸만 가로로 스크롤하고 **라벨 열(무게·드롭…)은 고정**한다 — 라벨이 같이
// 밀려나면 네 번째 칸에서 무슨 행을 보는지 알 수 없다.
//
// 두 열이 따로 그려지므로 행 높이를 맞춰야 하는데, 상수로 박지 않고 **값 열을 재서**
// 라벨 열에 그 높이를 준다(onLayout). 상수는 Dynamic Type 이 켜지는 순간 어긋나고,
// 그 어긋남은 표 전체가 한 칸씩 밀리는 형태로 나타나 알아채기도 어렵다.
//
// 상태는 갖지 않는다 — 무엇을 담고 무엇이 기준인지는 호출부(FindShoesScreen)가 안다.
// 계산은 전부 lib/shoeCompareTable.ts(순수)에 있다. 여기는 그리기만 한다.
// ============================================================================
import React, {useCallback, useMemo, useState} from 'react';
import {View, StyleSheet, Pressable, ScrollView, useWindowDimensions} from 'react-native';
import {Text} from './lib/text';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {rf, ri, rs, rv} from './lib/responsive';
import {CARD_HI, T1, T2, T3, SEP, FONT, NUM, RADIUS, GUTTER,
  withAlpha, TYPE, ICON} from './theme';
import {buildCompareTable, MAX_COMPARE, type CompareShoe} from './lib/shoeCompareTable';
import {SHOE_CATEGORY_KO} from './lib/shoeCatalogLookup';

/** 라벨 열 너비. 가장 긴 라벨('쿠션 두께' + 힌트)이 두 줄 안에 들어가는 폭. */
const LABEL_W = rs(78);
/** 신발 한 칸의 최소 너비. 이보다 좁으면 세 자리 숫자 + 단위가 깨진다. */
const MIN_COL_W = rs(112);
/** 스와이프 없이 한눈에 보이길 바라는 칸 수. 이 이하면 화면을 꽉 채운다. */
const FIT_COLS = 3;

export default function ShoeCompareTable({shoes, baseIdx, onSetBase, onRemove, onAdd}: {
  shoes: readonly CompareShoe[];
  /** 차이를 재는 기준 칸. */
  baseIdx: number;
  onSetBase: (index: number) => void;
  onRemove: (id: string) => void;
  /** ＋ 러닝화 추가 — 피커는 호출부가 연다(표는 화면을 모른다). */
  onAdd: () => void;
}) {
  const {width} = useWindowDimensions();
  const rows = useMemo(() => buildCompareTable(shoes, baseIdx), [shoes, baseIdx]);
  const full = shoes.length >= MAX_COMPARE;

  // 3켤레까지는 화면을 꽉 채우고, 그 이상은 최소 너비로 고정해 스와이프한다.
  const colW = Math.max(
    MIN_COL_W,
    (width - LABEL_W - rs(24)) / Math.min(Math.max(shoes.length, 1), FIT_COLS),
  );

  /** 행 키 → 값 열에서 잰 높이. 라벨 열이 이 값을 그대로 쓴다. */
  const [rowH, setRowH] = useState<Record<string, number>>({});
  const measure = useCallback((key: string) => (e: {nativeEvent: {layout: {height: number}}}) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setRowH(prev => (prev[key] === h ? prev : {...prev, [key]: h}));
  }, []);

  if (shoes.length === 0) {
    return (
      <View testID="shoe-compare-table">
        <Text style={s.empty}>비교할 러닝화를 추가해 보세요.</Text>
        <AddButton full={false} onAdd={onAdd} />
      </View>
    );
  }

  return (
    <View testID="shoe-compare-table">
      <View style={s.table}>
        {/* 라벨 열 — 고정. 높이는 값 열에서 잰 것을 그대로 받는다. */}
        <View style={{width: LABEL_W}}>
          <View style={{height: rowH.__head}} />
          {rows.map(r => (
            <View key={r.key} style={[s.labelCell, s.rowSep, {height: rowH[r.key]}]}>
              <Text style={s.label}>{r.label}</Text>
              {!!r.hint && <Text style={s.hint}>{r.hint}</Text>}
            </View>
          ))}
        </View>

        {/* 신발 칸 — 가로 스크롤. 칸 단위로 멈춘다(반쯤 걸친 칸에선 숫자를 못 읽는다). */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={colW}
          decelerationRate="fast"
          testID="compare-hscroll">
          <View>
            <View style={s.row} onLayout={measure('__head')}>
              {shoes.map((sh, i) => {
                const isBase = i === baseIdx;
                const cat = sh.category ? SHOE_CATEGORY_KO[sh.category] : null;
                return (
                  <View key={sh.id} style={[s.cell, {width: colW}]}>
                    {/* 빼기는 ✕ 하나로만. 「기준」 칩과 섞지 않는다 — 그게 사고로 지우던 원인이다. */}
                    <Pressable
                      onPress={() => onRemove(sh.id)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={`${sh.name} 비교에서 빼기`}
                      testID={`compare-remove-${sh.id}`}
                      style={({pressed}) => [s.rm, pressed && s.pressed]}>
                      <Ionicons name="close" size={ri(ICON.inline)} color={T3} />
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
                        onPress={() => onSetBase(i)}
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

            {rows.map(r => (
              <View key={r.key} style={[s.row, s.rowSep]} onLayout={measure(r.key)}>
                {r.cells.map((c, i) => (
                  <View key={`${r.key}-${i}`} style={[s.cell, {width: colW}]}>
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
        </ScrollView>
      </View>

      <AddButton full={full} onAdd={onAdd} />
    </View>
  );
}

function AddButton({full, onAdd}: {full: boolean; onAdd: () => void}) {
  return (
    <Pressable
      onPress={onAdd}
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
  );
}

const s = StyleSheet.create({
  pressed: {opacity: 0.6},

  // 글씨 크기는 **전부 theme.ts 의 TYPE 토큰**을 쓴다(2026-08-01).
  // 그 전에는 9·9.5·10·11.5·12.5·19.5 처럼 숫자를 직접 박아 놨는데, 그중 셋이 스케일
  // 최소값 micro(11)보다도 작아 실기기에서 읽기 어려웠다("전체적으로 글씨가 너무 작아").
  // 토큰을 쓰면 다른 화면과 위계가 자동으로 맞고, 접근성 스케일도 함께 따라간다.

  table: {flexDirection: 'row', paddingHorizontal: rs(12)},
  row: {flexDirection: 'row', alignItems: 'flex-start'},
  rowSep: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  labelCell: {paddingHorizontal: rs(8), paddingTop: rv(15)},
  label: {fontFamily: FONT, ...TYPE.caption, color: T3},
  hint: {fontFamily: FONT, ...TYPE.micro, color: T3, marginTop: rv(2), letterSpacing: 0.2},
  cell: {paddingHorizontal: rs(8), paddingTop: rv(13), paddingBottom: rv(14)},

  brand: {fontFamily: FONT, ...TYPE.micro, color: T3, marginBottom: rv(3)},
  model: {fontFamily: FONT, ...TYPE.label, fontWeight: '700', color: T2, letterSpacing: -0.2},
  modelBase: {color: T1},
  // 종류(데일리·레이싱…) — 무게 296g 이 무거운 건지는 종류를 알아야 판단된다.
  cat: {fontFamily: FONT, ...TYPE.micro, color: T3, marginTop: rv(3)},
  owned: {fontFamily: FONT, ...TYPE.micro, color: T3, marginTop: rv(2), fontWeight: '700'},
  // 빼기 ✕ — 칸 오른쪽 위. 글자보다 위에 놓아 겹치지 않는다(cell 의 paddingTop 이 자리를 판다).
  rm: {position: 'absolute', top: rv(1), right: rs(1), width: rs(24), height: rs(24),
    alignItems: 'center', justifyContent: 'center', zIndex: 1},
  pill: {alignSelf: 'flex-start', marginTop: rv(7), paddingHorizontal: rs(6), paddingVertical: rv(3),
    borderRadius: RADIUS.sm / 2, backgroundColor: CARD_HI},
  pillBase: {backgroundColor: withAlpha(T1, 0.13)},
  pillTxt: {fontFamily: FONT, ...TYPE.micro, color: T3},
  pillTxtBase: {color: T1},

  // 표에서 제일 먼저 읽어야 하는 건 숫자다. 예전 19.5 는 모델명(12.5)과 두 배도 차이가
  // 안 나 위계가 약했다 — title(23)로 올려 한눈에 숫자가 먼저 들어오게 한다.
  value: {fontFamily: NUM, ...TYPE.title, color: T3, letterSpacing: -0.3},
  valueBase: {color: T1, fontWeight: '500'},
  unit: {fontFamily: FONT, ...TYPE.caption, color: T3},
  textVal: {fontFamily: FONT, ...TYPE.body, color: T2, letterSpacing: -0.2},
  textValBase: {color: T1, fontWeight: '600'},
  dash: {fontFamily: FONT, ...TYPE.body, color: T3},
  delta: {fontFamily: NUM, ...TYPE.label, color: T2, marginTop: rv(5)},
  deltaBase: {color: T3, fontWeight: '400'},

  cta: {marginHorizontal: GUTTER, marginTop: rv(18), paddingVertical: rv(15),
    borderRadius: RADIUS.btn, backgroundColor: CARD_HI, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  ctaOff: {backgroundColor: 'transparent'},
  ctaTxt: {fontFamily: FONT, ...TYPE.body, fontWeight: '600', color: T1},
  ctaTxtOff: {color: T3, fontWeight: '400'},

  empty: {fontFamily: FONT, ...TYPE.body, color: T3, textAlign: 'center',
    marginTop: rv(40), paddingHorizontal: GUTTER, lineHeight: rf(24)},
});
