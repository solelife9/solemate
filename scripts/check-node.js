#!/usr/bin/env node
// ============================================================================
// scripts/check-node.js — 테스트 전에 Node 버전을 확인하고, 안 맞으면 **바로** 멈춘다
// ============================================================================
// 왜 있나 (2026-08-07)
// ----------------------------------------------------------------------------
// `package.json` 의 engines 는 오래 `>= 22.11.0` 이라고 적혀 있었는데 **사실이 아니었다.**
// Node 22 에서는 `__tests__/App.bootcache.test.tsx` 가 매달려 스위트 전체가 끝나지 않는다
// (로컬 실측: 22.11 ✗ · 22.20 ✗ · 24.11 ✓ · 26.3 ✓ — 개발·CI 는 26 이라 아무도 안 밟았다).
//
// 그 상태에서 누군가 Node 22 로 저장소를 받으면 **원인 표시가 하나도 없는 60초+ 멈춤**을
// 본다. 단언 실패도, 에러도 없다. 그게 이 저장소가 남에게 코드를 넘길 때 밟게 될 지뢰였다.
//
// 그래서 두 가지를 한다:
//   ① engines 를 **실제로 통과하는 버전**으로 정정한다(거짓 선언을 없앤다).
//   ② 여기서 먼저 걸러 **무엇이 문제이고 어떻게 하면 되는지** 한국어로 말해 준다.
//
// ⚠️ Node 22 매달림의 근본 원인은 아직 미해결이다 — 조사한 데까지는
//    `docs/audit/08-followup-2026-08-07.md` 의 L-13 항목에 적어 뒀다. 이 스크립트는
//    그 조사를 대신하는 것이 아니라, 고쳐지기 전까지 사람이 헤매지 않게 하는 안내다.
//    원인이 잡히면 MIN_MAJOR 를 낮추고 이 파일의 설명도 함께 고친다.
// ============================================================================

const MIN_MAJOR = 24;

const major = Number(process.versions.node.split('.')[0]);

if (!Number.isFinite(major) || major < MIN_MAJOR) {
  const line = '─'.repeat(64);
  console.error(`\n${line}`);
  console.error(`  Node ${process.versions.node} 에서는 테스트가 끝나지 않습니다.`);
  console.error(`  필요한 버전: Node ${MIN_MAJOR} 이상 (이 저장소는 ${require('fs')
    .readFileSync(require('path').join(__dirname, '..', '.nvmrc'), 'utf8')
    .trim()} 에서 개발·검증합니다)`);
  console.error('');
  console.error('  증상: App.bootcache 스위트가 매달려 단언 실패 없이 멈춥니다.');
  console.error('        "느린 것"이 아니라 끝나지 않는 것이라, 기다려도 소용없습니다.');
  console.error('');
  console.error('  해결: nvm 을 쓰신다면 저장소 루트에서');
  console.error('          nvm install && nvm use');
  console.error('        (.nvmrc 를 읽습니다)');
  console.error(`${line}\n`);
  process.exit(1);
}
