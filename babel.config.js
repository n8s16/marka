// Babel config for Marka.
//
// We extend Expo's default preset with `babel-plugin-inline-import` to
// inline `.sql` files (Drizzle's generated migrations) as string literals
// at build time. Without it, Metro tries to parse migration SQL as
// JavaScript and fails on the first `CREATE TABLE` keyword.
//
// Reference: https://orm.drizzle.team/docs/get-started/expo-new

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
