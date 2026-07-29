# 신발 데이터 정본 (shoes-spec)

> keego 신발 카탈로그의 **단일 기준 문서**. 스키마·규칙이 바뀌면 코드보다 먼저 여기를 고친다.
> 제정 2026-07-29.

---

## 0. 왜 이 문서가 필요한가

카탈로그가 두 번 무너졌다.

1. **2026-06-18 이후 갱신이 끊겼다.** 그 사이 나온 인기 모델(ASICS Megablast, Brooks Ghost 18,
   Nike Structure Plus)이 통째로 빠졌고, norda·NNormal·Satisfy 같은 **브랜드 자체가 없었다**.
2. **모델만 넣고 스펙을 안 넣었다.** 그러면 '다음 신발' 비교에서 그 신발은 축이 하나도 안 뜬다
   (쿠션·반발·안정은 카테고리에서 파생돼 같은 카테고리 안에선 전부 같은 값이기 때문).

둘 다 "누가 언제 무엇을 확인했는지"가 데이터에 없어서 생긴 일이다. 그래서 스키마에
`verified`·`searchAliases` 같은 **운영 필드**를 넣고, 검증 스크립트로 갭을 자동 탐지한다.

---

## 1. 스키마

정본: `types/shoe.ts`

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✅ | **슬러그**. 문서 id 이자 영구 키. 예: `hoka-mafate-speed-4-lite-satisfy-stsfy` |
| `brand` | string | ✅ | **실제 제조사**. 콜라보여도 만든 쪽을 적는다(Satisfy×Hoka → `Hoka`) |
| `model` | string | ✅ | 베이스 모델명. 버전 숫자는 뺀다 (`Mafate Speed`) |
| `version` | string \| null | ✅ | 버전. 숫자가 없거나 모델명 자체가 숫자면 `null` (norda `005`) |
| `variant` | string \| null | ✅ | 특별판 표기 (`LITE`, `GTX`, `Wide`). 없으면 `null` |
| `collabWith` | string \| null | ✅ | 협업 상대 (`Satisfy`). 없으면 `null` |
| `category` | Category | ✅ | 아래 §2 |
| `weight` | number \| null | ✅ | 무게(g). **공표된 값 그대로** |
| `weightBasis` | string \| null | ✅ | 그 무게를 잰 사이즈 (`US9`·`US9.5`·`US10`). 모르면 `null` |
| `drop` | number \| null | ✅ | 드롭(mm) |
| `plate` | `'carbon'`\|`'other'`\|`'none'`\|null | ✅ | 미드솔 플레이트. 모르면 `null` |
| `stackHeight` | `{heel, forefoot}` \| null | ✅ | 스택(mm) |
| `releaseYear` | number \| null | ✅ | 출시연도 |
| `defaultLifespanKm` | number | ✅ | §3 — 카테고리 기본값 상속 |
| `discontinued` | boolean | ✅ | 기본 `false` |
| `searchAliases` | string[] | ✅ | 한글표기·오타·축약형. 빈 배열 허용하나 경고 대상 |
| `verified` | boolean | ✅ | 공식 소스로 확인했는가 |

### 규칙

- **필수 = 키가 반드시 있어야 한다.** 값을 모르면 `null`을 넣지 **키를 빼지 않는다**.
  키가 없는 것과 "확인했는데 없음"은 다르고, 후자를 표현할 방법이 있어야 한다.
- **모르면 비운다.** 추측·보간 금지. "비슷한 모델이니 비슷할 것"은 사실이 아니다(Truth only).
- **모델을 넣을 땐 스펙도 같이 넣는다.** 스펙 없는 모델은 비교에서 침묵한다.
- **무게는 환산하지 않는다.** US9.5에서 잰 값을 US9로 고쳐 적는 순간 그건 측정이 아니라
  추정이다. 대신 `weightBasis`에 잰 사이즈를 적어 **비교하는 쪽이 판단**하게 한다
  (기준이 다른 두 신발의 무게 차이는 그만큼 덜 믿을 만하다).
- **플레이트는 카테고리로 유추하지 않는다.** tempo 인데 카본인 신발이 흔하고(Zoom Fly 6·
  Mach X 3·Hyperion Max 4), racing 인데 카본이 아닌 신발도 있다(Adizero Adios 9 = 나일론 샹크).
  유리섬유·TPU 플레이트를 `carbon` 으로 적으면 없는 사실을 만드는 것이라 `other` 로 나눈다.
  **'카본 인퓨즈드 나일론'은 `other`다**(Mizuno WAVE PLATE = Rilsan 나일론 + 카본 섬유).
  나일론 베이스를 `carbon` 이라 적으면 카본 플레이트 레이서와 같은 것으로 읽힌다.
  **근거는 제품 설명이어야 한다** — 고객 리뷰에 적힌 플레이트 언급은 쓰지 않는다.
- **`none` 의 근거 기준(2026-07-29 완화).** 처음엔 "없다고 적힌 경우"만 인정했는데, 그러면
  데일리화 대부분이 영원히 `null` 로 남아 이 필드가 무용지물이 된다. 브랜드는 카본
  플레이트를 **절대 숨기지 않는다** — 헤드라인 기능이라 반드시 광고한다. 그래서:
    · `none` = "plate-free" 명시 **또는** 미드솔 구성을 열거한 제품 설명에 플레이트 언급이 없음
    · `null` = 제품 설명 자체를 확인하지 못함
  이건 추측이 아니라 **부재의 증거**다. 다만 근거의 종류가 다르므로 문서에 남긴다.
- **`stackHeight`의 forefoot 은 `heel - drop` 으로 채워도 된다.** 드롭의 정의가 그것이라
  이건 추측이 아니라 산수다. 셋 중 둘을 알면 나머지는 확정된다.

---

## 2. 카테고리

```
daily | tempo | racing | trail | stability | recovery
```

기존 시드(`data/shoes.json`)는 다른 어휘를 쓴다. **1:1로 대응하므로 매핑으로 잇는다**
(`types/shoe.ts`의 `LEGACY_CATEGORY_MAP`).

| 신규 | 기존 | 비고 |
|---|---|---|
| `daily` | `daily_trainer` | |
| `tempo` | `super_trainer` | 논카본 슈퍼트레이너 |
| `racing` | `carbon_racing` | 카본 레이싱 |
| `trail` | `trail` | |
| `stability` | `stability` | |
| `recovery` | `max_cushion` | ⚠️ 유일하게 의미가 느슨하다 — 맥스쿠션은 '회복주용'이 주 용도라 대응시켰다 |

---

## 3. 수명(defaultLifespanKm)

**카테고리 기본값을 상속한다.**

| 카테고리 | 기본 수명 |
|---|---|
| `daily` | 650 |
| `tempo` | 650 |
| `racing` | 450 |
| `trail` | 650 |
| `stability` | 700 |
| `recovery` | 700 |

- **variant 는 오버라이드 금지.** `LITE`·`GTX` 같은 파생은 베이스와 같은 수명을 쓴다.
  갑피가 달라도 밑창 수명은 같고, 파생마다 다른 수치를 쓰면 근거 없이 갈린다.
- 모델별 오버라이드는 **공식 근거가 있을 때만** 허용한다(예: 브랜드가 명시).

---

## 4. 콜라보·특별판

콜라보는 **별도 문서**로 등록한다. 사용자가 그 이름으로 갖고 있고 그 이름으로 찾기 때문이다.

```
id:          hoka-mafate-speed-4-lite-satisfy-stsfy
brand:       Hoka          ← 만든 쪽
model:       Mafate Speed
version:     4
variant:     LITE
collabWith:  Satisfy       ← 이걸로도 검색된다
```

- 스펙은 **베이스와 다를 때만** 따로 적는다. 같으면 베이스 값을 그대로.
- `collabWith`는 검색 대상이다 — "새티스파이"로 찾으면 Hoka·adidas·norda 결과가 같이 나온다.

---

## 5. 단종

**삭제하지 않는다.** `discontinued: true`로만 표시한다.

이유: 사용자가 지금도 그 신발을 신고 있고, 지난 기록이 그 id를 참조한다. 지우면 기록이
고아가 된다. 단종 모델은 '내 신발 등록' 목록에서 뒤로 밀 뿐 사라지지 않는다.

---

## 6. 검색

매칭 대상(`lib/shoeSearch.ts`):

1. `brand`
2. `model` + `version` + `variant`
3. **`searchAliases`** — 한글표기(`나이키 페가수스`), 오타(`페가서스`), 축약(`페가`)
4. **`collabWith`** — 협업 상대명

### 0건일 때

- `search_misses` 컬렉션에 `{ query, userId, createdAt }` 적재 → **무엇이 없는지 데이터로 안다**
- 화면에 **"내 신발이 없어요"** 버튼 → `shoe_requests`에 `{ brand, model, userId, createdAt }`

이 둘이 §0의 "카탈로그가 낡는 문제"에 대한 구조적 답이다. 사람이 눈치채기를 기다리지 않는다.

---

## 7. 저장 규약

`lib/shoeCatalogRepo.ts`

- **문서 id = 슬러그 고정.** 랜덤 id를 만들지 않는다.
- **`setDoc(..., { merge: true })` upsert 만.** `addDoc` **금지** — 같은 신발이 두 번 생긴다.
- 단종은 `discontinued: true` 필드 갱신으로만. `deleteDoc` 금지.

---

## 8. 검증

```
npm run validate-shoes
```

- 필수 필드 누락
- `id` 중복
- **같은 라인 version 갭** (39·40·42 → 41 누락 경고). `version: null` 인 라인은 제외
- `searchAliases` 빈 문서 경고
- 브랜드별 등록 수 / 미검증(`verified: false`) 수 요약

---

## 9. 운영

- 브랜드 커버리지 현황은 `docs/brands.md`에 적는다.
- 기준선은 **편집샵 입점 브랜드**다(굿러너컴퍼니 등) — 실제로 팔리는 것이 곧 사용자가 신는 것.
- 신규 모델 확인 주기: 분기 1회 + `shoe_requests`에 요청이 쌓일 때.
