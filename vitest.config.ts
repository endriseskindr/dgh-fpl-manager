import { defineConfig } from "vitest/config";
import path from "node:path";

// `npm run test:logic` must run fully offline, with no React Native runtime,
// no native modules, and no network access (see tests/expo-token.test.ts for
// the one deliberately network-dependent integration test, which is excluded
// from this suite). Business-logic modules under lib/ only touch
// react-native / AsyncStorage for Platform.OS checks and local caching, so we
// alias both to lightweight in-memory mocks rather than let Vite try to parse
// react-native's Flow-syntax entry point, which it cannot do outside Metro.
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "react-native": path.resolve(__dirname, "tests/mocks/react-native.ts"),
      "@react-native-async-storage/async-storage": path.resolve(__dirname, "tests/mocks/async-storage.ts"),
      "expo-sqlite": path.resolve(__dirname, "tests/mocks/expo-sqlite.ts"),
      "expo-notifications": path.resolve(__dirname, "tests/mocks/expo-notifications.ts"),
    },
  },
});
