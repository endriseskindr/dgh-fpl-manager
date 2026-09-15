// Minimal, offline-safe stand-in for the 'react-native' package used ONLY by
// the Vitest unit-test environment (see vitest.config.ts). react-native's
// real entry point uses Flow syntax and touches native module registries,
// neither of which are meaningful or parseable in a plain Node test run.
// Pure business-logic modules (lib/dataService.ts etc.) only need Platform.OS
// and a couple of no-op APIs transitively — nothing here should ever be
// exercised by actual assertions.
export const Platform = {
  OS: "ios",
  select: <T,>(spec: Record<string, T>): T | undefined => spec.ios ?? spec.default,
};

export const NativeModules = {};

export default { Platform, NativeModules };
