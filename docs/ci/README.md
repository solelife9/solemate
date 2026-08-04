# CI — 활성화 완료 (2026-08-04)

`ci.yml` 은 **`.github/workflows/ci.yml` 로 옮겨졌다.** 이 문서는 그 경위와, 푸시가
거부될 때 무엇을 하면 되는지만 남긴다.

## 옮긴 이유 (2026-08-04 출시 운영 감사 L-05)

Iron Law(머지 전 `tsc`·`lint`·`test` 통과 + 커버리지)를 **기계가** 집행한다.
혼자 개발하고 PR 리뷰가 없으니 게이트가 유일한 심판인데 지금까지 수동이었다 —
실제로 2026-07-27 에 tsc 가 실패한 커밋이 그대로 푸시된 적이 있다(`&&` 체인 오용).

**핫픽스에서 특히 위험하다.** 평상시 개발은 여유가 있어 수동으로 게이트를 돌린다.
핫픽스는 정의상 **당황한 상태에서 급하게** 만든다. 게이트가 사람 기억에 걸려 있으면
정확히 그때 빠지고, 급하게 낸 수정이 더 큰 걸 부수면 강제 업데이트 게이트로도 못
되돌린다(사용자를 잠글 수는 있어도 좋은 버전으로 되돌리는 건 또 한 번의 심사다).

## 푸시가 거부되면 (`refusing to allow ... workflow` 류)

원인은 코드가 아니라 **자격증명**이다. 지금 쓰는 fine-grained PAT 에 Workflows 권한이
없으면 `.github/workflows/` 를 건드린 커밋이 포함된 push 가 **통째로** 거부된다.

### 방법 A — 토큰에 권한 추가 (권장, 한 번만)
1. GitHub → Settings → Developer settings → Personal access tokens → 해당 토큰 편집
2. Repository permissions 에서 **Workflows: Read and write** 추가
3. 저장 후 `git push`

### 방법 B — 웹에서 직접 추가
1. `git reset --hard HEAD~1` 로 CI 커밋만 되돌린다. **이 이동은 단독 커밋**이라
   다른 작업이 딸려 나가지 않는다 — 그러라고 분리해 뒀다.
2. GitHub 저장소 → Actions → New workflow → set up a workflow yourself →
   `.github/workflows/ci.yml` 내용을 붙여넣고 저장.
3. 로컬에서 `git pull`.

## 이 워크플로가 하는 일

| 잡 | 내용 | 왜 나눴나 |
|---|---|---|
| `gates` | tsc → lint → test → 커버리지 | 매 푸시/PR 의 기본 방어선 |
| `rules` | JDK 21 + firebase 에뮬레이터로 `firestore.rules` 계약 테스트 | **앱 테스트는 firestore 를 목으로 대체해 규칙을 한 줄도 검증하지 못한다.** 2026-07-26 심사 B-01(런 상세 백업이 프로덕션에서 전량 거부됨)이 2,052개 테스트를 통과하며 살아남은 이유가 이것이다 |

`rules` 잡은 `JAVA21_HOME` 환경변수로 JDK 를 지정한다. 로컬 `scripts/jdk21-home.sh` 는
Homebrew keg 를 찾지만(Android Gradle 이 JDK 17 에 묶여 있어 전역 전환 금지), CI 에는 JDK 가
하나뿐이라 환경변수로 직접 알려주는 편이 단순하다 — 스크립트가 그 변수를 최우선으로 본다.
