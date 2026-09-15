import { fpl } from "./fplClient";
import { saveWeeklyRows, type WeeklyAward } from "./seasonStore";

async function mapLimit<T,R>(items:T[], limit:number, worker:(x:T)=>Promise<R>):Promise<R[]> { const out=new Array<R>(items.length); let i=0; async function run(){ while(true){ const n=i++; if(n>=items.length)return; out[n]=await worker(items[n]); } } await Promise.all(Array.from({length:Math.min(limit,Math.max(1,items.length))},run)); return out; }

export async function backfillWeeklyAwards(rivals:{entryId:number;managerName:string;teamName:string}[], maxEvent=38) {
  const results=await mapLimit(rivals,4,async r=>{ try { const h=(await fpl.history(r.entryId,false)).data; return h.current.filter(x=>x.event<=maxEvent).map(x=>({event:x.event,entryId:r.entryId,managerName:r.managerName,teamName:r.teamName,gwPoints:x.points,totalPoints:x.total_points,rank:x.overall_rank} satisfies WeeklyAward)); } catch { return []; } });
  const rows=results.flat(); await saveWeeklyRows(rows); return rows;
}


// Unified DGH ledger backfill. Weekly awards and DGH scoring share the same official FPL history ingestion path.
import { syncDghLedger, type LedgerManager } from "./dghLedgerService";

export async function backfillDghLedger(managers: LedgerManager[], maxEvent: number, forceRefresh = false) {
  return syncDghLedger(managers, maxEvent, forceRefresh);
}
