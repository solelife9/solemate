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
  const [customMode, setCustomMode] = useState(false);

  // 모달을 닫을 때 검색/입력 상태를 리셋해 다음 진입이 항상 깨끗하게 시작한다.
  const close = () => {
    setQuery('');
    setCustomMode(false);
    setCustomModel('');
    setCustomBrand('');
    onClose();
  };
  const pick = (brand: string, model: string) => {
    onPick({brand, model});
    close();
  };

  const q = norm(query);
  // 검색: 브랜드+모델 동시 매칭. 정렬은 '접두 일치 우선' — "nova" 치면 Novablast(모델
  // 접두)가 브랜드 알파벳순보다 먼저 뜬다(사용자 피드백 2026-07-07). 랭크: 모델 접두(0) →
  // 브랜드/브랜드+모델 접두(1) → 부분일치(2), 동랭크는 브랜드→모델 알파벳순.
  const searchResults = useMemo(() => {
    if (!q) return [];
    const rank = (m: {brand: string; model: string}) => {
      if (norm(m.model).startsWith(q)) return 0;
      if (norm(m.brand).startsWith(q) || norm(`${m.brand} ${m.model}`).startsWith(q)) return 1;
      return 2;
    };
    return SHOE_MODELS
      .filter(m => norm(`${m.brand} ${m.model}`).includes(q) || norm(m.model).includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
  }, [q]);

  // 레일 브랜드의 모델(알파벳순) — 시드 순서가 아닌 정렬 고정.
  const brandModels = useMemo(
    () =>
      SHOE_MODELS.filter(m => norm(m.brand) === norm(selBrand)).sort((a, b) =>
        a.model.localeCompare(b.model),
      ),
    [selBrand],
  );

  const isOther = selBrand === OTHER;
  const showCustomForm = customMode || isOther;

  const subFor = (brand: string, model: string) => {
    const m = findShoeModel(brand, model);
    if (!m) return `권장 ${getRecommendedLifespanKm({brand, model})} km`;
    return `${categoryLabelKo[m.category]} · 권장 ${m.recommendedKm} km`;
  };
  const modelRow = (brand: string, model: string, sub: string, key: string, showBrand: boolean) => (
    <Pressable
      key={key}
      onPress={() => pick(brand, model)}
      accessibilityRole="button"
      accessibilityLabel={`${brand} ${model}, ${sub}`}
      style={({pressed}) => [s.pkRow, pressed && {opacity: 0.7}]}>
      <Text numberOfLines={1} style={s.pkRowName}>{showBrand ? `${brand} ${model}` : model}</Text>
      <Text style={s.pkRowSub}>{sub}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <View style={[s.screen, {paddingTop: insetTop + 10}]}>
        {/* 검색 + 취소 */}
        <View style={s.pkHeader}>
          <View style={s.pkSearch}>
            <SearchIcon />
            <TextInput
              value={query}
              onChangeText={t => {
                setQuery(t);
                setCustomMode(false);
              }}
              placeholder="브랜드·모델 검색"
              placeholderTextColor={T4}
              style={s.pkInput}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="브랜드 또는 모델 검색"
              testID="picker-search"
            />
          </View>
          <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
            <Text style={s.pkCancel}>취소</Text>
          </Pressable>
        </View>

        {q ? (
          // ── 검색 결과(브랜드 무관 플랫 목록) ──
          <ScrollView style={s.flex1} contentContainerStyle={{paddingHorizontal: 24, paddingBottom: Math.max(insetBottom, 16)}} keyboardShouldPersistTaps="handled">
            <Text style={s.pkSection}>검색 결과</Text>
            {searchResults.map(m => modelRow(m.brand, m.model, subFor(m.brand, m.model), `${m.brand}-${m.model}`, true))}
            {searchResults.length === 0 && (
              <Text style={{fontFamily: FONT, fontSize: 13, color: T3, marginTop: 4, lineHeight: 19}}>
                검색 결과가 없어요 — 아래에서 직접 추가할 수 있어요.
              </Text>
            )}
            <Pressable
              onPress={() => pick('', query.trim())}
              accessibilityRole="button"
              accessibilityLabel={`${query.trim()} 직접 추가`}
              style={({pressed}) => [s.pkAddRow, pressed && {opacity: 0.7}]}>
              <Text style={{fontFamily: FONT, fontSize: 14, color: T3}}>
                “<Text style={{color: T1, fontWeight: '600'}}>{query.trim()}</Text>” 직접 추가
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          // ── 2열 분할: 브랜드 레일 + 모델 ──
          <View style={s.pkSplit}>
            <ScrollView style={s.pkRail} showsVerticalScrollIndicator={false}>
              {[...BRANDS, OTHER].map(b => {
                const on = b === selBrand;
                return (
                  <Pressable
                    key={b}
                    onPress={() => {
                      setSelBrand(b);
                      setCustomMode(false);
                    }}
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
            <ScrollView style={s.flex1} contentContainerStyle={{paddingHorizontal: 18, paddingBottom: Math.max(insetBottom, 16)}} keyboardShouldPersistTaps="handled">
              {!showCustomForm ? (
                <>
                  {brandModels.map(m => modelRow(m.brand, m.model, subFor(m.brand, m.model), m.model, false))}
                  <Pressable
                    onPress={() => setCustomMode(true)}
                    accessibilityRole="button"
                    accessibilityLabel="목록에 없는 모델 직접 입력해 추가"
                    style={({pressed}) => [s.pkAddRow, pressed && {opacity: 0.7}]}>
                    <Text style={{fontFamily: FONT, fontSize: 14, color: T3}}>+ 직접 입력해 추가</Text>
                  </Pressable>
                </>
              ) : (
                // 직접 입력 — 레일이 '기타'면 브랜드명부터, 아니면 선택된 브랜드에 모델만.
                <View style={{paddingTop: 6}}>
                  {isOther && (
                    <TextInput
                      value={customBrand}
                      onChangeText={setCustomBrand}
                      placeholder="브랜드명을 입력하세요"
                      placeholderTextColor={T4}
                      style={s.pkFormInput}
                      autoCorrect={false}
                      accessibilityLabel="브랜드명 입력"
                    />
                  )}
                  <TextInput
                    value={customModel}
                    onChangeText={setCustomModel}
                    placeholder="모델명을 입력하세요"
                    placeholderTextColor={T4}
                    style={[s.pkFormInput, isOther && {marginTop: 8}]}
                    autoCorrect={false}
                    accessibilityLabel="모델명 입력"
                  />
                  <View style={{marginTop: 12}}>
                    <Button
                      label="추가"
                      disabled={!customModel.trim() || (isOther && !customBrand.trim())}
                      onPress={() => pick(isOther ? customBrand.trim() : selBrand, customModel.trim())}
                    />
                  </View>
                  {!isOther && (
                    <Pressable onPress={() => setCustomMode(false)} hitSlop={8} style={{alignItems: 'center', marginTop: 14}} accessibilityRole="button" accessibilityLabel="모델 목록으로 돌아가기">
                      <Text style={{fontFamily: FONT, fontSize: 13, color: T3}}>목록으로 돌아가기</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  flex1: {flex: 1},
  pkHeader: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingBottom: 14},
  pkSearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14, borderCurve: 'continuous',
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(T1, 0.12),
  },
  pkInput: {flex: 1, fontFamily: FONT, fontSize: 15, fontWeight: '500', color: T1, paddingVertical: 0},
  pkCancel: {fontFamily: FONT, fontSize: 15, fontWeight: '500', color: T1},
  pkSection: {fontFamily: FONT, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: T3, textTransform: 'uppercase', marginBottom: 4},
  pkSplit: {flex: 1, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  pkRail: {width: 126, flexGrow: 0, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: SEP, paddingVertical: 6},
  pkRailItem: {paddingVertical: 13, paddingHorizontal: 16, justifyContent: 'center'},
  pkRailItemOn: {backgroundColor: 'rgba(255,255,255,0.05)'},
  pkRailBar: {position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: T1},
  pkRailText: {fontFamily: FONT, fontSize: 13, fontWeight: '500', color: T3, letterSpacing: -0.2},
  pkRailTextOn: {color: T1, fontWeight: '600'},
  pkRow: {paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: withAlpha(T1, 0.06)},
  pkRowName: {fontFamily: FONT, fontSize: 14, fontWeight: '600', color: T1, letterSpacing: -0.2},
  pkRowSub: {fontFamily: FONT, fontSize: 11, fontWeight: '500', color: T3, marginTop: 2},
  pkAddRow: {
    marginTop: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14, borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: withAlpha(T1, 0.16),
    alignItems: 'center',
  },
  pkFormInput: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14, borderCurve: 'continuous',
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(T1, 0.12),
    fontFamily: FONT,
    fontSize: 15,
    color: T1,
  },
});

export default ShoePicker;
