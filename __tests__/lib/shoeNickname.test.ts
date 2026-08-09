// 신발 별명 — **이름을 바꿔도 카탈로그 정체성이 깨지지 않는다.**
//
// 왜 있나 (2026-08-09)
// ----------------------------------------------------------------------------
// 민우님 질문에서 시작했다: *"실제로 같은 러닝화가 두 개씩 있을 수도 있으니까, 새로
// 등록할 때는 원래 있던 것과 구별해서 저장되거나 해야 되지 않을까"*
//
// 맞는 말이고, 구별 수단은 이미 있었다 — 신발 상세의 '신발 이름' 편집. 그런데 그게
// **`BackendShoe.name` 을 통째로 덮어썼다.** `name` 은 표시용이 아니라 **카탈로그
// 정체성**이다: `parseShoeName(name)` → `brand|model` 이 공식 스펙(data/shoeSpecs.json —
// 무게·힐스택·드롭)과 카테고리(data/shoeModels) 조회 키이고, 마모 모델도 같은 파싱을 쓴다.
//
// 즉 **두 켤레를 구별하려고 이름을 바꾸는 순간 — 정확히 그러라고 만든 기능이다 —
// 스펙 조회가 조용히 빗나갔다.** 다음 신발 비교에서 축이 사라지고 카테고리가 폴백으로
// 떨어지는데, 화면에는 아무 표시도 나지 않는다. 알아챌 방법이 없는 종류의 결함이다.
//
// 그래서 표시 이름을 `nickname` 으로 분리했다. 이 파일이 그 분리를 고정한다.
import {toUiShoe} from '../../lib/appViewModel';
import {parseShoeName} from '../../lib/shoe';

const shoe = (over: Partial<BackendShoe> = {}): BackendShoe =>
  ({id: 's1', name: 'ASICS Novablast 5', max_km: 700, start_km: 0, ...over} as BackendShoe);

describe('표시 이름', () => {
  it('별명이 없으면 예전과 같다 — 파싱한 모델명', () => {
    const ui = toUiShoe(shoe(), [], 0);
    expect(ui.brand).toBe('ASICS');
    expect(ui.model).toBe('Novablast 5');
  });

  it('별명이 있으면 그것을 보여준다', () => {
    const ui = toUiShoe(shoe({nickname: 'Novablast 5 (파랑)'}), [], 0);
    expect(ui.model).toBe('Novablast 5 (파랑)');
    // 브랜드는 그대로 — 별명에 브랜드를 넣지 않게 편집 입력도 모델 부분만 다룬다.
    expect(ui.brand).toBe('ASICS');
  });

  it('공백뿐인 별명은 없는 것으로 본다 — 빈 이름이 화면에 뜨면 안 된다', () => {
    expect(toUiShoe(shoe({nickname: '   '}), [], 0).model).toBe('Novablast 5');
  });
});

describe('카탈로그 정체성은 별명과 무관하다', () => {
  it('별명을 붙여도 brand|model 스펙 키가 그대로다 — 이 분리가 이 변경의 전부다', () => {
    const s = shoe({nickname: '파랑이'});
    const {brand, model} = parseShoeName(s.name);
    expect(`${brand}|${model}`).toBe('ASICS|Novablast 5');
  });

  it('같은 모델 두 켤레는 서로 다르게 보이되 같은 스펙을 참조한다', () => {
    const a = shoe({id: 'a', nickname: '파랑'});
    const b = shoe({id: 'b', nickname: '검정'});
    expect(toUiShoe(a, [], 0).model).not.toBe(toUiShoe(b, [], 0).model); // 화면에선 구별된다
    expect(parseShoeName(a.name)).toEqual(parseShoeName(b.name)); // 스펙 조회는 같다
  });
});

// ── 스윕: name 을 표시용으로 덮어쓰는 코드가 다시 생기지 못하게 ─────────────
describe('name 을 사용자 입력으로 덮어쓰지 않는다', () => {
  it('이름 변경 핸들러가 nickname 을 쓴다', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'App.tsx'),
      'utf8',
    ) as string;
    const at = src.indexOf('async function updateShoeName');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 700);
    expect(body).toMatch(/nickname/);
    // `{...s,name}` 형태(=name 을 인자로 덮어쓰기)가 다시 나타나면 그 순간 스펙이 끊긴다.
    expect(body).not.toMatch(/\{\s*\.\.\.s\s*,\s*name\s*\}/);
  });
});
