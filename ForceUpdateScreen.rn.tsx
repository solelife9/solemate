// ============================================================================
// ForceUpdateScreen.rn.tsx — 필수 업데이트 게이트 (AUDIT 2 I-3)
// 원격 설정(config/app)의 minSupportedVersion 미만일 때만 뜬다. 사용자가 닫을 수 없는
// 화면이므로 **왜 막혔는지 + 무엇을 하면 되는지**만 남기고 전부 덜어냈다(뒤로가기도,
// '나중에'도 없다 — 있으면 게이트가 아니다). 순수 프레젠테이션.
//
// 스토어 링크는 원격 설정이 준다(storeUrlIos/storeUrlAndroid). 아직 앱스토어 ID 가 없어
// 링크가 비어 있을 수 있는데, 그때는 버튼 대신 안내 문구만 보여준다 — 눌러도 아무 일이
// 없는 버튼을 두는 것보다 낫다.
// ============================================================================
import React from 'react';
import {View, StyleSheet, Platform, Linking} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {rf, rs, ri, rv} from './lib/responsive';
import {BG, ACCENT, T1, T2, T3, FONT, RADIUS, GUTTER, GLASS, TYPE, withAlpha} from './theme';
import {Button, GlassEdge} from './primitives';
import type {RemoteAppConfig} from './lib/forceUpdate';

/** 이 기기에 맞는 스토어 링크(없으면 null). 플랫폼 분기를 화면 밖에서 테스트하려고 뺐다. */
export function storeUrlFor(
  config: RemoteAppConfig | null,
  os: string = Platform.OS,
): string | null {
  if (!config) return null;
  return os === 'ios' ? config.storeUrlIos : config.storeUrlAndroid;
}

export default function ForceUpdateScreen({config}: {config: RemoteAppConfig | null}) {
  const insets = useSafeAreaInsets();
  const url = storeUrlFor(config);
  const open = () => {
    if (!url) return;
    Linking.openURL(url).catch(() => {
      /* 스토어 앱 부재 등 — 화면은 그대로 둔다(안내 문구가 남는다) */
    });
  };
  return (
    <View
      style={[s.screen, {paddingTop: insets.top + rv(8), paddingBottom: insets.bottom + rv(12)}]}
      testID="force-update-screen">
      <View style={s.body}>
        <View style={s.hero}>
          <Ionicons name="arrow-up-circle" size={ri(40)} color={ACCENT} />
        </View>
        <Text style={s.title}>업데이트가 필요해요</Text>
        <Text style={s.lead}>
          {config?.message ??
            '기록을 안전하게 지키기 위한 중요한 수정이 있어요. 최신 버전으로 업데이트한 뒤 이어서 사용해 주세요.'}
        </Text>

        <View style={s.card}>
          <GlassEdge glints={false} radius={RADIUS.lg} />
          <Text style={s.cardTitle}>기록은 그대로 있어요</Text>
          <Text style={s.cardBody}>
            이 기기에 저장된 러닝과 신발은 사라지지 않아요. 업데이트하면 그대로 이어집니다.
          </Text>
        </View>
      </View>

      <View style={s.footer}>
        {url ? (
          <Button label="업데이트하러 가기" size="hero" onPress={open} testID="force-update-cta" />
        ) : (
          // 링크가 없을 때(스토어 ID 미확정 등) — 누르면 아무 일도 없는 버튼 대신 안내만.
          <Text style={s.fallback} testID="force-update-fallback">
            {Platform.OS === 'ios' ? 'App Store' : 'Play 스토어'}에서 Keego 를 검색해 업데이트해 주세요.
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG, paddingHorizontal: GUTTER},
  body: {flex: 1, justifyContent: 'center'},
  hero: {
    alignSelf: 'center',
    width: rs(80),
    height: rs(80),
    borderRadius: rs(40),
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(ACCENT, 0.12),
    marginBottom: rv(18),
  },
  title: {
    color: T1,
    fontFamily: FONT,
    fontSize: TYPE.title.fontSize,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  lead: {
    color: T3,
    fontFamily: FONT,
    fontSize: TYPE.body.fontSize,
    lineHeight: rf(20),
    textAlign: 'center',
    marginTop: rv(8),
    marginBottom: rv(22),
  },
  card: {
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingHorizontal: rs(16),
    paddingVertical: rv(16),
  },
  cardTitle: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2},
  cardBody: {
    color: T2,
    fontFamily: FONT,
    fontSize: TYPE.label.fontSize,
    lineHeight: rf(18),
    marginTop: rv(4),
    fontWeight: '400',
  },
  footer: {gap: rv(6)},
  fallback: {
    color: T2,
    fontFamily: FONT,
    fontSize: TYPE.body.fontSize,
    lineHeight: rf(20),
    textAlign: 'center',
    paddingVertical: rv(14),
    paddingHorizontal: rs(8),
  },
});
