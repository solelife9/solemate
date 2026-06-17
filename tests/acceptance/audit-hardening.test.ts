/**
 * Acceptance tests — Audit Hardening 배치 (2026-06-17)
 *
 * tenet 규약: 시나리오에서 생성한 수용 테스트. 구현 전엔 it.todo 로 두어 스위트를
 * green 으로 유지하고, 각 묶음의 마지막 dev 잡이 자기 묶음의 todo 를 실제 단언으로
 * 교체한다(=수용 통과). integration_test 잡은 교체된 테스트를 실행해 보고만 한다.
 *
 * 묶음: A(P0 데이터) · B(런플로우+햅틱+a11y) · C(폼+피드백) · D(코드품질) · E(디자인시스템)
 */

describe('Audit Hardening 수용', () => {
  describe('A. P0 데이터 정합성 (REST 정본)', () => {
    it.todo('최신 우선: 같은 id 충돌은 updatedAt 큰 쪽을 채택한다');
    it.todo('updatedAt: add/edit/updateMaxKm/retire 가 updatedAt(epoch ms)을 기록한다');
    it.todo('tombstone: 삭제는 deleted+updatedAt 묘비로 표현되고 머지가 부활시키지 않는다');
    it.todo('오프라인 부팅: 캐시 + pending_runs 오버레이로 미동기 런이 보인다');
    it.todo('클라우드→REST 역등록: REST에 없는 머지 레코드를 apiAdd*로 합류시킨다');
    it.todo('마이그레이션: 기존 레코드에 updatedAt 시드, 기존 값 비파괴');
    it.todo('FCM: 토큰 배선 실패가 부팅을 막지 않는다(graceful no-op)');
  });

  describe('B. 런플로우/온보딩 통합 + 햅틱 + 접근성', () => {
    it.todo('theme 수렴: Run*/Onboarding에 사설 팔레트(C/KG)·BebasNeue 참조 0');
    it.todo('햅틱: 카운트다운/GO/시작·정지/목표달성/길게눌러종료가 lib/haptics 호출');
    it.todo('a11y: 런플로우 터치요소가 accessibilityRole/Label 보유');
    it.todo('온보딩 로그인 링크가 의도한 동작(로그인 경로)을 수행한다');
  });

  describe('C. 폼 + 피드백', () => {
    it.todo('토스트: 삭제 시 undo 스낵바가 뜨고 undo가 레코드를 사이드키까지 복원');
    it.todo('폼: RunForm/AddShoe가 KeyboardAvoidingView + 입력 마스킹 + 인라인 검증');
    it.todo('새로고침: Home/History가 RefreshControl로 동기화 재시도');
  });

  describe('D. 코드 품질', () => {
    it.todo('타입: lib/api.ts·lib/stats.ts에 any 0, 도메인 타입 사용');
    it.todo('중복제거: TIER_LABEL 정의가 theme.ts 1곳, MM:SS/YYYY-MM 빌더 단일화');
    it.todo('가상화: HistoryScreen 런 리스트가 FlatList(keyExtractor) 사용');
  });

  describe('E. 디자인 시스템 통합', () => {
    it.todo('CTA: 단일 Button 프리미티브, MockupButton/인라인 그라데이션 제거');
    it.todo('Card/SegmentedControl/StatGrid 프리미티브 채택, 단일 보더 토큰');
    it.todo('TYPE: 반px 사이즈 제거, hero/scrim/screen-padding 토큰 도입');
  });
});
