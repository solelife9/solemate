// scripts/jest-shuffle-sequencer.js — 테스트 **파일 순서를 섞는** jest 시퀀서.
//
// 왜 있나 (2026-08-08)
// ----------------------------------------------------------------------------
// 이 저장소는 "혼자 돌리면 통과하는데 전체에서는 실패하는" 스위트를 두 번 만났다
// (Node 24 에서 healthConnect 4건 · 병렬 실행에서 같은 스위트). 원인은 **테스트 간 전역
// 오염**이고, 증상이 '가끔'인 이유는 jest 가 파일 순서를 **실행 시간 캐시**로 정하기
// 때문이다 — 캐시가 바뀌면 순서가 바뀌고, 순서가 바뀌면 오염이 드러나거나 숨는다.
//
// 그래서 순서를 고정하려 애쓰는 대신 **일부러 흔든다.** 오염이 있으면 언젠가 걸리고,
// 걸린 seed 로 **결정적으로 재현**할 수 있다. 이것이 이 문제의 표준 도구다.
//
// 쓰는 법:
//   JEST_SHUFFLE_SEED=123 npx jest --testSequencer scripts/jest-shuffle-sequencer.js
//   (seed 를 안 주면 매번 다른 순서 — 반복해 돌려 오염을 사냥한다)
//
// ⚠️ 기본 실행(`npm test`)에는 걸지 않는다. 순서가 매번 바뀌면 실패가 재현되지 않아
//    오히려 디버깅이 어려워진다. **오염 사냥용 별도 명령**이다(`npm run test:shuffle`).
const Sequencer = require('@jest/test-sequencer').default;

/** 재현 가능한 난수(mulberry32) — seed 하나로 같은 순서를 다시 만든다. */
function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class ShuffleSequencer extends Sequencer {
  sort(tests) {
    // ── 지정 순서 모드 — 오염원 이분 탐색용 ──────────────────────────────────
    // 실패한 seed 의 순서를 파일로 받아 **그 순서 그대로** 돌린다. 부분집합만 넘겨도
    // 상대 순서가 보존되므로, 앞부분을 반씩 잘라가며 오염원을 좁힐 수 있다.
    const orderFile = process.env.JEST_ORDER_FILE;
    if (orderFile) {
      const lines = require('fs').readFileSync(orderFile, 'utf8').split('\n').filter(Boolean);
      const rank = new Map(lines.map((l, i) => [l.trim(), i]));
      return [...tests].sort(
        (a, b) => (rank.get(a.path.replace(/^.*?solemate\//, '')) ?? 1e9) -
                  (rank.get(b.path.replace(/^.*?solemate\//, '')) ?? 1e9),
      );
    }
    const seed = Number(process.env.JEST_SHUFFLE_SEED) || Math.floor(Math.random() * 1e9);
    // 실패했을 때 그 순서를 그대로 되살릴 수 있게 **반드시 출력한다.**
    // 이게 없으면 "가끔 빨간" 실행이 그냥 미스터리로 남는다.
    // eslint-disable-next-line no-console
    console.log(`[shuffle] JEST_SHUFFLE_SEED=${seed}`);
    const rand = rng(seed);
    const arr = [...tests];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

module.exports = ShuffleSequencer;
