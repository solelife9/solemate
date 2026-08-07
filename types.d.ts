// Ambient module declarations for JS-only deps without bundled TS types.
declare module 'react-native-vector-icons/Ionicons';
declare module 'react-native-vector-icons/MaterialCommunityIcons';

// ── backend payload shapes ────────────────────────────────────────────────────
// 백엔드(REST) 응답/요청 행의 실제 필드 형태. App.tsx의 shoes/runs 상태가 들고 있는
// "서버에서 온 그대로의" 행을 기술한다(프레젠테이션 Shoe/Run 과 구분 — 그쪽은
// toUiShoe/toUiRun 어댑터가 만든다). 백엔드가 km 등을 문자열로도 숫자로도 보내므로
// km은 string|number 로 둔다. 어댑터 경계(toUiShoe/toUiRun)는 의도적으로 any 를
// 유지한다(과도한 타입화 방지) — 이 인터페이스는 상태 배열의 경계만 좁힌다.

// 전역 ambient 선언(파일을 모듈로 만들지 않도록 export/import 금지 — export 를 넣는
// 순간 위의 `declare module` 단축형이 모듈 스코프로 갇혀 Ionicons 타입이 깨진다).
// 따라서 App.tsx 는 import 없이 전역으로 BackendShoe/BackendRun 을 참조한다.

// 서버 신발 행. id/name 은 항상 존재, 나머지는 등록 시점/백엔드 버전에 따라 선택.
interface BackendShoe {
  id: string;
  name: string;
  user_id?: string;
  max_km?: number;        // 카테고리 권장 수명(km)
  start_km?: number;      // 등록 시 이미 쌓인 주행거리
  purchase_date?: string; // YYYY-MM-DD
  // 구매가(원) — 원/km(비용 효율) 계산의 분자. 선택 입력이며, 없으면 원/km를 계산하지
  // 않는다(정가를 추측해 채우지 않는다 — Truth only). 정가가 아니라 '내가 실제로 낸 값'
  // 이라, 내 지난 신발의 원/km는 100% 실측이 된다.
  price_krw?: number;
  retired?: boolean;      // 보관(아카이브): picker에서 숨김, 기록은 보존
  // ── 서버 truth(audit#9/#10) ───────────────────────────────────────────────
  // 신발 누적 주행거리/시간을 서버가 영속한다. 기존엔 클라이언트가 런 로그를 합산해
  // 파생했는데, 다른 기기에서 기록한 런이 아직 동기되지 않으면 수명/시간이 과소표시됐다.
  // 서버가 이 값을 주면 그것을 우선(truth)으로 쓰고, 없으면 기존 클라이언트 파생으로
  // 폴백한다(점진 마이그레이션 — 백엔드가 채우기 전에도 안전).
  total_km?: number;      // 서버 누적 주행거리(km)
  run_time?: number;      // 서버 누적 러닝 시간(초)
  // ── 클라우드 머지용 선택필드(audit a1) ────────────────────────────────────────
  // updatedAt(epoch ms): mutation 마다 갱신. cloudSync.mergeRecords 의 '최신 우선'
  // 머지가 읽는다. deleted: tombstone(a2). 둘 다 선택 — 부재 시 기존 동작 유지(하위호환).
  updatedAt?: number;
  deleted?: boolean;
}

// 서버 런 행. km 은 백엔드가 문자열로도 보내므로 string|number. _pending 는 낙관적
// 로컬 삽입을 표시하는 클라이언트 전용 플래그(서버 응답엔 없음).
interface BackendRun {
  id: string;
  shoe_id: string;
  km: string | number;
  run_date: string;       // YYYY-MM-DD
  user_id?: string;
  duration?: number;      // 초
  cadence?: number;       // spm
  memo?: string;
  source?: string;
  route?: string;         // JSON 직렬화된 좌표 배열
  location?: string;
  run_time?: string;      // "HH:MM"
  heart_rate?: number;
  elevation_m?: number;   // 누적 고도 상승(m) — 엔진 측정값(이전엔 저장 경로에서 버려졌다)
  calories?: number;      // 소모 칼로리(kcal) — 거리·체중 기반 추정(완주 시 고정)
  /**
   * 러닝을 **실제로 시작한 시각**(epoch ms). 2026-08-07 신설.
   *
   * 왜 필요한가: 여태 저장된 런에는 시작 시각이 없어서 소비처들이 `updatedAt − duration`
   * 으로 **역산**했다. 그런데 `updatedAt` 은 저장 시각이고 `duration` 은 **이동 시간**이라
   * (일시정지·死구간이 빠져 있다) 둘의 차이가 진짜 시작이 아니다.
   * 10분 쉬어간 40분 러닝이면 창이 통째로 10분 밀리고, 완주 검토 화면에 오래 머물면
   * 그만큼 더 밀린다. 그 오차가 세 곳을 동시에 오염시켰다:
   *   · HealthKit 워크아웃 기록 + 심박 백필 창 → 앞부분 심박 누락, 러닝 후 회복 심박 포함
   *   · 48시간 심박 스윕 → **정확한 라이브 트랙을 밀린 트랙으로 덮어쓴다**
   *   · 폰↔워치 병합 창 → 겹침이 0 이 돼 같은 러닝이 두 건 남는다(신발 이중 차감)
   *
   * 앱은 이 값을 이미 알고 있었다(`runTracker.getStartMs()`, 워치는 payload.startMs).
   * `run_date` 는 2026-08-04 부터 그걸 쓰는데 나머지 소비처만 역산에 남아 있었다.
   * 역산을 더 정교하게 만드는 대신 **알고 있는 값을 그냥 적는다.**
   *
   * 구 레코드에는 없다 — 소비처는 이 필드가 있으면 쓰고, 없으면 예전처럼 역산한다.
   */
  start_ms?: number;
  /**
   * 이 러닝의 **최대 심박**(bpm). 2026-08-07 신설.
   *
   * 왜 필요한가: 훈련부하를 심박 기반(TRIMP)으로 내려면 평균·최대·안정시가 다 있어야
   * 하는데, **최대 심박을 저장하는 곳이 없었다.** 그래서 `hasHr` 조건이 항상 거짓이고
   * TRIMP 는 **어느 플랫폼에서도 한 번도 발동한 적이 없다** — 늘 페이스 기반으로 떨어졌다.
   * (ProfileScreen 주석은 "최대 심박은 런들에서 관측된 값을 집계한다"고 적혀 있었는데
   *  사실이 아니었다. 집계할 원본 자체가 없었다.)
   *
   * 저장 시 hrTrack 에서 뽑는다(측정값 — 추정하지 않는다). 심박이 없는 러닝엔 없다.
   */
  heart_rate_max?: number;
  _pending?: boolean;     // 미동기(큐) 낙관적 항목
  // 클라우드 머지용 선택필드(audit a1) — BackendShoe 와 동일 의미(updatedAt/deleted).
  updatedAt?: number;
  deleted?: boolean;
}
