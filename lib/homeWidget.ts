// ─── lib/homeWidget — 홈 화면 위젯(활성 신발 수명 링) 플랫폼 중립 통로 ─────────
//
// 배경: 위젯 갱신은 원래 `watchSession.updateWidgetShoe` 에 얹혀 있었다. 그 모듈은
// `Platform.OS === 'ios'` 로 잠겨 있어(애플워치 연동 모듈이므로) **안드로이드에서는
// 위젯이 통째로 no-op** 이었다 — iOS 에만 위젯이 있던 이유다.
//
// 위젯은 워치와 아무 상관이 없는 폰 기능이므로, 여기로 분리해 플랫폼별 구현을 고른다:
//   · iOS      → 기존 WatchSessionModule.updateWidgetShoe (App Group UserDefaults + WidgetCenter)
//                **iOS 네이티브는 건드리지 않는다** — 이미 동작하는 경로를 그대로 쓴다.
//   · Android  → KeegoWidgetModule (SharedPreferences + AppWidgetManager 갱신)
//   · 그 외/모듈 부재 → 조용한 no-op
//
// 계약(양 플랫폼 동일): {name, brand, category, usedKm, maxKm}.
// 위젯이 스스로 잔여율·색을 계산하므로 여기서는 원본 수치만 넘긴다(표시 규칙 이중화 금지).
//
// 원칙: **위젯 갱신 실패가 앱을 깨면 안 된다.** 전 경로 no-throw.

import {NativeModules, Platform} from 'react-native';

import {watchSession} from './watchSession';

/** 위젯에 표시할 활성 신발 한 켤레. lib/watchPayload.buildWidgetShoe 가 만든다. */
export interface HomeWidgetShoe {
  name: string;
  brand: string;
  category: string;
  usedKm: number;
  maxKm: number;
}

/** 안드로이드 네이티브 모듈(없으면 null — 구버전 빌드·테스트 환경). */
const AndroidWidget: {updateShoe?: (shoe: HomeWidgetShoe) => void} | null =
  Platform.OS === 'android'
    ? ((NativeModules as {KeegoWidgetModule?: {updateShoe?: (s: HomeWidgetShoe) => void}})
        .KeegoWidgetModule ?? null)
    : null;

/** 이 기기에서 홈 위젯 갱신이 가능한가(관측·테스트용). */
export function homeWidgetAvailable(): boolean {
  if (Platform.OS === 'android') return typeof AndroidWidget?.updateShoe === 'function';
  return true; // iOS 는 watchSession 이 자체 가드(모듈 부재면 그쪽에서 no-op)
}

/** 입력을 위젯 계약대로 정규화한다(음수·NaN·null 방어). 순수 — 테스트 가능. */
export function normalizeWidgetShoe(shoe: Partial<HomeWidgetShoe> | null | undefined): HomeWidgetShoe | null {
  if (!shoe) return null;
  const name = String(shoe.name ?? '').trim();
  if (!name) return null; // 이름 없는 신발은 위젯에 띄울 게 없다
  const num = (v: unknown) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    name,
    brand: String(shoe.brand ?? ''),
    category: String(shoe.category ?? ''),
    usedKm: num(shoe.usedKm),
    maxKm: num(shoe.maxKm),
  };
}

/**
 * 홈 위젯의 활성 신발을 갱신한다. 플랫폼에 맞는 구현으로 위임하고, 어떤 실패도 삼킨다.
 * 같은 값을 반복 호출해도 안전하다(네이티브가 멱등 write + 리로드).
 */
export function updateHomeWidgetShoe(shoe: Partial<HomeWidgetShoe> | null | undefined): void {
  const payload = normalizeWidgetShoe(shoe);
  if (!payload) return;
  try {
    if (Platform.OS === 'android') {
      AndroidWidget?.updateShoe?.(payload);
      return;
    }
    watchSession.updateWidgetShoe(payload);
  } catch {
    /* 위젯은 부가 표시다 — 실패가 앱 흐름을 막지 않는다 */
  }
}
