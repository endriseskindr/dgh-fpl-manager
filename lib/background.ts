import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { fpl } from "./fplClient";
import { notifyRivalTransfer } from "./notifications";
import { getSeenTransferKey, setSeenTransferKey } from "./seasonStore";
import { LEAGUE_ID, MY_ENTRY_ID } from "./config";

export const DGH_BACKGROUND_TASK = "dgh-fpl-background-intelligence";

TaskManager.defineTask(DGH_BACKGROUND_TASK, async () => {
  try {
    const bootstrap = (await fpl.bootstrap(true)).data;
    const event = bootstrap.events.find(e => e.is_current) ?? bootstrap.events.find(e => e.is_next);
    if (!event) return BackgroundTask.BackgroundTaskResult.Success;
    const standings = (await fpl.standings(LEAGUE_ID, false)).data;
    const ids = standings.filter(r => r.entry !== MY_ENTRY_ID).map(r => r.entry);
    for (const entryId of ids) {
      try {
        const transfers = (await fpl.transfers(entryId, true)).data.filter(t => t.event === event.id).sort((a,b)=>a.time.localeCompare(b.time));
        if (!transfers.length) continue;
        const key = transfers.map(t => `${t.time}:${t.element_out}:${t.element_in}`).join("|");
        const previous = await getSeenTransferKey(entryId);
        if (previous && previous !== key) {
          await notifyRivalTransfer(`Rival ${entryId}`, Math.max(1, key.split("|").length - previous.split("|").length), event.id);
        }
        await setSeenTransferKey(entryId, key);
      } catch { /* one rival failing must not fail the task */ }
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerDghBackgroundTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(DGH_BACKGROUND_TASK))) await BackgroundTask.registerTaskAsync(DGH_BACKGROUND_TASK, { minimumInterval: 15 });
    return true;
  } catch { return false; }
}
