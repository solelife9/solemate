# CI 활성화 — 한 번만 하면 되는 작업

`ci.yml` 은 **완성돼 있고 검증됐지만 아직 GitHub 에 올라가 있지 않다.**
지금 사용하는 토큰(fine-grained PAT)에 **Workflows 권한이 없어** `.github/workflows/` 경로로
푸시가 거부된다(REST Contents API 로도 동일하게 막힌다). 코드 문제가 아니라 자격증명 문제라
사람 손이 한 번 필요하다.

## 활성화 방법

### 방법 A — 토큰에 권한 추가 (권장)
1. GitHub → Settings → Developer settings → Personal access tokens → 해당 토큰 편집
2. Repository permissions 에서 **Workflows: Read and write** 추가
3. 저장 후 로컬에서:
   ```bash
   mkdir -p .github/workflows
   git mv docs/ci/ci.yml .github/workflows/ci.yml
   git commit -m "ci: 게이트 자동화 활성화"
   git push
   ```

### 방법 B — 웹에서 직접 추가
GitHub 저장소 → Actions → New workflow → set up a workflow yourself →
`docs/ci/ci.yml` 내용을 붙여넣고 `.github/workflows/ci.yml` 로 저장.
그 뒤 로컬에서 `git pull` 하고 `docs/ci/` 를 지운다.

## 이 워크플로가 막아주는 것

Iron Law(머지 전 `tsc`·`lint`·`test` 통과 + 커버리지)를 **기계가** 집행한다.
혼자 개발하고 PR 리뷰가 없으니 게이트가 유일한 심판인데 지금까지 수동이었다 —
실제로 2026-07-27 에 tsc 가 실패한 커밋이 그대로 푸시된 적이 있다(`&&` 체인 오용).

두 개의 잡으로 나뉜다.

| 잡 | 내용 | 왜 나눴나 |
|---|---|---|
| `gates` | tsc → lint → test → 커버리지 | 매 푸시/PR 의 기본 방어선 |
| `rules` | JDK 21 + firebase 에뮬레이터로 `firestore.rules` 계약 테스트 | **앱 테스트는 firestore 를 목으로 대체해 규칙을 한 줄도 검증하지 못한다.** 2026-07-26 심사 B-01(런 상세 백업이 프로덕션에서 전량 거부됨)이 2,052개 테스트를 통과하며 살아남은 이유가 이것이다 |

`rules` 잡은 `JAVA21_HOME` 환경변수로 JDK 를 지정한다. 로컬 `scripts/jdk21-home.sh` 는
Homebrew keg 를 찾지만(Android Gradle 이 JDK 17 에 묶여 있어 전역 전환 금지), CI 에는 JDK 가
하나뿐이라 환경변수로 직접 알려주는 편이 단순하다 — 스크립트가 그 변수를 최우선으로 본다.
