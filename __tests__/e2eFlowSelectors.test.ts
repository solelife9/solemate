/**
 * E2E 흐름의 선택자가 소스와 어긋나지 않는가.
 *
 * **E2E 의 최대 유지보수 문제는 실패가 아니라 침묵이다.** 누가 testID 를 지우거나
 * 이름을 바꾸면 흐름은 "요소를 못 찾음"으로 실패하는데, E2E 는 기기가 있어야 돌므로
 * 보통 며칠 뒤에야 발견된다. 그동안 아무도 안 돌리면 흐름은 조용히 썩는다
 * (이 저장소가 겪은 "만들었는데 배선이 안 된" 사고와 같은 종류다).
 *
 * 그래서 **소스 레벨로 못 박는다** — 흐름이 참조하는 id 는 전부 실제 testID 여야 한다.
 * 이 테스트는 기기 없이 돌고 `npm test` 에 섞여 있으므로, testID 를 지우는 순간
 * 커밋 전에 걸린다.
 *
 * 반대 방향(testID 는 있는데 흐름이 안 쓴다)은 검사하지 않는다 — testID 는 E2E 만
 * 쓰는 게 아니라 단위 테스트도 쓴다.
 * @format
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const FLOW_DIR = path.join(ROOT, '.maestro', 'flows');

/** 저장소의 모든 testID 리터럴을 긁어모은다(템플릿 리터럴은 접두사만). */
function collectTestIds(): {exact: Set<string>; prefixes: string[]} {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', 'android', 'ios', '.git', '__tests__'].includes(e.name)) continue;
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      // testID="foo"  ·  testID={'foo'}
      for (const m of src.matchAll(/testID=(?:"([^"]+)"|\{'([^']+)'\})/g)) {
        exact.add(m[1] ?? m[2]);
      }
      // testID={`tab-${...}`} → 접두사 'tab-' 를 허용 목록에 넣는다(동적 생성).
      for (const m of src.matchAll(/testID=\{`([^`$]*)\$\{/g)) {
        if (m[1]) prefixes.push(m[1]);
      }
    }
  };
  walk(ROOT);
  return {exact, prefixes};
}

/** 흐름 YAML 에서 `id: "..."` 를 뽑는다(정식 YAML 파서 없이 — 형식이 단순하다). */
function collectFlowIds(): Array<{file: string; id: string}> {
  const out: Array<{file: string; id: string}> = [];
  for (const f of fs.readdirSync(FLOW_DIR)) {
    if (!f.endsWith('.yaml')) continue;
    const src = fs.readFileSync(path.join(FLOW_DIR, f), 'utf8');
    for (const m of src.matchAll(/^\s*id:\s*"([^"]+)"\s*$/gm)) out.push({file: f, id: m[1]});
  }
  return out;
}

describe('E2E 흐름 ↔ 소스 선택자', () => {
  test('흐름 파일이 실제로 있다 — 지워지면 여기서 걸린다', () => {
    expect(fs.existsSync(FLOW_DIR)).toBe(true);
    const flows = fs.readdirSync(FLOW_DIR).filter(f => f.endsWith('.yaml'));
    expect(flows.length).toBeGreaterThanOrEqual(5);
  });

  test('흐름이 참조하는 모든 id 가 소스에 존재하는 testID 다', () => {
    const {exact, prefixes} = collectTestIds();
    const used = collectFlowIds();
    expect(used.length).toBeGreaterThan(0);

    const missing = used.filter(
      ({id}) => !exact.has(id) && !prefixes.some(p => id.startsWith(p)),
    );
    // 실패 메시지에 어느 흐름의 어느 id 인지 그대로 나오게 한다.
    expect(missing.map(m => `${m.file}: ${m.id}`)).toEqual([]);
  });

  test('오늘의 회귀(뒤로가기) 흐름은 지우지 않는다', () => {
    // 2026-08-07: 기록 상세에서 뒤로가기를 누르면 앱이 종료되던 버그. 단위 테스트
    // 3,500개가 못 잡았고 E2E 만 잡을 수 있는 종류였다. 이 흐름이 E2E 존재 이유다.
    const p = path.join(FLOW_DIR, '02-back-navigation.yaml');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toContain('pressKey: Back');
    expect(src).toContain('run-detail-screen');
  });

  test('흐름은 비파괴다 — 삭제·저장 같은 동작을 넣지 않는다', () => {
    // 실기기(민우님 폰)에서 도는 흐름이라 데이터를 만들거나 지우면 안 된다.
    // 파괴적 동작의 선택자가 흐름에 등장하면 여기서 막는다.
    const banned = ['detail-delete', 'run-save', 'picker-add-', 'retire-open-flow'];
    for (const f of fs.readdirSync(FLOW_DIR)) {
      if (!f.endsWith('.yaml')) continue;
      const src = fs.readFileSync(path.join(FLOW_DIR, f), 'utf8');
      for (const b of banned) {
        expect(`${f}:${src.includes(b)}`).toBe(`${f}:false`);
      }
    }
  });
});
