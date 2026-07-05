module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // 릴리스(production) 번들에서만 console.log/info/debug 제거 — 개발/테스트엔 영향 없음.
    // error·warn 은 남겨 크래시 진단 신호를 보존한다(catch 로그의 잡음만 걷어낸다).
    env: {
      production: {
        plugins: [['transform-remove-console', {exclude: ['error', 'warn']}]],
      },
    },
  };
};
