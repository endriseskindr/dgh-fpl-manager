import * as Notifications from "expo-notifications";
import type { SquadPick } from "./types";

const DEADLINE_PREFIX = "dgh-deadline";
const STRATEGY_PREFIX = "dgh-strategy";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

export async function initializeNotifications(): Promise<boolean> {
  try {
    if (Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync("dgh-critical", { name: "DGH Critical", importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250], sound: "default" });
      await Notifications.setNotificationChannelAsync("dgh-strategy", { name: "DGH Strategy", importance: Notifications.AndroidImportance.DEFAULT, sound: "default" });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === "granted";
  } catch { return false; }
}

export async function cancelDghNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter(n => String(n.content.data?.dghType ?? "").startsWith("deadline") || String(n.content.data?.dghType ?? "").startsWith("strategy")).map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export async function scheduleDeadlineAlerts(deadlineISO: string, gameweek: number, strategy?: string, captain?: SquadPick | null) {
  const granted = await initializeNotifications();
  if (!granted) return;
  await cancelDghNotifications();
  const deadline = new Date(deadlineISO).getTime();
  const schedule = async (offsetMs: number, title: string, body: string) => {
    const date = new Date(deadline - offsetMs);
    if (date.getTime() <= Date.now() + 10_000) return;
    await Notifications.scheduleNotificationAsync({ content: { title, body, sound: "default", data: { dghType: `deadline-${gameweek}` } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date } });
  };
  await schedule(2 * 60 * 60 * 1000, `GW${gameweek} deadline in 2 hours`, strategy ? `DGH strategy: ${strategy}. Open the War Room and execute only after the final live-data check.` : "Open DGH and complete your final squad, transfer and captain check.");
  await schedule(30 * 60 * 1000, `GW${gameweek} deadline in 30 minutes`, captain?.player ? `Final captain check: ${captain.player.webName}. Verify injuries, XI and transfers now.` : "Final DGH check: transfers, XI and captain.");
}

export async function notifyRivalTransfer(managerName: string, transferCount: number, event: number) {
  const granted = await initializeNotifications();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({ content: { title: `Rival move: ${managerName}`, body: `${transferCount} new FPL transfer${transferCount === 1 ? "" : "s"} detected in GW${event}. Review the Rival War Room.`, sound: "default", data: { dghType: `rival-transfer-${event}` } }, trigger: null });
}

export async function notifyPriceAlert(playerName: string, signal: string) {
  const granted = await initializeNotifications();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({ content: { title: `DGH price signal: ${playerName}`, body: signal, sound: "default", data: { dghType: "price-alert" } }, trigger: null });
}
