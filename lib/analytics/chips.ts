import type { FplEvent } from "../types";

export type ChipName = "wildcard" | "freehit" | "bboost" | "3xc";
export type ChipStatus = { name: ChipName; label: string; available: boolean; usedEvent: number | null; half: 1 | 2 };

export const CHIP_LABELS: Record<ChipName,string> = { wildcard:"Wildcard", freehit:"Free Hit", bboost:"Bench Boost", "3xc":"Triple Captain" };

export function currentHalf(event: number): 1 | 2 { return event <= 19 ? 1 : 2; }

export function getChipStatuses(chips: { name: string; event: number }[], event: number): ChipStatus[] {
  const half = currentHalf(event);
  return (Object.keys(CHIP_LABELS) as ChipName[]).map(name => {
    const used = chips.filter(c => c.name === name && currentHalf(c.event) === half).sort((a,b)=>b.event-a.event)[0];
    return { name, label: CHIP_LABELS[name], available: !used, usedEvent: used?.event ?? null, half };
  });
}

export function upcomingEvents(events: FplEvent[], current: number, horizon = 8) {
  return events.filter(e => e.id >= current && e.id <= Math.min(38, current + horizon));
}
