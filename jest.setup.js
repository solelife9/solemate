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

// ── react-native-geolocation-service ────────────────────────────────────────
// watchPosition never fires (no real fixes); it just hands back a numeric watch
// id like the native module so clearWatch(id) stays valid. requestAuthorization
// resolves "granted" so permission gates fall through in tests.
jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: {
    watchPosition: jest.fn(() => 1),
    clearWatch: jest.fn(),
    getCurrentPosition: jest.fn(),
    requestAuthorization: jest.fn(() => Promise.resolve('granted')),
    stopObserving: jest.fn(),
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
  const Svg = make('Svg');
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
