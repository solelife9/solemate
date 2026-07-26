// ─── GPX 가져오기 — 다른 앱의 러닝 이력을 keego 로 (2026-07-27) ────────────────
// 왜: 기존 앱을 쓰던 러너가 keego 를 설치하면 첫 화면이 텅 빈다. 몇 년치 기록을 두고
// 와야 한다는 뜻이라, 그 자리에서 이탈한다. 내보내기(lib/gpx)는 이미 있는데 들어오는
// 길이 없었다("내 데이터는 내 것"은 양방향이어야 한다).
//
// 이 파일은 **순수 파서**만 담는다. 파일 선택(문서 피커)은 새 네이티브 의존성이라
// 사전 승인이 필요해 아직 붙이지 않았다 — 파서가 준비돼 있으면 배선은 한 단계다.
//
// ── 왜 정규식인가 ───────────────────────────────────────────────────────────
// React Native 에는 DOMParser 가 없다(브라우저 API). XML 파서를 새로 들이는 것도
// 의존성이라, 대상 문법이 좁고 안정적인 GPX trkpt 에 한해 정규식으로 읽는다.
// 대신 실제 파일에서 마주치는 변형을 폭넓게 받아들인다:
//   · 속성 순서 뒤바뀜(lon 먼저), 작은따옴표, 네임스페이스 접두사(<gpx:trkpt>)
//   · <trkseg> 여러 개(일시정지로 끊긴 구간) → 하나로 합친다
//   · <trkpt> 가 없으면 <rtept>(경로) → <wpt>(지점) 순으로 폴백
//   · 시간·고도는 있으면 쓰고 없으면 없는 대로(거리만으로도 가져올 가치가 있다)
//
// 알려진 한계(의도적): CDATA·주석 안에 든 가짜 trkpt, 좌표계 변환, 확장(extensions)의
// 심박·케이던스는 다루지 않는다. 확장 데이터가 필요해지면 그때 파서를 승격한다.

import {calcDist} from './geo';
import {type LatLon} from './route';

export interface GpxTrackPoint extends LatLon {
  /** 이 점의 시각(ms epoch). GPX 에 <time> 이 없으면 null. */
  timeMs: number | null;
  /** 고도(m). <ele> 가 없으면 null. */
  eleM: number | null;
}

export interface ParsedGpx {
  points: GpxTrackPoint[];
  /** <metadata><name> 또는 <trk><name>. 없으면 ''. */
  name: string;
  /** 첫 점의 시각(ms). 시간 정보가 없으면 null. */
  startMs: number | null;
  /** 이동 거리(km) — 인접 점 거리의 합. */
  distanceKm: number;
  /** 첫~마지막 점의 경과초. 시간 정보가 없으면 0. */
  durationSec: number;
  /** 누적 상승 고도(m). 고도 정보가 없으면 0. */
  elevGainM: number;
}

export type GpxParseResult =
  | {ok: true; data: ParsedGpx}
  | {ok: false; reason: 'empty' | 'not_gpx' | 'no_points'};

/** 고도 잡음 무시 임계(m) — 이보다 작은 상승은 세지 않는다(GPS 고도 흔들림). */
const ELEV_NOISE_M = 3;

/** 한 점이 이 이상 튀면 버린다(km) — 손상 파일의 좌표 오류 방어. */
const MAX_JUMP_KM = 1;

/** 태그 이름을 네임스페이스 접두사와 무관하게 매칭하는 정규식 조각. */
const ns = (tag: string) => `(?:\\w+:)?${tag}`;

/** 여는 태그의 속성에서 숫자 속성 하나를 뽑는다(따옴표 종류 무관). */
function attrNum(tagText: string, attr: string): number | null {
  const m = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tagText);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/** 요소 안의 자식 태그 텍스트를 뽑는다(첫 번째 것). */
function childText(block: string, tag: string): string | null {
  const m = new RegExp(`<${ns(tag)}[^>]*>([\\s\\S]*?)</${ns(tag)}>`, 'i').exec(block);
  return m ? m[1].trim() : null;
}

/** ISO 시각 문자열 → ms. 파싱 불가면 null. */
function parseTimeMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * 같은 이름의 점 태그를 모두 뽑는다. 자기닫힘(`<trkpt .../>`)과 본문 있는 형태를 모두 받는다.
 */
function extractPoints(xml: string, tag: string): GpxTrackPoint[] {
  const out: GpxTrackPoint[] = [];
  const re = new RegExp(`<${ns(tag)}\\b([^>]*?)(/>|>([\\s\\S]*?)</${ns(tag)}>)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const body = m[3] ?? '';
    const lat = attrNum(attrs, 'lat');
    const lon = attrNum(attrs, 'lon');
    if (lat == null || lon == null) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleRaw = body ? childText(body, 'ele') : null;
    const eleM = eleRaw != null && Number.isFinite(Number(eleRaw)) ? Number(eleRaw) : null;
    out.push({lat, lon, timeMs: parseTimeMs(body ? childText(body, 'time') : null), eleM});
  }
  return out;
}

/**
 * GPX 문자열을 읽어 점열과 요약을 낸다. 절대 throw 하지 않는다 —
 * 사용자가 고른 파일이 무엇이든 앱이 죽으면 안 된다.
 */
export function parseGpx(xml: string | null | undefined): GpxParseResult {
  const text = String(xml ?? '').trim();
  if (!text) return {ok: false, reason: 'empty'};
  if (!/<(?:\w+:)?gpx\b/i.test(text)) return {ok: false, reason: 'not_gpx'};

  // trkpt(트랙) → rtept(경로) → wpt(지점) 순으로 폴백.
  let points = extractPoints(text, 'trkpt');
  if (points.length === 0) points = extractPoints(text, 'rtept');
  if (points.length === 0) points = extractPoints(text, 'wpt');
  if (points.length === 0) return {ok: false, reason: 'no_points'};

  const name = childText(text, 'name') ?? '';

  // 거리·고도 — 인접 점을 순회한다. 좌표가 크게 튀는 구간은 손상으로 보고 거리에서 뺀다
  // (점 자체는 남긴다 — 지도에서 보이는 편이 사용자에게 정직하다).
  let distanceKm = 0;
  let elevGainM = 0;
  let lastEle: number | null = null;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const a = points[i - 1];
      const b = points[i];
      const d = calcDist(a.lat, a.lon, b.lat, b.lon);
      if (Number.isFinite(d) && d <= MAX_JUMP_KM) distanceKm += d;
    }
    const ele = points[i].eleM;
    if (ele != null) {
      if (lastEle != null && ele - lastEle >= ELEV_NOISE_M) elevGainM += ele - lastEle;
      lastEle = ele;
    }
  }

  const timed = points.filter(p => p.timeMs != null);
  const startMs = timed.length ? (timed[0].timeMs as number) : null;
  const endMs = timed.length ? (timed[timed.length - 1].timeMs as number) : null;
  const durationSec =
    startMs != null && endMs != null && endMs > startMs ? Math.round((endMs - startMs) / 1000) : 0;

  return {
    ok: true,
    data: {
      points,
      name,
      startMs,
      distanceKm: Math.round(distanceKm * 1000) / 1000,
      durationSec,
      elevGainM: Math.round(elevGainM),
    },
  };
}

/** 파싱 결과를 러닝 레코드 저장에 필요한 최소 형태로 옮긴다(경로 문자열 + 요약). */
export function gpxToRunInput(data: ParsedGpx): {
  route: string;
  km: number;
  durationSec: number;
  elevationM: number;
  dateYmd: string | null;
} {
  const route = JSON.stringify(data.points.map(p => ({lat: p.lat, lon: p.lon})));
  const d = data.startMs != null ? new Date(data.startMs) : null;
  const dateYmd = d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : null;
  return {
    route,
    km: data.distanceKm,
    durationSec: data.durationSec,
    elevationM: data.elevGainM,
    dateYmd,
  };
}
