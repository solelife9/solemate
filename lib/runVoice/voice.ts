// ============================================================================
// lib/runVoice/voice.ts — 러닝 음성 코칭 재생 엔진 (오프라인, 번들 클립 이어붙임)
// ============================================================================
// scripts/gen-voice.mjs 가 ElevenLabs(Hanabad, eleven_v3)로 미리 만든 클립(assets/voice/<id>.mp3)
// 을 큐에 따라 *순서대로* 재생한다. 런타임 네트워크 0. 새 큐가 오면 진행 중 시퀀스를 취소한다.
//
// 멘트 톤: 나이키 자동안내 스타일(-습니다, 사실 위주, 격려 멘트 없음).
// 큐 빌더가 이벤트→클립 id 시퀀스로 옮긴다. 숫자(km/분/초)는 조각을 이어 붙인다.
// ============================================================================
import {createAudioPlayer, setAudioModeAsync} from 'expo-audio';
import {CLIPS} from './clips';

let modeReady = false;
async function ensureMode(): Promise<void> {
  if (modeReady) return;
  modeReady = true;
  // 무음 모드에서도 들리게 + 음악은 잠시 줄였다(덕킹) 코칭 후 복귀.
  try {
    await setAudioModeAsync({playsInSilentMode: true, interruptionMode: 'duckOthers'});
  } catch {
    /* 오디오 모드 설정 실패는 비치명적 */
  }
}

/** 클립 하나를 끝까지 재생(끝 신호나 6s 안전타임아웃에 resolve). */
function playClip(source: number): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    let player: ReturnType<typeof createAudioPlayer> | null = null;
    let sub: {remove: () => void} | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer); // 안전 타이머 정리(누수 방지)
      try {
        sub?.remove();
      } catch {/* noop */}
      try {
        player?.remove();
      } catch {/* noop */}
      resolve();
    };
    try {
      player = createAudioPlayer(source);
      sub = player.addListener('playbackStatusUpdate', (s: {didJustFinish?: boolean}) => {
        if (s?.didJustFinish) finish();
      });
      player.play();
    } catch {
      finish();
      return;
    }
    timer = setTimeout(finish, 6000); // 클립은 전부 짧음 — 끝 신호 유실 대비 안전장치
  });
}

// 새 큐가 오면 이전 시퀀스를 취소하기 위한 토큰(겹치는 안내 방지).
let token = 0;
async function playSequence(ids: string[]): Promise<void> {
  await ensureMode();
  const mine = ++token;
  for (const id of ids) {
    if (mine !== token) return; // 더 최신 큐가 들어옴 → 중단
    const src = CLIPS[id];
    if (src != null) await playClip(src);
  }
}

/** 페이스(초/km) → ['lbl_pace','min_M', 'sec_S']. 범위 밖이면 음성 생략(화면엔 보임). */
function paceIds(secPerKm: number | null | undefined): string[] {
  if (secPerKm == null || secPerKm <= 0) return [];
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  if (m < 1 || m > 12) return [];
  const out = ['lbl_pace', `min_${m}`];
  if (s >= 1 && s <= 59) out.push(`sec_${s}`);
  return out;
}

/** 음성 코칭 공개 API. App 의 런 화면이 이벤트마다 호출한다. enabled=false 면 전부 no-op. */
export const runVoice = {
  enabled: true,
  play(ids: string[]) {
    if (this.enabled && ids.length) void playSequence(ids);
  },
  start() {
    this.play(['start']);
  },
  autoPause() {
    this.play(['auto_pause']);
  },
  resume() {
    this.play(['resume']);
  },
  half() {
    this.play(['half']);
  },
  lastKm() {
    this.play(['last_km']);
  },
  goal() {
    this.play(['goal']);
  },
  finish() {
    this.play(['finish']);
  },
  gpsWeak() {
    this.play(['gps_weak']);
  },
  /** km 안내: "N킬로미터, 페이스 M분 S초" (+ 절반/마지막 구간이면 이어서). 한 시퀀스로 묶어
   *  중간에 끊기지 않게 한다. splitPaceSec=직전 1km 구간 페이스(초/km). */
  kmCue(n: number, splitPaceSec: number | null, opts?: {half?: boolean; lastKm?: boolean}) {
    if (n < 1 || n > 42) return;
    const ids = [`km_${n}`, ...paceIds(splitPaceSec)];
    if (opts?.half) ids.push('half');
    if (opts?.lastKm) ids.push('last_km');
    this.play(ids);
  },
  injuryHigh() {
    this.play(['sig_injury_high']);
  },
  injuryCaution() {
    this.play(['sig_injury_caution']);
  },
  shoeDue() {
    this.play(['sig_shoe_due']);
  },
  /** 진행 중 시퀀스 취소(런 종료/중단 시). */
  stop() {
    token++;
  },
};
