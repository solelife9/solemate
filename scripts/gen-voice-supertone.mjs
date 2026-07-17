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
  // 429(레이트 리밋)는 지수 백오프로 재시도 — 무료 티어 분당 쿼터가 빡빡하다(실측 2026-07-17).
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await api(`/text-to-speech/${voiceId}`, {
        method: 'POST',
        body: JSON.stringify({text, language: LANG, model: MODEL, output_format: 'wav', style: 'neutral'}),
      });
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (String(e.message).startsWith('429') && attempt < 6) {
        const wait = Math.min(60000, 5000 * 2 ** attempt);
        process.stdout.write(`    …레이트 리밋, ${Math.round(wait / 1000)}s 대기\n`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
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
        await sleep(1500);
      }
    }
    console.log('\n샘플 완료 → scripts/voice_samples/supertone/');
    return;
  }

  const name = opt('voice');
  if (!name) { console.log('사용: --samples | --list | --voice=<이름> [--future]'); return; }
  const v = findVoice(voices, name);
  const vid = v.voice_id ?? v.id;
  // --future: 미래 기능 재고(구독 해지 전 비축, 2026-07-17 사용자 지시) — 번들 밖 보관.
  const future = has('--future');
  const clips = future ? buildFutureClips() : buildClips();
  const OUT = join(ROOT, 'assets', future ? 'voice_future' : 'voice');
  const MARK = join(ROOT, 'scripts', future ? '.voicegen-future' : '.voicegen'); // 마커(생성 원문), gitignore
  mkdirSync(OUT, {recursive: true});
  mkdirSync(MARK, {recursive: true});
  console.log(`전량 생성: ${clips.length}클립 · ${name}(${vid}) → assets/voice/`);
  let made = 0, skipped = 0, failed = 0;
  for (const {id, text} of clips) {
    const out = join(OUT, `${id}.mp3`);
    const mark = join(MARK, `${id}.txt`);
    // --force 없으면 이미 새 파이프라인으로 만든 것(마커 기준)만 건너뛴다.
    if (!has('--force') && existsSync(mark) && existsSync(out)) { skipped++; continue; }
    try {
      const wav = await tts(vid, text);
      master(wav, out);
      writeFileSync(mark, text); // 새 파이프라인 마커 + 생성 원문(테이크 재생성 시 참조)
      made++;
      console.log(`  ✓ ${id} "${text}"`);
      await sleep(1500);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${id}: ${e.message}`);
      if (String(e.message).startsWith('402') || /credit|quota|payment/i.test(e.message)) {
        console.log('\n>>> 크레딧 소진 — Supertone Play Starter($2.99) 결제 후 재실행(이어서 진행됨).');
        break;
      }
    }
  }
  console.log(`\n완료: 생성 ${made} · 건너뜀 ${skipped} · 실패 ${failed}`);
}

// ── 전체 클립 목록(gen-voice.mjs 와 동일 id 계약) + v9 확정 억양 규칙 ──────────────
// 연결용 조각(km/kmh/min/hr/라벨) = 쉼표(말끝을 붙잡아 다음 조각으로 이어짐),
// 종결용(sec/pct/완성 문장) = 마침표. 자르기 없음 — 자연 여백이 곧 호흡.
function buildClips() {
  const clips = [];
  const add = (id, text) => clips.push({id, text});
  add('start', '운동을 시작합니다.');
  add('auto_pause', '일시 정지합니다.');
  add('resume', '운동을 재개합니다.');
  add('half', '절반 지점입니다.');
  add('last_km', '마지막 일 킬로미터입니다.');
  add('goal', '목표를 달성했습니다.');
  add('finish', '운동을 종료합니다. 수고하셨습니다.');
  add('gps_weak', '지피에스 신호가 약합니다.');
  add('sig_injury_high', '오늘은 부하가 높습니다. 가볍게 달려보세요.');
  add('sig_injury_caution', '컨디션을 살피며 달려보세요.');
  add('sig_shoe_due', '신발 교체 시기가 다가왔습니다.');
  add('pace_slow', '페이스를 올려보세요.');
  add('pace_fast', '페이스가 빠릅니다.');
  add('pace_on', '적정 페이스입니다.');
  add('lbl_pace', '페이스,');
  add('lbl_avg_pace', '평균 페이스,');
  add('lbl_remaining', '남은 거리,');
  add('lbl_shoe_life', '신발 남은 수명,');
  add('lbl_elapsed', '경과 시간,');
  // 심박존 코칭(#7) — 존 번호는 러너 관례상 영어("존 투/쓰리/포", 사용자 확정 2026-07-17).
  const ZONE_EN = {2: '투', 3: '쓰리', 4: '포'};
  for (const z of [2, 3, 4]) {
    add(`zone_down_${z}`, `천천히, 존 ${ZONE_EN[z]}로 낮춰 보세요.`);
    add(`zone_up_${z}`, `조금만 올려요, 존 ${ZONE_EN[z]} 페이스로.`);
  }
  for (let n = 1; n <= 42; n++) add(`km_${n}`, `${n}킬로미터,`);
  for (let m = 1; m <= 59; m++) add(`min_${m}`, `${m}분,`);
  for (let s = 1; s <= 59; s++) add(`sec_${s}`, `${s}초.`);
  for (let p = 0; p <= 100; p += 5) add(`pct_${p}`, `${p} 퍼센트.`);
  const HR_KO = ['', '한', '두', '세', '네', '다섯', '여섯'];
  for (let h = 1; h <= 6; h++) add(`hr_${h}`, `${HR_KO[h]} 시간,`);
  add('m_500', '오백 미터.');
  // "N.5" 숫자 표기는 이 모델에서 발음이 뭉개진다(실측 2026-07-17: "킬로터") → 전부 한글 풀어쓰기.
  for (let n = 1; n <= 41; n++) add(`kmh_${n}`, `${koNum(n)} 점 오 킬로미터,`);
  return clips;
}

// 0..100 한자어 수 읽기(gen-voice.mjs 와 동일 관례).
function koNum(n) {
  if (n <= 0) return '영';
  if (n === 100) return '백';
  const ones = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const tens = ['', '십', '이십', '삼십', '사십', '오십', '육십', '칠십', '팔십', '구십'];
  return `${tens[Math.floor(n / 10)]}${ones[n % 10]}`;
}

// ── 미래 기능 재고(assets/voice_future/ — 번들 밖 보관, 2026-07-17 사용자 지시) ────
// 구독 해지 전 비축: 확정 로드맵(인터벌 빌더)·백로그('1분 남음'·카운트다운 음성)·
// 확장 여지(울트라 거리·장시간·존5·격려 로테이션·신기록). 기능이 생기면 폴더 이동만.
function buildFutureClips() {
  const clips = [];
  const add = (id, text) => clips.push({id, text});
  // 울트라 거리 43~100km + 반km 42.5~50.5
  for (let n = 43; n <= 100; n++) add(`km_${n}`, `${n}킬로미터,`);
  for (let n = 42; n <= 50; n++) add(`kmh_${n}`, `${koNum(n)} 점 오 킬로미터,`);
  // 장시간 7~12시간(고유어 수사 — 기존 hr_1~6 과 동일 관례)
  const HR_KO = {7: '일곱', 8: '여덟', 9: '아홉', 10: '열', 11: '열한', 12: '열두'};
  for (let h = 7; h <= 12; h++) add(`hr_${h}`, `${HR_KO[h]} 시간,`);
  // 카운트다운 음성(NRC 패리티 검토 항목) — 개별 숫자 + 출발
  add('cnt_3', '삼.'); add('cnt_2', '이.'); add('cnt_1', '일.'); add('cnt_go', '출발!');
  // 인터벌 팩(출시 후 1순위 로드맵)
  add('itv_sprint', '질주!');
  add('itv_recover', '회복 구간입니다.');
  add('itv_rest', '휴식,');
  add('itv_next', '다음 세트,');
  add('itv_last', '마지막 세트입니다.');
  add('itv_done', '세트 완료.');
  for (let n = 1; n <= 12; n++) add(`itv_set_${n}`, `${n}번째 세트,`);
  // 남은 시간 콜아웃('1분 남음' 백로그 포함)
  add('rem_10s', '십 초 남았습니다.');
  add('rem_15s', '십오 초 남았습니다.');
  add('rem_30s', '삼십 초 남았습니다.');
  add('rem_60s', '일 분 남았습니다.');
  // 격려 로테이션(반복 지루함 방지 — 랜덤 선택용)
  add('cheer_1', '좋아요, 그 페이스예요.');
  add('cheer_2', '잘하고 있어요.');
  add('cheer_3', '호흡을 편하게 가져가요.');
  add('cheer_4', '마지막까지, 킵 고잉.');
  add('cheer_5', '오늘도 해내고 있어요.');
  // 신기록(PR 감지 연동 여지)
  add('pr_new', '새로운 개인 기록이에요! 축하해요.');
  // 존 5 + 미래 라벨
  add('zone_down_5', '천천히, 존 파이브로 낮춰 보세요.');
  add('zone_up_5', '조금만 올려요, 존 파이브 페이스로.');
  add('lbl_cadence', '케이던스,');
  add('lbl_bpm', '심박,');
  // 쿨다운
  add('cooldown', '수고했어요. 가볍게 걸으며 마무리해요.');
  return clips;
}

main().catch(e => { console.error(e.message); process.exit(1); });
