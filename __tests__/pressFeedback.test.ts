// pressFeedback.test.ts — **누른 것이 보여야 한다.**
//
// 왜 있나 (2026-08-08)
// ----------------------------------------------------------------------------
// 감사에는 "안드로이드에 `android_ripple` 이 0건"이라고만 적혀 있었다. 세어 보니 그보다
// 나빴다 — `<Pressable>` 190개 중 **158개가 눌림 피드백이 아무것도 없었다.** 안드로이드만의
// 문제가 아니라 **두 플랫폼 모두에서 83%가 무반응**이었다는 뜻이다.
//
// 눌러도 아무 일이 없으면 사용자는 한 번 더 누른다. 그게 이중 실행(러닝 두 번 시작·
// 신발 두 번 등록)이나 "안 되는 앱"이라는 인상으로 돌아온다.
//
// 스윕으로 158 → **0** 이 됐다. 그래서 이 가드는 래칫이 아니라 **불변식**이다:
// 피드백 없는 `<Pressable>` 은 하나도 없어야 하고, 예외는 코드에 이유를 적어야 한다.
//
// 목록이 아니라 **디렉터리를 긁는다.** 새 화면이 생겨도 자동으로 검사 대상이 된다
// (이 저장소의 반복 실패 형태가 "목록에서 빠진 새 파일"이다).
import {readFileSync, readdirSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');

/** 화면·컴포넌트 소스 전부. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const push = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir), {withFileTypes: true})) {
      if (!f.isFile() || !f.name.endsWith('.tsx')) continue;
      out.push(dir ? `${dir}/${f.name}` : f.name);
    }
  };
  push('');
  push('screens');
  return out.sort();
}

/**
 * 여는 태그의 끝(`>`) 위치.
 *
 * ⚠️ **첫 `>` 를 태그 끝으로 보면 안 된다.** 처음에 그렇게 짰다가 39곳을 잘못 셌다
 * (2026-08-08). `onPress={() => ...}` 의 화살표가 `>` 라서 속성값 안의 것을 태그 끝으로
 * 오인하고, 그 뒤에 오는 `android_ripple` 을 못 봐서 **이미 고친 곳을 안 고쳤다고 센다.**
 * 잘못 세는 가드는 없느니만 못하다 — 중괄호·문자열 깊이를 세며 읽는다.
 */
function tagEnd(src: string, i: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === quote && src[j - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
    } else if (depth === 0 && c === '>') {
      return j;
    }
  }
  return -1;
}

/** 주석 줄의 `<Pressable>` 은 코드가 아니다(이 파일 설명문에도 등장한다). */
function inComment(src: string, i: number): boolean {
  const lineStart = src.lastIndexOf('\n', i) + 1;
  const before = src.slice(lineStart, i).trimStart();
  return before.startsWith('//') || before.startsWith('*');
}

interface Bare {
  file: string;
  line: number;
  head: string;
}

/**
 * 피드백이 없는 `<Pressable>` 전부.
 *
 * 면제 표식: 바로 앞에 `tap-exempt` 가 있으면 건너뛴다. **이유를 코드에 적게 강제하는
 * 장치**다 — 예외 목록을 이 파일에 두면 왜 예외인지가 정작 코드에서 사라진다.
 */
function bareOnes(): Bare[] {
  const out: Bare[] = [];
  for (const f of sourceFiles()) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const re = /<Pressable\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const i = m.index;
      if (inComment(src, i)) continue;
      const end = tagEnd(src, i);
      if (end < 0) continue;
      const head = src.slice(i, end + 1);
      if (head.includes('({pressed') || head.includes('android_ripple')) continue;
      if (src.slice(Math.max(0, i - 320), i).includes('tap-exempt')) continue;
      out.push({
        file: f,
        line: src.slice(0, i).split('\n').length,
        head: head.replace(/\s+/g, ' ').slice(0, 90),
      });
    }
  }
  return out;
}

describe('누름 피드백', () => {
  it('피드백 없는 Pressable 은 없다 — 새로 만들면 여기서 걸린다', () => {
    // 실패 메시지에 **파일·줄·태그**가 남는다. 숫자만 보면 어디를 고칠지 모른다.
    // 고치는 법: `<Pressable>` 을 `<Tap>` 으로 바꾼다(primitives). 피드백을 주면 안 되는
    // 자리라면 바로 위에 `tap-exempt:` 와 **이유**를 적는다.
    expect(bareOnes()).toEqual([]);
  });

  it('Tap 프리미티브가 두 플랫폼 모두에 피드백을 준다', () => {
    const src = readFileSync(join(ROOT, 'primitives.tsx'), 'utf8');
    const at = src.indexOf('export function Tap({');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 2200);
    expect(body).toMatch(/android_ripple/); // 안드로이드 OS 표준 피드백
    expect(body).toMatch(/MOTION\.press\.opacity/); // 정본 값(새 값 만들지 않기)
    expect(body).toMatch(/reduceMotion/); // '동작 줄이기' 존중(DESIGN §6.7)
  });

  it('넓은 행은 스스로 축소를 끈다 — 호출부에서 매번 판단하지 않는다', () => {
    const src = readFileSync(join(ROOT, 'primitives.tsx'), 'utf8');
    const at = src.indexOf('export function Tap({');
    const body = src.slice(at, at + 2200);
    // 자기 폭을 재서 '행'인지 판정한다(호출부에 맡기면 몇 곳은 반드시 틀린다).
    expect(body).toMatch(/onLayout/);
    expect(body).toMatch(/winW/);
  });

  // ── 눌림 세기가 제각각인 곳 (2026-08-08 발견) ────────────────────────────
  // 정본은 `MOTION.press`(opacity 0.92) 하나인데, 아래 네 파일은 0.25·0.55·0.7·0.8·0.85 를
  // 직접 적어 두고 있다. **같은 뜻에 값이 다섯이면 화면마다 눌림이 다르게 느껴진다.**
  //
  // 그런데 지금 일괄로 0.92 로 바꾸지 않는다. 러닝 화면(RunActiveScreen)의 0.8~0.85 는
  // **더 세게 준 것이 의도일 수 있다** — 달리는 중에는 숨차고 화면이 흔들려서 미세한
  // 변화가 안 보인다. 눈으로 확인하지 않고 통일하면 가장 중요한 화면의 피드백을 약하게
  // 만들 수 있다(민우님 규칙: 비주얼 변경은 보여드리고 반영).
  //
  // 그래서 **늘어나는 것만 막는다.** 새 파일이 값을 직접 적으면 여기서 걸린다.
  // 통일은 목업으로 세기를 정한 뒤에 한다.
  const KNOWN_HARDCODED = [
    'RunActiveScreen.rn.tsx', // 러닝 중 — 0.8~0.85(의도적으로 강할 수 있음)
    'RunGoalScreen.rn.tsx', // 키패드 0.7 / 비활성 0.25
    'RunRecapScreen.rn.tsx', // 0.7~0.85
    'primitives.tsx', // 탭바 0.55
  ];

  it('눌림 세기를 직접 적은 파일이 늘지 않는다 — 통일 전까지 동결', () => {
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      const re = /<(?:Pressable|Tap)\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (inComment(src, m.index)) continue;
        const end = tagEnd(src, m.index);
        if (end < 0) continue;
        const head = src.slice(m.index, end + 1);
        if (/pressed\s*&&\s*\{[^}]*opacity:\s*0?\.\d/.test(head)) offenders.push(f);
      }
    }
    expect([...new Set(offenders)].sort()).toEqual([...KNOWN_HARDCODED].sort());
  });
});
