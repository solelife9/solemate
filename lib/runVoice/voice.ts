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
  // shouldPlayInBackground: 화면 잠금/주머니 러닝 중에도 km 안내가 나오게 한다
  // (Info.plist UIBackgroundModes 'audio' 와 쌍 — 나이키/스트라바 동일 구성).
  try {
    await setAudioModeAsync({playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: true});
  } catch {
    /* 오디오 모드 설정 실패는 비치명적 */
  }
}

// 재생 볼륨(0~1) — 설정(VoiceSettings.volume)이 runVoice.setVolume 으로 주입한다.
let clipVolume = 1;

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
      player.volume = clipVolume; // 설정 볼륨(3단) — 마스터링된 클립 기준 상대 감쇠
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

/** 페이스(초/km) → ['lbl_pace'|'lbl_avg_pace','min_M','sec_S']. 범위 밖이면 음성 생략(화면엔 보임). */
function paceIds(secPerKm: number | null | undefined, basis: 'split' | 'avg' = 'split'): string[] {
  if (secPerKm == null || secPerKm <= 0) return [];
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  if (m < 1 || m > 12) return [];
  const out = [basis === 'avg' ? 'lbl_avg_pace' : 'lbl_pace', `min_${m}`];
  if (s >= 1 && s <= 59) out.push(`sec_${s}`);
  return out;
}

/** 총 경과시간(초) → ['lbl_elapsed', ('hr_H')?, ('min_M')?, ('sec_S')?].
 *  시간 단위가 있으면 초는 생략(안내 간결 — NRC 동일). 6시간 초과·비정상은 생략. */
function timeIds(elapsedSec: number | null | undefined): string[] {
  if (elapsedSec == null || !Number.isFinite(elapsedSec) || elapsedSec < 1) return [];
  const total = Math.round(elapsedSec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 6) return [];
  const out = ['lbl_elapsed'];
  if (h >= 1) out.push(`hr_${h}`);
  if (m >= 1) out.push(`min_${m}`);
  if (h === 0 && s >= 1) out.push(`sec_${s}`);
  return out.length > 1 ? out : [];
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
  /** km 안내: "N킬로미터, (평균) 페이스 M분 S초, (경과 시간 …)" (+ 절반/마지막 구간이면
   *  이어서). 한 시퀀스로 묶어 중간에 끊기지 않게 한다. paceSec=null 이면 페이스 생략
   *  (설정 off), elapsedSec 미지정이면 경과시간 생략(설정 off) — 탑티어 패리티 #14. */
  kmCue(
    n: number,
    paceSec: number | null,
    opts?: {half?: boolean; lastKm?: boolean; elapsedSec?: number | null; paceBasis?: 'split' | 'avg'},
  ) {
    if (n < 1 || n > 42) return;
    const ids = [`km_${n}`, ...paceIds(paceSec, opts?.paceBasis ?? 'split'), ...timeIds(opts?.elapsedSec)];
    if (opts?.half) ids.push('half');
    if (opts?.lastKm) ids.push('last_km');
    this.play(ids);
  },
  /** 반 km 안내(주기 0.5km 전용): 0.5="오백 미터", X.5="X 점 오 킬로미터". 페이스는 평균
   *  기준(반 km 구간 페이스는 산출하지 않음 — 라벨이 '평균 페이스'라 오해 없음). */
  halfKmCue(halfKm: number, avgPaceSec: number | null, elapsedSec?: number | null) {
    const distId = halfKm === 0.5 ? 'm_500' : Number.isInteger(halfKm - 0.5) && halfKm < 42 ? `kmh_${Math.floor(halfKm)}` : null;
    if (!distId) return;
    this.play([distId, ...paceIds(avgPaceSec, 'avg'), ...timeIds(elapsedSec)]);
  },
  /** 심박존 코칭(#7): 목표 존보다 높음 → "천천히, 존 N로 낮춰 보세요"(zone_down_N). */
  zoneDown(targetZone: number) {
    if (targetZone >= 2 && targetZone <= 4) this.play([`zone_down_${targetZone}`]);
  },
  /** 목표 존보다 낮음 → "조금만 올려요, 존 N 페이스로"(zone_up_N). */
  zoneUp(targetZone: number) {
    if (targetZone >= 2 && targetZone <= 4) this.play([`zone_up_${targetZone}`]);
  },
  /** 설정 볼륨(0~1) 주입 — 다음 재생부터 적용. */
  setVolume(v: number) {
    if (Number.isFinite(v) && v > 0 && v <= 1) clipVolume = v;
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
  /** 스피드 코칭 — 현재 km 목표 대비. 느림=올려보세요 / 빠름=빠릅니다 / 적정. */
  paceSlow() {
    this.play(['pace_slow']);
  },
  paceFast() {
    this.play(['pace_fast']);
  },
  paceOn() {
    this.play(['pace_on']);
  },
  /** 진행 중 시퀀스 취소(런 종료/중단 시). */
  stop() {
    token++;
  },
};
