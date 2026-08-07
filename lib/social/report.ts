// ============================================================================
// lib/social/report.ts — 부적절한 프로필 신고 (순수·DI)
// ============================================================================
// App Store 심사지침 1.2(사용자 생성 콘텐츠)는 신고 수단·차단 수단·조치 절차를 함께
// 요구한다. 차단은 `lib/social/blockList.ts`(로컬), 신고가 여기다(서버로 보낸다).
//
// **무엇을 보내고 무엇을 안 보내는가.**
//   보낸다: 신고 대상 uid · 사유(정해진 값) · 신고자 uid · 시각
//   안 보낸다: 자유 입력 텍스트. 신고 사유를 자유 서술로 받으면 그 자체가 새로운 UGC 가
//   되고(무엇이 들어올지 모른다), 처리방침에 "이용자가 입력한 임의의 문장을 수집한다"를
//   또 적어야 한다. **정해진 사유 목록으로 충분하다.**
//
// **신고자 uid 는 왜 보내나.** `search_misses` 는 정반대로 계정 식별자를 뺐는데(2026-08-03),
// 거기선 "누가 찾았는지"가 목적에 불필요했기 때문이다. 신고는 다르다 — 같은 사람이 한
// 대상을 반복 신고하는 것과 여러 사람이 신고하는 것을 **구분하지 못하면 조치를 정할 수
// 없고**, 악의적 신고도 막을 수 없다. 목적에 필요하므로 받고, 처리방침에 고지한다.
//
// **계약:** 항상 resolve · throw 금지. 실패해도 사용자에겐 접수된 것으로 보인다 —
// 신고는 "보내졌다"는 확신이 중요하고, 재시도는 조용히 다음 기회에 한다.
// (규칙: firestore.rules `reports` — create 만 허용, 읽기·수정·삭제 전면 차단)
// ============================================================================

/** 신고 사유(고정 목록). 자유 입력을 받지 않는 이유는 위 머리말 참조. */
export const REPORT_REASONS = [
  'inappropriate_nickname',
  'impersonation',
  'offensive_content',
  'spam',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 화면에 그대로 쓰는 한국어 라벨(사용자 언어는 한국어 — CLAUDE.md). */
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  inappropriate_nickname: '부적절한 닉네임',
  impersonation: '사칭으로 보여요',
  offensive_content: '불쾌하거나 공격적인 내용',
  spam: '광고·스팸',
  other: '기타',
};

export function isReportReason(v: unknown): v is ReportReason {
  return typeof v === 'string' && (REPORT_REASONS as readonly string[]).includes(v);
}

export interface ReportPayload {
  targetUid: string;
  reporterUid: string;
  reason: ReportReason;
  createdAt: number;
}

/**
 * 보낼 문서를 만든다(순수). 필드 화이트리스트는 규칙과 **한 글자도 어긋나면 안 된다** —
 * 어긋나면 서버가 거부하고, 그 거부는 조용히 삼켜져 "신고했는데 아무 일도 안 일어남"이 된다.
 * 만들 수 없으면 null(대상이 없거나 사유가 모르는 값).
 */
export function buildReport(input: {
  targetUid: unknown;
  reporterUid: unknown;
  reason: unknown;
  nowMs: number;
}): ReportPayload | null {
  const targetUid = typeof input.targetUid === 'string' ? input.targetUid.trim() : '';
  const reporterUid = typeof input.reporterUid === 'string' ? input.reporterUid.trim() : '';
  if (!targetUid || !reporterUid) return null;
  // 자기 자신 신고는 만들지 않는다 — 조치 대상이 될 수 없고 집계만 더럽힌다.
  if (targetUid === reporterUid) return null;
  if (!isReportReason(input.reason)) return null;
  const createdAt = Number.isFinite(input.nowMs) ? Math.floor(input.nowMs) : 0;
  if (createdAt <= 0) return null;
  return {targetUid, reporterUid, reason: input.reason, createdAt};
}

export interface ReportPort {
  /** 신고 문서 1건을 만든다(create only). 실패는 throw 해도 되고, 여기서 삼킨다. */
  createReport(payload: ReportPayload): Promise<void>;
}

/**
 * 신고를 보낸다. **항상 resolve** 하고, 보낼 수 없는 입력이면 false 를 돌려준다.
 * 전송 실패(오프라인 등)는 true 로 답한다 — Firestore 오프라인 큐가 연결 복구 시 올린다.
 */
export async function submitReport(
  port: ReportPort,
  input: {targetUid: unknown; reporterUid: unknown; reason: unknown; nowMs: number},
): Promise<boolean> {
  const payload = buildReport(input);
  if (!payload) return false;
  try {
    await port.createReport(payload);
  } catch {
    /* 오프라인·일시 실패는 삼킨다(오프라인 영속이 큐잉한다). 사용자에겐 접수로 보인다. */
  }
  return true;
}
