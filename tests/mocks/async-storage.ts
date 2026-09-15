// Minimal, offline in-memory stand-in for @react-native-async-storage/async-storage
// used ONLY by the Vitest unit-test environment (see vitest.config.ts). The
// real package's implementation transitively imports 'react-native', which
// cannot be parsed or executed outside Metro/Babel. lib/dataService.ts uses
// AsyncStorage purely for local caching, which pure logic tests don't exercise.
const store = new Map<string, string>();

export default {
  getItem: async (key: string) => store.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: async (key: string) => {
    store.delete(key);
  },
  clear: async () => {
    store.clear();
  },
  getAllKeys: async () => Array.from(store.keys()),
  multiGet: async (keys: string[]) => keys.map((k) => [k, store.get(k) ?? null] as [string, string | null]),
};
