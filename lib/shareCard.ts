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
 */
export function captureCardDataUrl(ref: SvgRefLike): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const node = ref && ref.current;
    if (!node || typeof node.toDataURL !== 'function') {
      reject(new Error('share card not ready'));
      return;
    }
    let settled = false;
    try {
      node.toDataURL((base64: string) => {
        if (settled) return;
        settled = true;
        if (!base64) {
          reject(new Error('empty share card image'));
          return;
        }
        resolve(`data:image/png;base64,${base64}`);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
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
