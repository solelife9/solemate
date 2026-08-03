// ============================================================================
// RunnerProfileScreen.rn.tsx — 남의 공개 프로필 (소셜 2단계)
// ----------------------------------------------------------------------------
// 랭킹에서 사람을 누르면 열린다. "1위는 뭘 신나"가 keego 랭킹의 차별점인데, 목록은
// 신발 이름 한 줄까지밖에 못 담는다. 그 한 줄을 눌러 **그 사람의 러닝화 전부와
// 스펙**까지 보게 하는 게 이 화면이다.
//
// ── 지키는 것 ────────────────────────────────────────────────────────────────
//  · **읽기는 누를 때 한 건.** 목록을 그리며 미리 당겨오면 100명이면 100읽기다
//    (AUDIT 2 에서 읽기를 43배 줄여 놓고 여기서 되돌릴 이유가 없다).
//  · **"비공개"와 "지금 안 됨"을 구분해 말한다.** 전자는 그 사람의 선택이고 정상이며,
//    후자는 우리 쪽 문제다. 같은 말로 뭉개면 사용자가 남을 오해한다.
//  · **카드는 내 것과 같은 컴포넌트**(SocialProfileCard). 남에게 보이는 내 모습과
//    내가 보는 남의 모습이 같은 문법이어야 "나도 저렇게 보이는구나"가 성립한다.
//
// ── 화면 문법 ────────────────────────────────────────────────────────────────
// 프리미엄 앱들의 프로필 상세는 대개 **닫기 + 이름 + 본문** 셋뿐이다. 여기도 그렇게
// 둔다 — 팔로우도 좋아요도 없으므로 액션 바가 필요 없고, 없는 걸 만들면 빈 껍데기가
// 하나 늘 뿐이다. 순위·점수는 이미 목록에서 봤으므로 여기서 되풀이하지 않는다.
// ============================================================================
import React, {useEffect, useRef, useState} from 'react';
import {View, ScrollView, Pressable, StyleSheet, ActivityIndicator} from 'react-native';
import {Text} from './lib/text';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ri, rs, rv} from './lib/responsive';
import {BG, CARD, T1, T2, T3, SEP, FONT, RADIUS, GUTTER, TYPE, ICON, SPACE} from './theme';
import {GlassEdge} from './primitives';
import SocialProfileCard from './SocialProfileCard';
import {fetchPublicProfile, type ProfileFetch, type ProfilePort} from './lib/publicProfile';

export default function RunnerProfileScreen({
  uid,
  fallbackName,
  port,
  onClose,
}: {
  uid: string;
  /** 랭킹 엔트리가 이미 들고 있던 이름. 읽는 동안·못 읽었을 때 이 이름으로 말한다. */
  fallbackName?: string;
  port: ProfilePort;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [res, setRes] = useState<ProfileFetch | null>(null);

  /**
   * 포트는 **데이터가 아니라 서비스**다. 의존성에 두면 호출부가 객체를 새로 만들 때마다
   * 다시 읽는다 — 읽기 횟수가 남의 렌더 습관에 좌우된다. ref 로 들고 uid 만 본다.
   */
  const portRef = useRef(port);
  portRef.current = port;

  useEffect(() => {
    let alive = true;
    setRes(null);
    fetchPublicProfile(portRef.current, uid).then(r => { if (alive) setRes(r); });
    return () => { alive = false; };
  }, [uid]);

  const name = res?.state === 'ok' ? res.profile.nickname : (fallbackName || '러너');

  return (
    <View style={[s.screen, {paddingTop: insets.top + rv(8)}]} testID="runner-profile-screen">
      <View style={s.bar}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="닫기"
          testID="runner-profile-close"
          style={({pressed}) => [s.iconBtn, pressed && s.pressed]}>
          <Ionicons name="chevron-back" size={ri(ICON.action)} color={T2} />
        </Pressable>
        <Text style={s.title} numberOfLines={1}>{name}</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingBottom: insets.bottom + rv(28),
          gap: SPACE.md,
        }}>
        {res === null && (
          <View style={s.center} testID="runner-profile-loading">
            <ActivityIndicator color={T3} />
          </View>
        )}

        {res?.state === 'ok' && <SocialProfileCard profile={res.profile} />}

        {/* 비공개 — 그 사람의 선택이고 정상이다. 사과하거나 재시도를 권하지 않는다. */}
        {res?.state === 'private' && (
          <Notice
            testID="runner-profile-private"
            icon="lock-closed-outline"
            title="프로필을 공개하지 않았어요"
            body={`${name} 님은 러닝화와 기록을 비공개로 두었어요.\n순위는 그대로 집계돼요.`}
          />
        )}

        {/* 못 읽음 — 우리 쪽 문제다. 그래서 다시 시도를 권한다. */}
        {res?.state === 'error' && (
          <Notice
            testID="runner-profile-error"
            icon="cloud-offline-outline"
            title="지금은 불러오지 못했어요"
            body={'연결을 확인하고 다시 열어보세요.'}
          />
        )}
      </ScrollView>
    </View>
  );
}

/** 안내 카드 — 비공개·실패 둘 다 같은 골격으로(문구만 다르다). */
function Notice({icon, title, body, testID}: {
  icon: string; title: string; body: string; testID: string;
}) {
  return (
    <View style={s.notice} testID={testID}>
      <GlassEdge glints={false} radius={RADIUS.lg} />
      <Ionicons name={icon} size={ri(ICON.action)} color={T3} />
      <Text style={s.noticeTitle}>{title}</Text>
      <Text style={s.noticeBody}>{body}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  pressed: {opacity: 0.6},
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: GUTTER, paddingBottom: rv(12), gap: rs(8),
  },
  iconBtn: {width: rs(32), height: rs(32), alignItems: 'center', justifyContent: 'center'},
  title: {
    flex: 1, textAlign: 'center', fontFamily: FONT, ...TYPE.title1, color: T1,
  },
  center: {paddingTop: rv(60), alignItems: 'center'},
  notice: {
    backgroundColor: CARD, borderRadius: RADIUS.lg, padding: rs(20), marginTop: rv(24),
    alignItems: 'center', gap: rv(8),
    borderWidth: StyleSheet.hairlineWidth, borderColor: SEP,
  },
  noticeTitle: {fontFamily: FONT, ...TYPE.body, fontWeight: '700', color: T1, marginTop: rv(4)},
  noticeBody: {
    fontFamily: FONT, ...TYPE.caption, color: T3, textAlign: 'center', lineHeight: rv(20),
  },
});
