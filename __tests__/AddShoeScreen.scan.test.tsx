/**
 * 영수증 스캔 진입점 계약 (2026-07-27, 앞당김 #17 배선).
 *
 * 원칙 두 가지를 고정한다:
 *   1) 인식기가 없는 빌드에서는 **버튼 자체를 렌더하지 않는다** — 눌러도 안 되는 버튼은
 *      고장으로 읽힌다.
 *   2) 결과가 무엇이든 **말한다**. 못 찾았는데 조용하면 사용자는 앱이 멈춘 줄 안다.
 *      그리고 실패해도 손으로 등록하는 길은 그대로 열려 있어야 한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

jest.mock('../lib/toast', () => ({showToast: jest.fn(() => 1)}));
jest.mock('../lib/photo', () => ({
  capturePhotoWithPermission: jest.fn(async () => ({ok: true, uri: 'file:///r.jpg'})),
}));
jest.mock('../lib/dialog', () => ({showPermissionSettingsDialog: jest.fn(() => 1)}));
jest.mock('../lib/ocrNative', () => ({nativeRecognizer: {recognize: jest.fn(async () => '')}}));

import AddShoeScreen from '../AddShoeScreen.rn';
import {showToast} from '../lib/toast';
import {capturePhotoWithPermission} from '../lib/photo';
import {showPermissionSettingsDialog} from '../lib/dialog';
import {nativeRecognizer} from '../lib/ocrNative';

const rec = nativeRecognizer as {recognize: jest.Mock};

function render() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<AddShoeScreen onClose={() => {}} onSave={() => {}} />);
  });
  return r;
}
const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n: any) => n.props?.testID === id);

beforeEach(() => {
  (showToast as jest.Mock).mockClear();
  (capturePhotoWithPermission as jest.Mock).mockClear();
  (capturePhotoWithPermission as jest.Mock).mockResolvedValue({ok: true, uri: 'file:///r.jpg'});
  (showPermissionSettingsDialog as jest.Mock).mockClear();
  rec.recognize.mockReset();
});

test('인식기가 있으면 스캔 진입점을 보여준다', () => {
  expect(byId(render(), 'add-shoe-scan').length).toBeGreaterThan(0);
});

test('영수증에서 러닝화를 찾으면 선택 필드를 채우고 알린다', async () => {
  rec.recognize.mockResolvedValue('NIKE Pegasus 41\n2026-07-27\n합계 159,000원');
  const r = render();
  await act(async () => {
    byId(r, 'add-shoe-scan')[0].props.onPress();
  });
  expect(capturePhotoWithPermission).toHaveBeenCalled();
  const msg = (showToast as jest.Mock).mock.calls[0][0].message;
  expect(msg).toContain('41');
  expect(msg).toContain('채웠어요');
});

test('못 찾으면 조용히 넘어가지 않고 직접 고르라고 말한다', async () => {
  rec.recognize.mockResolvedValue('무명 러닝화 XYZ-999');
  const r = render();
  await act(async () => {
    byId(r, 'add-shoe-scan')[0].props.onPress();
  });
  expect((showToast as jest.Mock).mock.calls[0][0].message).toContain('직접 골라주세요');
});

test('인식이 터져도 화면이 죽지 않고 안내한다', async () => {
  rec.recognize.mockRejectedValue(new Error('ml kit down'));
  const r = render();
  await act(async () => {
    byId(r, 'add-shoe-scan')[0].props.onPress();
  });
  // extractShoeFromImage 가 실패를 삼켜 빈 결과를 주므로 '직접 골라주세요'로 수렴한다.
  expect((showToast as jest.Mock).mock.calls[0][0].message).toContain('직접');
});


// QA 감사 Q-7: 카메라 권한을 거부한 사람에겐 **눌러도 아무 일 없는 버튼**이었다.
// 취소와 거부를 구분해, 거부일 때만 설정으로 안내한다.
test('카메라 권한 거부는 조용히 넘기지 않고 설정으로 안내한다', async () => {
  (capturePhotoWithPermission as jest.Mock).mockResolvedValue({ok: false, reason: 'denied'});
  const r = render();
  await act(async () => {
    byId(r, 'add-shoe-scan')[0].props.onPress();
  });
  expect(showPermissionSettingsDialog).toHaveBeenCalled();
  expect(String((showPermissionSettingsDialog as jest.Mock).mock.calls[0][0])).toContain('카메라');
});

test('사용자가 촬영을 취소한 것은 조용히 넘어간다 — 잘못한 게 없다', async () => {
  (capturePhotoWithPermission as jest.Mock).mockResolvedValue({ok: false, reason: 'cancelled'});
  const r = render();
  await act(async () => {
    byId(r, 'add-shoe-scan')[0].props.onPress();
  });
  expect(showPermissionSettingsDialog).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});
