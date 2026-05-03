// Metro bundler config for Marka.
//
// One non-default extension:
//
//   `sql` as a source extension — Drizzle's migrator imports the
//   generated migration SQL directly (`import m0000 from
//   './0000_curved_stone_men.sql'`). Without this, Metro fails with
//   "Unable to resolve module ./<id>.sql". The actual inlining of the
//   SQL string happens in `babel.config.js` via `babel-plugin-inline-import`.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('sql');

module.exports = config;
