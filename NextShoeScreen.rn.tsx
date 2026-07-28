// NextShoeScreen.rn.tsx — 은퇴 후 '다음 신발' 플로우 (방향별 추천 → 나란히 비교 → 구매처)
// ─────────────────────────────────────────────────────────────────────────────
// 보관이 끝난 뒤에만 열린다(RetirementFlow 스텝 4의 초대). 작별 화면에는 구매 동선이
// 하나도 없다 — 감정과 커머스를 시간으로 분리하는 게 이 플로우의 설계다.
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
import {Button} from './primitives';
import {buildAxisGroups, AxisCandidate} from './lib/nextShoe';
import {
  compareAxes, axisLabelKo, actualWonPerKm, expectedWonPerKm,
  wonPerKmVerdictKo, wonPerKmLabelKo, ShoeSpec, CompareAxis,
} from './lib/shoeCompare';
import {buildShoeSpec, SPEC_BASIS_KO, basisOf, dropWarningKo} from './lib/shoeSpecModel';
import {visibleChannels, tierLabelKo, EXCLUDED_CHANNELS} from './lib/shoeStore';
import {AFFILIATE_DISCLOSURE, buildShopLinks} from './lib/affiliate';
import {fetchShoePrice, checkedAtLabel, ShoePriceQuote} from './lib/shoePrice';

export interface NextShoeScreenProps {
  /** 방금 보관한 신발 — 비교의 기준선. */
  prevBrand: string;
  prevModel: string;
  /** 그 신발로 실제 달린 거리(km). 원/km 실측의 분모. */
  prevUsedKm?: number;
  /** 그 신발 구매가(원). 없으면 원/km를 계산하지 않는다. */
  prevPriceKrw?: number;
  onClose: () => void;
}

/** 축 방향을 보여줄 짧은 꼬리표(그룹 헤더 옆). */
const AXIS_HINT: Record<CompareAxis, string> = {
  softer: '쿠션 ↑',
  lighter: '무게 ↓',
  longer: '수명 ↑',
  stabler: '안정 ↑',
  snappier: '반발 ↑',
};

type Step = 0 | 1 | 2;

function NextShoeScreen({
  prevBrand, prevModel, prevUsedKm, prevPriceKrw, onClose,
}: NextShoeScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(0);
  const [picked, setPicked] = useState<AxisCandidate | null>(null);
  /** 모델키 → 조회된 가격(없으면 미조회/실패). 화면은 있는 것만 보여준다. */
  const [prices, setPrices] = useState<Record<string, ShoePriceQuote | null>>({});

  const prevSpec: ShoeSpec = useMemo(
    () => buildShoeSpec(prevBrand, prevModel),
    [prevBrand, prevModel],
  );
  const groups = useMemo(
    () => buildAxisGroups(prevBrand, prevModel, {limit: 3}),
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
    const shown = groups.flatMap((g) => g.items);
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
  }, [groups]);

  const priceOf = (c: AxisCandidate) => prices[`${c.model.brand}|${c.model.model}`] ?? null;

  const pick = (c: AxisCandidate) => { setPicked(c); setStep(1); };

  return (
    <View style={[s.screen, {paddingTop: insets.top}]}>
      <View style={s.nav}>
        <Pressable
          onPress={() => (step === 0 ? onClose() : setStep((step - 1) as Step))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={step === 0 ? '닫기' : '이전'}
          testID="next-shoe-back"
          style={s.iconBtn}>
          <Ionicons name={step === 0 ? 'close' : 'chevron-back'} size={ri(ICON.action)} color={T2} />
        </Pressable>
        <View style={s.dots} accessible accessibilityLabel={`3단계 중 ${step + 1}`}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[s.dot, i === step ? s.dotOn : i < step && s.dotDone]} />
          ))}
        </View>
        <View style={s.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {step === 0 && (
          <RecommendStep
            prevBrand={prevBrand}
            prevModel={prevModel}
            prevUsedKm={prevUsedKm}
            prevPerKmLabel={prevPerKm ? `1km당 ${prevPerKm.wonPerKm.toLocaleString('ko-KR')}원` : ''}
            groups={groups}
            priceOf={priceOf}
            prevSpec={prevSpec}
            onPick={pick}
          />
        )}
        {step === 1 && picked && (
          <CompareStep
            prevSpec={prevSpec}
            picked={picked}
            prevPerKm={prevPerKm}
            quote={priceOf(picked)}
          />
        )}
        {step === 2 && picked && <StoreStep picked={picked} quote={priceOf(picked)} />}
      </ScrollView>

      <View style={[s.footer, {paddingBottom: insets.bottom + SPACE.md}]}>
        {step === 0 && (
          <Button label="나중에 볼게요" onPress={onClose} testID="next-shoe-later" style={s.btnFull} />
        )}
        {step === 1 && (
          <View style={s.footRow}>
            <Pressable
              onPress={() => setStep(0)}
              accessibilityRole="button"
              accessibilityLabel="다른 신발"
              testID="next-shoe-other"
              style={({pressed}) => [s.btn, s.btnGhost, pressed && s.pressed]}>
              <Text style={[s.btnTxt, {color: T2}]}>다른 신발</Text>
            </Pressable>
            <Button label="이걸로 정했어요" onPress={() => setStep(2)} testID="next-shoe-decide" style={s.btnPrimary} />
          </View>
        )}
        {step === 2 && (
          <Button label="닫기" onPress={onClose} testID="next-shoe-close" style={s.btnFull} />
        )}
      </View>
    </View>
  );
}

// ── 스텝 0 · 방향별 추천 ────────────────────────────────────────────────────────
// 방향을 한꺼번에 편다(칩으로 하나씩 거르지 않는다) — 고르기 전에 훑을 수 있어 탭이
// 한 번 줄어든다.
function RecommendStep({
  prevBrand, prevModel, prevUsedKm, prevPerKmLabel, groups, priceOf, prevSpec, onPick,
}: {
  prevBrand: string;
  prevModel: string;
  prevUsedKm?: number;
  prevPerKmLabel: string;
  groups: {axis: CompareAxis; items: AxisCandidate[]}[];
  priceOf: (c: AxisCandidate) => ShoePriceQuote | null;
  prevSpec: ShoeSpec;
  onPick: (c: AxisCandidate) => void;
}) {
  return (
    <View style={s.stepWrap}>
      <Text style={s.eyebrow}>지난 신발 · {prevModel} 대비</Text>
      <Text style={s.stepTitle}>바꾸고 싶은 대로{'\n'}골라보세요</Text>
      <Text style={s.refMeta}>
        {prevBrand} {prevModel}
        {typeof prevUsedKm === 'number' && prevUsedKm > 0 ? ` · 실사용 ${Math.round(prevUsedKm)}km` : ''}
        {prevPerKmLabel ? ` · ${prevPerKmLabel}` : ''}
      </Text>

      {groups.length === 0 ? (
        // 스펙이 아직 없어 축이 하나도 안 잡히는 경우 — 빈 화면 대신 이유를 말한다.
        <View style={s.emptyWrap} testID="next-shoe-empty">
          <Text style={s.emptyTitle}>아직 비교할 후보가 없어요</Text>
          <Text style={s.emptyBody}>
            같은 종류의 러닝화 중에 뚜렷하게 달라지는 모델을 못 찾았어요. 스펙 정보가 쌓이면
            여기에 후보가 나타나요.
          </Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.axis} style={s.group}>
            <View style={s.groupHead}>
              <Text style={s.groupName}>
                {axisLabelKo[g.axis]} <Text style={s.groupHint}>{AXIS_HINT[g.axis]}</Text>
              </Text>
              <Text style={s.groupCount}>{g.items.length}켤레</Text>
            </View>
            {g.items.map((c) => {
              const q = priceOf(c);
              const per = q ? expectedWonPerKm(q.priceKrw, c.spec.lifespanKm) : null;
              const deltas = compareAxes(prevSpec, c.spec).filter((d) => d.better);
              return (
                <Pressable
                  key={`${c.model.brand}|${c.model.model}`}
                  onPress={() => onPick(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.model.brand} ${c.model.model} 비교하기`}
                  testID={`next-shoe-cand-${c.model.model}`}
                  style={({pressed}) => [s.cand, pressed && s.pressed]}>
                  <View style={s.candLeft}>
                    <Text style={s.candBrand}>{c.model.brand.toUpperCase()}</Text>
                    <Text style={s.candName} numberOfLines={1}>{c.model.model}</Text>
                    <Text style={s.candDelta} numberOfLines={1}>
                      {deltas.map((d) => d.detailKo).join(' · ') || `권장 ${c.spec.lifespanKm}km`}
                    </Text>
                  </View>
                  <View style={s.candRight}>
                    {q ? (
                      <>
                        <Text style={s.candPrice}>{q.priceKrw.toLocaleString('ko-KR')}원</Text>
                        {!!per && <Text style={s.candPerKm}>{per.wonPerKm.toLocaleString('ko-KR')}원/km</Text>}
                      </>
                    ) : (
                      <Text style={s.candNoPrice}>공식 스토어에{'\n'}지금 없어요</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))
      )}

      <Text style={s.basis}>
        {SPEC_BASIS_KO} 1km당 비용은 권장 수명 기준 예상치예요.
      </Text>
    </View>
  );
}

// ── 스텝 1 · 나란히 비교 ────────────────────────────────────────────────────────
function CompareStep({
  prevSpec, picked, prevPerKm, quote,
}: {
  prevSpec: ShoeSpec;
  picked: AxisCandidate;
  prevPerKm: ReturnType<typeof actualWonPerKm>;
  quote: ShoePriceQuote | null;
}) {
  const next = picked.spec;
  const nextPerKm = quote ? expectedWonPerKm(quote.priceKrw, next.lifespanKm) : null;
  const verdict = wonPerKmVerdictKo(prevPerKm, nextPerKm);

  // 양쪽 다 값이 있는 축만 그린다(한쪽이라도 모르면 그 줄을 만들지 않는다).
  // 각 줄에 **그 값이 어디서 왔는지**를 함께 싣는다 — 뭉뚱그린 '브랜드 데이터' 라벨보다
  // 숫자로 된 근거가 강하고, 무엇보다 사실이다.
  const nextBasis = basisOf(next);
  const rows: {label: string; a: number; b: number; note: string; basis: string; ember?: boolean}[] = [];
  if (prevSpec.cushion !== undefined && next.cushion !== undefined) {
    rows.push({
      label: '쿠션', a: prevSpec.cushion, b: next.cushion,
      note: `${prevSpec.cushion}단계 → ${next.cushion}단계`,
      basis: nextBasis.cushion,
    });
  }
  if (prevSpec.weightG !== undefined && next.weightG !== undefined) {
    rows.push({
      label: '무게', a: prevSpec.weightG, b: next.weightG,
      note: `${prevSpec.weightG}g → ${next.weightG}g`,
      basis: nextBasis.weight,
    });
  }
  if (prevSpec.lifespanKm !== undefined && next.lifespanKm !== undefined) {
    rows.push({
      label: '권장 수명', a: prevSpec.lifespanKm, b: next.lifespanKm,
      note: `${prevSpec.lifespanKm}km → ${next.lifespanKm}km`,
      basis: '신발 종류 기준', ember: true,
    });
  }

  // 드롭이 크게 낮아지면 부상 위험을 먼저 말한다 — 미션(부상 없이)이 가격보다 앞선다.
  const dropWarn = dropWarningKo(prevSpec.dropMm, next.dropMm);

  return (
    <View style={s.stepWrap} testID="next-shoe-compare">
      <View style={s.vs}>
        <View style={s.vsCol}>
          <Text style={s.vsTag}>지난 신발</Text>
          <Text style={s.vsName} numberOfLines={2}>{prevSpec.model}</Text>
        </View>
        <Text style={s.vsMid}>vs</Text>
        <View style={s.vsCol}>
          <Text style={s.vsTag}>다음 신발</Text>
          <Text style={s.vsName} numberOfLines={2}>{next.model}</Text>
        </View>
      </View>

      {rows.map((r) => {
        const max = Math.max(r.a, r.b) || 1;
        return (
          <View key={r.label} style={s.attr}>
            <Text style={s.attrName}>{r.label}</Text>
            <View style={s.abars}>
              <View style={s.ab}>
                <View style={[s.abFillL, {width: `${Math.round((r.a / max) * 100)}%`}]} />
              </View>
              <View style={s.ab}>
                <View style={[
                  s.abFillR,
                  r.ember ? s.abEmber : null,
                  {width: `${Math.round((r.b / max) * 100)}%`},
                ]} />
              </View>
            </View>
            <Text style={s.attrVals}>{r.note}</Text>
            {!!r.basis && <Text style={s.attrBasis}>{r.basis}</Text>}
          </View>
        );
      })}

      {/* 부상 경고는 판정 카드보다 위에 둔다 — 돈보다 몸이 먼저다. */}
      {!!dropWarn && (
        <View style={s.warn} testID="next-shoe-drop-warning">
          <Ionicons name="alert-circle-outline" size={ri(ICON.inline)} color={WARN} />
          <Text style={s.warnText}>{dropWarn}</Text>
        </View>
      )}

      {/* 원/km 판정 — 양쪽 다 계산될 때만 카드를 만든다. */}
      {!!verdict && (
        <View style={s.verdict} testID="next-shoe-verdict">
          <Text style={s.verdictLab}>1km당 비용</Text>
          <Text style={s.verdictMain}>{verdict}</Text>
          <View style={s.verdictRows}>
            <View style={s.verdictCol}>
              <Text style={s.vrL} numberOfLines={1}>{prevSpec.model}</Text>
              <Text style={s.vrN}>{prevPerKm!.wonPerKm.toLocaleString('ko-KR')}원</Text>
              <Text style={s.vrB}>{wonPerKmLabelKo(prevPerKm).split(' · ')[1] || ''}</Text>
            </View>
            <View style={s.verdictCol}>
              <Text style={s.vrL} numberOfLines={1}>{next.model}</Text>
              <Text style={s.vrN}>{nextPerKm!.wonPerKm.toLocaleString('ko-KR')}원</Text>
              <Text style={s.vrB}>{wonPerKmLabelKo(nextPerKm).split(' · ')[1] || ''}</Text>
            </View>
          </View>
        </View>
      )}

      <Text style={s.basis}>
        {prevPerKm
          ? '지난 신발은 실제로 낸 값 ÷ 실제로 달린 거리라 실측이에요. 다음 신발은 아직 안 달렸으니 권장 수명으로 계산한 예상치예요.'
          : '지난 신발 구매가를 넣으면 1km당 비용을 비교해 드려요.'}
      </Text>
    </View>
  );
}

// ── 스텝 2 · 구매처 ────────────────────────────────────────────────────────────
function StoreStep({picked, quote}: {picked: AxisCandidate; quote: ShoePriceQuote | null}) {
  const links = buildShopLinks({brand: picked.model.brand, model: picked.model.model});
  const channels = visibleChannels();
  // 외부 앱/브라우저를 못 열어도 화면이 죽지 않게 조용히 삼킨다.
  const open = (url: string) => { Linking.openURL(url).catch(() => {}); };

  return (
    <View style={s.stepWrap} testID="next-shoe-stores">
      <Text style={s.eyebrow}>{picked.model.brand} {picked.model.model}</Text>
      <Text style={s.stepTitle}>어디서 살까요?</Text>
      <Text style={s.lede}>정품이 확인된 곳만 보여줘요.</Text>

      {/* 공식 스토어에서 가격이 확인된 경우에만 금액을 띄운다(출처·시각 함께). */}
      {!!quote && (
        <View style={s.store}>
          <View style={s.storeLeft}>
            <Text style={s.storeName} numberOfLines={1}>{quote.mallName}</Text>
            <Text style={[s.badge, s.badgeOfficial]}>{tierLabelKo.official}</Text>
          </View>
          <View>
            <Text style={s.storePrice}>{quote.priceKrw.toLocaleString('ko-KR')}원</Text>
            <Text style={s.storeTime}>{checkedAtLabel(quote.checkedAtMs)} 기준</Text>
          </View>
        </View>
      )}

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
  eyebrow: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600'},
  stepTitle: {
    color: T1, fontFamily: DISPLAY, fontSize: TYPE.title1.fontSize,
    fontWeight: '700', letterSpacing: -0.4, lineHeight: rf(30),
  },
  lede: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize},
  refMeta: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginBottom: rv(6)},

  group: {marginTop: rv(14)},
  groupHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: rv(8), paddingHorizontal: rs(2),
  },
  groupName: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2},
  groupHint: {color: T3, fontWeight: '500', fontSize: TYPE.caption.fontSize},
  groupCount: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize},

  cand: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: GLASS.fill, borderRadius: RADIUS.md, borderCurve: 'continuous',
    paddingHorizontal: SPACE.md, paddingVertical: rv(12), marginBottom: rv(7), gap: SPACE.sm,
  },
  candLeft: {flex: 1, minWidth: 0},
  candBrand: {color: T3, fontFamily: FONT, fontSize: rf(10), fontWeight: '600', letterSpacing: 1.2},
  candName: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2, marginTop: rv(2)},
  candDelta: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(3)},
  candRight: {alignItems: 'flex-end'},
  candPrice: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  candPerKm: {color: RING_ACCENT, fontFamily: FONT, fontSize: TYPE.caption.fontSize, marginTop: rv(2)},
  candNoPrice: {color: T3, fontFamily: FONT, fontSize: rf(10), textAlign: 'right', lineHeight: rf(14)},

  emptyWrap: {paddingVertical: rv(28), gap: rv(8)},
  emptyTitle: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  emptyBody: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(21)},

  basis: {color: T3, fontFamily: FONT, fontSize: rf(11), lineHeight: rf(17), marginTop: rv(16)},
  basisStrong: {color: T2, fontWeight: '600'},

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
  verdictLab: {color: T3, fontFamily: FONT, fontSize: rf(10), fontWeight: '600', letterSpacing: 0.8},
  verdictMain: {color: GOOD, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '800', letterSpacing: -0.4, marginTop: rv(6)},
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

export default NextShoeScreen;
