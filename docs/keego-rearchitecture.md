# Keego 재구성(Re-architecture) 설계서

작성: 2026-07-04 · 기반: 전체 코드베이스 탐색 (22개 화면 · lib 93모듈 · theme/primitives · git 히스토리)
컨셉: **미니멀 럭셔리** — Satisfy의 감도 × Apple의 절제. 타이포와 여백이 주인공, 오렌지(#FF6500)는 데이터에만.

---

## 0. 진단 — 지금 무엇이 문제인가

**기능은 탑티어, 구조는 과적.** 코드 품질 자체는 견고하다(순수 함수 레이어, 단일 소스, 테스트 839+).
문제는 세 가지다.

1. **게이미피케이션 4겹 중첩** — 메달(~40종) + XP/랭크(7티어) + 챌린지(개인+확장 2종) + 리더보드(5카테고리).
   같은 러닝 하나가 4개의 보상 시스템에 동시에 꽂힌다. 미니멀 럭셔리와 정면충돌.
2. **홈 화면 8+ 섹션 과적** — 캐러셀, 부상카드, 주간통계, 피트니스(VO2max), 챌린지 스트립,
   로테이션, 어필리에이트 추천… "신발 골라 뛴다"는 핵심 저니가 카드 더미에 묻힘.
3. **구조 부채** — App.tsx 2,434줄 갓컴포넌트(11+ 오버레이 boolean), 루트에 평평하게 널린 34개 화면 파일,
   죽은 코드(RunActiveScreen.tsx, RunScreen.rn.tsx, titles.ts).

**사실 정정 2건** (요청서와 실제 코드의 차이):
- ~~Apple Health 동기화~~ → **미구현** (roadmap Phase 3-1 ☐). 현재 마일리지는 자체 GPS 러닝 + 수동 기록으로 쌓인다. MVP에 포함하면 안 됨.
- ~~Lottie 30종 메달~~ → Lottie 미사용. 실제는 **SVG + RN Animated 기반 ~40종 메달** + CelebrationScreen(라디얼 글로우 + 핑 링). 이대로가 더 가볍고 좋다 — Lottie 도입 불필요.

---

## 1. MVP 트리아지

### KEEP — 1차 출시 코어 (이 앱의 '왜')

| 기능 | 이유 |
|---|---|
| 홈 캐러셀 → 러닝 시작 | 불가침 저니 (제약사항) |
| GPS 러닝 엔진 전체 (백그라운드·크래시복구·오토퍼즈·Live Activity·워치) | 완성도 95%, 불가침 |
| 신발 등록(226모델 DB) · 마모 4단계 · 교체 예측 | 앱의 존재 이유 |
| **은퇴식 + 은퇴 카드(5레이아웃) + Hall of Shoes** | **킬러 감성 기능.** "신발과의 이별"을 의식으로 만든 앱은 없다. 이게 Satisfy 무드의 핵심 |
| 기록 (리스트·요약·차트·PR 2×2) | 코어 루프의 축적면 |
| 부상 위험 신호 (마모×훈련부하 융합) | 차별화 데이터 기능. 단, 홈에선 '한 줄'로 |
| 메달 ~40종 + Celebration | 보상 루프는 **메달 하나로 단일화** |
| 로테이션 추천 | 멀티슈즈 유저 차별점. 2켤레↑ 조건부 노출 |
| 보이스 코칭 (152클립 오프라인) | 이미 완성. 설정 토글로 유지 |
| 로그인 4종 + Firestore 동기화 + 백업 | 견고함. 유지 |
| 수동 기록 입력 | Health 연동 전까지의 유일한 외부 러닝 유입구 |

### MOVE — 자리만 옮김 (삭제 아님)

| 기능 | 현재 | 이동 |
|---|---|---|
| FitnessCard (VO2max·폼·CTL) | 홈 | → **기록 탭 '인사이트' 섹션**. 러닝화 앱의 홈에 VO2max는 소음 |
| 챌린지 | 홈 스트립 + 마이 | → **메달 화면의 하위 섹션** (진행형 메달로 취급) |
| 어필리에이트 '다음 러닝화' | 홈 상시 | → **신발 상세, '교체 임박(80%↑)' 상태에서만**. 홈의 광고는 럭셔리를 죽임 |
| 신발 아카이브 | 전용 오버레이 | → 설정 하위 항목 |

### CUT → 백로그 (코드는 남기되 UI 진입점 제거)

| 기능 | 이유 |
|---|---|
| XP/랭크 7티어 (Bronze→Legend) | 메달과 역할 중복. 랭크 배지·XP 바·티어 컬러 7종은 미니멀리즘의 적 |
| Hall of Fame 리더보드 (Firestore 5종) | 유저 풀 없는 리더보드는 빈 방. 유저 1만 이후 재개 |
| 확장 챌린지 (weekly/shoe/rotation) | 개인 챌린지와 통합 |
| 칭호 시스템 | 이미 deprecated — **코드 삭제** (lib/progression/titles.ts) |
| 트레일/우천 메달 스텁 | 데이터 소스 없음(항상 잠김) — 목록에서 숨김 |
| Apple Health 동기화 | 미구현. Phase 3 그대로 |

### DELETE — 죽은 코드 (즉시 삭제 가능)

- `RunActiveScreen.tsx` (구버전, 미import — `.rn.tsx`만 사용됨)
- `RunScreen.rn.tsx` (RunGoalScreen으로 대체됨, 미참조 확인 후)
- `lib/progression/titles.ts` + App.tsx의 titles 하위호환 블록

---

## 2. 정보 구조 — 4탭, 최대 2뎁스

```
Keego
├─ ① 홈          오늘 뛸 신발 → 시작 (저니 전용, 그 외 전부 배제)
├─ ② 신발        컬렉션 → 상세(2뎁스) · 은퇴관 입구
├─ ③ 기록        러닝 로그 · 통계 · PR · 인사이트(VO2max 이주)
└─ ④ 마이        프로필 · 메달 · 목표 · 설정

오버레이(모달): 러닝 플로우(목표→카운트다운→액티브→리캡) · 신발 추가 · Celebration
뎁스 규칙: 탭 → 서브 1장까지. 오버레이 11개 → 6개로.
```

### 화면별 와이어프레임

#### ① 홈 — "고르고, 뛴다" 외엔 아무것도 없다

```
┌────────────────────────────────┐
│ KEEGO                      [+] │ 워드마크(오렌지 그라디언트) · 신발추가
│                                │
│ 7월 4일 금요일                   │ Caption T3
│ 오늘은 어떤 신발로               │ Display 32 — 타이포가 히어로.
│ 달려볼까요?                     │ (locked 인사말)
│                                │
│    ┌──────────────────────┐    │
│  ◂ │ ● 최상 컨디션          │ ▸  │ 풀폭 스냅 캐러셀 + 양옆 peek
│    │                      │    │ ★ 앱에서 유일한 진짜 GlassCard
│    │ Pegasus 41           │    │ 모델명 800 weight
│    │ 312 / 650 km         │    │ 잔여수명 숫자만 오렌지
│    │ 데일리 · 회복 러닝      │    │ 종류칩 + 추천용도
│    │                      │    │
│    │ [     러닝 시작     ]  │    │ 카드 안 CTA (불가침)
│    └──────────────────────┘    │
│           ● ○ ○                │ 페이지 도트(활성=오렌지)
│                                │
│ 🟢 오늘 몸 상태 좋아요.           │ 부상신호 '한 줄' (탭→상세)
│                                │
│ 이번 주                         │
│ 12.4 km · 3회 · 5'42"          │ 카드 없이 타이포만. 탭→기록
│                                │
│ 오늘은 Novablast를 쉬게 해주세요  │ 로테이션 한 줄 (2켤레↑만)
└────────────────────────────────┘
│   홈     신발     기록     마이   │ 글래스 독(기존 TabBar 유지)
```

**제거된 것**: FitnessCard(→기록), 챌린지 스트립(→메달), 랭크 칩(백로그), 어필리에이트(→신발 상세),
'전체보기' 중복 링크. 8+ 섹션 → **4요소**. 스크롤이 거의 필요 없는 홈.

#### ② 신발 (Garage)

```
신발
3켤레와 함께 1,204km              ← 부제 (기존 유지)

╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮
┆      + 신발 추가       ┆        ← 점선 버튼 (기존 유지)
╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯
┌───────────────────────┐
│ Pegasus 41   ● 최상    │        ← 컨디션 우상단 (기존 결정 유지)
│ 나이키 · 데일리          │
│ 428 ──────────░ 650 km │        ← 라벨바
│ 평균 5'38" · ▶          │
└───────────────────────┘
… 카드 스택 (일반 카드 — 유리 아님)

은퇴한 신발                        
[ 🏛 명예의 전당  3켤레 › ]        ← Hall of Shoes 입구는 여기로
```

- **신발 상세**(2뎁스): 현재의 풍부함 유지(수명보정·통계·기록·부상배너) + 교체임박(80%↑)일 때만
  '다음 러닝화 추천' 카드 노출.
- **은퇴 플로우**: 유지. 골드 팔레트 Hall of Shoes 그대로 — 유일하게 허용되는 '다른 세계' 연출.

#### ③ 기록 (Runs)

```
기록
[주 | 월 | 년 | 전체]              ← 세그먼트 (기존)
42.2 km                          ← 요약: 큰 숫자 42px
5회 · 5'51" · 4h 06m
▂▅▃▇▂▁▄                          ← 추이 차트 (오렌지 바)

개인 기록                          ← PR 2×2 (기존)
최장거리 · 최고페이스 · 최장시간 · 스트릭

인사이트                           ← ★ FitnessCard 이주 지점
VO2max 45 · 폼: 최적 · CTL ↗

러닝 목록 (카드 리스트, 탭→상세)
```

#### ④ 마이 (You)

```
마이
민우 · 2025년 9월부터 KEEGO와 함께
1,204 km · 87회                   ← 평생 통계 타이포

[ 🏅 메달  17/40 › ]              ← ProgressionScreen 대체.
                                    그리드 + 하단에 진행형 챌린지 섹션.
                                    랭크/XP/리더보드 UI 제거(백로그)
주간 목표  ◯ 20km
설정
  러닝 ─ 보이스 코칭 · 오토퍼즈 · 단위
  데이터 ─ 계정 · 클라우드 · 백업 · 신발 아카이브
  알림 · 약관
```

#### 러닝 플로우 (오버레이 — 로직 불가침, 시각만 정렬)

```
홈 CTA → [목표 화면] → 카운트다운 3·2·1 → 액티브 → 리캡 → (메달 시 Celebration) → 홈
```

**제안 하나**: 목표 화면을 건너뛰는 게 기본 경로. CTA 탭 → 바로 카운트다운,
카운트다운 화면 구석에 "목표 설정" 텍스트 버튼. 러닝까지의 탭 수 2→1.
(현재 RunGoal의 기본값 로직 재사용 — 엔진 변경 없음)

---

## 3. Ultra-Transparent Glassmorphism — RN 구현 가이드

### 대전제: 유리는 예산제다

git 히스토리가 이미 증명했다 — 전역 GlassCard를 깔았다가 되돌렸다(`7e8e1bd`).
**그 revert가 정답이다.** BlurView는 네이티브 스냅샷 패스를 발생시켜 리스트에 깔면 스크롤이 죽는다.

**유리 예산: 화면당 최대 2개.**

| 요소 | 처리 |
|---|---|
| 탭바 독 | 진짜 blur (기존 TabBar 유지) |
| 홈 '오늘의 신발' 히어로 카드 | 진짜 blur (유일한 GlassCard) |
| 그 외 모든 카드 | **가짜 유리** — 반투명 surface + 헤어라인 (아래 참고) |

플랫 다크 배경 위에서 가짜 유리와 진짜 유리는 시각적으로 거의 구분 불가.
차이는 **뒤로 콘텐츠가 지나갈 때**만 드러난다 → 지나가는 게 있는 곳(탭바, 캐러셀)에만 진짜를 쓴다.

### 핵심 물리학: blur는 '비칠 것'이 있어야 산다

`#0A0A0A` 완전 플랫 배경 위에서 `blur(25px)`는 **아무것도 하지 않는다** (균일 색은 블러해도 균일).
컬러풀한 빛 없이 유리 질감을 살리는 법:

```tsx
// 배경: 딥 차콜 + '무채색' 라디얼 2개 (white 3~4%, 빛이 아니라 결)
// react-native-svg — 이미 설치됨
import Svg, {Defs, RadialGradient, Stop, Rect} from 'react-native-svg';

export function CharcoalBackdrop() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="a" cx="20%" cy="10%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.04" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="b" cx="85%" cy="55%" r="60%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.03" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="#0A0A0A" />
      <Rect width="100%" height="100%" fill="url(#a)" />
      <Rect width="100%" height="100%" fill="url(#b)" />
    </Svg>
  );
}
```

글로우가 아니다 — 3~4% 무채색 명암 '결'이다. 이 결이 유리 뒤에서 뭉개지며 질감이 생긴다.

### GlassCard — 진짜 유리 (히어로 전용)

```tsx
// components/GlassCard.tsx
import React from 'react';
import {Platform, StyleSheet, View, ViewProps} from 'react-native';
import {BlurView} from '@react-native-community/blur'; // 이미 설치됨 (v4.4.1)

type Props = ViewProps & {radius?: number; pad?: number};

export function GlassCard({children, style, radius = 20, pad = 20, ...rest}: Props) {
  return (
    <View style={[styles.shell, {borderRadius: radius}, style]} {...rest}>
      {Platform.OS === 'ios' ? (
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={25}
          reducedTransparencyFallbackColor="rgba(18,18,20,0.92)"
        />
      ) : (
        // Android: blur 비용 큼 → 불투명도 높인 폴백 (시각 등가)
        <View style={[StyleSheet.absoluteFill, {backgroundColor: 'rgba(20,20,22,0.88)'}]} />
      )}
      {/* 요청 스펙의 초투명 틴트 */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint]} />
      <View style={{padding: pad}}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',              // ★ blur를 radius로 클리핑 — 없으면 모서리 깨짐
    borderWidth: StyleSheet.hairlineWidth,   // ★ '0.5px' — RN에선 이게 정답 (기기별 0.33~0.5px)
    borderColor: 'rgba(255,255,255,0.10)',
    borderTopColor: 'rgba(255,255,255,0.16)', // 상단만 살짝 밝게 — 빛 받은 유리 엣지
    backgroundColor: 'transparent',
  },
  tint: {backgroundColor: 'rgba(10,10,10,0.05)'},
});
```

### SurfaceCard — 가짜 유리 (나머지 전부)

```tsx
// 리스트·통계 등 일반 카드. blur 0개 — 60fps 보장.
export function SurfaceCard({children, style, ...rest}: Props) {
  return (
    <View style={[surfaceStyles.card, style]} {...rest}>{children}</View>
  );
}
const surfaceStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',  // CARD(#1C1C1E)보다 투명감 있는 표현
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
  },
});
```

### 최적화 체크리스트

1. **`overflow:'hidden'` + radius를 blur 래퍼에** — 없으면 iOS에서 모서리 밖으로 블러가 샌다.
2. **0.5px = `StyleSheet.hairlineWidth`** — 숫자 0.5를 하드코딩하면 일부 안드로이드에서 렌더 누락.
3. **BlurView를 FlatList 아이템에 절대 넣지 말 것** — 아이템 수 × 네이티브 스냅샷 = 스크롤 잭.
4. **blurAmount를 애니메이션하지 말 것** — 프레임마다 재스냅샷. 등장 연출은 opacity 크로스페이드로.
5. **탭바 밑으로 콘텐츠가 지나가게** — ScrollView `contentContainerStyle={{paddingBottom: TABBAR_H}}`
   + 탭바 `position:absolute`. 콘텐츠가 유리 밑을 흐르는 순간이 글래스모피즘의 전부다.
6. **Android는 폴백이 디폴트** — blur 강행하려면 히어로 카드 1곳만, `renderToHardwareTextureAndroid` 병행.
7. **글로우 금지 원칙 유지** — shadow/elevation으로 빛 번짐 흉내내지 않는다. 깊이는 헤어라인과 표면 밝기 차(0.04 vs 0.06)로만.

### theme.ts 추가 토큰 (기존 토큰과 공존)

```ts
export const GLASS = {
  TINT: 'rgba(10,10,10,0.05)',
  EDGE: 'rgba(255,255,255,0.10)',
  EDGE_TOP: 'rgba(255,255,255,0.16)',
  SURFACE: 'rgba(255,255,255,0.04)',      // 가짜 유리 표면
  SURFACE_EDGE: 'rgba(255,255,255,0.08)',
  FALLBACK_IOS: 'rgba(18,18,20,0.92)',
  FALLBACK_ANDROID: 'rgba(20,20,22,0.88)',
} as const;
```

---

## 4. 코드 아키텍처 정리

### 파일 구조 (루트 34개 파일 → 폴더화)

```
src/
├─ screens/        Home · Shoes · History · Profile · Medals · run/(Goal·Countdown·Active·Recap)
│                  · AddShoe · Retirement · HallOfShoes · InjuryRisk · onboarding/
├─ components/     GlassCard · SurfaceCard · CharcoalBackdrop · ShoeCarousel(←screens/KeegoHome.tsx)
│                  · TabBar · Sparkline · RunSplits · …
├─ lib/            (현행 유지 — 이미 잘 설계됨)
├─ data/           (현행 유지)
└─ theme.ts        (+GLASS 토큰)
```

### App.tsx 분해 (2,434줄 → ~400줄)

| 추출 대상 | 새 위치 |
|---|---|
| 인라인 RunActiveScreen(~500줄, GPS/TTS 엔진 소유) | `screens/run/RunSession.tsx` — 엔진 구독 구조는 그대로, 파일만 분리 |
| shoes/runs/sync 상태 + 백엔드 배선 | `state/useAppData.ts` 훅 |
| progression/celebration 큐 | `state/useProgression.ts` 훅 |
| 오버레이 11+ boolean | 단일 `route` 유니언: `{name:'medals'} \| {name:'run', phase:…} \| …` — react-navigation 도입 없이 상호배타 보장 |

### 실행 순서 (기능 보존 · 단계별 검증)

1. **삭제** — 죽은 코드 3건 + titles 잔재 → jest green 확인
2. **홈 다이어트** — 4요소로 축소, FitnessCard→기록, 어필리에이트→신발 상세 (하루)
3. **마이 개편** — ProgressionScreen→메달 화면(랭크 UI 제거), 설정 그룹화
4. **글래스 시스템** — GLASS 토큰 + GlassCard/SurfaceCard/CharcoalBackdrop, 히어로+탭바만 진짜 유리
5. **폴더화** — `src/` 이동 (import 경로만, 로직 무변경) → tsc/jest green
6. **App.tsx 분해** — 훅 추출 + route 유니언 (가장 마지막, 가장 신중히)

각 단계 = 커밋 1개 + `npx jest` green + 에뮬레이터 스크린샷 비교.
GPS/러닝 엔진(lib/runTracker, geo, kalman)은 **어느 단계에서도 건드리지 않는다.**
