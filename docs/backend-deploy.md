# Keego 백엔드 Render 배포 가이드

> 대상 repo: `solelife9/solelife-backend` (별도 저장소, `C:\Users\user\solelife-backend`).
> Node/Express + better-sqlite3, `/api/v1` 진척 API + 기존 `/api/auth|shoes|runs`.
> ⚠️ **danger-zone(사용자 액션)**: 서비스 계정 키 같은 비밀이 들어가므로 사람이 직접 수행.

## 1. 사전 확인
- 코드는 origin/main에 최신(랭크 3축 미러까지) push 완료.
- `package.json` engines: Node 20.x. start: `node server.js`.
- DB: better-sqlite3(파일 SQLite). Render 무료 인스턴스는 **디스크가 재시작 시 초기화**될 수 있음 →
  영속이 필요하면 Render **Persistent Disk**(유료) 또는 외부 DB로 이전 검토. (랭킹/프로필은 재계산 가능하나 안전하게 디스크 권장.)

## 2. Render 설정
1. Render 대시보드 → New → **Web Service** → GitHub `solelife9/solelife-backend` 연결.
2. Build Command: `npm install`  (better-sqlite3 네이티브 빌드 — Node 20 환경 확인)
3. Start Command: `node server.js`
4. Instance: 최소 Starter 이상 권장(무료는 15분 idle 후 슬립 → 첫 요청 콜드스타트 30~50s).
5. **Environment**:
   - `NODE_VERSION = 20`
   - `FIREBASE_SERVICE_ACCOUNT` = Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키(JSON) 전체를 **한 줄/Secret**으로 붙여넣기. (앱의 ID토큰 검증용)
   - 기타 앱이 기대하는 키(있으면 `.env` 참고).
6. (영속 필요시) Persistent Disk 마운트 → SQLite 파일 경로를 디스크로.

## 3. 배포 후 검증
- `GET https://solelife-backend.onrender.com/` (헬스/루트) 200 확인.
- `POST /api/auth {device_id}` → `{user_id}` 반환 확인.
- 앱에서 부팅 → 'ready'(재시도 카드 아님) + 신발/런 동기화 + 명예의 전당(랭킹) 로드 확인.
- 콜드스타트가 길면 앱 부팅 타임아웃(8s)에 걸릴 수 있음 → Starter 인스턴스로 슬립 방지 또는 워밍업.

## 4. 앱 쪽 연동(이미 되어 있음)
- `lib/api.ts` API 상수 = `https://solelife-backend.onrender.com` (배포 도메인과 일치해야 함).
- 신발/런 CRUD(`apiAddShoe`/`apiAddRun` 등)는 아직 REST 의존(Phase 5b 에서 Firestore 전환 예정).
- ⚠️ **랭킹은 더 이상 REST 가 아니다**: Phase 3/5a 에서 Firestore(`leaderboards/*`)로 이전됨.
  `keegoRankingProvider`/`remoteRanking`/`ensureBackendSynced` 는 제거됨 → `docs/firebase-deploy.md` 참고.

## 5. 주의
- 운영 DB에 테스트 데이터 시드 금지(공용). 로컬 검증은 앱의 dev seed(`__KEEGO_DEV_SEED__`, 릴리스 미포함)로.
