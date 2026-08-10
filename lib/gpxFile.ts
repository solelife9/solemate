// ─── lib/gpxFile.ts — GPX 파일 고르기 + 읽기 (파사드) ─────────────────────────
//
// `lib/gpxImport.ts` 는 **순수 파서**다(문자열 → 러닝). 이 파일은 그 앞단, 즉 사용자가
// 파일을 고르고 내용을 문자열로 얻는 부분만 맡는다. 둘을 갈라 둔 이유는 파서를
// 실디바이스 없이 테스트할 수 있어야 하기 때문이다(하네스 규약 — 센서·파일은 모킹).
//
// 왜 필요한가: 기존 앱을 쓰던 러너가 keego 를 설치하면 첫 화면이 텅 빈다. 몇 년치
// 기록을 두고 와야 한다는 뜻이라 그 자리에서 이탈한다. 내보내기(`lib/gpx`)는 이미
// 있었는데 들어오는 길이 없었다 — "내 데이터는 내 것"은 양방향이어야 한다.
//
// ⚠️ **실패는 전부 값으로 답한다.** 던지지 않는다 — 파일 하나 못 읽는 것이 화면을
// 깨뜨릴 이유가 없다(이 저장소의 파사드 공통 규약: lib/health · lib/activityRecognition).
import * as DocumentPicker from 'expo-document-picker';
// `/legacy` 를 쓰는 이유: 이 저장소의 다른 파일 API(lib/gpx·photo·shareCard)가 전부
// 그쪽이다. 한 앱 안에 두 파일 API 가 섞이면 경로 규약(file:// 접두·캐시 위치)이 갈린다.
import * as FileSystem from 'expo-file-system/legacy';
import {parseGpx, gpxToRunInput} from './gpxImport';
import {showDialog} from './dialog';

export interface PickedGpx {
  /** 파일 내용(UTF-8). */
  xml: string;
  /** 사용자에게 보여줄 파일명. 없으면 ''. */
  fileName: string;
}

export type PickGpxResult =
  | {ok: true; file: PickedGpx}
  /** 사용자가 취소했다 — 오류가 아니다. 아무 말도 하지 않는 게 맞다. */
  | {ok: false; reason: 'cancelled'}
  /** 고르긴 했는데 읽지 못했다(권한·손상·용량). 이때만 사용자에게 알린다. */
  | {ok: false; reason: 'unreadable'};

/**
 * 파일 크기 상한(바이트). 넘으면 읽지 않는다.
 *
 * GPX 는 텍스트라 1초 간격 4시간 러닝이 대략 2~3MB 다. 20MB 면 그 열 배가 넘어
 * 정상 러닝 파일은 전부 통과하고, 실수로 고른 거대 파일(전체 이력 덤프)이 JS 힙을
 * 통째로 먹는 것만 막는다 — 파싱은 정규식 전역 스캔이라 메모리가 파일 크기에 비례한다.
 */
export const MAX_GPX_BYTES = 20 * 1024 * 1024;

/** 이 확장자·MIME 만 고를 수 있게 한다. GPX 는 표준 MIME 이 없어 둘 다 받는다. */
const GPX_TYPES = ['application/gpx+xml', 'application/xml', 'text/xml', '*/*'];

/**
 * 문서 피커를 열어 GPX 하나를 고르고 내용을 읽는다.
 *
 * `copyToCacheDirectory: true` 인 이유: iOS 는 다른 앱 컨테이너의 URI 를 그대로
 * 읽게 해 주지 않는다(iCloud Drive·Files 에서 고른 경우 특히). 캐시로 복사해야
 * 읽기가 안정적이다. 복사본은 OS 가 알아서 비운다.
 */
export async function pickGpxFile(): Promise<PickGpxResult> {
  let uri = '';
  let fileName = '';
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: GPX_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return {ok: false, reason: 'cancelled'};
    const asset = res.assets?.[0];
    if (!asset?.uri) return {ok: false, reason: 'unreadable'};
    // 크기를 아는 경우에만 상한을 적용한다 — 모르는 것을 이유로 막지 않는다.
    if (typeof asset.size === 'number' && asset.size > MAX_GPX_BYTES) {
      return {ok: false, reason: 'unreadable'};
    }
    uri = asset.uri;
    fileName = typeof asset.name === 'string' ? asset.name : '';
  } catch {
    // 피커 자체가 뜨지 못한 경우(기기 제약·중복 호출). 취소와 구분할 근거가 없으므로
    // 조용히 닫는다 — 실패했다고 알리면 사용자가 취소했을 때도 오류가 뜬다.
    return {ok: false, reason: 'cancelled'};
  }

  try {
    const xml = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!xml || !xml.trim()) return {ok: false, reason: 'unreadable'};
    return {ok: true, file: {xml, fileName}};
  } catch {
    return {ok: false, reason: 'unreadable'};
  }
}

/** 폼에 채울 값 한 벌 — `HistoryScreen.GpxFill` 과 같은 모양이다. */
export interface GpxFormFill {
  km: number;
  durationSec: number;
  /** 'YYYY-MM-DD'. 파일에 시각이 없으면 '' — 그때는 사용자가 고른다. */
  date: string;
  route: string;
  elevationM?: number;
  startMs?: number;
  fileName: string;
}

/**
 * 파일 하나를 골라 파싱해 **폼에 채울 값**으로 돌려준다. 저장하지 않는다 —
 * 무엇이 들어가는지 사용자가 보고 고친 뒤 '추가하기'를 누르는 게 이 흐름의 전부다
 * (파일의 거리가 늘 옳지는 않다).
 *
 * 취소는 조용히 null — 사용자가 그만둔 것은 오류가 아니다. 읽기/파싱 실패만 알린다.
 * (App.tsx 가 아니라 여기 있는 이유: App.tsx 크기 래칫 — 되자람 방지
 *  `__tests__/appSize.ratchet.test.ts`. 화면은 이 함수 하나만 알면 된다.)
 */
export async function pickAndParseGpx(): Promise<GpxFormFill | null> {
  const picked = await pickGpxFile();
  if (!picked.ok) {
    if (picked.reason === 'unreadable') {
      showDialog('파일을 읽지 못했어요', 'GPX 파일이 맞는지, 너무 크지 않은지 확인해 주세요.');
    }
    return null;
  }
  const parsed = parseGpx(picked.file.xml);
  if (!parsed.ok) {
    showDialog(
      '러닝을 찾지 못했어요',
      parsed.reason === 'not_gpx' ? 'GPX 파일이 아닌 것 같아요.' : '이 파일에는 위치 기록이 없어요.',
    );
    return null;
  }
  const input = gpxToRunInput(parsed.data);
  if (!(input.km > 0)) {
    showDialog('거리가 0이에요', '위치 점이 하나뿐이거나 좌표가 비어 있어요.');
    return null;
  }
  return {
    km: input.km,
    durationSec: input.durationSec,
    date: input.dateYmd ?? '',
    route: input.route,
    // 고도는 **있을 때만** 넘긴다. 0 은 "평지를 달렸다"는 주장이라 모름과 다르다
    // (lib/elevation · __tests__/elevationHonesty 와 같은 원칙).
    elevationM: parsed.data.elevGainM > 0 ? input.elevationM : undefined,
    startMs: parsed.data.startMs ?? undefined,
    fileName: picked.file.fileName,
  };
}
