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
    signOut: jest.fn(() => {
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
jest.mock('@react-native-firebase/firestore', () => {
  const store = new Map();
  return {
    __esModule: true,
    getFirestore: jest.fn(() => ({__db: true})),
    doc: jest.fn((_db, collection, id) => ({__path: `${collection}/${id}`})),
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
    // onMessage returns the unsubscribe fn, like the real subscriber contract.
    onMessage: jest.fn(() => jest.fn()),
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
