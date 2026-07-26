/**
 * OCR 네이티브가 없는 빌드에서는 스캔 진입점을 렌더하지 않는다 (2026-07-27, #17).
 *
 * 눌러도 아무 일이 없는 버튼은 기능이 아니라 고장이다. 파일을 따로 둔 이유는 모듈 목이
 * 파일 단위로 고정되기 때문 — 한 파일 안에서 같은 모듈을 두 값으로 흉내 내면 테스트가
 * 서로의 상태에 얽힌다(실제로 그렇게 짰다가 실패했다).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

jest.mock('../lib/ocrNative', () => ({nativeRecognizer: null}));

import AddShoeScreen from '../AddShoeScreen.rn';

test('인식기가 없으면 스캔 버튼을 두지 않는다', () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<AddShoeScreen onClose={() => {}} onSave={() => {}} />);
  });
  expect(r.root.findAll((n: any) => n.props?.testID === 'add-shoe-scan')).toHaveLength(0);
  // 그래도 손으로 고르는 길은 그대로 있어야 한다.
  expect(r.root.findAll((n: any) => n.props?.testID === 'add-shoe-select').length).toBeGreaterThan(0);
});
