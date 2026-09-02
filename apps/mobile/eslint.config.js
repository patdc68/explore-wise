// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // Data hooks begin their async request on mount; state is updated after that request resolves.
      "react-hooks/set-state-in-effect": "off",
    },
  }
]);
