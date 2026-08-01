# 스펙 소스 충돌 목록 — 사람이 판정해야 하는 36건

> 생성 2026-07-30 · 자동 대조(스크립트) 결과. **값 판정은 사람 몫이다.**
>
> 같은 신발인데 `data/shoeSpecs.json`(표)과 `data/shoeCatalog.json`(카탈로그)의 값이 다르다.
> 양쪽 다 `basis: US9`, 카탈로그 쪽은 `verified: true` 다 — 즉 **둘 다 "확인했다"고 주장하는데 값이 다르다.**
> 최소 한쪽이 틀렸다는 뜻이므로 자동 병합은 금지(Truth only). 출처를 다시 보고 판정한다.

| 신발 | 항목 | 표(shoeSpecs) | 카탈로그 | 차이 |
|---|---|---|---|---|
| Nike Structure 26 | 무게 | 236g | 295g | **-59g** |
| NNormal Kjerag | 무게 | 200g | 230g | **-30g** |
| Hoka Clifton 10 | 무게 | 278g | 258g | **+20g** |
| ASICS Gel-Nimbus 27 | 무게 | 307g | 295g | **+12g** |
| norda 005 | 힐 스택 | 28.5mm | 38mm | **-9.5mm** |
| Hoka Bondi 9 | 무게 | 297g | 306g | **-9g** |
| ASICS Novablast 6 | 무게 | 258g | 249g | **+9g** |
| ASICS Gel-Cumulus 27 | 무게 | 270g | 261g | **+9g** |
| ASICS Megablast | 무게 | 230g | 221g | **+9g** |
| ASICS Novablast 5 | 무게 | 255g | 247g | **+8g** |
| Nike Pegasus 42 | 무게 | 286g | 292g | **-6g** |
| ASICS Superblast 3 | 무게 | 236g | 230g | **+6g** |
| ASICS Gel-Kayano 32 | 무게 | 304g | 298g | **+6g** |
| Brooks Ghost 18 | 무게 | 289g | 283g | **+6g** |
| NNormal Kjerag | 힐 스택 | 23.5mm | 29mm | **-5.5mm** |
| Puma Deviate Nitro 3 | 힐 스택 | 39mm | 44mm | **-5mm** |
| On Cloudmonster 3 | 힐 스택 | 35mm | 40mm | **-5mm** |
| ASICS Novablast 6 | 힐 스택 | 46.5mm | 42mm | **+4.5mm** |
| Puma Deviate Nitro 3 | 무게 | 265g | 269g | **-4g** |
| Altra Torin 8 | 무게 | 265g | 269g | **-4g** |
| Hoka Arahi 7 | 힐 스택 | 37mm | 34mm | **+3mm** |
| norda 005 | 무게 | 230g | 227g | **+3g** |
| Nike Pegasus 41 | 무게 | 281g | 283g | **-2g** |
| Nike Zoom Fly 6 | 힐 스택 | 42mm | 40mm | **+2mm** |
| Nike Structure 26 | 힐 스택 | 40mm | 38mm | **+2mm** |
| Nike Structure 26 | 드롭 | 8mm | 10mm | **-2mm** |
| Nike Vomero 18 | 힐 스택 | 42.5mm | 44mm | **-1.5mm** |
| Hoka Clifton 10 | 힐 스택 | 42mm | 43mm | **-1mm** |
| Hoka Bondi 9 | 힐 스택 | 43mm | 44mm | **-1mm** |
| Nike Pegasus 42 | 힐 스택 | 37mm | 38mm | **-1mm** |
| Brooks Glycerin 22 | 힐 스택 | 38mm | 39mm | **-1mm** |
| Adidas Adizero Adios Pro 4 | 무게 | 202g | 201g | **+1g** |
| Nike Pegasus Plus | 힐 스택 | 35mm | 34mm | **+1mm** |
| ASICS Megablast | 힐 스택 | 46mm | 45mm | **+1mm** |
| ASICS Sonicblast | 무게 | 256g | 255g | **+1g** |
| ASICS Sonicblast | 힐 스택 | 46mm | 45mm | **+1mm** |

## 카탈로그에 아예 없는 모델(통일 시 추가 대상)

- New Balance Fresh Foam X 1080v14
- New Balance Fresh Foam X More v5
- Adidas Boston 12

## 판정이 끝나면

1. 카탈로그로 값을 단일화한다(표의 옳은 값은 카탈로그로 옮긴다).
2. `data/shoeSpecs.json` 을 폐기한다.
3. `lib/shoeSpecModel.specFromCatalog` 폴백을 제거하고 카탈로그를 직접 읽는다(8a45f59 는 다리였다).
4. CLAUDE.md 의 "data/shoeSpecs.json 에 등록한다" 규칙을 카탈로그 기준으로 갱신한다.
