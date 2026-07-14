// ─── 런 공유 카드(이미지) — 필드 매핑(순수) + dataURL 캡처 경로 ──────────────────
// 런 상세의 '카드 공유' 버튼이 거리/페이스/시간/신발명/미니 코스맵을 react-native-svg
// 카드로 그린 뒤, Svg ref의 toDataURL()로 PNG dataURL을 만들어 RN Share로 내보낸다.
//
// 새 네이티브 의존(view-shot 등)은 추가하지 않는다 — 이미 설치된 react-native-svg의
// Svg.toDataURL만 사용한다. 이 파일은 다음 두 가지를 네이티브 없이 검증 가능하게 분리한다:
//   1) buildShareCardModel — 런 한 건 → 카드 표시 필드(순수함수, 단위 테스트)
//   2) captureCardDataUrl  — Svg ref → 'data:image/png;base64,…' (콜백→Promise 래핑)
// 캔버스 자체는 jest.setup의 Svg 목이 toDataURL을 흉내 내므로 경로를 그대로 테스트한다.

import {Share} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
// saveToLibraryAsync 는 메인 export 에서 deprecated(throw) — 레거시 API 를 쓴다(SDK 56).
import * as MediaLibrary from 'expo-media-library/legacy';
import {Unit, displayNum} from './units';
import {buildRunShareText, RunShareInput} from './share';
import {fmtPace, fmtTime} from './format';
import type {Recap} from './recap';
import type {PersonalRecords} from './goals';

export interface ShareCardInput {
  /** 거리 — 저장 표준 km. 표시 단위로 환산해 출력한다. */
  distKm: number;
  /** 표시 단위(km|mi). 기본 'km'. */
  unit?: Unit;
  /** 이미 포맷된 평균 페이스(예: `5'02"`). 비었거나 '--'면 칸 생략. */
  pace?: string;
  /** 이미 포맷된 시간(예: `40:41`). 비었거나 '--'면 칸 생략. */
  time?: string;
  /** 신발 브랜드(예: NIKE). 모델과 합쳐 한 줄로 표시. */
  shoeBrand?: string;
  /** 신발 모델(예: Pegasus 41). */
  shoeModel?: string;
  /** 러닝 날짜 라벨(예: `5월 28일 수요일`). 비면 생략. */
  date?: string;
  /** 사용자가 러닝 직후 찍은/고른 배경 사진 URI(없으면 무드 다크 배경으로 폴백). */
  photoUri?: string;
  /** 러닝 소요 초. 있으면 카드 TIME 을 항상 6자리 HH:MM:SS 로 표기한다(레퍼런스 톤). */
  durationS?: number;
  /** 트랙 세션이면 랩 정보(있으면 카드에 LAPS 칸 추가 — 거리=랩수×확정랩거리). */
  track?: {lapM: number; laps: number} | null;
}

/** 항상 6자리 HH:MM:SS(시 2자리 0패딩). 카드 TIME 전용 — fmtTime 은 시<1h 면 MM:SS 라 별도. */
function hms(s: number): string {
  const t = Number.isFinite(s) && s > 0 ? Math.floor(s) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export interface ShareCardStat {
  label: string;
  value: string;
}

export interface ShareCardModel {
  /** 거리 숫자 문자열(표시 단위 환산, 소수 2자리). 예: '5.20'. */
  distance: string;
  /** 거리 단위 라벨('km'|'mi'). */
  unit: string;
  /** 페이스·시간 등 부가 지표(의미 없는 '--' 값은 빠진다). */
  stats: ShareCardStat[];
  /** 신발명(브랜드+모델, 둘 다 없으면 ''). */
  shoe: string;
  /** 날짜 라벨('' 가능). */
  date: string;
  /** 배경 사진 URI(없으면 undefined → 무드 다크 배경). */
  photoUri?: string;
  /** Keego 워드마크. */
  brand: string;
  /** keep-going 응원 한 줄. */
  tagline: string;
  /** 해시태그 푸터. */
  hashtag: string;
}

const BRAND = 'Keego';
const TAGLINE = '오늘도 한 걸음 더 — keep going';
const HASHTAG = '#Keego #keepgoing';

// ─── 공유 카드 템플릿·포맷·크기(순수 registry — picker/렌더 공용, 테스트 가능) ───────
// 사용자는 공유 시 여러 템플릿을 넘겨보며 고른다. 기본(가장 많이 씀)=클래식이 1번.
// 전부 '투명 스티커'(배경 없음, 피드·세로형 모두) — 러너는 자기 상황에 맞는 사진을 인스타에
// 올린 뒤 그 위에 이 카드를 얹어 크기를 조절한다. 그래서 사진을 카드 안에 넣는 템플릿은 없다.
// 템플릿은 '어떤 요소를 담느냐'만 다르다(지도·지표 on/off, 히어로 강조).
export type RunCardTemplate = 'classic' | 'hero' | 'minimal' | 'stats' | 'route';

/** picker 노출 순서 — 클래식이 맨 앞(기본 선택, 가장 많이 씀). */
export const RUN_CARD_TEMPLATES: RunCardTemplate[] = ['classic', 'hero', 'minimal', 'stats', 'route'];

export const RUN_CARD_TEMPLATE_LABEL: Record<RunCardTemplate, string> = {
  classic: '클래식',
  hero: '히어로',
  minimal: '미니멀',
  stats: '스탯',
  route: '지도',
};

/** 피드(4:5) / 세로형 스토리(9:16). 어느 템플릿에도 적용된다(둘 다 투명). */
export type RunCardFormat = 'feed' | 'story';

export const RUN_CARD_FORMAT_LABEL: Record<RunCardFormat, string> = {
  feed: '피드',
  story: '세로형',
};

// 배경 — 두 공유 흐름을 모두 커버한다:
//  · transparent(기본): 배경 없는 스티커. 인스타에 사진을 올리고 그 위에 얹는다(흰 글씨·경로).
//  · dark(완성본): 다크 배경에 파파야 경로로 그 자체가 완성된 이미지. 인스타를 안 거치고
//    카카오톡·문자 등으로 바로 공유하는 사람용.
export type RunCardBackground = 'transparent' | 'dark';

export const RUN_CARD_BACKGROUND_LABEL: Record<RunCardBackground, string> = {
  transparent: '투명',
  dark: '다크',
};

/** 캔버스 픽셀 크기(폭 1080 고정, 높이만 비율에 따라). feed=4:5, story=9:16. */
export function runCardDimensions(format: RunCardFormat): {w: number; h: number} {
  return format === 'story' ? {w: 1080, h: 1920} : {w: 1080, h: 1350};
}

/** 템플릿이 보여주는 요소들(렌더 분기·picker 썸네일 공용). heroDistance면 거대 거리 숫자를
 *  히어로로 올리고, 이때 스탯 행은 거리를 빼고 페이스·시간만 보인다(중복 방지). */
export interface RunCardElements {
  map: boolean;
  statsRow: boolean;
  heroDistance: boolean;
  /** 스탯 행에 거리 칸을 포함하는가(히어로가 거리를 이미 크게 보이면 false). */
  statsIncludeDistance: boolean;
}

export function runCardElements(template: RunCardTemplate): RunCardElements {
  const base = (map: boolean, statsRow: boolean, heroDistance: boolean): RunCardElements => ({
    map,
    statsRow,
    heroDistance,
    statsIncludeDistance: statsRow && !heroDistance,
  });
  switch (template) {
    case 'classic': return base(true, true, false);   // 지도 + D/P/T (현재 카드)
    case 'hero': return base(true, true, true);        // 거대 거리 + 지도 + P/T
    case 'minimal': return base(false, false, true);   // 거리 하나
    case 'stats': return base(false, true, false);     // D/P/T (지도 off)
    case 'route': return base(true, false, false);     // 지도만 (지표 off)
    default: return base(true, true, false);
  }
}

/** 글씨·지도 크기 배율 — 사용자가 앱에서 늘리고 줄일 수 있다. 안전 범위로 보정. */
export const RUN_CARD_SCALE_MIN = 0.75;
export const RUN_CARD_SCALE_MAX = 1.35;
export function clampRunCardScale(x: number): number {
  const v = Number.isFinite(x) ? x : 1;
  return Math.min(RUN_CARD_SCALE_MAX, Math.max(RUN_CARD_SCALE_MIN, v));
}

/**
 * 런 한 건을 공유 카드의 표시 필드로 변환한다(순수함수, 네이티브 의존 0).
 *
 * 거리는 표시 단위(km|mi)로 환산해 소수 2자리. 페이스 라벨은 항상 '/km'로 고정한다
 * (앱 전체와 동일 — lib/share buildRunShareText와 같은 규칙: 페이스 값은 언제나
 * 초/km이므로 mi 모드라도 /mi로 거짓 표기하지 않는다). 페이스·시간이 '--'(의미 없는
 * 값)면 그 칸은 빠지고, 신발/날짜가 비면 ''로 비워져 카드 레이아웃이 깨지지 않는다.
 */
export function buildShareCardModel(input: ShareCardInput): ShareCardModel {
  const unit = input.unit ?? 'km';
  const distance = displayNum(input.distKm, unit, 2).toFixed(2);
  const shoe = [input.shoeBrand, input.shoeModel]
    .map(s => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');

  // 라벨은 영문(에디토리얼 공유 카드 톤 — DISTANCE/PACE/TIME 통일). 값은 그대로.
  const stats: ShareCardStat[] = [];
  if (input.pace && input.pace !== '--') {
    stats.push({label: 'PACE', value: `${input.pace} /km`});
  }
  if (input.time && input.time !== '--') {
    // durationS 가 있으면 항상 6자리 HH:MM:SS(레퍼런스 톤), 없으면 표시 문자열 그대로.
    stats.push({label: 'TIME', value: input.durationS != null ? hms(input.durationS) : input.time});
  }
  // 트랙 세션 — 바퀴 수 칸 추가(랩거리는 거리 히어로에 이미 반영). 라벨 영문 톤 유지.
  if (input.track && input.track.laps > 0) {
    stats.push({label: 'LAPS', value: `${input.track.laps}`});
  }

  return {
    distance,
    unit,
    stats,
    shoe,
    date: (input.date ?? '').trim(),
    ...(input.photoUri ? {photoUri: input.photoUri} : {}),
    brand: BRAND,
    tagline: TAGLINE,
    hashtag: HASHTAG,
  };
}

// react-native-svg의 Svg 인스턴스가 노출하는 최소 인터페이스(우리가 쓰는 건 toDataURL뿐).
export interface SvgCapturable {
  toDataURL(callback: (base64: string) => void, options?: object): void;
}

export type SvgRefLike = {current: SvgCapturable | null} | null | undefined;

/**
 * Svg ref의 toDataURL(callback) 콜백 계약을 Promise로 감싸 'data:image/png;base64,…'
 * 문자열로 해석한다. ref가 아직 마운트 전이거나 toDataURL이 없으면(=캔버스 미준비)
 * reject 하므로 호출자가 텍스트 공유로 폴백할 수 있다. 빈 base64도 실패로 본다.
 *
 * toDataURL 콜백이 영영 오지 않는 드문 네이티브 엣지에서도 무한 대기하지 않도록
 * timeoutMs(기본 4s) 뒤 reject 한다 — 공유가 조용히 멈추는 대신 텍스트 공유로 폴백된다.
 * 정착 시 타이머를 반드시 정리한다(오픈 핸들·중복 정착 방지).
 */
export function captureCardDataUrl(ref: SvgRefLike, timeoutMs = 4000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const node = ref && ref.current;
    if (!node || typeof node.toDataURL !== 'function') {
      reject(new Error('share card not ready'));
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 한 번만 정착 — 타임아웃과 콜백 중 먼저 온 쪽이 이기고 타이머를 정리한다.
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      fn();
    };
    timer = setTimeout(() => finish(() => reject(new Error('share card capture timed out'))), timeoutMs);
    try {
      node.toDataURL((base64: string) => {
        finish(() => {
          if (!base64) {
            reject(new Error('empty share card image'));
            return;
          }
          resolve(`data:image/png;base64,${base64}`);
        });
      });
    } catch (e) {
      finish(() => reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
}

/**
 * 카드 이미지를 캡처해 RN Share로 공유한다. 캡처가 실패하면(네이티브 캔버스 미준비
 * 등) 기존 텍스트 공유(buildRunShareText)로 조용히 폴백한다 — 사용자에게는 항상
 * 무언가가 공유되거나, 닫아도 예외가 표면화되지 않는다.
 */
/**
 * 공유 카드(투명 PNG)를 사진앱에 저장한다 — 인스타 스토리에서 자기 사진 위에 스티커로
 * 올리기 위함(스트라바 방식: 배경 없는 오버레이를 갤러리에 저장 → 사용자가 직접 합성).
 * 캡처(toDataURL base64) → 임시파일 기록 → MediaLibrary 로 사진앱 저장.
 *   'saved'  — 저장 성공
 *   'denied' — 사진 추가 권한 거부
 *   'failed' — 캡처/파일/저장 실패(호출부가 안내)
 */
export async function saveCardToLibrary(ref: SvgRefLike): Promise<{ok: boolean; reason?: string}> {
  let step = 'init';
  try {
    step = 'capture';
    const dataUrl = await captureCardDataUrl(ref);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    step = 'cacheDir';
    const dir = FileSystem.cacheDirectory;
    if (!dir) return {ok: false, reason: 'no cacheDirectory'};
    step = 'write';
    const fileUri = `${dir}keego-run-${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {encoding: FileSystem.EncodingType.Base64});
    step = 'perm';
    const perm = await MediaLibrary.requestPermissionsAsync(true); // writeOnly: '사진 추가'만
    if (!perm.granted) return {ok: false, reason: 'denied'};
    step = 'save';
    await MediaLibrary.saveToLibraryAsync(fileUri);
    return {ok: true};
  } catch (e: any) {
    return {ok: false, reason: `${step}: ${String(e?.message ?? e).slice(0, 140)}`};
  }
}

export async function shareRunCard(ref: SvgRefLike, fallback: RunShareInput): Promise<void> {
  try {
    const url = await captureCardDataUrl(ref);
    await Share.share({url});
  } catch {
    await Share.share({message: buildRunShareText(fallback)}).catch(() => {});
  }
}

// ─── Slice 8 리텐션: 리캡 요약 카드(주간/월간) ──────────────────────────────────
// 위 런 카드와 동일한 패턴(순수 빌더 + Svg.toDataURL 캡처 + 텍스트 폴백)을 리캡에도
// 그대로 적용한다. 기존 런카드 시그니처(buildShareCardModel/shareRunCard)는 건드리지
// 않고, 리캡용 빌더만 더한다(A8-3: 새 네이티브 의존 0 — react-native-svg만 재사용).

/** 빈 리캡(런 0개)에서 보여줄 keep-going 보이스(A8-5) — 카드/텍스트 공유 공통. */
export const RECAP_EMPTY_COPY =
  '아직 이 기간 기록이 없어요 — 가볍게 한 걸음부터, keep going';

/** 주/월 라벨(리캡 자체는 기간 종류를 모르므로 호출부가 지정). */
export type RecapKind = 'weekly' | 'monthly';

export interface RecapShareCardModel {
  /** 카드 제목('주간 리캡'|'월간 리캡'). */
  title: string;
  /** 기간 라벨(recap.periodLabel 그대로). */
  period: string;
  /** 총거리 숫자 문자열(표시 단위 환산, 소수 1자리). */
  distance: string;
  /** 거리 단위 라벨('km'|'mi'). */
  unit: string;
  /** 런 수·평균 페이스·최다 착용(의미 없는 값은 빠진다). */
  stats: ShareCardStat[];
  /** 개인 기록(1km/5km/최장) — 기록 없는 항목은 빠진다. */
  prs: ShareCardStat[];
  /** 기간 내 런 0개면 true(빈 리캡 카드). */
  isEmpty: boolean;
  /** 빈 리캡 keep-going 카피(A8-5). */
  emptyCopy: string;
  brand: string;
  tagline: string;
  hashtag: string;
}

/**
 * 개인 기록(PersonalRecords)을 카드/화면 공용 표시 행으로 변환한다(순수). App 의
 * 개인 기록 카드와 동일 포맷(1km=페이스 /km, 5km=시간, 최장=표시 단위 거리). 기록이
 * 없는(null) 항목은 행에서 빠져 빈 칸이 생기지 않는다.
 */
export function formatRecapPRs(prs: PersonalRecords, unit: Unit = 'km'): ShareCardStat[] {
  const rows: ShareCardStat[] = [];
  if (prs?.fastest1k != null) {
    rows.push({label: '1km 최고', value: `${fmtPace(1, prs.fastest1k)} /km`});
  }
  if (prs?.fastest5k != null) {
    rows.push({label: '5km 최고', value: fmtTime(Math.round(prs.fastest5k))});
  }
  if (prs?.longest != null) {
    rows.push({label: '최장 거리', value: `${displayNum(prs.longest, unit, 2)} ${unit}`});
  }
  return rows;
}

/**
 * Recap 한 건을 리캡 공유 카드의 표시 필드로 변환한다(순수함수, 네이티브 의존 0).
 * 총거리는 표시 단위로 환산해 소수 1자리. 평균 페이스가 '--'(무런)거나 최다 착용이
 * 없으면 그 칸은 빠진다. 빈 리캡이면 isEmpty=true 로 카드가 keep-going 카피만 보인다.
 */
export function buildRecapShareCardModel(
  recap: Recap,
  opts?: {unit?: Unit; kind?: RecapKind},
): RecapShareCardModel {
  const unit = opts?.unit ?? 'km';
  const kind = opts?.kind ?? 'weekly';

  const stats: ShareCardStat[] = [{label: '런 수', value: `${recap.runCount}회`}];
  if (recap.avgPaceLabel && recap.avgPaceLabel !== '--') {
    stats.push({label: '평균 페이스', value: `${recap.avgPaceLabel} /km`});
  }
  if (recap.mostWornShoe) {
    stats.push({label: '최다 착용', value: recap.mostWornShoe.name});
  }

  return {
    title: kind === 'monthly' ? '월간 리캡' : '주간 리캡',
    period: recap.periodLabel,
    distance: displayNum(recap.totalKm, unit, 1).toFixed(1),
    unit,
    stats,
    prs: formatRecapPRs(recap.prs, unit),
    isEmpty: recap.isEmpty,
    emptyCopy: RECAP_EMPTY_COPY,
    brand: BRAND,
    tagline: TAGLINE,
    hashtag: HASHTAG,
  };
}

/**
 * 리캡 텍스트 폴백(카드 캡처 실패 시 RN Share 메시지). 빈 리캡은 keep-going 카피만,
 * 실데이터는 총거리·런수·평균페이스·최다착용을 keep-going 톤 한 줄 요약으로 묶는다.
 */
export function buildRecapShareText(recap: Recap, opts?: {unit?: Unit; kind?: RecapKind}): string {
  const m = buildRecapShareCardModel(recap, opts);
  if (recap.isEmpty) {
    return `${m.brand} ${m.title} (${m.period})\n${m.emptyCopy}`;
  }
  const lines = [
    `${m.brand} ${m.title} · ${m.period}`,
    `총 ${m.distance}${m.unit} · ${recap.runCount}회`,
  ];
  if (recap.avgPaceLabel && recap.avgPaceLabel !== '--') {
    lines.push(`평균 페이스 ${recap.avgPaceLabel} /km`);
  }
  if (recap.mostWornShoe) {
    lines.push(`최다 착용 ${recap.mostWornShoe.name} (${recap.mostWornShoe.km}km)`);
  }
  lines.push(m.hashtag);
  return lines.join('\n');
}

/**
 * 리캡 카드 이미지를 캡처해 RN Share 로 공유한다. 캡처 실패(네이티브 캔버스 미준비)
 * 시 buildRecapShareText 텍스트 공유로 조용히 폴백한다 — shareRunCard 와 같은 계약.
 */
export async function shareRecapCard(
  ref: SvgRefLike,
  fallback: Recap,
  opts?: {unit?: Unit; kind?: RecapKind},
): Promise<void> {
  try {
    const url = await captureCardDataUrl(ref);
    await Share.share({url});
  } catch {
    await Share.share({message: buildRecapShareText(fallback, opts)}).catch(() => {});
  }
}

/**
 * 러너 스펙 카드(RunnerSpecShareCard)를 캡처해 OS 공유 시트로. 캡처 실패 시 텍스트 폴백.
 */
export async function shareRunnerSpecCard(ref: SvgRefLike, fallbackText: string): Promise<void> {
  try {
    const url = await captureCardDataUrl(ref);
    await Share.share({url});
  } catch {
    await Share.share({message: fallbackText}).catch(() => {});
  }
}

/** 마라톤 메달 자랑 카드 공유 — 캡처 실패 시 텍스트 폴백. BIB·이름은 카드에 없음(프라이버시). */
export async function shareMedalCard(ref: SvgRefLike, fallbackText: string): Promise<void> {
  try {
    const url = await captureCardDataUrl(ref);
    await Share.share({url});
  } catch {
    await Share.share({message: fallbackText}).catch(() => {});
  }
}
