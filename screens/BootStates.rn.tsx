// ─── screens/BootStates.rn.tsx — 부팅 상태 화면(스켈레톤 · 재시도 카드) ──────────
// App.tsx 가 데이터를 손에 넣기 전/실패했을 때만 뜨는 두 화면. 앱 상태를 하나도 읽지
// 않는 표시 전용이라(입력은 onRetry 하나) App 본체 밖에 산다.
// 카피는 keep-going 톤 — 실패를 '끝'이 아니라 '잠깐 멈춤'으로 프레이밍해 재시도를 부른다.

import React from 'react';
import {View, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Text} from '../lib/text';
import {rf, rs, ri, rv} from '../lib/responsive';
import {BG, CARD, T1, T3, SEP, WARN, RADIUS, GUTTER, ICON, FONT as FP} from '../theme';
import {Button, Skeleton} from '../primitives';

/** keep-going 톤(로딩): 스켈레톤이 비어 보이지 않도록 '곧 이어 달린다'는 안내를 얹는다. */
export const KEEP_GOING_LOADING = '기록을 불러오는 중이에요. 곧 다시 달릴 수 있어요.';
/** keep-going 톤: 실패를 '끝'이 아니라 '잠깐 멈춤'으로 프레이밍해 재시도를 유도한다. */
export const KEEP_GOING_RETRY = '잠깐 숨 고르는 중이에요. 다시 시도하면 계속 달릴 수 있어요.';

// ─── 콜드 백엔드 스켈레톤(audit#9/#10) ──────────────────────────────────────
// 스피너가 아니라 스켈레톤: 실제 콘텐츠(히어로 카드 + 주간 통계 3칸 + 신발 줄)의
// 자리표시 형태를 회색 블록으로 미리 보여줘 '레이아웃이 곧 채워진다'는 신호를 준다.
// testID로 통합테스트가 로딩 상태를 식별한다. 고스트 블록은 primitives.Skeleton
// 공용 소비(로컬 SkelBlock 삭제 — 표면 CARD_HI 동일이라 시각 불변, 2026-07-25).
export function BootSkeleton(){
  const insets=useSafeAreaInsets();
  return (
    <View testID="boot-skeleton" style={[boot.screen,{paddingTop:insets.top+12}]}>
      <View style={{height: rs(24)}}/>
      <Text testID="boot-loading-copy" style={boot.loadingCaption}>{KEEP_GOING_LOADING}</Text>
      <View style={{height: rs(14)}}/>
      <Skeleton h={14} w={120}/>
      <View style={{height: rs(18)}}/>
      {/* 히어로 카드 자리 */}
      <Skeleton h={150} radius={RADIUS.lg}/>
      <View style={{height: rs(16)}}/>
      {/* 주간 통계 3칸 */}
      <View style={boot.statsRow}>
        <Skeleton h={64} w={'31%'}/>
        <Skeleton h={64} w={'31%'}/>
        <Skeleton h={64} w={'31%'}/>
      </View>
      <View style={{height: rs(16)}}/>
      {/* 신발 줄 자리 */}
      <Skeleton h={84} radius={RADIUS.md}/>
      <View style={{height: rs(10)}}/>
      <Skeleton h={84} radius={RADIUS.md}/>
    </View>
  );
}

// ─── 콜드 백엔드 에러: 재시도 카드(keep-going 톤, audit#9/#10) ───────────────
// fetch 실패(콜드/오프라인)에만 뜬다 — 빈-신규(성공+빈배열)와 구분된다. 실패를
// '잠깐 멈춤'으로 프레이밍하고 '다시 시도' 버튼으로 initUser 재진입을 제공한다.
export function BootError({onRetry}:{onRetry:()=>void}){
  const insets=useSafeAreaInsets();
  return (
    <View testID="boot-error" style={[boot.screen,boot.centered,{paddingTop:insets.top+12}]}>
      <View style={boot.card}>
        <Ionicons name="cloud-offline-outline" size={ri(ICON.hero)} color={WARN}/>
        <Text style={boot.cardTitle}>연결이 잠시 끊겼어요</Text>
        <Text style={boot.cardBody}>{KEEP_GOING_RETRY}</Text>
        <Button testID="boot-retry" label="다시 시도" onPress={onRetry} icon="refresh" style={boot.retryBtn}/>
      </View>
    </View>
  );
}

const boot=StyleSheet.create({
  screen:{flex:1,backgroundColor:BG,paddingHorizontal:GUTTER,paddingTop: rv(12)},
  centered:{justifyContent:'center'},
  statsRow:{flexDirection:'row',gap: rv(10)},
  card:{backgroundColor:CARD,borderRadius:RADIUS.lg, borderCurve: 'continuous',padding: rs(24),alignItems:'center',gap: rv(12),
    borderWidth:StyleSheet.hairlineWidth,borderColor:SEP},
  cardTitle:{color:T1,fontFamily:FP,fontSize: rf(19),fontWeight:'700',marginTop: rv(4)},
  cardBody:{color:T3,fontFamily:FP,fontSize: rf(15),lineHeight: rf(20),textAlign:'center'},
  loadingCaption:{color:T3,fontFamily:FP,fontSize: rf(14),lineHeight: rf(19)},
  // 단일 Button 프리미티브로 라우팅 — 모서리/그라데이션/글로우는 Button 이 책임진다.
  // 여기선 레이아웃(가로 stretch + 위 여백)만 얹는다.
  retryBtn:{marginTop: rv(8),alignSelf:'stretch'},
});
