/**
 * Jest global setup (setupFiles — runs before the test framework is installed).
 *
 * Replaces every native / device-bound module with an in-memory stub so the
 * test suite runs anywhere with no real device, GPS, sensors or network.
 * Per-test reset lives in jest.setup.after.js (setupFilesAfterEnv).
 */

/* eslint-env jest */

// ── @react-native-async-storage/async-storage — official in-memory mock ──────
// The package ships a maintained mock (an in-memory Map implementation) under
// its "./jest" export. Using it keeps us in sync with the real API surface.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest').default,
);

// ── expo-location ────────────────────────────────────────────────────────────
// The run engine's real GPS source. watchPositionAsync records its (options,
// callback, errorHandler) like the native module and hands back a removable
// subscription; tests capture mock.calls[0][1] to inject synthetic fixes.
// Permission requests resolve "granted" so the location gate falls through; the
// background-task lifecycle calls resolve as no-ops.
jest.mock('expo-location', () => ({
  __esModule: true,
  Accuracy: {
    Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6,
  },
  watchPositionAsync: jest.fn(() => Promise.resolve({remove: jest.fn()})),
  requestForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true, status: 'granted'}),
  ),
  getForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true, status: 'granted'}),
  ),
  requestBackgroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true, status: 'granted'}),
  ),
  getBackgroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true, status: 'granted'}),
  ),
  startLocationUpdatesAsync: jest.fn(() => Promise.resolve()),
  stopLocationUpdatesAsync: jest.fn(() => Promise.resolve()),
  hasStartedLocationUpdatesAsync: jest.fn(() => Promise.resolve(false)),
}));

// ── expo-task-manager ────────────────────────────────────────────────────────
// defineTask stores the executor in a registry so background-delivery tests can
// invoke the registered task body directly (via the __getTask helper).
jest.mock('expo-task-manager', () => {
  const tasks = {};
  return {
    __esModule: true,
    defineTask: jest.fn((name, executor) => {
      tasks[name] = executor;
    }),
    isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
    unregisterTaskAsync: jest.fn(() => Promise.resolve()),
    // test-only accessor for the executor registered under `name`.
    __getTask: name => tasks[name],
  };
});

// ── expo-image-picker ────────────────────────────────────────────────────────
// AddShoeScreen's photo attach. Default: permission granted, user cancels (no
// photo). Per-test overrides drive the success / failure / denied paths.
jest.mock('expo-image-picker', () => ({
  __esModule: true,
  MediaTypeOptions: {All: 'All', Videos: 'Videos', Images: 'Images'},
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true, status: 'granted'}),
  ),
  getMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true, status: 'granted'}),
  ),
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({canceled: true, assets: null}),
  ),
  launchCameraAsync: jest.fn(() =>
    Promise.resolve({canceled: true, assets: null}),
  ),
  requestCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({granted: true, status: 'granted'}),
  ),
}));

// ── expo-file-system/legacy + expo-media-library ─────────────────────────────
// 공유 카드(투명 PNG)를 사진앱에 저장하는 경로. 기본: 파일 기록 성공 + 권한 허용 + 저장 성공.
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  cacheDirectory: 'file:///cache/',
  EncodingType: {Base64: 'base64', UTF8: 'utf8'},
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-media-library/legacy', () => ({
  __esModule: true,
  requestPermissionsAsync: jest.fn(() => Promise.resolve({granted: true, status: 'granted'})),
  saveToLibraryAsync: jest.fn(() => Promise.resolve()),
}));

// ── expo-audio ───────────────────────────────────────────────────────────────
// 러닝 음성 코칭 클립 재생. 테스트는 호출만 관찰하면 되므로, 끝-신호를 즉시 주는 no-op 목.
jest.mock('expo-audio', () => ({
  __esModule: true,
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((_evt, cb) => {
      // 다음 틱에 '재생 끝' 신호를 줘 시퀀스가 진행되게 한다.
      setTimeout(() => cb({didJustFinish: true}), 0);
      return {remove: jest.fn()};
    }),
  })),
}));

// ── expo-keep-awake ──────────────────────────────────────────────────────────
// 러닝 중 화면 자동잠금 방지. 테스트는 activate/deactivate 호출만 관찰하면 되므로 no-op 목.
jest.mock('expo-keep-awake', () => ({
  __esModule: true,
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(),
}));

// ── expo-sensors (Pedometer) ─────────────────────────────────────────────────
// Cadence source (OS step counter). watchStepCount records its callback so tests
// inject cumulative step counts via mock.calls[0][0], and returns a removable
// subscription. Availability + ACTIVITY_RECOGNITION permission resolve granted so
// the cadence path engages.
jest.mock('expo-sensors', () => ({
  __esModule: true,
  Pedometer: {
    watchStepCount: jest.fn(() => ({remove: jest.fn()})),
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    requestPermissionsAsync: jest.fn(() =>
      Promise.resolve({granted: true, status: 'granted'}),
    ),
    getPermissionsAsync: jest.fn(() =>
      Promise.resolve({granted: true, status: 'granted'}),
    ),
  },
}));

// ── react-native-sensors ─────────────────────────────────────────────────────
// accelerometer.subscribe() returns a subscription with a no-op unsubscribe and
// never emits, so step/cadence logic stays inert during tests.
jest.mock('react-native-sensors', () => {
  const sensor = () => ({subscribe: jest.fn(() => ({unsubscribe: jest.fn()}))});
  return {
    accelerometer: sensor(),
    gyroscope: sensor(),
    magnetometer: sensor(),
    barometer: sensor(),
    setUpdateIntervalForType: jest.fn(),
    SensorTypes: {
      accelerometer: 'accelerometer',
      gyroscope: 'gyroscope',
      magnetometer: 'magnetometer',
      barometer: 'barometer',
    },
  };
});

// ── react-native-tts ─────────────────────────────────────────────────────────
jest.mock('react-native-tts', () => ({
  __esModule: true,
  default: {
    setDefaultLanguage: jest.fn(),
    setDefaultRate: jest.fn(),
    setDefaultVoice: jest.fn(),
    voices: jest.fn(() => Promise.resolve([])),
    speak: jest.fn(),
    stop: jest.fn(),
    getInitStatus: jest.fn(() => Promise.resolve('success')),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}));

// ── react-native-vector-icons/Ionicons ──────────────────────────────────────
// Render the icon name as text instead of loading a TTF glyph font.
jest.mock('react-native-vector-icons/Ionicons', () => {
  const React = require('react');
  const {Text} = require('react-native');
  const Icon = ({name, ...rest}) => React.createElement(Text, rest, name);
  Icon.displayName = 'Ionicons';
  return {__esModule: true, default: Icon};
});

// ── react-native-vector-icons/MaterialCommunityIcons ─────────────────────────
// 신발 탭(shoe-sneaker — Ionicons에 없는 글리프)용. 동일하게 이름을 텍스트로 렌더.
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const React = require('react');
  const {Text} = require('react-native');
  const Icon = ({name, ...rest}) => React.createElement(Text, rest, name);
  Icon.displayName = 'MaterialCommunityIcons';
  return {__esModule: true, default: Icon};
});

// ── react-native-svg ─────────────────────────────────────────────────────────
// Map every SVG primitive onto a plain View so layout renders without the
// native canvas.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const {View} = require('react-native');
  const make = displayName => {
    const Comp = props => React.createElement(View, props, props.children);
    Comp.displayName = displayName;
    return Comp;
  };
  // Svg is a class so a ref resolves to the instance, exposing toDataURL — the
  // share-card capture path (lib/shareCard captureCardDataUrl) can be exercised
  // without the native canvas. Mirrors react-native-svg's callback contract:
  // toDataURL(cb) invokes cb with a base64 payload (no data: prefix).
  class Svg extends React.Component {
    toDataURL(callback) {
      if (typeof callback === 'function') callback('MOCK_SHARE_CARD_PNG_BASE64');
    }
    render() {
      return React.createElement(View, this.props, this.props.children);
    }
  }
  Svg.displayName = 'Svg';
  const names = [
    'Circle', 'Ellipse', 'G', 'Text', 'TSpan', 'TextPath', 'Path',
    'Polygon', 'Polyline', 'Line', 'Rect', 'Use', 'Image', 'Symbol',
    'Defs', 'LinearGradient', 'RadialGradient', 'Stop', 'ClipPath',
    'Pattern', 'Mask', 'Marker', 'ForeignObject',
  ];
  const exported = {__esModule: true, default: Svg, Svg};
  names.forEach(n => {
    exported[n] = make(n);
  });
  return exported;
});

// ── react-native-maps ────────────────────────────────────────────────────────
// 런 지도(RunActiveScreen·route 미리보기)용. 네이티브 지도 캔버스 대신 MapView 와
// 모든 오버레이(Polyline/Marker/...)를 plain View 로 매핑해 레이아웃만 렌더하게 한다.
// PROVIDER_GOOGLE 은 실제처럼 문자열 상수로 노출(화면이 provider prop 에 그대로 넘김).
jest.mock('react-native-maps', () => {
  const React = require('react');
  const {View} = require('react-native');
  const make = displayName => {
    const Comp = props => React.createElement(View, props, props.children);
    Comp.displayName = displayName;
    return Comp;
  };
  const MapView = make('MapView');
  return {
    __esModule: true,
    default: MapView,
    MapView,
    Polyline: make('Polyline'),
    Marker: make('Marker'),
    Callout: make('Callout'),
    Circle: make('Circle'),
    Polygon: make('Polygon'),
    Overlay: make('Overlay'),
    PROVIDER_GOOGLE: 'google',
    PROVIDER_DEFAULT: 'default',
  };
});

// ── react-native-safe-area-context ──────────────────────────────────────────
// Provider just renders children; insets/frame are fixed zero values.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = {top: 0, right: 0, bottom: 0, left: 0};
  const frame = {x: 0, y: 0, width: 390, height: 844};
  const Passthrough = ({children}) => React.createElement(React.Fragment, null, children);
  return {
    __esModule: true,
    SafeAreaProvider: Passthrough,
    SafeAreaConsumer: ({children}) => children(inset),
    SafeAreaView: Passthrough,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext: React.createContext(inset),
    initialWindowMetrics: {insets: inset, frame},
  };
});

// ── @react-native-firebase/auth (modular) ───────────────────────────────────
// In-memory auth: signInAnonymously / signInWithCredential set a currentUser
// that getAuth().currentUser reads back; signOut clears it. No native bridge.
// __reset() restores signed-out state between tests.
jest.mock('@react-native-firebase/auth', () => {
  const state = {current: null};
  const authInstance = {
    get currentUser() {
      return state.current;
    },
  };
  return {
    __esModule: true,
    getAuth: jest.fn(() => authInstance),
    // GoogleAuthProvider.credential(idToken) — google idToken 을 firebase OAuth
    // 자격증명으로 감싼다. signInWithCredential 목이 uid 를 읽으므로 토큰 일부를 uid
    // 로도 노출해 라운드트립을 단언 가능하게 한다(실제 SDK 는 uid 를 노출하지 않음).
    GoogleAuthProvider: {
      credential: jest.fn((idToken, accessToken = null) => ({
        providerId: 'google.com',
        token: idToken,
        secret: accessToken,
        uid: idToken ? `google:${idToken}` : undefined,
      })),
    },
    // AppleAuthProvider.credential(idToken, nonce) — apple identityToken 을 firebase
    // OAuth 자격증명으로 감싼다. uid 를 토큰에서 노출해 라운드트립 단언을 가능케 한다.
    AppleAuthProvider: {
      credential: jest.fn((idToken, nonce = null) => ({
        providerId: 'apple.com',
        token: idToken,
        secret: nonce,
        uid: idToken ? `apple:${idToken}` : undefined,
      })),
    },
    signInAnonymously: jest.fn(() => {
      state.current = {uid: 'anon-test-uid'};
      return Promise.resolve({user: state.current});
    }),
    signInWithCredential: jest.fn((_auth, credential) => {
      const uid = (credential && credential.uid) || 'credential-test-uid';
      const email = (credential && credential.email) || null;
      state.current = {uid, email};
      return Promise.resolve({user: state.current});
    }),
    // 카카오/네이버: 백엔드가 발급한 Firebase 커스텀 토큰으로 로그인. 목은 토큰 일부를
    // uid 로 노출해 라운드트립을 단언 가능하게 한다.
    signInWithCustomToken: jest.fn((_auth, token) => {
      state.current = {uid: token ? `custom:${token}` : 'custom-test-uid'};
      return Promise.resolve({user: state.current});
    }),
    // onAuthStateChanged(auth, cb) — 현재 사용자로 1회 즉시 통지하고 unsubscribe 를
    // 돌려준다. App 의 로그인 게이트는 테스트에서 우회되므로 보통 호출되지 않지만,
    // LoginScreen/게이트 단독 테스트가 인증 전이를 구동할 수 있게 노출한다.
    onAuthStateChanged: jest.fn((_auth, cb) => {
      cb(state.current);
      return () => {};
    }),
    signOut: jest.fn(() => {
      state.current = null;
      return Promise.resolve();
    }),
    // deleteUser(user) — 계정 영구 삭제. 목은 currentUser 를 비운다(로그아웃과 동일 효과).
    deleteUser: jest.fn(() => {
      state.current = null;
      return Promise.resolve();
    }),
    // test-only helpers
    __reset: () => {
      state.current = null;
    },
    __setCurrentUser: u => {
      state.current = u;
    },
  };
});

// ── @react-native-firebase/firestore (modular) ───────────────────────────────
// In-memory document store keyed by "collection/id". setDoc deep-clones (like
// the wire would), getDoc returns a snapshot with exists()/data(). This lets
// the cloud port's push→pull round-trip be asserted without a real backend.
// Collection queries (query/where/orderBy/limit/getDocs/getCountFromServer) are
// also emulated so the Firestore ranking store's leaderboard reads/counts are
// testable against the same in-memory map (keys: "leaderboards/{ym}/entries/{uid}").
jest.mock('@react-native-firebase/firestore', () => {
  const store = new Map();
  // collect docs whose key sits directly under a collection path → [{id, data}].
  const docsUnder = colPath => {
    const prefix = `${colPath}/`;
    const out = [];
    for (const [key, data] of store.entries()) {
      if (key.startsWith(prefix)) out.push({id: key.slice(prefix.length), data});
    }
    return out;
  };
  const applyWheres = (rows, wheres) =>
    rows.filter(r =>
      wheres.every(w => {
        const v = Number(r.data?.[w.field]);
        const t = Number(w.value);
        if (w.op === '>') return v > t;
        if (w.op === '>=') return v >= t;
        if (w.op === '<') return v < t;
        if (w.op === '<=') return v <= t;
        if (w.op === '==') return r.data?.[w.field] === w.value;
        return true;
      }),
    );
  const runQuery = q => {
    let rows = docsUnder(q.__collection);
    const wheres = q.__constraints.filter(c => c.__type === 'where');
    rows = applyWheres(rows, wheres);
    const ob = q.__constraints.find(c => c.__type === 'orderBy');
    if (ob) {
      rows.sort((a, b) => {
        const av = Number(a.data?.[ob.field]) || 0;
        const bv = Number(b.data?.[ob.field]) || 0;
        return ob.dir === 'asc' ? av - bv : bv - av;
      });
    }
    const lim = q.__constraints.find(c => c.__type === 'limit');
    if (lim) rows = rows.slice(0, lim.n);
    return rows;
  };
  return {
    __esModule: true,
    getFirestore: jest.fn(() => ({__db: true})),
    doc: jest.fn((_db, collection, id) => ({__path: `${collection}/${id}`})),
    collection: jest.fn((_db, path) => ({__collection: path})),
    query: jest.fn((col, ...constraints) => ({
      __collection: col.__collection,
      __constraints: constraints,
    })),
    where: jest.fn((field, op, value) => ({__type: 'where', field, op, value})),
    orderBy: jest.fn((field, dir = 'asc') => ({__type: 'orderBy', field, dir})),
    limit: jest.fn(n => ({__type: 'limit', n})),
    getDocs: jest.fn(q => {
      const rows = runQuery(q);
      const docs = rows.map(r => ({id: r.id, data: () => r.data}));
      return Promise.resolve({docs, size: docs.length, forEach: cb => docs.forEach(cb)});
    }),
    getCountFromServer: jest.fn(target => {
      // accepts a collection ref or a query; count after applying where filters.
      const count =
        target.__constraints !== undefined
          ? runQuery({__collection: target.__collection, __constraints: target.__constraints.filter(c => c.__type !== 'limit')}).length
          : docsUnder(target.__collection).length;
      return Promise.resolve({data: () => ({count})});
    }),
    setDoc: jest.fn((ref, data) => {
      store.set(ref.__path, JSON.parse(JSON.stringify(data)));
      return Promise.resolve();
    }),
    getDoc: jest.fn(ref => {
      const has = store.has(ref.__path);
      const data = store.get(ref.__path);
      return Promise.resolve({
        exists: () => has,
        data: () => (has ? data : undefined),
      });
    }),
    deleteDoc: jest.fn(ref => {
      store.delete(ref.__path);
      return Promise.resolve();
    }),
    // 트랜잭션 목: 인메모리 단일 스레드라 실 경합은 없다 — updateFn 을 1회 실행해
    // get(원격 재읽기)→set(원자 기록) 계약만 검증한다(read-modify-write 원자성 경로).
    runTransaction: jest.fn(async (_db, updateFn) => {
      const tx = {
        get: ref =>
          Promise.resolve({
            exists: () => store.has(ref.__path),
            data: () => store.get(ref.__path),
          }),
        set: (ref, data) => {
          store.set(ref.__path, JSON.parse(JSON.stringify(data)));
          return tx;
        },
        update: (ref, data) => {
          store.set(ref.__path, {...(store.get(ref.__path) || {}), ...JSON.parse(JSON.stringify(data))});
          return tx;
        },
        delete: ref => {
          store.delete(ref.__path);
          return tx;
        },
      };
      return updateFn(tx);
    }),
    // test-only helper
    __reset: () => {
      store.clear();
    },
  };
});

// ── @react-native-firebase/messaging (modular) ───────────────────────────────
// In-memory FCM stub so lib/pushMessaging's wrapper can be exercised without a
// native bridge. Default happy path: requestPermission → AUTHORIZED, getToken →
// a fixed token, onMessage → registers the listener and returns an unsubscribe.
// Tests override per-case (requestPermission.mockResolvedValueOnce(DENIED) /
// .mockRejectedValueOnce(...) for the graceful branches; onMessage to capture
// and invoke the registered foreground listener). AuthorizationStatus mirrors
// the real numeric enum so isAuthorizedStatus's AUTHORIZED/PROVISIONAL gate is
// testable.
jest.mock('@react-native-firebase/messaging', () => {
  const AuthorizationStatus = {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    EPHEMERAL: 3,
  };
  const messagingInstance = {__messaging: true};
  return {
    __esModule: true,
    AuthorizationStatus,
    getMessaging: jest.fn(() => messagingInstance),
    requestPermission: jest.fn(() => Promise.resolve(AuthorizationStatus.AUTHORIZED)),
    getToken: jest.fn(() => Promise.resolve('mock-fcm-token')),
    // onMessage / onTokenRefresh each return the unsubscribe fn, like the real
    // subscriber contract. Tests override per-case to capture the registered
    // listener (and to exercise the throw → no-op-unsubscribe graceful branch).
    onMessage: jest.fn(() => jest.fn()),
    onTokenRefresh: jest.fn(() => jest.fn()),
  };
});

// ── @react-native-firebase/crashlytics (modular) ─────────────────────────────
// 인메모리 크래시리틱스 스텁 — lib/crashlytics 래퍼를 실 네이티브 없이 검증한다.
// recordError/log/setUserId/setCollectionEnabled 는 호출만 기록(jest.fn)하고,
// getCrashlytics 는 고정 인스턴스를 돌려준다(래퍼의 instance()가 이를 읽음).
jest.mock('@react-native-firebase/crashlytics', () => {
  const instance = {__crashlytics: true};
  return {
    __esModule: true,
    getCrashlytics: jest.fn(() => instance),
    recordError: jest.fn(),
    log: jest.fn(),
    setCrashlyticsCollectionEnabled: jest.fn(),
    setUserId: jest.fn(),
  };
});

// ── expo-apple-authentication (네이티브 목) ──────────────────────────────────
// 기본 해피패스: isAvailableAsync → true, signInAsync → identityToken 보유 자격증명.
// 취소/토큰없음 분기는 테스트에서 per-case 로 override 한다.
jest.mock('expo-apple-authentication', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  signInAsync: jest.fn(() =>
    Promise.resolve({identityToken: 'apple-identity-token', fullName: null, email: null}),
  ),
  AppleAuthenticationScope: {FULL_NAME: 0, EMAIL: 1},
}));

// ── expo-crypto (네이티브 목) ────────────────────────────────────────────────
jest.mock('expo-crypto', () => ({
  __esModule: true,
  CryptoDigestAlgorithm: {SHA256: 'SHA-256'},
  digestStringAsync: jest.fn((_algo, data) => Promise.resolve(`sha256(${data})`)),
  getRandomBytesAsync: jest.fn(len =>
    Promise.resolve(Uint8Array.from({length: len}, (_v, i) => i % 256)),
  ),
}));

// ── @react-native-google-signin/google-signin ───────────────────────────────
// Native Google account login. The default happy path resolves a signed-in user
// carrying an idToken (the tagged-union shape v13+ returns: {type:'success',data}).
// Tests override per-case: hasPlayServices.mockRejectedValueOnce / signIn to a
// {type:'cancelled'} response / an idToken-less user to exercise the honest-error
// branches. statusCodes mirrors the real error-code constants so the resolver's
// code-based mapping (PLAY_SERVICES_NOT_AVAILABLE / SIGN_IN_CANCELLED) is testable.
jest.mock('@react-native-google-signin/google-signin', () => {
  const statusCodes = {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  };
  const GoogleSignin = {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() =>
      Promise.resolve({
        type: 'success',
        data: {
          idToken: 'mock-google-id-token',
          user: {id: 'g-1', email: 'runner@keego.app', name: 'Keego Runner'},
        },
      }),
    ),
    signOut: jest.fn(() => Promise.resolve()),
    revokeAccess: jest.fn(() => Promise.resolve()),
  };
  return {__esModule: true, GoogleSignin, statusCodes, GoogleSigninButton: () => null};
});

// ── global.fetch ─────────────────────────────────────────────────────────────
// Route-aware default so App bootstrap (auth → shoes → runs) resolves to sane,
// empty data. Individual tests can override fetch.mockImplementationOnce(...).
global.fetch = jest.fn(url => {
  const u = String(url);
  let body = {};
  if (u.includes('/api/auth')) {
    body = {user_id: 'test-user'};
  } else if (u.includes('/api/shoes') || u.includes('/api/runs')) {
    body = [];
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
});

// ── @react-native-seoul/kakao-login (네이티브 목) ────────────────────────────
jest.mock('@react-native-seoul/kakao-login', () => ({
  __esModule: true,
  initializeKakaoSDK: jest.fn(),
  login: jest.fn(() => Promise.resolve({accessToken: 'kakao-access-token'})),
  logout: jest.fn(() => Promise.resolve()),
  getProfile: jest.fn(() => Promise.resolve({id: 1, nickname: '테스터'})),
}));

// ── @react-native-seoul/naver-login (네이티브 목) ────────────────────────────
jest.mock('@react-native-seoul/naver-login', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    login: jest.fn(() =>
      Promise.resolve({successResponse: {accessToken: 'naver-access-token'}, failureResponse: undefined}),
    ),
    logout: jest.fn(() => Promise.resolve()),
  },
}));
