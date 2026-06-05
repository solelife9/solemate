const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
// 워처 무한 재번들 footgun 차단: 소스가 아닌데 런타임에 계속 쓰이는 디렉터리/파일을
// blockList로 제외한다(metro-file-map의 ignorePattern으로 전달되어 watch/crawl 자체에서
// 빠진다). .tenet(자율런 상태/저널/로그를 지속적으로 기록) 등이 watch에 남아 있으면
// 메트로가 자기 자신을 끝없이 무효화해 번들이 완성되지 않는다.
const config = {
  resolver: {
    blockList: /[/\\]\.(tenet|agents|codex|claude)[/\\].*|.*\.log$/,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
