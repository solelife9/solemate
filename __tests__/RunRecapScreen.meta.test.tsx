/**
 * 리캡 '오늘의 한 컷 + 한 줄 메모'(2026-07-05) 계약:
 *  1) runId+onSaveMeta 가 있으면 메타 섹션(사진 추가·메모 입력)이 렌더된다.
 *  2) 메모 입력 후 blur → onSaveMeta(runId, {memo}) 1회(같은 값 재커밋 안 함).
 *  3) 완료(닫기)가 메모 커밋을 거친다 — 입력만 하고 닫아도 유실 없음.
 *  4) runId 없으면 섹션 자체가 없다(비정상 경로 graceful).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunRecapScreen from '../RunRecapScreen.rn';

jest.mock('../lib/photo', () => ({pickPhotoWithPermission: jest.fn(async () => ({ok: true, uri: 'file:///p.jpg'})), pickShoePhoto: jest.fn(async () => ({uri: 'file:///p.jpg'}))}));

const base = {km: 5, durationS: 1500};
async function render(props: any) {
  let r: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { r = ReactTestRenderer.create(<RunRecapScreen {...base} {...props} />); });
  return r!.root;
}
const byId = (root: any, id: string) => root.findAll((n: any) => n.props?.testID === id);

test('runId+onSaveMeta → 메타 섹션 렌더, 없으면 미렌더', async () => {
  const withMeta = await render({runId: 'r1', onSaveMeta: jest.fn()});
  expect(byId(withMeta, 'recap-meta').length).toBeGreaterThanOrEqual(1);
  expect(byId(withMeta, 'recap-add-photo').length).toBeGreaterThanOrEqual(1);
  const without = await render({});
  expect(byId(without, 'recap-meta').length).toBe(0);
});

test('메모 blur → onSaveMeta 1회, 같은 값 재커밋 없음, 완료 버튼도 커밋 경유', async () => {
  const onSaveMeta = jest.fn();
  const onClose = jest.fn();
  const root = await render({runId: 'r1', onSaveMeta, onClose});
  const input = byId(root, 'recap-memo-input')[0];
  await act(async () => { input.props.onChangeText('첫 새벽 러닝'); });
  await act(async () => { input.props.onBlur(); });
  expect(onSaveMeta).toHaveBeenCalledWith('r1', {memo: '첫 새벽 러닝'});
  await act(async () => { input.props.onBlur(); }); // 같은 값 — 재커밋 안 함
  expect(onSaveMeta).toHaveBeenCalledTimes(1);
  await act(async () => { input.props.onChangeText('첫 새벽 러닝, 좋았다'); });
  const done = byId(root, 'recap-done')[0];
  await act(async () => { done.props.onPress(); }); // 닫기 = 커밋 + onClose
  expect(onSaveMeta).toHaveBeenCalledWith('r1', {memo: '첫 새벽 러닝, 좋았다'});
  expect(onClose).toHaveBeenCalled();
});

test('사진 추가 → onSaveMeta(photoUri) 즉시 저장', async () => {
  const onSaveMeta = jest.fn();
  const root = await render({runId: 'r1', onSaveMeta});
  await act(async () => { byId(root, 'recap-add-photo')[0].props.onPress(); });
  expect(onSaveMeta).toHaveBeenCalledWith('r1', {photoUri: 'file:///p.jpg'});
});
