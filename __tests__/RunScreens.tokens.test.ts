/**
 * RunScreens.tokens.test.ts — 정적 스캔: Run* 화면의 사설 색객체(const C) 제거 확인.
 *
 * RunActiveScreen / RunGoalScreen / RunCountdownScreen 은 예전에 각자 `const C = {...}`
 * 사설 팔레트와 로컬 폰트 별칭(UI/DP)을 갖고 있었다. 이 작업이 그것을 theme.ts 토큰
 * (BG/CARD/T1–T4/GOOD/WARN/DANGER, FONT/DISPLAY)으로 흡수했다. 회귀로 사설 팔레트가
 * 되살아나는 것을 막기 위해 소스에 다음이 없음을 단언한다:
 *   1) `const C =` 사설 색객체 정의
 *   2) 로컬 폰트 별칭 `const UI =` / `const DP =`
 *   3) raw hex 색 리터럴(주석 제외) — 단, 버튼 위 흰색(#fff/#ffffff)은 허용
 *      (다크+오렌지 위 텍스트/아이콘 흰색은 의미색이 아니라 중립 리터럴).
 * 그리고 각 화면이 theme 토큰을 실제로 import 하는지도 확인한다.
 *
 * @format
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SCREENS = [
  'RunActiveScreen.rn.tsx',
  'RunGoalScreen.rn.tsx',
  'RunCountdownScreen.rn.tsx',
];

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// 라인 주석(// ...) 제거 — 설명 주석의 예시 토큰/색은 스캔 대상이 아니다.
const codeOnly = (src: string) =>
  src
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n');

describe('Run* 화면 — 사설 색객체(const C) 제거 정적 스캔', () => {
  test.each(SCREENS)('%s 에 `const C =` 사설 색객체가 없다', file => {
    expect(codeOnly(read(file))).not.toMatch(/const\s+C\s*=/);
  });

  test.each(SCREENS)('%s 에 로컬 폰트 별칭 const UI/DP 가 없다', file => {
    const code = codeOnly(read(file));
    expect(code).not.toMatch(/const\s+UI\s*=/);
    expect(code).not.toMatch(/const\s+DP\s*=/);
  });

  test.each(SCREENS)('%s 에 인라인 fontFamily 문자열 리터럴이 없다 (FONT/DISPLAY 토큰만)', file => {
    const inlineFamily = codeOnly(read(file)).match(/fontFamily:\s*['"][^'"]+['"]/g) ?? [];
    expect(inlineFamily).toEqual([]);
  });

  test.each(SCREENS)('%s 에 팔레트 raw hex 리터럴이 없다 (흰색 #fff 만 허용)', file => {
    const hex = codeOnly(read(file)).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    const palette = hex.filter(h => !/^#(fff|ffffff)$/i.test(h));
    expect(palette).toEqual([]);
  });

  test.each(SCREENS)('%s 가 theme 토큰을 import 한다', file => {
    expect(read(file)).toMatch(/from ['"]\.\/theme['"]/);
  });
});
