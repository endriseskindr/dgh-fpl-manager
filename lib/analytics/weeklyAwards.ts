export type WeeklyAwardRow = { event: number; entryId: number; managerName: string; teamName: string; gwPoints: number; totalPoints: number; rank: number };
export function awardWinners(rows: WeeklyAwardRow[]) {
  const byEvent = new Map<number, WeeklyAwardRow[]>();
  for (const row of rows) byEvent.set(row.event, [...(byEvent.get(row.event) ?? []), row]);
  return [...byEvent.entries()].sort((a,b)=>a[0]-b[0]).map(([event, list]) => ({ event, winner: [...list].sort((a,b)=>b.gwPoints-a.gwPoints)[0], podium: [...list].sort((a,b)=>b.gwPoints-a.gwPoints).slice(0,3) }));
}
