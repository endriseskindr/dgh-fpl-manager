// Minimal offline stand-in for expo-sqlite used ONLY by the Vitest unit-test
// environment (see vitest.config.ts). The real package transitively loads
// Expo's native runtime (expo/src/winter/runtime.ts), which references
// Metro-only globals like __DEV__ and cannot run in plain Node. lib/seasonStore.ts
// uses it purely for local on-device persistence, which pure logic tests
// (transfer economics, projections, ranking math, etc.) never need to exercise.
type Row = Record<string, unknown>;

class MockStatement {
  async executeAsync(..._args: unknown[]) {
    return { getFirstAsync: async () => null, getAllAsync: async (): Promise<Row[]> => [] };
  }
}

class MockDatabase {
  async execAsync(_sql: string) {}
  async runAsync(_sql: string, ..._params: unknown[]) {
    return { changes: 0, lastInsertRowId: 0 };
  }
  async getAllAsync<T = Row>(_sql: string, ..._params: unknown[]): Promise<T[]> {
    return [];
  }
  async getFirstAsync<T = Row>(_sql: string, ..._params: unknown[]): Promise<T | null> {
    return null;
  }
  async prepareAsync(_sql: string) {
    return new MockStatement();
  }
  async withTransactionAsync(fn: () => Promise<void>) {
    await fn();
  }
  async closeAsync() {}
}

export async function openDatabaseAsync(_name: string): Promise<MockDatabase> {
  return new MockDatabase();
}

export function openDatabaseSync(_name: string): MockDatabase {
  return new MockDatabase();
}

export default { openDatabaseAsync, openDatabaseSync };
