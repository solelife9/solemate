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
// 이 파일은 두 가지를 한다:
//   ① **래칫** — 무피드백 Pressable 수가 지금보다 늘어나면 빨개진다. 줄어들면 상한을
//      내리라고 알려 준다(줄여 놓고 상한을 안 조이면 그대로 다시 는다 — lint 래칫과 같다).
//   ② **정본 강제** — 피드백 값은 `MOTION.press` 하나만 쓴다. 같은 뜻에 값이 둘이면
//      화면마다 미세하게 달라지고, 그 차이는 아무도 의도하지 않은 것이다.
//
// 목록이 아니라 **디렉터리를 긁는다.** 새 화면이 생겨도 자동으로 검사 대상이 된다
// (이 저장소의 반복 실패 형태가 "목록에서 빠진 새 파일"이다).
import {readFileSync, readdirSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');

/** 화면·컴포넌트 소스 전부(빌드 산출물·테스트 제외). */
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

/** 한 파일의 `<Pressable ...>` 여는 태그들. 여는 태그 안에서만 판정한다. */
function pressableHeads(src: string): string[] {
  const heads: string[] = [];
  const re = /<Pressable\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const seg = src.slice(m.index, m.index + 1200);
    const end = seg.indexOf('>');
    heads.push(end > 0 ? seg.slice(0, end + 1) : seg);
  }
  return heads;
}

const hasFeedback = (head: string) => head.includes('({pressed') || head.includes('android_ripple');

function bareCount(): {total: number; byFile: Record<string, number>} {
  const byFile: Record<string, number> = {};
  let total = 0;
  for (const f of sourceFiles()) {
    const heads = pressableHeads(readFileSync(join(ROOT, f), 'utf8'));
    const bare = heads.filter(h => !hasFeedback(h)).length;
    if (bare > 0) {
      byFile[f] = bare;
      total += bare;
    }
  }
  return {total, byFile};
}

/**
 * 무피드백 Pressable 상한. **줄어들면 이 숫자를 함께 내린다.**
 * 2026-08-08 기준 158 — `Tap` 프리미티브로 옮겨 가며 0을 향해 내린다.
 */
const BARE_CEILING = 158;

describe('누름 피드백', () => {
  it(`피드백 없는 Pressable 이 ${BARE_CEILING}개를 넘지 않는다 — 늘어나면 여기서 걸린다`, () => {
    const {total, byFile} = bareCount();
    // 실패 메시지에 **어느 파일에 몇 개인지** 남긴다 — 숫자만 보면 어디를 고칠지 모른다.
    expect({total, ceiling: BARE_CEILING, byFile: total > BARE_CEILING ? byFile : '(상한 이내)'}).toEqual({
      total,
      ceiling: BARE_CEILING,
      byFile: total > BARE_CEILING ? {} : '(상한 이내)',
    });
  });

  it('줄었으면 상한도 함께 내린다 — 조이지 않으면 그대로 다시 는다', () => {
    const {total} = bareCount();
    expect({총: total, 상한: BARE_CEILING, 내려야하나: total < BARE_CEILING}).toEqual({
      총: total,
      상한: BARE_CEILING,
      내려야하나: false,
    });
  });

  it('Tap 프리미티브가 존재하고 두 플랫폼 모두에 피드백을 준다', () => {
    const src = readFileSync(join(ROOT, 'primitives.tsx'), 'utf8');
    const at = src.indexOf('export function Tap({');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 1400); // 함수 하나가 충분히 들어가는 창
    // 안드로이드 리플(OS 표준) + 공통 눌림 표시.
    expect(body).toMatch(/android_ripple/);
    expect(body).toMatch(/MOTION\.press\.opacity/);
    // 축소는 '동작 줄이기'를 존중해야 한다(DESIGN §6.7).
    expect(body).toMatch(/reduceMotion/);
  });

  it('피드백 값은 MOTION.press 하나만 쓴다 — 같은 뜻에 값이 둘이면 화면마다 달라진다', () => {
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const head of pressableHeads(src)) {
        // 눌림 처리에서 하드코딩한 opacity/scale 을 찾는다(토큰을 안 쓴 자리).
        if (/pressed\s*&&\s*\{[^}]*opacity:\s*0?\.\d/.test(head)) offenders.push(f);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
