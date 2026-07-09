// ============================================================================
// ShoePicker.tsx — 공용 러닝화 선택 모달(2열 분할 피커, 2026-07-07)
//
// 온보딩 등록과 메인 신발 등록(AddShoeScreen)이 같은 등록 UX 를 쓰도록 단일 소스로
// 추출한다(사용자 지시: "2열 분할 피커가 메인으로 통일"). 구성:
//   · 상단 검색 — 브랜드·모델 동시 매칭 지름길("p" → Pegasus 즉시)
//   · 좌 브랜드 레일 — 세로 스크롤, 알파벳순(임의 인기순 없음 — 정직 원칙)
//   · 우 모델 목록 — 그 브랜드 모델 알파벳순 + 카테고리·권장 km
//   · 직접 입력 폴백 — 목록에 없으면 커스텀 추가('기타' 브랜드는 브랜드명부터)
// onPick 은 {brand, model} 만 넘긴다. 권장 수명(km)은 호출부가 카탈로그에서 파생한다.
// ============================================================================
import React, {useMemo, useState} from 'react';
import { rf, rs, rv } from './lib/responsive';
import {View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';
import {BRANDS, SHOE_MODELS, findShoeModel, getRecommendedLifespanKm} from './data/shoeModels';
import {categoryLabelKo} from './lib/affiliate';
import {BG, CARD, T1, T3, T4, SEP, FONT, withAlpha} from './theme';
import {Button} from './primitives';

export type PickedShoe = {brand: string; model: string};

function SearchIcon({size = 15, color = T3}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <Path d="M21 21l-4.3-4.3" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

const OTHER = '기타';
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

export function ShoePicker({visible, onClose, onPick, insetTop, insetBottom}: {
  visible: boolean;
  onClose: () => void;
  onPick: (p: PickedShoe) => void;
  insetTop: number;
  insetBottom: number;
}) {
  const [query, setQuery] = useState('');
  const [selBrand, setSelBrand] = useState<string>(BRANDS[0]);
  const [customModel, setCustomModel] = useState('');
  const [customBrand, setCustomBrand] = useState('');

  // 모달을 닫을 때 검색/입력 상태를 리셋해 다음 진입이 항상 깨끗하게 시작한다.
  const close = () => {
    setQuery('');
    setCustomModel('');
    setCustomBrand('');
    onClose();
  };
  const pick = (brand: string, model: string) => {
    onPick({brand, model});
    close();
  };

  const q = norm(query);
  const isOther = selBrand === OTHER;

  // 검색은 '선택된 브랜드 안에서만'(사용자 요청 2026-07-07: 브랜드를 레일에서 고르면 그
  // 브랜드에서만 검색). 브랜드명이 이미 레일로 드러나므로 결과 행엔 모델명만 — "Hoka Bondi"
  // 처럼 붙어 헷갈리지 않는다. 모델 접두 일치 우선("b"→Bondi), 그다음 알파벳순.
  const brandModels = useMemo(() => {
    const all = SHOE_MODELS.filter(m => norm(m.brand) === norm(selBrand));
    const filtered = q ? all.filter(m => norm(m.model).includes(q)) : all;
    return filtered.sort((a, b) => {
      const ra = q && norm(a.model).startsWith(q) ? 0 : 1;
      const rb = q && norm(b.model).startsWith(q) ? 0 : 1;
      return ra - rb || a.model.localeCompare(b.model);
    });
  }, [selBrand, q]);

  // 검색어와 정확히 일치하는 모델이 없으면 '직접 추가'(그 브랜드에 커스텀 모델).
  const exactExists = brandModels.some(m => norm(m.model) === q);

  const subFor = (brand: string, model: string) => {
    const m = findShoeModel(brand, model);
    if (!m) return `권장 ${getRecommendedLifespanKm({brand, model})} km`;
    return `${categoryLabelKo[m.category]} · 권장 ${m.recommendedKm} km`;
  };
  const modelRow = (brand: string, model: string, sub: string) => (
    <Pressable
      key={`${brand}-${model}`}
      onPress={() => pick(brand, model)}
      accessibilityRole="button"
      accessibilityLabel={`${brand} ${model}, ${sub}`}
      style={({pressed}) => [s.pkRow, pressed && {opacity: 0.7}]}>
      <Text numberOfLines={1} style={s.pkRowName}>{model}</Text>
      <Text style={s.pkRowSub}>{sub}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <View style={[s.screen, {paddingTop: insetTop + 10}]}>
        <View style={s.pkTopBar}>
          <Text style={s.pkTitle}>러닝화 선택</Text>
          <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
            <Text style={s.pkCancel}>취소</Text>
          </Pressable>
        </View>

        {/* 항상 2열: 브랜드 레일 + (그 브랜드) 검색·모델. 브랜드는 왼쪽에서 고르고 검색은 그 안에서. */}
        <View style={s.pkSplit}>
          <ScrollView style={s.pkRail} showsVerticalScrollIndicator={false}>
            {[...BRANDS, OTHER].map(b => {
              const on = b === selBrand;
              return (
                <Pressable
                  key={b}
                  onPress={() => { setSelBrand(b); setQuery(''); }}
                  accessibilityRole="tab"
                  accessibilityState={{selected: on}}
                  accessibilityLabel={`브랜드 ${b}`}
                  style={({pressed}) => [s.pkRailItem, on && s.pkRailItemOn, pressed && !on && {opacity: 0.7}]}>
                  {on && <View style={s.pkRailBar} />}
                  <Text style={[s.pkRailText, on && s.pkRailTextOn]} numberOfLines={1}>{b}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {!isOther ? (
            <View style={s.pkRight}>
              {/* 선택 브랜드 안에서만 검색 */}
              <View style={s.pkSearchScoped}>
                <SearchIcon />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`${selBrand} 검색`}
                  placeholderTextColor={T4}
                  style={s.pkInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel={`${selBrand} 모델 검색`}
                  testID="picker-search"
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="검색 지우기">
                    <Text style={s.pkClear}>✕</Text>
                  </Pressable>
                )}
              </View>
              <ScrollView style={s.flex1} contentContainerStyle={{paddingHorizontal: rs(18), paddingBottom: Math.max(insetBottom, 16)}} keyboardShouldPersistTaps="handled">
                {brandModels.map(m => modelRow(m.brand, m.model, subFor(m.brand, m.model)))}
                {brandModels.length === 0 && (
                  <Text style={{fontFamily: FONT, fontSize: rf(14), color: T3, marginTop: rv(6), lineHeight: rf(19)}}>
                    “{query.trim()}” 검색 결과가 없어요.
                  </Text>
                )}
                {q.length > 0 && !exactExists && (
                  <Pressable
                    onPress={() => pick(selBrand, query.trim())}
                    accessibilityRole="button"
                    accessibilityLabel={`${query.trim()} 직접 추가`}
                    style={({pressed}) => [s.pkAddRow, pressed && {opacity: 0.7}]}>
                    <Text style={{fontFamily: FONT, fontSize: rf(15), color: T3}}>
                      “<Text style={{color: T1, fontWeight: '600'}}>{query.trim()}</Text>” 직접 추가
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>
          ) : (
            // 기타 — 브랜드명 + 모델명 직접 입력
            <ScrollView style={s.flex1} contentContainerStyle={{paddingHorizontal: rs(18), paddingTop: rv(12), paddingBottom: Math.max(insetBottom, 16)}} keyboardShouldPersistTaps="handled">
              <TextInput
                value={customBrand}
                onChangeText={setCustomBrand}
                placeholder="브랜드명을 입력하세요"
                placeholderTextColor={T4}
                style={s.pkFormInput}
                autoCorrect={false}
                accessibilityLabel="브랜드명 입력"
              />
              <TextInput
                value={customModel}
                onChangeText={setCustomModel}
                placeholder="모델명을 입력하세요"
                placeholderTextColor={T4}
                style={[s.pkFormInput, {marginTop: rv(8)}]}
                autoCorrect={false}
                accessibilityLabel="모델명 입력"
              />
              <View style={{marginTop: rv(12)}}>
                <Button
                  label="추가"
                  disabled={!customModel.trim() || !customBrand.trim()}
                  onPress={() => pick(customBrand.trim(), customModel.trim())}
                />
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  flex1: {flex: 1},
  pkTopBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rs(24), paddingBottom: rv(12)},
  pkTitle: {fontFamily: FONT, fontSize: rf(17), fontWeight: '600', color: T1, letterSpacing: -0.2},
  pkInput: {flex: 1, fontFamily: FONT, fontSize: rf(16), fontWeight: '500', color: T1, paddingVertical: rv(0)},
  pkClear: {color: T3, fontSize: rf(16), fontWeight: '600'},
  pkCancel: {fontFamily: FONT, fontSize: rf(16), fontWeight: '500', color: T1},
  pkSplit: {flex: 1, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  pkRight: {flex: 1},
  pkSearchScoped: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(8),
    height: rs(42),
    marginHorizontal: rs(14),
    marginTop: rv(8),
    marginBottom: rv(2),
    paddingHorizontal: rs(12),
    borderRadius: rs(12), borderCurve: 'continuous',
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(T1, 0.1),
  },
  pkRail: {width: rs(126), flexGrow: 0, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: SEP, paddingVertical: rv(6)},
  pkRailItem: {paddingVertical: rv(12), paddingHorizontal: rs(16), justifyContent: 'center'},
  pkRailItemOn: {backgroundColor: 'rgba(255,255,255,0.05)'},
  pkRailBar: {position: 'absolute', left: 0, top: 12, bottom: 12, width: rs(3), borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: T1},
  pkRailText: {fontFamily: FONT, fontSize: rf(14), fontWeight: '500', color: T3, letterSpacing: -0.2},
  pkRailTextOn: {color: T1, fontWeight: '600'},
  pkRow: {paddingVertical: rv(12), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: withAlpha(T1, 0.06)},
  pkRowName: {fontFamily: FONT, fontSize: rf(15), fontWeight: '600', color: T1, letterSpacing: -0.2},
  pkRowSub: {fontFamily: FONT, fontSize: rf(12), fontWeight: '500', color: T3, marginTop: rv(2)},
  pkAddRow: {
    marginTop: rv(12),
    paddingVertical: rv(12),
    paddingHorizontal: rs(14),
    borderRadius: rs(14), borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: withAlpha(T1, 0.16),
    alignItems: 'center',
  },
  pkFormInput: {
    height: rs(48),
    paddingHorizontal: rs(14),
    borderRadius: rs(14), borderCurve: 'continuous',
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(T1, 0.12),
    fontFamily: FONT,
    fontSize: rf(16),
    color: T1,
  },
});

export default ShoePicker;
