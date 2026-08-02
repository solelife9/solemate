// FindShoesScreen.rn.tsx — 러닝화 찾기 (기준 → 후보 → 1:1 비교 → 구매처)
// ─────────────────────────────────────────────────────────────────────────────
// 2026-08-02 통합. 전에는 '다음 신발'이라는 이름으로 **보관이 끝난 뒤에만** 열렸다.
// 그런데 이 화면이 하는 일 — 같은 종류 안에서 후보 고르기, 쿠션·무게·수명 견주기,
// 1km당 비용 — 은 신발을 은퇴시키지 않는 사람에게도 필요하다. 만들어놓고 안 보여주는
// 셈이었다(민우님: "같은 카테고리 안에서 비교할 수 있게 만들 수는 없나" → 이미 있었다).
//
// 그래서 기준을 **밖에서 받거나 안에서 고르게** 하고, 마이 탭에 상시 진입점을 뒀다.
// 입구는 셋이지만 도착지는 하나다:
//   · 마이 → 러닝화 찾기      기준을 여기서 고른다(step 'base')
//   · 신발 상세 → 비교         그 신발이 기준으로 채워진 채 'candidates' 부터
//   · 은퇴 완료 → 다음 신발    지난 신발이 기준으로 채워진 채 'candidates' 부터
// 맥락을 알면 묻지 않는다. 같은 화면인데 **아는 만큼 덜 묻는다.**
//
// 작별(RetirementFlow) 화면에는 여전히 구매 동선이 하나도 없다 — 감정과 커머스를
// 시간으로 분리하는 게 이 플로우의 설계다.
//
// 이 화면이 지키는 계약:
//  · 추천은 **같은 카테고리 안에서만**(lib/nextShoe). 쿠션화를 졸업한 러너에게 카본
//    레이싱화를 권하지 않는다.
//  · 모르는 건 비운다. 스펙이 없으면 그 축이 빠지고, 가격을 못 구하면 그 칸이 빈다.
//    추측으로 채우지 않는다(Truth only).
//  · 판매처는 정품 등급으로만 정렬된다(lib/shoeStore). 커미션은 순서에 개입하지 못한다.
//  · 쿠션·반발·안정은 실측이 아니라 keego 분류임을 화면이 밝힌다.

import React, {useMemo, useState, useEffect} from 'react';
import {View, ScrollView, Pressable, StyleSheet, Linking} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {rf, rs, ri, rv} from './lib/responsive';
import {
  BG, CARD, T1, T2, T3, SEP, FONT, DISPLAY, SPACE, RADIUS,
  withAlpha, TYPE, GLASS, MOTION, ICON, RING_ACCENT, GOOD, WARN,
} from './theme';
import {Button, WearRing} from './primitives';
import {ShoePicker} from './ShoePicker';
import ShoeCompareTable from './ShoeCompareTable';
import {MAX_COMPARE, type CompareShoe} from './lib/shoeCompareTable';
import {findCatalogShoe, toCompareShoe, unknownCompareShoe} from './lib/shoeCatalogLookup';
import type {MyShoeRef} from './appTypes';
import {similarShoes, SimilarCandidate, prevCategory} from './lib/nextShoe';
import {ShoeCategory} from './data/shoeModels';
import {actualWonPerKm, expectedWonPerKm} from './lib/shoeCompare';
import {buildShoeSpec, SPEC_BASIS_KO, dropWarningKo} from './lib/shoeSpecModel';
import {visibleChannels, tierLabelKo, EXCLUDED_CHANNELS} from './lib/shoeStore';
import {AFFILIATE_DISCLOSURE, buildShopLinks, categoryLabelKo} from './lib/affiliate';
import {fetchShoePrice, checkedAtLabel, ShoePriceQuote} from './lib/shoePrice';

/** 비교의 기준선이 되는 신발. */
export interface FindShoesBase {
  brand: string;
  model: string;
  /** 그 신발로 실제 달린 거리(km). 원/km 실측의 분모. */
  usedKm?: number;
  /** 그 신발 구매가(원). 없으면 원/km를 계산하지 않는다. */
  priceKrw?: number;
}

export interface FindShoesScreenProps {
  /** 기준 신발. **없으면 기준 고르기부터** 시작한다(마이 탭 진입). */
  base?: FindShoesBase | null;
  /** 내 신발장 — 기준 고르기 목록과 스펙 표 피커에 쓴다. */
  myShoes?: readonly MyShoeRef[];
  onClose: () => void;
}

// 숫자 대신 이름을 쓴다 — 앞에 단계가 하나 붙으면서 인덱스 산술이 전부 틀어졌다.
type Step = 'base' | 'candidates' | 'compare' | 'store';
/** 점 표시에 쓰는 진행 단계(기준 고르기는 '아직 시작 전'이라 점에 넣지 않는다). */
const DOT_STEPS: Step[] = ['candidates', 'compare', 'store'];

function FindShoesScreen({base: baseProp = null, myShoes = [], onClose}: FindShoesScreenProps) {
  const insets = useSafeAreaInsets();
  /** 기준 신발. 밖에서 받았으면 그걸로 시작하고, 아니면 사용자가 고른다. */
  const [base, setBase] = useState<FindShoesBase | null>(baseProp);
  const [step, setStep] = useState<Step>(baseProp ? 'candidates' : 'base');
  /** 기준 고르기에서 카탈로그를 뒤질 때 여는 공용 피커. */
  const [pickerOpen, setPickerOpen] = useState(false);
  /** 표에 세운 신발들(최대 3). 비교 단계의 유일한 면이다. */
  const [shoes, setShoes] = useState<CompareShoe[]>([]);
  /** 차이를 재는 기준 칸. 표에서 언제든 바꾼다. */
  const [baseIdx, setBaseIdx] = useState(0);

  const prevBrand = base?.brand ?? '';
  const prevModel = base?.model ?? '';
  const prevUsedKm = base?.usedKm;
  const prevPriceKrw = base?.priceKrw;
  /** 비교 중인 후보의 인덱스. 비교 화면에서 좌우로 갈아끼운다(왕복 없이 훑기). */
  const [pickedIdx, setPickedIdx] = useState(0);
  /** 모델키 → 조회된 가격(없으면 미조회/실패). 화면은 있는 것만 보여준다. */
  const [prices, setPrices] = useState<Record<string, ShoePriceQuote | null>>({});

  const prevCategoryKey = useMemo(
    () => prevCategory(prevBrand, prevModel),
    [prevBrand, prevModel],
  );
  // 같은 종류 안에서 비슷한 순. 브랜드는 골고루 섞인다(라운드로빈).
  const candidates = useMemo(
    () => (prevModel ? similarShoes(prevBrand, prevModel, {limit: 8, maxPerBrand: 2}) : []),
    [prevBrand, prevModel],
  );

  // 지난 신발 원/km — 내가 낸 값 ÷ 내가 달린 거리(있으면 100% 실측).
  const prevPerKm = useMemo(
    () => actualWonPerKm(prevPriceKrw, prevUsedKm),
    [prevPriceKrw, prevUsedKm],
  );

  // 화면에 뜬 후보들의 현재가를 한 번에 조회한다. 키가 없으면 전부 null 이라 조용히
  // 아무 일도 안 일어난다(6시간 캐시 + 실패 캐시라 반복 호출도 안 된다).
  useEffect(() => {
    let alive = true;
    const shown = candidates;
    if (!shown.length) return;
    Promise.all(
      shown.map(async (c) => {
        const q = await fetchShoePrice(c.model.brand, c.model.model);
        return [`${c.model.brand}|${c.model.model}`, q] as const;
      }),
    )
      .then((pairs) => {
        if (!alive) return;
        setPrices(Object.fromEntries(pairs));
      })
      // fetchShoePrice 는 throw 하지 않지만, 언마운트 경합 등으로 새는 거절도 삼킨다.
      .catch(() => {});
    return () => { alive = false; };
  }, [candidates]);

  const priceOf = (c: SimilarCandidate) => prices[`${c.model.brand}|${c.model.model}`] ?? null;

  /**
   * 표에 담긴 신발의 시세도 조회한다(민우님: "추가한 신발도 가격 조회되게 해줘").
   * 후보 목록을 거치지 않고 피커로 직접 넣은 신발은 아직 조회된 적이 없다.
   * 캐시 키는 조회에 쓴 이름 그대로 — 아래 tableShoes 가 같은 키로 되찾는다.
   */
  useEffect(() => {
    let alive = true;
    const missing = shoes.filter(x => !(`${x.brand}|${x.name}` in prices));
    if (!missing.length) return;
    Promise.all(
      missing.map(async (x) => {
        const q = await fetchShoePrice(x.brand, x.name);
        return [`${x.brand}|${x.name}`, q] as const;
      }),
    )
      .then((pairs) => { if (alive) setPrices(prev => ({...prev, ...Object.fromEntries(pairs)})); })
      .catch(() => {});
    return () => { alive = false; };
  }, [shoes, prices]);

  /**
   * 표에 넘길 형태 — 가격을 얹는다.
   *  · 내 신발이고 구매가를 아는 경우 → **내가 낸 값**(실측의 분자)
   *  · 그 외 → 조회된 시세(예상)
   * 내가 낸 값을 시세보다 우선한다. 지금 얼마에 파는지보다 **내가 얼마를 썼는지**가
   * 내 1km당 비용의 진실이다.
   */
  const tableShoes = useMemo<CompareShoe[]>(() => shoes.map((x) => {
    const owned = myShoes.find(m => m.brand === x.brand && m.model === x.name);
    if (owned?.priceKrw) return {...x, price: {krw: owned.priceKrw, kind: 'paid' as const}};
    const q = prices[`${x.brand}|${x.name}`];
    return q ? {...x, price: {krw: q.priceKrw, kind: 'market' as const}} : x;
  }), [shoes, prices, myShoes]);

  const picked = candidates[pickedIdx] ?? null;
  /**
   * 후보를 고르면 **곧장 표로** 간다. 전에는 사이에 막대 그래프 화면이 하나 더
   * 있었는데, 같은 종류끼리는 그 막대가 대부분 같은 값이라 정보가 없었다
   * (민우님: "그냥 바로 스펙 자세히 보기 화면으로 넘어가는 건 어때, 막대바 있는 화면 없애고?").
   */
  const pick = (i: number) => {
    const c = candidates[i];
    if (!base || !c) return;
    setPickedIdx(i);
    setShoes([
      toSpecOwned(base.brand, base.model),
      toSpec(c.model.brand, c.model.model, null),
    ]);
    setBaseIdx(0);
    setStep('compare');
  };

  /** 기준을 정한다. 고른 즉시 후보로 넘어간다 — 한 번 더 누르게 하지 않는다. */
  const chooseBase = (b: FindShoesBase) => {
    setBase(b);
    setPickedIdx(0);
    setStep('candidates');
  };

  /** 내 신발 한 켤레 → 기준. 구매가가 있으면 원/km 가 실측이 된다. */
  const chooseMine = (m: MyShoeRef) =>
    chooseBase({brand: m.brand, model: m.model, usedKm: m.usedKm, priceKrw: m.priceKrw});

  /** 카탈로그 문서 → 스펙 표에 세울 형태(없으면 이름만 남긴 형태). */
  const toSpec = (brand: string, model: string, mine: {usedKm: number; lifespanKm: number} | null) => {
    const doc = findCatalogShoe(brand, model);
    return doc ? toCompareShoe(doc, mine) : unknownCompareShoe(brand, model, mine);
  };

  /** 내 신발이면 사용률까지 실어 표에 세운다(기준 칸 아래 '남은 수명' 줄이 뜬다). */
  const toSpecOwned = (brand: string, model: string) => {
    const owned = myShoes.find(m => m.brand === brand && m.model === model);
    return toSpec(brand, model, owned ? {usedKm: owned.usedKm, lifespanKm: owned.lifespanKm} : null);
  };

  /** 표에 한 켤레 더. 이미 있으면 아무 일도 안 한다(같은 신발 두 칸은 비교가 아니다). */
  const addToTable = (brand: string, model: string) => {
    const next = toSpecOwned(brand, model);
    setShoes(prev =>
      prev.length >= MAX_COMPARE || prev.some(x => x.id === next.id) ? prev : [...prev, next]);
  };

  /**
   * 칸을 뺀다. 기준 칸을 빼면 남은 첫 칸이 기준이 되고, 기준보다 앞을 빼면 기준이
   * 한 칸 당겨진다 — 안 그러면 엉뚱한 신발이 조용히 기준이 된다.
   */
  const removeFromTable = (id: string) => {
    const i = shoes.findIndex(x => x.id === id);
    if (i < 0) return;
    setShoes(shoes.filter((_, k) => k !== i));
    setBaseIdx(b => (i < b ? b - 1 : i === b ? 0 : b));
  };

  return (
    <View style={[s.screen, {paddingTop: insets.top}]}>
      <View style={s.nav}>
        <Pressable
          onPress={() => {
            // 기준을 밖에서 받았으면 후보에서 뒤로 = 닫기다(기준 고르기는 내 단계가 아니다).
            if (step === 'base') return onClose();
            if (step === 'candidates') return baseProp ? onClose() : setStep('base');
            setStep(step === 'store' ? 'compare' : 'candidates');
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={step === 'base' || (step === 'candidates' && !!baseProp) ? '닫기' : '이전'}
          testID="next-shoe-back"
          style={s.iconBtn}>
          <Ionicons
            name={step === 'base' || (step === 'candidates' && !!baseProp) ? 'close' : 'chevron-back'}
            size={ri(ICON.action)} color={T2} />
        </Pressable>
        {step !== 'base' && (
          <View style={s.dots} accessible accessibilityLabel={`3단계 중 ${DOT_STEPS.indexOf(step) + 1}`}>
            {DOT_STEPS.map((k, i) => (
              <View key={k} style={[s.dot,
                k === step ? s.dotOn : i < DOT_STEPS.indexOf(step) && s.dotDone]} />
            ))}
          </View>
        )}
        <View style={s.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {step === 'base' && (
          <BaseStep
            myShoes={myShoes}
            onPickMine={chooseMine}
            onBrowse={() => setPickerOpen(true)}
          />
        )}
        {step === 'candidates' && !!base && (
          <RecommendStep
            prevBrand={prevBrand}
            prevModel={prevModel}
            prevUsedKm={prevUsedKm}
            prevPerKmLabel={prevPerKm ? `1km당 ${prevPerKm.wonPerKm.toLocaleString('ko-KR')}원` : ''}
            candidates={candidates}
            priceOf={priceOf}
            prevCategoryKey={prevCategoryKey}
            onPick={pick}
            baseWearPct={(() => {
              const m = myShoes.find(x => x.brand === prevBrand && x.model === prevModel);
              return m && m.lifespanKm > 0 ? (m.usedKm / m.lifespanKm) * 100 : null;
            })()}
            onChangeBase={() => setStep('base')}
          />
        )}
        {step === 'compare' && (
          <CompareStep
            base={base}
            picked={picked}
            shoes={tableShoes}
            baseIdx={baseIdx}
            onSetBase={setBaseIdx}
            onRemove={removeFromTable}
            onAdd={() => setPickerOpen(true)}
          />
        )}
        {step === 'store' && picked && <StoreStep picked={picked} quote={priceOf(picked)} />}
      </ScrollView>

      <View style={[s.footer, {paddingBottom: insets.bottom + SPACE.md}]}>
        {step === 'candidates' && (
          <Button label="나중에 볼게요" onPress={onClose} testID="next-shoe-later" style={s.btnFull} />
        )}
        {step === 'compare' && !base && (
          <Button label="닫기" onPress={onClose} testID="next-shoe-close-browse" style={s.btnFull} />
        )}
        {step === 'compare' && !!base && (
          <View style={s.footRow}>
            <Pressable
              onPress={() => setStep('candidates')}
              accessibilityRole="button"
              accessibilityLabel="다른 신발"
              testID="next-shoe-other"
              style={({pressed}) => [s.btn, s.btnGhost, pressed && s.pressed]}>
              <Text style={[s.btnTxt, {color: T2}]}>다른 신발</Text>
            </Pressable>
            <Button label="이걸로 정했어요" onPress={() => setStep('store')} testID="next-shoe-decide" style={s.btnPrimary} />
          </View>
        )}
        {step === 'store' && (
          <Button label="닫기" onPress={onClose} testID="next-shoe-close" style={s.btnFull} />
        )}
      </View>

      {/* 기준을 카탈로그에서 고를 때 — 등록·온보딩과 같은 2열 피커. */}
      <ShoePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => (step === 'base'
          ? chooseBase({brand: p.brand, model: p.model})
          : addToTable(p.brand, p.model))}
        myShoes={step === 'base' ? undefined : myShoes
          .filter(m => !shoes.some(x => x.brand === m.brand && x.name === m.model))
          .map(m => ({brand: m.brand, model: m.model,
            sub: `${m.brand} · ${Math.round(m.usedKm)} / ${Math.round(m.lifespanKm)} km`}))}
        insetTop={insets.top}
        insetBottom={insets.bottom}
      />
    </View>
  );
}

// ── 기준 고르기 ───────────────────────────────────────────────────────────────
// 마이 탭에서 맨몸으로 들어왔을 때만 뜬다. 내 신발을 **먼저** 놓는 이유는 그게 가장
// 흔한 시작점이라서지, 의무라서가 아니다 — 아무 러닝화나 기준으로 세울 수 있다
// (민우님: "꼭 내 러닝화랑 비교해야 될까").
//
// 전에는 '기준 없이 그냥 둘러볼래요'가 하나 더 있었는데 뺐다 — '다른 러닝화에서
// 고르기'가 곧 그 행동이라 두 버튼이 같은 말을 하고 있었다(민우님 지적).
function BaseStep({myShoes, onPickMine, onBrowse}: {
  myShoes: readonly MyShoeRef[];
  onPickMine: (m: MyShoeRef) => void;
  onBrowse: () => void;
}) {
  return (
    <View style={s.stepWrap} testID="find-shoes-base">
      <Text style={s.eyebrow}>러닝화 찾기</Text>
      <Text style={s.stepTitle}>어떤 신발을{'\n'}기준으로 볼까요?</Text>
      <Text style={s.refMeta}>기준과 견줘서 후보를 골라드려요</Text>

      {myShoes.length > 0 && (
        <>
          <Text style={s.baseSect}>내 러닝화</Text>
          {myShoes.map((m) => {
            const pct = m.lifespanKm > 0 ? (m.usedKm / m.lifespanKm) * 100 : 0;
            return (
              <Pressable
                key={`${m.brand}|${m.model}`}
                onPress={() => onPickMine(m)}
                accessibilityRole="button"
                accessibilityLabel={`${m.brand} ${m.model} 을 기준으로`}
                testID={`find-shoes-mine-${m.model}`}
                style={({pressed}) => [s.baseRow, pressed && s.pressed]}>
                <WearRing pct={pct} size={rs(34)} />
                <View style={s.flex1}>
                  <Text style={s.baseName} numberOfLines={1}>{m.model}</Text>
                  <Text style={s.baseSub} numberOfLines={1}>
                    {m.brand} · {Math.round(m.usedKm)} / {Math.round(m.lifespanKm)} km
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={ri(ICON.action)} color={T3} />
              </Pressable>
            );
          })}
        </>
      )}

      <Text style={s.baseSect}>또는</Text>
      <Pressable
        onPress={onBrowse}
        accessibilityRole="button"
        accessibilityLabel="다른 러닝화에서 고르기"
        testID="find-shoes-browse"
        style={({pressed}) => [s.baseRow, pressed && s.pressed]}>
        <View style={s.baseIcon}>
          <Ionicons name="search-outline" size={ri(ICON.action)} color={T3} />
        </View>
        <View style={s.flex1}>
          <Text style={s.baseName}>다른 러닝화에서 고르기</Text>
          <Text style={s.baseSub}>브랜드 → 모델</Text>
        </View>
        <Ionicons name="chevron-forward" size={ri(ICON.action)} color={T3} />
      </Pressable>

    </View>
  );
}

// ── 스텝 0 · 비슷한 후보 목록 ───────────────────────────────────────────────────
// 방향별 그룹(더 푹신/더 가벼움) 대신 **비슷한 순 한 줄 목록**이다. 브랜드로 묶지 않고
// 라벨로만 보여주되 브랜드가 골고루 섞이게 한다 — 브랜드는 비슷함의 근거가 아니라서,
// 헤더로 묶으면 가장 잘 맞는 후보가 알파벳 순서에 밀린다.
// 고르는 건 목적이 아니고 **눌러서 그래프로 견주는 게 본론**이라, 목록은 빨리 훑게만 한다.
function RecommendStep({
  prevBrand, prevModel, prevUsedKm, prevPerKmLabel, candidates, priceOf,
  prevCategoryKey, onPick, baseWearPct, onChangeBase,
}: {
  prevBrand: string;
  prevModel: string;
  prevUsedKm?: number;
  prevPerKmLabel: string;
  candidates: SimilarCandidate[];
  priceOf: (c: SimilarCandidate) => ShoePriceQuote | null;
  prevCategoryKey: ShoeCategory;
  onPick: (index: number) => void;
  /** 기준이 내 신발이면 수명 사용률(%). 아니면 null(링을 그리지 않는다). */
  baseWearPct: number | null;
  onChangeBase: () => void;
}) {
  return (
    <View style={s.stepWrap}>
      <Text style={s.stepTitle}>바꾸고 싶은 대로{'\n'}골라보세요</Text>

      {/* 기준 카드 — 전에는 작은 회색 한 줄이라 눈에 안 들어왔다(민우님: "지금 기준
          러닝화가 뭔지 잘 눈에 안 띄는 거 같아"). 후보 라벨('쿠션 ↑')은 무엇에 비해
          올라간 건지 알아야 읽히므로, 그 앵커가 화면에 박혀 있어야 한다. */}
      <View style={s.baseCard} testID="find-shoes-base-card">
        <View style={s.baseCardHead}>
          <Text style={s.baseCardLab}>기준</Text>
          <Pressable
            onPress={onChangeBase}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="기준 신발 바꾸기"
            testID="find-shoes-change-base"
            style={({pressed}) => pressed && s.pressed}>
            <Text style={s.baseCardChg}>바꾸기</Text>
          </Pressable>
        </View>
        <View style={s.baseCardRow}>
          {baseWearPct != null && <WearRing pct={baseWearPct} size={rs(36)} />}
          <View style={s.flex1}>
            <Text style={s.baseCardBrand} numberOfLines={1}>{prevBrand.toUpperCase()}</Text>
            <Text style={s.baseCardName} numberOfLines={1}>{prevModel}</Text>
            <Text style={s.baseCardMeta} numberOfLines={1}>
              {categoryLabelKo[prevCategoryKey]}
              {typeof prevUsedKm === 'number' && prevUsedKm > 0 ? ` · 실사용 ${Math.round(prevUsedKm)}km` : ''}
              {prevPerKmLabel ? ' · ' : ''}
              {prevPerKmLabel ? <Text style={s.baseCardPer}>{prevPerKmLabel}</Text> : null}
            </Text>
          </View>
        </View>
      </View>

      {/* "왜 이 신발들이지?"에 먼저 답한다. 종류를 넘나들지 않는 게 안전 규칙이라,
          밝히는 것 자체가 신뢰가 된다(카본화를 데일리로 권하지 않는다는 약속). */}
      <View style={s.scopeNote} testID="next-shoe-scope">
        <Ionicons name="shield-checkmark-outline" size={ri(ICON.inline)} color={T3} />
        <Text style={s.scopeText}>
          신던 신발과 같은 <Text style={s.scopeStrong}>{categoryLabelKo[prevCategoryKey]}</Text> 중에서만
          골랐어요. 종류가 다르면 발에 오는 부담도 달라져요.
        </Text>
      </View>

      {candidates.length === 0 ? (
        <View style={s.emptyWrap} testID="next-shoe-empty">
          <Text style={s.emptyTitle}>아직 후보가 없어요</Text>
          <Text style={s.emptyBody}>
            같은 종류의 러닝화를 못 찾았어요. 러닝화 정보가 쌓이면 여기에 후보가 나타나요.
          </Text>
        </View>
      ) : (
        <>
          <View style={s.listHead}>
            <Text style={s.listHint}>비슷한 순 · 눌러서 비교해요</Text>
            <Text style={s.groupCount}>{candidates.length}켤레</Text>
          </View>
          {/* 가격을 못 구한 후보도 목록에 그대로 남는다(2026-07-29 확정). 이 목록의 정렬
              근거는 '얼마나 비슷한가'지 '가격을 아는가'가 아니다 — 공식몰 검색에 안 잡혔다는
              이유로 잘 맞는 신발을 빼면, 추천 품질이 데이터 구멍을 따라 흔들린다.
              가격 칸만 조용히 비운다(Truth only). */}
          {candidates.map((c, i) => {
            const q = priceOf(c);
            const per = q ? expectedWonPerKm(q.priceKrw, c.spec.lifespanKm) : null;
            // 두 줄을 **항상 같은 문법으로** 적는다. 전에는 차이가 있으면 문장
            // ('쿠션은 조금 얇아요'), 없으면 스펙('255g · 권장 650km')이라 줄마다
            // 다른 종류의 정보가 떠서 서로 비교가 안 됐다(민우님 실기기 지적).
            //  · 위: 왜 이게 떴는지(기준 대비 차이). 차이가 없으면 그 사실을 적는다.
            //  · 아래: 아는 숫자. 모르면 그 줄만 빠진다(추측 금지).
            const diff = c.deltas.map((d) => d.detailKo).filter(Boolean).slice(0, 2).join(' · ')
              || '기준과 비슷해요';
            const spec = [
              c.spec.weightG ? `${c.spec.weightG}g` : '',
              c.spec.lifespanKm ? `권장 ${c.spec.lifespanKm}km` : '',
            ].filter(Boolean).join(' · ');
            return (
              <Pressable
                key={`${c.model.brand}|${c.model.model}`}
                onPress={() => onPick(i)}
                accessibilityRole="button"
                accessibilityLabel={`${c.model.brand} ${c.model.model} 비교하기`}
                testID={`next-shoe-cand-${c.model.model}`}
                style={({pressed}) => [s.cand, pressed && s.pressed]}>
                <View style={s.candLeft}>
                  <Text style={s.candBrand}>{c.model.brand.toUpperCase()}</Text>
                  <Text style={s.candName} numberOfLines={1}>{c.model.model}</Text>
                  <Text style={s.candDelta} numberOfLines={1}>{diff}</Text>
                  {!!spec && <Text style={s.candSpec} numberOfLines={1}>{spec}</Text>}
                </View>
                <View style={s.candRight}>
                  {q ? (
                    <>
                      <Text style={s.candPrice}>{q.priceKrw.toLocaleString('ko-KR')}원</Text>
                      {!!per && <Text style={s.candPerKm}>{per.wonPerKm.toLocaleString('ko-KR')}원/km</Text>}
                    </>
                  ) : (
                    <Ionicons name="chevron-forward" size={ri(ICON.inline)} color={T3} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </>
      )}

      <Text style={s.basis}>
        {SPEC_BASIS_KO} 1km당 비용은 권장 수명 기준 예상치예요.
      </Text>
    </View>
  );
}

// ── 비교 · 스펙 표 ─────────────────────────────────────────────────────────────
// 전에는 여기가 쿠션·무게·수명 **막대 그래프** 화면이었고, 정확한 숫자 표는 그 뒤에
// 한 번 더 있었다. 그런데 막대가 실제로 담는 정보가 거의 없었다:
//   · 반발·안정 — 카테고리에서 파생. 후보는 같은 종류에서만 고르므로 **항상 동일**
//   · 쿠션      — 힐 스택(mm)을 1~5로 뭉갠 값. 표엔 그 mm 가 그대로 있다
//   · 무게·권장 수명 — 표에 이미 정확히 있다
// 그래서 막대를 걷어내고 표 하나로 합쳤다(민우님: "그냥 바로 스펙 자세히 보기
// 화면으로 넘어가는 건 어때, 막대바 있는 화면 없애고?"). 화면이 하나 줄었고
// 최대 3켤레를 한 번에 볼 수 있게 됐다.
//
// 막대 화면에만 있던 것 중 **값이 있는 둘은 남긴다** — 부상 경고와 1km당 비용.
// 둘 다 카드지 막대가 아니었다. 경고를 비용보다 위에 두는 순서도 그대로다:
// 미션(부상 없이)이 돈보다 앞선다.
function CompareStep({
  base, picked, shoes, baseIdx, onSetBase, onRemove, onAdd,
}: {
  /** 기준 신발. null 이면 '기준 없이 둘러보기' — 추천도 가격도 없이 표만 쓴다. */
  base: FindShoesBase | null;
  picked: SimilarCandidate | null;
  shoes: readonly CompareShoe[];
  baseIdx: number;
  onSetBase: (i: number) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const prevSpec = useMemo(
    () => (base ? buildShoeSpec(base.brand, base.model) : null),
    [base],
  );
  const next = picked?.spec ?? null;
  // 드롭이 크게 낮아지면 부상 위험을 먼저 말한다.
  const dropWarn = prevSpec && next ? dropWarningKo(prevSpec.dropMm, next.dropMm) : '';

  return (
    <View style={s.stepWrap} testID="next-shoe-compare">
      {/* 부상 경고는 표보다 위. 숫자를 읽기 전에 몸 얘기를 먼저 한다. */}
      {!!dropWarn && (
        <View style={s.warn} testID="next-shoe-drop-warning">
          <Ionicons name="alert-circle-outline" size={ri(ICON.inline)} color={WARN} />
          <Text style={s.warnText}>{dropWarn}</Text>
        </View>
      )}

      <ShoeCompareTable
        shoes={shoes}
        baseIdx={baseIdx}
        onSetBase={onSetBase}
        onRemove={onRemove}
        onAdd={onAdd}
      />

      <Text style={s.basis}>
        가격은 공식몰 조회 시점 기준이라 실제 결제가와 다를 수 있어요.
        내 신발은 등록할 때 넣은 구매가를 그대로 보여줘요.
      </Text>
    </View>
  );
}

// ── 스텝 2 · 구매처 ────────────────────────────────────────────────────────────
function StoreStep({picked, quote}: {picked: SimilarCandidate; quote: ShoePriceQuote | null}) {
  const links = buildShopLinks({brand: picked.model.brand, model: picked.model.model});
  const channels = visibleChannels();
  // 외부 앱/브라우저를 못 열어도 화면이 죽지 않게 조용히 삼킨다.
  const open = (url: string) => { Linking.openURL(url).catch(() => {}); };

  return (
    <View style={s.stepWrap} testID="next-shoe-stores">
      <Text style={s.eyebrow}>{picked.model.brand} {picked.model.model}</Text>
      <Text style={s.stepTitle}>어디서 살까요?</Text>
      <Text style={s.lede}>정품이 확인된 곳만 보여줘요.</Text>

      {/* 공식 스토어에서 가격이 확인된 경우에만 금액을 띄운다(출처·시각 함께).
          그리고 **그 상품 페이지로 바로 간다** — 가격을 보여주고 갈 길을 안 주면
          사용자가 그 금액을 다시 찾아 헤매야 한다(여기가 '어디서 살까요' 화면이다).
          이 줄이 맨 위인 건 공식 스토어가 최상위 등급이기 때문이다(lib/shoeStore). */}
      {!!quote && (
        <Pressable
          onPress={() => open(quote.productUrl)}
          accessibilityRole="link"
          accessibilityLabel={`${quote.mallName}에서 ${quote.priceKrw.toLocaleString('ko-KR')}원에 보기`}
          testID="next-shoe-store-quote"
          style={({pressed}) => [s.store, pressed && s.pressed]}>
          <View style={s.storeLeft}>
            <Text style={s.storeName} numberOfLines={1}>{quote.mallName}</Text>
            <Text style={[s.badge, s.badgeOfficial]}>{tierLabelKo.official}</Text>
          </View>
          <View style={s.storeRight}>
            <View>
              <Text style={s.storePrice}>{quote.priceKrw.toLocaleString('ko-KR')}원</Text>
              <Text style={s.storeTime}>{checkedAtLabel(quote.checkedAtMs)} 기준</Text>
            </View>
            <Ionicons name="chevron-forward" size={ri(ICON.inline)} color={T3} />
          </View>
        </Pressable>
      )}

      {/* 무신사·29CM 는 가격을 가져올 수단이 없다(제휴 API 미보유). 그래서 '가격 보기'라고
          쓰지 않는다(2026-07-29 확정) — 없는 걸 약속하면 눌렀을 때 배신이 된다.
          여기는 정품 검수 채널로 **검색해 들어가는 길**이고, 배지가 그걸 말한다. */}
      {channels.map((c) => {
        const link = links.find((l) => l.shop === c.name);
        if (!link) return null;
        return (
          <Pressable
            key={c.id}
            onPress={() => open(link.url)}
            accessibilityRole="link"
            accessibilityLabel={`${c.name}에서 보기`}
            testID={`next-shoe-store-${c.id}`}
            style={({pressed}) => [s.store, pressed && s.pressed]}>
            <View style={s.storeLeft}>
              <Text style={s.storeName}>{c.name}</Text>
              <Text style={[s.badge, s.badgeVerified]}>{tierLabelKo[c.tier]}</Text>
            </View>
            <Ionicons name="chevron-forward" size={ri(ICON.inline)} color={T3} />
          </Pressable>
        );
      })}

      {/* 왜 어떤 곳이 없는지 밝힌다 — 빠진 이유를 말하지 않으면 누락으로 읽힌다. */}
      {EXCLUDED_CHANNELS.length > 0 && (
        <Text style={s.excluded}>{EXCLUDED_CHANNELS[0].reason}</Text>
      )}

      <Text style={s.disclosure}>{AFFILIATE_DISCLOSURE}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  pressed: {opacity: MOTION.press.opacity, transform: [{scale: MOTION.press.scale}]},
  nav: {
    paddingTop: SPACE.md, paddingHorizontal: SPACE.md, paddingBottom: SPACE.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  iconBtn: {width: rs(38), height: rs(38), alignItems: 'center', justifyContent: 'center'},
  dots: {flexDirection: 'row', alignItems: 'center', gap: rv(6)},
  dot: {width: rs(6), height: rs(6), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.16)},
  dotOn: {backgroundColor: T2, width: rs(18)},
  dotDone: {backgroundColor: withAlpha(T1, 0.5)},

  body: {flexGrow: 1, padding: SPACE.xl, paddingBottom: SPACE.xxl},
  stepWrap: {gap: SPACE.sm},
  flex1: {flex: 1, minWidth: 0},

  // 기준 고르기 — 목록은 '갈 곳'이라 카드 톤을 낮게 두고 이름만 또렷하게.
  baseSect: {color: T3, fontFamily: FONT, ...TYPE.micro, fontWeight: '700',
    letterSpacing: 1.1, marginTop: rv(16), marginBottom: rv(2)},
  baseRow: {flexDirection: 'row', alignItems: 'center', gap: rs(11),
    backgroundColor: CARD, borderRadius: RADIUS.md, paddingHorizontal: rs(13),
    paddingVertical: rv(12), borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  baseIcon: {width: rs(34), alignItems: 'center'},
  baseName: {color: T1, fontFamily: FONT, ...TYPE.body, fontWeight: '700', letterSpacing: -0.2},
  baseSub: {color: T3, fontFamily: FONT, ...TYPE.caption, marginTop: rv(2)},
  baseSkip: {marginTop: rv(16), alignItems: 'center', paddingVertical: rv(13),
    borderRadius: RADIUS.btn, borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(T1, 0.14), borderStyle: 'dashed'},
  baseSkipTxt: {color: T3, fontFamily: FONT, ...TYPE.body, fontWeight: '600'},

  // 기준 카드 — 화면 내내 '무엇과 견주는 중인지'를 붙들어 둔다.
  baseCard: {backgroundColor: CARD, borderRadius: RADIUS.md, padding: rs(13),
    borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.14),
    marginTop: rv(4), marginBottom: rv(4)},
  baseCardHead: {flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: rv(9)},
  baseCardLab: {color: T3, fontFamily: FONT, ...TYPE.micro, fontWeight: '800', letterSpacing: 1.3},
  baseCardChg: {color: T3, fontFamily: FONT, ...TYPE.caption, fontWeight: '700'},
  baseCardRow: {flexDirection: 'row', alignItems: 'center', gap: rs(11)},
  baseCardBrand: {color: T3, fontFamily: FONT, ...TYPE.micro, fontWeight: '700', letterSpacing: 0.7},
  baseCardName: {color: T1, fontFamily: FONT, ...TYPE.title, fontWeight: '800',
    letterSpacing: -0.4, marginTop: rv(1)},
  baseCardMeta: {color: T3, fontFamily: FONT, ...TYPE.caption, marginTop: rv(4)},
  baseCardPer: {color: RING_ACCENT},

  // 스펙 표로 잇는 줄 — 막대(방향)에서 숫자(정확)로.
  specLink: {flexDirection: 'row', alignItems: 'center', gap: rs(10),
    backgroundColor: CARD, borderRadius: RADIUS.md, paddingHorizontal: rs(13),
    paddingVertical: rv(12), marginTop: rv(14),
    borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  specLinkTitle: {color: T1, fontFamily: FONT, ...TYPE.label, fontWeight: '600'},
  specLinkSub: {color: T3, fontFamily: FONT, ...TYPE.caption, marginTop: rv(2)},
  eyebrow: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600'},
  stepTitle: {
    color: T1, fontFamily: DISPLAY, fontSize: TYPE.title1.fontSize,
    fontWeight: '700', letterSpacing: -0.4, lineHeight: rf(30),
  },
  lede: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize},
  refMeta: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginBottom: rv(6)},
  // 추천 범위 안내 — 강조가 아니라 안심이라 무채 유리 표면에 담는다.
  scopeNote: {
    flexDirection: 'row', gap: rv(8), alignItems: 'flex-start',
    backgroundColor: withAlpha(T1, 0.04), borderRadius: RADIUS.md, borderCurve: 'continuous',
    paddingHorizontal: SPACE.sm, paddingVertical: rv(11), marginTop: rv(4),
  },
  scopeText: {flex: 1, color: T3, fontFamily: FONT, fontSize: rf(11.5), lineHeight: rf(17)},
  scopeStrong: {color: T2, fontWeight: '700'},

  listHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: rv(16), marginBottom: rv(8), paddingHorizontal: rs(2),
  },
  listHint: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize},
  groupCount: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize},

  // 후보 전환 칩 — 선택은 무채 반전(액센트 절제).
  switcher: {gap: rv(7), paddingBottom: rv(4), paddingRight: SPACE.md},
  chip: {
    paddingHorizontal: rs(13), paddingVertical: rv(8), borderRadius: RADIUS.pill,
    backgroundColor: GLASS.fill, maxWidth: rs(150),
  },
  chipOn: {backgroundColor: T1},
  chipTxt: {color: T2, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600'},
  chipTxtOn: {color: BG},

  cand: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: GLASS.fill, borderRadius: RADIUS.md, borderCurve: 'continuous',
    paddingHorizontal: SPACE.md, paddingVertical: rv(12), marginBottom: rv(7), gap: SPACE.sm,
  },
  candLeft: {flex: 1, minWidth: 0},
  candBrand: {color: T3, fontFamily: FONT, fontSize: rf(10), fontWeight: '600', letterSpacing: 1.2},
  candName: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2, marginTop: rv(2)},
  // 위 줄(차이) = 이게 뜬 이유라 밝게, 아래 줄(숫자) = 사실이라 눌러서.
  candDelta: {color: T2, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(3)},
  candSpec: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(2)},
  candRight: {alignItems: 'flex-end'},
  candPrice: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  candPerKm: {color: RING_ACCENT, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(2)},

  emptyWrap: {paddingVertical: rv(28), gap: rv(8)},
  emptyTitle: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  emptyBody: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(21)},

  basis: {color: T3, fontFamily: FONT, fontSize: rf(11), lineHeight: rf(17), marginTop: rv(16)},

  vs: {flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm, marginBottom: rv(18)},
  vsCol: {flex: 1, alignItems: 'center'},
  vsTag: {color: T3, fontFamily: FONT, fontSize: rf(10), fontWeight: '600', letterSpacing: 0.8},
  vsName: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', textAlign: 'center', marginTop: rv(4)},
  vsMid: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, paddingBottom: rv(3)},

  attr: {marginBottom: rv(14)},
  attrName: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, textAlign: 'center', marginBottom: rv(6)},
  abars: {flexDirection: 'row', gap: rv(7)},
  ab: {flex: 1, height: rv(7), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.07), overflow: 'hidden'},
  // 왼쪽(지난 신발)은 오른쪽 정렬로 자라 가운데에서 마주본다.
  abFillL: {position: 'absolute', right: 0, top: 0, bottom: 0, borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.3)},
  abFillR: {position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: RADIUS.pill, backgroundColor: T1},
  // 수명은 '진행' 성격이라 Ember 허용(DESIGN.md §1).
  abEmber: {backgroundColor: RING_ACCENT},
  attrVals: {color: T2, fontFamily: FONT, fontSize: rf(11), textAlign: 'center', marginTop: rv(5)},
  // 근거는 값보다 한 단계 낮은 위계로 — 있지만 소리치지 않는다.
  attrBasis: {color: T3, fontFamily: FONT, fontSize: rf(9.5), textAlign: 'center', marginTop: rv(2)},
  warn: {
    flexDirection: 'row', gap: rv(8), alignItems: 'flex-start',
    backgroundColor: withAlpha(WARN, 0.1), borderRadius: RADIUS.md, borderCurve: 'continuous',
    padding: SPACE.sm, marginTop: rv(6),
  },
  warnText: {flex: 1, color: T2, fontFamily: FONT, fontSize: rf(11.5), lineHeight: rf(17)},

  verdict: {
    backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous',
    padding: SPACE.md, marginTop: rv(6),
  },
  verdictSub: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(6)},
  verdictMain: {color: GOOD, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '800', letterSpacing: -0.4},
  verdictRows: {flexDirection: 'row', gap: SPACE.md, marginTop: rv(12), paddingTop: rv(12), borderTopWidth: 1, borderTopColor: SEP},
  verdictCol: {flex: 1, minWidth: 0},
  vrL: {color: T3, fontFamily: FONT, fontSize: rf(10.5)},
  vrN: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', marginTop: rv(3)},
  vrB: {color: T3, fontFamily: FONT, fontSize: rf(9.5), marginTop: rv(2)},

  store: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: GLASS.fill, borderRadius: RADIUS.md, borderCurve: 'continuous',
    paddingHorizontal: SPACE.md, paddingVertical: rv(13), marginTop: rv(7), gap: SPACE.sm,
  },
  storeLeft: {flexDirection: 'row', alignItems: 'center', gap: rv(9), flex: 1, minWidth: 0},
  storeName: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600'},
  badge: {fontFamily: FONT, fontSize: rf(10), fontWeight: '700', paddingHorizontal: rs(7), paddingVertical: rv(3), borderRadius: RADIUS.pill, overflow: 'hidden'},
  badgeOfficial: {color: GOOD, backgroundColor: withAlpha(GOOD, 0.14)},
  badgeVerified: {color: T2, backgroundColor: withAlpha(T1, 0.1)},
  storeRight: {flexDirection: 'row', alignItems: 'center', gap: rv(6)},
  storePrice: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', textAlign: 'right'},
  storeTime: {color: T3, fontFamily: FONT, fontSize: rf(9.5), textAlign: 'right', marginTop: rv(2)},
  excluded: {color: T3, fontFamily: FONT, fontSize: rf(11), lineHeight: rf(17), marginTop: rv(12)},
  disclosure: {
    color: T3, fontFamily: FONT, fontSize: rf(11), lineHeight: rf(18),
    backgroundColor: withAlpha(T1, 0.04), borderRadius: RADIUS.sm, padding: SPACE.sm, marginTop: rv(12),
  },

  footer: {paddingHorizontal: SPACE.xl, paddingTop: SPACE.sm, gap: SPACE.sm},
  footRow: {flexDirection: 'row', gap: SPACE.sm},
  btn: {
    flex: 1, height: rv(52), borderRadius: RADIUS.btn, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
  },
  btnGhost: {backgroundColor: 'transparent'},
  btnTxt: {fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  btnPrimary: {flex: 1},
  btnFull: {width: '100%'},
});

export default FindShoesScreen;
