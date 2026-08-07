// ============================================================================
// lib/social/reportPort.ts — 신고를 Firestore 로 보내는 얇은 포트
// ============================================================================
// `report.ts` 는 firebase 를 import 하지 않는다(순수·테스트 가능). 실제 배선이 여기다 —
// `firestoreRankingStore.ts` 와 같은 DI 패턴이다.
//
// 규칙(`firestore.rules` `match /reports/{docId}`)이 create 만 허용하고 필드를
// 화이트리스트로 검사한다. **필드가 한 글자만 어긋나도 서버가 거부**하고, 그 거부는
// 조용히 삼켜져 "신고했는데 아무 일도 안 일어남"이 된다 — 그래서 payload 를 만드는 쪽
// (`buildReport`)과 규칙이 같은 목록을 쓰는지 테스트가 대조한다.
// ============================================================================
import {getFirestore, collection, addDoc} from '@react-native-firebase/firestore';
import type {ReportPayload, ReportPort} from './report';

export const keegoReportPort: ReportPort = {
  async createReport(payload: ReportPayload): Promise<void> {
    // 문서 id 는 서버가 정한다(uid 를 id 로 쓰면 한 사람이 한 번만 신고할 수 있고,
    // 같은 사람을 여러 번 신고한 사실 자체가 조치 판단의 재료다).
    await addDoc(collection(getFirestore(), 'reports'), payload as unknown as Record<string, unknown>);
  },
};
