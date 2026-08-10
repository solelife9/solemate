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
import React, {useEffect, useMemo, useRef, useState} from 'react';
import { rf, rs, rv } from './lib/responsive';
import {View, StyleSheet, Pressable, ScrollView, Modal} from 'react-native';
import {Text, TextInput} from './lib/text';
import Svg, {Circle, Path} from 'react-native-svg';
import {findShoeModel, getRecommendedLifespanKm} from './data/shoeModels';
// 번들 + 원격 카탈로그. 원격이 늦게 도착해도 이 훅이 알아서 다시 그린다(lib/shoeCatalogStore).
import {useShoeModels, useShoeBrands} from './lib/shoeCatalogStore';
import {matchesTokens} from './lib/shoeSearch';
import {categoryLabelKo} from './lib/affiliate';
import {BG, CARD, T1, T3, SEP, FONT, withAlpha, GUTTER, MOTION} from './theme';
import {Button, Input, Tap} from './primitives';
// 검색 0건 신호 — 카탈로그가 낡는 문제에 대한 구조적 답이다(docs/shoes-spec.md §6).
// 사람이 눈치채기를 기다리지 않고, "사용자가 찾았는데 없던 것"을 데이터로 남긴다.
import {logSearchMiss, requestShoe} from './services/shoes';
import {showToast} from './lib/toast';

export type PickedShoe = {brand: string; model: string};

/**
 * 피커 맨 위에 얹는 '내 러닝화' 한 줄. **선택 기능**이다(등록·온보딩은 넘기지 않는다 —
 * 거기선 이미 가진 신발을 다시 등록할 일이 없다). 비교 화면처럼 내 신발을 자주
 * 집어넣는 자리에서만 켠다.
 */
export type PickerMyShoe = {brand: string; model: string; sub?: string};

function SearchIcon({size = 15, color = T3}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <Path d="M21 21l-4.3-4.3" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

const OTHER = '기타';
// 사용자 입력 상한(2026-08-04 QA 감사 Q-9). 예전엔 제한이 없어 임의 길이의 문자열이
// 그대로 신발 이름이 됐고, 홈 히어로의 브랜드 줄은 줄바꿈 제한이 없어 카드가 밀렸다.
// 60/30 은 서버 규칙(shoe_requests 의 brand·model ≤ 60자)과 정렬한 값이다 — 넘기면
// 카탈로그 개선 신호가 조용히 거부돼, 등록은 되는데 신호만 사라지는 비대칭이 생긴다.
const MODEL_MAX = 60;
const BRAND_MAX = 30;
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

export function ShoePicker({visible, onClose, onPick, myShoes, insetTop, insetBottom}: {
  visible: boolean;
  onClose: () => void;
  onPick: (p: PickedShoe) => void;
  /** 있으면 맨 위에 '내 러닝화' 섹션이 뜬다. 없으면 지금까지와 똑같이 동작한다. */
  myShoes?: readonly PickerMyShoe[];
  insetTop: number;
  insetBottom: number;
}) {
  const SHOE_MODELS = useShoeModels();
  const BRANDS = useShoeBrands();
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

  /**
   * 카탈로그에 없어 **손으로 넣은** 경우. 등록은 그대로 진행하고, 무엇이 빠졌는지만
   * 신호로 남긴다(source: 'manual_add').
   *
   * '내 신발이 없어요' 버튼과 달리 토스트도 대기도 없다 — 사용자의 행동은 '등록'이지
   * '요청'이 아니다. 관측 때문에 등록이 한 박자라도 늦으면 본말전도다. 그래서 결과를
   * 기다리지 않고 실패는 삼킨다.
   */
  const pickManual = (brand: string, model: string) => {
    // 계정은 넘기지 않는다 — 신호의 목적은 '무엇이 없었나'이지 '누가 찾았나'가 아니다
    // (services/shoes 주석 참조). 결과를 기다리지 않고 실패는 삼킨다.
    requestShoe(brand, model, 'manual_add').catch(() => {});
    pick(brand, model);
  };

  const q = norm(query);
  const isOther = selBrand === OTHER;

  // 검색은 '선택된 브랜드 안에서만'(사용자 요청 2026-07-07: 브랜드를 레일에서 고르면 그
  // 브랜드에서만 검색). 브랜드명이 이미 레일로 드러나므로 결과 행엔 모델명만 — "Hoka Bondi"
  // 처럼 붙어 헷갈리지 않는다. 모델 접두 일치 우선("b"→Bondi), 그다음 알파벳순.
  const brandModels = useMemo(() => {
    const all = SHOE_MODELS.filter(m => norm(m.brand) === norm(selBrand));
    // 모델명(영문) **과 한글 별칭**을 함께 훑는다. 앱 UI 는 한국어인데 카탈로그
    // 모델명은 전부 영문이라, 별칭 없이는 "보스턴"·"에보"로 치는 사용자가 있는
    // 신발을 못 찾고 아래 '검색 0건' 신호까지 남는다(2026-08-10).
    // 매칭 규칙은 lib/shoeSearch 하나가 소유한다 — 여기서 다시 적으면 또 갈라진다.
    const filtered = q ? all.filter(m => matchesTokens([m.model, ...(m.aliases ?? [])], q)) : all;
    return filtered.sort((a, b) => {
      const ra = q && norm(a.model).startsWith(q) ? 0 : 1;
      const rb = q && norm(b.model).startsWith(q) ? 0 : 1;
      return ra - rb || a.model.localeCompare(b.model);
    });
  }, [SHOE_MODELS, selBrand, q]);

  // 검색어와 정확히 일치하는 모델이 없으면 '직접 추가'(그 브랜드에 커스텀 모델).
  const exactExists = brandModels.some(m => norm(m.model) === q);

  // ── 검색 0건 ────────────────────────────────────────────────────────────────
  // 결과가 없으면 그 질의를 남긴다. 같은 질의를 타이핑 중에 여러 번 적재하지 않게
  // 마지막으로 남긴 질의를 기억하고, 조용히 실패한다(관측이지 기능이 아니다).
  const noResult = q.length > 0 && brandModels.length === 0;
  const loggedRef = useRef<string>('');
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!noResult) return;
    const key = `${selBrand}|${q}`;
    if (loggedRef.current === key) return;
    loggedRef.current = key;
    setRequested(false);
    const t = setTimeout(() => {
      // 타이핑이 멎은 뒤에 남긴다 — 중간 글자마다 적재하면 잡음이 된다.
      logSearchMiss(`${selBrand} ${query.trim()}`.trim()).catch(() => {});
    }, 900);
    return () => clearTimeout(t);
  }, [noResult, selBrand, q, query]);

  /** '내 신발이 없어요' — 사용자가 누른 행동이라 결과를 반드시 알려준다. */
  const askForShoe = async () => {
    const model = query.trim();
    const ok = await requestShoe(selBrand, model, 'not_found');
    setRequested(ok);
    showToast({
      message: ok
        ? '알려주셔서 고마워요. 확인하고 넣어둘게요.'
        : '지금은 전송이 안 돼요. 잠시 후 다시 시도해 주세요.',
    });
  };

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
      style={({pressed}) => [s.pkRow, pressed && s.pressed]}>
      <Text numberOfLines={1} style={s.pkRowName}>{model}</Text>
      <Text style={s.pkRowSub}>{sub}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <View style={[s.screen, {paddingTop: insetTop + 10}]}>
        <View style={s.pkTopBar}>
          <Text style={s.pkTitle}>러닝화 선택</Text>
          <Pressable
            onPress={close}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            style={({pressed}) => pressed && s.pressed}>
            <Text style={s.pkCancel}>취소</Text>
          </Pressable>
        </View>

        {/* 내 러닝화 — 카탈로그에서 다시 찾게 하지 않는다. 목록이 길면 스크롤한다
            (잘라내면 없는 신발처럼 보이므로 감추지 않는다). */}
        {!!myShoes?.length && (
          <View style={s.pkMine} testID="picker-my-shoes">
            <Text style={s.pkMineHead}>내 러닝화</Text>
            <ScrollView style={s.pkMineList} keyboardShouldPersistTaps="handled">
              {myShoes.map(m => (
                <Pressable
                  key={`${m.brand}|${m.model}`}
                  onPress={() => pick(m.brand, m.model)}
                  accessibilityRole="button"
                  accessibilityLabel={`내 러닝화 ${m.brand} ${m.model}`}
                  style={({pressed}) => [s.pkRow, pressed && s.pressed]}>
                  <Text numberOfLines={1} style={s.pkRowName}>{m.model}</Text>
                  {!!m.sub && <Text style={s.pkRowSub}>{m.sub}</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

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
                  style={({pressed}) => [s.pkRailItem, on && s.pkRailItemOn, pressed && !on && s.pressed]}>
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
                  placeholderTextColor={T3}
                  style={s.pkInput}
                  // 모델명 상한(QA 감사 Q-9). 이 값이 그대로 '직접 추가'의 모델명이 되고
                  // 신발 이름·카탈로그 요청 신호로 흘러간다 — 서버 규칙도 60자가 상한이라
                  // 넘기면 요청이 조용히 거부된다(등록은 되고 신호만 사라지는 비대칭).
                  maxLength={MODEL_MAX}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel={`${selBrand} 모델 검색`}
                  testID="picker-search"
                />
                {query.length > 0 && (
                  // hitSlop 12 — 글리프 한 자짜리 타깃을 실효 44pt 로 확보.
                  <Tap onPress={() => setQuery('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="검색 지우기">
                    <Text style={s.pkClear}>✕</Text>
                  </Tap>
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
                    onPress={() => pickManual(selBrand, query.trim())}
                    accessibilityRole="button"
                    accessibilityLabel={`${query.trim()} 직접 추가`}
                    testID="picker-add-custom"
                    style={({pressed}) => [s.pkAddRow, pressed && s.pressed]}>
                    <Text style={{fontFamily: FONT, fontSize: rf(15), color: T3}}>
                      “<Text style={{color: T1, fontWeight: '600'}}>{query.trim()}</Text>” 직접 추가
                    </Text>
                  </Pressable>
                )}

                {/* 결과 0건 — 직접 추가 옆에 '없어요'를 둔다. 직접 추가는 지금 등록하는
                    길이고, 이 버튼은 카탈로그를 고쳐달라는 신호다(둘은 다른 행동이다). */}
                {noResult && (
                  <View style={s.pkMissWrap} testID="picker-no-result">
                    <Text style={s.pkMissTxt}>
                      찾으시는 러닝화가 목록에 없네요. 위에서 직접 추가하시면 바로 쓸 수 있어요.
                    </Text>
                    <Pressable
                      onPress={askForShoe}
                      disabled={requested}
                      accessibilityRole="button"
                      accessibilityLabel="내 신발이 없어요, 등록 요청하기"
                      accessibilityState={{disabled: requested}}
                      testID="picker-request-shoe"
                      style={({pressed}) => [s.pkMissBtn, pressed && s.pressed]}>
                      <Text style={s.pkMissBtnTxt}>
                        {requested ? '요청을 받았어요' : '내 신발이 없어요'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            </View>
          ) : (
            // 기타 — 브랜드명 + 모델명 직접 입력
            <ScrollView style={s.flex1} contentContainerStyle={{paddingHorizontal: rs(18), paddingTop: rv(12), paddingBottom: Math.max(insetBottom, 16)}} keyboardShouldPersistTaps="handled">
              <Input
                value={customBrand}
                onChangeText={setCustomBrand}
                placeholder="브랜드명을 입력하세요"
                maxLength={BRAND_MAX}
                autoCorrect={false}
                accessibilityLabel="브랜드명 입력"
              />
              <Input
                value={customModel}
                onChangeText={setCustomModel}
                placeholder="모델명을 입력하세요"
                style={{marginTop: rv(8)}}
                maxLength={MODEL_MAX}
                autoCorrect={false}
                accessibilityLabel="모델명 입력"
              />
              <View style={{marginTop: rv(12)}}>
                <Button
                  label="추가"
                  disabled={!customModel.trim() || !customBrand.trim()}
                  testID="picker-add-other"
                  onPress={() => pickManual(customBrand.trim(), customModel.trim())}
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
  // 누름 표준(MOTION.press) — 사설 opacity 0.7 폐지.
  pressed: {opacity: MOTION.press.opacity, transform: [{scale: MOTION.press.scale}]},
  pkTopBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingBottom: rv(12)},
  pkTitle: {fontFamily: FONT, fontSize: rf(17), fontWeight: '600', color: T1, letterSpacing: -0.2},
  pkInput: {flex: 1, fontFamily: FONT, fontSize: rf(16), fontWeight: '500', color: T1, paddingVertical: rv(0)},
  pkClear: {color: T3, fontSize: rf(16), fontWeight: '600'},
  pkCancel: {fontFamily: FONT, fontSize: rf(16), fontWeight: '500', color: T1},
  // 내 러닝화 섹션 — 세로를 너무 먹으면 아래 2열 피커가 눌리므로 상한을 둔다.
  pkMine: {paddingHorizontal: rs(18), paddingBottom: rv(6)},
  pkMineHead: {fontFamily: FONT, fontSize: rf(11), fontWeight: '700', color: T3,
    letterSpacing: 1.1, marginBottom: rv(4)},
  pkMineList: {maxHeight: rv(148)},
  pkSplit: {flex: 1, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  pkRight: {flex: 1},
  pkSearchScoped: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(8),
    minHeight: rs(42),
    marginHorizontal: rs(14),
    marginTop: rv(8),
    marginBottom: rv(2),
    paddingHorizontal: rs(12),
    borderRadius: rs(12), borderCurve: 'continuous',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: withAlpha(T1, 0.1),
  },
  pkRail: {width: rs(126), flexGrow: 0, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: SEP, paddingVertical: rv(6)},
  pkRailItem: {paddingVertical: rv(12), paddingHorizontal: rs(16), justifyContent: 'center'},
  pkRailItemOn: {backgroundColor: withAlpha(T1, 0.05)},
  pkRailBar: {position: 'absolute', left: 0, top: 12, bottom: 12, width: rs(3), borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: T1},
  pkRailText: {fontFamily: FONT, fontSize: rf(14), fontWeight: '500', color: T3, letterSpacing: -0.2},
  pkRailTextOn: {color: T1, fontWeight: '600'},
  pkRow: {paddingVertical: rv(12), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: withAlpha(T1, 0.06)},
  pkRowName: {fontFamily: FONT, fontSize: rf(15), fontWeight: '600', color: T1, letterSpacing: -0.2},
  pkRowSub: {fontFamily: FONT, fontSize: rf(12), fontWeight: '500', color: T3, marginTop: rv(2)},
  // 0건 안내 — 강조가 아니라 안심이라 무채. '내 신발이 없어요'는 카탈로그 개선 신호를
  // 보내는 버튼이라 직접 추가와 시각적으로 구분한다(둘은 다른 행동이다).
  pkMissWrap: {paddingHorizontal: rs(4), paddingTop: rv(14), gap: rv(10)},
  pkMissTxt: {color: T3, fontFamily: FONT, fontSize: rf(13), lineHeight: rf(19)},
  pkMissBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: rs(14),
    paddingVertical: rv(10),
    borderRadius: rs(999),
    backgroundColor: withAlpha(T1, 0.08),
  },
  pkMissBtnTxt: {color: T1, fontFamily: FONT, fontSize: rf(13), fontWeight: '600'},
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
});

export default ShoePicker;
