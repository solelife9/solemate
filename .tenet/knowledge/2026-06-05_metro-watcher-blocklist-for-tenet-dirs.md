# Metro watcher blockList for tenet dirs

type: knowledge
source_job: a8812b82-5db9-4286-a707-fb07fd66d7ec
job_name: 신발 상세 추천 카드
confidence: implemented-and-tested
created: 2026-06-05T12:43:37.053Z

## Findings

- **problem**: tenet 자율런이 .tenet/에 상태·저널·로그를 지속 기록 → metro 워처가 프로젝트 루트 전체 감시 중 이 쓰기에 자기무효화 → 번들 0%↔n% 무한 재시작, 디바이스는 불완전/wedged 번들을 받아 터치 안 먹고 비동기 이미지 로드 실패(검은 배경).
- **fix**: metro.config.js resolver.blockList = /[/\\]\.(tenet|agents|codex|claude)[/\\].*|.*\.log$/ (commit 59e1a22). blockList는 metro-file-map ignorePattern으로 전달돼 watch/crawl에서 제외.
- **verified**: metro --reset-cache 클린 기동(설정 에러 0), 8MB 완전 번들 빌드 확인. tsc/lint/test 영향 없음.
- **gotcha**: metro와 tenet을 동시에 돌릴 때 필수. 디바이스 검증 시 emulator 자체가 wedged(BR_DEAD_REPLY binder death)면 콜드 리부트 필요 — 하드웨어 메뉴키(keyevent 82)는 먹지만 RN 터치 파이프라인은 죽어있는 증상.
- **related**: memory keego-metro-log-in-project-footgun
