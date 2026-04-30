// Metro bundler config for Marka.
//
// Three extensions to Expo's default config:
//
//   1. `sql` as a source extension — Drizzle's `expo-sqlite/migrator`
//      imports the generated migration SQL directly
//      (`import m0000 from './0000_curved_stone_men.sql'`). Without this,
//      Metro fails with "Unable to resolve module ./<id>.sql".
//      The actual inlining of the SQL string happens in `babel.config.js`
//      via `babel-plugin-inline-import`.
//
//   2. `wasm` as an asset extension — `expo-sqlite/web` ships a
//      WebAssembly build of SQLite (`wa-sqlite/wa-sqlite.wasm`) that
//      Metro must bundle as a binary asset, not a JS source.
//
//   3. Cross-Origin-Opener/Embedder headers on the dev server — required
//      so the browser enables `SharedArrayBuffer`, which `wa-sqlite`
//      (the WebAssembly SQLite implementation used by expo-sqlite on
//      web) depends on. Without these headers, opening the database in
//      a web browser fails at runtime with "SharedArrayBuffer is not
//      defined." Native (iOS / Android Expo Go) builds don't need any
//      of items (2) or (3).
//
// References:
//   - https://orm.drizzle.team/docs/get-started/expo-new
//   - https://developer.mozilla.org/en-US/docs/Web/API/SharedArrayBuffer#security_requirements

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('sql');
config.resolver.assetExts.push('wasm');

// Cross-origin isolation headers (web only). Production hosting must set
// these too; here we apply them to the Metro dev server.
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
