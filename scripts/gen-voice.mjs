// ============================================================================
// scripts/gen-voice.mjs — Keego 러닝 음성 코칭 클립 생성기 (오프라인 번들용 1회 도구)
// ============================================================================
// ElevenLabs(Anna Kim, 한국어)로 고정 문구 + 숫자/단위 조각을 미리 생성해 assets/voice/ 에
// <id>.mp3 로 떨군다. 앱은 이 파일들을 번들해 *오프라인*으로 이어붙여 재생한다(런타임 API 0).
//
// 사용:  node scripts/gen-voice.mjs            (.elevenkey 에서 키 읽음, 기존 파일은 건너뜀)
//        node scripts/gen-voice.mjs --force    (전부 재생성)
//
// 비밀: 키는 .elevenkey(gitignored)에서만 읽고 어디에도 출력하지 않는다.
// ============================================================================
import {readFileSync, existsSync, mkdirSync, writeFileSync, statSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'voice');
const VOICE_ID = 'YDseIkMzKtO5bK1Ehnev'; // Hanabad - Calm & Friendly (ko, seoul, young/confident) — 사용자 선택
const MODEL = 'eleven_multilingual_v2'; // 사용자 선택 — 억양이 더 평탄·일정(안내방송 톤)
const FORCE = process.argv.includes('--force');

const KEY = readFileSync(join(ROOT, '.elevenkey'), 'utf8').trim();

// 0..100 한자어 수 읽기(분/초/퍼센트 공용).
function koNum(n) {
  if (n <= 0) return '영';
  if (n === 100) return '백';
  const ones = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const tens = ['', '십', '이십', '삼십', '사십', '오십', '육십', '칠십', '팔십', '구십'];
  return `${tens[Math.floor(n / 10)]}${ones[n % 10]}`;
}

// ── 클립 목록 {id, text}. id 가 곧 파일명(앱 player 와의 계약). ──────────────────
const clips = [];
const add = (id, text) => clips.push({id, text});

// 고정 큐(완성 문장) — 앱의 보이스 personality. 톤: 따뜻하고 담백한 러닝 메이트.
add('start', '운동을 시작합니다.');
add('auto_pause', '일시 정지합니다.');
add('resume', '운동을 재개합니다.');
add('half', '절반 지점입니다.');
add('last_km', '마지막 일 킬로미터입니다.');
add('goal', '목표를 달성했습니다.');
add('finish', '운동을 종료합니다. 수고하셨습니다.');
add('gps_weak', '지피에스 신호가 약합니다.');
// 시그니처(신발·부상) — 사실 안내(격려 없이).
add('sig_injury_high', '오늘은 부하가 높습니다. 가볍게 달려보세요.');
add('sig_injury_caution', '컨디션을 살피며 달려보세요.');
add('sig_shoe_due', '신발 교체 시기가 다가왔습니다.');
// 연결 라벨.
add('lbl_pace', '페이스');
add('lbl_avg_pace', '평균 페이스');
add('lbl_remaining', '남은 거리');
add('lbl_shoe_life', '신발 남은 수명');
// 거리 "{n}킬로미터" 1..42(마라톤).
for (let n = 1; n <= 42; n++) add(`km_${n}`, `${koNum(n)} 킬로미터`);
// 페이스 분 "{m}분" 1..12.
for (let m = 1; m <= 12; m++) add(`min_${m}`, `${koNum(m)} 분`);
// 페이스 초 "{s}초" 1..59 (정각은 분만 말함).
for (let s = 1; s <= 59; s++) add(`sec_${s}`, `${koNum(s)} 초`);
// 신발 남은 수명 "{p}퍼센트" 0..100 step5(반올림해 사용).
for (let p = 0; p <= 100; p += 5) add(`pct_${p}`, `${koNum(p)} 퍼센트`);

async function tts(text) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {'xi-api-key': KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        text,
        model_id: MODEL,
        // 코치 톤: 안정적이고 또렷하게(stability↑, style 약간).
        voice_settings: {stability: 1.0, similarity_boost: 0.9, use_speaker_boost: true},
      }),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`${res.status} ${msg.slice(0, 160)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, {recursive: true});
  console.log(`clips: ${clips.length}  voice: Anna Kim(${VOICE_ID})  out: assets/voice/`);
  let made = 0, skipped = 0, failed = 0;
  for (const {id, text} of clips) {
    const file = join(OUT_DIR, `${id}.mp3`);
    if (!FORCE && existsSync(file) && statSync(file).size > 2000) {
      skipped++;
      continue;
    }
    try {
      const buf = await tts(text);
      writeFileSync(file, buf);
      made++;
      process.stdout.write(`  ✓ ${id} (${buf.length}b) "${text}"\n`);
      await sleep(250); // rate-limit 여유
    } catch (e) {
      failed++;
      process.stdout.write(`  ✗ ${id}: ${e.message}\n`);
      if (String(e.message).includes('paid_plan_required')) {
        console.log('\n>>> 라이브러리 목소리는 유료 플랜이 필요해요. ElevenLabs 업그레이드 후 다시 실행하세요.');
        break;
      }
    }
  }
  console.log(`\n완료: 생성 ${made} · 건너뜀 ${skipped} · 실패 ${failed}`);
}
main();
