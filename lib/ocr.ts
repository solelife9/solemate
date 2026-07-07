// ============================================================================
// lib/ocr.ts — 기록증 OCR 파서 + 인식기 인터페이스
//
// 온디바이스 텍스트 인식기(네이티브: Apple Vision / ML Kit)가 뱉은 '텍스트 라인들'에서
// 라벨 앵커로 공식 기록·페이스·거리·BIB 를 뽑는다. 파서는 순수 로직이라 인식기와 무관하게
// 테스트된다(타이밍 시스템별 레이아웃 편차는 확인 폼 수정 + 직접 입력으로 흡수).
//
// 예(강화해변마라톤 SMART CHIP): "TIME 01:20:32", "Pace 08:03 min/km",
// "10km BIB 5224", 스플릿 표 "5.0km 00:37:50 10:15:17 07:34" …
// ============================================================================
import type {RaceDistance} from '../data/raceEvents';

export interface CertFields {
  /** 공식 기록(초) — 완주 시간(가장 큰 HH:MM:SS 를 완주로 본다). */
  officialTimeSec?: number;
  /** 1km 페이스(초). "Pace 08:03" 또는 min/km 표기. */
  paceSec?: number;
  /** 인식된 거리(km) — 종목 매핑용. */
  distanceKm?: number;
  /** 매핑된 표준 종목. */
  distance?: RaceDistance;
  /** 배번호. "BIB 5224". */
  bib?: string;
}

/** "HH:MM:SS" 또는 "MM:SS" → 초. 실패 시 null. */
export function parseClock(s: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  if (mm > 59 || ss > 59) return null;
  return h * 3600 + mm * 60 + ss;
}

/** km 실측 → 표준 종목(±5% 관대 — 기록증 거리는 표기 반올림이 흔함). */
export function distanceToStandard(km: number): RaceDistance | undefined {
  const near = (t: number) => Math.abs(km - t) / t <= 0.05;
  if (near(42.195)) return 'full';
  if (near(21.0975)) return 'half';
  if (near(10)) return '10k';
  if (near(5)) return '5k';
  return undefined;
}

// 시각(초) 분류 범위. 페이스(2~15분/km)와 완주 시간(15분~6시간)을 분리하고, 그 사이·바깥을
// 제거해 기록증의 함정을 피한다: 스플릿(완주보다 작음) / '패스 타임'=시계-of-day(예 10:57:59
// = 6시간 초과) / 페이스(너무 작음)를 자동 배제한다. 완주 = 이 범위 내 '최댓값'.
const PACE_MIN = 120;      // 2:00/km
const PACE_MAX = 900;      // 15:00/km
const FINISH_MIN = 900;    // 15:00 (5k 도 대개 15분↑)
const FINISH_MAX = 21600;  // 6:00:00 (그 이상은 시계-of-day/울트라 → 배제, 확인 폼서 수정)

/**
 * 인식된 텍스트(여러 라인 or 통짜 문자열)에서 기록증 필드를 라벨 앵커로 추출한다.
 * - officialTime: 라벨(TIME/기록/완주) 인접 시각 우선, 없으면 가장 큰 HH:MM:SS.
 * - pace: 라벨(Pace/페이스) 인접 MM:SS, 없으면 페이스 범위(2~15분) 시각 중 하나.
 * - distance: "NNkm"/"NN.Nkm" 최댓값(완주 거리) → 표준 종목.
 * - bib: 라벨(BIB/배번) 인접 3~6자리 숫자.
 */
export function parseCertText(text: string): CertFields {
  const raw = text.replace(/\r/g, '\n');
  const lower = raw.toLowerCase();
  const out: CertFields = {};

  // 모든 시각 토큰 수집(위치 포함).
  const clocks: {sec: number; idx: number; str: string}[] = [];
  const clockRe = /(\d{1,2}:\d{1,2}:\d{2}|\d{1,2}:\d{2})/g;
  for (let m; (m = clockRe.exec(raw)); ) {
    const sec = parseClock(m[1]);
    if (sec != null) clocks.push({sec, idx: m.index, str: m[1]});
  }

  // ── 페이스 ── 라벨 'pace'/'페이스' 뒤 가장 가까운 MM:SS(페이스 범위).
  const paceLabel = /(pace|페이스)/gi;
  let paceHit: number | undefined;
  for (let m; (m = paceLabel.exec(lower)); ) {
    const after = clocks
      .filter((c) => c.idx >= m.index && c.sec >= PACE_MIN && c.sec <= PACE_MAX)
      .sort((a, b) => a.idx - b.idx)[0];
    if (after) { paceHit = after.sec; break; }
  }
  if (paceHit == null) {
    // 라벨 못 찾으면 페이스 범위 시각 중 첫 번째(완주 시간과 구분).
    const p = clocks.find((c) => c.sec >= PACE_MIN && c.sec <= PACE_MAX);
    if (p) paceHit = p.sec;
  }
  if (paceHit != null) out.paceSec = paceHit;

  // ── 완주 시간 ── 15분~6시간 범위의 '최댓값'. 라벨 앵커를 안 쓰는 이유: 기록증엔 'TIME'
  // 열 헤더가 스플릿 시각 위에 오고, 'PASS TIME'(시계-of-day, 예 10:57:59=6시간 초과)이
  // 완주보다 큰 함정이 흔하다. 범위-최댓값이면 스플릿(더 작음)·페이스(더 작음)·시계-of-day
  // (범위 초과)를 한 번에 배제하고 완주만 남는다.
  const finishers = clocks.filter((c) => c.sec >= FINISH_MIN && c.sec <= FINISH_MAX);
  if (finishers.length) out.officialTimeSec = Math.max(...finishers.map((c) => c.sec));

  // ── 거리 ── "NN.NNNkm"/"NNkm" 최댓값(완주 거리) → 표준 종목. \b 로 큰 수 일부 매칭
  // 방지("42.195km" 전체 매칭), (?!\/?h) 로 속도 "7.5 km/h" 배제.
  let maxKm: number | undefined;
  const kmRe = /\b(\d{1,3}(?:\.\d{1,3})?)\s*km(?!\/?h)/gi;
  for (let m; (m = kmRe.exec(lower)); ) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && (maxKm == null || v > maxKm)) maxKm = v;
  }
  if (maxKm != null) {
    out.distanceKm = maxKm;
    out.distance = distanceToStandard(maxKm);
  }

  // ── BIB ── 라벨 'bib'/'배번' 뒤 3~6자리 숫자.
  const bibM = /(?:bib|배번(?:호)?)\D{0,6}(\d{3,6})/i.exec(raw);
  if (bibM) out.bib = bibM[1];

  return out;
}

// ── 네이티브 인식기 인터페이스 ────────────────────────────────────────────────
// 실제 이미지→텍스트는 온디바이스 네이티브 모듈이 담당(다음 단계에서 배선). 파서는
// 그 결과 문자열만 받으므로, 인식기 미링크 빌드에서도 파서·화면은 안 죽는다(직접 입력 폴백).
export interface TextRecognizer {
  /** 이미지 URI → 인식된 전체 텍스트(라인 개행 포함). 실패 시 reject. */
  recognize(imageUri: string): Promise<string>;
}

/** 이미지에서 기록증 필드 추출(인식기 주입). 인식 실패는 상위에서 직접 입력으로 폴백. */
export async function extractCertFields(recognizer: TextRecognizer, imageUri: string): Promise<CertFields> {
  const text = await recognizer.recognize(imageUri);
  return parseCertText(text);
}
