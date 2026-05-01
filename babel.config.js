// Babel config for Marka.
//
// Two extensions to Expo's default preset:
//
//   1. `babel-plugin-inline-import` for `.sql` files — Drizzle's generated
//      migrations are imported as string literals at build time. Without
//      this, Metro tries to parse migration SQL as JavaScript and fails
//      on the first `CREATE TABLE` keyword.
//      Reference: https://orm.drizzle.team/docs/get-started/expo-new
//
//   2. `unstable_transformImportMeta` on babel-preset-expo — Zustand 5's
//      `persist` middleware uses `import.meta.env.MODE` to detect the
//      build environment for its devtools wiring. Hermes (RN's JS engine)
//      doesn't support `import.meta` natively, so the middleware fails to
//      bundle. Expo ships a polyfill for this exact case as an opt-in
//      preset option.
//      Reference: https://docs.expo.dev/versions/latest/config/babel/

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
