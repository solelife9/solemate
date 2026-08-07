// ============================================================================
// lib/medalPhotoSync.ts — 메달·기록증 사진의 올리기/내려받기 조율
//
// 두 방향이 있고 **성격이 다르다**:
//
//   올리기 : 기기에 사진이 있는데 클라우드 경로가 없다 → 올리고 경로를 레코드에 박는다.
//            경로는 다른 기기로 **전파돼야** 하므로 updatedAt 을 올려 dirty 로 만든다.
//
//   내려받기: 클라우드 경로가 있는데 기기에 파일이 없다(재설치·기기교체) → 받아서
//            로컬 URI 를 다시 채운다. 이 URI 는 **이 기기에서만 뜻이 있으므로**
//            updatedAt 을 올리지 않는다 — 올리면 남의 기기 경로가 서로를 덮어쓰며
//            무한 동기 핑퐁이 된다.
//
// 이 파일의 계획(plan) 부분은 **순수 함수**다. 무엇을 올리고 받을지는 I/O 없이 정해지고,
// 실제 전송만 executor 가 한다(테스트가 네트워크 없이 규칙을 검증할 수 있게).
// ============================================================================

import {liveMedals, type Medal} from './medals';
import {cloudPhotoDest, ensurePhotoDir, photoExists} from './photo';
import {
  downloadPhoto,
  medalPhotoPath,
  pathBelongsTo,
  uploadPhoto,
  type PhotoKind,
} from './photoCloud';

/** 한 메달의 두 사진 슬롯. 필드 이름이 kind 로 갈리는 것을 여기 한 번만 적는다. */
const SLOTS: {kind: PhotoKind; uriKey: 'medalPhotoUri' | 'certPhotoUri'; pathKey: 'medalPhotoPath' | 'certPhotoPath'}[] = [
  {kind: 'medal', uriKey: 'medalPhotoUri', pathKey: 'medalPhotoPath'},
  {kind: 'cert', uriKey: 'certPhotoUri', pathKey: 'certPhotoPath'},
];

export interface PhotoJob {
  medalId: string;
  kind: PhotoKind;
  uriKey: 'medalPhotoUri' | 'certPhotoUri';
  pathKey: 'medalPhotoPath' | 'certPhotoPath';
  /** 올리기: 올릴 로컬 파일. 내려받기: 현재(아마 죽은) 로컬 URI. */
  localUri?: string;
  /** 클라우드 경로. 올리기면 새로 만든 경로, 내려받기면 레코드에 있던 경로. */
  cloudPath: string;
}

/**
 * 무엇을 올리고 무엇을 받아야 하는지 정한다. **I/O 없음** — 로컬 파일이 실제로 있는지는
 * 여기서 묻지 않고 executor 가 확인한다(그래야 이 규칙을 테스트할 수 있다).
 *
 * 묘비(deleted)는 건너뛴다 — 지운 메달의 사진을 올리는 것은 사용자 의사에 반한다.
 */
export function planPhotoJobs(medals: Medal[], uid: string): {uploads: PhotoJob[]; downloads: PhotoJob[]} {
  const uploads: PhotoJob[] = [];
  const downloads: PhotoJob[] = [];
  if (!uid) return {uploads, downloads};

  for (const m of liveMedals(Array.isArray(medals) ? medals : [])) {
    if (!m?.id) continue;
    for (const s of SLOTS) {
      const uri = m[s.uriKey];
      const path = m[s.pathKey];
      if (path) {
        // 남의 계정 경로는 만지지 않는다 — 계정을 갈아탄 기기에서 로컬에 남은 레코드가
        // 이전 사용자의 사진을 끌어오면 그게 곧 계정 간 데이터 누출이다.
        if (!pathBelongsTo(path, uid)) continue;
        downloads.push({medalId: m.id, kind: s.kind, uriKey: s.uriKey, pathKey: s.pathKey, localUri: uri, cloudPath: path});
      } else if (uri) {
        uploads.push({
          medalId: m.id,
          kind: s.kind,
          uriKey: s.uriKey,
          pathKey: s.pathKey,
          localUri: uri,
          cloudPath: medalPhotoPath(uid, m.id, s.kind),
        });
      }
    }
  }
  return {uploads, downloads};
}

export interface PhotoSyncResult {
  /** 변경이 있으면 새 배열, 없으면 입력 배열 그대로(참조 동일 → 화면 재렌더 안 함). */
  medals: Medal[];
  /** 경로가 새로 박혀 **동기로 내보내야 하는** 변경이 있었는가. */
  dirty: boolean;
  uploaded: number;
  downloaded: number;
}

/** 한 필드만 갈아 끼운 새 메달 배열. 입력 불변. */
function patch(medals: Medal[], id: string, fields: Partial<Medal>): Medal[] {
  return medals.map((m) => (m.id === id ? {...m, ...fields} : m));
}

/**
 * 계획을 실행한다. **어떤 실패도 던지지 않는다** — 사진 백업이 앱 흐름을 막으면 안 되고,
 * 실패한 건은 경로가 안 박히거나 파일이 안 생겨서 **다음 호출에 자동으로 재시도**된다.
 *
 * @param now  updatedAt 스탬프(테스트 결정성 — Date.now 를 안에서 부르지 않는다).
 */
export async function syncMedalPhotos(medals: Medal[], uid: string, now: number): Promise<PhotoSyncResult> {
  const {uploads, downloads} = planPhotoJobs(medals, uid);
  if (uploads.length === 0 && downloads.length === 0) {
    return {medals, dirty: false, uploaded: 0, downloaded: 0};
  }

  let next = medals;
  let dirty = false;
  let uploaded = 0;
  let downloaded = 0;

  for (const job of uploads) {
    if (!job.localUri) continue;
    // 이미 사라진 파일을 올리려 시도하지 않는다(1단계 이전에 캐시에서 증발한 사진들).
    if (!(await photoExists(job.localUri))) continue;
    if (await uploadPhoto(job.cloudPath, job.localUri)) {
      next = patch(next, job.medalId, {[job.pathKey]: job.cloudPath, updatedAt: now} as Partial<Medal>);
      dirty = true;
      uploaded++;
    }
  }

  for (const job of downloads) {
    if (await photoExists(job.localUri)) continue; // 파일이 살아 있으면 받을 이유가 없다
    const dest = cloudPhotoDest(`${job.medalId}-${job.kind}`);
    if (!dest) continue;
    if (!(await ensurePhotoDir())) continue;
    const got = await downloadPhoto(job.cloudPath, dest);
    if (got) {
      // updatedAt 을 올리지 않는다 — 로컬 경로는 이 기기의 사정이지 동기할 사실이 아니다.
      next = patch(next, job.medalId, {[job.uriKey]: got} as Partial<Medal>);
      downloaded++;
    }
  }

  return {medals: next, dirty, uploaded, downloaded};
}
