/**
 * ProfileScreen 데이터 백업/복원 행동 테스트.
 *
 * 관찰 가능한 결과(test_critic 요건)를 검증한다:
 *   1) 내보내기 — '데이터 내보내기'를 누르면 RN Share.share가 호출되고, 전달된
 *      message가 serializeBackup 결과(version·신발/런/설정 포함 JSON)와 일치한다.
 *   2) 가져오기 성공 — 유효한 백업 JSON을 입력하고 가져오기를 누르면 onImport가
 *      파싱된 BackupV1로 호출되고, 성공 안내가 화면에 노출된다.
 *   3) 가져오기 실패 — 손상된 JSON이면 onImport가 호출되지 않고(기존 데이터 보존)
 *      에러 안내만 노출된다.
 *
 * Share는 네이티브 모듈이므로 jest.spyOn으로 가로채 인자만 검사한다(네이티브 0).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Share} from 'react-native';
import ProfileScreen from '../ProfileScreen.rn';
import {serializeBackup, parseBackup} from '../lib/backup';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(props: any) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<ProfileScreen {...props} />);
  });
  return renderer.root;
}

function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.find(
    (n: any) =>
      n && n.props && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
}

const BACKUP_DATA = {
  shoes: [{id: '1', brand: 'Nike', model: 'Pegasus 41', total_km: 120}],
  runs: [{id: '10', shoe_id: '1', km: 5.2, run_date: '2026-06-01'}],
  settings: {unit: 'km', goal_weekly_km: 30, alerts: {enabled: true, thresholdPct: 90}},
};

describe('ProfileScreen 데이터 내보내기', () => {
  let shareSpy: jest.SpyInstance;
  beforeEach(() => {
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'} as any);
  });
  afterEach(() => shareSpy.mockRestore());

  test('내보내기를 누르면 Share.share가 직렬화된 백업 JSON으로 호출된다', () => {
    const root = render({backupData: BACKUP_DATA});
    act(() => {
      pressByLabel(root, '데이터 내보내기').props.onPress();
    });

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const msg: string = shareSpy.mock.calls[0][0].message;
    // 직렬화 결과는 parseBackup으로 되읽혀 같은 데이터로 라운드트립된다.
    const parsed = parseBackup(msg);
    expect(parsed.version).toBeGreaterThanOrEqual(1);
    expect(parsed.shoes).toEqual(BACKUP_DATA.shoes);
    expect(parsed.runs).toEqual(BACKUP_DATA.runs);
    expect(parsed.settings).toEqual(BACKUP_DATA.settings);
  });

  test('공유가 reject돼도 예외를 표면화하지 않는다', () => {
    shareSpy.mockRejectedValueOnce(new Error('user dismissed'));
    const root = render({backupData: BACKUP_DATA});
    expect(() =>
      act(() => {
        pressByLabel(root, '데이터 내보내기').props.onPress();
      }),
    ).not.toThrow();
  });
});

describe('ProfileScreen 데이터 가져오기', () => {
  function openImport(root: ReactTestRenderer.ReactTestInstance) {
    act(() => {
      pressByLabel(root, '데이터 가져오기').props.onPress();
    });
  }
  function typeImport(root: ReactTestRenderer.ReactTestInstance, text: string) {
    const input = root.find((n: any) => n.props?.testID === 'import-input');
    act(() => {
      input.props.onChangeText(text);
    });
  }

  test('유효한 백업을 가져오면 onImport가 파싱된 데이터로 호출되고 성공 안내가 뜬다', () => {
    const onImport = jest.fn();
    const root = render({onImport});
    openImport(root);
    typeImport(root, serializeBackup(BACKUP_DATA, '2026-06-03T00:00:00.000Z'));
    act(() => {
      pressByLabel(root, '가져오기 실행').props.onPress();
    });

    expect(onImport).toHaveBeenCalledTimes(1);
    const arg = onImport.mock.calls[0][0];
    expect(arg.shoes).toEqual(BACKUP_DATA.shoes);
    expect(arg.runs).toEqual(BACKUP_DATA.runs);
    expect(arg.settings).toEqual(BACKUP_DATA.settings);

    const msg = textOf(root.find((n: any) => n.props?.testID === 'import-msg'));
    expect(msg).toContain('가져오기 완료');
  });

  test('손상된 JSON이면 onImport를 부르지 않고 에러 안내만 노출한다(기존 데이터 보존)', () => {
    const onImport = jest.fn();
    const root = render({onImport});
    openImport(root);
    typeImport(root, '이건JSON아님{{');
    act(() => {
      pressByLabel(root, '가져오기 실행').props.onPress();
    });

    expect(onImport).not.toHaveBeenCalled();
    const msg = textOf(root.find((n: any) => n.props?.testID === 'import-msg'));
    expect(msg.length).toBeGreaterThan(0);
  });

  test('미지원 버전 백업도 onImport 미호출 + 에러 안내', () => {
    const onImport = jest.fn();
    const root = render({onImport});
    openImport(root);
    typeImport(root, '{"version":999,"shoes":[],"runs":[],"settings":{}}');
    act(() => {
      pressByLabel(root, '가져오기 실행').props.onPress();
    });
    expect(onImport).not.toHaveBeenCalled();
    expect(textOf(root.find((n: any) => n.props?.testID === 'import-msg')).length).toBeGreaterThan(0);
  });
});
