/**
 * Firestore 오프라인 영속 — **기본값에 기대지 않는다** (감사 D-6).
 *
 * 이 앱은 로컬-퍼스트다. 러닝을 저장하면 먼저 기기에 쓰고 클라우드로는 나중에 올라가는데,
 * 그 '나중에'를 버텨 주는 것이 Firestore 네이티브 SDK 의 오프라인 영속이다.
 * 그걸 앱이 **한 번도 켠 적이 없었다** — 켜져 있던 이유는 SDK 기본값이 ON 이라서다.
 * SDK 버전이 오르며 조용히 바뀌면 증상은 "가끔 러닝이 클라우드에 없다"가 되고,
 * 재현이 거의 불가능해 원인을 찾기까지 아주 오래 걸린다.
 * @format
 */
import {getFirestore} from '@react-native-firebase/firestore';
import {
  ensureFirestorePersistence,
  __resetFirestoreSettingsForTest,
} from '../../lib/firestoreSettings';

const dbOf = () => getFirestore() as unknown as {settings?: jest.Mock};

beforeEach(() => {
  __resetFirestoreSettingsForTest();
  const db = dbOf();
  if (db) db.settings = jest.fn().mockResolvedValue(undefined);
});

describe('명시적으로 켠다', () => {
  test('persistence: true 로 settings 를 부른다', () => {
    expect(ensureFirestorePersistence()).toBe(true);
    expect(dbOf().settings).toHaveBeenCalledWith({persistence: true});
  });

  test('영속 외의 설정은 건드리지 않는다 — 기본값과 같은 값을 명시할 뿐이다', () => {
    ensureFirestorePersistence();
    const arg = dbOf().settings!.mock.calls[0][0];
    expect(Object.keys(arg)).toEqual(['persistence']);
  });
});

describe('한 번만 적용한다', () => {
  test('여러 번 불러도 settings 는 1회', () => {
    ensureFirestorePersistence();
    ensureFirestorePersistence();
    ensureFirestorePersistence();
    expect(dbOf().settings).toHaveBeenCalledTimes(1);
  });
});

describe('앱을 죽이지 않는다', () => {
  test('settings 가 없는 구현이면 false 를 돌려주고 넘어간다', () => {
    const db = dbOf();
    delete db.settings;
    expect(() => ensureFirestorePersistence()).not.toThrow();
    expect(ensureFirestorePersistence()).toBe(false);
  });

  test('settings 가 던져도 전파하지 않는다 — 부팅이 막히면 훨씬 나쁘다', () => {
    dbOf().settings = jest.fn(() => {
      throw new Error('Firestore has already been started');
    });
    expect(() => ensureFirestorePersistence()).not.toThrow();
  });

  test('settings 가 거부(reject)해도 처리되지 않은 거부로 새지 않는다', async () => {
    dbOf().settings = jest.fn().mockRejectedValue(new Error('already started'));
    expect(() => ensureFirestorePersistence()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});

// ── 배선 ─────────────────────────────────────────────────────────────────────
// 설정은 **첫 Firestore 사용보다 먼저** 접수돼야 한다. 나중에 부르면 네이티브가 이미
// 시작돼 있어 던지고(삼켜지고) 아무 효과가 없다 — 조용히 무의미해지는 종류라 못 박는다.
describe('배선 — App.tsx 가 가장 먼저 불러온다', () => {
  const app: string = require('fs').readFileSync(
    require('path').join(__dirname, '../..', 'App.tsx'), 'utf8');

  test('firestoreSettings 를 import 한다', () => {
    expect(app).toContain("import './lib/firestoreSettings'");
  });

  test('그 import 가 다른 어떤 import 보다 앞이다', () => {
    const lines = app.split('\n').filter(l => /^import /.test(l));
    expect(lines[0]).toContain('./lib/firestoreSettings');
  });

  test('Firestore 를 쓰는 모듈들보다 먼저 로드된다(순서 회귀 방어)', () => {
    const idx = (needle: string) => app.indexOf(needle);
    const first = idx("import './lib/firestoreSettings'");
    expect(first).toBeGreaterThanOrEqual(0);
    // App.tsx 가 직접 import 하는 Firestore 소비 모듈들
    for (const m of ['./lib/forceUpdate', './lib/raceStore']) {
      const at = idx(`from '${m}'`);
      if (at >= 0) expect(first).toBeLessThan(at);
    }
  });
});
