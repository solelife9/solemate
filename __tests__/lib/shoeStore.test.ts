import {
  STORE_CHANNELS,
  EXCLUDED_CHANNELS,
  isVisibleTier,
  isOfficialNaverMall,
  rankChannels,
  visibleChannels,
  priceSourceNoteKo,
  tierLabelKo,
  StoreChannel,
} from '../../lib/shoeStore';

describe('불가침 ① — 정품 보증이 안 되는 판매처는 노출하지 않는다', () => {
  it('쿠팡은 노출 채널에 없다(오픈마켓 셀러 혼재)', () => {
    const ids = visibleChannels().map((c) => c.id);
    expect(ids).not.toContain('coupang');
    const names = visibleChannels().map((c) => c.name);
    expect(names).not.toContain('쿠팡');
  });

  it('제외 사유가 코드에 문서화돼 있다', () => {
    const coupang = EXCLUDED_CHANNELS.find((c) => c.id === 'coupang');
    expect(coupang).toBeDefined();
    expect(coupang!.reason).toContain('정품');
  });

  it('mixed 등급은 노출 불가, official/verified 는 노출 가능', () => {
    expect(isVisibleTier('mixed')).toBe(false);
    expect(isVisibleTier('official')).toBe(true);
    expect(isVisibleTier('verified')).toBe(true);
  });

  it('네이버는 채널 기본값이 mixed 라 필터 없이는 노출되지 않는다', () => {
    const naver = STORE_CHANNELS.find((c) => c.id === 'naver')!;
    expect(naver.tier).toBe('mixed');
    expect(visibleChannels().map((c) => c.id)).not.toContain('naver');
  });

  it('노출 목록은 전부 보증 등급이다', () => {
    for (const c of visibleChannels()) {
      expect(isVisibleTier(c.tier)).toBe(true);
    }
  });
});

describe('불가침 ② — 커미션이 순서를 바꾸지 못한다', () => {
  it('등급이 낮으면 뒤로 간다(입력 순서와 무관)', () => {
    const chans: StoreChannel[] = [
      {id: 'v', name: 'V', tier: 'verified', searchUrl: () => 'https://v'},
      {id: 'o', name: 'O', tier: 'official', searchUrl: () => 'https://o'},
    ];
    expect(rankChannels(chans).map((c) => c.id)).toEqual(['o', 'v']);
  });

  it('동률이면 입력 순서를 보존한다(결정적 정렬)', () => {
    const chans: StoreChannel[] = [
      {id: 'b', name: 'B', tier: 'verified', searchUrl: () => 'https://b'},
      {id: 'a', name: 'A', tier: 'verified', searchUrl: () => 'https://a'},
    ];
    expect(rankChannels(chans).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('원본 배열을 변형하지 않는다(입력 불변)', () => {
    const chans: StoreChannel[] = [
      {id: 'v', name: 'V', tier: 'verified', searchUrl: () => 'https://v'},
      {id: 'o', name: 'O', tier: 'official', searchUrl: () => 'https://o'},
    ];
    const before = chans.map((c) => c.id);
    rankChannels(chans);
    expect(chans.map((c) => c.id)).toEqual(before);
  });
});

describe('네이버 공식 스토어 판정 — 모르는 판매처는 공식이 아니다', () => {
  it('브랜드 공식스토어 표기를 통과시킨다', () => {
    expect(isOfficialNaverMall('나이키공식스토어')).toBe(true);
    expect(isOfficialNaverMall('아디다스 공식스토어')).toBe(true);
    expect(isOfficialNaverMall('호카 공식 스토어')).toBe(true);
    expect(isOfficialNaverMall('ASICS공식스토어')).toBe(true);
  });

  it('코리아 법인 직영 표기를 통과시킨다', () => {
    expect(isOfficialNaverMall('나이키코리아')).toBe(true);
    expect(isOfficialNaverMall('아디다스 코리아')).toBe(true);
  });

  it('병행수입·리셀·개인 셀러는 막는다', () => {
    expect(isOfficialNaverMall('나이키 병행수입 정품샵')).toBe(false);
    expect(isOfficialNaverMall('슈즈마켓')).toBe(false);
    expect(isOfficialNaverMall('직구스토어')).toBe(false);
    expect(isOfficialNaverMall('나이키매니아')).toBe(false);
  });

  it('빈 값·결측은 공식이 아니다', () => {
    expect(isOfficialNaverMall('')).toBe(false);
    expect(isOfficialNaverMall('   ')).toBe(false);
    expect(isOfficialNaverMall(null)).toBe(false);
    expect(isOfficialNaverMall(undefined)).toBe(false);
  });

  it('브랜드명만으로는 공식이 아니다(공식/코리아 표기가 있어야 한다)', () => {
    // '나이키' 로 시작하기만 하면 통과하던 느슨한 판정을 막는 회귀 테스트.
    expect(isOfficialNaverMall('나이키')).toBe(false);
    expect(isOfficialNaverMall('나이키 리셀')).toBe(false);
  });
});

describe('표시 문구', () => {
  it('가격 출처는 정가가 아니라 조회 시점 최저가임을 밝힌다', () => {
    const note = priceSourceNoteKo('네이버', '07/28 14:30');
    expect(note).toContain('최저가');
    expect(note).toContain('07/28 14:30');
    expect(note).not.toContain('정가');
  });

  it('등급 배지는 한국어다', () => {
    expect(tierLabelKo.official).toBe('공식 스토어');
    expect(tierLabelKo.verified).toBe('정품 검수');
  });
});

describe('채널 URL', () => {
  it('전부 https 이고 인코딩된 질의를 그대로 싣는다', () => {
    const q = encodeURIComponent('Hoka Clifton 10');
    for (const c of STORE_CHANNELS) {
      const url = c.searchUrl(q);
      expect(url.startsWith('https://')).toBe(true);
      expect(url).toContain(q);
    }
  });
});
