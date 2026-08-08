/**
 * ProfileScreen.rn.tsx — 프로필 정체성(이름·사진) 행동 테스트.
 *
 * 관찰 가능한 동작 검증:
 *  1) 이름을 탭 → 인라인 TextInput → 저장하면 onChangeName 이 새 이름으로 호출된다.
 *  2) 아바타를 탭하면 onPickPhoto 가 호출된다(사진 변경 진입).
 *  3) profilePhotoUri 가 있으면 아바타에 Image 가 렌더된다(아이콘 폴백 대신).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ProfileScreen, {Profile} from '../ProfileScreen.rn';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n && n.props && n.props.testID === id);
// ⚠️ **래퍼는 세지 않는다**(2026-08-08). 눌림 피드백 스윕으로 화면의 Pressable 이
// `primitives.Tap` 으로 바뀌었는데, Tap 은 Pressable 을 감싸는 합성 컴포넌트라 같은
// props 를 가진 인스턴스가 **둘**(Tap + 내부 Pressable) 잡힌다. 개수를 세는 단언이
// 그대로면 "버튼이 두 개"라고 잘못 읽는다 — 화면은 하나도 안 바뀌었는데.
//
// 호스트만 세는 방법은 쓸 수 없다: RN 의 Pressable 은 호스트 View 에 onPress 를 넘기지
// 않고 responder 핸들러로 바꿔 단다. 그래서 **래퍼 이름으로 제외**한다.
const byA11y = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  root.findAll(
    (n: any) =>
      n && n.props &&
      !(typeof n.type === 'function' && n.type.name === 'Tap') &&
      n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );

const PROFILE: Profile = {
  name: '러너', since: '2026년 5월부터', totalKm: 120, totalRuns: 12, totalTime: '8', rankTier: 'silver',
};

describe('ProfileScreen identity — 이름·사진', () => {
  test('이름을 탭→편집→저장하면 onChangeName 이 새 이름으로 호출된다', () => {
    const onChangeName = jest.fn();
    const root = render(<ProfileScreen profile={PROFILE} onChangeName={onChangeName} />).root;

    // 편집 진입
    act(() => { byTestID(root, 'profile-name')[0].props.onPress(); });
    const input = byTestID(root, 'profile-name-input');
    expect(input.length).toBeGreaterThanOrEqual(1);

    // 입력 변경 + 저장
    act(() => { input[0].props.onChangeText('김러너'); });
    act(() => { byA11y(root, '이름 저장')[0].props.onPress(); });

    expect(onChangeName).toHaveBeenCalledWith('김러너');
  });

  test('아바타를 탭하면 onPickPhoto 가 호출된다', () => {
    const onPickPhoto = jest.fn();
    const root = render(<ProfileScreen profile={PROFILE} onPickPhoto={onPickPhoto} />).root;
    act(() => { byTestID(root, 'profile-avatar')[0].props.onPress(); });
    expect(onPickPhoto).toHaveBeenCalledTimes(1);
  });

  test('profilePhotoUri 가 있으면 아바타에 Image 가 렌더된다', () => {
    const root = render(
      <ProfileScreen profile={PROFILE} profilePhotoUri="file:///tmp/me.jpg" />,
    ).root;
    const img = byTestID(root, 'profile-avatar-img');
    expect(img.length).toBeGreaterThanOrEqual(1);
    expect(img[0].props.source).toEqual({uri: 'file:///tmp/me.jpg'});
  });

  test('사진이 없으면 Image 대신 아이콘 폴백', () => {
    const root = render(<ProfileScreen profile={PROFILE} />).root;
    expect(byTestID(root, 'profile-avatar-img').length).toBe(0);
  });
});

describe('ProfileScreen settings shortcut — 헤더 설정 버튼', () => {
  test('헤더 설정 버튼(⚙️)이 설정 뷰를 여는 어포던스로 연결돼 있다', () => {
    const root = render(<ProfileScreen profile={PROFILE} />).root;
    expect(byA11y(root, '설정 열기').length).toBe(1);
  });
});
