#!/usr/bin/env node
/**
 * scripts/gen-google-web-client-id.js — 웹 OAuth 클라이언트 id 생성기 (Slice 5)
 *
 * android/app/google-services.json 의 웹 OAuth 클라이언트(oauth_client 중
 * client_type === 3, 곧 안드로이드 google-services 플러그인이 만드는
 * R.string.default_web_client_id 와 동일한 값)에서 client_id 를 읽어
 * lib/googleWebClientId.generated.ts 를 덮어쓴다. 평문 하드코딩을 피하면서도
 * GoogleSignin.configure({webClientId}) 가 실기기에서 동작하게 한다.
 *
 * 실행:  node scripts/gen-google-web-client-id.js
 *
 * 웹 클라이언트가 아직 없으면(SHA-1 미등록) 빈 값을 써서 Google 로그인을 정직하게
 * 비활성 상태로 둔다. 생성 후 이 파일을 git skip-worktree 로 표시해 실제(공개지만
 * 시크릿 0 원칙상 미커밋) 값이 커밋되지 않게 한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GS_PATH = path.join(ROOT, 'android', 'app', 'google-services.json');
const OUT_PATH = path.join(ROOT, 'lib', 'googleWebClientId.generated.ts');

/** google-services.json 에서 client_type===3(웹) 의 client_id 를 추출. 없으면 ''. */
function extractWebClientId(gs) {
  const clients = Array.isArray(gs.client) ? gs.client : [];
  for (const c of clients) {
    const ocs = Array.isArray(c.oauth_client) ? c.oauth_client : [];
    const web = ocs.find(o => o && o.client_type === 3 && o.client_id);
    if (web) {
      return String(web.client_id);
    }
  }
  return '';
}

function render(id) {
  return (
    '// ============================================================================\n' +
    '// lib/googleWebClientId.generated.ts — 자동 생성(평문 하드코딩 금지) (Slice 5)\n' +
    '//\n' +
    '// 이 파일은 직접 편집하지 않는다. `node scripts/gen-google-web-client-id.js` 가\n' +
    '// android/app/google-services.json 의 웹 OAuth 클라이언트(oauth_client 중\n' +
    '// client_type === 3, 즉 R.string.default_web_client_id 와 동일한 값)에서 client_id 를\n' +
    '// 읽어 이 파일을 덮어쓴다.\n' +
    '//\n' +
    '// 웹 클라이언트 id 는 앱에 임베드되는 공개 식별자이지만, 시크릿 0 원칙을 지키려\n' +
    '// 생성 스크립트는 이 파일을 git skip-worktree 로 표시해 실제 값이 커밋되지 않게 한다.\n' +
    '// ============================================================================\n' +
    '\n' +
    "/** 웹 OAuth 클라이언트 id(=default_web_client_id). 비어 있으면 Google 로그인 비활성. */\n" +
    `export const GOOGLE_WEB_CLIENT_ID = '${id}';\n`
  );
}

function main() {
  if (!fs.existsSync(GS_PATH)) {
    console.error(`[gen-google-web-client-id] google-services.json 없음: ${GS_PATH}`);
    process.exit(1);
  }
  let gs;
  try {
    gs = JSON.parse(fs.readFileSync(GS_PATH, 'utf8'));
  } catch (e) {
    console.error('[gen-google-web-client-id] google-services.json 파싱 실패:', e.message);
    process.exit(1);
  }
  const id = extractWebClientId(gs);
  fs.writeFileSync(OUT_PATH, render(id), 'utf8');
  if (id) {
    // 실제 값이 커밋되지 않도록 skip-worktree 표시(공개 id 이지만 시크릿 0 원칙).
    try {
      execFileSync('git', ['update-index', '--skip-worktree', 'lib/googleWebClientId.generated.ts'], {
        cwd: ROOT,
        stdio: 'ignore',
      });
    } catch {
      // git 미사용/미추적 환경이면 조용히 넘어간다(파일은 이미 기록됨).
    }
    console.log('[gen-google-web-client-id] 웹 클라이언트 id 를 기록했습니다(skip-worktree).');
  } else {
    console.log(
      '[gen-google-web-client-id] 웹 OAuth 클라이언트(client_type=3)가 없어 빈 값으로 기록했습니다 — Google 로그인 비활성.',
    );
  }
}

main();
