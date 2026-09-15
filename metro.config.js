const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker loads its wasm binary via a static import
// (./wa-sqlite/wa-sqlite.wasm). Metro's default asset extensions don't
// include "wasm", so without this it tries to resolve the binary as a JS
// source module and the web bundle fails. Register it as an asset (and make
// sure it isn't also treated as a source extension) so web export/bundling
// of any screen that pulls in lib/seasonStore.ts (expo-sqlite) succeeds.
config.resolver.assetExts = [...config.resolver.assetExts, "wasm"];
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== "wasm");

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
