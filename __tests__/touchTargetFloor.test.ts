// ============================================================================
// 터치 타깃 하한은 줄어들지 않는다 (2026-08-07 감사)
//
// TOUCH_TARGET(44pt)은 Apple HIG · Android 48dp 의 **접근성 하한**이다. 그런데 6곳이
// `rs(TOUCH_TARGET)` 로 감싸고 있었다 — rs 는 화면 폭 비례 스케일이라 작은 폰에서
// **44 → 40pt 로 줄어든다.**
//
// 이 값은 디자인 치수가 아니라 "손가락이 닿는 최소 크기"이고, 화면이 작다고 손가락이
// 작아지지 않는다. 오히려 작은 화면에서 오터치가 더 잘 난다 — 줄이면 정확히 반대다.
//
// 토큰으로 승격해 놓고 rs() 로 다시 무효화한 이력이 있어(같은 감사에서 Card 프리미티브·
// LEADING·CAPTURE_SCALE 도 같은 형태로 발견됐다), 목록이 아니라 **전수 스윕**으로 막는다.
// 새 화면이 같은 실수를 해도 여기서 걸린다.
// ============================================================================
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

/** 저장소 루트의 화면·컴포넌트 소스 전부(하위 lib/screens 포함). */
function sourceFiles(): string[] {
  const out: string[] = [];
  const skip = new Set(['node_modules', '__tests__', 'android', 'ios', 'docs', '.git', 'coverage', 'tests']);
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      if (skip.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(ROOT);
  return out;
}

describe('접근성 하한은 스케일 대상이 아니다', () => {
  const files = sourceFiles();

  test('검사 대상 소스를 실제로 찾았다', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  test('TOUCH_TARGET 을 화면 스케일 함수로 감싸지 않는다', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      // rs(TOUCH_TARGET) · rms(TOUCH_TARGET) · rf(TOUCH_TARGET) 전부 금지.
      if (/\br(?:s|ms|f|v)\(\s*TOUCH_TARGET\s*\)/.test(src)) offenders.push(path.relative(ROOT, f));
    }
    expect(offenders).toEqual([]);
  });
});
