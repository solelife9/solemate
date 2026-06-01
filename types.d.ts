// Ambient module declarations for JS-only deps without bundled TS types.
declare module 'react-native-vector-icons/Ionicons';

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
  retired?: boolean;      // 보관(아카이브): picker에서 숨김, 기록은 보존
  // ── 서버 truth(audit#9/#10) ───────────────────────────────────────────────
  // 신발 누적 주행거리/시간을 서버가 영속한다. 기존엔 클라이언트가 런 로그를 합산해
  // 파생했는데, 다른 기기에서 기록한 런이 아직 동기되지 않으면 수명/시간이 과소표시됐다.
  // 서버가 이 값을 주면 그것을 우선(truth)으로 쓰고, 없으면 기존 클라이언트 파생으로
  // 폴백한다(점진 마이그레이션 — 백엔드가 채우기 전에도 안전).
  total_km?: number;      // 서버 누적 주행거리(km)
  run_time?: number;      // 서버 누적 러닝 시간(초)
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
  _pending?: boolean;     // 미동기(큐) 낙관적 항목
}
