// testIsolation.test.ts — **테스트가 서로를 오염시키지 않는다.**
//
// 왜 있나 (2026-08-08)
// ----------------------------------------------------------------------------
// "혼자 돌리면 통과하는데 전체에서는 실패한다"를 두 번 겪었다. 원인은 매번 테스트 간
// 오염이었고, 증상이 '가끔'인 이유는 jest 가 파일 순서를 **실행 시간 캐시**로 정하기
// 때문이다 — 캐시가 바뀌면 순서가 바뀌고, 순서가 바뀌면 오염이 드러나거나 숨는다.
//
// 실제로 잡은 것(seed 820717381 로 결정적 재현):
//   `healthConnect.test` 가 `jest.doMock('react-native-health-connect', …, {virtual: true})`
//   를 썼다. 그런데 그 패키지는 **실제로 설치돼 있다.** `virtual` 은 '존재하지 않는
//   모듈'을 위한 옵션이라, 실재하는 패키지에 쓰면 목이 해석된 경로가 아니라 **이름**으로
//   등록된다. 이 파일만 돌 때는 우연히 맞아떨어지지만, 앞선 스위트가 진짜 모듈을 한 번
//   require 해 두면(healthFacade.test 가 그런다) 대상 코드의 require 가 **진짜 모듈**로
//   해석돼 목을 비껴간다. readRecords 가 한 번도 안 불리고 4건이 빨개졌다.
//
// ⚠️ 그 전에 내가 "Platform.OS 복원 누락이 원인"이라고 보고했는데 **그건 틀렸다.**
// A/B 로 확인하니 복원을 빼도 통과했다 — 파일 크기가 바뀌며 순서가 옮겨간 것뿐이었다.
// (복원 자체는 옳아서 남겼다. 다만 그게 원인은 아니었다.)
//
// 순서를 흔들어 사냥하는 도구: `npm run test:shuffle`
// 실패하면 로그의 `JEST_SHUFFLE_SEED=…` 로 **그 순서를 그대로 재현**할 수 있다.
import {readFileSync, readdirSync, existsSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');

/** 테스트 소스 전부(재귀). */
function testFiles(dir = '__tests__'): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), {withFileTypes: true})) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...testFiles(rel));
    else if (/\.(ts|tsx|js)$/.test(e.name)) out.push(rel);
  }
  return out.sort();
}

describe('테스트 격리', () => {
  it('실재하는 패키지를 virtual 로 목 처리하지 않는다 — 순서에 따라 목이 비껴간다', () => {
    const offenders: string[] = [];
    for (const f of [...testFiles(), 'jest.setup.js', 'jest.setup.after.js']) {
      if (!existsSync(join(ROOT, f))) continue;
      const src = readFileSync(join(ROOT, f), 'utf8');
      // `jest.doMock('X', …, {virtual: true})` / `jest.mock('X', …, {virtual: true})`
      // 주석은 코드가 아니다 — 이 파일의 설명문에도 `virtual: true` 가 등장한다
      // (가드가 자기 자신을 잡는 첫 실행에서 배웠다).
      const code = src
        .split('\n')
        .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
        .join('\n');
      const re = /jest\.(?:do)?[Mm]ock\(\s*['"]([^'"]+)['"][\s\S]{0,400}?virtual:\s*true/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        const mod = m[1];
        if (mod.startsWith('.')) continue; // 상대 경로는 이 함정과 무관
        if (existsSync(join(ROOT, 'node_modules', mod))) offenders.push(`${f} → ${mod}`);
      }
    }
    // 고치는 법: `{virtual: true}` 를 지운다. 패키지가 실재하면 그 옵션은 거짓말이고,
    // 앞선 스위트가 진짜 모듈을 require 한 순간 목이 무력해진다.
    expect(offenders).toEqual([]);
  });

  it('Platform.OS 를 바꾸는 스위트는 정리 훅을 갖는다', () => {
    // 완벽한 검사는 아니다(정리 방식이 resetModules 일 수도, 명시 복원일 수도 있다).
    // 그래도 **정리 훅이 아예 없는** 파일은 확실히 사고다 — 그것만 잡는다.
    const offenders: string[] = [];
    for (const f of testFiles()) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      const mutates = /Platform,\s*'OS'|Platform\.OS\s*=/.test(src);
      if (!mutates) continue;
      if (!/after(Each|All)\s*\(/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('순서 사냥 도구가 저장소에 있다 — 다음 사람이 0에서 시작하지 않게', () => {
    expect(existsSync(join(ROOT, 'scripts/jest-shuffle-sequencer.js'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(typeof pkg.scripts['test:shuffle']).toBe('string');
  });
});
