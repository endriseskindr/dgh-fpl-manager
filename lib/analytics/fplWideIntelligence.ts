import { fpl } from "../fplClient";
import type { FplPick, StandingsRow } from "../types";

export type RankLadderPoint = { targetRank: number; sampledRank: number; points: number; entryId: number };
export type ManagerSnapshot = {
  entryId: number; rank: number; totalPoints: number; eventPoints: number; teamName: string; managerName: string;
  picks: FplPick[]; xiIds: number[]; captainId: number | null; formation: string; activeChip: string | null;
};
export type CohortAnalytics = {
  sampleSize: number; fetchedManagers: number; stale: boolean;
  ownership: Record<number, number>; captaincy: Record<number, number>; formations: Record<string, number>;
  chips: Record<string, number>; cloneSignatures: { signature: string; count: number; mine: boolean }[];
  positionRatings: Record<string, { sampleAverage: number; mine: number; delta: number }>;
  clubContribution: Record<number, { samplePoints: number; minePoints: number; delta: number }>;
  popularTransfers: { playerId: number; transfers: number; adoptionPct: number }[];
};

const TARGET_RANKS = [1, 100, 1000, 5000, 10000, 50000, 100000, 300000, 1000000];
const PAGE_SIZE = 50;
const signature = (ids: number[]) => [...ids].sort((a,b)=>a-b).join("-");

export async function fetchRankPointsLadder(force = false): Promise<RankLadderPoint[]> {
  const out: RankLadderPoint[] = [];
  for (const target of TARGET_RANKS) {
    const page = Math.max(1, Math.ceil(target / PAGE_SIZE));
    const result = await fpl.overallStandingsPage(page, force);
    const rows = result.data.standings?.results ?? [];
    const row = rows.find(r => r.rank >= target) ?? rows[rows.length - 1];
    if (row) out.push({ targetRank: target, sampledRank: row.rank, points: row.total, entryId: row.entry });
  }
  return out;
}

export async function fetchTop10kStandings(force = false): Promise<StandingsRow[]> {
  // Overall league is 314. 10,000 managers = 200 pages of 50.
  return (await fpl.standings(314, force, 200)).data.filter(r => r.rank <= 10000);
}

export async function fetchManagerSnapshots(rows: StandingsRow[], force = false, onProgress?: (done: number, total: number) => void): Promise<ManagerSnapshot[]> {
  const out: ManagerSnapshot[] = [];
  const bootstrap = await fpl.bootstrap(force);
  const typeById = new Map(bootstrap.data.element_types.map(t => [t.id, t.singular_name_short]));
  for (let i=0; i<rows.length; i++) {
    const r = rows[i];
    try {
      const picks = await fpl.picks(r.entry, bootstrap.data.events.find(e=>e.is_current)?.id ?? bootstrap.data.events.find(e=>e.is_next)?.id ?? 1, force);
      const xi = picks.data.picks.filter(p=>p.position <= 11);
      const counts: Record<string, number> = {};
      for (const p of xi) { const type = typeById.get(bootstrap.data.elements.find(e=>e.id===p.element)?.element_type ?? 0) ?? "UNK"; counts[type]=(counts[type]??0)+1; }
      out.push({ entryId:r.entry, rank:r.rank, totalPoints:r.total, eventPoints:r.event_total, teamName:r.entry_name, managerName:r.player_name, picks:picks.data.picks, xiIds:xi.map(p=>p.element), captainId:xi.find(p=>p.is_captain)?.element ?? null, formation:`${counts.GKP??0}-${counts.DEF??0}-${counts.MID??0}-${counts.FWD??0}`, activeChip:picks.data.active_chip });
    } catch { /* private/inaccessible managers are skipped, never fabricated */ }
    onProgress?.(i+1, rows.length);
  }
  return out;
}

export function computeCohortAnalytics(snapshots: ManagerSnapshot[], myXiIds: number[], playerTeamById: Record<number, number>): CohortAnalytics {
  const n = Math.max(1, snapshots.length);
  const ownership: Record<number,number> = {}; const captaincy: Record<number,number> = {}; const formations: Record<string,number> = {}; const chips: Record<string,number> = {};
  const clones = new Map<string,number>(); const mineSig = signature(myXiIds);
  const clubPts: Record<number,{sum:number;count:number}> = {};
  for (const s of snapshots) {
    for (const id of s.xiIds) ownership[id]=(ownership[id]??0)+1;
    if (s.captainId) captaincy[s.captainId]=(captaincy[s.captainId]??0)+1;
    formations[s.formation]=(formations[s.formation]??0)+1;
    if (s.activeChip) chips[s.activeChip]=(chips[s.activeChip]??0)+1;
    const sig=signature(s.xiIds); clones.set(sig,(clones.get(sig)??0)+1);
    for (const id of s.xiIds) { const club=playerTeamById[id]; if (club!=null) { clubPts[club] ??= {sum:0,count:0}; clubPts[club].sum += s.eventPoints; clubPts[club].count++; } }
  }
  const cloneSignatures=[...clones.entries()].map(([sig,count])=>({signature:sig,count,mine:sig===mineSig})).sort((a,b)=>b.count-a.count);
  return { sampleSize:snapshots.length, fetchedManagers:snapshots.length, stale:false, ownership, captaincy, formations, chips, cloneSignatures, positionRatings:{}, clubContribution:Object.fromEntries(Object.entries(clubPts).map(([club,v])=>[club,{samplePoints:v.sum/Math.max(1,v.count),minePoints:0,delta:0}])), popularTransfers:[] };
}

export function buildPositionRatings(myXi: { playerId:number; position:string }[], snapshots: ManagerSnapshot[], playersById: Record<number,{element_type:number}>, typeNames: Record<number,string>) {
  const mine: Record<string,number> = {}; const sample: Record<string,number[]> = {};
  const typeFor=(id:number)=>typeNames[playersById[id]?.element_type]??"UNK";
  for(const p of myXi) mine[p.position]=(mine[p.position]??0)+1;
  for(const s of snapshots){ const c:Record<string,number>={}; for(const id of s.xiIds){const t=typeFor(id);c[t]=(c[t]??0)+1;} for(const [t,v] of Object.entries(c))(sample[t]??=[]).push(v); }
  const out:Record<string,{sampleAverage:number;mine:number;delta:number}>={}; for(const [t,arr] of Object.entries(sample)){const avg=arr.reduce((a,b)=>a+b,0)/arr.length;out[t]={sampleAverage:avg,mine:mine[t]??0,delta:(mine[t]??0)-avg};} return out;
}

export function buildWeeklyAwardsTaxonomy(input: { gw:number; rank:number; gwPoints:number; previousRank:number; transfers:number; captainPoints:number; chip?:string|null; bestGainer?:number; worstGainer?:number; }) {
  const climb=input.previousRank>input.rank?input.previousRank-input.rank:0;
  return {
    "Top Gun": input.gwPoints >= 100,
    "Tough Week": input.gwPoints < 50,
    "Comeback Kid": climb >= 10000,
    "Rank Crasher": climb >= 50000,
    "Chip Master": Boolean(input.chip) && input.gwPoints >= 75,
    "No-Chip Warrior": !input.chip && input.gwPoints >= 75,
    "Value King": input.gwPoints >= 70,
    "Captain Fantastic": input.captainPoints >= 20,
    "Wildcard Wasteland": input.chip === "wildcard" && input.gwPoints < 55,
    "YOLO Manager": input.transfers >= 4,
    "Sharpest Trader": input.transfers > 0 && input.gwPoints >= 70,
    "Transfer Tangle": input.transfers >= 3 && input.gwPoints < 55,
    "Hit Hero": input.transfers >= 2 && input.gwPoints >= 80,
    "Painful Hit": input.transfers >= 1 && input.gwPoints < 45,
    "One-Move Master": input.transfers === 1 && input.gwPoints >= 80,
  };
}

export function whyThisHappened(params: { rankDelta:number; captainDelta:number; differentialDelta:number; templateDelta:number; }) {
  const gains:string[]=[]; const losses:string[]=[];
  if(params.captainDelta>0) gains.push(`Captaincy contributed +${params.captainDelta.toFixed(1)} points of swing`); else if(params.captainDelta<0) losses.push(`Captaincy cost ${Math.abs(params.captainDelta).toFixed(1)} points of swing`);
  if(params.differentialDelta>0) gains.push(`Differentials contributed +${params.differentialDelta.toFixed(1)}`); else if(params.differentialDelta<0) losses.push(`Differentials cost ${Math.abs(params.differentialDelta).toFixed(1)}`);
  if(params.templateDelta>0) gains.push(`Template protection added +${params.templateDelta.toFixed(1)}`); else if(params.templateDelta<0) losses.push(`Template exposure cost ${Math.abs(params.templateDelta).toFixed(1)}`);
  return { headline: params.rankDelta>0 ? `Rank improved by ${params.rankDelta.toLocaleString()}` : params.rankDelta<0 ? `Rank fell by ${Math.abs(params.rankDelta).toLocaleString()}` : "Rank was broadly unchanged", gains, losses };
}

export function classifyCallouts(players: {name:string; points:number; projected:number; ownership:number}[]) {
  const sorted=[...players].sort((a,b)=>b.points-a.points); const star=sorted[0]; const flop=sorted[sorted.length-1]; const killer=[...players].sort((a,b)=>((b.points-b.projected)*(100-b.ownership))-((a.points-a.projected)*(100-a.ownership)))[0];
  return { star:star?star.name:null, flop:flop?flop.name:null, killer:killer?killer.name:null };
}

export async function fetchPopularTransfers(snapshots: ManagerSnapshot[], playerNames: Record<number,string>, gameweek:number, force = false, onProgress?: (done:number,total:number)=>void) {
  const counts: Record<number,number> = {};
  let done=0;
  for(const s of snapshots){
    try { const r=await fpl.transfers(s.entryId,force); const gw=r.data.filter(t=>t.event===gameweek); const seen=new Set<number>(); for(const t of gw){if(!seen.has(t.element_in)){seen.add(t.element_in);counts[t.element_in]=(counts[t.element_in]??0)+1;}} } catch {}
    onProgress?.(++done,snapshots.length);
  }
  return Object.entries(counts).map(([id,n])=>({playerId:Number(id),playerName:playerNames[Number(id)]??`#${id}`,transfers:n,adoptionPct:n/Math.max(1,snapshots.length)*100})).sort((a,b)=>b.transfers-a.transfers);
}

export function buildCloneReport(snapshots: ManagerSnapshot[], myXiIds: number[]) {
  const mine=signature(myXiIds); const same=snapshots.filter(s=>signature(s.xiIds)===mine); const overlap=snapshots.map(s=>({entryId:s.entryId,rank:s.rank,overlap:s.xiIds.filter(id=>myXiIds.includes(id)).length})).sort((a,b)=>b.overlap-a.overlap);
  return { exactCloneCount:same.length, exactClonePct:same.length/Math.max(1,snapshots.length)*100, highestOverlap:overlap[0]?.overlap??0, overlapDistribution:Object.fromEntries(Array.from({length:12},(_,i)=>[i,snapshots.filter(s=>s.xiIds.filter(id=>myXiIds.includes(id)).length===i).length])) };
}

export function buildClubContribution(params:{snapshots:ManagerSnapshot[]; playerClubById:Record<number,number>; livePointsByPlayer:Record<number,number>; myXiIds:number[]}) {
  const clubs=new Set<number>(Object.values(params.playerClubById)); const out:Record<number,{sampleAverage:number;minePoints:number;delta:number}>={};
  for(const club of clubs){
    const sample:number[]=[]; for(const s of params.snapshots){let pts=0; for(const id of s.xiIds) if(params.playerClubById[id]===club) pts+=params.livePointsByPlayer[id]??0; sample.push(pts);} const avg=sample.length?sample.reduce((a,b)=>a+b,0)/sample.length:0; const mine=params.myXiIds.filter(id=>params.playerClubById[id]===club).reduce((a,id)=>a+(params.livePointsByPlayer[id]??0),0); out[club]={sampleAverage:avg,minePoints:mine,delta:mine-avg};
  } return out;
}
