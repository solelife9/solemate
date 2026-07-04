// ─── GPX 내보내기 — 기록된 경로를 표준 GPX 1.1 파일로(2026-07-05) ──────────────
// 결핍 감사 #6: 경로(route_<id>)는 저장되는데 밖으로 꺼낼 길이 없었다("내 데이터는
// 내 것" — 가민/스트라바 이관·아카이빙). 저장된 {lat,lon} 점열을 유효한 GPX 로
// 직렬화해 공유 시트로 내보낸다. 두 층으로 분리해 네이티브 없이 검증한다:
//   · buildGpx  — 순수 문자열 생성(테스트가 XML 을 직접 단언).
//   · exportGpx — 파일 쓰기 + RN Share(네이티브, no-throw graceful).

import {Share} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {type LatLon} from './route';

/** XML 특수문자 이스케이프(name/creator 에 사용자 텍스트가 들어갈 수 있다). */
function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 파일명 안전화 — 영숫자·하이픈만 남기고 나머지는 하이픈으로. 빈 값이면 'run'. */
export function safeFileStem(s: string): string {
  const cleaned = String(s).trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'run';
}

export interface GpxMeta {
  /** 트랙 이름(예: '7월 5일 · ASICS Novablast 5'). */
  name?: string;
  /** 메타데이터 시각(ISO 8601). 없으면 <time> 생략. */
  timeISO?: string;
}

/**
 * {lat,lon} 점열 → GPX 1.1 XML 문자열. 점이 없어도 유효한(빈 트랙) GPX 를 낸다.
 * 좌표는 소수 6자리(≈0.1m)로 절삭. 비유효 좌표(NaN/범위 밖)는 건너뛴다.
 */
export function buildGpx(points: LatLon[], meta: GpxMeta = {}): string {
  const name = meta.name ? xmlEscape(meta.name) : 'Keego Run';
  const pts = (Array.isArray(points) ? points : []).filter(
    p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180,
  );
  const trkpts = pts
    .map(p => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"></trkpt>`)
    .join('\n');
  const metaTime = meta.timeISO ? `\n    <time>${xmlEscape(meta.timeISO)}</time>` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="Keego" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <metadata>\n    <name>${name}</name>${metaTime}\n  </metadata>\n` +
    `  <trk>\n    <name>${name}</name>\n    <trkseg>\n` +
    (trkpts ? trkpts + '\n' : '') +
    `    </trkseg>\n  </trk>\n</gpx>\n`
  );
}

export type GpxExportResult = {ok: true} | {ok: false; reason: string};

/**
 * GPX 를 캐시 파일로 쓰고 공유 시트로 내보낸다. 실패는 삼켜 사유와 함께 돌려준다
 * (호출부가 안내만, 절대 비차단). 점 2개 미만이면 내보낼 코스가 없다고 알린다.
 */
export async function exportGpx(
  runId: string,
  points: LatLon[],
  meta: GpxMeta = {},
): Promise<GpxExportResult> {
  try {
    const valid = (Array.isArray(points) ? points : []).filter(
      p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon),
    );
    if (valid.length < 2) return {ok: false, reason: 'no_route'};
    const dir = FileSystem.cacheDirectory;
    if (!dir) return {ok: false, reason: 'no cacheDirectory'};
    const xml = buildGpx(valid, meta);
    const fileUri = `${dir}keego-${safeFileStem(runId)}.gpx`;
    await FileSystem.writeAsStringAsync(fileUri, xml, {encoding: FileSystem.EncodingType.UTF8});
    await Share.share({url: fileUri});
    return {ok: true};
  } catch (e) {
    return {ok: false, reason: (e as Error)?.message ?? 'unknown'};
  }
}
