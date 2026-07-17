// ============================================================================
// scripts/gen-voice-supertone.mjs — Supertone(Sona) 러닝 음성 클립 생성기
// ============================================================================
// ElevenLabs(gen-voice.mjs) 대체 후보 파이프라인(2026-07-17, 사용자 "음성 최고퀄" 지시).
// Supertone API 로 클립을 생성해 wav 원본 → ffmpeg 마스터링(mp3, loudnorm -14) 까지.
//
// 사용:
//   node scripts/gen-voice-supertone.mjs --samples          # 대표 문장 × 후보 목소리 A/B용
//   node scripts/gen-voice-supertone.mjs --voice=Angelina   # 전체 클립 생성(확정 후)
//   node scripts/gen-voice-supertone.mjs --list             # 계정에서 쓸 수 있는 목소리 나열
//
// 비밀: 키는 .supertonekey(gitignored)에서만 읽고 어디에도 출력하지 않는다.
// 출력: --samples → scripts/voice_samples/supertone/<voice>/<id>.mp3
//       전체      → assets/voice/<id>.mp3 (기존 계약 그대로 — 앱 코드 변경 0)
// ============================================================================
import {readFileSync, existsSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = readFileSync(join(ROOT, '.supertonekey'), 'utf8').trim();
const API = 'https://supertoneapi.com/v1';
const LANG = 'ko';
const MODEL = 'sona_speech_1';

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const opt = name => {
  const a = argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
};

// ── 후보 목소리(사용자 Play 청취 픽, 2026-07-17): 안젤리나 · 아가사 ─────────────
const CANDIDATES = ['Angelina', 'Agatha'];

// ── 대표 샘플 문장 — 실사용 최다 유형을 그대로(연결 재생 포함 시나리오) ───────────
const SAMPLES = [
  {id: 'start', text: '운동을 시작합니다.'},
  {id: 'km_5', text: '5킬로미터.'},
  {id: 'lbl_pace', text: '페이스'},
  {id: 'min_5', text: '5분.'},
  {id: 'sec_12', text: '12초.'},
  {id: 'pace_slow', text: '페이스를 올려보세요.'},
  {id: 'zone_down_3', text: '심박이 높아요. 존 삼으로 낮춰보세요.'},
  {id: 'goal', text: '목표를 달성했습니다.'},
  {id: 'finish', text: '운동을 종료합니다. 수고하셨습니다.'},
];

async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {'x-sup-api-key': KEY, 'Content-Type': 'application/json', ...(init?.headers || {})},
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function listVoices() {
  // 페이지네이션 대비 — 전량 수집.
  const out = [];
  let next = '/voices?page_size=100';
  while (next) {
    const res = await api(next);
    const j = await res.json();
    const items = j.items ?? j.voices ?? j.data ?? (Array.isArray(j) ? j : []);
    out.push(...items);
    next = j.next_page ? `/voices?page=${j.next_page}` : null;
  }
  return out;
}

function findVoice(voices, name) {
  const lc = name.toLowerCase();
  const hit = voices.filter(v => String(v.name ?? '').toLowerCase().includes(lc));
  if (hit.length === 0) throw new Error(`목소리 '${name}' 를 찾지 못함 — --list 로 확인하세요.`);
  // 동명이면 한국어 지원 우선.
  hit.sort((a, b) => Number(langOk(b)) - Number(langOk(a)));
  return hit[0];
}
const langOk = v => JSON.stringify(v.language ?? v.languages ?? '').includes('ko');

async function tts(voiceId, text) {
  const res = await api(`/text-to-speech/${voiceId}`, {
    method: 'POST',
    body: JSON.stringify({text, language: LANG, model: MODEL, output_format: 'wav', style: 'neutral'}),
  });
  return Buffer.from(await res.arrayBuffer());
}

// 마스터링(기존 정본 계열): 저역 컷 + 잡음 억제 + 라우드니스 -14 LUFS → mp3 192k.
// (배속·피치는 목소리 확정 후 귀 기준으로 별도 튜닝 — 기본 무배속.)
function master(wavBuf, outMp3) {
  const tmp = `${outMp3}.tmp.wav`;
  writeFileSync(tmp, wavBuf);
  execFileSync('ffmpeg', [
    '-y', '-i', tmp,
    '-af', 'highpass=f=80,afftdn=nf=-30,loudnorm=I=-14:TP=-1.2:LRA=8',
    '-codec:a', 'libmp3lame', '-b:a', '192k',
    outMp3,
  ], {stdio: 'pipe'});
  execFileSync('rm', [tmp]);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const voices = await listVoices();
  if (has('--list')) {
    for (const v of voices) console.log(`${v.voice_id ?? v.id}  ${v.name}  ${JSON.stringify(v.language ?? v.languages ?? '')}`);
    return;
  }

  if (has('--samples')) {
    for (const name of CANDIDATES) {
      const v = findVoice(voices, name);
      const vid = v.voice_id ?? v.id;
      const dir = join(ROOT, 'scripts', 'voice_samples', 'supertone', name.toLowerCase());
      mkdirSync(dir, {recursive: true});
      console.log(`\n[${name}] voice_id=${vid}`);
      for (const {id, text} of SAMPLES) {
        const out = join(dir, `${id}.mp3`);
        if (existsSync(out) && statSync(out).size > 2000) { console.log(`  · ${id} (있음)`); continue; }
        const wav = await tts(vid, text);
        master(wav, out);
        console.log(`  ✓ ${id} "${text}"`);
        await sleep(300);
      }
    }
    console.log('\n샘플 완료 → scripts/voice_samples/supertone/');
    return;
  }

  const name = opt('voice');
  if (!name) { console.log('사용: --samples | --list | --voice=<이름>'); return; }
  // 전체 생성 — 클립 목록은 gen-voice.mjs 와 동일 계약(id=파일명). 확정 후 이 분기에
  // gen-voice.mjs 의 clips 배열을 이식/공유화한다(지금은 샘플 단계라 미구현 가드).
  throw new Error('전체 생성은 목소리 확정 후에 — 지금은 --samples 로 A/B 먼저.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
