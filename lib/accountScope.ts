// ============================================================================
// lib/accountScope.ts — 계정별 로컬 데이터 격리 (AUDIT 1 S-1 잔여분, 2026-08-01)
// ----------------------------------------------------------------------------
// 무엇이 남아 있었나: AUDIT 1 에서 '계정 전환 시 A 의 기록이 B 계정 클라우드로 올라가는
// 것'은 막았다(lib/cacheOwner — 동기 차단). 하지만 **B 의 화면에는 A 의 신발·러닝·GPS
// 경로가 그대로 보였다.** 로컬 저장소에 계정 개념이 아예 없었기 때문이다.
//
// ── 왜 '키마다 uid 를 붙이는' 방식이 아닌가 ─────────────────────────────────
// 저장소를 읽고 쓰는 자리가 수십 곳이다(App.tsx·runTracker·medals·challenges·사이드카…).
// 전부 계정별 키로 고치면 **한 군데만 빠뜨려도 그 데이터는 조용히 계속 새어 나간다.**
// 게다가 그 실수는 테스트로 잡히지 않는다 — 빠뜨린 자리는 애초에 테스트가 없으니까.
//
// 그래서 **저장 구조는 그대로 두고, 계정이 바뀌는 순간에 통째로 갈아끼운다.**
//   · 로그인한 계정이 바뀌면 → 지금 있는 사용자 데이터를 **이전 계정의 보관함으로 옮기고**
//   · 새 계정의 보관함이 있으면 → **꺼내서 제자리에 돌려놓는다**
// 읽고 쓰는 코드는 전부 예전 그대로 동작하고, 격리는 한 곳에서만 일어난다.
//
// ── 절대 지키는 것: 아무것도 잃지 않는다 ────────────────────────────────────
// 옮기는 순서가 **복사 → 확인 → 삭제** 다. 확인에 실패한 키는 원본을 지우지 않는다.
// 중간에 앱이 죽어도 최악이 '양쪽에 다 있는 상태'이고, 그건 다음 전환에서 정리된다.
// 오프라인에서 쌓아둔 미동기 기록도 보관함에 그대로 남아, 그 계정으로 다시 로그인하면
// 돌아온다(Iron Law: 사용자 데이터 파괴 금지).
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import {reportIssue} from './crashlytics';
import {CACHE_OWNER_KEY} from './cacheOwner';

/** 보관함 키 접두사 — `acct_<uid>__<원래키>`. */
export const ARCHIVE_PREFIX = 'acct_';
/** uid 와 원래 키 사이의 구분자. 키 이름에 잘 안 쓰이는 형태로 골랐다. */
const SEP = '__';

/**
 * 계정에 속한 데이터 — **정확히 이 키들**.
 *
 * 목록에 없는 키는 그냥 지금처럼 공용으로 남는다(= 지금과 동일, 퇴행 아님).
 * 반대로 기기 단위 키를 실수로 넣으면 전환할 때마다 기기 설정이 사라진다.
 * 그래서 **모르면 넣지 않는다** — 빠뜨리는 실수는 안전하고, 잘못 넣는 실수는 위험하다.
 *
 * ⚠️ **그 원칙에 예외가 있다(2026-08-07).** '빠뜨리는 실수는 안전하다'는 그 키가 단순
 * 캐시일 때만 참이다. **동의·공개 범위처럼 누락이 곧 유출인 키**가 있다 —
 * `social_visibility_v1` 이 목록에 없어서, A 가 공개에 동의한 폰에 B 가 로그인하면
 * 동의가 그대로 상속됐다(동의 화면은 값이 'unset' 일 때만 뜬다). B 는 한 번도 동의한 적
 * 없이 닉네임·거리·신발이 전원 읽기 가능한 컬렉션에 발행됐다. 카카오→구글로 바꿔
 * 로그인만 해도 uid 가 달라지므로 특수 상황이 아니었다.
 *
 * 그리고 **델타 동기 커서**도 누락이 안전하지 않다 — A 의 커서가 남으면 B 의 문서는 전부
 * 그 시각 이전이라 델타 조회가 0건을 돌려주고, B 는 "내 기록이 다 사라졌다"를 본다.
 *
 * 새 키를 만들 때 자문할 것: **이 값이 남의 계정에 그대로 보이면 무슨 일이 나는가.**
 * 답이 '아무 일 없음'일 때만 빼도 된다.
 */
export const USER_KEYS: readonly string[] = [
  // 핵심 데이터 — 이게 새던 것이 S-1 이다
  'cache_shoes_v1',
  'cache_runs_v1',
  'tombstones_v1',
  'pending_runs',
  // 진행 중인 러닝(남의 미완료 러닝이 내 화면에 뜨면 안 된다)
  'active_run_snapshot',
  'active_run_route',
  // 성취·기록 파생
  'medals_v1',
  'challenges_v1',
  'progression_v1',
  'distance_pb_cache_v1',
  'hr_backfill_pending_v1',
  // 프로필·신체(개인정보)
  'profile_name',
  'profile_photo',
  'body_weight_kg',
  'body_age',
  'body_sex',
  'body_rest_hr',
  'cloud_account',
  // 설정
  'goal_weekly_km',
  'settings_unit',
  'settings_alerts',
  'settings_autopause',
  'settings_haptics',
  'settings_target_zone',
  'settings_voice',
  'settings_updated_at',
  'notif_settings',
  'notif_presented',
  'shoe_alert_notified',
  // 이미 본 업적·등급(셀러브레이션 기준선). 계정별이 아니면 새 계정이 남의 업적을
  // '이미 본 것'으로 취급하거나, 반대로 남의 업적 축하가 뜬다.
  'rank_best_v1','celebration_seen_v1',
  // 1회성 플래그 — 새 계정은 온보딩을 다시 봐야 맞다
  'onboarded',
  // 상세 동기 스윕 시각(그 계정의 런을 훑은 기록이라 계정에 딸린다)
  'detail_sync_sweep_at_v1',
  // ── 소셜 공개 동의 (2026-08-07) ──────────────────────────────────────────
  // 누락 = **동의 상속**. 위 주석의 예외 항목이다. 발행 시그니처도 같이 옮긴다 —
  // 안 옮기면 B 의 첫 발행이 A 의 시그니처와 같다는 이유로 건너뛰어질 수 있다.
  'social_visibility_v1',      // lib/publicProfile.ts VISIBILITY_KEY
  'social_published_sig_v1',   // lib/publicProfile.ts PUBLISHED_SIG_KEY
  'leaderboard_published_v1',  // App.tsx — 회수 대상이 있는지 표시
  // 차단 목록(App Store 1.2 · 2026-08-07). **누락되면 A 가 차단한 사람이 B 화면에서도
  // 안 보인다** — 남의 판단이 내 화면을 바꾸는 것이고, 반대로 B 의 차단이 A 에게 새면
  // "차단했는데 다시 보인다"가 된다. 어느 방향이든 사고다.
  'blocked_uids_v1',           // lib/social/blockList.ts BLOCKED_UIDS_KEY
  // ── 클라우드 델타 동기 상태 (2026-08-07) ─────────────────────────────────
  // 커서는 '어디까지 받았나'라 계정에 딸린다. 누락되면 A 의 커서가 남아 B 의 델타
  // 조회가 0건을 돌려주고 **B 는 빈 앱을 본다**(재설치 전엔 복구 안 됨).
  // 마커는 '어디까지 올렸나' — 누락되면 재업로드라 자가 치유되지만 같이 옮기는 게 맞다.
  'recordSync_cursor_v1',      // lib/recordSync.ts CURSORS_KEY
  'recordSync_pushed_v1',      // lib/recordSync.ts MARKERS_KEY
  // 워치 런 중복 방어 표식 — 기기를 공유하면 B 의 워치 런이 "A 가 이미 봤다"는
  // 이유로 조용히 버려질 수 있다.
  'watch_runs_seen_v1',        // App.tsx
  // 상세 삭제 재시도 큐 — A 의 삭제 요청이 B 의 경로에서 no-op 으로 소진된다.
  'detail_delete_pending_v1',  // lib/runDetailSync.ts DETAIL_DELETE_QUEUE_KEY
  // 심박 스윕·보수 표식 — 둘 다 '그 계정의 런을 훑었다'는 기록이다
  // (detail_sync_sweep_at_v1 과 같은 성격). B 가 A 의 '완료' 표식을 물려받으면
  // **B 의 기록은 영영 보수되지 않는다.**
  'hr_recover_sweep_at_v2',    // App.tsx
  'hr_repair_done_v1',         // lib/hrRepair.ts HR_REPAIR_DONE_KEY
];

/**
 * 계정에 속한 데이터 — **이 접두사로 시작하는 모든 키**(런/신발 단위 사이드카).
 * id 가 랜덤이라 남의 것과 겹칠 일은 없지만, 남겨두면 고아 데이터가 계속 쌓인다.
 */
export const USER_KEY_PREFIXES: readonly string[] = [
  'splits_',
  'paceTrack_',
  'hrTrack_',
  'gapTrack_',
  'track_',
  'route_',
  'surface_',
  'runphoto_',
  'time_',
  'detail_pushed_',
  'detail_absent_',
  'run_reminder_',
];

/**
 * **옮기면 안 되는 키**(기기·앱 단위). 방어용 명시 목록이다 — 위 목록과 겹치면
 * 이쪽이 이긴다. 실수로 추가되는 것을 막는 안전핀.
 *
 *  · device_id / storage_schema_version — 기기·설치 단위
 *  · cache_owner_uid — **소유자 표시 그 자체**. 이게 옮겨지면 전환 판정이 무너진다
 *  · fcm_token_pending / push_prime_done — 푸시 토큰·권한(기기 단위)
 *  · hk_linked_v1 — HealthKit 연결(기기 권한)
 *  · keego.* — 신발·대회 카탈로그 캐시(전역 데이터. 옮기면 매번 다시 받아 읽기가 는다)
 */
export const DEVICE_KEYS: readonly string[] = [
  'device_id',
  'storage_schema_version',
  'cache_owner_uid',
  'fcm_token_pending',
  'push_prime_done',
  'hk_linked_v1',
];

/** 이 키가 계정에 딸린 데이터인가. 순수 판정 — 테스트가 목록 전체를 검사한다. */
export function isUserKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  if (key.startsWith(ARCHIVE_PREFIX)) return false; // 보관함 자체는 옮기지 않는다
  if (DEVICE_KEYS.includes(key)) return false; // 안전핀이 항상 이긴다
  if (USER_KEYS.includes(key)) return true;
  return USER_KEY_PREFIXES.some(p => key.startsWith(p));
}

/** `acct_<uid>__<key>` 를 만든다. */
export function archiveKeyFor(uid: string, key: string): string {
  return `${ARCHIVE_PREFIX}${uid}${SEP}${key}`;
}

/** 보관함 키를 되돌린다(아니면 null). uid 에 구분자가 없다는 전제 — Firebase uid 는 영숫자다. */
export function parseArchiveKey(k: string): {uid: string; key: string} | null {
  if (!k.startsWith(ARCHIVE_PREFIX)) return null;
  const rest = k.slice(ARCHIVE_PREFIX.length);
  const i = rest.indexOf(SEP);
  if (i <= 0) return null;
  const key = rest.slice(i + SEP.length);
  if (!key) return null;
  return {uid: rest.slice(0, i), key};
}

/**
 * 키 묶음을 **복사 → 확인 → 삭제** 로 옮긴다. 확인된 키만 원본을 지운다.
 * 옮긴 키 수를 돌려준다. 값이 없는 키는 건너뛴다.
 */
async function moveKeys(pairs: {from: string; to: string}[]): Promise<number> {
  if (pairs.length === 0) return 0;
  const values = await AsyncStorage.getMany(pairs.map(p => p.from));
  // 값이 실제로 있는 것만 옮긴다(빈 키는 옮길 것도 지울 것도 없다).
  const movable = pairs.filter(p => typeof values[p.from] === 'string');
  if (movable.length === 0) return 0;

  const writes: Record<string, string> = {};
  for (const p of movable) writes[p.to] = values[p.from] as string;
  await AsyncStorage.setMany(writes);

  // 확인 — 정말 들어갔는가. 어긋난 키는 **원본을 지우지 않는다**(잃느니 중복이 낫다).
  const readBack = await AsyncStorage.getMany(movable.map(p => p.to));
  const verified = movable.filter(p => readBack[p.to] === writes[p.to]);
  if (verified.length !== movable.length) {
    reportIssue(
      'accountScope: 일부 키 확인 실패 — 원본을 보존한다',
      new Error(`verified ${verified.length}/${movable.length}`),
    );
  }
  if (verified.length) await AsyncStorage.removeMany(verified.map(p => p.from));
  return verified.length;
}

export interface SwitchResult {
  /** 이전 계정 보관함으로 옮긴 키 수. */
  archived: number;
  /** 새 계정 보관함에서 꺼내 온 키 수. */
  restored: number;
}

/**
 * 계정 전환 — 이전 계정 데이터를 보관하고, 새 계정 데이터를 꺼내 온다.
 *
 * `prevUid` 가 없으면(소유자 표시가 없던 기기) 보관 단계는 건너뛰고 복원만 한다.
 * 실패는 throw 한다 — 이 함수가 실패했는데 그대로 부팅하면 남의 데이터를 보여주게 되므로,
 * 호출부가 반드시 알아야 한다.
 */
export async function switchAccountStorage(
  prevUid: string | null,
  nextUid: string,
): Promise<SwitchResult> {
  const allKeys = await AsyncStorage.getAllKeys();

  // 1) 이전 계정 보관 — 먼저 그 계정의 낡은 보관함을 비운다(보관함은 '그 시점의 전량'이어야
  //    한다. 안 비우면 예전에 지운 데이터가 다음 복원에서 되살아난다).
  //    비운 뒤 쓰기가 실패해도 **원본은 아직 그대로**라 유실은 없다(원본 삭제는 확인 후).
  let archived = 0;
  if (prevUid && prevUid !== nextUid) {
    const staleArchive = allKeys.filter(k => {
      const p = parseArchiveKey(k);
      return p?.uid === prevUid;
    });
    if (staleArchive.length) await AsyncStorage.removeMany(staleArchive);

    const live = allKeys.filter(isUserKey);
    archived = await moveKeys(live.map(k => ({from: k, to: archiveKeyFor(prevUid, k)})));
  }

  // 2) 새 계정 복원 — 보관함에서 제자리로.
  const mine: {from: string; to: string}[] = [];
  for (const raw of allKeys) {
    const p = parseArchiveKey(raw);
    // isUserKey 를 한 번 더 통과시킨다 — 보관함에 엉뚱한 키가 들어 있어도 되살리지 않는다.
    if (p && p.uid === nextUid && isUserKey(p.key)) mine.push({from: raw, to: p.key});
  }
  const restored = await moveKeys(mine);

  return {archived, restored};
}

/** 계정 정합 결과 — 무슨 일이 있었는지 호출부가 알 수 있게. */
export type ReconcileOutcome =
  | 'same' // 같은 계정 — 아무것도 하지 않음
  | 'adopted' // 소유자 표시가 없던 기기 — 지금 데이터를 이 계정 것으로 인정(업그레이드 경로)
  | 'switched'; // 계정이 바뀜 — 보관/복원 수행

/**
 * 로그인한 계정과 이 기기의 로컬 데이터를 맞춘다. **데이터를 읽기 전에** 부른다.
 *
 * · 소유자 표시가 없으면 → 지금 데이터를 이 계정 것으로 인정하고 표시만 남긴다.
 *   (업그레이드 경로다. 기존 사용자의 데이터가 사라지면 안 되므로 '인정'이 유일한 정답이다.)
 * · 표시가 같으면 → 아무것도 하지 않는다.
 * · 표시가 다르면 → 이전 계정 데이터를 보관하고 이 계정 데이터를 꺼내 온다.
 *
 * 실패는 throw 한다 — 삼키면 남의 데이터를 그대로 보여주게 된다.
 */
export async function reconcileAccountStorage(uid: string): Promise<ReconcileOutcome> {
  const owner = await AsyncStorage.getItem(CACHE_OWNER_KEY);
  if (!owner) {
    await AsyncStorage.setItem(CACHE_OWNER_KEY, uid);
    return 'adopted';
  }
  if (owner === uid) return 'same';
  await switchAccountStorage(owner, uid);
  // 전환이 끝난 뒤에 표시를 바꾼다 — 중간에 죽으면 표시가 아직 이전 계정이라
  // 다음 부팅에서 같은 전환을 다시 시도한다(멱등: 이미 옮긴 키는 값이 없어 건너뛴다).
  await AsyncStorage.setItem(CACHE_OWNER_KEY, uid);
  return 'switched';
}

/**
 * **탈퇴한 계정의 로컬 데이터만 지운다.** 같은 기기를 쓰는 다른 계정의 보관함은 남긴다.
 *
 * 왜 필요한가(2026-08-07 감사): 탈퇴 경로가 `AsyncStorage.clear()` 를 불렀다. 그건
 * 보관함(`acct_<uid>__*`)까지 통째로 날린다 — 가족이 한 폰을 쓰다 A 가 탈퇴하면
 * **B 의 미동기 로컬 기록이 함께 사라진다.** B 는 탈퇴한 적이 없고, 클라우드에 아직
 * 올라가지 않은 기록이었다면 되돌릴 방법이 없다(Iron Law: 사용자 데이터 파괴 금지).
 *
 * 탈퇴는 '사용자가 명시적으로 요청한 파기'라 자기 데이터를 지우는 건 정당하다.
 * 그 정당성이 **남의 데이터까지 늘어나지 않게** 범위를 좁히는 것이 이 함수다.
 *
 * 지우는 것: 현재 사용 중인 모든 키 + 떠나는 계정 자신의 보관함.
 * 남기는 것: **다른 uid** 의 보관함만.
 *
 * @param uid 탈퇴하는 계정. 비어 있으면 보관함을 제외한 나머지를 지운다(안전한 쪽).
 */
export async function wipeAccountStorage(uid: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const doomed = keys.filter(k => {
    // 소유자 표시는 남긴다. 이건 데이터가 아니라 **"지금 저장소가 누구 것인가"**라,
    // 지워 버리면 다음 로그인의 정합이 'adopted'(=지금 상태를 그 계정 것으로 인정)로
    // 빠져 **남아 있는 보관함을 복원하지 못한다.** 표시를 남겨 두면 다음 계정은
    // 'switched' 로 들어와 자기 보관함을 정상적으로 꺼내 온다.
    if (k === CACHE_OWNER_KEY) return false;
    const parsed = parseArchiveKey(k);
    if (!parsed) return true;            // 보관함이 아닌 것 = 지금 쓰는 데이터 → 지운다
    return !!uid && parsed.uid === uid;  // 내 보관함이면 지우고, 남의 것이면 남긴다
  });
  if (doomed.length) await AsyncStorage.removeMany(doomed);
}
