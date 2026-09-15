// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";
import globals from "globals";

export default defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Node/CommonJS scripts run directly via `node`, not bundled — they need
    // Node globals (__dirname, require, module, process) rather than the
    // browser/React Native globals the rest of the app config assumes.
    files: ["scripts/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
]);
