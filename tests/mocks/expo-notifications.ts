// Minimal offline stand-in for expo-notifications used ONLY by the Vitest
// unit-test environment (see vitest.config.ts). The real package transitively
// loads Expo's native runtime (expo/src/winter/runtime.ts), which references
// Metro-only globals like __DEV__ and cannot run in plain Node — same reason
// expo-sqlite is mocked here (see tests/mocks/expo-sqlite.ts). lib/dataService.ts
// imports lib/notifications.ts (deadline/price alerts) purely for best-effort,
// try/caught side effects; pure logic tests never need real OS scheduling.

export const AndroidImportance = { HIGH: 4, DEFAULT: 3 };
export const SchedulableTriggerInputTypes = { DATE: "date" };

export function setNotificationHandler(_config: unknown) {}

export async function setNotificationChannelAsync(_channelId: string, _config: unknown) {}

export async function getPermissionsAsync() {
  return { status: "granted" as const };
}

export async function requestPermissionsAsync() {
  return { status: "granted" as const };
}

export async function getAllScheduledNotificationsAsync(): Promise<
  { identifier: string; content: { data?: Record<string, unknown> } }[]
> {
  return [];
}

export async function cancelScheduledNotificationAsync(_identifier: string) {}

export async function scheduleNotificationAsync(_request: unknown): Promise<string> {
  return "mock-notification-id";
}

export default {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  setNotificationHandler,
  setNotificationChannelAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  getAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  scheduleNotificationAsync,
};
