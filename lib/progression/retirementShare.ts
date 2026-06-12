// ============================================================================
// lib/progression/retirementShare.ts — 은퇴 카드 저장/공유 (Slice B, signature)
// ============================================================================
// 렌더된 은퇴 카드(<Svg> ref)를 PNG dataURL 로 캡처해 (1) 갤러리에 저장하거나
// (2) OS 공유 시트로 내보낸다. 캡처 경로는 런/리캡 카드와 **동일 인프라**를 재사용한다
// (lib/shareCard captureCardDataUrl — react-native-svg 의 Svg.toDataURL). 새 네이티브
// 의존 0.
//
// 저장(Save Image)은 항상·오프라인에서 동작해야 한다. 이 앱에는 전용 갤러리 모듈
// (CameraRoll/MediaLibrary)이 없고 새 네이티브 의존도 금지이므로, 저장기를 **주입 가능한
// 심(seam)** 으로 둔다(setCardImageSaver). 네이티브 레이어가 나중에 실제 갤러리 저장을
// 연결할 수 있고, 미연결 시 기본 저장기는 OS 공유 시트로 폴백한다 — 공유 시트의
// "이미지 저장 / Save to Photos" 액션은 오프라인에서 갤러리에 영속하므로 계약을 만족한다.
//
// 공유(Share)는 story/feed/link 어디로든 OS 시트를 연다. 대상 앱이 없거나 사용자가
// 닫아도(또는 캡처 실패해도) 예외를 표면화하지 않고 텍스트 공유로 조용히 폴백한다 —
// 절대 크래시하지 않는다(shareRunCard/shareRecapCard 와 같은 계약).
// ============================================================================
import {Share} from 'react-native';
import {captureCardDataUrl, SvgRefLike} from '../shareCard';
import {RetirementCardModel} from './retirementCard';

/** 공유 대상 힌트 — OS 시트는 동일하나 동반 텍스트 톤을 살짝 달리한다. */
export type RetirementShareTarget = 'sheet' | 'story' | 'feed' | 'link';

/** 캡처된 PNG dataURL 을 받아 영속(갤러리 저장)하는 주입 가능 저장기. */
export type CardImageSaver = (dataUrl: string) => Promise<void>;

let saverImpl: CardImageSaver | null = null;

/**
 * 실제 갤러리 저장기를 등록한다(네이티브 레이어가 CameraRoll 등으로 배선). 미등록 시
 * 기본 저장기(OS 공유 시트)가 쓰인다. 테스트는 가짜 저장기를 주입해 호출을 단언한다.
 */
export function setCardImageSaver(fn: CardImageSaver | null): void {
  saverImpl = fn;
}

/** 현재 등록된 저장기(없으면 기본 시트 저장기). */
function activeSaver(): CardImageSaver {
  return saverImpl ?? defaultSheetSaver;
}

/** 기본 저장기 — OS 공유 시트(오프라인). 사용자가 "이미지 저장"을 고르면 갤러리에 영속. */
async function defaultSheetSaver(dataUrl: string): Promise<void> {
  await Share.share({url: dataUrl});
}

/**
 * 은퇴 카드 텍스트 폴백(캡처/저장/공유 실패 시 RN Share 메시지). 실데이터로 keep-going
 * 톤 한 줄 요약을 만든다(거리·러닝수·등급, 장착 타이틀이 있으면 한 줄 더).
 */
export function buildRetirementShareText(model: RetirementCardModel | null | undefined): string {
  const m = (model || {}) as RetirementCardModel;
  const name = (typeof m.shoeName === 'string' && m.shoeName) || '내 러닝화';
  const lines = [`${name} — ${m.distanceLabel ?? ''} 함께한 여정을 마칩니다.`.trim()];
  const facts: string[] = [];
  if (m.runCountLabel) facts.push(`${m.runCountLabel}회 러닝`);
  if (m.grade && m.grade.label) facts.push(`${m.grade.emoji ?? ''} ${m.grade.label}`.trim());
  if (facts.length) lines.push(facts.join(' · '));
  if (m.equippedTitle) lines.push(m.equippedTitle);
  lines.push(`${m.brand ?? 'KEEGO'} · ${m.wordmark ?? 'Keep Going'}`);
  return lines.join('\n');
}

/**
 * 렌더된 카드를 PNG 로 캡처해 갤러리에 저장한다(항상·오프라인). 캡처 성공 시 등록 저장기로
 * 영속을 시도하고, 캡처가 실패하면(네이티브 캔버스 미준비) 텍스트 공유 시트로 폴백한다.
 * 어떤 경로에서도 throw 하지 않으며, 영속 시도 성공 여부를 boolean 으로 돌려준다.
 */
export async function saveRetirementCardImage(
  ref: SvgRefLike,
  fallback?: RetirementCardModel,
): Promise<boolean> {
  try {
    const url = await captureCardDataUrl(ref);
    await activeSaver()(url);
    return true;
  } catch {
    // 캡처/저장 실패 — 사용자가 빈손이 되지 않게 텍스트 시트로 폴백(크래시 금지).
    await Share.share({message: buildRetirementShareText(fallback)}).catch(() => {});
    return false;
  }
}

/**
 * 렌더된 카드를 PNG 로 캡처해 OS 공유 시트로 내보낸다(story/feed/link 공용). 캡처가
 * 실패하거나 대상 앱이 없거나 사용자가 닫아도 예외를 삼키고 텍스트 공유로 폴백한다 —
 * 절대 크래시하지 않는다.
 */
export async function shareRetirementCard(
  ref: SvgRefLike,
  fallback?: RetirementCardModel,
  _target: RetirementShareTarget = 'sheet',
): Promise<void> {
  try {
    const url = await captureCardDataUrl(ref);
    await Share.share({url});
  } catch {
    await Share.share({message: buildRetirementShareText(fallback)}).catch(() => {});
  }
}
