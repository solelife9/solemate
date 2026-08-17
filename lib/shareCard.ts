// ─── 런 공유 카드(이미지) — 필드 매핑(순수) + dataURL 캡처 경로 ──────────────────
// 런 상세의 '카드 공유' 버튼이 거리/페이스/시간/신발명/미니 코스맵을 react-native-svg
// 카드로 그린 뒤, Svg ref의 toDataURL()로 PNG dataURL을 만들어 RN Share로 내보낸다.
//
// 새 네이티브 의존(view-shot 등)은 추가하지 않는다 — 이미 설치된 react-native-svg의
// Svg.toDataURL만 사용한다. 이 파일은 다음 두 가지를 네이티브 없이 검증 가능하게 분리한다:
//   1) buildShareCardModel — 런 한 건 → 카드 표시 필드(순수함수, 단위 테스트)
//   2) captureCardDataUrl  — Svg ref → 'data:image/png;base64,…' (콜백→Promise 래핑)
// 캔버스 자체는 jest.setup의 Svg 목이 toDataURL을 흉내 내므로 경로를 그대로 테스트한다.

import {Platform, Share} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
// saveToLibraryAsync 는 메인 export 에서 deprecated(throw) — 레거시 API 를 쓴다(SDK 56).
import * as MediaLibrary from 'expo-media-library/legacy';
// 안드로이드 이미지 공유 전용(민우님 승인 2026-08-05). RN 의 Share 는 안드로이드에서
// url 을 버려 파일을 붙일 수 없다 — 아래 shareCardAsImage 주석 참조.
import * as Sharing from 'expo-sharing';
import {Unit, displayNum} from './units';
import {buildRunShareText, RunShareInput} from './share';
import {fmtTime} from './format';
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
  /** 평균 심박(bpm). >0 이면 6지표 카드에 HR 칸(워치 있을 때). */
  bpm?: number;
  /** 케이던스(spm). >0 이면 CADENCE 칸. */
  cadence?: number;
  /** 누적 상승(m). >0 이면 ELEV 칸. */
  elevM?: number;
  /** 소모 칼로리(kcal). >0 이면 CALORIES 칸(폰 단독도 항상 있어 6지표를 채운다). */
  calories?: number;
  /** 성취 한 줄(예: '개인 최고 거리', '네거티브 스플릿'). 있으면 '기록' 카드가 열린다. */
  moment?: string;
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
  /** 성취 한 줄(신기록·특별한 순간) — 있으면 '기록' 카드 리본으로. 없으면 ''. */
  moment: string;
  /** keep-going 응원 한 줄. */
  tagline: string;
  /** 해시태그 푸터. */
  hashtag: string;
}

const BRAND = 'Keego';
const TAGLINE = '오늘도 한 걸음 더 — keep going';
const HASHTAG = '#Keego #keepgoing';

// ─── 공유 카드 레이아웃·배경·크기(순수 registry — picker/렌더 공용, 테스트 가능) ───────
// 스트라바 방식 + 컴팩트 스티커. 지표 배치(세로/가로/6지표)만 고르고, 지도·지표는 on/off 토글.
//  · vertical — 지도(작게) 위 + 거리·페이스·시간 세로 스택(스트라바 시그니처, 기본).
//  · classic  — 지도 위 + 거리·페이스·시간 가로 한 줄.
//  · grid     — 지도 위 + 6지표(거리·페이스·시간·심박·케이던스·고도) 2×3 그리드.
// 카드는 '컴팩트 투명 스티커' — 지도+지표+keego 가 딱 붙은 한 덩어리. 사진 전체가 아니라
// 사진 일부에 얹어 크기 조절하므로 캔버스를 내용 높이에 맞춰 자른다(빈 공간 최소). 지도·로고는
// 항상 파파야, 흰 지표엔 그림자(사진 위 가독성). background=dark/photo 는 완성본용.
//  · moment  — 성취(신기록·특별한 순간) 리본 + 세로 지표. 기록이 있을 때만 picker 에 노출.
//  · hero    — 지도를 폭 가득(좌우 여백만) 깔고 지표는 그 아래 한 줄. 스트라바·나이키가
//              쓰는 구성으로, 경로 자체가 주인공이 된다(민우님 2026-08-17 확정).
export type RunCardLayout = 'hero' | 'vertical' | 'classic' | 'grid' | 'moment';

/** picker 기본 노출 순서 — 지도가 큰 'hero' 가 기본. 'moment' 는 기록이 있을 때만 앞에 추가. */
export const RUN_CARD_LAYOUTS: RunCardLayout[] = ['hero', 'vertical', 'classic', 'grid'];

export const RUN_CARD_LAYOUT_LABEL: Record<RunCardLayout, string> = {
  hero: '지도',
  vertical: '세로',
  classic: '가로',
  grid: '6지표',
  moment: '기록',
};

/** 폭 고정(1080). 높이는 내용에 맞춰 컴팩트하게 계산된다(layoutShareCard). */
export type RunCardFormat = 'feed';

// 배경 — 세 공유 흐름을 커버한다:
//  · transparent(기본): 배경 없는 스티커. 인스타에 사진을 올리고 그 위에 얹는다(흰 글씨·경로).
//  · dark(완성본): 다크 배경에 파파야 경로. 인스타 안 거치고 카톡·문자로 바로 공유용.
//  · photo(한 컷 완성본): 사용자 사진을 배경으로 카드를 합성(하단 스크림). 사진 있을 때만.
export type RunCardBackground = 'transparent' | 'dark' | 'photo';

export const RUN_CARD_BACKGROUND_LABEL: Record<RunCardBackground, string> = {
  transparent: '투명',
  dark: '다크',
  photo: '사진',
};

/** 카드 설정(picker 선택). */
export interface RunCardConfig {
  layout: RunCardLayout;
  showMap: boolean;
  showStats: boolean;
  textScale?: number;
  mapScale?: number;
}

/** 렌더가 그릴 텍스트 한 조각(그림자는 렌더가 붙인다). */
export interface CardText {
  x: number; y: number; size: number;
  weight: '500' | '700' | '800';
  anchor: 'start' | 'middle' | 'end';
  ls: number; opacity: number; value: string;
  /** 파파야색(워드마크). 기본 흰색. */
  papaya?: boolean;
}

/** 컴팩트 카드 배치 결과 — 캔버스 높이(h)는 내용에 맞춰 계산된다. */
export interface CardLayout {
  w: number; h: number;
  /** 지도 박스(정사각 좌상단 x,y + 한 변). 없으면 null. */
  map: {x: number; y: number; size: number} | null;
  /** 성취 리본(파파야 필 + ★ + 텍스트) — '기록' 레이아웃일 때만. */
  ribbon: {x: number; y: number; width: number; height: number; fontSize: number; text: string} | null;
  texts: CardText[];
}

const CARD_W = 1080, CARD_PAD = 72, CARD_MAP_GAP = 84, CARD_WM_GAP = 92;

/** 지도 기본 한 변(px). 폭 1080 대비 44%. 2026-08-17 에 250(23%)에서 올렸다 — 위 §지도 주석. */
const MAP_BASE = 480;
/** 'hero' 는 지도를 좌우 여백만 남기고 꽉 채운다(스트라바·나이키 구성). */
const MAP_HERO = CARD_W - CARD_PAD * 2;

/**
 * 컴팩트 스티커 배치(순수) — 지도(있으면) + 지표 + keego 를 위에서부터 딱 붙여 쌓고,
 * 캔버스 높이를 내용에 맞춰 자른다. 사진 일부에 얹는 스티커라 빈 공간을 최소화한다.
 * 세로=지표 세로 스택, 가로=한 줄, 6지표=2×3 그리드. 거리는 항상 첫 지표.
 */
export function layoutShareCard(model: ShareCardModel, cfg: RunCardConfig): CardLayout {
  const t = clampRunCardScale(cfg.textScale ?? 1);
  const m = clampRunCardScale(cfg.mapScale ?? 1);
  const R = (n: number) => Math.round(n);
  const cx = CARD_W / 2;
  const texts: CardText[] = [];
  let y = CARD_PAD;

  // 성취 리본('기록' 카드) — 파파야 필 + ★ + 텍스트. 맨 위, 지도 위.
  let ribbon: CardLayout['ribbon'] = null;
  if (cfg.layout === 'moment' && model.moment) {
    const fontSize = R(38 * t);
    const h = R(84 * t);
    const w = Math.min(CARD_W - 2 * CARD_PAD, R(model.moment.length * fontSize * 0.62 + 96 + 54));
    ribbon = {x: R(cx - w / 2), y: R(y), width: w, height: h, fontSize, text: model.moment};
    y += h + CARD_MAP_GAP;
  }

  // 지도(가운데)
  //
  // 크기 250 → 480 (2026-08-17, 민우님 *"지도가 너무 작게 나오는 것 같아"*).
  // 카드 폭이 1080 이라 250 은 **23%** 였다 — 거리 숫자(64px)의 4배도 안 되는 크기라
  // '지도가 있는 카드'가 아니라 '작은 아이콘이 붙은 카드'로 읽혔다.
  // 480 = 폭의 44%. 지도가 카드의 주인공이 되면서도 지표 세 줄이 그대로 살아 있다.
  // 카드 높이는 684 + 지도크기 이므로 934 → 1164 로 늘어난다(스티커로 얹기엔 아직 무난).
  let map: CardLayout['map'] = null;
  if (cfg.showMap) {
    // 'hero' 는 폭을 꽉 채운다(배율 무시 — 이미 최대다).
    const size = cfg.layout === 'hero' ? MAP_HERO : R(MAP_BASE * m);
    map = {x: R(cx - size / 2), y: R(y), size};
    y += size + CARD_MAP_GAP;
  }

  // 지표 셀 — 거리 항상 첫 칸. 세로/가로는 거리·페이스·시간(3), 6지표는 최대 6.
  const dist = {label: 'DISTANCE', value: `${model.distance} ${model.unit}`};
  const cells = cfg.layout === 'grid'
    ? [dist, ...model.stats].slice(0, 6)
    : (cfg.showStats ? [dist, ...model.stats.slice(0, 2)] : [dist]);

  if (cfg.layout === 'vertical' || cfg.layout === 'moment') {
    const val = R(64 * t), lab = R(28 * t), group = R(150 * t);
    cells.forEach((c, i) => {
      const ly = y + i * group, vy = ly + val;
      texts.push({x: cx, y: ly, size: lab, weight: '700', anchor: 'middle', ls: 2, opacity: 0.8, value: c.label.toUpperCase()});
      texts.push({x: cx, y: vy, size: val, weight: '800', anchor: 'middle', ls: -0.5, opacity: 1, value: c.value});
    });
    y += (cells.length - 1) * group + val;
  } else if (cfg.layout === 'hero') {
    // 지도가 주인공 — 지표는 그 아래 한 줄로 낮게 깔아 지도를 방해하지 않는다.
    // 값이 라벨보다 먼저 읽히도록 값을 크게, 라벨은 값 위에 작게(스트라바 구성).
    const val = R(62 * t), lab = R(26 * t), gap = R(66 * t);
    const span = CARD_W * 0.9, x0 = (CARD_W - span) / 2, slot = span / cells.length;
    cells.forEach((c, i) => {
      const ccx = x0 + slot * i + slot / 2;
      texts.push({x: ccx, y, size: lab, weight: '700', anchor: 'middle', ls: 2, opacity: 0.8, value: c.label.toUpperCase()});
      texts.push({x: ccx, y: y + gap, size: val, weight: '800', anchor: 'middle', ls: -0.5, opacity: 1, value: c.value});
    });
    y += gap;
  } else if (cfg.layout === 'classic') {
    const val = R(58 * t), lab = R(29 * t), gap = R(62 * t);
    const span = CARD_W * 0.92, x0 = (CARD_W - span) / 2, slot = span / cells.length;
    const labelY = y, valueY = y + gap;
    cells.forEach((c, i) => {
      const ccx = x0 + slot * i + slot / 2;
      texts.push({x: ccx, y: labelY, size: lab, weight: '700', anchor: 'middle', ls: 2, opacity: 0.85, value: c.label.toUpperCase()});
      texts.push({x: ccx, y: valueY, size: val, weight: '800', anchor: 'middle', ls: -0.5, opacity: 1, value: c.value});
    });
    y = valueY;
  } else { // grid 2×3
    const val = R(54 * t), lab = R(25 * t), rowH = R(150 * t);
    const colX = [CARD_W * 0.30, CARD_W * 0.70];
    const rows = Math.max(1, Math.ceil(cells.length / 2));
    cells.forEach((c, i) => {
      const gx = colX[i % 2], ry = y + Math.floor(i / 2) * rowH;
      texts.push({x: gx, y: ry, size: lab, weight: '700', anchor: 'middle', ls: 2, opacity: 0.8, value: c.label.toUpperCase()});
      texts.push({x: gx, y: ry + val, size: val, weight: '800', anchor: 'middle', ls: -0.5, opacity: 1, value: c.value});
    });
    y += (rows - 1) * rowH + val;
  }

  // keego 를 지표 바로 밑에 붙인다(한 덩어리 — 스티커 스케일용).
  y += CARD_WM_GAP;
  const wmSize = R(54 * t);
  texts.push({x: cx, y, size: wmSize, weight: '500', anchor: 'middle', ls: -0.5, opacity: 1, value: model.brand.toLowerCase(), papaya: true});
  y += CARD_PAD;

  return {w: CARD_W, h: R(y), map, ribbon, texts};
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
  // 6지표 카드용 추가 지표(있을 때만). 심박은 워치 있을 때, 케이던스·고도는 폰 단독 가능.
  if (input.calories && input.calories > 0) stats.push({label: 'CALORIES', value: `${Math.round(input.calories)}`});
  if (input.cadence && input.cadence > 0) stats.push({label: 'CADENCE', value: `${Math.round(input.cadence)}`});
  if (input.bpm && input.bpm > 0) stats.push({label: 'HR', value: `${Math.round(input.bpm)}`});
  if (input.elevM != null && input.elevM > 0) stats.push({label: 'ELEV', value: `${Math.round(input.elevM)} m`});

  return {
    distance,
    unit,
    stats,
    shoe,
    date: (input.date ?? '').trim(),
    ...(input.photoUri ? {photoUri: input.photoUri} : {}),
    brand: BRAND,
    moment: (input.moment ?? '').trim(),
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
/**
 * ⚠️ **`toDataURL(cb, {width, height})` 로 해상도를 줄이려 하지 말 것**(2026-08-06 실측).
 *
 * 이름만 보면 '그 크기로 구워 준다'로 읽히지만, 안드로이드 구현은 축소가 아니라 **잘라내기**다
 * (`react-native-svg/android/.../SvgView.java`):
 *
 *     String toDataURL(int width, int height) {
 *       Bitmap bitmap = Bitmap.createBitmap(width, height, ...);
 *       drawChildren(new Canvas(bitmap));   // ← 축소 변환이 없다
 *
 * 원래 좌표계 그대로 작은 캔버스에 그리므로 **왼쪽 위 일부만 남는다.** 실기기에서 확인했다 —
 * 공유 시트 썸네일에 워드마크와 이름만 남고 지표가 통째로 잘렸다. 게다가 캡처는 '성공'하고
 * 공유도 나가므로 **테스트로도 안 잡힌다**(옵션이 전달됐는지만 검사하게 되기 때문).
 *
 * 해상도를 줄이려면 **카드 쪽에서** 줄여야 한다 — Svg 의 width/height 를 설계 px ÷ 화면 배율로
 * 두고 viewBox 로 좌표계를 보존한다(RecapShareCard·RunnerSpecShareCard·MedalShareCard 참조).
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
      const cb = (base64: string) => {
        finish(() => {
          if (!base64) {
            reject(new Error('empty share card image'));
            return;
          }
          resolve(`data:image/png;base64,${base64}`);
        });
      };
      node.toDataURL(cb);
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

/**
 * 카드 **이미지** 공유가 가능한 플랫폼인가. 지금은 iOS·안드로이드 둘 다 가능하다.
 * (호출부가 캡처용 카드를 세울지 판단하는 데 쓴다 — 못 쓸 그림을 그리지 않기 위해.)
 */
export const canShareCardImage = (): boolean => Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * 카드를 캡처해 **이미지로** 공유한다. 플랫폼마다 경로가 다르다.
 *
 * ── iOS ─────────────────────────────────────────────────────────────────────
 * `Share.share({url: dataURL})` 그대로. 출시 전부터 아이폰에서 검증된 경로라 바꾸지 않는다.
 *
 * ── 안드로이드 ───────────────────────────────────────────────────────────────
 * RN 의 Share 는 안드로이드 분기에서 `url` 을 **버린다** — `Libraries/Share/Share.js`:
 *
 *     if (Platform.OS === 'android') {
 *       const newContent = {title: content.title,
 *         message: typeof content.message === 'string' ? content.message : undefined};
 *
 * 그래서 `Share.share({url})` 은 message 없는 **빈 공유**가 됐다. 게다가 캡처는 성공하므로
 * 텍스트 폴백조차 타지 않았다 — 조용한 실패다. 갤럭시 S10e 에서 확인했다(2026-08-05:
 * 공유 시트 내용이 비어 있음). 공유 4종(런·리캡·러너 스펙·메달)이 전부 이 경로였다.
 *
 * 안드로이드에서 이미지를 실제로 붙이려면 파일을 쓰고 **content:// URI** 로 넘겨야 하고,
 * 그건 FileProvider 가 필요해 RN 의 Share 로는 불가능하다. 그래서 expo-sharing 을 쓴다
 * (민우님 승인 2026-08-05 — CLAUDE.md 네이티브 의존 사전 승인제). expo-sharing 이
 * 자체 FileProvider(SharingFileProvider)를 들고 있어 매니페스트 수작업이 필요 없다.
 *
 * 캐시 디렉터리에 쓴다 — OS 가 알아서 지운다(사용자 갤러리를 어지럽히지 않는다).
 * 갤러리에 남기는 건 별도 기능이다(saveCardToLibrary).
 *
 * 실패하면 throw 한다 → 호출부의 catch 가 텍스트 공유로 폴백한다(막다른 길 없음).
 */
export async function shareCardAsImage(ref: SvgRefLike, fileStem: string): Promise<void> {
  const dataUrl = await captureCardDataUrl(ref);
  if (Platform.OS !== 'android') {
    await Share.share({url: dataUrl});
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('no cacheDirectory');
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const fileUri = `${dir}${fileStem}.png`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {encoding: FileSystem.EncodingType.Base64});
  await Sharing.shareAsync(fileUri, {mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Keego 카드 공유'});
}

export async function shareRunCard(ref: SvgRefLike, fallback: RunShareInput): Promise<void> {
  try {
    await shareCardAsImage(ref, 'keego-run');
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
  /** 카드 제목('주간 리캡'|'월간 리캡') — 텍스트 폴백용. */
  title: string;
  /** 카드 상단 caps 라벨('WEEKLY RECAP'|'MONTHLY RECAP') — 컴팩트 카드 에디토리얼 톤. */
  titleEn: string;
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
  // 거리 최고 = 그 거리 완주 시간(러닝 관례: 5K PB 26:12 처럼). 과거 1km 만 페이스(/km)로
  // 표기해 5km(시간)와 문법이 섞였다 — 사용자 지적(2026-07-16)으로 시간 표기 통일.
  // fastest1k 는 초/km 라 1km 완주 시간과 수치가 같다(표기만 페이스→시간).
  if (prs?.fastest1k != null) {
    rows.push({label: '1km 최고', value: fmtTime(Math.round(prs.fastest1k))});
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

  // 라벨은 영문 caps(런 카드 DISTANCE/PACE/TIME 과 동일 에디토리얼 톤).
  const stats: ShareCardStat[] = [{label: 'RUNS', value: String(recap.runCount)}];
  if (recap.avgPaceLabel && recap.avgPaceLabel !== '--') {
    stats.push({label: 'AVG PACE', value: `${recap.avgPaceLabel} /km`});
  }
  if (recap.mostWornShoe) {
    stats.push({label: 'TOP SHOE', value: recap.mostWornShoe.name});
  }

  return {
    title: kind === 'monthly' ? '월간 리캡' : '주간 리캡',
    titleEn: kind === 'monthly' ? 'MONTHLY RECAP' : 'WEEKLY RECAP',
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
    await shareCardAsImage(ref, 'keego-recap');
  } catch {
    await Share.share({message: buildRecapShareText(fallback, opts)}).catch(() => {});
  }
}

/**
 * 러너 스펙 카드(RunnerSpecShareCard)를 캡처해 OS 공유 시트로. 캡처 실패 시 텍스트 폴백.
 */
export async function shareRunnerSpecCard(ref: SvgRefLike, fallbackText: string): Promise<void> {
  try {
    await shareCardAsImage(ref, 'keego-spec');
  } catch {
    await Share.share({message: fallbackText}).catch(() => {});
  }
}

/** 마라톤 메달 자랑 카드 공유 — 캡처 실패 시 텍스트 폴백. BIB·이름은 카드에 없음(프라이버시). */
export async function shareMedalCard(ref: SvgRefLike, fallbackText: string): Promise<void> {
  try {
    await shareCardAsImage(ref, 'keego-medal');
  } catch {
    await Share.share({message: fallbackText}).catch(() => {});
  }
}
