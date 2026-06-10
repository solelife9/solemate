// ============================================================================
// tests/acceptance/slice-3-design.test.ts  (@slice-3)
// ----------------------------------------------------------------------------
// Slice 3 = 전체 디자인 리뉴얼. spec Success Criteria #14(화면 하드코딩 색/폰트 0,
// theme 토큰만 사용) + 타이포 Pretendard 통일(Bebas 제거) + Keego 워드마크 교체를
// 정적 스캔으로 강제한다. 시각 완성도(#15)는 use-checkpoint에서 사람이 확인하므로
// 여기서는 측정 가능한 부분만 단언한다.
//
// 이 테스트는 Slice 3 착수 전에는 실패한다(TDD) — 화면에 raw hex/Bebas/SOLEMATE가
// 남아 있기 때문. Slice 3 잡들이 토큰화/통일/리브랜딩을 끝내면 통과한다.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { DISPLAY, FONT } from '../../theme';

const ROOT = path.resolve(__dirname, '..', '..');
const SCREENS = [
  'HomeScreen.rn.tsx',
  'ShoesScreen.rn.tsx',
  'RunScreen.rn.tsx',
  'ProfileScreen.rn.tsx',
  'HistoryScreen.rn.tsx',
  'AddShoeScreen.rn.tsx',
  'primitives.tsx',
];

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// 라인 주석(// ...) 제거 후 코드 라인만 스캔 — 설명 주석의 예시 색은 무시.
const codeOnly = (src: string) =>
  src
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n');

describe('@slice-3 디자인 토큰화 — 화면 하드코딩 색/폰트 0 (criteria #14)', () => {
  test.each(SCREENS)('%s 에 raw hex 색상 리터럴이 없다 (theme 토큰만 사용)', file => {
    const hex = codeOnly(read(file)).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex).toEqual([]);
  });

  test.each(SCREENS)('%s 에 인라인 fontFamily 문자열 리터럴이 없다 (theme FONT/DISPLAY만)', file => {
    // fontFamily: 'BebasNeue-Regular' / 'Pretendard...' 같은 하드코딩 금지.
    const inlineFamily = codeOnly(read(file)).match(/fontFamily:\s*['"][^'"]+['"]/g) ?? [];
    expect(inlineFamily).toEqual([]);
  });

  test.each(SCREENS)('%s 에 BebasNeue 잔존 없음 (Pretendard 통일)', file => {
    expect(codeOnly(read(file))).not.toMatch(/BebasNeue/);
  });
});

describe('@slice-3 타이포 — Pretendard 전면 통일(디자인 마무리)', () => {
  test('본문·디스플레이(큰 숫자·워드마크) 모두 Pretendard로 통일', () => {
    // 화면은 raw fontFamily 문자열 없이 토큰(FONT/DISPLAY)만 쓴다(위 스캔이 보장).
    // 디자인 마무리 핸드오프 정합 + 사용자 요청으로 Barlow 디스플레이를 철회, 전부 Pretendard.
    expect(FONT).toBe('PretendardVariable');
    expect(DISPLAY).toBe('PretendardVariable');
    expect(DISPLAY).toBe(FONT);
  });
});

describe('@slice-3 Keego 인앱 리브랜딩 (구 워드마크 제거)', () => {
  test.each(SCREENS)('%s 에 구 워드마크 SOLEMATE/SOLELIFE 리터럴이 없다', file => {
    expect(read(file)).not.toMatch(/SOLEMATE|SOLELIFE/i);
  });

  test('어느 화면이든 Keego 워드마크가 노출된다', () => {
    const anyKeego = SCREENS.some(f => /Keego/.test(read(f)));
    expect(anyKeego).toBe(true);
  });
});
