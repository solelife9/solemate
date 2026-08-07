// ============================================================================
// lib/runEdit.ts — 러닝 수동 편집의 단일 규칙 (2026-08-07)
// ----------------------------------------------------------------------------
// 사용자가 기록 상세에서 거리·시간·날짜·신발을 고칠 수 있다. 그때 **무엇을 다시 계산하고
// 무엇을 그대로 두는지**를 한 곳에서 정한다.
//
// 왜 필요했나: 편집이 필드를 그냥 얹기만 해서 **칼로리가 옛 값 그대로 남았다.**
// 5km 를 7km 로 고치면 거리만 7km 고 칼로리는 5km 짜리다 — 한 화면 안에서 두 숫자가
// 서로를 부정한다. Truth only 위반이고, 사용자가 어느 쪽을 믿어야 할지 알 수 없다.
//
// ── 가르는 기준: 측정값이냐 파생값이냐 ──────────────────────────────────────
//
//   **파생값** — 다른 값에서 계산된 것. 입력이 바뀌면 **반드시 다시 계산한다.**
//     · calories = f(거리, 시간, 체중)
//
//   **측정값** — 그 순간 센서가 실제로 잰 것. **손대지 않는다.**
//     · 스플릿(splits_*) · 케이던스 · 고도 · 경로 · 심박
//     사용자가 거리를 손으로 고쳤다고 해서 없던 구간 기록을 지어내면 그게 더 나쁘다.
//     합계가 안 맞는 건 **수동 편집의 정직한 결과**이고, 그건 사용자가 만든 것이다.
//
// 이 파일은 순수하다(I/O·시각 의존 0) — 규칙을 그대로 테스트할 수 있다.
// ============================================================================

import {estimateCaloriesTotal} from './calories';

/** 사용자가 편집 폼에서 바꿀 수 있는 필드. */
export interface RunEditFields {
  shoe_id?: string;
  km?: number;
  run_date?: string;
  duration?: number;
}

/**
 * 편집 규칙을 적용할 수 있는 최소 런 정보(BackendRun 의 부분집합).
 *
 * ⚠️ 인덱스 시그니처(`[k: string]: unknown`)를 두지 않는다. 두면 인덱스 시그니처가 없는
 * 구체 타입(BackendRun)이 이 제약을 만족하지 못해, 제네릭이 T 를 여기까지 넓혀 버린다
 * (호출부에서 BackendRun[] 이 아니게 되어 setRuns 가 거부한다 — 실제로 한 번 밟았다).
 */
export interface EditableRun {
  km?: string | number;
  duration?: number;
  calories?: number;
}

/**
 * 편집 필드를 얹고 **파생값을 다시 계산해서** 돌려준다(원본 불변).
 *
 * 칼로리는 거리 또는 시간이 바뀐 경우에만 다시 계산한다 — 신발·날짜만 고친 편집은
 * 칼로리와 무관하므로 건드리지 않는다(불필요한 값 변경은 동기 트래픽만 만든다).
 *
 * 거리나 시간이 0/비정상이면 계산하지 않고 기존 값을 유지한다. 없는 값을 0 으로 덮으면
 * "칼로리 0kcal" 라는 **틀린 숫자**가 생기는데, 그건 옛 값보다도 나쁘다.
 *
 * @param weightKg 사용자 체중(kg). 0/미설정이면 칼로리를 손대지 않는다 — 기본 체중으로
 *                 추정해 넣으면 그 숫자의 출처가 사라진다.
 */
export function applyRunEdit<T extends EditableRun>(
  run: T,
  fields: RunEditFields,
  weightKg: number,
): T {
  const next = {...run, ...fields} as T;

  const inputsChanged = fields.km !== undefined || fields.duration !== undefined;
  if (!inputsChanged) return next;

  const km = Number(next.km) || 0;
  const durationS = Number(next.duration) || 0;
  if (!(km > 0) || !(durationS > 0) || !(weightKg > 0)) return next;

  next.calories = Math.round(estimateCaloriesTotal(km, durationS, weightKg));
  return next;
}
